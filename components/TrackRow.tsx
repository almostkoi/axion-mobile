import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Music } from 'lucide-react-native';
import { COLORS } from '../lib/theme';
import { formatDuration } from '../lib/format';
import type { Track } from '../types/domain';

interface Props {
  track: Track;
  index?: number;
  isActive?: boolean;
  showAlbum?: boolean;
  onPress: (track: Track, index?: number) => void;
  onLongPress?: (track: Track) => void;
}

/** A compact horizontal row used everywhere a list of tracks is rendered. */
export const TrackRow: React.FC<Props> = ({
  track, index, isActive, showAlbum, onPress, onLongPress
}) => {
  const handleLongPress = (): void => {
    if (!onLongPress) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(track);
  };

  return (
    <Pressable
      onPress={() => onPress(track, index)}
      onLongPress={handleLongPress}
      android_ripple={{ color: COLORS.surfaceHi }}
      className="flex-row items-center px-4 py-2"
    >
      <View className="w-12 h-12 rounded-md overflow-hidden bg-surfaceHi mr-3 items-center justify-center">
        {track.artwork ? (
          <Image
            source={{ uri: track.artwork }}
            style={{ width: 48, height: 48 }}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <Music size={20} color={COLORS.textDim} />
        )}
      </View>
      <View className="flex-1 mr-3">
        <Text
          numberOfLines={1}
          className="text-[15px] font-medium"
          style={{ color: isActive ? '#22c55e' : COLORS.text }}
        >
          {track.title || 'Untitled'}
        </Text>
        <Text numberOfLines={1} className="text-[12.5px]" style={{ color: COLORS.textMuted }}>
          {track.artist}{showAlbum && track.album ? ` · ${track.album}` : ''}
        </Text>
      </View>
      <Text className="text-[12px] tabular-nums" style={{ color: COLORS.textDim }}>
        {formatDuration(track.duration)}
      </Text>
    </Pressable>
  );
};
