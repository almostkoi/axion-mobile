// Loads the library from SQLite into the Zustand store on mount, and
// exposes a `rescan()` action that runs the media-library scanner.

import { useEffect, useCallback } from 'react';
import {
  listAllTracks, listPlaylists, aggregateAlbums, aggregateArtists,
  getSetting, setSetting
} from '../lib/db';
import { rescanLibrary } from '../lib/scanner';
import { useStore } from '../store/useStore';
import type { Settings } from '../types/domain';

/** Refresh in-memory library snapshot from SQLite. */
async function refresh(): Promise<void> {
  const tracks = await listAllTracks();
  const albums = aggregateAlbums(tracks);
  const artists = aggregateArtists(tracks);
  const playlists = await listPlaylists();
  useStore.getState().setLibrary({ tracks, albums, artists });
  useStore.getState().setPlaylists(playlists);
}

export function useLibrary(): { rescan: () => Promise<void> } {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getSetting<Settings | null>('settings', null);
      if (stored && !cancelled) useStore.getState().setSettings(stored);
      if (!cancelled) await refresh();
    })().catch(err => console.warn('[axion] library hydrate failed', err));
    return () => { cancelled = true; };
  }, []);

  // Persist settings whenever they change (debounce-free; payload is tiny).
  const settings = useStore(s => s.settings);
  useEffect(() => { void setSetting('settings', settings); }, [settings]);

  const rescan = useCallback(async (): Promise<void> => {
    const setProgress = useStore.getState().setScanProgress;
    setProgress({ phase: 'scanning', current: 0, total: 0, currentFile: null });
    try {
      const total = await rescanLibrary({
        onProgress: (current, totalFiles, currentFile) => {
          setProgress({ phase: 'parsing', current, total: totalFiles, currentFile });
        }
      });
      await refresh();
      setProgress({ phase: 'idle', current: total, total, currentFile: null });
      useStore.getState().setSettings({ lastScannedAt: Date.now() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setProgress({
        phase: 'error', current: 0, total: 0, currentFile: null, errorMessage: msg
      });
    }
  }, []);

  return { rescan };
}
