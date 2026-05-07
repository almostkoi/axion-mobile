// Piped API client.
//
// Piped (https://github.com/TeamPiped/Piped) is a privacy-respecting
// YouTube frontend that exposes a stable JSON API for video metadata and
// streams. Crucially, Piped's *backend* runs the BotGuard / PO-token
// dance, so the URLs it returns are directly downloadable by us with no
// extraction logic.
//
// We treat Piped as a thin proxy: hit /streams/<id> for downloads,
// /search for YT search. The instance is user-configurable (some go
// down or rate-limit; users may want to self-host).

import { extractVideoId } from './ytInnertube';

export interface PipedAudioStream {
  url: string;
  format: string;        // e.g. 'M4A', 'WEBMA_OPUS'
  quality: string;       // e.g. '128 kbps'
  mimeType: string;      // e.g. 'audio/mp4'
  codec: string;         // e.g. 'mp4a.40.2'
  bitrate: number;
  contentLength: number;
}

interface PipedStreamsResponse {
  title: string;
  uploader: string;
  duration: number;       // seconds
  thumbnailUrl?: string;
  audioStreams: PipedAudioStream[];
  videoStreams?: unknown[];
  livestream?: boolean;
  error?: string;         // present on error responses
  message?: string;
}

export interface PipedSearchItem {
  url: string;            // '/watch?v=<id>'
  title: string;
  uploaderName?: string;
  duration?: number;
  thumbnail?: string;
  type?: 'stream' | 'channel' | 'playlist';
}

interface PipedSearchResponse {
  items?: PipedSearchItem[];
  error?: string;
  message?: string;
}

export interface PipedYtAudio {
  videoId: string;
  title: string;
  author: string;
  duration: number;
  artwork: string | null;
  streamUrl: string;
  mime: string;
  ext: string;
  contentLength?: number;
}

function normaliseInstance(instance: string): string {
  let s = instance.trim();
  if (!s) throw new Error('Piped instance URL is empty (set it in Settings → YouTube proxy)');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, '');
}

// Hardcoded last-resort list. We only use this if the live directory
// fetch fails. Public Piped instances rotate often, so this list will
// always be stale — `fetchLiveInstances()` is the primary discovery path.
const STATIC_FALLBACK: ReadonlyArray<string> = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.privacydev.net',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.r4fo.com',
  'https://api.piped.yt',
  'https://pipedapi.smnz.de',
  'https://pipedapi.darkness.services'
];

// In-process cache so we only fetch the directory once per app session.
let cachedInstances: string[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface DirectoryEntry {
  api_url?: string;
  apiUrl?: string;
  up_to_date?: boolean;
  cdn?: boolean;
  registered?: number;
  last_checked?: number;
}

/**
 * Fetch the live Piped instance directory. Returns api_urls of healthy
 * instances. On any failure returns the static fallback list.
 */
async function fetchLiveInstances(): Promise<string[]> {
  const now = Date.now();
  if (cachedInstances && now - cachedAt < CACHE_TTL_MS) return cachedInstances;
  const directories = [
    'https://piped-instances.kavin.rocks/',
    'https://worker-piped-instances.kavin.rocks/'
  ];
  for (const dir of directories) {
    try {
      const res = await fetch(dir, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Axion/1.0 (mobile)' }
      });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) continue;
      const data = await res.json() as DirectoryEntry[];
      const urls = data
        .map(e => (e.api_url ?? e.apiUrl ?? '').trim())
        .filter(u => u.startsWith('https://'))
        // Prefer up-to-date entries; the directory still lists stale ones.
        .map(u => u.replace(/\/+$/, ''));
      if (urls.length > 0) {
        cachedInstances = urls;
        cachedAt = now;
        return urls;
      }
    } catch { /* try next directory */ }
  }
  // Directory is itself down. Use the static list but don't cache it
  // (so the next call retries the directory).
  return [...STATIC_FALLBACK];
}

export async function getPipedInstances(primary: string): Promise<string[]> {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string): void => {
    try {
      const v = normaliseInstance(raw);
      if (!seen.has(v)) { seen.add(v); ordered.push(v); }
    } catch { /* skip empty */ }
  };
  add(primary);
  const live = await fetchLiveInstances();
  for (const f of live) add(f);
  for (const f of STATIC_FALLBACK) add(f);
  return ordered;
}

