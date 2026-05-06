// Mobile global store. Holds library data, queue, settings, scan progress.
//
// Playback state itself (position / duration / playing) is kept inside
// react-native-track-player and read via `useProgress` / `usePlaybackState`.
// We mirror the *queue* and *current track index* here so we can drive the
// UI synchronously without round-tripping the player module.

import { create } from 'zustand';
import type {
  Track, TrackId, Album, Artist, Playlist,
  Settings, ScanProgress, RepeatMode, AccentColor
} from '../types/domain';

const DEFAULT_SETTINGS: Settings = {
  accentColor: 'green',
  theme: 'dark',
  shuffle: false,
  repeat: 'off',
  volume: 1,
  lastScannedAt: null,
  restrictedFolders: []
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
