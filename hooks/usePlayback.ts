// Bridge between the Zustand store and react-native-track-player.
//
// Exposes a small imperative API (`playTrackAt`, `togglePlayPause`, etc.) so
// screens don't import track-player directly — keeps platform-specific code
// localized.

import { useEffect } from 'react';
import TrackPlayer, {
  Event, State, RepeatMode as TPRepeatMode,
  useActiveTrack, usePlaybackState, useTrackPlayerEvents
} from 'react-native-track-player';
import { useStore } from '../store/useStore';
import { loadQueue, setupPlayer } from '../lib/audioService';
import { bumpPlayCount } from '../lib/db';
import type { Track, RepeatMode } from '../types/domain';

const EVENTS = [
  Event.PlaybackState,
  Event.PlaybackActiveTrackChanged,
  Event.PlaybackQueueEnded
] as const;

/**
 * Mount once near the root. Wires up store ↔ track-player events and keeps
 * the mirror state in sync.
 */
export function usePlayerSync(): void {
  const setIsPlaying = useStore(s => s.setIsPlaying);
  const setCurrentIndex = useStore(s => s.setCurrentIndex);
  const repeat = useStore(s => s.settings.repeat);

  // Apply repeat-mode preference whenever it changes.
  useEffect(() => {
    void TrackPlayer.setRepeatMode(toTPRepeat(repeat));
  }, [repeat]);

  useTrackPlayerEvents(EVENTS, async (event) => {
    if (event.type === Event.PlaybackState) {
      setIsPlaying(event.state === State.Playing);
    }
    if (event.type === Event.PlaybackActiveTrackChanged) {
      const idx = await TrackPlayer.getActiveTrackIndex();
      if (typeof idx === 'number') setCurrentIndex(idx);
      const track = await TrackPlayer.getActiveTrack();
      if (track && typeof track.id === 'string') void bumpPlayCount(track.id);
    }
  });
}

function toTPRepeat(r: RepeatMode): TPRepeatMode {
  switch (r) {
    case 'one': return TPRepeatMode.Track;
    case 'all': return TPRepeatMode.Queue;
    default:    return TPRepeatMode.Off;
  }
}

// ─── Imperative helpers ────────────────────────────────────────────

/** Play `tracks[index]`, replacing the queue. */
export async function playTrackAt(tracks: Track[], index: number): Promise<void> {
  await setupPlayer();
  await loadQueue(tracks, index);
  await TrackPlayer.play();
  useStore.getState().setQueue(tracks, index);
}

export async function togglePlayPause(): Promise<void> {
  const state = await TrackPlayer.getPlaybackState();
  if (state.state === State.Playing) await TrackPlayer.pause();
  else await TrackPlayer.play();
}

export async function skipToNext(): Promise<void> {
  await TrackPlayer.skipToNext();
}

export async function skipToPrevious(): Promise<void> {
  const progress = await TrackPlayer.getProgress();
  // Spotify-style: if more than 3s in, restart current; else go back.
  if (progress.position > 3) {
    await TrackPlayer.seekTo(0);
  } else {
    await TrackPlayer.skipToPrevious();
  }
}

export async function seekTo(seconds: number): Promise<void> {
  await TrackPlayer.seekTo(seconds);
}

export async function appendToQueue(tracks: Track[]): Promise<void> {
  await TrackPlayer.add(tracks.map(t => ({
    id: t.id,
    url: t.uri,
    title: t.title,
    artist: t.artist,
    album: t.album,
    artwork: t.artwork ?? undefined,
    duration: t.duration
  })));
  // Mirror append.
  const { queue, currentIndex } = useStore.getState();
  useStore.getState().setQueue([...queue, ...tracks], currentIndex);
}

export { useActiveTrack, usePlaybackState };
