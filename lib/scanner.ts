// Music library scanner — reads device audio via expo-media-library and
// hydrates the tracks table.
//
// On Android 13+ the relevant runtime permission is `READ_MEDIA_AUDIO`.
// expo-media-library handles the request through `MediaLibrary.requestPermissionsAsync()`.

import * as MediaLibrary from 'expo-media-library';
import type { Track } from '../types/domain';
import { upsertTracks, deleteAllTracks } from './db';

/**
 * Request audio-read permission. Returns true if granted.
 */
export async function ensureAudioPermission(): Promise<boolean> {
  let perm = await MediaLibrary.getPermissionsAsync(false, ['audio']);
  if (perm.status !== 'granted') {
    perm = await MediaLibrary.requestPermissionsAsync(false, ['audio']);
  }
  return perm.status === 'granted';
}

export interface ScanCallbacks {
  onProgress?: (current: number, total: number, currentFile: string | null) => void;
}

/**
 * Walk every audio asset on the device and write rows into the tracks table.
 * Resets the table at the start so deletions on disk are reflected.
 */
export async function rescanLibrary(cb: ScanCallbacks = {}): Promise<number> {
  if (!(await ensureAudioPermission())) {
    throw new Error('Permission denied: cannot read device audio.');
  }

  // Page through all audio assets.
  let after: string | undefined;
  let total = 0;
  const pageSize = 200;
  const all: MediaLibrary.Asset[] = [];

  // Drain in pages first so we know `total` for progress reporting.
  while (true) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: 'audio',
      first: pageSize,
      after,
      sortBy: [['creationTime', false]]
    });
    all.push(...page.assets);
    total += page.assets.length;
    if (!page.hasNextPage || !page.endCursor) break;
    after = page.endCursor;
  }

  await deleteAllTracks();

  const batch: Track[] = [];
  let i = 0;
  for (const asset of all) {
    i++;
    cb.onProgress?.(i, total, asset.filename);

    // Album art is fetched per-asset only when batched up — saves wall-clock.
    let info: MediaLibrary.AssetInfo | null = null;
    try {
      info = await MediaLibrary.getAssetInfoAsync(asset);
    } catch {
      // Some assets fail with permission gotchas on certain devices; skip silently.
    }

    const meta = (info?.exif ?? {}) as Record<string, unknown>;
    const fileName = asset.filename.replace(/\.[^./\\]+$/, '');
    const title = (typeof meta.Title === 'string' && meta.Title) || fileName;
    const artist = (typeof meta.Artist === 'string' && meta.Artist) || 'Unknown Artist';
    const album = (typeof meta.Album === 'string' && meta.Album) || 'Unknown Album';
    const albumArtist = (typeof meta.AlbumArtist === 'string' && meta.AlbumArtist) || artist;
    const genre = (typeof meta.Genre === 'string' && meta.Genre) || '';
    const year = typeof meta.Year === 'number' ? meta.Year : null;
    const trackNumber = typeof meta.TrackNumber === 'number' ? meta.TrackNumber : null;
    const discNumber = typeof meta.DiscNumber === 'number' ? meta.DiscNumber : null;

    batch.push({
      id: asset.id,
      uri: info?.localUri || asset.uri,
      filePath: info?.localUri ?? null,
      fileSize: 0,
      title,
      artist,
      albumArtist,
      album,
      genre,
      year,
      trackNumber,
      discNumber,
      duration: asset.duration,
      bitrate: null,
      sampleRate: null,
      artwork: null,
      dateAdded: Math.floor(asset.creationTime),
      playCount: 0,
      lastPlayed: null,
      liked: 0
    });

    if (batch.length >= 100) {
      await upsertTracks(batch);
      batch.length = 0;
    }
  }
  if (batch.length > 0) await upsertTracks(batch);

  return total;
}
