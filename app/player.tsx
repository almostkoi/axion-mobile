import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronDown, Heart, ListMusic, Music,
  Play, Pause, Repeat, Repeat1, Shuffle,
  SkipBack, SkipForward
} from 'lucide-react-native';
import { useProgress } from 'react-native-track-player';
import { useStore, selectCurrentTrack } from '../store/useStore';
import { ACCENT_HEX, COLORS } from '../lib/theme';
import { Scrubber } from '../components/Scrubber';
import {
  togglePlayPause, skipToNext, skipToPrevious, seekTo
} from '../hooks/usePlayback';
import { setLiked } from '../lib/db';
import type { RepeatMode } from '../types/domain';

export default function PlayerScreen(): React.ReactElement {
  const track = useStore(selectCurrentTrack);
  const isPlaying = useStore(s => s.isPlaying);
  const accent = useStore(s => s.settings.accentColor);
  const accentHex = ACCENT_HEX[accent];
  const repeat = useStore(s => s.settings.repeat);
  const shuffle = useStore(s => s.settings.shuffle);
  const setRepeat = useStore(s => s.setRepeat);
  const setShuffle = useStore(s => s.setShuffle);
  const patchTrack = useStore(s => s.patchTrack);

  const { position, duration } = useProgress(250);
  const [liked, setLikedLocal] = useState<boolean>(track?.liked === 1);
  React.useEffect(() => { setLikedLocal(track?.liked === 1); }, [track?.id, track?.liked]);

  if (!track) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View className="flex-1 items-center justify-center px-6">
          <Music size={48} color={COLORS.textMuted} />
          <Text style={{ color: COLORS.textMuted, marginTop: 12 }}>Nothing playing.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const onToggleLike = (): void => {
    const next = !liked;
    setLikedLocal(next);
    void setLiked(track.id, next);
    patchTrack(track.id, { liked: next ? 1 : 0 });
  };

  const cycleRepeat = (): void => {
    const order: RepeatMode[] = ['off', 'all', 'one'];
    setRepeat(order[(order.indexOf(repeat) + 1) % order.length]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-2">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ChevronDown size={28} color={COLORS.text} />
        </Pressable>
        <Text style={{ color: COLORS.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2 }}>
          Now Playing
        </Text>
        <Pressable onPress={() => router.push('/queue')} hitSlop={8}>
          <ListMusic size={22} color={COLORS.text} />
        </Pressable>
      </View>

      {/* Artwork */}
      <View className="items-center justify-center" style={{ flex: 1, paddingVertical: 16 }}>
        <View
          style={{
            width: 280, height: 280,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: COLORS.surface,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: accentHex,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.4,
            shadowRadius: 24,
            elevation: 12
          }}
        >
          {track.artwork ? (
            <Image
              source={{ uri: track.artwork }}
              style={{ width: 280, height: 280 }}
              contentFit="cover"
            />
          ) : (
            <Music size={72} color={COLORS.textDim} />
          )}
        </View>
      </View>

      {/* Track meta */}
      <View className="px-6">
        <View className="flex-row items-center">
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: 22, fontWeight: '700' }}>
              {track.title || 'Untitled'}
            </Text>
            <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 14, marginTop: 2 }}>
              {track.artist}
              {track.album ? ` · ${track.album}` : ''}
            </Text>
          </View>
          <Pressable onPress={onToggleLike} hitSlop={8}>
            <Heart
              size={24}
              color={liked ? accentHex : COLORS.textMuted}
              fill={liked ? accentHex : 'transparent'}
            />
          </Pressable>
        </View>
      </View>

      {/* Scrubber */}
      <View className="px-6 mt-4">
        <Scrubber
          position={position}
          duration={duration > 0 ? duration : track.duration}
          onSeek={(s) => void seekTo(s)}
          accent={accentHex}
        />
      </View>

      {/* Controls */}
      <View
        className="flex-row items-center justify-between"
        style={{ paddingHorizontal: 32, paddingVertical: 18 }}
      >
        <Pressable onPress={() => setShuffle(!shuffle)} hitSlop={8}>
          <Shuffle size={22} color={shuffle ? accentHex : COLORS.textMuted} />
        </Pressable>
        <Pressable onPress={() => void skipToPrevious()} hitSlop={8}>
          <SkipBack size={32} color={COLORS.text} fill={COLORS.text} />
        </Pressable>
        <Pressable
          onPress={() => void togglePlayPause()}
          hitSlop={8}
          style={{
            width: 64, height: 64, borderRadius: 32,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: accentHex
          }}
          android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
        >
          {isPlaying
            ? <Pause size={28} color="#fff" fill="#fff" />
            : <Play size={28} color="#fff" fill="#fff" />}
        </Pressable>
        <Pressable onPress={() => void skipToNext()} hitSlop={8}>
          <SkipForward size={32} color={COLORS.text} fill={COLORS.text} />
        </Pressable>
        <Pressable onPress={cycleRepeat} hitSlop={8}>
          {repeat === 'one'
            ? <Repeat1 size={22} color={accentHex} />
            : <Repeat size={22} color={repeat === 'all' ? accentHex : COLORS.textMuted} />}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
