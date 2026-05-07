// Invidious API client.
//
// Invidious (https://invidious.io) is an alternative privacy-respecting
// YouTube proxy. We treat it as a parallel fallback to Piped: same shape,
// different infrastructure. When all Piped instances are down or rate-
// limited, Invidious often still works (and vice versa).
//
// API surface used:
//   GET /api/v1/videos/{id}      → adaptiveFormats / formatStreams
//   GET /api/v1/search?q=&type=video
//
// Instance directory: https://api.invidious.io/instances.json (sorted
// by health). We mirror Piped's pattern: cache the directory, rotate
// through up to N instances with a per-request timeout, fall back to
// a hardcoded list if the directory itself is unreachable.

import { extractVideoId } from './ytInnertube';

export interface InvidiousAudio {
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

interface InvidiousFormat {
  url: string;
  type: string;          // e.g. 'audio/mp4; codecs="mp4a.40.2"'
  bitrate?: string;      // string in this API (!)
  audioQuality?: string; // 'AUDIO_QUALITY_MEDIUM' etc.
  itag?: string;
  encoding?: string;
  clen?: string;         // content length, also a string
  container?: string;    // 'm4a', 'webm'
}

interface InvidiousVideoResponse {
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
  videoThumbnails?: Array<{ url: string; width: number; height: number }>;
  adaptiveFormats?: InvidiousFormat[];
  formatStreams?: InvidiousFormat[];
  liveNow?: boolean;
  error?: string;
}

interface InvidiousSearchItem {
  type: string;          // 'video' | 'channel' | 'playlist'
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
}

// Hardcoded last-resort list (active as of late 2025; rotates over time).
const STATIC_FALLBACK: ReadonlyArray<string> = [
  'https://invidious.nerdvpn.de',
  'https://inv.nadeko.net',
  'https://invidious.privacyredirect.com',
  'https://invidious.f5.si',
  'https://yewtu.be',
  'https://invidious.materialio.us',
  'https://iv.melmac.space',
  'https://invidious.einfachzocken.eu'
];

const MAX_INSTANCES_PER_REQUEST = 8;
const INSTANCE_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 30 * 60 * 1000;

let cachedInstances: string[] | null = null;
let cachedAt = 0;

interface DirectoryRow {
  api?: boolean;
  uri?: string;
  monitor?: { 'monitorId'?: number; '30dRatio'?: { 'ratio': string } } | null;
}

function normalise(u: string): string {
  let s = u.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, '');
}

/**
 * Fetch the live Invidious directory. The endpoint returns
 * `[ ["host", { api, uri, ... } ], ... ]`. We keep entries with `api: true`
 * (i.e. instances that expose the JSON API we need).
 */
async function fetchLiveInstances(): Promise<string[]> {
  const now = Date.now();
  if (cachedInstances && now - cachedAt < CACHE_TTL_MS) return cachedInstances;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), INSTANCE_TIMEOUT_MS);
    const res = await fetch('https://api.invidious.io/instances.json?sort_by=health', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Axion/1.0 (mobile)' },
      signal: ctl.signal
    });
    clearTimeout(timer);
    if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
      const data = await res.json() as Array<[string, DirectoryRow]>;
      const urls = data
        .filter(row => Array.isArray(row) && row[1]?.api === true && typeof row[1]?.uri === 'string')
        .map(row => normalise(row[1].uri!));
      if (urls.length > 0) {
        cachedInstances = urls;
        cachedAt = now;
        return urls;
      }
    }
  } catch { /* fall through to static */ }
  return [...STATIC_FALLBACK];
}

export async function getInvidiousInstances(): Promise<string[]> {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const live = await fetchLiveInstances();
  for (const u of [...live, ...STATIC_FALLBACK]) {
    const v = normalise(u);
    if (!seen.has(v)) { seen.add(v); ordered.push(v); }
  }
  return ordered;
}

