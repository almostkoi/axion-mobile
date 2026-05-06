import React, { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { ChevronLeft, Mic2 } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, selectCurrentTrack } from '../../store/useStore';
import { COLORS } from '../../lib/theme';
import { AlbumCard } from '../../components/AlbumCard';
import { TrackRow } from '../../components/TrackRow';
import { playTrackAt } from '../../hooks/usePlayback';
import { pluralize } from '../../lib/format';

export default function ArtistScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const artistName = decodeURIComponent(id ?? '');
  const tracks = useStore(s => s.tracks);
  const albums = useStore(s => s.albums);
  const current = useStore(selectCurrentTrack);

  const artistTracks = useMemo(
    () => tracks.filter(t => (t.albumArtist || t.artist) === artistName),
    [tracks, artistName]
  );
  const artistAlbums = useMemo(
    () => albums.filter(a => a.artist === artistName),
    [albums, artistName]
  );
  const topTracks = useMemo(
    () => [...artistTracks].sort((a, b) => b.playCount - a.playCount).slice(0, 5),
    [artistTracks]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
      <Pressable onPress={() => router.back()} className="p-3" hitSlop={8}>
        <ChevronLeft size={26} color={COLORS.text} />
      </Pressable>

      <FlatList
        data={artistAlbums}
        keyExtractor={a => a.id}
        numColumns={2}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 200, gap: 16 }}
        columnWrapperStyle={{ gap: 12, justifyContent: 'space-between' }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 4 }}>
            <View className="items-center pt-4 pb-6">
              <View
                style={{
                  width: 120, height: 120, borderRadius: 60,
                  backgroundColor: COLORS.surface,
                  alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Mic2 size={48} color={COLORS.textMuted} />
              </View>
              <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: '700', marginTop: 12 }}>
                {artistName}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
                {pluralize(artistAlbums.length, 'album')} · {pluralize(artistTracks.length, 'track')}
              </Text>
            </View>

            {topTracks.length > 0 && (
              <View>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', paddingHorizontal: 12, marginBottom: 8 }}>
                  Top tracks
                </Text>
                {topTracks.map((t, i) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    index={i}
                    isActive={current?.id === t.id}
                    showAlbum
                    onPress={() => void playTrackAt(topTracks, i)}
                  />
                ))}
              </View>
            )}

            {artistAlbums.length > 0 && (
              <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', paddingHorizontal: 12, marginTop: 24, marginBottom: 12 }}>
                Albums
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <AlbumCard
            album={item}
            size={(360 - 36) / 2}
            onPress={(a) => router.push(`/album/${encodeURIComponent(a.id)}`)}
          />
        )}
      />
    </SafeAreaView>
  );
}
