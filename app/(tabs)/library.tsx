import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useStore, selectCurrentTrack } from '../../store/useStore';
import { ACCENT_HEX, COLORS } from '../../lib/theme';
import { TrackRow } from '../../components/TrackRow';
import { AlbumCard } from '../../components/AlbumCard';
import { playTrackAt } from '../../hooks/usePlayback';
import { pluralize } from '../../lib/format';

const openAddToPlaylist = (trackId?: string): void => {
  router.push({ pathname: '/add-to-playlist', params: trackId ? { trackId } : {} });
};

type Section = 'songs' | 'albums' | 'artists' | 'playlists';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'songs',     label: 'Songs' },
  { id: 'albums',    label: 'Albums' },
  { id: 'artists',   label: 'Artists' },
  { id: 'playlists', label: 'Playlists' }
];

export default function LibraryScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ section?: string }>();
  const initial = (SECTIONS.find(s => s.id === params.section)?.id ?? 'songs') as Section;
  const [section, setSection] = useState<Section>(initial);

  const tracks = useStore(s => s.tracks);
  const albums = useStore(s => s.albums);
  const artists = useStore(s => s.artists);
  const playlists = useStore(s => s.playlists);
  const current = useStore(selectCurrentTrack);
  const accent = useStore(s => s.settings.accentColor);
  const accentHex = ACCENT_HEX[accent];

  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => a.title.localeCompare(b.title)),
    [tracks]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
      <View className="px-4 pt-4 pb-2">
        <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: '700' }}>
          Library
        </Text>
      </View>

      {/* Segmented control */}
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: 16,
          marginVertical: 12,
          backgroundColor: COLORS.surface,
          borderRadius: 10,
          padding: 4
        }}
      >
        {SECTIONS.map(s => {
          const active = s.id === section;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSection(s.id)}
              style={{
                flex: 1,
                paddingVertical: 8,
                alignItems: 'center',
                borderRadius: 8,
                backgroundColor: active ? accentHex : 'transparent'
              }}
            >
              <Text
                style={{
                  color: active ? '#fff' : COLORS.textMuted,
                  fontWeight: active ? '600' : '500',
                  fontSize: 12
                }}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {section === 'songs' && (
        <FlatList
          data={sortedTracks}
          keyExtractor={t => t.id}
          contentContainerStyle={{ paddingBottom: 180 }}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              index={index}
              isActive={current?.id === item.id}
              showAlbum
              onPress={() => void playTrackAt(sortedTracks, index)}
              onLongPress={(t) => openAddToPlaylist(t.id)}
            />
          )}
          ListEmptyComponent={
            <Text style={{ color: COLORS.textMuted, padding: 24, textAlign: 'center' }}>
              No tracks yet — scan your device on the Settings screen.
            </Text>
          }
        />
      )}

      {section === 'albums' && (
        <FlatList
          data={albums}
          keyExtractor={a => a.id}
          numColumns={2}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 180, gap: 16 }}
          columnWrapperStyle={{ gap: 12, justifyContent: 'space-between' }}
          renderItem={({ item }) => (
            <AlbumCard
              album={item}
              size={(360 - 36) / 2}
              onPress={(a) => router.push(`/album/${encodeURIComponent(a.id)}`)}
            />
          )}
        />
      )}

      {section === 'artists' && (
        <FlatList
          data={artists}
          keyExtractor={a => a.id}
          contentContainerStyle={{ paddingBottom: 180 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/artist/${encodeURIComponent(item.id)}`)}
              android_ripple={{ color: COLORS.surfaceHi }}
              style={{
                paddingHorizontal: 16, paddingVertical: 14,
                borderBottomColor: COLORS.border, borderBottomWidth: 0.5
              }}
            >
              <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '500' }}>
                {item.name}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                {pluralize(item.albumCount, 'album')} · {pluralize(item.trackCount, 'track')}
              </Text>
            </Pressable>
          )}
        />
      )}

      {section === 'playlists' && (
        <FlatList
          data={playlists}
          keyExtractor={p => p.id}
          contentContainerStyle={{ paddingBottom: 180 }}
          ListHeaderComponent={
            <Pressable
              onPress={() => openAddToPlaylist()}
              android_ripple={{ color: COLORS.surfaceHi }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 16, paddingVertical: 14,
                borderBottomColor: COLORS.border, borderBottomWidth: 0.5
              }}
            >
              <View style={{
                width: 40, height: 40, borderRadius: 8,
                backgroundColor: accentHex,
                alignItems: 'center', justifyContent: 'center'
              }}>
                <Plus size={20} color="#fff" />
              </View>
              <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '600' }}>
                New Playlist
              </Text>
            </Pressable>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/playlist/${encodeURIComponent(item.id)}`)}
              android_ripple={{ color: COLORS.surfaceHi }}
              style={{
                paddingHorizontal: 16, paddingVertical: 14,
                borderBottomColor: COLORS.border, borderBottomWidth: 0.5
              }}
            >
              <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '500' }}>
                {item.name}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                {pluralize(item.trackIds.length, 'track')}
                {item.kind === 'liked' ? ' · auto-managed' : ''}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
