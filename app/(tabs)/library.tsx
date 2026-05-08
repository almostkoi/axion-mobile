import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Circle, Plus, Trash2, X } from 'lucide-react-native';
import { useStore, selectCurrentTrack } from '../../store/useStore';
import { ACCENT_HEX, COLORS } from '../../lib/theme';
import { TrackRow } from '../../components/TrackRow';
import { AlbumCard } from '../../components/AlbumCard';
import { playTrackAt } from '../../hooks/usePlayback';
import { pluralize } from '../../lib/format';
import type { Track, TrackId, Playlist, PlaylistId } from '../../types/domain';

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
  const deleteTracksAction = useStore(s => s.deleteTracksAction);
  const deletePlaylistsAction = useStore(s => s.deletePlaylistsAction);

  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => a.title.localeCompare(b.title)),
    [tracks]
  );

  // Select mode: shared by Songs and Playlists tabs. The set is keyed by
  // the row id (TrackId for songs, PlaylistId for playlists). When the
  // user switches sections we drop the selection so cross-section state
  // can't leak (e.g. selecting playlists, switching to songs, deleting).
  const [selectMode, setSelectMode] = useState<null | 'songs' | 'playlists'>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const exitSelectMode = (): void => {
    setSelectMode(null);
    setSelectedIds(new Set());
  };
  const switchSection = (next: Section): void => {
    if (selectMode) exitSelectMode();
    setSection(next);
  };

  const toggleSelect = (id: string): void => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const songsSelectAll = (): void => {
    if (selectedIds.size === sortedTracks.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(sortedTracks.map(t => t.id)));
  };
  const userPlaylists = useMemo(
    () => playlists.filter((p): p is Playlist => p.kind === 'user'),
    [playlists]
  );
  const playlistsSelectAll = (): void => {
    if (selectedIds.size === userPlaylists.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(userPlaylists.map(p => p.id)));
  };

  const onTrackLongPress = (t: Track): void => {
    if (selectMode === 'songs') {
      toggleSelect(t.id);
      return;
    }
    Alert.alert(
      t.title || 'Track',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add to playlist', onPress: () => openAddToPlaylist(t.id) },
        {
          text: 'Select multiple',
          onPress: () => { setSelectMode('songs'); setSelectedIds(new Set([t.id])); }
        },
        {
          text: 'Remove from library',
          style: 'destructive',
          onPress: () => { void deleteTracksAction([t.id]); }
        },
        {
          text: 'Delete file from device',
          style: 'destructive',
          onPress: () => { void deleteTracksAction([t.id], { deleteFiles: true }); }
        }
      ]
    );
  };

  const onPlaylistLongPress = (pl: Playlist): void => {
    if (pl.kind !== 'user') return; // 'liked' is auto-managed
    if (selectMode === 'playlists') {
      toggleSelect(pl.id);
      return;
    }
    Alert.alert(
      pl.name,
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open', onPress: () => router.push(`/playlist/${encodeURIComponent(pl.id)}`) },
        {
          text: 'Select multiple',
          onPress: () => { setSelectMode('playlists'); setSelectedIds(new Set([pl.id])); }
        },
        {
          text: 'Delete playlist',
          style: 'destructive',
          onPress: () => { void deletePlaylistsAction([pl.id]); }
        }
      ]
    );
  };

  const confirmBulkDelete = (): void => {
    if (selectedIds.size === 0) return;
    if (selectMode === 'songs') {
      const ids = [...selectedIds] as TrackId[];
      Alert.alert(
        `Delete ${ids.length} ${pluralize(ids.length, 'song')}?`,
        'You can keep the audio files on the device, or delete them too.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove from library',
            style: 'destructive',
            onPress: () => { void deleteTracksAction(ids).then(exitSelectMode); }
          },
          {
            text: 'Delete files',
            style: 'destructive',
            onPress: () => { void deleteTracksAction(ids, { deleteFiles: true }).then(exitSelectMode); }
          }
        ]
      );
    } else if (selectMode === 'playlists') {
      const ids = [...selectedIds] as PlaylistId[];
      Alert.alert(
        `Delete ${ids.length} ${pluralize(ids.length, 'playlist')}?`,
        'The tracks themselves stay in your library.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => { void deletePlaylistsAction(ids).then(exitSelectMode); }
          }
        ]
      );
    }
  };

  const inSongsSelect = selectMode === 'songs' && section === 'songs';
  const inPlaylistsSelect = selectMode === 'playlists' && section === 'playlists';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
      {selectMode ? (
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 12, paddingVertical: 10,
            backgroundColor: COLORS.surface
          }}
        >
          <Pressable onPress={exitSelectMode} hitSlop={10} style={{ padding: 4 }}>
            <X size={22} color={COLORS.text} />
          </Pressable>
          <Text style={{ flex: 1, color: COLORS.text, fontSize: 16, fontWeight: '600' }}>
            {selectedIds.size} selected
          </Text>
          <Pressable
            onPress={selectMode === 'songs' ? songsSelectAll : playlistsSelectAll}
            hitSlop={8}
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <Text style={{ color: accentHex, fontSize: 13, fontWeight: '600' }}>
              {selectedIds.size === (selectMode === 'songs' ? sortedTracks.length : userPlaylists.length) && selectedIds.size > 0
                ? 'Deselect all'
                : 'Select all'}
            </Text>
          </Pressable>
          <Pressable
            onPress={confirmBulkDelete}
            hitSlop={8}
            disabled={selectedIds.size === 0}
            style={{ padding: 6, opacity: selectedIds.size === 0 ? 0.4 : 1 }}
          >
            <Trash2 size={20} color="#ef4444" />
          </Pressable>
        </View>
      ) : (
        <View className="px-4 pt-4 pb-2">
          <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: '700' }}>
            Library
          </Text>
        </View>
      )}

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
              onPress={() => switchSection(s.id)}
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
          extraData={inSongsSelect ? selectedIds : null}
          renderItem={({ item, index }) => {
            const checked = inSongsSelect && selectedIds.has(item.id);
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {inSongsSelect && (
                  <Pressable
                    onPress={() => toggleSelect(item.id)}
                    hitSlop={8}
                    style={{ paddingLeft: 14, paddingRight: 4 }}
                  >
                    {checked
                      ? <CheckCircle2 size={22} color={accentHex} />
                      : <Circle size={22} color={COLORS.textDim} />}
                  </Pressable>
                )}
                <View style={{ flex: 1 }}>
                  <TrackRow
                    track={item}
                    index={index}
                    isActive={current?.id === item.id}
                    showAlbum
                    onPress={() => {
                      if (inSongsSelect) toggleSelect(item.id);
                      else void playTrackAt(sortedTracks, index);
                    }}
                    onLongPress={onTrackLongPress}
                  />
                </View>
              </View>
            );
          }}
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
          extraData={inPlaylistsSelect ? selectedIds : null}
          ListHeaderComponent={
            inPlaylistsSelect ? null : (
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
            )
          }
          renderItem={({ item }) => {
            const isUser = item.kind === 'user';
            const checked = inPlaylistsSelect && selectedIds.has(item.id);
            return (
              <Pressable
                onPress={() => {
                  if (inPlaylistsSelect) {
                    if (isUser) toggleSelect(item.id);
                    return;
                  }
                  router.push(`/playlist/${encodeURIComponent(item.id)}`);
                }}
                onLongPress={() => onPlaylistLongPress(item)}
                android_ripple={{ color: COLORS.surfaceHi }}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomColor: COLORS.border, borderBottomWidth: 0.5,
                  opacity: inPlaylistsSelect && !isUser ? 0.4 : 1
                }}
              >
                {inPlaylistsSelect && (
                  <View style={{ marginRight: 12 }}>
                    {isUser
                      ? (checked
                          ? <CheckCircle2 size={22} color={accentHex} />
                          : <Circle size={22} color={COLORS.textDim} />)
                      : <Circle size={22} color={COLORS.surfaceHi} />}
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '500' }}>
                    {item.name}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {pluralize(item.trackIds.length, 'track')}
                    {item.kind === 'liked' ? ' · auto-managed' : ''}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
