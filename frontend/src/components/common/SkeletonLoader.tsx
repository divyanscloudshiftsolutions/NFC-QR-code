import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface SkeletonLoaderProps {
  type: 'card' | 'list-item' | 'square-grid' | 'text-line';
  height?: number;
  width?: number;
  style?: ViewStyle;
  count?: number;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ type, height, width, style, count = 1 }) => {
  const { colors } = useTheme();
  
  // Animation state values
  const pulseOpacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // Infinite looping pulse animation
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 0.95,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0.4,
          duration: 900,
          useNativeDriver: true,
        })
      ])
    );
    
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, []);

  // Determine styles based on type
  const getSkeletonStyle = (): StyleProp<ViewStyle> => {
    switch (type) {
      case 'card':
        return [
          styles.base,
          styles.card,
          { 
            backgroundColor: colors.secondarySurface, 
            borderColor: colors.border, 
            height: height || 120, 
            width: width || '100%' 
          } as any
        ];
      case 'list-item':
        return [
          styles.base,
          styles.listItem,
          { 
            backgroundColor: colors.secondarySurface, 
            borderColor: colors.border, 
            height: height || 64, 
            width: width || '100%' 
          } as any
        ];
      case 'square-grid':
        return [
          styles.base,
          styles.square,
          { 
            backgroundColor: colors.secondarySurface, 
            borderColor: colors.border, 
            height: height || 96, 
            width: width || 96 
          } as any
        ];
      case 'text-line':
        return [
          styles.base,
          styles.textLine,
          { 
            backgroundColor: colors.border, 
            height: height || 14, 
            width: width || '70%' 
          } as any
        ];
    }
  };

  const renderSingle = (key: string | number) => (
    <Animated.View
      key={key}
      style={[
        getSkeletonStyle(),
        { opacity: pulseOpacity },
        style
      ]}
    />
  );

  if (count > 1) {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => renderSingle(i))}
      </>
    );
  }

  return renderSingle('single');
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
  },
  card: {
    borderWidth: 1.5,
    padding: 16,
    marginVertical: 6,
  },
  listItem: {
    borderWidth: 1.5,
    marginVertical: 4,
  },
  square: {
    borderWidth: 1.5,
    margin: 4,
  },
  textLine: {
    marginVertical: 4,
    borderRadius: 6,
  }
});
