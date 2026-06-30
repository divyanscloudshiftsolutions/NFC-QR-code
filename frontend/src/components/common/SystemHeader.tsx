import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNfcBar } from '../../context/NfcBarContext';
import { useTheme } from '../../context/ThemeContext';
import { AppIcon } from './AppIcon';

interface SystemHeaderProps {
  onOpenNotifs: () => void;
}

export const SystemHeader: React.FC<SystemHeaderProps> = ({ onOpenNotifs }) => {
  const { systemMode, pendingSyncCount, lastSyncTime, notifications, setMode } = useNfcBar();
  const { colors, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const unreadCount = notifications.filter(n => !n.read).length;

  const toggleConnection = () => {
    if (systemMode === 'online') {
      setMode('offline');
    } else {
      setMode('online');
    }
  };

  const getCapsuleStyles = () => {
    switch (systemMode) {
      case 'online': 
        return {
          bg: isDark ? 'bg-teal/10 border-teal/20' : 'bg-[#1D4ED8]/5 border-[#1D4ED8]/10',
          dot: 'bg-teal',
          text: isDark ? '#4ECDC4' : '#1D4ED8',
          label: 'Online'
        };
      case 'syncing': 
        return {
          bg: isDark ? 'bg-gold/10 border-gold/20' : 'bg-[#C89B3C]/5 border-[#C89B3C]/10',
          dot: 'bg-gold',
          text: isDark ? '#F5A623' : '#C89B3C',
          label: `Syncing • ${lastSyncTime}`
        };
      case 'offline': 
        return {
          bg: isDark ? 'bg-muted/10 border-muted/20' : 'bg-[#7E7E82]/5 border-[#7E7E82]/10',
          dot: 'bg-muted',
          text: isDark ? colors.muted : '#7E7E82',
          label: 'Offline Mode'
        };
    }
  };

  const capsule = getCapsuleStyles();

  return (
    <View 
      className="flex-row justify-between items-center px-4 pb-2.5 border-b"
      style={{ 
        paddingTop: Math.max(12, insets.top),
        backgroundColor: colors.bg,
        borderBottomColor: colors.border,
        borderBottomWidth: 1
      }}
    >
      <View className="flex-row items-center gap-1.5 max-w-[45%]">
        {/* Sync Capsule Status Pill */}
        <TouchableOpacity 
          className={`flex-row items-center py-2 px-3 rounded-full border min-h-[36px] ${capsule.bg}`}
          onPress={toggleConnection}
          activeOpacity={0.8}
        >
          <View className={`w-1.5 h-1.5 rounded-full mr-1.5 ${capsule.dot}`} style={!isDark && capsule.dot === 'bg-teal' ? { backgroundColor: colors.teal } : {}} />
          <Text className="text-[9px] font-extrabold uppercase tracking-[0.5px]" style={{ color: capsule.text }} numberOfLines={1}>
            {capsule.label}
          </Text>
        </TouchableOpacity>

        {/* Offline pending syncs indicator */}
        {systemMode === 'offline' && pendingSyncCount > 0 && (
          <View className="bg-red/10 border border-red/25 px-2.5 py-2 rounded-full min-h-[36px] justify-center">
            <Text className="font-black text-[9px] uppercase tracking-wide" style={{ color: '#e63946' }}>
              {pendingSyncCount} Syncs
            </Text>
          </View>
        )}
      </View>

      <Text className="text-xs font-bold tracking-[0.5px] uppercase" style={{ color: colors.gold }}>🍹 Reception</Text>

      <View className="flex-row items-center gap-2">
        {/* Theme Toggle Button */}
        <TouchableOpacity 
          className="w-10 h-10 rounded-full justify-center items-center border"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
          onPress={toggleTheme}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>

        {/* Notifications Icon Button */}
        <TouchableOpacity 
          className="w-10 h-10 rounded-full justify-center items-center border relative"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
          onPress={onOpenNotifs}
          activeOpacity={0.8}
        >
          <AppIcon name="bell" label="Open Notifications" color={colors.text} size={18} />
          {unreadCount > 0 && (
            <View className="absolute -top-0.5 -right-0.5 bg-red w-4 h-4 rounded-full justify-center items-center border" style={{ borderColor: colors.bg }}>
              <Text className="text-[8px] font-black" style={{ color: colors.bg }}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SystemHeader;
