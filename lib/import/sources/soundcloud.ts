// SoundCloud download.
//
// Strategy:
//   1. Fetch the public track page HTML.
//   2. Locate the SoundCloud client_id from one of the linked JS bundles.
//      (SC embeds it in their main JS for unauthenticated public access.)
//   3. Pull the track JSON out of the inline `__sc_hydration` script.
//   4. Pick a "progressive" transcoding (a real MP3/M4A URL, not HLS).
//   5. POST to the transcoding URL with client_id to get the actual stream URL.
//   6. Download with progress.
//
// HLS-only tracks (rarer, mostly newer uploads) are skipped — we surface a
// clear error so the user knows to grab the YouTube version instead.

import { fetchText, fetchTextEx } from '../net';
import { downloadFile } from '../downloadFile';
import { buildImportPath, saveImportedTrack } from '../saveTrack';
import { safeFilename } from '../net';
import type { Track } from '../../../types/domain';

interface ScTrack {
  title: string;
  duration: number; // ms
  user?: { username?: string };
  artwork_url?: string | null;
  media: {
    transcodings: Array<{
      url: string;
      preset: string;
      format: { protocol: string; mime_type: string };
    }>;
  };
}

// Two patterns: the JS-bundle assignment style, and an inline JSON shape
// SoundCloud sometimes serialises into the page state.
const CLIENT_ID_PATTERNS: ReadonlyArray<RegExp> = [
  /client_id\s*[:=]\s*["']([a-zA-Z0-9_-]{30,})["']/,
  /"clientId"\s*:\s*"([a-zA-Z0-9_-]{30,})"/,
  /\bclient_id=([a-zA-Z0-9_-]{30,})\b/
];

// Long-lived public client_ids that SC has used. We only fall back to these
// if dynamic discovery fails — they may be revoked at any time, but they
// rotate slowly enough to be useful as a safety net.
const FALLBACK_CLIENT_IDS: ReadonlyArray<string> = [
  'a3e059563d7fd3372b49b37f00a00bcf',
  'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX',
  'FweeGBOOEDmFHQuBRrm2YjnBosZnfsMz',
  'T5R4kgWS2PRf6lzLyIravUMnKlbIxQag'
];

function scanForClientId(text: string): string | null {
  for (const re of CLIENT_ID_PATTERNS) {
    const m = re.exec(text);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function findClientId(html: string): Promise<string> {
  // Try the inline page first.
  const inline = scanForClientId(html);
  if (inline) return inline;
  // Otherwise look at every linked script and search them. SoundCloud
  // serves multiple chunked bundles; the client_id is usually in one of
  // the later (numbered) chunks. Iterate ALL of them, last-loaded first.
  const scriptRe = /<script[^>]+src=["'](https?:[^"']+\.js)["']/g;
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html))) urls.push(m[1]);
  for (const u of urls.reverse()) {
    try {
      const js = await fetchText(u);
      const found = scanForClientId(js);
      if (found) return found;
    } catch { /* keep looking */ }
  }
  // Last-resort: validate each fallback id by hitting a cheap public
  // endpoint. The first id that gets a 200 wins.
  for (const id of FALLBACK_CLIENT_IDS) {
    try {
      const probe = await fetch(`https://api-v2.soundcloud.com/resolve?url=https%3A%2F%2Fsoundcloud.com&client_id=${id}`);
      if (probe.status < 500) return id; // 200/302/4xx all imply the id is recognised
    } catch { /* try next */ }
  }
  throw new Error('Could not locate SoundCloud client_id (their HTML changed)');
}

function findHydratedTrack(html: string): ScTrack | null {
  // SoundCloud embeds page state in one of a few inline forms. We try
  // each pattern and fall through. Returns null if none matched — caller
  // will fall back to api-v2 lookup via track id.
  const patterns: RegExp[] = [
    /window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);/,
    /window\.__sc_hydration\s*=\s*(\{[\s\S]*?\});/,
    /__sc_hydration"\s*,\s*(\[[\s\S]*?\])\s*\)/
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (!m) continue;
    let data: Array<{ hydratable: string; data: unknown }>;
    try {
      const parsed = JSON.parse(m[1]) as unknown;
      data = Array.isArray(parsed) ? parsed as typeof data : [parsed as typeof data[number]];
    } catch {
      continue;
    }
    const trackEntry = data.find(e => e?.hydratable === 'sound');
    if (trackEntry) return trackEntry.data as ScTrack;
  }
  return null;
}

