import React, { useRef, useState } from 'react';
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
 */
export const Scrubber: React.FC<Props> = ({ position, duration, onSeek, accent }) => {
  const [width, setWidth] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubPos, setScrubPos] = useState(position);
  const widthRef = useRef(0);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  widthRef.current = width;

  const value = scrubbing ? scrubPos : position;
  const ratio = duration > 0 ? Math.max(0, Math.min(1, value / duration)) : 0;

  const setFromX = (x: number): void => {
    if (widthRef.current <= 0) return;
    const r = Math.max(0, Math.min(1, x / widthRef.current));
    setScrubPos(r * durationRef.current);
  };

  const pan = Gesture.Pan()
    .onBegin((e) => {
      runOnJS(setScrubbing)(true);
      runOnJS(setFromX)(e.x);
    })
    .onUpdate((e) => {
      runOnJS(setFromX)(e.x);
    })
    .onEnd(() => {
      const finalSeconds = (() => {
        const r = widthRef.current > 0 ? scrubPos / durationRef.current : 0;
        return r * durationRef.current;
      })();
      runOnJS(onSeek)(finalSeconds);
      runOnJS(setScrubbing)(false);
    });

  const handleLayout = (e: LayoutChangeEvent): void => setWidth(e.nativeEvent.layout.width);

  const handlePress = (e: GestureResponderEvent): void => {
    setFromX(e.nativeEvent.locationX);
    onSeek(e.nativeEvent.locationX / widthRef.current * durationRef.current);
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
