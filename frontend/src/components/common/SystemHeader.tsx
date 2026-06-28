import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNfcBar } from '../../context/NfcBarContext';
import { AppIcon } from './AppIcon';

interface SystemHeaderProps {
  onOpenNotifs: () => void;
}

export const SystemHeader: React.FC<SystemHeaderProps> = ({ onOpenNotifs }) => {
  const { systemMode, pendingSyncCount, lastSyncTime, notifications, setMode } = useNfcBar();
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
          bg: 'bg-teal/10 border-teal/20',
          dot: 'bg-teal',
          text: '#4ecdc4',
          label: 'Online'
        };
      case 'syncing': 
        return {
          bg: 'bg-gold/10 border-gold/20',
          dot: 'bg-gold',
          text: '#f5a623',
          label: `Syncing • ${lastSyncTime}`
        };
      case 'offline': 
        return {
          bg: 'bg-muted/10 border-muted/20',
          dot: 'bg-muted',
          text: '#9ca3af',
          label: 'Offline Mode'
        };
    }
  };

  const capsule = getCapsuleStyles();

  return (
    <View 
      className="flex-row justify-between items-center px-4 pb-2.5 border-b border-white/5 bg-bg"
      style={{ paddingTop: Math.max(12, insets.top) }}
    >
      <View className="flex-row items-center gap-1.5 max-w-[55%]">
        {/* Sync Capsule Status Pill */}
        <TouchableOpacity 
          className={`flex-row items-center py-2 px-3 rounded-full border min-h-[36px] ${capsule.bg}`}
          onPress={toggleConnection}
          activeOpacity={0.8}
        >
          <View className={`w-1.5 h-1.5 rounded-full mr-1.5 ${capsule.dot}`} />
          <Text className="text-[9px] font-extrabold uppercase tracking-[0.5px]" style={{ color: capsule.text }} numberOfLines={1}>
            {capsule.label}
          </Text>
        </TouchableOpacity>

        {/* Offline pending syncs indicator */}
        {systemMode === 'offline' && pendingSyncCount > 0 && (
          <View className="bg-red/10 border border-red/25 px-2.5 py-2 rounded-full min-h-[36px] justify-center">
            <Text className="font-black text-[9px] uppercase tracking-wide" style={{ color: '#e63946' }}>
              {pendingSyncCount} Pending Syncs
            </Text>
          </View>
        )}
      </View>

      <Text className="text-xs font-bold text-gold tracking-[0.5px] uppercase">🍹 Reception Desk</Text>

      <TouchableOpacity 
        className="w-10 h-10 rounded-full bg-surface justify-center items-center border border-white/5 relative"
        onPress={onOpenNotifs}
        activeOpacity={0.8}
      >
        <AppIcon name="bell" label="Open Notifications" color="#f0ede6" size={18} />
        {unreadCount > 0 && (
          <View className="absolute -top-0.5 -right-0.5 bg-red w-4 h-4 rounded-full justify-center items-center border border-bg">
            <Text className="text-[8px] font-black" style={{ color: '#08090d' }}>{unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default SystemHeader;
