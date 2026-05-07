import React, { useEffect, useRef, useState } from 'react';
import { Text, View, LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { COLORS } from '../lib/theme';
import { formatDuration } from '../lib/format';

interface Props {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  accent: string;
}

/**
 * Touch-driven progress scrubber. Tap-to-seek and pan-to-scrub.
 *
 * Two subtleties:
 *  - Reanimated worklet callbacks (`onBegin`/`onUpdate`/`onEnd`) capture JS
 *    closures at gesture-construction time. Reading React state like
 *    `scrubPos` directly inside `.onEnd` would yield a stale value (often
 *    the original playback position when the touch began), so the seek
 *    fires with the wrong target. Instead, we hand the worklet a tiny
 *    JS-thread callback via `runOnJS` that reads the latest refs.
 *  - `TrackPlayer.seekTo` is async and the `useProgress` poll lags, so if
 *    we cleared `scrubbing` immediately on release the bar would snap back
 *    to the old position for a beat. We keep the optimistic `scrubPos`
 *    visible until the live `position` is within ~0.75s of it.
 */
export const Scrubber: React.FC<Props> = ({ position, duration, onSeek, accent }) => {
  const [width, setWidth] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<number | null>(null);
  const [scrubPos, setScrubPos] = useState(position);
  const widthRef = useRef(0);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  widthRef.current = width;

  // Clear the optimistic post-release override once useProgress catches up
  // (or after a 1.5s safety timeout).
  useEffect(() => {
    if (pendingTarget == null) return;
    if (Math.abs(position - pendingTarget) < 0.75) {
      setPendingTarget(null);
      return;
    }
    const t = setTimeout(() => setPendingTarget(null), 1500);
    return () => clearTimeout(t);
  }, [pendingTarget, position]);

  const value = scrubbing
    ? scrubPos
    : pendingTarget != null
      ? pendingTarget
      : position;
  const ratio = duration > 0 ? Math.max(0, Math.min(1, value / duration)) : 0;

  const setFromX = (x: number): void => {
    if (widthRef.current <= 0) return;
    const r = Math.max(0, Math.min(1, x / widthRef.current));
    setScrubPos(r * durationRef.current);
  };

  const commitSeekFromX = (x: number): void => {
    const w = widthRef.current;
    const dur = durationRef.current;
    if (w <= 0 || dur <= 0) {
      setScrubbing(false);
      return;
    }
    const r = Math.max(0, Math.min(1, x / w));
    const finalSeconds = r * dur;
    setScrubPos(finalSeconds);
    setPendingTarget(finalSeconds);
    setScrubbing(false);
    onSeek(finalSeconds);
  };

  const pan = Gesture.Pan()
    .minDistance(2)
    .onBegin((e) => {
      runOnJS(setScrubbing)(true);
      runOnJS(setFromX)(e.x);
    })
    .onUpdate((e) => {
      runOnJS(setFromX)(e.x);
    })
    .onEnd((e) => {
      // Compute the final target from the event's x in JS, where the latest
      // width/duration refs are reachable. Doing this in the worklet would
      // capture stale values from the render that built the gesture.
      runOnJS(commitSeekFromX)(e.x);
    })
    .onFinalize((_e, success) => {
      // Ensure scrubbing is cleared even if the gesture was cancelled.
      if (!success) runOnJS(setScrubbing)(false);
    });

  const handleLayout = (e: LayoutChangeEvent): void => setWidth(e.nativeEvent.layout.width);

  const handlePress = (e: GestureResponderEvent): void => {
    // Tap-to-seek: pan never engages on a quick tap (minDistance), so the
    // responder system fires this instead.
    commitSeekFromX(e.nativeEvent.locationX);
  };

  return (
    <View className="px-1">
      <GestureDetector gesture={pan}>
        <View
          onLayout={handleLayout}
          onStartShouldSetResponder={() => true}
          onResponderRelease={handlePress}
          style={{ paddingVertical: 14 }}
        >
          <View
            style={{
              height: 4, borderRadius: 2,
              backgroundColor: COLORS.surfaceHi,
              overflow: 'hidden'
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${ratio * 100}%`,
                backgroundColor: accent,
                borderRadius: 2
              }}
            />
          </View>
          <View
            style={{
              position: 'absolute',
              top: 7,
              left: ratio * width - 8,
              width: 16, height: 16, borderRadius: 8,
              backgroundColor: accent,
              opacity: scrubbing ? 1 : 0.95,
              transform: [{ scale: scrubbing ? 1.15 : 1 }]
            }}
          />
        </View>
      </GestureDetector>
      <View className="flex-row justify-between mt-1">
        <Text className="tabular-nums" style={{ color: COLORS.textMuted, fontSize: 11 }}>
          {formatDuration(value)}
        </Text>
        <Text className="tabular-nums" style={{ color: COLORS.textMuted, fontSize: 11 }}>
          {formatDuration(duration)}
        </Text>
      </View>
    </View>
  );
};
