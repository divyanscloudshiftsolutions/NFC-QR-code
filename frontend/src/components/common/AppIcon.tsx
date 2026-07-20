import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  ClipboardCheck,
  Wine,
  Map,
  BarChart3,
  Calendar,
  User,
  Phone,
  Mail,
  Users,
  Bell,
  Sun,
  Moon,
  Camera,
  Scan,
  CreditCard,
  Zap,
  RefreshCw,
  X,
  Check,
  ArrowRight,
  ChevronRight,
  Plus,
  Minus,
  AlertTriangle,
  Info,
  Shield,
  Lock,
  Clock,
  Circle,
  HelpCircle,
  LucideIcon
} from 'lucide-react-native';

interface AppIconProps {
  name: string;
  color?: string;
  size?: number;
  label?: string;
}

export const AppIcon: React.FC<AppIconProps> = ({ 
  name, 
  color, 
  size = 20, 
  label 
}) => {
  const { colors } = useTheme();
  const activeColor = color || colors.text;

  const iconMap: Record<string, LucideIcon> = {
    'checkin': ClipboardCheck,
    'clipboard': ClipboardCheck,
    'bartender': Wine,
    'beer': Wine,
    'glass': Wine,
    'cup': Wine,
    'cocktail': Wine,
    'tables': Map,
    'map': Map,
    'admin': BarChart3,
    'chart': BarChart3,
    'attendance': Calendar,
    'calendar': Calendar,
    'user': User,
    'person': User,
    'phone': Phone,
    'mail': Mail,
    'users': Users,
    'bell': Bell,
    'sun': Sun,
    'moon': Moon,
    'camera': Camera,
    'scan': Scan,
    'qr': Scan,
    'credit-card': CreditCard,
    'card': CreditCard,
    'nfc': Zap,
    'zap': Zap,
    'refresh': RefreshCw,
    'x': X,
    'close': X,
    'check': Check,
    'arrow-right': ArrowRight,
    'chevron-right': ChevronRight,
    'plus': Plus,
    'minus': Minus,
    'alert-circle': AlertTriangle,
    'alert-triangle': AlertTriangle,
    'alert': AlertTriangle,
    'info': Info,
    'shield': Shield,
    'lock': Lock,
    'clock': Clock,
    'circle': Circle,
  };

  const SelectedIcon = iconMap[name.toLowerCase()] || HelpCircle;

  return (
    <SelectedIcon 
      size={size} 
      color={activeColor} 
      accessibilityLabel={label || name}
    />
  );
};
