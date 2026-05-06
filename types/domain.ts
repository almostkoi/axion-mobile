// Domain types for Axion Mobile.
//
// Mirrors `axion/src/types/index.ts` so the database schema and any future
// inter-app sync (e.g., LAN library import) stay compatible. Mobile-only
// fields and desktop-only fields are commented inline.

export type TrackId = string;
export type AlbumId = string;
export type ArtistId = string;
export type PlaylistId = string;

export interface Track {
  id: TrackId;
  /** content://, file:// or asset:// URI suitable for react-native-track-player. */
  uri: string;
  /** MediaStore _data path (Android) when known. */
  filePath: string | null;
  fileSize: number;
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  genre: string;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  duration: number;
  bitrate: number | null;
  sampleRate: number | null;
  artwork: string | null; // local file URI or content://
  dateAdded: number;
  playCount: number;
  lastPlayed: number | null;
  liked: 0 | 1;
}

export interface Album {
  id: AlbumId;
  name: string;
  artist: string;
  year: number | null;
  artwork: string | null;
  trackCount: number;
  duration: number;
}

export interface Artist {
  id: ArtistId;
  name: string;
  trackCount: number;
  albumCount: number;
  artwork: string | null;
}

export type PlaylistKind = 'user' | 'liked';

export interface Playlist {
  id: PlaylistId;
  name: string;
  description: string;
  artwork: string | null;
  kind: PlaylistKind;
  trackIds: TrackId[];
  dateCreated: number;
  dateModified: number;
}

export type RepeatMode = 'off' | 'all' | 'one';
export type AccentColor = 'red' | 'blue' | 'green' | 'purple' | 'orange';
export type Theme = 'dark' | 'light';

export interface Settings {
  accentColor: AccentColor;
  theme: Theme; // currently always 'dark' on mobile
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  /** Last successful media-library scan timestamp. */
  lastScannedAt: number | null;
  /** Optional user-restricted folders (relative to /storage/emulated/0/) — empty = scan everything. */
  restrictedFolders: string[];
  /** Base URL of a Piped API instance used for YouTube extraction.
   *  Pure client-side YT extraction is no longer reliable in 2025 due to
   *  PO-token enforcement; Piped acts as the authoritative resolver. */
  pipedInstance: string;
}

export interface ScanProgress {
  phase: 'idle' | 'scanning' | 'parsing' | 'writing' | 'error';
  current: number;
  total: number;
  currentFile: string | null;
  errorMessage?: string;
}

export interface SearchResult {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
}

export const SUPPORTED_EXTENSIONS = [
  '.mp3', '.flac', '.aac', '.m4a', '.ogg', '.wav', '.opus'
] as const;
