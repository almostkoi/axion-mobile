import React, { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ChevronLeft, Disc3, Play } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, selectCurrentTrack } from '../../store/useStore';
import { ACCENT_HEX, COLORS } from '../../lib/theme';
import { TrackRow } from '../../components/TrackRow';
import { playTrackAt } from '../../hooks/usePlayback';
import { formatDuration, pluralize } from '../../lib/format';

export default function AlbumScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const albumId = decodeURIComponent(id ?? '');
  const album = useStore(s => s.albums.find(a => a.id === albumId));
  const tracks = useStore(s => s.tracks);
  const current = useStore(selectCurrentTrack);
  const accent = useStore(s => s.settings.accentColor);
  const accentHex = ACCENT_HEX[accent];

  const albumTracks = useMemo(() => {
    if (!album) return [];
    return tracks
      .filter(t => (t.albumArtist || t.artist) === album.artist && t.album === album.name)
      .sort((a, b) => {
        const da = (a.discNumber ?? 1) - (b.discNumber ?? 1);
        if (da !== 0) return da;
        return (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
      });
  }, [album, tracks]);

  if (!album) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <Pressable onPress={() => router.back()} className="p-4">
          <ChevronLeft size={24} color={COLORS.text} />
        </Pressable>
        <Text style={{ color: COLORS.textMuted, padding: 24, textAlign: 'center' }}>
          Album not found.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
      <FlatList
        data={albumTracks}
        keyExtractor={t => t.id}
        contentContainerStyle={{ paddingBottom: 200 }}
        ListHeaderComponent={
          <View>
            <Pressable onPress={() => router.back()} className="p-3" hitSlop={8}>
              <ChevronLeft size={26} color={COLORS.text} />
            </Pressable>
            <View className="items-center px-6 pt-2 pb-4">
              <View
                style={{
                  width: 200, height: 200, borderRadius: 12, overflow: 'hidden',
                  backgroundColor: COLORS.surface,
                  alignItems: 'center', justifyContent: 'center'
                }}
              >
                {album.artwork ? (
                  <Image source={{ uri: album.artwork }} style={{ width: 200, height: 200 }} contentFit="cover" />
                ) : (
                  <Disc3 size={56} color={COLORS.textDim} />
                )}
              </View>
              <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: '700', marginTop: 16 }}>
                {album.name}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 14, marginTop: 2 }}>
                {album.artist}
                {album.year ? ` · ${album.year}` : ''}
              </Text>
              <Text style={{ color: COLORS.textDim, fontSize: 12, marginTop: 4 }}>
                {pluralize(album.trackCount, 'track')} · {formatDuration(album.duration)}
              </Text>
              <Pressable
                onPress={() => void playTrackAt(albumTracks, 0)}
                style={{
                  marginTop: 18,
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 24, paddingVertical: 12,
                  borderRadius: 24,
                  backgroundColor: accentHex
                }}
                android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
              >
                <Play size={16} color="#fff" fill="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Play</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            isActive={current?.id === item.id}
            onPress={() => void playTrackAt(albumTracks, index)}
          />
        )}
      />
    </SafeAreaView>
  );
}
