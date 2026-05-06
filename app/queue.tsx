import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackPlayer from 'react-native-track-player';
import { useStore } from '../store/useStore';
import { COLORS } from '../lib/theme';
import { TrackRow } from '../components/TrackRow';

export default function QueueScreen(): React.ReactElement {
  const queue = useStore(s => s.queue);
  const currentIndex = useStore(s => s.currentIndex);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ChevronDown size={26} color={COLORS.text} />
        </Pressable>
        <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '600' }}>
          Queue
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={queue}
        keyExtractor={(t, i) => `${t.id}-${i}`}
        contentContainerStyle={{ paddingBottom: 80 }}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            isActive={index === currentIndex}
            onPress={() => { void TrackPlayer.skip(index); }}
          />
        )}
        ListEmptyComponent={
          <Text style={{ color: COLORS.textMuted, padding: 24, textAlign: 'center' }}>
            The queue is empty.
          </Text>
        }
      />
    </SafeAreaView>
  );
}
