import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated, TouchableOpacity } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AppIcon } from './AppIcon';
import { ANIMATIONS } from '../../theme/animations';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  actionText?: string;
  onActionPress?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, actionText, onActionPress }) => {
  const { colors } = useTheme();
  
  // Animation state values
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIMATIONS.duration.standard,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={[styles.iconWrapper, { backgroundColor: colors.secondarySurface, borderColor: colors.border }]}>
        <AppIcon name={icon as any} label={title} color={colors.gold} size={28} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.muted }]}>{description}</Text>
      
      {actionText && onActionPress && (
        <TouchableOpacity 
          onPress={onActionPress}
          activeOpacity={0.8}
          style={[styles.actionButton, { backgroundColor: colors.gold, borderColor: colors.gold }]}
        >
          <Text style={[styles.actionText, { color: colors.primaryButtonText }]}>{actionText}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  description: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    maxWidth: 240,
    marginBottom: 20,
  },
  actionButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  actionText: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  }
});
