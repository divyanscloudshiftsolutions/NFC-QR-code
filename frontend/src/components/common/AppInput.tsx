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
        {icon && (
          <View 
            style={[
              styles.iconContainerLeft, 
              { 
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
                borderWidth: 1 
              }
            ]}
          >
            <AppIcon name={icon} color={colors.gold} size={18} />
          </View>
        )}

        <View style={styles.rightCol}>
          <Text style={[styles.label, { color: colors.gold }]}>
            {label} {required && <Text style={{ color: '#EF4444' }}>*</Text>}
          </Text>

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
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainerLeft: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightCol: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  label: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 0,
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
