// react-native-track-player setup. The service file must be registered with
// `TrackPlayer.registerPlaybackService(...)` BEFORE the app component mounts;
// see `index.ts` for the `registerRootComponent` integration.
//
// The handlers below convert lockscreen / notification / headset events into
// our standard Zustand-friendly track-player calls.

import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
  type Track as TPTrack
} from 'react-native-track-player';
import type { Track } from '../types/domain';

let setupPromise: Promise<void> | null = null;

/** Idempotent player setup. */
export function setupPlayer(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async (): Promise<void> => {
      try {
        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: true
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Ignore "already initialized" so hot-reloads don't blow up.
        if (!/already/i.test(msg)) throw err;
      }
      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification
        },
        capabilities: [
          Capability.Play, Capability.Pause,
          Capability.SkipToNext, Capability.SkipToPrevious,
          Capability.Stop, Capability.SeekTo
        ],
        compactCapabilities: [
          Capability.Play, Capability.Pause,
          Capability.SkipToNext, Capability.SkipToPrevious
        ],
        notificationCapabilities: [
          Capability.Play, Capability.Pause,
          Capability.SkipToNext, Capability.SkipToPrevious,
          Capability.SeekTo
        ],
        progressUpdateEventInterval: 1
      });
    })();
  }
  return setupPromise;
}

export function trackToTPTrack(t: Track): TPTrack {
  return {
    id: t.id,
    url: t.uri,
    title: t.title || 'Untitled',
    artist: t.artist || 'Unknown Artist',
    album: t.album || undefined,
    artwork: t.artwork ?? undefined,
    duration: t.duration
  };
}

/** Replace the track-player queue with the supplied tracks. */
export async function loadQueue(tracks: Track[], startIndex = 0): Promise<void> {
  await TrackPlayer.reset();
  if (tracks.length === 0) return;
  await TrackPlayer.add(tracks.map(trackToTPTrack));
  if (startIndex > 0 && startIndex < tracks.length) {
    await TrackPlayer.skip(startIndex);
  }
}

export const TPRepeat = RepeatMode;
export const TPEvent = Event;

/** Service file referenced by `TrackPlayer.registerPlaybackService`. */
export async function PlaybackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => TrackPlayer.seekTo(position));
  TrackPlayer.addEventListener(Event.RemoteJumpForward, async ({ interval }) => {
    const pos = await TrackPlayer.getProgress();
    await TrackPlayer.seekTo(pos.position + (interval ?? 30));
  });
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async ({ interval }) => {
    const pos = await TrackPlayer.getProgress();
    await TrackPlayer.seekTo(Math.max(0, pos.position - (interval ?? 15)));
  });
}
