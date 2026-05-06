// Modal: add a track to an existing playlist OR create a new one.
//
// Routes:
//   /add-to-playlist                 → just create a new (empty) playlist
//   /add-to-playlist?trackId=<id>    → tap a playlist to add the track,
//                                       OR type a name and create-and-add
//
// Used from track long-press, the Library "+ New Playlist" button, and
// the Playlist detail "Add to playlist" header (when trackId omitted).

import React, { useState } from 'react';
import {
  Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ListMusic, Plus, X } from 'lucide-react-native';
import { useStore } from '../store/useStore';
import { ACCENT_HEX, COLORS } from '../lib/theme';
import { pluralize } from '../lib/format';
import type { Playlist } from '../types/domain';

export default function AddToPlaylistModal(): React.ReactElement {
  const { trackId } = useLocalSearchParams<{ trackId?: string }>();
  const playlists = useStore(s => s.playlists);
  const accent = useStore(s => s.settings.accentColor);
  const accentHex = ACCENT_HEX[accent];
  const createPlaylistAction = useStore(s => s.createPlaylistAction);
  const addTrackToPlaylistAction = useStore(s => s.addTrackToPlaylistAction);

  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  // Hide the auto-managed "Liked" playlist when picking targets — handled via the heart toggle.
  const targets = playlists.filter(p => p.kind === 'user');

  const handlePick = async (pl: Playlist): Promise<void> => {
    if (busy) return;
    if (!trackId) {
      router.back();
      return;
    }
    if (pl.trackIds.includes(trackId)) {
      Alert.alert('Already in playlist', `"${pl.name}" already contains this track.`);
      return;
    }
    setBusy(true);
    try {
      await addTrackToPlaylistAction(pl.id, trackId);
      router.back();
    } catch (err) {
      Alert.alert('Could not add', String(err));
      setBusy(false);
    }
  };

  const handleCreate = async (): Promise<void> => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const created = await createPlaylistAction(name);
      if (trackId) await addTrackToPlaylistAction(created.id, trackId);
      router.back();
    } catch (err) {
      Alert.alert('Could not create playlist', String(err));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 14
        }}>
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700' }}>
            {trackId ? 'Add to Playlist' : 'New Playlist'}
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <X size={22} color={COLORS.textMuted} />
          </Pressable>
        </View>

        {/* Create-new row (always visible) */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          marginHorizontal: 16, marginBottom: 12,
          backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 12
        }}>
          <Plus size={18} color={COLORS.textDim} />
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="New playlist name"
            placeholderTextColor={COLORS.textDim}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            autoFocus={!trackId}
            style={{
              flex: 1, color: COLORS.text, paddingVertical: 12, fontSize: 14
            }}
          />
          <Pressable
            onPress={handleCreate}
            disabled={!newName.trim() || busy}
            hitSlop={8}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
              backgroundColor: newName.trim() ? accentHex : COLORS.surfaceHi,
              opacity: newName.trim() ? 1 : 0.6
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
              {trackId ? 'Create & add' : 'Create'}
            </Text>
          </Pressable>
        </View>

        {/* Existing playlists list — only relevant when adding a track */}
        {trackId && (
          <>
            {targets.length > 0 && (
              <Text style={{
                color: COLORS.textDim, fontSize: 11, fontWeight: '600',
                letterSpacing: 0.5, paddingHorizontal: 16, paddingVertical: 6
              }}>
                YOUR PLAYLISTS
              </Text>
            )}
            <FlatList
              data={targets}
              keyExtractor={p => p.id}
              renderItem={({ item }) => {
                const has = trackId ? item.trackIds.includes(trackId) : false;
                return (
                  <Pressable
                    onPress={() => void handlePick(item)}
                    android_ripple={{ color: COLORS.surfaceHi }}
                    disabled={busy}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 16, paddingVertical: 14,
                      borderBottomColor: COLORS.border, borderBottomWidth: 0.5
                    }}
                  >
                    <View style={{
                      width: 40, height: 40, borderRadius: 8,
                      backgroundColor: COLORS.surface,
                      alignItems: 'center', justifyContent: 'center', marginRight: 12
                    }}>
                      <ListMusic size={18} color={COLORS.textDim} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                        {pluralize(item.trackIds.length, 'track')}
                      </Text>
                    </View>
                    {has && <Check size={18} color={accentHex} />}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={{
                  color: COLORS.textMuted, padding: 24, textAlign: 'center', fontSize: 13
                }}>
                  No playlists yet — type a name above to make one.
                </Text>
              }
            />
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
