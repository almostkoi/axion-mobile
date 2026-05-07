// YouTube + YT Music download.
//
// Strategy as of 2025:
//   1. Piped (configured instance + live directory + static fallback).
//   2. Invidious (live directory + static fallback). Different infra,
//      so when Piped is down/rate-limited Invidious often still works.
//   3. Direct Innertube extraction. Expected to fail for most videos
//      in 2025 due to PO-token enforcement, but kept as a last resort
//      (works for some embeddable / age-unrestricted videos).

import { downloadFile } from '../downloadFile';
import { buildImportPath, saveImportedTrack } from '../saveTrack';
import { safeFilename } from '../net';
import { getYtAudio, type YtVideoInfo } from './ytInnertube';
import { getPipedAudio, type PipedYtAudio } from './piped';
import { getInvidiousAudio, type InvidiousAudio } from './invidious';
import { isPlaylistOnlyUrl, resolvePlaylistFirstVideo } from './ytPlaylist';
import { useStore } from '../../../store/useStore';
import type { Track } from '../../../types/domain';

export interface YtDownloadOptions {
  url: string;
  taskId: string;
  /** Polled to short-circuit. */
  isCancelled: () => boolean;
  /** Title patch as soon as it's known. */
  onTitle: (title: string) => void;
  onProgress: (received: number, total: number) => void;
}

export async function importFromYouTube(opts: YtDownloadOptions): Promise<Track> {
  const piped = useStore.getState().settings.pipedInstance?.trim() ?? '';
  const errors: string[] = [];

  // 0. Playlist URLs (`?list=PL...` with no `v=...`) need to be expanded
  //    to a single track first; per-video extractors below cannot parse
  //    them. This mirrors the desktop's `--no-playlist` behaviour: import
  //    the first track of the playlist. Full-playlist support is a
  //    future feature.
  let resolveUrl = opts.url;
  if (isPlaylistOnlyUrl(resolveUrl)) {
    try {
      const first = await resolvePlaylistFirstVideo(resolveUrl, piped);
      const playlistLabel = first.playlistTitle
        ? `from playlist "${first.playlistTitle}"`
        : 'from playlist';
      opts.onTitle(`${first.author ? first.author + ' \u2014 ' : ''}${first.title} (${playlistLabel})`);
      resolveUrl = `https://www.youtube.com/watch?v=${first.videoId}`;
    } catch (err) {
      throw new Error(
        `That looks like a playlist URL, but no first track could be resolved.\n\n` +
        (err instanceof Error ? err.message : String(err)) +
        `\n\nTip: paste a single-track URL (one with \`?v=...\`) instead, ` +
        `or set a working Piped instance in Settings \u2192 YouTube proxy.`
      );
    }
  }
  if (opts.isCancelled()) throw new Error('cancelled');

  let info: PipedYtAudio | InvidiousAudio | YtVideoInfo | null = null;

  // Tier 1: Piped (server handles BotGuard / PO tokens).
  if (piped) {
    try {
      info = await getPipedAudio(resolveUrl, piped);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (opts.isCancelled()) throw new Error('cancelled');

  // Tier 2: Invidious — different infrastructure, often healthy when Piped isn't.
  if (!info) {
    try {
      info = await getInvidiousAudio(resolveUrl);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (opts.isCancelled()) throw new Error('cancelled');

  // Tier 3: direct Innertube — last resort, mostly broken by PO tokens.
  if (!info) {
    try {
      info = await getYtAudio(resolveUrl);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (opts.isCancelled()) throw new Error('cancelled');

  if (!info) {
    throw new Error(
      `${errors.join('\n\n')}\n\n` +
      `All YouTube proxies failed. Public Piped/Invidious instances are ` +
      `often rate-limited or down. Consider self-hosting a Piped backend ` +
      `and pointing Settings → YouTube proxy at it.`
    );
  }

  opts.onTitle(`${info.author} \u2014 ${info.title}`);

  const safeBase = safeFilename(`${info.author} - ${info.title}`);
  const destPath = await buildImportPath(safeBase, info.ext);

  const result = await downloadFile({
    url: info.streamUrl,
    destPath,
    onProgress: opts.onProgress,
    isCancelled: opts.isCancelled
  });
  if (opts.isCancelled()) throw new Error('cancelled');

  return saveImportedTrack({
    filePath: result.filePath,
    fileSize: result.bytes,
    title: info.title,
    artist: info.author,
    album: '',
    duration: info.duration,
    artwork: info.artwork,
    sourceUrl: opts.url
  });
}
