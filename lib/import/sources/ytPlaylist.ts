// Resolve a YouTube / YT Music *playlist* URL to its first track.
//
// Why: when the user pastes `?list=PL...` (no `v=` param), the per-video
// extractors (Piped / Invidious / Innertube) all bail with
//   "Could not parse a YouTube video id from that URL"
// because there's no video id in the URL. The desktop app sidesteps this
// by handing the URL to `yt-dlp`, which natively understands playlists
// and falls back to the first entry under `--no-playlist`.
//
// To match that behaviour on mobile we hit the playlist endpoints exposed
// by Piped (`/playlists/{id}`) and Invidious (`/api/v1/playlists/{id}`),
// take the first stream/video, and rewrite the URL to that track's
// `?v=...` form. Importing the *whole* playlist is a v1.x feature; for
// now we keep parity with desktop and import the first track.
//
// Both endpoints accept the raw playlist id (no URL encoding needed for
// `PL...`, `OLAK5uy_...`, `RD...`, etc.). We deliberately do NOT support
// `LL` (the user's "Liked songs") because that requires authentication.

import {
  getPipedInstances, pipedJson,
  PIPED_MAX_INSTANCES_PER_REQUEST
} from './piped';
import {
  getInvidiousInstances, invJson,
  INVIDIOUS_MAX_INSTANCES_PER_REQUEST
} from './invidious';

export interface PlaylistFirstVideo {
  videoId: string;
  title: string;
  author: string;
  /** Best-effort: name of the playlist itself, surfaced to the UI. */
  playlistTitle?: string;
}

// Playlist ids on YouTube vary in shape:
//   PL... (32 hex)            — user-curated playlists
//   OLAK5uy_... (33 chars)    — auto-generated YT Music album playlists
//   RD..., RDMM..., RDAMVM... — radios / mixes / personalised stations
//   VL...                     — sometimes used by the web client as a wrapper
//   FL...                     — favourites (deprecated)
//   UU..., UULF..., UULP...   — channel uploads
// We accept anything in `[A-Za-z0-9_-]{16,64}` to keep up with new shapes.
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Return the `list=` query parameter from any YT URL form, or null. */
export function extractPlaylistId(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  // Accept www/m/music YouTube hosts plus youtu.be (rare for playlists).
  const host = u.hostname.toLowerCase();
  const isYt =
    host === 'youtube.com' || host === 'www.youtube.com' ||
    host === 'm.youtube.com' || host === 'music.youtube.com' ||
    host === 'youtu.be';
  if (!isYt) return null;
  const list = (u.searchParams.get('list') ?? '').trim();
  if (!list) return null;
  // Strip any `VL` wrapper prefix the web client occasionally emits.
  const cleaned = list.startsWith('VL') ? list.slice(2) : list;
  if (!PLAYLIST_ID_RE.test(cleaned)) return null;
  return cleaned;
}

/** Pull the 11-char video id from any URL form Piped / Invidious might
 *  return (full URL, `/watch?v=...` path, or bare id). */
function extractVideoIdFromAnyUrl(raw: string): string | null {
  if (!raw) return null;
  const m11 = /^[A-Za-z0-9_-]{11}$/;
  if (m11.test(raw)) return raw;
  // Path-only form e.g. "/watch?v=ID" → parse with a base.
  let absolute = raw;
  if (raw.startsWith('/')) absolute = `https://www.youtube.com${raw}`;
  try {
    const u = new URL(absolute);
    const v = u.searchParams.get('v');
    if (v && m11.test(v)) return v;
    const segs = u.pathname.split('/').filter(Boolean);
    const last = segs[segs.length - 1] ?? '';
    if (m11.test(last)) return last;
  } catch { /* ignore */ }
  // `videoId=...` query form (some Invidious responses use this on item urls).
  const q = /[?&]videoId=([A-Za-z0-9_-]{11})/.exec(raw);
  if (q) return q[1];
  return null;
}

/** True when the URL has `list=...` and no `v=...`. Such URLs cannot be
 *  passed to a per-video extractor without first being expanded. */
