import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AppIcon } from './AppIcon';

interface AppBadgeProps {
  label: string;
  variant?: 'online' | 'offline' | 'gold' | 'role' | 'neutral' | 'danger';
  icon?: string;
  dot?: boolean;
  style?: ViewStyle;
}

export const AppBadge: React.FC<AppBadgeProps> = ({
  label,
  variant = 'online',
  icon,
  dot = false,
  style,
}) => {
  const { colors, isDark } = useTheme();

  const getVariantStyles = () => {
    switch (variant) {
      case 'online':
        return {
          bg: '#06261B',
          border: 'rgba(16, 185, 129, 0.3)',
          text: '#10B981',
          dotColor: '#10B981',
        };
      case 'offline':
        return {
          bg: 'rgba(142, 142, 147, 0.15)',
          border: 'rgba(142, 142, 147, 0.3)',
          text: '#8E8E93',
          dotColor: '#8E8E93',
        };
      case 'gold':
        return {
          bg: 'rgba(255, 159, 28, 0.15)',
          border: 'rgba(255, 159, 28, 0.3)',
          text: '#FF9F1C',
          dotColor: '#FF9F1C',
        };
      case 'role':
        return {
          bg: isDark ? 'rgba(255, 159, 28, 0.1)' : 'rgba(212, 175, 55, 0.1)',
          border: 'rgba(255, 159, 28, 0.25)',
          text: '#FF9F1C',
          dotColor: '#FF9F1C',
        };
      case 'danger':
        return {
          bg: 'rgba(239, 68, 68, 0.15)',
          border: 'rgba(239, 68, 68, 0.3)',
          text: '#EF4444',
          dotColor: '#EF4444',
        };
      case 'neutral':
        return {
          bg: isDark ? '#171A22' : colors.secondarySurface,
          border: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
          text: colors.text,
          dotColor: colors.text,
        };
    }
  };

  const vStyle = getVariantStyles();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: vStyle.bg,
          borderColor: vStyle.border,
          borderWidth: 1,
        },
        style,
      ]}
    >
      {dot && (
        <View style={[styles.dot, { backgroundColor: vStyle.dotColor }]} />
      )}
      {icon && (
        <AppIcon name={icon} color={vStyle.text} size={14} />
      )}
      <Text style={[styles.text, { color: vStyle.text }]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