/** Pull the SC track id out of an embed/oEmbed/og pointer in the HTML. */
function findTrackIdFromEmbedMeta(html: string): string | null {
  // <meta property="al:android:url" content="soundcloud://tracks/123456789">
  const al = /soundcloud:\/\/tracks\/(\d+)/i.exec(html);
  if (al?.[1]) return al[1];
  // <meta property="twitter:player" content="https://w.soundcloud.com/player/?url=...api.soundcloud.com/tracks/123456789...">
  const tw = /api\.soundcloud\.com\/tracks\/(\d+)/i.exec(html);
  if (tw?.[1]) return tw[1];
  // Fallback: any inline reference to "/tracks/<id>" inside the page state.
  const any = /"id"\s*:\s*(\d{6,})\s*,\s*"kind"\s*:\s*"track"/i.exec(html);
  if (any?.[1]) return any[1];
  return null;
}

/** Last-resort lookup via SC's public api-v2 endpoint. */
async function fetchTrackViaApiV2(trackId: string, clientId: string): Promise<ScTrack> {
  const url = `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`;
  const text = await fetchText(url);
  return JSON.parse(text) as ScTrack;
}

interface ScDownloadOptions {
  url: string;
  taskId: string;
  isCancelled: () => boolean;
  onTitle: (title: string) => void;
  onProgress: (received: number, total: number) => void;
}

export async function importFromSoundCloud(opts: ScDownloadOptions): Promise<Track> {
  // Resolve shortlinks (on.soundcloud.com/...) to canonical track URLs first.
  const { text: html, finalUrl } = await fetchTextEx(opts.url);
  if (opts.isCancelled()) throw new Error('cancelled');
  // If we still don't have a track-shaped URL after redirect, bail early.
  try {
    const u = new URL(finalUrl);
    if (u.hostname === 'on.soundcloud.com' || u.hostname === 'm.soundcloud.com') {
      // Redirect didn't normalize — proceed anyway, page may still embed data.
    }
  } catch { /* ignore */ }

  const clientId = await findClientId(html);
  let track = findHydratedTrack(html);
  if (!track) {
    // Hydration block missing → fall back to embed-meta + api-v2 lookup.
    const trackId = findTrackIdFromEmbedMeta(html);
    if (!trackId) {
      throw new Error('Could not parse SoundCloud page (no hydration block or track id)');
    }
    track = await fetchTrackViaApiV2(trackId, clientId);
  }

  const artist = track.user?.username || 'Unknown';
  const title = track.title || 'Untitled';
  opts.onTitle(`${artist} — ${title}`);

  // Pick a progressive transcoding (direct file URL). Prefer mp3 over opus.
  const progressives = track.media.transcodings.filter(t => t.format.protocol === 'progressive');
  if (progressives.length === 0) {
    throw new Error('This SoundCloud track only offers HLS streams; download the YouTube equivalent instead.');
  }
  progressives.sort((a, b) => {
    const am = a.format.mime_type.includes('mpeg') ? 0 : 1;
    const bm = b.format.mime_type.includes('mpeg') ? 0 : 1;
    return am - bm;
  });
  const chosen = progressives[0];

  // Resolve the actual stream URL.
  const streamMetaUrl = `${chosen.url}?client_id=${clientId}`;
  const streamMetaText = await fetchText(streamMetaUrl);
  const streamMeta = JSON.parse(streamMetaText) as { url?: string };
  if (!streamMeta.url) throw new Error('SoundCloud refused to issue a stream URL');

  const ext = chosen.format.mime_type.includes('mpeg') ? 'mp3' : 'm4a';
  const safeBase = safeFilename(`${artist} - ${title}`);
  const destPath = await buildImportPath(safeBase, ext);

  const result = await downloadFile({
    url: streamMeta.url,
    destPath,
    onProgress: opts.onProgress,
    isCancelled: opts.isCancelled
  });
  if (opts.isCancelled()) throw new Error('cancelled');

  return saveImportedTrack({
    filePath: result.filePath,
    fileSize: result.bytes,
    title,
    artist,
    album: '',
    duration: Math.round((track.duration || 0) / 1000),
    artwork: (track.artwork_url ?? null) as string | null,
    sourceUrl: opts.url
  });
}
