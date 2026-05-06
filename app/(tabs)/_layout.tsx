import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Home, Library, Search, Settings as SettingsIcon } from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { ACCENT_HEX, COLORS } from '../../lib/theme';
import { MiniPlayer } from '../../components/MiniPlayer';

export default function TabsLayout(): React.ReactElement {
  const accent = useStore(s => s.settings.accentColor);
  const accentHex = ACCENT_HEX[accent];

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: accentHex,
          tabBarInactiveTintColor: COLORS.textMuted,
          tabBarStyle: {
            backgroundColor: COLORS.bgElev,
            borderTopColor: COLORS.border,
            borderTopWidth: 1,
            height: 64,
            paddingTop: 8,
            paddingBottom: 8
          },
          tabBarLabelStyle: { fontSize: 11, marginTop: 2 }
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Home size={size - 2} color={color} />
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Library',
            tabBarIcon: ({ color, size }) => <Library size={size - 2} color={color} />
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: ({ color, size }) => <Search size={size - 2} color={color} />
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => <SettingsIcon size={size - 2} color={color} />
          }}
        />
      </Tabs>
      <MiniPlayer />
    </View>
  );
}
