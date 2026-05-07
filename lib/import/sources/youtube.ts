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

  // Playlist URLs are fanned out into per-track tasks by `startImport`
  // before they ever reach this function; we only see single-video URLs
  // here, so no playlist handling is needed at this layer.
  let info: PipedYtAudio | InvidiousAudio | YtVideoInfo | null = null;

  // Tier 1: Piped (server handles BotGuard / PO tokens).
  if (piped) {
    try {
      info = await getPipedAudio(opts.url, piped);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (opts.isCancelled()) throw new Error('cancelled');

  // Tier 2: Invidious — different infrastructure, often healthy when Piped isn't.
  if (!info) {
    try {
      info = await getInvidiousAudio(opts.url);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (opts.isCancelled()) throw new Error('cancelled');

  // Tier 3: direct Innertube — last resort, mostly broken by PO tokens.
  if (!info) {
    try {
      info = await getYtAudio(opts.url);
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
