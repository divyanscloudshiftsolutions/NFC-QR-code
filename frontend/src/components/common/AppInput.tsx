import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AppIcon } from './AppIcon';

interface AppInputProps extends TextInputProps {
  label: string;
  icon?: string;
  error?: string | null;
  required?: boolean;
  rightElement?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export const AppInput: React.FC<AppInputProps> = ({
  label,
  icon,
  error,
  required = false,
  rightElement,
  containerStyle,
  ...props
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? '#171A22' : colors.secondarySurface,
            borderColor: error ? '#EF4444' : isDark ? 'rgba(255,255,255,0.1)' : colors.border,
            borderWidth: 1.5,
          },
        ]}
      >
        <View style={styles.topRow}>
          {icon && (
            <View style={styles.iconContainer}>
              <AppIcon name={icon} color={colors.gold} size={16} />
            </View>
          )}

          <Text style={[styles.label, { color: colors.gold }]}>
            {label} {required && <Text style={{ color: '#EF4444' }}>*</Text>}
          </Text>
        </View>

        <View style={styles.inputRow}>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
              },
            ]}
            placeholderTextColor={colors.placeholder}
            accessibilityLabel={label}
            accessibilityRole="text"
            {...props}
          />
          {rightElement}
        </View>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <AppIcon name="alert-triangle" color="#EF4444" size={12} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  container: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
});
