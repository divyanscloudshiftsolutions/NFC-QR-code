import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated, Platform } from 'react-native';

import { useTheme } from '../../../context/ThemeContext';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const { colors } = useTheme();
  const pulseAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: Platform.OS !== 'web',
    }).start();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.8,
          duration: 1000,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    ).start();

    // Finish splash screen
    const timer = setTimeout(() => {
      onFinish();
    }, 3200);

    return () => clearTimeout(timer);
  }, [pulseAnim, opacityAnim, onFinish]);

  return (
    <Animated.View style={[styles.container, { opacity: opacityAnim, backgroundColor: colors.bg }]}>
      <Animated.View style={[styles.splashPulseCircle, { transform: [{ scale: pulseAnim }] }]}>
        <View className="w-20 h-20 rounded-full justify-center items-center border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
          <Text className="text-4xl text-gold">⚡</Text>
        </View>
      </Animated.View>
      <Text className="text-[26px] font-bold text-themeText tracking-wider mb-1.5" style={{ color: colors.text }}>NFC TAP & TOKEN</Text>
      <Text className="text-[13px] tracking-widest" style={{ color: colors.muted }}>Bar Management System</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashPulseCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(245, 166, 35, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 166, 35, 0.25)',
    marginBottom: 24,
  },
});
