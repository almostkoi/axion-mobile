// Import tab — paste a URL from YouTube / SoundCloud / Spotify / Last.fm /
// direct file, watch it download into the local library.

import React, { useEffect, useState } from 'react';
import {
  Alert, FlatList, KeyboardAvoidingView, Platform,
  Pressable, Text, TextInput, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  CheckCircle2, Circle, ClipboardPaste, Download, Music2, Trash2, X, AlertCircle
} from 'lucide-react-native';

import {
  startImport, cancelTask, listTasks, onImportProgress,
  removeTask, removeTasks, clearFinished, clearAll,
  classifyUrl, sourceLabel
} from '../../lib/import';
import type { ImportTaskProgress } from '../../lib/import';
import { useStore } from '../../store/useStore';
import { ACCENT_HEX, COLORS } from '../../lib/theme';
import { formatBytes } from '../../lib/format';

export default function ImportsScreen(): React.ReactElement {
  const accent = useStore(s => s.settings.accentColor);
  const accentHex = ACCENT_HEX[accent];

  const [url, setUrl] = useState('');
  const [tasks, setTasks] = useState<ImportTaskProgress[]>(() => listTasks());

  // Subscribe to live progress.
  useEffect(() => {
    const unsub = onImportProgress(() => { setTasks(listTasks()); });
    return unsub;
  }, []);

  // Multi-select for bulk delete of import-history rows. The job list is
  // in-memory and cheap, so we just toggle ids in a Set.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const exitSelectMode = (): void => { setSelectMode(false); setSelectedIds(new Set()); };
  const toggleSelect = (id: string): void => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = (): void => {
    if (selectedIds.size === tasks.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(tasks.map(t => t.taskId)));
  };
  const deleteSelected = (): void => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    // Cancel any still-running ones first so their fetches abort, then drop
    // them all from the registry in one shot.
    for (const id of ids) {
      const t = tasks.find(x => x.taskId === id);
      if (t && (t.status === 'queued' || t.status === 'resolving' || t.status === 'downloading')) {
        cancelTask(id);
      }
    }
    removeTasks(ids);
    setTasks(listTasks());
    exitSelectMode();
  };

  const confirmClearAll = (): void => {
    if (tasks.length === 0) return;
    Alert.alert(
      'Clear import history?',
      'This removes the list of downloaded songs from the Jobs panel. The actual audio files stay in your library.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => { clearAll(); setTasks(listTasks()); exitSelectMode(); }
        }
      ]
    );
  };

  const handlePaste = async (): Promise<void> => {
    const txt = await Clipboard.getStringAsync();
    if (txt) setUrl(txt.trim());
  };

  const handleStart = async (): Promise<void> => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (classifyUrl(trimmed) === 'generic') {
      Alert.alert(
        'Unknown URL',
        'Axion will treat this as a YouTube search query. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => {
              void startImport({ url: trimmed }).catch(err => Alert.alert('Import failed', String(err)));
              setUrl('');
            }
          }
        ]
      );
      return;
    }
    try {
      await startImport({ url: trimmed });
      setUrl('');
    } catch (err) {
      Alert.alert('Import failed', String(err));
    }
  };

  const detectedSource = url.trim() ? sourceLabel(classifyUrl(url.trim())) : null;
  const hasFinished = tasks.some(t => t.status === 'done' || t.status === 'error' || t.status === 'cancelled');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View className="px-4 pt-4 pb-2">
          <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: '700' }}>Import</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>
            Paste a URL from YouTube, SoundCloud, Spotify, or Last.fm.
          </Text>
        </View>

        {/* URL input + paste button */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          marginHorizontal: 16, marginTop: 8,
          backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 12
        }}>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://..."
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => void handleStart()}
            style={{ flex: 1, color: COLORS.text, paddingVertical: 12, fontSize: 14 }}
          />
          {url.length > 0 ? (
            <Pressable onPress={() => setUrl('')} hitSlop={8}>
              <X size={18} color={COLORS.textMuted} />
            </Pressable>
          ) : (
            <Pressable onPress={() => void handlePaste()} hitSlop={8}>
              <ClipboardPaste size={18} color={COLORS.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Detected source + go button */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          marginHorizontal: 16, marginTop: 10
        }}>
          <Text style={{ color: COLORS.textDim, fontSize: 12 }}>
            {detectedSource ? `Detected: ${detectedSource}` : ' '}
          </Text>
          <Pressable
            onPress={() => void handleStart()}
            disabled={!url.trim()}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22,
              backgroundColor: url.trim() ? accentHex : COLORS.surfaceHi,
              opacity: url.trim() ? 1 : 0.6
            }}
          >
            <Download size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Import</Text>
          </Pressable>
        </View>

        {/* Quick-info notes */}
        <Text style={{
          color: COLORS.textDim, fontSize: 11,
          paddingHorizontal: 16, paddingVertical: 12, lineHeight: 16
        }}>
          Spotify and Last.fm URLs are resolved to a YouTube match automatically.
          Files land in the app's private storage and appear in your Library
          immediately. No transcoding — kept in the source's native container.
        </Text>

        {/* Task list header — flips into a select-mode bar when active */}
        {selectMode ? (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 12, paddingVertical: 8,
            backgroundColor: COLORS.surface
          }}>
            <Pressable onPress={exitSelectMode} hitSlop={10} style={{ padding: 4 }}>
              <X size={20} color={COLORS.text} />
            </Pressable>
            <Text style={{ flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '600' }}>
              {selectedIds.size} selected
            </Text>
            <Pressable
              onPress={selectAll}
              hitSlop={8}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Text style={{ color: accentHex, fontSize: 12, fontWeight: '600' }}>
                {selectedIds.size === tasks.length && tasks.length > 0 ? 'Deselect all' : 'Select all'}
              </Text>
            </Pressable>
            <Pressable
              onPress={deleteSelected}
              hitSlop={8}
              disabled={selectedIds.size === 0}
              style={{ padding: 6, opacity: selectedIds.size === 0 ? 0.4 : 1 }}
            >
              <Trash2 size={18} color="#ef4444" />
            </Pressable>
          </View>
        ) : (
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6
          }}>
            <Text style={{
              color: COLORS.textMuted, fontSize: 11, fontWeight: '600',
              letterSpacing: 0.5
            }}>
              JOBS
            </Text>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              {tasks.length > 0 && (
                <Pressable
                  onPress={() => { setSelectMode(true); setSelectedIds(new Set()); }}
                  hitSlop={8}
                >
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Select</Text>
                </Pressable>
              )}
              {hasFinished && (
                <Pressable
                  onPress={() => { clearFinished(); setTasks(listTasks()); }}
                  hitSlop={8}
                >
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Clear finished</Text>
                </Pressable>
              )}
              {tasks.length > 0 && (
                <Pressable onPress={confirmClearAll} hitSlop={8}>
                  <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>
                    Clear all
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        <FlatList
          data={tasks}
          keyExtractor={t => t.taskId}
          contentContainerStyle={{ paddingBottom: 180 }}
          extraData={selectMode ? selectedIds : null}
          renderItem={({ item }) => (
            <TaskRow
              task={item}
              accentHex={accentHex}
              selectMode={selectMode}
              selected={selectedIds.has(item.taskId)}
              onToggleSelect={() => toggleSelect(item.taskId)}
              onLongPress={() => {
                if (!selectMode) {
                  setSelectMode(true);
                  setSelectedIds(new Set([item.taskId]));
                }
              }}
              onRefresh={() => setTasks(listTasks())}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 32 }}>
              <Music2 size={36} color={COLORS.textDim} />
              <Text style={{ color: COLORS.textDim, fontSize: 13, marginTop: 12 }}>
                No imports yet.
              </Text>
            </View>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface TaskRowProps {
  task: ImportTaskProgress;
  accentHex: string;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onLongPress: () => void;
  /** Refresh the imports list after a single-row delete (registry is silent on remove). */
  onRefresh: () => void;
}

function TaskRow({
  task, accentHex, selectMode, selected, onToggleSelect, onLongPress, onRefresh
}: TaskRowProps): React.ReactElement {
  const isActive = task.status === 'queued' || task.status === 'resolving' || task.status === 'downloading';
  const pct = task.progress >= 0 ? Math.min(1, Math.max(0, task.progress)) : 0;

  return (
    <Pressable
      onPress={selectMode ? onToggleSelect : undefined}
      onLongPress={onLongPress}
      android_ripple={selectMode ? { color: COLORS.surfaceHi } : undefined}
      style={{
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomColor: COLORS.border, borderBottomWidth: 0.5
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {selectMode && (
          <Pressable onPress={onToggleSelect} hitSlop={6} style={{ paddingRight: 4 }}>
            {selected
              ? <CheckCircle2 size={20} color={accentHex} />
              : <Circle size={20} color={COLORS.textDim} />}
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: 14, fontWeight: '500' }}>
            {task.title || task.url}
          </Text>
          <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
            {sourceLabel(task.source)} · {statusLabel(task)}
          </Text>
        </View>
        {!selectMode && (isActive ? (
          <Pressable onPress={() => cancelTask(task.taskId)} hitSlop={8}>
            <X size={18} color={COLORS.textMuted} />
          </Pressable>
        ) : (
          <Pressable onPress={() => { removeTask(task.taskId); onRefresh(); }} hitSlop={8}>
            <Trash2 size={16} color={COLORS.textDim} />
          </Pressable>
        ))}
      </View>

      {/* Progress bar */}
      {isActive && (
        <View style={{
          height: 3, marginTop: 10, borderRadius: 2,
          backgroundColor: COLORS.surface, overflow: 'hidden'
        }}>
          <View style={{
            width: `${pct * 100}%`, height: '100%',
            backgroundColor: accentHex
          }} />
        </View>
      )}

      {/* Done badge / error message */}
      {task.status === 'error' && task.errorMessage && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 }}>
          <AlertCircle size={14} color="#ef4444" style={{ marginTop: 2 }} />
          <Text style={{ color: '#ef4444', fontSize: 12, flex: 1 }} numberOfLines={8}>
            {task.errorMessage}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function statusLabel(t: ImportTaskProgress): string {
  switch (t.status) {
    case 'queued':      return 'Queued';
    case 'resolving':   return 'Resolving';
    case 'downloading': {
      if (t.totalBytes > 0) {
        return `${formatBytes(t.downloadedBytes)} / ${formatBytes(t.totalBytes)}`;
      }
      return `${formatBytes(t.downloadedBytes)} downloaded`;
    }
    case 'tagging':     return 'Tagging';
    case 'done':        return 'Done · added to library';
    case 'error':       return 'Failed';
    case 'cancelled':   return 'Cancelled';
    default:            return t.status;
  }
}
