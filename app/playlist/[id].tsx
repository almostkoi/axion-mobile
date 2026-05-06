import React, { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { ChevronLeft, ListMusic, Play } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, selectCurrentTrack } from '../../store/useStore';
import { ACCENT_HEX, COLORS } from '../../lib/theme';
import { TrackRow } from '../../components/TrackRow';
import { playTrackAt } from '../../hooks/usePlayback';
import { pluralize } from '../../lib/format';

export default function PlaylistScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistId = decodeURIComponent(id ?? '');
  const playlist = useStore(s => s.playlists.find(p => p.id === playlistId));
  const tracksById = useStore(s => s.tracksById);
  const current = useStore(selectCurrentTrack);
  const accent = useStore(s => s.settings.accentColor);
  const accentHex = ACCENT_HEX[accent];

  const tracks = useMemo(() => {
    if (!playlist) return [];
    if (playlist.kind === 'liked') {
      return Object.values(tracksById).filter(t => t.liked === 1);
    }
    return playlist.trackIds.map(id => tracksById[id]).filter(Boolean);
  }, [playlist, tracksById]);

  if (!playlist) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <Pressable onPress={() => router.back()} className="p-4">
          <ChevronLeft size={24} color={COLORS.text} />
        </Pressable>
        <Text style={{ color: COLORS.textMuted, padding: 24, textAlign: 'center' }}>
          Playlist not found.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
      <FlatList
        data={tracks}
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
                  width: 180, height: 180, borderRadius: 12,
                  backgroundColor: COLORS.surface,
                  alignItems: 'center', justifyContent: 'center'
                }}
              >
                <ListMusic size={56} color={COLORS.textDim} />
              </View>
              <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: '700', marginTop: 16 }}>
                {playlist.name}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
                {pluralize(tracks.length, 'track')}
                {playlist.kind === 'liked' ? ' · auto-managed' : ''}
              </Text>
              {tracks.length > 0 && (
                <Pressable
                  onPress={() => void playTrackAt(tracks, 0)}
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
              )}
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            isActive={current?.id === item.id}
            showAlbum
            onPress={() => void playTrackAt(tracks, index)}
          />
        )}
      />
    </SafeAreaView>
  );
}
