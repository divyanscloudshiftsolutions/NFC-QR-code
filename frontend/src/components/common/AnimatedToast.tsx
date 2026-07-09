import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, Animated, PanResponder, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { ANIMATIONS } from '../../theme/animations';
import { AppIcon } from './AppIcon';

interface AnimatedToastProps {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'danger' | 'info';
  onDismiss: (id: string) => void;
  duration?: number;
}

export const AnimatedToast: React.FC<AnimatedToastProps> = ({ id, message, type, onDismiss, duration = 2000 }) => {
  const { colors, isDark } = useTheme();
  
  // Animation state values
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    // 1. Entrance animation slide down + fade in
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: ANIMATIONS.spring.bouncy.tension,
        friction: ANIMATIONS.spring.bouncy.friction,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: ANIMATIONS.duration.fast,
        useNativeDriver: true,
      })
    ]).start();

    // 2. Auto dismiss timeout
    const timeout = setTimeout(() => {
      handleDismiss();
    }, Math.max(100, duration - 300));

    return () => clearTimeout(timeout);
  }, []);

  const handleDismiss = () => {
    // Exit animation slide up + fade out
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -80,
        duration: ANIMATIONS.duration.fast,
        easing: ANIMATIONS.easing.easeInOut,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: ANIMATIONS.duration.fast,
        useNativeDriver: true,
      })
    ]).start(() => {
      onDismiss(id);
    });
  };

  // Pan responder for swipe-up-to-dismiss gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy < 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -20) {
          handleDismiss();
        } else {
          // snap back
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      }
    })
  ).current;

  // Semantic styles mapping
  let bg = colors.card;
  let border = colors.border;
  let textCol = colors.text;
  let iconName: 'check' | 'alert-triangle' | 'info' | 'x' = 'info';
  let iconColor = colors.text;

  if (type === 'success') {
    bg = isDark ? 'rgba(6, 78, 59, 0.95)' : '#ecfdf5';
    border = isDark ? '#059669' : '#10b981';
    textCol = isDark ? '#34d399' : '#047857';
    iconName = 'check';
    iconColor = border;
  } else if (type === 'warning') {
    bg = isDark ? 'rgba(120, 53, 15, 0.95)' : '#fffbeb';
    border = isDark ? '#d97706' : '#f59e0b';
    textCol = isDark ? '#fbbf24' : '#b45309';
    iconName = 'alert-triangle';
    iconColor = border;
  } else if (type === 'danger') {
    bg = isDark ? 'rgba(127, 29, 29, 0.95)' : '#fef2f2';
    border = isDark ? '#dc2626' : '#ef4444';
    textCol = isDark ? '#f87171' : '#b91c1c';
    iconName = 'x';
    iconColor = border;
  } else if (type === 'info') {
    bg = isDark ? 'rgba(30, 58, 138, 0.95)' : '#eff6ff';
    border = isDark ? '#3b82f6' : '#60a5fa';
    textCol = isDark ? '#93c5fd' : '#1d4ed8';
    iconName = 'info';
    iconColor = border;
  }

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.toastCard,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }],
        }
      ]}
    >
      <View style={styles.toastContent}>
        <AppIcon name={iconName} label={type} color={iconColor} size={18} />
        <Text style={[styles.toastText, { color: textCol }]} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toastCard: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toastText: {
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
    lineHeight: 18,
  }
});
