import React from 'react';
import { Text } from 'react-native';

interface AppIconProps {
  name: string;
  color?: string;
  size?: number;
  label: string;
}

export const AppIcon: React.FC<AppIconProps> = ({ 
  name, 
  color = '#f0ede6', 
  size = 20, 
  label 
}) => {
  const getIcon = () => {
    switch (name) {
      case 'credit-card': return '💳';
      case 'users': return '👥';
      case 'cup': return '🍹';
      case 'chart': return '📈';
      case 'bell': return '🔔';
      case 'settings': return '⚙️';
      case 'sun': return '☀️';
      case 'moon': return '🌙';
      case 'logout': return '🚪';
      case 'check': return '✓';
      case 'wifi': return '🛜';
      case 'alert-circle': return '⚠️';
      case 'search': return '🔍';
      case 'phone': return '📞';
      case 'mail': return '✉️';
      case 'plus': return '＋';
      case 'minus': return '－';
      case 'clock': return '⏱️';
      case 'refresh': return '🔄';
      case 'x': return '✕';
      case 'shield': return '🛡️';
      case 'cocktail': return '🍸';
      case 'map': return '🗺️';
      case 'chevron-right': return '›';
      case 'nfc': return '⚡';
      default: return '•';
    }
  };

  return (
    <Text 
      style={{ fontSize: size, color }} 
      accessibilityLabel={label}
      accessibilityRole="image"
    >
      {getIcon()}
    </Text>
  );
};
