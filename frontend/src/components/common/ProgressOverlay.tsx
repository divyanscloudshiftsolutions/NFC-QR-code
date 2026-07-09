import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated, Easing, Modal } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface ProgressOverlayProps {
  visible: boolean;
  message: string;
}

export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({ visible, message }) => {
  const { colors } = useTheme();
  
  // Animation state values
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let spinLoop: Animated.CompositeAnimation | null = null;
    
    if (visible) {
      spinAnim.setValue(0);
      spinLoop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinLoop.start();
    }
    
    return () => {
      if (spinLoop) {
        spinLoop.stop();
      }
    };
  }, [visible]);

  // Interpolate degrees for rotation
  const spinRotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => {}} // Block back button closure during critical progress
    >
      <View style={styles.overlayContainer}>
        <View style={[styles.cardContainer, { backgroundColor: colors.modal, borderColor: colors.border }]}>
          <Animated.View
            style={[
              styles.spinnerCircle,
              { 
                borderColor: colors.border,
                borderTopColor: colors.gold,
                transform: [{ rotate: spinRotate }]
              }
            ]}
          />
          <Text style={[styles.messageText, { color: colors.text }]}>
            {message}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    padding: 24,
  },
  cardContainer: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    width: '80%',
    maxWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 12,
  },
  spinnerCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
  },
  messageText: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
    lineHeight: 16,
  }
});
