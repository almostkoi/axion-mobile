// Last.fm URLs are metadata-only. Resolve to an artist+title pair, then
// the orchestrator hands off to YouTube via search.

import { fetchText, extractMeta } from '../net';

export interface LastfmMeta {
  title: string;
  artist: string;
}

export async function resolveLastFm(url: string): Promise<LastfmMeta> {
  const html = await fetchText(url);
  const ogTitle = (extractMeta(html, 'og:title') ?? '').replace(/\s*\|\s*Last\.fm$/i, '').trim();
  const dash = ogTitle.split(/\s+[-\u2013\u2014]\s+/);
  if (dash.length >= 2) {
    return {
      artist: dash[0].trim(),
      title: dash.slice(1).join(' - ').trim()
    };
  }
  // Fallback to URL path: /music/<Artist>/_/<Track>
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length >= 4 && segs[0] === 'music') {
      return {
        artist: decodeURIComponent(segs[1]).replace(/\+/g, ' '),
        title: decodeURIComponent(segs[3]).replace(/\+/g, ' ')
      };
    }
  } catch { /* ignore */ }
  return { title: ogTitle, artist: '' };
}
