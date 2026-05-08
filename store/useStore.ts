// Mobile global store. Holds library data, queue, settings, scan progress.
//
// Playback state itself (position / duration / playing) is kept inside
// react-native-track-player and read via `useProgress` / `usePlaybackState`.
// We mirror the *queue* and *current track index* here so we can drive the
// UI synchronously without round-tripping the player module.

import { create } from 'zustand';
import type {
  Track, TrackId, Album, Artist, Playlist, PlaylistId,
  Settings, ScanProgress, RepeatMode, AccentColor
} from '../types/domain';
import {
  createPlaylist as dbCreatePlaylist,
  deletePlaylist as dbDeletePlaylist,
  addTrackToPlaylist as dbAddTrackToPlaylist,
  removeTrackFromPlaylist as dbRemoveTrackFromPlaylist,
  listPlaylists as dbListPlaylists,
  deleteTracks as dbDeleteTracks
} from '../lib/db';
import * as FileSystem from 'expo-file-system';

const DEFAULT_SETTINGS: Settings = {
  accentColor: 'green',
  theme: 'dark',
  shuffle: false,
  repeat: 'off',
  volume: 1,
  lastScannedAt: null,
  restrictedFolders: [],
  pipedInstance: 'https://pipedapi.kavin.rocks'
};

const DEFAULT_SCAN_PROGRESS: ScanProgress = {
  phase: 'idle', current: 0, total: 0, currentFile: null
};

export interface StoreState {
  // Library
  tracks: Track[];
  tracksById: Record<TrackId, Track>;
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];

  // Settings
  settings: Settings;

  // Playback (mirror — source of truth for position is track-player itself)
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;

  // UI
  scanProgress: ScanProgress;
  playerOpen: boolean;
  searchQuery: string;

  // Actions — library
  setLibrary: (next: { tracks: Track[]; albums: Album[]; artists: Artist[] }) => void;
  setPlaylists: (p: Playlist[]) => void;
  patchTrack: (id: TrackId, patch: Partial<Track>) => void;

  // Actions — playlists (write through to DB then refresh in-memory list)
  createPlaylistAction: (name: string) => Promise<Playlist>;
  deletePlaylistAction: (id: PlaylistId) => Promise<void>;
  deletePlaylistsAction: (ids: PlaylistId[]) => Promise<void>;
  addTrackToPlaylistAction: (playlistId: PlaylistId, trackId: TrackId) => Promise<void>;
  removeTrackFromPlaylistAction: (playlistId: PlaylistId, trackId: TrackId) => Promise<void>;
  refreshPlaylists: () => Promise<void>;

  // Actions — tracks
  /**
   * Remove tracks from the library DB. When `deleteFiles` is true, also
   * deletes the on-disk audio files from the app's private storage. The
   * UI distinguishes "Remove from library" (deleteFiles=false) from
   * "Delete file" (deleteFiles=true).
   */
  deleteTracksAction: (ids: TrackId[], opts?: { deleteFiles?: boolean }) => Promise<void>;

  // Actions — settings
  setSettings: (s: Partial<Settings>) => void;
  setAccentColor: (c: AccentColor) => void;
  setRepeat: (r: RepeatMode) => void;
  setShuffle: (s: boolean) => void;

  // Actions — playback (mirror only — actual playback is in audioService)
  setQueue: (queue: Track[], index: number) => void;
  setCurrentIndex: (index: number) => void;
  setIsPlaying: (p: boolean) => void;

  // Actions — scan
  setScanProgress: (p: ScanProgress) => void;

  // Actions — UI
  setPlayerOpen: (o: boolean) => void;
  setSearchQuery: (q: string) => void;
}