// Hard caps shared with the playlist resolver. Keep them small so
// the resolver can't stall the phone for >1 minute when everything
// is rate-limited.
export const INVIDIOUS_MAX_INSTANCES_PER_REQUEST = MAX_INSTANCES_PER_REQUEST;
export const INVIDIOUS_INSTANCE_TIMEOUT_MS = INSTANCE_TIMEOUT_MS;

export async function invJson<T>(base: string, path: string): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), INSTANCE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Axion/1.0 (mobile)' },
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

function pickAudioFormat(formats: InvidiousFormat[]): InvidiousFormat | null {
  // Prefer audio-only adaptive formats; m4a (mp4a) decodes natively on
  // Android, so prefer that, then highest bitrate.
  const audio = formats.filter(f =>
    f.type?.startsWith('audio/') ||
    f.audioQuality !== undefined ||
    /^(140|141|139|251|250|249)$/.test(f.itag ?? '')
  );
  const sorted = [...audio].sort((a, b) => {
    const am = (a.type ?? '').includes('mp4') ? 0 : 1;
    const bm = (b.type ?? '').includes('mp4') ? 0 : 1;
    if (am !== bm) return am - bm;
    const ab = parseInt(a.bitrate ?? '0', 10);
    const bb = parseInt(b.bitrate ?? '0', 10);
    return bb - ab;
  });
  return sorted[0] ?? null;
}

/** Fetch audio metadata + direct stream URL for a YouTube video via Invidious. */
export async function getInvidiousAudio(url: string): Promise<InvidiousAudio> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('Could not parse a YouTube video id from that URL');
  const errors: string[] = [];
  const list = (await getInvidiousInstances()).slice(0, MAX_INSTANCES_PER_REQUEST);
  for (const base of list) {
    try {
      const data = await invJson<InvidiousVideoResponse>(base, `/api/v1/videos/${videoId}`);
      if (data.error) throw new Error(data.error);
      if (data.liveNow) throw new Error('Live streams cannot be imported');
      const formats = [...(data.adaptiveFormats ?? []), ...(data.formatStreams ?? [])];
      const best = pickAudioFormat(formats);
      if (!best?.url) throw new Error('no audio formats');
      const mime = (best.type ?? 'audio/mp4').split(';')[0];
      const ext = best.container === 'webm' || mime.includes('webm') ? 'webm'
        : mime.includes('mpeg') ? 'mp3' : 'm4a';
      const thumb = (data.videoThumbnails ?? [])
        .slice()
        .sort((a, b) => b.width - a.width)[0]?.url ?? null;
      const clen = best.clen ? parseInt(best.clen, 10) : undefined;
      return {
        videoId,
        title: data.title ?? videoId,
        author: data.author ?? '',
        duration: data.lengthSeconds ?? 0,
        artwork: thumb,
        streamUrl: best.url,
        mime,
        ext,
        contentLength: clen && clen > 0 ? clen : undefined
      };
    } catch (err) {
      const host = (() => { try { return new URL(base).host; } catch { return base; } })();
      errors.push(`${host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`All Invidious instances failed:\n${errors.join('\n')}`);
}

/** Search YouTube via Invidious — returns the first video result. */
export async function searchInvidious(
  query: string
): Promise<{ videoId: string; title: string; author: string } | null> {
  const errors: string[] = [];
  const list = (await getInvidiousInstances()).slice(0, MAX_INSTANCES_PER_REQUEST);
  for (const base of list) {
    try {
      const path = `/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
      const items = await invJson<InvidiousSearchItem[]>(base, path);
      const first = items.find(i => i.type === 'video' && i.videoId);
      if (!first) return null;
      return {
        videoId: first.videoId!,
        title: first.title ?? query,
        author: first.author ?? ''
      };
    } catch (err) {
      const host = (() => { try { return new URL(base).host; } catch { return base; } })();
      errors.push(`${host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`All Invidious instances failed for search:\n${errors.join('\n')}`);
}