export function isPlaylistOnlyUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (!extractPlaylistId(url)) return false;
  const v = u.searchParams.get('v');
  return !v || v.length !== 11;
}

// ─── Piped resolver ──────────────────────────────────────────────────

interface PipedRelatedStream {
  url?: string;
  title?: string;
  uploaderName?: string;
  duration?: number;
  type?: 'stream' | 'channel' | 'playlist';
}

interface PipedPlaylistResponse {
  name?: string;
  uploader?: string;
  videos?: number;
  relatedStreams?: PipedRelatedStream[];
  error?: string;
  message?: string;
}

async function resolveViaPiped(
  playlistId: string,
  pipedInstance: string,
  errors: string[]
): Promise<PlaylistFirstVideo | null> {
  const list = (await getPipedInstances(pipedInstance)).slice(0, PIPED_MAX_INSTANCES_PER_REQUEST);
  for (const base of list) {
    try {
      const data = await pipedJson<PipedPlaylistResponse>(base, `/playlists/${encodeURIComponent(playlistId)}`);
      if (data.error) throw new Error(data.message ?? data.error);
      const first = (data.relatedStreams ?? []).find(s =>
        (s.type ?? 'stream') === 'stream' && s.url
      );
      if (!first?.url) {
        throw new Error('playlist is empty or contains no streamable items');
      }
      const videoId = extractVideoIdFromAnyUrl(first.url);
      if (!videoId) throw new Error(`could not parse first track url: ${first.url}`);
      return {
        videoId,
        title: first.title ?? videoId,
        author: first.uploaderName ?? data.uploader ?? '',
        playlistTitle: data.name
      };
    } catch (err) {
      const host = (() => { try { return new URL(base).host; } catch { return base; } })();
      errors.push(`piped ${host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return null;
}

// ─── Invidious resolver ─────────────────────────────────────────────

interface InvidiousPlaylistVideo {
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
}

interface InvidiousPlaylistResponse {
  title?: string;
  author?: string;
  videoCount?: number;
  videos?: InvidiousPlaylistVideo[];
  error?: string;
}

async function resolveViaInvidious(
  playlistId: string,
  errors: string[]
): Promise<PlaylistFirstVideo | null> {
  const list = (await getInvidiousInstances()).slice(0, INVIDIOUS_MAX_INSTANCES_PER_REQUEST);
  for (const base of list) {
    try {
      const data = await invJson<InvidiousPlaylistResponse>(base, `/api/v1/playlists/${encodeURIComponent(playlistId)}`);
      if (data.error) throw new Error(data.error);
      const first = (data.videos ?? []).find(v => v.videoId);
      if (!first?.videoId) {
        throw new Error('playlist is empty or contains no videos');
      }
      return {
        videoId: first.videoId,
        title: first.title ?? first.videoId,
        author: first.author ?? data.author ?? '',
        playlistTitle: data.title
      };
    } catch (err) {
      const host = (() => { try { return new URL(base).host; } catch { return base; } })();
      errors.push(`invidious ${host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return null;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Given a YT / YT Music playlist URL (`?list=...`), return the first
 * track's video id and metadata. Throws a descriptive error if neither
 * Piped nor Invidious can resolve it.
 */
export async function resolvePlaylistFirstVideo(
  url: string,
  pipedInstance: string
): Promise<PlaylistFirstVideo> {
  const playlistId = extractPlaylistId(url);
  if (!playlistId) {
    throw new Error('No playlist id in URL (expected `?list=...`)');
  }

  const errors: string[] = [];

  // Tier 1: Piped (matches the per-video pipeline order).
  if (pipedInstance) {
    const piped = await resolveViaPiped(playlistId, pipedInstance, errors);
    if (piped) return piped;
  }

  // Tier 2: Invidious.
  const inv = await resolveViaInvidious(playlistId, errors);
  if (inv) return inv;

  throw new Error(
    `Could not resolve playlist "${playlistId}" via any backend.\n` +
    errors.join('\n')
  );
}
