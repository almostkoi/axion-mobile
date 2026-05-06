// Tiny helpers for HTML scraping. Uses fetch (RN's native global) with a
// realistic UA so Spotify/Last.fm serve full HTML.

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const { text } = await fetchTextEx(url, init);
  return text;
}

/** Like fetchText but also returns the final URL after redirects. */
export async function fetchTextEx(
  url: string,
  init?: RequestInit,
  maxRedirects = 5
): Promise<{ text: string; finalUrl: string }> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i += 1) {
    const res = await fetch(current, {
      ...init,
      // RN normally follows redirects, but some redirect chains (Spotify
      // si=, SC shortlinks) only work when we drive the redirects ourselves
      // because the auto-follow strips Referer/User-Agent.
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        ...(init?.headers ?? {})
      }
    });
    // 30x → grab Location and continue.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') ?? res.headers.get('Location');
      if (!loc) throw new Error(`HTTP ${res.status} with no Location for ${current}`);
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${current}`);
    return { text: await res.text(), finalUrl: current };
  }
  throw new Error(`Too many redirects starting at ${url}`);
}

export function extractMeta(html: string, prop: string): string | null {
  const safe = prop.replace(/[^a-zA-Z0-9:_-]/g, '');
  const re1 = new RegExp(`<meta[^>]+property=["']${safe}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m1 = re1.exec(html);
  if (m1?.[1]) return decodeHtml(m1[1]);
  const re2 = new RegExp(`<meta[^>]+name=["']${safe}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m2 = re2.exec(html);
  return m2?.[1] ? decodeHtml(m2[1]) : null;
}

export function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/** Replace any character that's invalid in Android filenames. */
export function safeFilename(s: string, fallback = 'track'): string {
  const cleaned = s.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 200) || fallback;
}
