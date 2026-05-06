import React, { useMemo } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { ChevronLeft, ListMusic, Play, Plus, Trash2 } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, selectCurrentTrack } from '../../store/useStore';
import { ACCENT_HEX, COLORS } from '../../lib/theme';
import { TrackRow } from '../../components/TrackRow';
import { playTrackAt } from '../../hooks/usePlayback';
import { pluralize } from '../../lib/format';
import type { Track } from '../../types/domain';

export default function PlaylistScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistId = decodeURIComponent(id ?? '');
  const playlist = useStore(s => s.playlists.find(p => p.id === playlistId));
  const tracksById = useStore(s => s.tracksById);
  const current = useStore(selectCurrentTrack);
  const accent = useStore(s => s.settings.accentColor);
  const accentHex = ACCENT_HEX[accent];
  const deletePlaylistAction = useStore(s => s.deletePlaylistAction);
  const removeTrackFromPlaylistAction = useStore(s => s.removeTrackFromPlaylistAction);

  const isUserPlaylist = playlist?.kind === 'user';

  const handleDelete = (): void => {
    if (!playlist || !isUserPlaylist) return;
    Alert.alert(
      'Delete playlist?',
      `"${playlist.name}" will be removed. The tracks themselves stay in your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => {
            void deletePlaylistAction(playlist.id).then(() => router.back());
          }
        }
      ]
    );
  };

  const handleTrackLongPress = (t: Track): void => {
    if (!playlist) return;
    if (isUserPlaylist) {
      Alert.alert(
        t.title || 'Track',
        undefined,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove from playlist', style: 'destructive',
            onPress: () => { void removeTrackFromPlaylistAction(playlist.id, t.id); }
          },
          {
            text: 'Add to other playlist',
            onPress: () => router.push({ pathname: '/add-to-playlist', params: { trackId: t.id } })
          }
        ]
      );
    } else {
      router.push({ pathname: '/add-to-playlist', params: { trackId: t.id } });
    }
  };

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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 8 }}>
              <Pressable onPress={() => router.back()} className="p-3" hitSlop={8}>
                <ChevronLeft size={26} color={COLORS.text} />
              </Pressable>
              {isUserPlaylist && (
                <Pressable onPress={handleDelete} hitSlop={10} style={{ padding: 12 }}>
                  <Trash2 size={20} color={COLORS.textMuted} />
                </Pressable>
              )}
            </View>
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
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                {tracks.length > 0 && (
                  <Pressable
                    onPress={() => void playTrackAt(tracks, 0)}
                    style={{
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
                {isUserPlaylist && (
                  <Pressable
                    onPress={() => router.push('/(tabs)/library')}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 18, paddingVertical: 12,
                      borderRadius: 24,
                      backgroundColor: COLORS.surface
                    }}
                    android_ripple={{ color: COLORS.surfaceHi }}
                  >
                    <Plus size={16} color={COLORS.text} />
                    <Text style={{ color: COLORS.text, fontWeight: '600', fontSize: 14 }}>Add tracks</Text>
                  </Pressable>
                )}
              </View>
              {isUserPlaylist && tracks.length > 0 && (
                <Text style={{ color: COLORS.textDim, fontSize: 11, marginTop: 16, textAlign: 'center' }}>
                  Long-press a track to remove it.
                </Text>
              )}
              {isUserPlaylist && tracks.length === 0 && (
                <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 24, textAlign: 'center', paddingHorizontal: 24 }}>
                  Empty playlist. Open Library, long-press any track, and pick “{playlist.name}”.
                </Text>
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
            onLongPress={handleTrackLongPress}
          />
        )}
      />
    </SafeAreaView>
  );
}
