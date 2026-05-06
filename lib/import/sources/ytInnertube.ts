// Innertube-based YouTube audio extractor.
//
// Why not ytdl-core? ytdl-core (and the unmaintained react-native-ytdl
// fork) parse YouTube's web player JS to undo the signature obfuscation
// applied to streaming URLs. This breaks every time Google rotates the
// player JS — signature ciphers are a moving target.
//
// Mobile and embedded clients return *ungciphered* URLs because Google's
// own mobile apps don't run JS. We POST to youtubei/v1/player with each
// client's headers and use whichever first returns playable formats.
// This is the same trick used by every modern YT downloader (NewPipe,
// LibreTube, youtubei.js).
//
// Pure fetch + JSON. No Node polyfills. No bundled binaries.

// Innertube clients. The api keys are the public ones baked into Google's
// own apps — they are not secrets, they identify the client tier.
interface ClientSpec {
  name: string;
  apiKey: string;
  userAgent: string;
  /** Body sent under `context`. */
  context: Record<string, unknown>;
}

const CLIENTS: ClientSpec[] = [
  // ANDROID_VR (Meta Quest YouTube app). Google keeps this partner client
  // exempt from PO-token / BotGuard so Quest headsets can play video. As
  // of mid-2025 it's the only mobile client that consistently works.
  {
    name: 'ANDROID_VR',
    apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    context: {
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.60.19',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        androidSdkVersion: 32,
        osName: 'Android',
        osVersion: '12L',
        platform: 'MOBILE',
        hl: 'en',
        gl: 'US',
        utcOffsetMinutes: 0
      }
    }
  },
  // TVHTML5_SIMPLY_EMBEDDED_PLAYER — secondary fallback. Used by cast-to-
  // TV flow on smart TVs. PO-token-exempt for now.
  {
    name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    apiKey: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
    context: {
      client: {
        clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        clientVersion: '2.0',
        platform: 'TV',
        clientScreen: 'EMBED',
        hl: 'en',
        gl: 'US',
        utcOffsetMinutes: 0
      },
      thirdParty: { embedUrl: 'https://www.youtube.com/' }
    }
  }
];

interface PlayerFormat {
  itag: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  audioBitrate?: number;
  contentLength?: string;
  signatureCipher?: string;
  cipher?: string;
  audioQuality?: string;
}

interface InnertubePlayerResponse {
  playabilityStatus: { status: string; reason?: string };
  videoDetails?: {
    videoId: string;
    title: string;
    author: string;
    lengthSeconds: string;
    thumbnail?: { thumbnails: Array<{ url: string; width: number; height: number }> };
  };
  streamingData?: {
    adaptiveFormats?: PlayerFormat[];
    formats?: PlayerFormat[];
  };
}

export interface YtVideoInfo {
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

/** Pull the 11-character video id out of any YouTube URL we recognise. */
export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    const v = u.searchParams.get('v');
    if (v) return v;
    // /embed/<id>, /shorts/<id>, /v/<id>
    const segs = u.pathname.split('/').filter(Boolean);
    const candidates = ['embed', 'shorts', 'v', 'live'];
    const i = segs.findIndex(s => candidates.includes(s));
    if (i >= 0 && segs[i + 1]) return segs[i + 1];
  } catch { /* fall through */ }
  // Sometimes the user pastes just the id.
  if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

