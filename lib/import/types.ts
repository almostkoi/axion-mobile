// Mirrors the desktop's ImportSource / ImportTaskProgress shape so a future
// LAN-sync between desktop and mobile can serialize jobs verbatim.

export type ImportSource =
  | 'youtube'
  | 'youtubeMusic'
  | 'soundcloud'
  | 'spotify'
  | 'lastfm'
  | 'direct'
  | 'generic';

export interface ImportSourceInfo {
  source: ImportSource;
  url: string;
  title?: string;
  artist?: string;
  /** Search query to feed YT search when the source only provides metadata. */
  searchQuery?: string;
}

export type ImportTaskStatus =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'tagging'
  | 'done'
  | 'error'
  | 'cancelled';

export interface ImportTaskProgress {
  taskId: string;
  url: string;
  source: ImportSource;
  status: ImportTaskStatus;
  /** Human display title once known. */
  title: string | null;
  /** 0..1 download progress; -1 if indeterminate. */
  progress: number;
  /** Bytes received so far. */
  downloadedBytes: number;
  /** Total expected bytes when known. */
  totalBytes: number;
  /** Final relative file path (under documentDirectory) once finished. */
  filePath: string | null;
  /** Error message when status === 'error'. */
  errorMessage: string | null;
  /** Created timestamp (ms). Used for sorting in the UI. */
  createdAt: number;
}

export interface StartImportPayload {
  url: string;
  /** Preferred audio container; mobile may fall back to source's native one. */
  audioFormat?: 'm4a' | 'mp3' | 'opus' | 'auto';
  /** When true, refuse the task if device storage is suspiciously low. */
  enforceDiskCheck?: boolean;
}
