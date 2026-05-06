// Direct audio file URL — just download it as-is.

import { downloadFile } from '../downloadFile';
import { buildImportPath, saveImportedTrack } from '../saveTrack';
import { safeFilename } from '../net';
import type { Track } from '../../../types/domain';

interface DirectOptions {
  url: string;
  taskId: string;
  isCancelled: () => boolean;
  onTitle: (title: string) => void;
  onProgress: (received: number, total: number) => void;
}

export async function importFromDirect(opts: DirectOptions): Promise<Track> {
  // Derive a title from the URL's path.
  const u = new URL(opts.url);
  const pathParts = u.pathname.split('/').filter(Boolean);
  const filename = decodeURIComponent(pathParts[pathParts.length - 1] ?? 'track');
  const dot = filename.lastIndexOf('.');
  const baseName = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot + 1) : 'mp3';
  const title = baseName.replace(/[_+]/g, ' ').trim();
  opts.onTitle(title);

  const destPath = await buildImportPath(safeFilename(baseName), ext);
  const result = await downloadFile({
    url: opts.url,
    destPath,
    onProgress: opts.onProgress,
    isCancelled: opts.isCancelled
  });
  if (opts.isCancelled()) throw new Error('cancelled');

  return saveImportedTrack({
    filePath: result.filePath,
    fileSize: result.bytes,
    title,
    artist: 'Unknown',
    album: '',
    duration: 0,
    artwork: null,
    sourceUrl: opts.url
  });
}
