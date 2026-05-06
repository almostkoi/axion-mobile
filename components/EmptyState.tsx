import React from 'react';
import { Text, View, Pressable } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { COLORS } from '../lib/theme';
import { useStore } from '../store/useStore';
import { ACCENT_HEX } from '../lib/theme';

interface Props {
  Icon: LucideIcon;
  title: string;
  message: string;
  cta?: { label: string; onPress: () => void };
}

export const EmptyState: React.FC<Props> = ({ Icon, title, message, cta }) => {
  const accent = useStore(s => s.settings.accentColor);
  const accentHex = ACCENT_HEX[accent];
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <View
        style={{
          width: 80, height: 80, borderRadius: 40,
          backgroundColor: COLORS.surface,
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 16
        }}
      >
        <Icon size={32} color={COLORS.textMuted} />
      </View>
      <Text className="font-semibold text-center mb-2" style={{ color: COLORS.text, fontSize: 18 }}>
        {title}
      </Text>
      <Text className="text-center mb-6" style={{ color: COLORS.textMuted, fontSize: 14, lineHeight: 20 }}>
        {message}
      </Text>
      {cta && (
        <Pressable
          onPress={cta.onPress}
          style={{
            backgroundColor: accentHex,
            paddingHorizontal: 24, paddingVertical: 12,
            borderRadius: 24
          }}
          android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
        >
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
            {cta.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
};
