import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AppIcon } from './AppIcon';
import { AppButton } from './AppButton';

interface DetailItem {
  label: string;
  value: string;
}

interface AppSuccessStateProps {
  title: string;
  subtitle?: string;
  details?: DetailItem[];
  primaryButtonTitle: string;
  onPrimaryPress: () => void;
  secondaryButtonTitle?: string;
  onSecondaryPress?: () => void;
  icon?: string;
  style?: ViewStyle;
}

export const AppSuccessState: React.FC<AppSuccessStateProps> = ({
  title,
  subtitle,
  details = [],
  primaryButtonTitle,
  onPrimaryPress,
  secondaryButtonTitle,
  onSecondaryPress,
  icon = 'check',
  style,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#111318' : colors.card, borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border }, style]}>
      {/* Large Success Badge */}
      <View style={[styles.badge, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
        <AppIcon name={icon} color="#10B981" size={42} />
      </View>

      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle && <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>}

      {/* Details Box */}
      {details.length > 0 && (
        <View style={[styles.detailsBox, { backgroundColor: isDark ? '#171A22' : colors.secondarySurface, borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border }]}>
          {details.map((item, idx) => (
            <View key={idx} style={[styles.detailRow, idx < details.length - 1 && { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : colors.divider, borderBottomWidth: 1 }]}>
              <Text style={[styles.detailLabel, { color: colors.muted }]}>{item.label}</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{item.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <AppButton
          title={primaryButtonTitle}
          onPress={onPrimaryPress}
          variant="primary"
          iconRight="arrow-right"
        />
        {secondaryButtonTitle && onSecondaryPress && (
          <AppButton
            title={secondaryButtonTitle}
            onPress={onSecondaryPress}
            variant="secondary"
            style={{ marginTop: 10 }}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
    marginVertical: 12,
  },
  badge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  detailsBox: {
    width: '100%',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  buttonContainer: {
    width: '100%',
  },
});