export const useStore = create<StoreState>((set) => ({
  tracks: [],
  tracksById: {},
  albums: [],
  artists: [],
  playlists: [],

  settings: DEFAULT_SETTINGS,

  queue: [],
  currentIndex: -1,
  isPlaying: false,

  scanProgress: DEFAULT_SCAN_PROGRESS,
  playerOpen: false,
  searchQuery: '',

  setLibrary: ({ tracks, albums, artists }) => set(() => {
    const tracksById: Record<TrackId, Track> = {};
    for (const t of tracks) tracksById[t.id] = t;
    return { tracks, tracksById, albums, artists };
  }),
  setPlaylists: (playlists) => set({ playlists }),

  refreshPlaylists: async () => {
    const fresh = await dbListPlaylists();
    set({ playlists: fresh });
  },
  createPlaylistAction: async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Playlist name is required');
    const created = await dbCreatePlaylist(trimmed);
    set((s) => ({ playlists: [created, ...s.playlists] }));
    return created;
  },
  deletePlaylistAction: async (id: PlaylistId) => {
    await dbDeletePlaylist(id);
    set((s) => ({ playlists: s.playlists.filter(p => p.id !== id) }));
  },
  deletePlaylistsAction: async (ids: PlaylistId[]) => {
    if (ids.length === 0) return;
    for (const id of ids) {
      // Sequential is fine — playlists are tiny and there are rarely
      // many of them. Wrapping in a single transaction would require
      // pushing the whole loop into db.ts; not worth the surface area.
      await dbDeletePlaylist(id);
    }
    set((s) => ({ playlists: s.playlists.filter(p => !ids.includes(p.id)) }));
  },
  deleteTracksAction: async (ids: TrackId[], opts) => {
    if (ids.length === 0) return;
    const deleteFiles = opts?.deleteFiles === true;
    if (deleteFiles) {
      // Read filePaths BEFORE the DB delete — we lose them after.
      const { tracksById } = useStore.getState();
      const paths = ids
        .map(id => tracksById[id]?.filePath)
        .filter((p): p is string => !!p);
      // Best-effort unlink; never abort the DB delete if a file is
      // missing or read-only.
      await Promise.all(paths.map(async (p) => {
        try { await FileSystem.deleteAsync(p, { idempotent: true }); }
        catch { /* ignore */ }
      }));
    }
    await dbDeleteTracks(ids);
    const removed = new Set(ids);
    set((s) => {
      const tracks = s.tracks.filter(t => !removed.has(t.id));
      const tracksById = { ...s.tracksById };
      for (const id of ids) delete tracksById[id];
      // Strip ids from any user playlist's trackIds mirror — DB cascade
      // already handled the join table; we just need to keep the in-memory
      // list consistent for the UI without a full refresh.
      const playlists = s.playlists.map(p => {
        if (p.kind !== 'user') return p;
        const next = p.trackIds.filter(t => !removed.has(t));
        if (next.length === p.trackIds.length) return p;
        return { ...p, trackIds: next };
      });
      // Drop deleted tracks from the live queue too so playback doesn't
      // try to load a now-missing source. If the current track was deleted,
      // the queue index stays the same and audioService will see a hole;
      // simplest behaviour is to truncate-then-clamp.
      const queue = s.queue.filter(t => !removed.has(t.id));
      const currentIndex = Math.min(s.currentIndex, queue.length - 1);
      return { tracks, tracksById, playlists, queue, currentIndex };
    });
  },
  addTrackToPlaylistAction: async (playlistId: PlaylistId, trackId: TrackId) => {
    await dbAddTrackToPlaylist(playlistId, trackId);
    set((s) => ({
      playlists: s.playlists.map(p =>
        p.id === playlistId
          ? { ...p, trackIds: [...p.trackIds, trackId], dateModified: Date.now() }
          : p
      )
    }));
  },
  removeTrackFromPlaylistAction: async (playlistId: PlaylistId, trackId: TrackId) => {
    await dbRemoveTrackFromPlaylist(playlistId, trackId);
    set((s) => ({
      playlists: s.playlists.map(p =>
        p.id === playlistId
          ? { ...p, trackIds: p.trackIds.filter(t => t !== trackId), dateModified: Date.now() }
          : p
      )
    }));
  },

  patchTrack: (id, patch) => set((s) => {
    const existing = s.tracksById[id];
    if (!existing) return {};
    const next = { ...existing, ...patch };
    return {
      tracksById: { ...s.tracksById, [id]: next },
      tracks: s.tracks.map(t => t.id === id ? next : t),
      queue: s.queue.map(t => t.id === id ? next : t)
    };
  }),

  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setAccentColor: (accentColor) => set((s) => ({ settings: { ...s.settings, accentColor } })),
  setRepeat: (repeat) => set((s) => ({ settings: { ...s.settings, repeat } })),
  setShuffle: (shuffle) => set((s) => ({ settings: { ...s.settings, shuffle } })),

  setQueue: (queue, index) => set({ queue, currentIndex: index }),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),

  setScanProgress: (scanProgress) => set({ scanProgress }),

  setPlayerOpen: (playerOpen) => set({ playerOpen }),
  setSearchQuery: (searchQuery) => set({ searchQuery })
}));

/** Convenience selector: the currently playing track (or null). */
export function selectCurrentTrack(s: StoreState): Track | null {
  return s.currentIndex >= 0 && s.currentIndex < s.queue.length
    ? s.queue[s.currentIndex] ?? null
    : null;
}
