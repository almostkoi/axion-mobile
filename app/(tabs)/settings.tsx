import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RotateCw } from 'lucide-react-native';
import * as Application from 'expo-constants';
import { useStore } from '../../store/useStore';
import { useLibrary } from '../../hooks/useLibrary';
import { ACCENT_HEX, COLORS } from '../../lib/theme';
import type { AccentColor } from '../../types/domain';

const ACCENTS: AccentColor[] = ['red', 'blue', 'green', 'purple', 'orange'];

const PIPED_INSTANCE_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'kavin.rocks',          value: 'https://pipedapi.kavin.rocks' },
  { label: 'adminforge.de',        value: 'https://pipedapi.adminforge.de' },
  { label: 'projectsegfau.lt',     value: 'https://pipedapi.in.projectsegfau.lt' },
  { label: 'leptons.xyz',          value: 'https://pipedapi.leptons.xyz' }
];

export default function SettingsScreen(): React.ReactElement {
  const settings = useStore(s => s.settings);
  const setAccent = useStore(s => s.setAccentColor);
  const setSettings = useStore(s => s.setSettings);
  const scan = useStore(s => s.scanProgress);
  const { rescan } = useLibrary();
  const [rescanning, setRescanning] = useState(false);
  const [pipedDraft, setPipedDraft] = useState(settings.pipedInstance);

  // Keep the draft in sync if the underlying setting changes (e.g., reset).
  useEffect(() => { setPipedDraft(settings.pipedInstance); }, [settings.pipedInstance]);

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

        {/* Import / YouTube proxy */}
        <SectionLabel>Import · YouTube proxy</SectionLabel>
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 10 }}>
            YouTube blocks direct extraction in 2025 (PO Token enforcement).
            Axion routes imports through Piped, then auto-falls-back to
            Invidious, then to direct extraction. Both proxy lists are
            refreshed live from their public directories — you usually
            don't need to change anything here. Override only if you've
            self-hosted a Piped backend.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {PIPED_INSTANCE_PRESETS.map(p => {
              const active = settings.pipedInstance.replace(/\/+$/, '') === p.value.replace(/\/+$/, '');
              return (
                <Pressable
                  key={p.value}
                  onPress={() => setSettings({ pipedInstance: p.value })}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: active ? ACCENT_HEX[settings.accentColor] : COLORS.surface,
                    borderWidth: 1,
                    borderColor: active ? 'transparent' : COLORS.border
                  }}
                >
                  <Text style={{
                    color: active ? '#fff' : COLORS.text,
                    fontSize: 12, fontWeight: active ? '600' : '500'
                  }}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={pipedDraft}
            onChangeText={setPipedDraft}
            onBlur={() => setSettings({ pipedInstance: pipedDraft.trim() })}
            placeholder="https://pipedapi.example.com"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={{
              backgroundColor: COLORS.surface,
              color: COLORS.text,
              borderRadius: 8,
              paddingHorizontal: 12, paddingVertical: 10,
              fontSize: 13
            }}
          />
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
