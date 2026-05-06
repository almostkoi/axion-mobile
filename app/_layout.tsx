import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import '../global.css';

import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import TrackPlayer from 'react-native-track-player';

import { useLibrary } from '../hooks/useLibrary';
import { usePlayerSync } from '../hooks/usePlayback';
import { setupPlayer, PlaybackService } from '../lib/audioService';
import { COLORS } from '../lib/theme';

// Register the long-running headless playback service. Must run BEFORE the
// JS app component mounts so the service is available when Android's
// MediaSession asks for it.
TrackPlayer.registerPlaybackService(() => PlaybackService);

void SplashScreen.preventAutoHideAsync();

export default function RootLayout(): React.ReactElement {
  // Hydrate library + audio engine once.
  useLibrary();
  usePlayerSync();

  useEffect(() => {
    setupPlayer()
      .catch(err => console.warn('[axion] track-player setup failed', err))
      .finally(() => { void SplashScreen.hideAsync(); });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.bg }
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="player" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="queue" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="add-to-playlist" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="album/[id]" />
          <Stack.Screen name="artist/[id]" />
          <Stack.Screen name="playlist/[id]" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
