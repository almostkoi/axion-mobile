import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RotateCw } from 'lucide-react-native';
import * as Application from 'expo-constants';
import { useStore } from '../../store/useStore';
import { useLibrary } from '../../hooks/useLibrary';
import { ACCENT_HEX, COLORS } from '../../lib/theme';
import type { AccentColor } from '../../types/domain';

const ACCENTS: AccentColor[] = ['red', 'blue', 'green', 'purple', 'orange'];

export default function SettingsScreen(): React.ReactElement {
  const settings = useStore(s => s.settings);
  const setAccent = useStore(s => s.setAccentColor);
  const scan = useStore(s => s.scanProgress);
  const { rescan } = useLibrary();
  const [rescanning, setRescanning] = useState(false);

  useEffect(() => {
    if (scan.phase === 'idle' || scan.phase === 'error') setRescanning(false);
  }, [scan.phase]);

  const onRescan = (): void => {
    setRescanning(true);
    void rescan();
  };

  const lastScanned = settings.lastScannedAt
    ? new Date(settings.lastScannedAt).toLocaleString()
    : 'Never';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 180 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: '700' }}>
            Settings
          </Text>
        </View>

        {/* Accent */}
        <SectionLabel>Appearance · Accent</SectionLabel>
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 14
          }}
        >
          {ACCENTS.map(c => {
            const active = c === settings.accentColor;
            return (
              <Pressable
                key={c}
                onPress={() => setAccent(c)}
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: ACCENT_HEX[c],
                  borderWidth: active ? 3 : 0,
                  borderColor: COLORS.text
                }}
              />
            );
          })}
        </View>

        {/* Library */}
        <SectionLabel>Library</SectionLabel>
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 12 }}>
            Last scan: {lastScanned}
          </Text>
          <Pressable
            disabled={rescanning}
            onPress={onRescan}
            style={{
              backgroundColor: rescanning ? COLORS.surface : ACCENT_HEX[settings.accentColor],
              paddingHorizontal: 16, paddingVertical: 12,
              borderRadius: 10,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 8,
              opacity: rescanning ? 0.6 : 1
            }}
            android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
          >
            <RotateCw size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {rescanning ? 'Scanning…' : 'Scan device'}
            </Text>
          </Pressable>
          {scan.phase === 'parsing' && (
            <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 8 }}>
              {scan.current} / {scan.total} · {scan.currentFile ?? ''}
            </Text>
          )}
          {scan.phase === 'error' && scan.errorMessage && (
            <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>
              {scan.errorMessage}
            </Text>
          )}
        </View>

        <SectionLabel>About</SectionLabel>
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
            Axion Mobile {Application.default?.expoConfig?.version ?? ''}
          </Text>
          <Text style={{ color: COLORS.textDim, fontSize: 12, marginTop: 4 }}>
            Offline-first phone music player. Companion to the Axion desktop app.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const SectionLabel: React.FC<{ children: string }> = ({ children }) => (
  <Text
    style={{
      color: COLORS.textMuted,
      fontSize: 11, fontWeight: '600', textTransform: 'uppercase',
      paddingHorizontal: 16, marginTop: 18, marginBottom: 6
    }}
  >
    {children}
  </Text>
);