// Cap rotation depth — directory often has 50+ instances and we'd rather
// fail fast than spin for a minute on a phone.
const MAX_INSTANCES_PER_REQUEST = 8;
// Per-instance timeout. Most live instances respond in <2s; dead ones hang.
const INSTANCE_TIMEOUT_MS = 6000;

// Hard cap shared with the resolver in `ytPlaylist.ts` — keep modest so a
// dead instance directory can't stall a phone for >1 minute.
export const PIPED_MAX_INSTANCES_PER_REQUEST = MAX_INSTANCES_PER_REQUEST;
export const PIPED_INSTANCE_TIMEOUT_MS = INSTANCE_TIMEOUT_MS;

/** Single-instance JSON GET that throws on HTTP errors / non-JSON bodies. */
export async function pipedJson<T>(base: string, path: string): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), INSTANCE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      headers: {
        'Accept': 'application/json',
        // Some instances 403 on missing UA. Send a benign one.
        'User-Agent': 'Axion/1.0 (mobile)'
      },
      signal: ctl.signal
    });
    const ct = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 120); } catch { /* ignore */ }
      throw new Error(`HTTP ${res.status}${detail ? ` ${detail}` : ''}`);
    }
    if (!ct.includes('json')) {
      throw new Error('non-JSON response (instance likely down or guarded)');
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch audio metadata + direct stream URL for a YouTube video via Piped. */
export async function getPipedAudio(url: string, instance: string): Promise<PipedYtAudio> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('Could not parse a YouTube video id from that URL');
  const errors: string[] = [];
  const list = (await getPipedInstances(instance)).slice(0, MAX_INSTANCES_PER_REQUEST);
  for (const base of list) {
    try {
      const data = await pipedJson<PipedStreamsResponse>(base, `/streams/${videoId}`);
      if (data.error) throw new Error(data.message ?? data.error);
      if (data.livestream) throw new Error('Live streams cannot be imported');
      if (!data.audioStreams || data.audioStreams.length === 0) {
        throw new Error('no audio streams');
      }
      const sorted = [...data.audioStreams].sort((a, b) => {
        const am4a = a.mimeType.includes('mp4') ? 0 : 1;
        const bm4a = b.mimeType.includes('mp4') ? 0 : 1;
        if (am4a !== bm4a) return am4a - bm4a;
        return b.bitrate - a.bitrate;
      });
      const best = sorted[0];
      const mime = best.mimeType.split(';')[0];
      const ext = mime.includes('webm') || mime.includes('opus') ? 'webm'
        : mime.includes('mpeg') ? 'mp3' : 'm4a';
      return {
        videoId,
        title: data.title,
        author: data.uploader,
        duration: data.duration,
        artwork: data.thumbnailUrl ?? null,
        streamUrl: best.url,
        mime,
        ext,
        contentLength: best.contentLength > 0 ? best.contentLength : undefined
      };
    } catch (err) {
      const host = new URL(base).host;
      errors.push(`${host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`All Piped instances failed:\n${errors.join('\n')}`);
}

/** Search YouTube via Piped — returns the first stream-type result. */
export async function searchPiped(
  query: string,
  instance: string
): Promise<{ videoId: string; title: string; author: string } | null> {
  const errors: string[] = [];
  const list = (await getPipedInstances(instance)).slice(0, MAX_INSTANCES_PER_REQUEST);
  for (const base of list) {
    try {
      const path = `/search?q=${encodeURIComponent(query)}&filter=music_songs`;
      const data = await pipedJson<PipedSearchResponse>(base, path);
      if (data.error) throw new Error(data.message ?? data.error);
      const first = (data.items ?? []).find(i =>
        (i.type ?? 'stream') === 'stream' && i.url?.includes('v=')
      );
      if (!first) return null;
      const m = /[?&]v=([a-zA-Z0-9_-]{11})/.exec(first.url);
      if (!m) return null;
      return { videoId: m[1], title: first.title, author: first.uploaderName ?? '' };
    } catch (err) {
      const host = new URL(base).host;
      errors.push(`${host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`All Piped instances failed for search:\n${errors.join('\n')}`);
}
