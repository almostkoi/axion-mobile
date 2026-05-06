import React, { useMemo } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStore, selectCurrentTrack } from '../../store/useStore';
import { COLORS } from '../../lib/theme';
import { TrackRow } from '../../components/TrackRow';
import { playTrackAt } from '../../hooks/usePlayback';

export default function SearchScreen(): React.ReactElement {
  const query = useStore(s => s.searchQuery);
  const setQuery = useStore(s => s.setSearchQuery);
  const tracks = useStore(s => s.tracks);
  const albums = useStore(s => s.albums);
  const artists = useStore(s => s.artists);
  const current = useStore(selectCurrentTrack);

  const q = query.trim().toLowerCase();
  const matchingTracks = useMemo(() => {
    if (!q) return [];
    return tracks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [tracks, q]);
  const matchingAlbums = useMemo(() => {
    if (!q) return [];
    return albums.filter(a =>
      a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [albums, q]);
  const matchingArtists = useMemo(() => {
    if (!q) return [];
    return artists.filter(a => a.name.toLowerCase().includes(q)).slice(0, 10);
  }, [artists, q]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginHorizontal: 16,
          marginTop: 12,
          marginBottom: 8,
          backgroundColor: COLORS.surface,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 4
        }}
      >
        <Search size={18} color={COLORS.textMuted} />
        <TextInput
          autoFocus={false}
          value={query}
          onChangeText={setQuery}
          placeholder="Search songs, albums, artists"
          placeholderTextColor={COLORS.textDim}
          style={{
            flex: 1,
            color: COLORS.text,
            paddingVertical: 8,
            paddingHorizontal: 8,
            fontSize: 15
          }}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <X size={16} color={COLORS.textMuted} />
          </Pressable>
        )}
      </View>

      <FlatList
        ListHeaderComponent={
          <View>
            {matchingArtists.length > 0 && (
              <View>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', paddingHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
                  Artists
                </Text>
                {matchingArtists.map(a => (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push(`/artist/${encodeURIComponent(a.id)}`)}
                    style={{ paddingHorizontal: 16, paddingVertical: 10 }}
                    android_ripple={{ color: COLORS.surfaceHi }}
                  >
                    <Text style={{ color: COLORS.text, fontSize: 14 }}>{a.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {matchingAlbums.length > 0 && (
              <View>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', paddingHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
                  Albums
                </Text>
                {matchingAlbums.map(a => (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push(`/album/${encodeURIComponent(a.id)}`)}
                    style={{ paddingHorizontal: 16, paddingVertical: 10 }}
                    android_ripple={{ color: COLORS.surfaceHi }}
                  >
                    <Text style={{ color: COLORS.text, fontSize: 14 }}>{a.name}</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{a.artist}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {q && matchingTracks.length > 0 && (
              <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', paddingHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
                Songs
              </Text>
            )}
          </View>
        }
        data={matchingTracks}
        keyExtractor={t => t.id}
        contentContainerStyle={{ paddingBottom: 180 }}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            isActive={current?.id === item.id}
            showAlbum
            onPress={() => void playTrackAt(matchingTracks, index)}
          />
        )}
        ListEmptyComponent={
          q ? (
            <Text style={{ color: COLORS.textMuted, padding: 24, textAlign: 'center' }}>
              No matches.
            </Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
