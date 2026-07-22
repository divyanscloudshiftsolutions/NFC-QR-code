import React from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AppIcon } from './AppIcon';

interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconRight?: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export const AppButton: React.FC<AppButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = true,
  style,
}) => {
  const { colors, isDark } = useTheme();

  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          bg: '#FF9F1C',
          border: '#FF9F1C',
          text: '#08090D',
          iconColor: '#08090D',
        };
      case 'secondary':
        return {
          bg: colors.secondarySurface,
          border: colors.border,
          text: colors.text,
          iconColor: colors.text,
        };
      case 'outline':
        return {
          bg: 'transparent',
          border: colors.border,
          text: colors.text,
          iconColor: colors.text,
        };
      case 'danger':
        return {
          bg: 'rgba(239, 68, 68, 0.15)',
          border: '#EF4444',
          text: '#EF4444',
          iconColor: '#EF4444',
        };
      case 'ghost':
        return {
          bg: 'transparent',
          border: 'transparent',
          text: colors.gold,
          iconColor: colors.gold,
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return { paddingVertical: 8, paddingHorizontal: 14, minHeight: 36, fontSize: 12 };
      case 'md':
        return { paddingVertical: 12, paddingHorizontal: 20, minHeight: 48, fontSize: 14 };
      case 'lg':
        return { paddingVertical: 16, paddingHorizontal: 24, minHeight: 54, fontSize: 15 };
    }
  };

  const vStyle = getVariantStyles();
  const sStyle = getSizeStyles();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
      style={[
        styles.button,
        {
          backgroundColor: disabled ? (isDark ? '#1C1F2B' : '#E2E8F0') : vStyle.bg,
          borderColor: disabled ? (isDark ? '#272B38' : '#CBD5E1') : vStyle.border,
          borderWidth: variant === 'ghost' ? 0 : 1.5,
          paddingVertical: sStyle.paddingVertical,
          paddingHorizontal: sStyle.paddingHorizontal,
          minHeight: sStyle.minHeight,
          width: fullWidth ? '100%' : 'auto',
          opacity: disabled ? 0.55 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={vStyle.text} />
      ) : (
        <View style={styles.contentRow}>
          {icon && (
            <AppIcon name={icon} color={vStyle.iconColor} size={sStyle.fontSize + 2} />
          )}
          <Text
            style={[
              styles.text,
              {
                color: disabled ? colors.muted : vStyle.text,
                fontSize: sStyle.fontSize,
              },
            ]}
          >
            {title}
          </Text>
          {iconRight && (
            <AppIcon name={iconRight} color={vStyle.iconColor} size={sStyle.fontSize + 2} />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
