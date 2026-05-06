// Local SQLite store for the music library.
//
// Mirrors the desktop schema closely enough that a future LAN/cloud sync
// can copy rows verbatim. Uses the new `expo-sqlite` async API
// (`openDatabaseAsync`).

import * as SQLite from 'expo-sqlite';
import type {
  Track, TrackId, Album, Artist, Playlist, PlaylistId
} from '../types/domain';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Lazily open and migrate the database. Idempotent. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async (): Promise<SQLite.SQLiteDatabase> => {
      const db = await SQLite.openDatabaseAsync('axion.db');
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      uri TEXT NOT NULL,
      filePath TEXT,
      fileSize INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      albumArtist TEXT NOT NULL DEFAULT '',
      album TEXT NOT NULL DEFAULT '',
      genre TEXT NOT NULL DEFAULT '',
      year INTEGER,
      trackNumber INTEGER,
      discNumber INTEGER,
      duration REAL NOT NULL DEFAULT 0,
      bitrate INTEGER,
      sampleRate INTEGER,
      artwork TEXT,
      dateAdded INTEGER NOT NULL,
      playCount INTEGER NOT NULL DEFAULT 0,
      lastPlayed INTEGER,
      liked INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_dateAdded ON tracks(dateAdded DESC);

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      artwork TEXT,
      kind TEXT NOT NULL DEFAULT 'user',
      dateCreated INTEGER NOT NULL,
      dateModified INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlistId TEXT NOT NULL,
      trackId TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (playlistId, position),
      FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (trackId) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed a "Liked" playlist on first run.
  const liked = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM playlists WHERE kind = 'liked' LIMIT 1`
  );
  if (!liked) {
    const now = Date.now();
    await db.runAsync(
      `INSERT INTO playlists (id, name, description, kind, dateCreated, dateModified)
       VALUES (?, ?, ?, ?, ?, ?)`,
      'liked', 'Liked', 'Tracks you marked as liked.', 'liked', now, now
    );
  }
}

// ─── Tracks ────────────────────────────────────────────────────────

export async function upsertTracks(tracks: Track[]): Promise<void> {
  if (tracks.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const t of tracks) {
      await db.runAsync(
        `INSERT OR REPLACE INTO tracks
         (id, uri, filePath, fileSize, title, artist, albumArtist, album, genre,
          year, trackNumber, discNumber, duration, bitrate, sampleRate, artwork,
          dateAdded, playCount, lastPlayed, liked)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        t.id, t.uri, t.filePath, t.fileSize, t.title, t.artist, t.albumArtist,
        t.album, t.genre, t.year, t.trackNumber, t.discNumber, t.duration,
        t.bitrate, t.sampleRate, t.artwork, t.dateAdded, t.playCount,
        t.lastPlayed, t.liked
      );
    }
  });
}

export async function listAllTracks(): Promise<Track[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Track>(
    `SELECT * FROM tracks ORDER BY artist COLLATE NOCASE, album COLLATE NOCASE,
       discNumber, trackNumber, title COLLATE NOCASE`
  );
  return rows;
}

export async function getTrack(id: TrackId): Promise<Track | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Track>(`SELECT * FROM tracks WHERE id = ?`, id);
  return row ?? null;
}

export async function deleteAllTracks(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM tracks`);
}

export async function setLiked(id: TrackId, liked: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE tracks SET liked = ? WHERE id = ?`, liked ? 1 : 0, id);
}

export async function bumpPlayCount(id: TrackId): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE tracks SET playCount = playCount + 1, lastPlayed = ? WHERE id = ?`,
    Date.now(), id
  );
}

// ─── Aggregates (albums, artists) ──────────────────────────────────
//
// Aggregates are computed in-memory from the tracks table — keeps schema
// simple and avoids stale-aggregate bugs. Cheap enough for a personal
// library (~10 k tracks).

export function aggregateAlbums(tracks: Track[]): Album[] {
  const map = new Map<string, Album>();
  for (const t of tracks) {
    const key = `${t.albumArtist || t.artist}::${t.album}`;
    const existing = map.get(key);
    if (existing) {
      existing.trackCount += 1;
      existing.duration += t.duration;
      if (!existing.artwork && t.artwork) existing.artwork = t.artwork;
    } else {
      map.set(key, {
        id: key,
        name: t.album || 'Unknown Album',
        artist: t.albumArtist || t.artist || 'Unknown Artist',
        year: t.year,
        artwork: t.artwork,
        trackCount: 1,
        duration: t.duration
      });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name)
  );
}

export function aggregateArtists(tracks: Track[]): Artist[] {
  const map = new Map<string, Artist & { albums: Set<string> }>();
  for (const t of tracks) {
    const name = t.albumArtist || t.artist || 'Unknown Artist';
    const existing = map.get(name);
    if (existing) {
      existing.trackCount += 1;
      existing.albums.add(t.album);
      if (!existing.artwork && t.artwork) existing.artwork = t.artwork;
    } else {
      map.set(name, {
        id: name,
        name,
        trackCount: 1,
        albumCount: 0,
        artwork: t.artwork,
        albums: new Set([t.album])
      });
    }
  }
  return [...map.values()]
    .map(({ albums, ...rest }) => ({ ...rest, albumCount: albums.size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Playlists ─────────────────────────────────────────────────────

export async function listPlaylists(): Promise<Playlist[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Omit<Playlist, 'trackIds'>>(
    `SELECT * FROM playlists ORDER BY kind = 'liked' DESC, dateCreated DESC`
  );
  const out: Playlist[] = [];
  for (const r of rows) {
    const tids = await db.getAllAsync<{ trackId: TrackId }>(
      `SELECT trackId FROM playlist_tracks WHERE playlistId = ? ORDER BY position`,
      r.id
    );
    out.push({ ...r, trackIds: tids.map(t => t.trackId) });
  }
  return out;
}

export async function createPlaylist(name: string, description = ''): Promise<Playlist> {
  const db = await getDb();
  const id = `pl_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO playlists (id, name, description, kind, dateCreated, dateModified)
     VALUES (?, ?, ?, 'user', ?, ?)`,
    id, name, description, now, now
  );
  return {
    id, name, description, artwork: null, kind: 'user',
    trackIds: [], dateCreated: now, dateModified: now
  };
}

export async function deletePlaylist(id: PlaylistId): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM playlists WHERE id = ? AND kind = 'user'`, id);
}

export async function addTrackToPlaylist(
  playlistId: PlaylistId, trackId: TrackId
): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ maxPos: number | null }>(
    `SELECT MAX(position) as maxPos FROM playlist_tracks WHERE playlistId = ?`,
    playlistId
  );
  const next = (row?.maxPos ?? -1) + 1;
  await db.runAsync(
    `INSERT INTO playlist_tracks (playlistId, trackId, position) VALUES (?, ?, ?)`,
    playlistId, trackId, next
  );
  await db.runAsync(`UPDATE playlists SET dateModified = ? WHERE id = ?`, Date.now(), playlistId);
}

export async function removeTrackFromPlaylist(
  playlistId: PlaylistId, trackId: TrackId
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?`,
    playlistId, trackId
  );
  await db.runAsync(`UPDATE playlists SET dateModified = ? WHERE id = ?`, Date.now(), playlistId);
}

// ─── Settings ──────────────────────────────────────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?`, key
  );
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
    key, JSON.stringify(value)
  );
}
