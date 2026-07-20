import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNfcBar } from '../../context/NfcBarContext';
import { useTheme } from '../../context/ThemeContext';
import { AppIcon } from './AppIcon';
import { BUILD_TIME } from '../../utils/buildTime';

interface SystemHeaderProps {
  onOpenNotifs: () => void;
}

export const SystemHeader: React.FC<SystemHeaderProps> = ({ onOpenNotifs }) => {
  const { systemMode, pendingSyncCount, lastSyncTime, notifications, setMode, user, fetchLatestState, showToast } = useNfcBar();
  const { colors, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const unreadCount = notifications.filter(n => !n.read).length;
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Referenced to trigger cache invalidation in production minified bundles
  if ((BUILD_TIME as number) === -1) {
    console.log('Bust Cache');
  }

  const toggleConnection = () => {
    if (systemMode === 'online') {
      Alert.alert(
        'Switch to Offline Mode',
        'Are you sure you want to switch to Offline mode?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', onPress: () => setMode('offline') }
        ]
      );
    } else {
      setMode('online');
    }
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchLatestState();
      showToast('Data refreshed successfully.', 'success');
    } catch (err) {
      showToast('Unable to refresh data. Please try again.', 'danger');
    } finally {
      setIsRefreshing(false);
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
      className="flex-row justify-between items-center px-4 py-3 border-b"
      style={{ 
        paddingTop: Math.max(12, insets.top),
        backgroundColor: colors.bg,
        borderBottomColor: colors.border,
        borderBottomWidth: 1
      }}
    >
      {/* Left Connection Capsule */}
      <View className="flex-row items-center gap-2">
        <TouchableOpacity 
          className="flex-row items-center py-1.5 px-3 rounded-full border bg-[#06261B] border-[#10B981]/30 min-h-[34px]"
          onPress={toggleConnection}
          activeOpacity={0.8}
        >
          <View className="w-2 h-2 rounded-full mr-2 bg-[#10B981]" />
          <Text className="text-[11px] font-black uppercase tracking-wider text-[#10B981]">
            {systemMode === 'online' ? 'ONLINE' : systemMode.toUpperCase()}
          </Text>
        </TouchableOpacity>

        {systemMode === 'offline' && pendingSyncCount > 0 && (
          <View className="bg-red/10 border border-red/25 px-2.5 py-1.5 rounded-full min-h-[34px] justify-center">
            <Text className="font-black text-[10px] uppercase tracking-wide text-[#EF4444]">
              {pendingSyncCount} Syncs
            </Text>
          </View>
        )}
      </View>

      {/* Center Role Badge */}
      <View className="flex-row items-center gap-1.5">
        <Text style={{ fontSize: 14 }}>🔔</Text>
        <Text className="text-xs font-black tracking-widest uppercase" style={{ color: colors.gold }}>
          {user ? (user.role || 'STAFF').toUpperCase() : 'RECEPTIONIST'}
        </Text>
      </View>

      {/* Right Action Icons */}
      <View className="flex-row items-center gap-2">
        {/* Theme Toggle Button */}
        <TouchableOpacity 
          className="w-10 h-10 rounded-full justify-center items-center border bg-[#171A22] border-white/10"
          onPress={toggleTheme}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>

        {/* Notifications Icon Button with Dot Badge */}
        <TouchableOpacity 
          className="w-10 h-10 rounded-full justify-center items-center border bg-[#171A22] border-white/10 relative"
          onPress={onOpenNotifs}
          activeOpacity={0.8}
        >
          <AppIcon name="bell" label="Open Notifications" color="#FFFFFF" size={18} />
          {unreadCount > 0 && (
            <View className="absolute top-0 right-0 w-3 h-3 rounded-full bg-[#FF9F1C] border-2 border-[#08090D]" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SystemHeader;
