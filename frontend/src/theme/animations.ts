import { Easing } from 'react-native';

export const ANIMATIONS = {
  duration: {
    fast: 180,
    standard: 280,
    modal: 320,
    success: 450,
    errorShake: 300,
  },
  spring: {
    bouncy: {
      tension: 45,
      friction: 5,
      useNativeDriver: true,
    },
    stiff: {
      tension: 80,
      friction: 12,
      useNativeDriver: true,
    },
  },
  easing: {
    easeInOut: Easing.bezier(0.25, 0.1, 0.25, 1),
    easeOut: Easing.out(Easing.ease),
  },
  scale: {
    buttonPress: 0.96,
    modalEntrance: 0.93,
    activeTabGlow: 1.05,
  },
  opacity: {
    dimmedBackdrop: 0.65,
    disabled: 0.45,
  }
};
