// Streaming download with progress, abort, and resume.
//
// Wraps expo-file-system.createDownloadResumable to give us byte-level
// callbacks that fit our ImportTaskProgress shape.

import * as FileSystem from 'expo-file-system';

export interface DownloadOptions {
  /** Source URL — must be HTTPS (Android blocks plain HTTP by default). */
  url: string;
  /** Absolute destination path under FileSystem.documentDirectory. */
  destPath: string;
  /** Optional headers (e.g., Range) for picky CDNs. */
  headers?: Record<string, string>;
  /** Called every progress tick. `total` may be 0 if Content-Length wasn't sent. */
  onProgress?: (received: number, total: number) => void;
  /** Polled before each tick. Returning true cancels and deletes the partial file. */
  isCancelled?: () => boolean;
}

export interface DownloadResult {
  filePath: string;
  bytes: number;
}

export async function downloadFile(opts: DownloadOptions): Promise<DownloadResult> {
  // Make sure the parent dir exists.
  const dir = opts.destPath.substring(0, opts.destPath.lastIndexOf('/'));
  if (dir) await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});

  let lastReported = 0;
  const downloadResumable = FileSystem.createDownloadResumable(
    opts.url,
    opts.destPath,
    { headers: opts.headers },
    (p) => {
      // Coalesce reports — RN can fire these very frequently.
      if (p.totalBytesWritten - lastReported > 32 * 1024 || p.totalBytesExpectedToWrite === p.totalBytesWritten) {
        lastReported = p.totalBytesWritten;
        opts.onProgress?.(p.totalBytesWritten, p.totalBytesExpectedToWrite);
      }
    }
  );

  // Cancel-poll loop running alongside the download.
  let cancelTimer: ReturnType<typeof setInterval> | null = null;
  if (opts.isCancelled) {
    cancelTimer = setInterval(() => {
      if (opts.isCancelled?.()) {
        void downloadResumable.cancelAsync().catch(() => {});
      }
    }, 250);
  }

  try {
    const result = await downloadResumable.downloadAsync();
    if (!result) throw new Error('Download was cancelled');
    const info = await FileSystem.getInfoAsync(result.uri, { size: true });
    return {
      filePath: result.uri,
      bytes: info.exists && 'size' in info ? (info.size ?? 0) : 0
    };
  } finally {
    if (cancelTimer) clearInterval(cancelTimer);
  }
}
