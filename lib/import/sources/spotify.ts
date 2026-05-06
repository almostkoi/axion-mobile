// Spotify URLs are metadata-only (DRM). We resolve title+artist from the
// page's JSON-LD, then hand off to the YouTube source via a YT search.

import { fetchText } from '../net';

export interface SpotifyMeta {
  title: string;
  artist: string;
}

/** Strip Spotify's session/share tracking params that cause 307 redirects. */
function cleanSpotifyUrl(input: string): string {
  try {
    const u = new URL(input);
    // Drop everything except the canonical track id from the path.
    for (const k of ['si', 'utm_source', 'utm_medium', 'utm_campaign', 'context', 'go', 'nd']) {
      u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return input;
  }
}

export async function resolveSpotify(url: string): Promise<SpotifyMeta> {
  const cleaned = cleanSpotifyUrl(url);
  const html = await fetchText(cleaned);

  // 1) JSON-LD first (most reliable when present).
  const ld = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (ld?.[1]) {
    try {
      const data = JSON.parse(ld[1]) as {
        name?: string;
        byArtist?: Array<{ name?: string }> | { name?: string }
      };
      const title = (data.name ?? '').trim();
      const artists = Array.isArray(data.byArtist)
        ? data.byArtist.map(a => a?.name ?? '').filter(Boolean)
        : data.byArtist?.name ? [data.byArtist.name] : [];
      if (title && artists.length > 0) {
        return finalise(title, artists.join(', '));
      }
    } catch { /* fall through */ }
  }

  // 2) og:title is "<Title> - song and lyrics by <Artists> | Spotify".
  const ogTitle = /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i.exec(html)?.[1] ?? '';
  const ogDesc = /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i.exec(html)?.[1] ?? '';
  const ogTitleParsed = parseOgTitle(ogTitle);
  if (ogTitleParsed) return finalise(ogTitleParsed.title, ogTitleParsed.artist);

  // 3) og:description "Listen to <Title> on Spotify · Song · <Artists> · 2024 · ..."
  const descParsed = parseOgDescription(ogTitle, ogDesc);
  if (descParsed) return finalise(descParsed.title, descParsed.artist);

  return finalise(stripTrailingDescriptors(ogTitle), '');
}

/** Keep title/artist sane: drop trailing "song and lyrics" cruft, dedup, trim. */
function finalise(rawTitle: string, rawArtist: string): SpotifyMeta {
  const title = stripTrailingDescriptors(rawTitle);
  let artist = rawArtist.trim();
  // If parsing accidentally returned the title in both fields, drop artist.
  if (artist && title && artist.toLowerCase() === title.toLowerCase()) artist = '';
  // If artist starts with "by " (HTML scrape artifact) strip it.
  artist = artist.replace(/^by\s+/i, '').trim();
  return { title, artist };
}

function stripTrailingDescriptors(s: string): string {
  return s
    .replace(/\s*\|\s*Spotify\s*$/i, '')
    .replace(/\s*-\s*song(?:\s+and\s+lyrics)?\s+by\s+.*$/i, '')
    .trim();
}

function parseOgTitle(ogTitle: string): SpotifyMeta | null {
  // Strict pattern only — "<Title> - song and lyrics by <Artists> | Spotify".
  // We deliberately do NOT fall back to a generic "X - Y" split because
  // many tracks legitimately contain " - " in their name (e.g. remasters).
  const cleaned = ogTitle.replace(/\s*\|\s*Spotify\s*$/i, '').trim();
  const m = /^(.+?)\s*-\s*song(?:\s+and\s+lyrics)?\s+by\s+(.+)$/i.exec(cleaned);
  if (m) return { title: m[1].trim(), artist: m[2].trim() };
  return null;
}

function parseOgDescription(ogTitle: string, ogDesc: string): SpotifyMeta | null {
  // "Listen to <Title> on Spotify · Song · <Artists> · 2024 · 3:42"
  const m = /Listen to\s+(.+?)\s+on Spotify\s*[\u00b7|]\s*Song\s*[\u00b7|]\s*([^\u00b7|]+)/i.exec(ogDesc);
  if (m) return { title: m[1].trim(), artist: m[2].trim() };
  // Last resort: split on bullets and take an artist-shaped segment that
  // isn't the title or a static word like "Song".
  const segs = ogDesc.split(/\s*[\u00b7|]\s*/).map(s => s.trim()).filter(Boolean);
  if (segs.length >= 2 && ogTitle) {
    const title = stripTrailingDescriptors(ogTitle);
    const artist = segs.find(s =>
      s.toLowerCase() !== 'song' &&
      s.toLowerCase() !== title.toLowerCase() &&
      !/^\d{4}$/.test(s) &&            // year
      !/^\d{1,2}:\d{2}$/.test(s)        // duration
    ) ?? '';
    if (artist) return { title, artist };
  }
  return null;
}
