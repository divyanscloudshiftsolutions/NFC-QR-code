import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated, Modal, TouchableOpacity, BackHandler, Platform } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { ANIMATIONS } from '../../theme/animations';
import { AppIcon } from './AppIcon';

interface AlertModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const AlertModal: React.FC<AlertModalProps> = ({ visible, onClose, title, children }) => {
  const { colors } = useTheme();
  
  // Animation state values
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(ANIMATIONS.scale.modalEntrance)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  
  // Keep track of active visibility status to prevent trigger loop
  const isTransitioning = useRef(false);

  useEffect(() => {
    if (visible) {
      animateEntrance();
    }
  }, [visible]);

  // Back button handler inside the modal
  useEffect(() => {
    const handleBackButton = () => {
      if (visible) {
        handleDismiss();
        return true;
      }
      return false;
    };

    let subscription: any;
    if (visible && Platform.OS === 'android') {
      subscription = BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    }
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [visible]);

  const animateEntrance = () => {
    isTransitioning.current = true;
    backdropOpacity.setValue(0);
    contentScale.setValue(ANIMATIONS.scale.modalEntrance);
    contentOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: ANIMATIONS.opacity.dimmedBackdrop,
        duration: ANIMATIONS.duration.modal,
        useNativeDriver: true,
      }),
      Animated.spring(contentScale, {
        toValue: 1,
        tension: ANIMATIONS.spring.bouncy.tension,
        friction: ANIMATIONS.spring.bouncy.friction,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: ANIMATIONS.duration.fast,
        useNativeDriver: true,
      })
    ]).start(() => {
      isTransitioning.current = false;
    });
  };

  const handleDismiss = () => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: ANIMATIONS.duration.fast,
        useNativeDriver: true,
      }),
      Animated.timing(contentScale, {
        toValue: ANIMATIONS.scale.modalEntrance,
        duration: ANIMATIONS.duration.fast,
        easing: ANIMATIONS.easing.easeInOut,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: ANIMATIONS.duration.fast,
        useNativeDriver: true,
      })
    ]).start(() => {
      isTransitioning.current = false;
      onClose();
    });
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <View style={styles.modalOverlay}>
        {/* Clickable dim backdrop */}
        <Animated.View 
          style={[
            styles.backdrop, 
            { 
              opacity: backdropOpacity,
              backgroundColor: '#000000',
            }
          ]}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={styles.backdropPress}
            onPress={handleDismiss}
          />
        </Animated.View>

        {/* Modal content container */}
        <Animated.View
          style={[
            styles.modalContent,
            {
              backgroundColor: colors.modal,
              borderColor: colors.border,
              opacity: contentOpacity,
              transform: [{ scale: contentScale }],
            }
          ]}
        >
          {/* Header Row */}
          <View style={[styles.headerRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.titleText, { color: colors.gold }]} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity 
              onPress={handleDismiss} 
              style={[styles.closeButton, { backgroundColor: colors.secondarySurface, borderColor: colors.border }]}
            >
              <AppIcon name="x" label="Close Dialog" color={colors.muted} size={16} />
            </TouchableOpacity>
          </View>

          {/* Children Layout */}
          <View style={styles.childrenContainer}>
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdropPress: {
    flex: 1,
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 16,
    borderBottomWidth: 1.5,
  },
  titleText: {
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  childrenContainer: {
    width: '100%',
  }
});
