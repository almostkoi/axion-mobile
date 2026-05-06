import React, { useMemo } from 'react';
import { ScrollView, Text, View, FlatList } from 'react-native';
import { Music2 } from 'lucide-react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, selectCurrentTrack } from '../../store/useStore';
import { COLORS } from '../../lib/theme';
import { SectionHeader } from '../../components/SectionHeader';
import { TrackRow } from '../../components/TrackRow';
import { AlbumCard } from '../../components/AlbumCard';
import { EmptyState } from '../../components/EmptyState';
import { useLibrary } from '../../hooks/useLibrary';
import { playTrackAt } from '../../hooks/usePlayback';
import type { Track, Album } from '../../types/domain';

export default function HomeScreen(): React.ReactElement {
  const tracks = useStore(s => s.tracks);
  const albums = useStore(s => s.albums);
  const current = useStore(selectCurrentTrack);
  const { rescan } = useLibrary();

  const recentlyAdded = useMemo<Track[]>(() => {
    return [...tracks].sort((a, b) => b.dateAdded - a.dateAdded).slice(0, 8);
  }, [tracks]);

  const recentAlbums = useMemo<Album[]>(() => {
    return albums.slice(0, 10);
  }, [albums]);

  if (tracks.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <EmptyState
          Icon={Music2}
          title="Your library is empty"
          message="Grant permission to scan music on your device. Axion only reads files — nothing is uploaded."
          cta={{ label: 'Scan device', onPress: () => void rescan() }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 200 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4 pt-4 pb-2">
          <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: '700' }}>
            Axion
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>
            {tracks.length} tracks · {albums.length} albums
          </Text>
        </View>

        <SectionHeader
          title="Recently added"
          onMore={() => router.push('/(tabs)/library')}
        />
        {recentlyAdded.map((t, i) => (
          <TrackRow
            key={t.id}
            track={t}
            isActive={current?.id === t.id}
            onPress={() => void playTrackAt(recentlyAdded, i)}
          />
        ))}

        <SectionHeader
          title="Albums"
          onMore={() => router.push('/(tabs)/library?section=albums')}
        />
        <FlatList
          horizontal
          data={recentAlbums}
          keyExtractor={a => a.id}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <AlbumCard
              album={item}
              onPress={(a) => router.push(`/album/${encodeURIComponent(a.id)}`)}
            />
          )}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
