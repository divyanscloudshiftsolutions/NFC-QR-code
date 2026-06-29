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
import { useResponsive } from '../../utils/responsive';

export const MainAppShell: React.FC = () => {
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
      default: return 'bg-[#1a1d26]/90';
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
            className="flex-row justify-around items-center py-1.5 bg-[#070709] border-t border-white/5"
            style={{ paddingBottom: insets.bottom, height: 60 + insets.bottom }}
          >
            {(isUserAdmin || isUserRecep) && (
              <TouchableOpacity 
                className={`items-center justify-center py-1.5 px-4 rounded-xl min-w-[72px] ${activeTab === 'checkin' ? 'bg-gold/10' : ''}`} 
                onPress={() => setTab('checkin')}
                activeOpacity={0.8}
              >
                <Text className={`text-lg mb-0.5 opacity-65`} style={{ color: activeTab === 'checkin' ? '#f5a623' : '#9ca3af' }}>📱</Text>
                <Text className={`text-[9px] font-bold uppercase tracking-wider`} style={{ color: activeTab === 'checkin' ? '#f5a623' : '#9ca3af' }}>Check-in</Text>
                {activeTab === 'checkin' && <Text className="text-gold text-[10px] mt-[-4px]">•</Text>}
              </TouchableOpacity>
            )}

            {(isUserAdmin || isUserBartender || isUserRecep) && (
              <TouchableOpacity 
                className={`items-center justify-center py-1.5 px-4 rounded-xl min-w-[72px] ${activeTab === 'bartender' ? 'bg-gold/10' : ''}`} 
                onPress={() => setTab('bartender')}
                activeOpacity={0.8}
              >
                <Text className={`text-lg mb-0.5 opacity-65`} style={{ color: activeTab === 'bartender' ? '#f5a623' : '#9ca3af' }}>🍺</Text>
                <Text className={`text-[9px] font-bold uppercase tracking-wider`} style={{ color: activeTab === 'bartender' ? '#f5a623' : '#9ca3af' }}>Bartender</Text>
                {activeTab === 'bartender' && <Text className="text-gold text-[10px] mt-[-4px]">•</Text>}
              </TouchableOpacity>
            )}

            {(isUserAdmin || isUserRecep || isUserManager) && (
              <TouchableOpacity 
                className={`items-center justify-center py-1.5 px-4 rounded-xl min-w-[72px] ${activeTab === 'tables' ? 'bg-gold/10' : ''}`} 
                onPress={() => setTab('tables')}
                activeOpacity={0.8}
              >
                <Text className={`text-lg mb-0.5 opacity-65`} style={{ color: activeTab === 'tables' ? '#f5a623' : '#9ca3af' }}>🗺️</Text>
                <Text className={`text-[9px] font-bold uppercase tracking-wider`} style={{ color: activeTab === 'tables' ? '#f5a623' : '#9ca3af' }}>Tables</Text>
                {activeTab === 'tables' && <Text className="text-gold text-[10px] mt-[-4px]">•</Text>}
              </TouchableOpacity>
            )}

            {(isUserAdmin || isUserManager) && (
              <TouchableOpacity 
                className={`items-center justify-center py-1.5 px-4 rounded-xl min-w-[72px] ${activeTab === 'admin' ? 'bg-gold/10' : ''}`} 
                onPress={() => setTab('admin')}
                activeOpacity={0.8}
              >
                <Text className={`text-lg mb-0.5 opacity-65`} style={{ color: activeTab === 'admin' ? '#f5a623' : '#9ca3af' }}>📈</Text>
                <Text className={`text-[9px] font-bold uppercase tracking-wider`} style={{ color: activeTab === 'admin' ? '#f5a623' : '#9ca3af' }}>Admin</Text>
                {activeTab === 'admin' && <Text className="text-gold text-[10px] mt-[-4px]">•</Text>}
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
        {toasts.map(toast => (
          <View 
            key={toast.id} 
            className={`py-3 px-4 rounded-xl shadow-lg border border-white/5 ${getToastBg(toast.type)}`}
          >
            <Text className="text-[12px] font-bold text-center leading-4" style={{ color: '#ffffff' }}>{toast.message}</Text>
          </View>
        ))}
      </View>

      {/* NOTIFICATIONS MODAL PANEL */}
      {isNotifsOpen && (
        <View className={`absolute inset-0 bg-black/65 z-50 ${isCentered ? 'justify-center items-center' : 'justify-end'}`}>
          <View 
            className={`bg-surface border border-borderDark p-4 ${isCentered ? 'rounded-[24px]' : 'rounded-t-[20px]'}`}
            style={[
              { 
                paddingBottom: insets.bottom + 16,
              },
              isCentered 
                ? { width: '90%', maxWidth: 420, height: 500 }
                : { width: '100%', height: 480 + insets.bottom }
            ]}
          >
            <View className="flex-row justify-between items-center pb-3 mb-4 border-b border-white/5">
              <Text className="text-base font-bold text-themeText" style={{ color: '#f0ede6' }}>Notifications Log</Text>
              <TouchableOpacity onPress={() => setIsNotifsOpen(false)} className="w-11 h-11 rounded-full bg-themeInput justify-center items-center">
                <AppIcon name="x" label="Dismiss" color="#7a7d8a" size={18} />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
              {notifications.map(notif => (
                <View key={notif.id} className="flex-row justify-between items-start py-3 border-b border-white/5">
                  <View className="flex-grow flex-1 mr-4">
                    <Text className="text-themeText font-bold text-xs" style={{ color: '#f0ede6' }}>{notif.title}</Text>
                    <Text className="text-muted text-[11px] mt-0.5 leading-4">{notif.message}</Text>
                  </View>
                  <Text className="font-mono text-muted text-[10px]">{notif.timestamp}</Text>
                </View>
              ))}
            </ScrollView>
            
            {/* Logout button at bottom of notifications */}
            {user && (
              <TouchableOpacity className="bg-red/10 border border-red py-[15px] rounded-xl items-center mt-3 justify-center" onPress={() => { setIsNotifsOpen(false); logout(); }}>
                <Text className="font-bold text-sm" style={{ color: '#e63946' }}>Log Out Session</Text>
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
