// YouTube search resolver.
//
// Strategy:
//   1. Piped /search (configured instance + live directory).
//   2. Invidious /api/v1/search (parallel public proxy).
//   3. Direct https://www.youtube.com/results scrape — fragile and often
//      blocked by Google in 2025 but kept as a last resort.

import { fetchText } from '../net';
import { searchPiped } from '../sources/piped';
import { searchInvidious } from '../sources/invidious';
import { useStore } from '../../../store/useStore';

const VIDEO_ID_RE = /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"/;
const VIDEO_TITLE_RE = /"videoRenderer":\{"videoId":"[a-zA-Z0-9_-]{11}"[^}]*?"title":\{"runs":\[\{"text":"([^"]+)"/;

export interface YtSearchHit {
  videoId: string;
  title: string;
  url: string;
}

/** Returns the first YouTube video result for the given query. */
export async function searchYouTube(query: string): Promise<YtSearchHit | null> {
  // Tier 1: Piped search.
  const piped = useStore.getState().settings.pipedInstance?.trim();
  if (piped) {
    try {
      const hit = await searchPiped(query, piped);
      if (hit) {
        return {
          videoId: hit.videoId,
          title: hit.title,
          url: `https://www.youtube.com/watch?v=${hit.videoId}`
        };
      }
    } catch { /* fall through */ }
  }
  // Tier 2: Invidious search.
  try {
    const hit = await searchInvidious(query);
    if (hit) {
      return {
        videoId: hit.videoId,
        title: hit.title,
        url: `https://www.youtube.com/watch?v=${hit.videoId}`
      };
    }
  } catch { /* fall through to scrape */ }
  // Tier 3: direct results-page scrape.
  try {
    const q = encodeURIComponent(query);
    const url = `https://www.youtube.com/results?search_query=${q}&sp=EgIQAQ%253D%253D`;
    const html = await fetchText(url);
    const idMatch = VIDEO_ID_RE.exec(html);
    if (!idMatch) return null;
    const videoId = idMatch[1];
    const titleMatch = VIDEO_TITLE_RE.exec(html);
    return {
      videoId,
      title: titleMatch?.[1] ? decodeYtTitle(titleMatch[1]) : query,
      url: `https://www.youtube.com/watch?v=${videoId}`
    };
  } catch {
    return null;
  }
}

function decodeYtTitle(s: string): string {
  // YouTube emits some \u00xx style escapes. Let JSON.parse handle them.
  try { return JSON.parse(`"${s}"`); } catch { return s; }
}
