import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Play, Pause, SkipForward, Music } from 'lucide-react-native';
import { useProgress } from 'react-native-track-player';
import { router } from 'expo-router';
import { useStore, selectCurrentTrack } from '../store/useStore';
import { ACCENT_HEX, COLORS } from '../lib/theme';
import { togglePlayPause, skipToNext } from '../hooks/usePlayback';

const MINI_HEIGHT = 60;

/**
 * Persistent mini-player docked above the bottom tab bar. Tap the body to
 * expand into the full-screen Now Playing modal; the play and skip buttons
 * stay tap-isolated so users don't open the modal accidentally.
 */
export const MiniPlayer: React.FC = () => {
  const track = useStore(selectCurrentTrack);
  const isPlaying = useStore(s => s.isPlaying);
  const accent = useStore(s => s.settings.accentColor);
  const accentHex = ACCENT_HEX[accent];
  const { position, duration } = useProgress(250);

  if (!track) return null;

  const ratio = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;

  return (
    <View
      style={{
        position: 'absolute',
        left: 8, right: 8,
        bottom: 64 + 8, // sit above the tab bar
        height: MINI_HEIGHT,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'hidden'
      }}
    >
      {/* Progress sliver along the bottom edge */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0, bottom: 0,
          height: 2,
          width: `${ratio * 100}%`,
          backgroundColor: accentHex
        }}
      />
      <Pressable
        onPress={() => router.push('/player')}
        android_ripple={{ color: COLORS.surfaceHi }}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}
      >
        <View
          style={{
            width: 44, height: 44, borderRadius: 8, overflow: 'hidden',
            backgroundColor: COLORS.surfaceHi,
            alignItems: 'center', justifyContent: 'center', marginRight: 10
          }}
        >
          {track.artwork ? (
            <Image source={{ uri: track.artwork }} style={{ width: 44, height: 44 }} contentFit="cover" />
          ) : (
            <Music size={18} color={COLORS.textDim} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: '500', fontSize: 14 }}>
            {track.title || 'Untitled'}
          </Text>
          <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 12 }}>
            {track.artist}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={() => void togglePlayPause()}
        style={{ paddingHorizontal: 12, paddingVertical: 12 }}
        hitSlop={8}
      >
        {isPlaying
          ? <Pause size={22} color={COLORS.text} fill={COLORS.text} />
          : <Play size={22} color={COLORS.text} fill={COLORS.text} />}
      </Pressable>
      <Pressable
        onPress={() => void skipToNext()}
        style={{ paddingHorizontal: 12, paddingVertical: 12, marginRight: 4 }}
        hitSlop={8}
      >
        <SkipForward size={20} color={COLORS.text} fill={COLORS.text} />
      </Pressable>
    </View>
  );
};

export const MINI_PLAYER_HEIGHT = MINI_HEIGHT;
