import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Disc3 } from 'lucide-react-native';
import { COLORS } from '../lib/theme';
import type { Album } from '../types/domain';

interface Props {
  album: Album;
  size?: number;
  onPress: (album: Album) => void;
}

/** A square card with artwork, used in grids on Home / Library. */
export const AlbumCard: React.FC<Props> = ({ album, size = 140, onPress }) => {
  return (
    <Pressable onPress={() => onPress(album)} style={{ width: size }}>
      <View
        style={{
          width: size, height: size, borderRadius: 10, overflow: 'hidden',
          backgroundColor: COLORS.surfaceHi,
          alignItems: 'center', justifyContent: 'center'
        }}
      >
        {album.artwork ? (
          <Image
            source={{ uri: album.artwork }}
            style={{ width: size, height: size }}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <Disc3 size={32} color={COLORS.textDim} />
        )}
      </View>
      <Text
        numberOfLines={1}
        style={{ color: COLORS.text, fontSize: 14, marginTop: 6, fontWeight: '500' }}
      >
        {album.name}
      </Text>
      <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 12 }}>
        {album.artist}
      </Text>
    </Pressable>
  );
};
