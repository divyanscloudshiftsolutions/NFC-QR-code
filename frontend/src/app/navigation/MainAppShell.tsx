import React, { useState } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, ScrollView, 
  Platform, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNfcBar } from '../../context/NfcBarContext';
import { UserRole } from '../../types/nfc_bar';
import { SplashScreen } from '../../features/auth/screens/SplashScreen';
import { LoginScreen } from '../../features/auth/screens/LoginScreen';
import { CheckInWizard } from '../../features/checkin/screens/CheckInWizard';
import { BartenderPortal } from '../../features/bartender/screens/BartenderPortal';
import { TablesPortal } from '../../features/tables/screens/TablesPortal';
import { AdminPortal } from '../../features/admin/screens/AdminPortal';
import { SystemHeader } from '../../components/common/SystemHeader';
import { ReturnCardModal } from '../../components/modals/ReturnCardModal';
import { AppIcon } from '../../components/common/AppIcon';
import { useTheme } from '../../context/ThemeContext';
import { useResponsive } from '../../utils/responsive';

export const MainAppShell: React.FC = () => {
  const { colors, isDark } = useTheme();
  const { currentScreen, activeTab, toasts, notifications, user, logout, setTab, markNotificationsAsRead, isOverlayActive } = useNfcBar();
  const { isTablet, isLargeScreen } = useResponsive();
  const isCentered = isTablet || isLargeScreen;
  
  const [showSplash, setShowSplash] = useState(true);
  const [isNotifsOpen, setIsNotifsOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  
  // safe area offsets
  const insets = useSafeAreaInsets();

  const handleOpenNotifications = () => {
    markNotificationsAsRead();
    setIsNotifsOpen(true);
  };

  const getActiveTabContent = () => {
    switch (activeTab) {
      case 'checkin': return <CheckInWizard />;
      case 'bartender': return <BartenderPortal />;
      case 'tables': return <TablesPortal />;
      case 'admin': return <AdminPortal />;
    }
  };

  if (showSplash && currentScreen === 'splash') {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  const isUserRecep = user?.role === UserRole.RECEPTIONIST;
  const isUserAdmin = user?.role === UserRole.ADMIN;
  const isUserManager = user?.role === UserRole.MANAGER;
  const isUserBartender = user?.role === UserRole.BARTENDER;

  const getToastBg = (type: string) => {
    switch (type) {
      case 'success': return 'bg-[#22c55e]/90';
      case 'warning': return 'bg-[#f59e0b]/90';
      case 'danger': return 'bg-red/90';
      default: return '';
    }
  };

  return (
    <View className="flex-1 w-full bg-themeBg">
      
      {currentScreen === 'login' || !user ? (
        <LoginScreen />
      ) : (
        <View className="flex-1 pb-2">
          
          {/* TOP HEADER */}
          <SystemHeader onOpenNotifs={handleOpenNotifications} />

          {/* CORE APP VIEWS SWITCHER */}
          <View className="flex-1">
            {getActiveTabContent()}
          </View>



          {/* BOTTOM TAB BAR */}
          <View 
            className="flex-row justify-around items-center py-1.5 border-t"
            style={{ paddingBottom: insets.bottom, height: 60 + insets.bottom, backgroundColor: colors.navBg, borderTopColor: colors.navBorder, borderTopWidth: 1 }}
          >
            {(isUserAdmin || isUserRecep) && (
              <TouchableOpacity 
                className="items-center justify-center py-1.5 px-4 rounded-xl min-w-[72px]" 
                style={activeTab === 'checkin' ? { backgroundColor: isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(212, 175, 55, 0.1)' } : {}}
                onPress={() => setTab('checkin')}
                activeOpacity={0.8}
              >
                <Text className="text-lg mb-0.5 opacity-65" style={{ color: activeTab === 'checkin' ? colors.navActive : colors.navInactive }}>📱</Text>
                <Text className="text-[9px] font-bold uppercase tracking-wider" style={{ color: activeTab === 'checkin' ? colors.navActive : colors.navInactive }}>Check-in</Text>
                {activeTab === 'checkin' && <Text className="text-[10px] mt-[-4px]" style={{ color: colors.navActive }}>•</Text>}
              </TouchableOpacity>
            )}

            {(isUserAdmin || isUserBartender || isUserRecep) && (
              <TouchableOpacity 
                className="items-center justify-center py-1.5 px-4 rounded-xl min-w-[72px]" 
                style={activeTab === 'bartender' ? { backgroundColor: isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(212, 175, 55, 0.1)' } : {}}
                onPress={() => setTab('bartender')}
                activeOpacity={0.8}
              >
                <Text className="text-lg mb-0.5 opacity-65" style={{ color: activeTab === 'bartender' ? colors.navActive : colors.navInactive }}>🍺</Text>
                <Text className="text-[9px] font-bold uppercase tracking-wider" style={{ color: activeTab === 'bartender' ? colors.navActive : colors.navInactive }}>Bartender</Text>
                {activeTab === 'bartender' && <Text className="text-[10px] mt-[-4px]" style={{ color: colors.navActive }}>•</Text>}
              </TouchableOpacity>
            )}

            {(isUserAdmin || isUserRecep || isUserManager) && (
              <TouchableOpacity 
                className="items-center justify-center py-1.5 px-4 rounded-xl min-w-[72px]" 
                style={activeTab === 'tables' ? { backgroundColor: isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(212, 175, 55, 0.1)' } : {}}
                onPress={() => setTab('tables')}
                activeOpacity={0.8}
              >
                <Text className="text-lg mb-0.5 opacity-65" style={{ color: activeTab === 'tables' ? colors.navActive : colors.navInactive }}>🗺️</Text>
                <Text className="text-[9px] font-bold uppercase tracking-wider" style={{ color: activeTab === 'tables' ? colors.navActive : colors.navInactive }}>Tables</Text>
                {activeTab === 'tables' && <Text className="text-[10px] mt-[-4px]" style={{ color: colors.navActive }}>•</Text>}
              </TouchableOpacity>
            )}

            {(isUserAdmin || isUserManager) && (
              <TouchableOpacity 
                className="items-center justify-center py-1.5 px-4 rounded-xl min-w-[72px]" 
                style={activeTab === 'admin' ? { backgroundColor: isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(212, 175, 55, 0.1)' } : {}}
                onPress={() => setTab('admin')}
                activeOpacity={0.8}
              >
                <Text className="text-lg mb-0.5 opacity-65" style={{ color: activeTab === 'admin' ? colors.navActive : colors.navInactive }}>📈</Text>
                <Text className="text-[9px] font-bold uppercase tracking-wider" style={{ color: activeTab === 'admin' ? colors.navActive : colors.navInactive }}>Admin</Text>
                {activeTab === 'admin' && <Text className="text-[10px] mt-[-4px]" style={{ color: colors.navActive }}>•</Text>}
              </TouchableOpacity>
            )}
          </View>

        </View>
      )}

      {/* ACTIVE TOAST POPUPS CONTAINER */}
      <View 
        className="absolute top-20 z-[9999] gap-2 self-center"
        style={isCentered ? { width: '90%', maxWidth: 380 } : { left: 16, right: 16 }}
      >
        {toasts.map(toast => {
          // Compute toast styles based on state
          const getToastStyle = (type: string) => {
            switch (type) {
              case 'success': 
                return {
                  bg: isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                  border: '#22c55e',
                  text: isDark ? '#4ade80' : '#15803d',
                  icon: '🟢 '
                };
              case 'warning': 
                return {
                  bg: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
                  border: '#f59e0b',
                  text: isDark ? '#fbbf24' : '#b45309',
                  icon: '🟡 '
                };
              case 'danger': 
                return {
                  bg: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                  border: '#ef4444',
                  text: isDark ? '#f87171' : '#b91c1c',
                  icon: '🔴 '
                };
              default: 
                return {
                  bg: colors.card,
                  border: colors.border,
                  text: colors.text,
                  icon: 'ℹ️ '
                };
            }
          };
          const style = getToastStyle(toast.type);
          return (
            <View 
              key={toast.id} 
              className="py-3 px-4 rounded-xl shadow-2xl border flex-row items-center justify-center"
              style={{ 
                borderColor: style.border, 
                backgroundColor: style.bg,
                borderWidth: 1.5,
              }}
            >
              <Text className="text-[12px] font-black text-center leading-4" style={{ color: style.text }}>
                {style.icon}{toast.message}
              </Text>
            </View>
          );
        })}
      </View>

      {/* NOTIFICATIONS MODAL PANEL */}
      {isNotifsOpen && (
        <View className="absolute inset-0 z-50 justify-end" style={isCentered ? { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.overlay } : { backgroundColor: colors.overlay }}>
          <View 
            className={`border p-4 ${isCentered ? 'rounded-[24px]' : 'rounded-t-[20px]'}`}
            style={[
              { 
                paddingBottom: insets.bottom + 16,
                backgroundColor: colors.modal,
                borderColor: colors.border,
                borderWidth: 1,
              },
              isCentered 
                ? { width: '90%', maxWidth: 420, height: 500 }
                : { width: '100%', height: 480 + insets.bottom }
            ]}
          >
            <View className="flex-row justify-between items-center pb-3 mb-4 border-b" style={{ borderBottomColor: colors.divider }}>
              <Text className="text-base font-bold" style={{ color: colors.text }}>Notifications Log</Text>
              <TouchableOpacity onPress={() => setIsNotifsOpen(false)} className="w-11 h-11 rounded-full justify-center items-center" style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}>
                <AppIcon name="x" label="Dismiss" color={colors.muted} size={18} />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
              {notifications.map(notif => (
                <View key={notif.id} className="flex-row justify-between items-start py-3 border-b" style={{ borderBottomColor: colors.divider }}>
                  <View className="flex-grow flex-1 mr-4">
                    <Text className="font-bold text-xs" style={{ color: colors.text }}>{notif.title}</Text>
                    <Text className="text-[11px] mt-0.5 leading-4" style={{ color: colors.muted }}>{notif.message}</Text>
                  </View>
                  <Text className="font-mono text-[10px]" style={{ color: colors.muted }}>{notif.timestamp}</Text>
                </View>
              ))}
            </ScrollView>
            
            {/* Logout button at bottom of notifications */}
            {user && (
              <TouchableOpacity className="bg-red/10 border border-red py-[15px] rounded-xl items-center mt-3 justify-center" onPress={() => { setIsNotifsOpen(false); logout(); }}>
                <Text className="font-bold text-sm" style={{ color: colors.red }}>Log Out Session</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* FLOATING RETURN CARD WORKFLOW SHEET */}
      {isReturnModalOpen && (
        <ReturnCardModal onClose={() => setIsReturnModalOpen(false)} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({});

export default MainAppShell;
