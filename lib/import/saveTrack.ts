// After a download finishes, register the file as a track in our SQLite
// library. Bypasses MediaLibrary entirely so imports are immediate and
// don't need the user to grant write permission to public Music/.

import * as FileSystem from 'expo-file-system';
import { upsertTracks } from '../db';
import type { Track } from '../../types/domain';

export interface SaveTrackInput {
  filePath: string;          // Absolute file:// path
  fileSize: number;
  title: string;
  artist: string;
  album?: string;
  duration: number;          // seconds
  artwork?: string | null;   // optional remote URL stored as-is for the row
  sourceUrl: string;         // for reference (not yet exposed in UI)
}

export async function saveImportedTrack(input: SaveTrackInput): Promise<Track> {
  // expo-file-system already returns file:// URIs, but let's normalize.
  const uri = input.filePath.startsWith('file://') ? input.filePath : `file://${input.filePath}`;

  const id = `imp_${hash(input.sourceUrl + ':' + input.filePath)}`;
  const now = Date.now();

  const track: Track = {
    id,
    uri,
    filePath: input.filePath,
    fileSize: input.fileSize,
    title: input.title,
    artist: input.artist,
    albumArtist: input.artist,
    album: input.album ?? '',
    genre: '',
    year: null,
    trackNumber: null,
    discNumber: null,
    duration: input.duration,
    bitrate: null,
    sampleRate: null,
    artwork: input.artwork ?? null,
    dateAdded: now,
    playCount: 0,
    lastPlayed: null,
    liked: 0
  };

  await upsertTracks([track]);
  return track;
}

/** Tiny non-crypto hash so we can derive stable IDs from a URL+path. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Build the standard import file path. Caller should append the extension. */
export async function buildImportPath(safeName: string, ext: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}imports/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  // De-duplicate against existing files: name (1).ext, (2), etc.
  const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
  let candidate = `${dir}${safeName}${cleanExt}`;
  let n = 1;
  while ((await FileSystem.getInfoAsync(candidate)).exists) {
    candidate = `${dir}${safeName} (${n})${cleanExt}`;
    n += 1;
  }
  return candidate;
}
