import React, { useState } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, ScrollView, 
  Platform, StatusBar, BackHandler, Alert, Animated, Easing, useWindowDimensions
} from 'react-native';
import { AnimatedToast } from '../../components/common/AnimatedToast';
import { AlertModal } from '../../components/common/AlertModal';
import { EmptyState } from '../../components/common/EmptyState';
import { ANIMATIONS } from '../../theme/animations';
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
  const { currentScreen, activeTab, toasts, notifications, user, logout, setTab, markNotificationsAsRead, isOverlayActive, swipeLocked, fetchLatestState, showToast } = useNfcBar();
  const { isTablet, isLargeScreen } = useResponsive();
  const isCentered = isTablet || isLargeScreen;
  const { width } = useWindowDimensions();
  
  const [showSplash, setShowSplash] = useState(true);
  const [isNotifsOpen, setIsNotifsOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

  // References for Scroll Paging
  const scrollViewRef = React.useRef<ScrollView>(null);
  const lastBackPressTime = React.useRef<number>(0);
  const isTransitioning = React.useRef<boolean>(false);

  // Sync state with backend on tab changes
  React.useEffect(() => {
    if (currentScreen === 'app' && user) {
      fetchLatestState().catch(err => console.log('Failed to refresh state on tab change:', err));
    }
  }, [activeTab, currentScreen, user]);

  // Construct allowed tabs list based on user roles
  const isUserRecep = user?.role === UserRole.RECEPTIONIST;
  const isUserAdmin = user?.role === UserRole.ADMIN;
  const isUserManager = user?.role === UserRole.MANAGER;
  const isUserBartender = user?.role === UserRole.BARTENDER;

  const allowedTabs = React.useMemo(() => {
    const tabs: ('checkin' | 'bartender' | 'tables' | 'admin')[] = [];
    if (isUserAdmin || isUserRecep) tabs.push('checkin');
    if (isUserAdmin || isUserBartender || isUserRecep) tabs.push('bartender');
    if (isUserAdmin || isUserRecep || isUserManager) tabs.push('tables');
    if (isUserAdmin || isUserManager) tabs.push('admin');
    return tabs;
  }, [user]);

  // Track visited/adjacent tabs for smart lazy loading
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (user && activeTab) {
      setVisitedTabs(new Set([activeTab]));
    }
  }, [user]);

  React.useEffect(() => {
    if (activeTab && allowedTabs.length > 0) {
      setVisitedTabs(prev => {
        const next = new Set(prev);
        next.add(activeTab);

        const activeIndex = allowedTabs.indexOf(activeTab);
        if (activeIndex !== -1) {
          if (activeIndex > 0) {
            next.add(allowedTabs[activeIndex - 1]);
          }
          if (activeIndex < allowedTabs.length - 1) {
            next.add(allowedTabs[activeIndex + 1]);
          }
        }
        return next;
      });
    }
  }, [activeTab, allowedTabs]);

  // Unique Navigation History stack (MRU order)
  const [navHistory, setNavHistory] = useState<string[]>([]);

  React.useEffect(() => {
    if (user) {
      let defaultTab: 'checkin' | 'bartender' | 'tables' | 'admin' = 'checkin';
      if (user.role === UserRole.BARTENDER) {
        defaultTab = 'bartender';
      } else if (user.role === UserRole.MANAGER) {
        defaultTab = 'tables';
      }
      setNavHistory([defaultTab]);
    }
  }, [user]);

  React.useEffect(() => {
    if (activeTab && user) {
      setNavHistory(prev => {
        if (prev[prev.length - 1] === activeTab) {
          return prev;
        }
        const filtered = prev.filter(t => t !== activeTab);
        return [...filtered, activeTab];
      });
    }
  }, [activeTab, user]);

  // Synchronize ScrollView offset when activeTab changes programmatically (e.g. from tab bar taps or history rollback)
  React.useEffect(() => {
    const index = allowedTabs.indexOf(activeTab);
    if (index !== -1 && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ x: index * width, animated: true });
    }
  }, [activeTab, allowedTabs, width]);

  // Android hardware back button handler
  React.useEffect(() => {
    const handleBackPress = () => {
      if (isTransitioning.current) return true; // Throttling rapid presses

      // 1. Close Notifications if open
      if (isNotifsOpen) {
        setIsNotifsOpen(false);
        return true;
      }

      // 2. Close Return Card Modal if open
      if (isReturnModalOpen) {
        setIsReturnModalOpen(false);
        return true;
      }

      // 3. Rollback tab history if length > 1
      if (navHistory.length > 1) {
        const updatedHistory = [...navHistory];
        updatedHistory.pop(); // Remove current active tab
        const previousTab = updatedHistory[updatedHistory.length - 1];

        isTransitioning.current = true;
        setTab(previousTab as any);
        setNavHistory(updatedHistory);

        setTimeout(() => {
          isTransitioning.current = false;
        }, 350);
        return true;
      }

      // 4. Handle exit on root screen
      if (currentScreen === 'login' || currentScreen === 'app') {
        const now = Date.now();
        if (now - lastBackPressTime.current < 2000) {
          BackHandler.exitApp();
          return true;
        }
        lastBackPressTime.current = now;
        showToast('Press back again to exit the application.', 'info');
        return true;
      }

      return false;
    };

    let subscription: any;
    if (Platform.OS === 'android') {
      subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    }
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [currentScreen, navHistory, isNotifsOpen, isReturnModalOpen, user]);

  const handleScrollEnd = (e: any) => {
    const contentOffset = e.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / width);
    if (index >= 0 && index < allowedTabs.length) {
      const targetTab = allowedTabs[index];
      if (activeTab !== targetTab) {
        setTab(targetTab);
      }
    }
  };

  // safe area offsets
  const insets = useSafeAreaInsets();

  const handleOpenNotifications = () => {
    markNotificationsAsRead();
    setIsNotifsOpen(true);
  };

  const renderTabContent = (tab: 'checkin' | 'bartender' | 'tables' | 'admin', isSelected: boolean) => {
    switch (tab) {
      case 'checkin': return <CheckInWizard isActive={isSelected} />;
      case 'bartender': return <BartenderPortal isActive={isSelected} />;
      case 'tables': return <TablesPortal isActive={isSelected} />;
      case 'admin': return <AdminPortal isActive={isSelected} />;
    }
  };

  if (showSplash && currentScreen === 'splash') {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

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
            <ScrollView
              ref={scrollViewRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              bounces={false}
              onMomentumScrollEnd={handleScrollEnd}
              scrollEnabled={allowedTabs.length > 1 && !isOverlayActive && !isReturnModalOpen && !isNotifsOpen && !swipeLocked}
              contentContainerStyle={{ width: width * allowedTabs.length }}
              style={Platform.OS === 'web' ? ({ overscrollBehaviorX: 'contain' } as any) : undefined}
            >
              {allowedTabs.map((tab) => {
                const isSelected = activeTab === tab;
                const isMounted = visitedTabs.has(tab);

                return (
                  <View key={tab} style={{ width: width, flex: 1 }}>
                    {isMounted ? (
                      renderTabContent(tab, isSelected)
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                  </View>
                );
              })}
            </ScrollView>
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
        {toasts.map(toast => (
          <AnimatedToast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            onDismiss={() => {}}
          />
        ))}
      </View>

      {/* NOTIFICATIONS LOG DIALOG OVERLAY */}
      <AlertModal
        visible={isNotifsOpen}
        onClose={() => setIsNotifsOpen(false)}
        title="Notifications Log"
      >
        <View style={{ maxHeight: 380 }}>
          {notifications.length === 0 ? (
            <EmptyState 
              icon="info" 
              title="No Notifications" 
              description="Your notifications log is currently empty." 
            />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
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
          )}
          
          {/* Logout button at bottom of notifications */}
          {user && (
            <TouchableOpacity 
              className="bg-red/10 border border-red py-[15px] rounded-xl items-center mt-3 justify-center" 
              style={{ borderColor: colors.red }}
              onPress={() => { setIsNotifsOpen(false); logout(); }}
            >
              <Text className="font-bold text-sm" style={{ color: colors.red }}>Log Out Session</Text>
            </TouchableOpacity>
          )}
        </View>
      </AlertModal>

      {/* FLOATING RETURN CARD WORKFLOW SHEET */}
      {isReturnModalOpen && (
        <ReturnCardModal onClose={() => setIsReturnModalOpen(false)} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({});

export default MainAppShell;
