import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AppIcon } from './AppIcon';

interface AppCardProps {
  children: React.ReactNode;
  icon?: string;
  stepTag?: string;
  title?: string;
  subtitle?: string;
  style?: ViewStyle;
}

export const AppCard: React.FC<AppCardProps> = ({
  children,
  icon,
  stepTag,
  title,
  subtitle,
  style,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? '#111318' : colors.card,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
          borderWidth: 1.5,
        },
        style,
      ]}
    >
      {(icon || stepTag || title || subtitle) && (
        <View style={styles.headerRow}>
          {icon && (
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: isDark ? '#2B2215' : 'rgba(245, 166, 35, 0.15)',
                  borderColor: isDark ? 'rgba(255,159,28,0.25)' : colors.gold,
                },
              ]}
            >
              <AppIcon name={icon} color={colors.gold} size={22} />
            </View>
          )}

          <View style={styles.headerTextContainer}>
            {stepTag && (
              <Text style={[styles.stepTag, { color: colors.gold }]}>
                {stepTag}
              </Text>
            )}
            {title && (
              <Text style={[styles.title, { color: colors.text }]}>
                {title}
              </Text>
            )}
            {subtitle && (
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>
      )}

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTextContainer: {
    flex: 1,
  },
  stepTag: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
});
