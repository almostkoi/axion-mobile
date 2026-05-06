import type { ImportSource } from './types';

const AUDIO_EXT = /\.(mp3|m4a|aac|opus|ogg|oga|wav|flac|webm)(\?|$)/i;

export function classifyUrl(raw: string): ImportSource {
  let u: URL;
  try { u = new URL(raw); } catch { return 'generic'; }
  const host = u.hostname.toLowerCase();
  if (host === 'music.youtube.com') return 'youtubeMusic';
  if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') return 'youtube';
  if (host.endsWith('soundcloud.com')) return 'soundcloud';
  if (host === 'open.spotify.com' || host.endsWith('.spotify.com')) return 'spotify';
  if (host === 'last.fm' || host === 'www.last.fm') return 'lastfm';
  if (AUDIO_EXT.test(u.pathname) || AUDIO_EXT.test(raw)) return 'direct';
  return 'generic';
}

/** Pretty label for UI badges. */
export function sourceLabel(s: ImportSource): string {
  switch (s) {
    case 'youtube':      return 'YouTube';
    case 'youtubeMusic': return 'YT Music';
    case 'soundcloud':   return 'SoundCloud';
    case 'spotify':      return 'Spotify';
    case 'lastfm':       return 'Last.fm';
    case 'direct':       return 'File';
    default:             return 'URL';
  }
}