async function callInnertube(
  videoId: string,
  client: ClientSpec
): Promise<InnertubePlayerResponse> {
  const url = `https://www.youtube.com/youtubei/v1/player?key=${client.apiKey}&prettyPrint=false`;
  const clientVersion = (client.context.client as { clientVersion: string }).clientVersion;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': client.userAgent,
      'X-YouTube-Client-Name': clientNameNumeric(client.name),
      'X-YouTube-Client-Version': clientVersion,
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'https://www.youtube.com'
    },
    body: JSON.stringify({
      videoId,
      // Innertube expects { context: { client: {...}, [thirdParty: {...}] } }.
      context: client.context,
      racyCheckOk: true,
      contentCheckOk: true
    })
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw new Error(`YT ${client.name} HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  return res.json() as Promise<InnertubePlayerResponse>;
}

function clientNameNumeric(name: string): string {
  // Documented client-name numerics. Used as a request header.
  switch (name) {
    case 'WEB':                             return '1';
    case 'MWEB':                            return '2';
    case 'ANDROID':                         return '3';
    case 'IOS':                             return '5';
    case 'TVHTML5':                         return '7';
    case 'TVHTML5_SIMPLY_EMBEDDED_PLAYER':  return '85';
    case 'ANDROID_VR':                      return '28';
    case 'WEB_EMBEDDED_PLAYER':             return '56';
    default:                                return '1';
  }
}

/** Resolve a YouTube URL to a directly-downloadable audio stream. */
export async function getYtAudio(url: string): Promise<YtVideoInfo> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('Could not parse a YouTube video id from that URL');

  const errors: string[] = [];
  for (const client of CLIENTS) {
    try {
      const data = await callInnertube(videoId, client);
      const status = data.playabilityStatus.status;
      if (status !== 'OK') {
        errors.push(`[${client.name}] ${data.playabilityStatus.reason ?? status}`);
        continue;
      }
      const formats = [
        ...(data.streamingData?.adaptiveFormats ?? []),
        ...(data.streamingData?.formats ?? [])
      ];
      // Audio-only, ungciphered (mobile/TV clients shouldn't return ciphered).
      const audio = formats.filter(f =>
        (f.mimeType?.startsWith('audio/') ?? false) &&
        f.url && !f.signatureCipher && !f.cipher
      );
      if (audio.length === 0) {
        errors.push(`[${client.name}] no audio-only streams in response`);
        continue;
      }
      audio.sort((a, b) => (b.bitrate ?? b.audioBitrate ?? 0) - (a.bitrate ?? a.audioBitrate ?? 0));
      const best = audio[0];

      const v = data.videoDetails;
      if (!v || !best.url) throw new Error('Malformed YT response');

      const mime = (best.mimeType ?? 'audio/mp4').split(';')[0];
      const ext = mime.includes('webm') ? 'webm' : mime.includes('mp3') ? 'mp3' : 'm4a';

      return {
        videoId,
        title: v.title,
        author: v.author,
        duration: Number(v.lengthSeconds),
        artwork: pickThumb(v.thumbnail?.thumbnails),
        streamUrl: best.url,
        mime,
        ext,
        contentLength: best.contentLength ? Number(best.contentLength) : undefined
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${client.name}] ${msg}`);
    }
  }
  // Final fallback: scrape the watch page HTML and parse
  // `ytInitialPlayerResponse`. Useful when Innertube is hostile but the
  // rendered page still embeds the player response JSON.
  for (const variant of ['m', 'www'] as const) {
    try {
      const result = await extractFromWatchPage(videoId, variant);
      if (typeof result === 'string') {
        errors.push(`[watch-html ${variant}] ${result}`);
      } else if (result) {
        return result;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[watch-html ${variant}] ${msg}`);
    }
  }

  throw new Error(`All YouTube clients failed:\n${errors.join('\n')}`);
}

/** Returns YtVideoInfo on success, a string reason on soft-failure, null if no audio. */
async function extractFromWatchPage(
  videoId: string,
  variant: 'm' | 'www'
): Promise<YtVideoInfo | string | null> {
  const url = variant === 'm'
    ? `https://m.youtube.com/watch?v=${videoId}&has_verified=1&bpctr=9999999999`
    : `https://www.youtube.com/watch?v=${videoId}&has_verified=1&bpctr=9999999999`;
  const userAgent = variant === 'm'
    ? 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
  const res = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  if (!res.ok) return `HTTP ${res.status}`;
  const html = await res.text();
  // Try multiple terminators; YT splits the assignment differently across
  // its template variants. Each pattern captures the JSON object body.
  const patterns: RegExp[] = [
    /var ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;\s*(?:var |<\/script|window\.)/,
    /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;\s*ytInitialData\s*=/,
    /"playerResponse":\s*(\{[\s\S]+?\})\s*,\s*"response":/
  ];
  let payload: string | null = null;
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) { payload = m[1]; break; }
  }
  if (!payload) return 'ytInitialPlayerResponse not found in HTML';
  let data: InnertubePlayerResponse;
  try { data = JSON.parse(payload) as InnertubePlayerResponse; }
  catch (e) { return `JSON parse failed: ${(e as Error).message}`; }
  if (data.playabilityStatus?.status && data.playabilityStatus.status !== 'OK') {
    return data.playabilityStatus.reason ?? data.playabilityStatus.status;
  }
  const formats = [
    ...(data.streamingData?.adaptiveFormats ?? []),
    ...(data.streamingData?.formats ?? [])
  ];
  const audio = formats.filter(f =>
    (f.mimeType?.startsWith('audio/') ?? false) &&
    f.url && !f.signatureCipher && !f.cipher
  );
  if (audio.length === 0) {
    const ciphered = formats.some(f => f.signatureCipher || f.cipher);
    return ciphered
      ? 'all formats are signature-ciphered (need decipher; not implemented)'
      : 'no audio formats in streamingData';
  }
  audio.sort((a, b) => (b.bitrate ?? b.audioBitrate ?? 0) - (a.bitrate ?? a.audioBitrate ?? 0));
  const best = audio[0];
  const v = data.videoDetails;
  if (!v || !best.url) return 'malformed response';
  const mime = (best.mimeType ?? 'audio/mp4').split(';')[0];
  const ext = mime.includes('webm') ? 'webm' : mime.includes('mp3') ? 'mp3' : 'm4a';
  return {
    videoId,
    title: v.title,
    author: v.author,
    duration: Number(v.lengthSeconds),
    artwork: pickThumb(v.thumbnail?.thumbnails),
    streamUrl: best.url,
    mime,
    ext,
    contentLength: best.contentLength ? Number(best.contentLength) : undefined
  };
}

function pickThumb(thumbs?: Array<{ url: string; width: number; height: number }>): string | null {
  if (!thumbs || thumbs.length === 0) return null;
  return [...thumbs].sort((a, b) => b.width - a.width)[0]?.url ?? null;
}
