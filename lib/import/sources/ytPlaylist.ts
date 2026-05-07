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

export interface PlaylistVideo {
  videoId: string;
  title: string;
  author: string;
}

export interface PlaylistListing {
  /** Best-effort display name of the playlist itself. */
  playlistTitle: string | null;
  videos: PlaylistVideo[];
  /** True when we hit a pagination cap and the real playlist may be longer. */
  truncated: boolean;
}

// Upper bound on how many tracks we'll expand from a single playlist.
// YT-Music playlists can balloon into thousands of items (e.g. "Top 5000
// songs of all time"); the UI would become unusable and the user almost
// certainly didn't mean to queue 2000 downloads. Users who genuinely want
// longer playlists can bump this or do multiple pastes.
const PLAYLIST_HARD_CAP = 500;
// Piped paginates at ~20-100/page. Guard against runaway loops.
const MAX_PAGINATION_ROUNDS = 30;

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
  /** Opaque token Piped returns when there are more pages. */
  nextpage?: string | null;
  error?: string;
  message?: string;
}

interface PipedNextPageResponse {
  relatedStreams?: PipedRelatedStream[];
  nextpage?: string | null;
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

// ─── Full-playlist resolvers (all tracks) ────────────────────────────

function streamsToVideos(streams: PipedRelatedStream[]): PlaylistVideo[] {
  const out: PlaylistVideo[] = [];
  for (const s of streams) {
    if ((s.type ?? 'stream') !== 'stream') continue;
    if (!s.url) continue;
    const videoId = extractVideoIdFromAnyUrl(s.url);
    if (!videoId) continue;
    out.push({
      videoId,
      title: s.title ?? videoId,
      author: s.uploaderName ?? ''
    });
  }
  return out;
}

function dedupe(videos: PlaylistVideo[]): PlaylistVideo[] {
  const seen = new Set<string>();
  const out: PlaylistVideo[] = [];
  for (const v of videos) {
    if (seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    out.push(v);
  }
  return out;
}

async function listAllViaPiped(
  playlistId: string,
  pipedInstance: string,
  errors: string[]
): Promise<PlaylistListing | null> {
  // Piped's pagination tokens are bound to the *base URL* that produced
  // them (the instance signs them), so once we pick an instance we must
  // stick with it for all `/nextpage` calls. We try each candidate
  // instance in turn, fully paginating on whichever one yields the first
  // page successfully.
  const candidates = (await getPipedInstances(pipedInstance)).slice(0, PIPED_MAX_INSTANCES_PER_REQUEST);

  for (const base of candidates) {
    try {
      const first = await pipedJson<PipedPlaylistResponse>(
        base, `/playlists/${encodeURIComponent(playlistId)}`
      );
      if (first.error) throw new Error(first.message ?? first.error);

      const videos: PlaylistVideo[] = streamsToVideos(first.relatedStreams ?? []);
      let nextpage: string | null | undefined = first.nextpage;
      let truncated = false;
      let rounds = 0;

      while (nextpage && videos.length < PLAYLIST_HARD_CAP && rounds < MAX_PAGINATION_ROUNDS) {
        rounds += 1;
        try {
          const path =
            `/nextpage/playlists/${encodeURIComponent(playlistId)}` +
            `?nextpage=${encodeURIComponent(nextpage)}`;
          const page = await pipedJson<PipedNextPageResponse>(base, path);
          if (page.error) break;
          const chunk = streamsToVideos(page.relatedStreams ?? []);
          if (chunk.length === 0) break;
          videos.push(...chunk);
          nextpage = page.nextpage ?? null;
        } catch {
          // Stop paginating but keep what we already have rather than
          // throwing away a successful first page.
          break;
        }
      }

      if (nextpage && (videos.length >= PLAYLIST_HARD_CAP || rounds >= MAX_PAGINATION_ROUNDS)) {
        truncated = true;
      }

      const deduped = dedupe(videos).slice(0, PLAYLIST_HARD_CAP);
      if (deduped.length === 0) {
        throw new Error('playlist is empty or contained no streamable items');
      }
      return {
        playlistTitle: first.name ?? null,
        videos: deduped,
        truncated
      };
    } catch (err) {
      const host = (() => { try { return new URL(base).host; } catch { return base; } })();
      errors.push(`piped ${host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return null;
}

async function listAllViaInvidious(
  playlistId: string,
  errors: string[]
): Promise<PlaylistListing | null> {
  const candidates = (await getInvidiousInstances()).slice(0, INVIDIOUS_MAX_INSTANCES_PER_REQUEST);

  for (const base of candidates) {
    try {
      const videos: PlaylistVideo[] = [];
      let playlistTitle: string | null = null;
      let truncated = false;

      for (let page = 1; page <= MAX_PAGINATION_ROUNDS; page += 1) {
        const path =
          `/api/v1/playlists/${encodeURIComponent(playlistId)}` +
          `?page=${page}&page_size=200`;
        const data = await invJson<InvidiousPlaylistResponse>(base, path);
        if (data.error) throw new Error(data.error);
        if (playlistTitle == null) playlistTitle = data.title ?? null;

        const pageVideos = (data.videos ?? [])
          .filter(v => !!v.videoId)
          .map(v => ({
            videoId: v.videoId!,
            title: v.title ?? v.videoId!,
            author: v.author ?? ''
          }));

        if (pageVideos.length === 0) break;
        videos.push(...pageVideos);

        if (videos.length >= PLAYLIST_HARD_CAP) {
          truncated = true;
          break;
        }
        // Invidious omits nextpage indicators on the last page by returning
        // fewer items than requested. 200 = full page; anything less = done.
        if (pageVideos.length < 200) break;
      }

      const deduped = dedupe(videos).slice(0, PLAYLIST_HARD_CAP);
      if (deduped.length === 0) {
        throw new Error('playlist is empty or contained no videos');
      }
      return { playlistTitle, videos: deduped, truncated };
    } catch (err) {
      const host = (() => { try { return new URL(base).host; } catch { return base; } })();
      errors.push(`invidious ${host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return null;
}

/**
 * Given a YT / YT Music playlist URL, return every track (up to
 * PLAYLIST_HARD_CAP). Tries Piped (with pagination) first, then
 * Invidious. Throws if neither backend can resolve the playlist.
 */
export async function resolvePlaylistAllVideos(
  url: string,
  pipedInstance: string
): Promise<PlaylistListing> {
  const playlistId = extractPlaylistId(url);
  if (!playlistId) {
    throw new Error('No playlist id in URL (expected `?list=...`)');
  }

  const errors: string[] = [];
  if (pipedInstance) {
    const piped = await listAllViaPiped(playlistId, pipedInstance, errors);
    if (piped) return piped;
  }
  const inv = await listAllViaInvidious(playlistId, errors);
  if (inv) return inv;

  throw new Error(
    `Could not list tracks in playlist "${playlistId}" via any backend.\n` +
    errors.join('\n')
  );
}
