import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { COLORS } from '../lib/theme';

interface Props {
  title: string;
  onMore?: () => void;
}

export const SectionHeader: React.FC<Props> = ({ title, onMore }) => (
  <View className="flex-row items-center justify-between px-4 mt-6 mb-3">
    <Text className="font-semibold" style={{ color: COLORS.text, fontSize: 17 }}>
      {title}
    </Text>
    {onMore && (
      <Pressable onPress={onMore} className="flex-row items-center">
        <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>See all</Text>
        <ChevronRight size={16} color={COLORS.textMuted} />
      </Pressable>
    )}
  </View>
);
