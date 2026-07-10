import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, Modal, StyleSheet, ActivityIndicator, Image, Share, Alert
} from 'react-native';
import { useNfcBar } from '../../../context/NfcBarContext';
import { Table, PlaceType, TableStatus, TokenStatus, StaffMember, InventoryCard, CardStatus, RateCard, SessionToken } from '../../../types/nfc_bar';
import { AppIcon } from '../../../components/common/AppIcon';
import { useTheme } from '../../../context/ThemeContext';
import { AlertModal } from '../../../components/common/AlertModal';
import { SkeletonLoader } from '../../../components/common/SkeletonLoader';
import { useActionProgress } from '../../../utils/actionProgress';

export const AdminPortal: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
  const { colors, isDark } = useTheme();
  const { loadingAction, secondsLeft, startAction, stopAction, isProcessing } = useActionProgress();
  const { 
    sessions, adminSessions, tables, users, cards, rates, user: loggedUser, addTable, editTable, updateTableStatus, deleteTable,
    registerStaff, updateStaff, updateStaffStatus, fetchCards, updateCardStatus, fetchRates, updateRateCard, fetchUsers,
    salesSummary, tableUtilization, hourlyBreakdown, fetchReports, showToast,
    nfcEnabled, emailQrEnabled, updateDeliveryAvailability,
    fetchAdminSessions, adminDeactivateSession, extendSessionTime, systemMode, exportSessionsCSV, setOverlayActive
  } = useNfcBar();
  const [adminSubTab, setAdminSubTab] = useState<'live' | 'tables' | 'staff' | 'chart' | 'cards' | 'rates' | 'settings' | 'customers'>('live');
  const [isTabLoading, setIsTabLoading] = useState(false);

  // Card inventory search & filter state
  const [cardSearch, setCardSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<'all' | 'available' | 'assigned' | 'lost' | 'damaged' | 'inactive'>('all');

  // Customer sessions tab state
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState<'all' | 'active' | 'extended' | 'expired' | 'pending_payment' | 'closed' | 'cancelled'>('all');
  const [customerSort, setCustomerSort] = useState<'latest_first' | 'oldest_first' | 'expiring_soon' | 'recently_updated' | 'customer_name' | 'table_number'>('latest_first');
  const [visibleSessionsCount, setVisibleSessionsCount] = useState(10);
  const [selectedDetailsSession, setSelectedDetailsSession] = useState<SessionToken | null>(null);
  
  const [deactivateConfirmModalOpen, setDeactivateConfirmModalOpen] = useState(false);
  const [deactivateTargetSession, setDeactivateTargetSession] = useState<{ tokenNumber: string; status: TokenStatus; customerName: string } | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [forceRelease, setForceRelease] = useState(false);

  useEffect(() => {
    setVisibleSessionsCount(10);
  }, [customerStatusFilter, customerSearch, customerSort]);

  // Extend Session modal states (Admin)
  const [isAdminExtendModalOpen, setIsAdminExtendModalOpen] = useState(false);
  const [selectedAdminSession, setSelectedAdminSession] = useState<SessionToken | null>(null);
  const [adminExtendPaymentMode, setAdminExtendPaymentMode] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [adminExtendRefId, setAdminExtendRefId] = useState('');
  const [isAdminExtendingLoading, setIsAdminExtendingLoading] = useState(false);

  // Rate Modal state
  const [isEditRateOpen, setIsEditRateOpen] = useState(false);
  const [selectedRate, setSelectedRate] = useState<RateCard | null>(null);
  const [editRateName, setEditRateName] = useState('');
  const [editRatePrice, setEditRatePrice] = useState('');
  const [editRateDuration, setEditRateDuration] = useState('');
  const [editRateAllowance, setEditRateAllowance] = useState('');

  // Report filters state
  const [reportFilter, setReportFilter] = useState<'day' | 'week' | 'month' | 'custom'>('day');
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [timeTick, setTimeTick] = useState(0);

  const handleExportCSV = async () => {
    try {
      showToast('Preparing CSV export...', 'info');
      const csvContent = await exportSessionsCSV(customerStatusFilter);
      if (!csvContent) {
        showToast('Export failed or returned empty', 'danger');
        return;
      }
      await Share.share({
        message: csvContent,
        title: `Sessions Export (${customerStatusFilter})`
      });
      showToast('CSV export shared!', 'success');
    } catch (error: any) {
      showToast(`Export error: ${error.message}`, 'danger');
    }
  };

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      setTimeTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setIsTabLoading(true);
      try {
        if (adminSubTab === 'cards') {
          await fetchCards();
        } else if (adminSubTab === 'rates') {
          await fetchRates();
        } else if (adminSubTab === 'chart') {
          await fetchReports(reportFilter, startDateStr || undefined, endDateStr || undefined);
        } else if (adminSubTab === 'customers') {
          await fetchAdminSessions();
        } else if (adminSubTab === 'staff') {
          await fetchUsers();
        } else if (adminSubTab === 'live') {
          await fetchReports('day');
        }
      } catch (e) {
        // ignore
      } finally {
        if (active) setIsTabLoading(false);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, [adminSubTab, reportFilter, startDateStr, endDateStr]);

  // 5-second periodic background polling for active admin subtabs
  useEffect(() => {
    if (systemMode === 'offline' || !isActive) return;

    const syncTimer = setInterval(() => {
      if (adminSubTab === 'cards') {
        fetchCards().catch(() => {});
      } else if (adminSubTab === 'rates') {
        fetchRates().catch(() => {});
      } else if (adminSubTab === 'chart') {
        fetchReports(reportFilter, startDateStr || undefined, endDateStr || undefined).catch(() => {});
      } else if (adminSubTab === 'customers') {
        fetchAdminSessions().catch(() => {});
      } else if (adminSubTab === 'live') {
        fetchReports('day').catch(() => {});
      }
    }, 5000);

    return () => clearInterval(syncTimer);
  }, [adminSubTab, reportFilter, startDateStr, endDateStr, systemMode, isActive]);

  useEffect(() => {
    setOverlayActive(isActive && isProcessing);
    return () => setOverlayActive(false);
  }, [isActive, isProcessing, setOverlayActive]);

  // Sync selectedAdminSession details whenever global adminSessions array updates
  useEffect(() => {
    if (selectedAdminSession) {
      const updated = adminSessions.find(s => s.tokenNumber === selectedAdminSession.tokenNumber);
      if (updated) {
        setSelectedAdminSession(updated);
      }
    }
  }, [adminSessions]);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [isTabDropdownOpen, setIsTabDropdownOpen] = useState(false);

  // Form states
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newPlaceType, setNewPlaceType] = useState<'STANDING_BAR' | 'PREMIUM_LOUNGE'>('STANDING_BAR');
  const [newCapacity, setNewCapacity] = useState('2');
  const [editCapacity, setEditCapacity] = useState('2');

  // Staff Modals state
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [isEditStaffOpen, setIsEditStaffOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  // Staff Form states
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffFullName, setNewStaffFullName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'admin' | 'receptionist' | 'bartender' | 'manager'>('receptionist');
  const [newStaffPassword, setNewStaffPassword] = useState('');

  // Staff Edit Form states
  const [editStaffUsername, setEditStaffUsername] = useState('');
  const [editStaffFullName, setEditStaffFullName] = useState('');
  const [editStaffRole, setEditStaffRole] = useState<'admin' | 'receptionist' | 'bartender' | 'manager'>('receptionist');
  const [editStaffIsActive, setEditStaffIsActive] = useState(true);
  const [editStaffPassword, setEditStaffPassword] = useState('');

  // Settings tab local states
  const [localNfcEnabled, setLocalNfcEnabled] = useState(nfcEnabled);
  const [localEmailQrEnabled, setLocalEmailQrEnabled] = useState(emailQrEnabled);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    setLocalNfcEnabled(nfcEnabled);
    setLocalEmailQrEnabled(emailQrEnabled);
  }, [nfcEnabled, emailQrEnabled]);

  const formatTimeRemaining = (timeDiff: number) => {
    if (timeDiff <= 0) return 'Expired';
    const totalSecs = Math.floor(timeDiff / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  };

  // Real-time Visual Validators
  // 1. Add Table Modal
  const isNewTableNumberValid = /^[SL]-\d{2,3}$/.test(newTableNumber.trim().toUpperCase());
  const capNumVal = parseInt(newCapacity, 10);
  const isNewCapacityValid = !isNaN(capNumVal) && capNumVal >= 1 && capNumVal <= 100;
  const isAddTableFormValid = isNewTableNumberValid && isNewCapacityValid;

  // 2. Edit Table Modal
  const editCapNumVal = parseInt(editCapacity, 10);
  const isEditCapacityValid = !isNaN(editCapNumVal) && editCapNumVal >= 1 && editCapNumVal <= 100;

  // 3. Add Staff Modal
  const isNewStaffFullNameValid = /^[a-zA-Z\s.'-]{2,100}$/.test(newStaffFullName.trim());
  const expectedNewStaffPrefix = newStaffRole === 'admin' ? 'ADM' : (newStaffRole === 'receptionist' ? 'REC' : (newStaffRole === 'bartender' ? 'BAR' : 'MGR'));
  const isNewStaffUsernameValid = new RegExp('^' + expectedNewStaffPrefix + '-\\d{2}$').test(newStaffUsername.trim().toUpperCase());
  const isNewStaffPasswordValid = /^\d{4}$/.test(newStaffPassword.trim());
  const isAddStaffFormValid = isNewStaffFullNameValid && isNewStaffUsernameValid && isNewStaffPasswordValid;

  // 4. Edit Staff Modal
  const isEditStaffFullNameValid = /^[a-zA-Z\s.'-]{2,100}$/.test(editStaffFullName.trim());
  const expectedEditStaffPrefix = editStaffRole === 'admin' ? 'ADM' : (editStaffRole === 'receptionist' ? 'REC' : (editStaffRole === 'bartender' ? 'BAR' : 'MGR'));
  const isEditStaffUsernameValid = new RegExp('^' + expectedEditStaffPrefix + '-\\d{2}$').test(editStaffUsername.trim().toUpperCase());
  const isEditStaffPasswordValid = editStaffPassword.trim() === '' || /^\d{4}$/.test(editStaffPassword.trim());
  const isEditStaffFormValid = isEditStaffFullNameValid && isEditStaffUsernameValid && isEditStaffPasswordValid;

  // 5. Edit Rate Modal
  const isEditRateNameValid = editRateName.trim().length > 0;
  const editRatePriceFloat = parseFloat(editRatePrice);
  const isEditRatePriceValid = !isNaN(editRatePriceFloat) && editRatePriceFloat >= 0;
  const editRateDurationFloat = parseFloat(editRateDuration);
  const isEditRateDurationValid = !isNaN(editRateDurationFloat) && editRateDurationFloat >= 0.5 && editRateDurationFloat <= 24;
  const editRateAllowanceInt = parseInt(editRateAllowance, 10);
  const isEditRateAllowanceValid = !isNaN(editRateAllowanceInt) && editRateAllowanceInt >= 0 && editRateAllowanceInt <= 50;
  const isEditRateFormValid = isEditRateNameValid && isEditRatePriceValid && isEditRateDurationValid && isEditRateAllowanceValid;

  // KPI figures
  const totalCollections = sessions.reduce((sum, s) => sum + s.amountPaid, 0);
  const activeCount = sessions.filter(s => s.status === TokenStatus.ACTIVE && s.paymentVerified === true).length;
  const guestCount = sessions.filter(s => s.status === TokenStatus.ACTIVE && s.paymentVerified === true).reduce((sum, s) => sum + s.persons, 0);
  const totalDrinksRedeemed = sessions.reduce((sum, s) => sum + s.redemptionCount, 0);

  // Chart data
  const hourlyData = [
    { hour: '6 PM', amount: 12500 },
    { hour: '7 PM', amount: 24200 },
    { hour: '8 PM', amount: 41800 },
    { hour: '9 PM', amount: 62500 },
    { hour: '10 PM', amount: 94800, peak: true },
    { hour: '11 PM', amount: 82100 },
    { hour: '12 AM', amount: 58000 },
    { hour: '1 AM', amount: 31200 },
  ];
  
  const maxVal = Math.max(...hourlyData.map(d => d.amount));

  const handleAdminExtend = async () => {
    if (!selectedAdminSession) return;
    if (!startAction('admin_extend')) return;
    
    const rateCard = rates.find(r => r.placeType === selectedAdminSession.placeType);
    const rate = rateCard ? rateCard.ratePerPerson : (selectedAdminSession.placeType === 'PREMIUM_LOUNGE' ? 1200 : 500);
    const duration = rateCard?.durationHours || 2;
    const amount = rate * selectedAdminSession.persons * (1 / duration);

    setIsAdminExtendingLoading(true);
    try {
      const success = await extendSessionTime(selectedAdminSession.tokenNumber, 1, amount);
      stopAction();
      setIsAdminExtendingLoading(false);
      if (success) {
        setIsAdminExtendModalOpen(false);
        setSelectedAdminSession(null);
        setAdminExtendRefId('');
        setAdminExtendPaymentMode('CASH');
        await fetchAdminSessions();
      }
    } catch (e) {
      stopAction();
      setIsAdminExtendingLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-themeBg p-4" style={{ backgroundColor: colors.bg, paddingBottom: 0 }}>
      {/* Sticky top container: reserves appropriate layout height, no clipping */}
      <View style={{ flexShrink: 0, paddingBottom: 6, zIndex: 10 }}>
        {/* Screen Header */}
        <View style={{ flexShrink: 0 }}>
          <View className="flex-row justify-between items-center">
            <Text className="text-[10px] font-bold text-red uppercase tracking-widest">ADMIN</Text>
            <Text className="text-muted text-[10px] font-bold uppercase tracking-wider">
              {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          <Text className="text-2xl font-bold text-themeText mt-0.5" style={{ color: colors.text }}>Dashboard</Text>
        </View>

        {/* Horizontally scrollable KPI summary cards */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingVertical: 2, paddingHorizontal: 2 }}
          style={{ flexGrow: 0, marginVertical: 4 }}
        >
          {/* Card 1: Revenue */}
          <View style={{ width: 145, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 14, justifyContent: 'center' }}>
            <View className="flex-row items-center gap-1.5 mb-1">
              <AppIcon name="credit-card" label="Revenue Logo" color="colors.gold" size={12} />
              <Text className="text-muted text-[9px] font-bold uppercase tracking-wider">Revenue</Text>
            </View>
            <Text className="font-mono text-themeText text-base font-extrabold" style={{ color: colors.text }}>₹{((salesSummary?.todaySales || 0) / 1000).toFixed(1)}K</Text>
            <Text className="text-[8px] font-semibold mt-0.5" style={{ color: colors.success }}>+12.4% today</Text>
          </View>

          {/* Card 2: Guests */}
          <View style={{ width: 145, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 14, justifyContent: 'center' }}>
            <View className="flex-row items-center gap-1.5 mb-1">
              <AppIcon name="users" label="Guests Logo" color="#4ecdc4" size={12} />
              <Text className="text-muted text-[9px] font-bold uppercase tracking-wider">Guests</Text>
            </View>
            <Text className="font-mono text-themeText text-base font-extrabold" style={{ color: colors.text }}>{salesSummary?.totalCustomers || 0}</Text>
            <Text className="text-[8px] font-semibold mt-0.5" style={{ color: colors.success }}>{activeCount} active groups</Text>
          </View>

          {/* Card 3: Served */}
          <View style={{ width: 145, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 14, justifyContent: 'center' }}>
            <View className="flex-row items-center gap-1.5 mb-1">
              <AppIcon name="cup" label="Served Logo" color="colors.gold" size={12} />
              <Text className="text-muted text-[9px] font-bold uppercase tracking-wider">Served</Text>
            </View>
            <Text className="font-mono text-themeText text-base font-extrabold" style={{ color: colors.text }}>{salesSummary?.todayRedemptions || 0}</Text>
            <Text className="text-[8px] font-semibold mt-0.5" style={{ color: colors.success }}>coupons redeemed</Text>
          </View>

          {/* Card 4: Peak Hour */}
          <View style={{ width: 145, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 14, justifyContent: 'center' }}>
            <View className="flex-row items-center gap-1.5 mb-1">
              <AppIcon name="chart" label="Peak Logo" color="colors.red" size={12} />
              <Text className="text-muted text-[9px] font-bold uppercase tracking-wider">Peak Hour</Text>
            </View>
            <Text className="font-mono text-themeText text-base font-extrabold" style={{ color: colors.text }}>10 PM</Text>
            <Text className="text-[8px] font-semibold mt-0.5" style={{ color: colors.red }}>94.8K Busiest shift</Text>
          </View>
        </ScrollView>

        {/* Horizontally scrollable row of tabs */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingRight: 8 }}
            style={{ flex: 1 }}
          >
            {[
              { tab: 'live', label: 'Tokens', icon: '📱' },
              { tab: 'tables', label: 'Tables', icon: '🪑' },
              { tab: 'cards', label: 'Cards', icon: '💳' },
              { tab: 'rates', label: 'Rates', icon: '💰' },
              { tab: 'staff', label: 'Staff', icon: '👥' },
              { tab: 'chart', label: 'Charts', icon: '📈' },
              { tab: 'settings', label: 'Settings', icon: '⚙️' },
              { tab: 'customers', label: 'Customers', icon: '👤' },
            ].map((item) => {
              const isActive = adminSubTab === item.tab;
              return (
                <TouchableOpacity
                  key={item.tab}
                  style={{
                    backgroundColor: isActive ? (isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(212, 175, 55, 0.1)') : colors.card,
                    borderWidth: 1,
                    borderColor: isActive ? colors.gold : colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4
                  }}
                  onPress={() => {
                    setAdminSubTab(item.tab as any);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 11 }}>{item.icon}</Text>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: isActive ? colors.gold : colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Full-width Search Bar fixed under tabs */}
        {adminSubTab === 'cards' && (
          <View style={{ flexDirection: 'row', backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, marginTop: 4, alignItems: 'center' }}>
            <AppIcon name="search" label="Search cards" size={12} color={colors.muted} />
            <TextInput
              style={{ flex: 1, marginLeft: 6, color: colors.text, fontSize: 11, padding: 0 }}
              placeholder="Search by card UID..."
              placeholderTextColor={colors.placeholder}
              value={cardSearch}
              onChangeText={setCardSearch}
              autoCapitalize="characters"
            />
            {cardSearch ? (
              <TouchableOpacity onPress={() => setCardSearch('')}>
                <AppIcon name="x" label="Clear search" size={12} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {adminSubTab === 'customers' && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center' }}>
              <AppIcon name="search" label="Search sessions" size={12} color={colors.muted} />
              <TextInput
                style={{ flex: 1, marginLeft: 6, color: colors.text, fontSize: 11, padding: 0 }}
                placeholder="Search by name, phone, table, or token..."
                placeholderTextColor={colors.placeholder}
                value={customerSearch}
                onChangeText={setCustomerSearch}
              />
              {customerSearch ? (
                <TouchableOpacity onPress={() => setCustomerSearch('')}>
                  <AppIcon name="x" label="Clear search" size={12} color={colors.muted} />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity 
              style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' }}
              onPress={handleExportCSV}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <AppIcon name="download" label="Export CSV" size={12} color={colors.gold} />
                <Text style={{ color: colors.gold, fontSize: 9.5, fontWeight: 'bold' }}>Export</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Dynamic Sub-Views: Occupies 100% of the remaining height, fully scrollable independently */}
      <View style={{ flex: 1 }}>
        {adminSubTab === 'live' && (
        <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <Text className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">Live tokens database</Text>
          {sessions.filter(s => s.status === TokenStatus.ACTIVE && s.paymentVerified === true).map(session => {
            // Expiring check
            const diff = new Date(session.endTime).getTime() - Date.now();
            const isExpiring = diff > 0 && diff < 15 * 60 * 1000; // less than 15 mins
            const isExpired = diff <= 0;

            return (
              <View 
                key={session.id} 
                className={`flex-row justify-between items-center bg-transparent border border-transparent rounded-xl p-3.5 mb-2
                  ${(isExpiring || isExpired) ? 'border-red/25 bg-red/5' : ''}
                `}
              >
                <View className="flex-1">
                  <Text className="text-themeText font-bold text-xs" style={{ color: colors.text }}>{session.customerName}</Text>
                  <Text className="text-muted text-[10px] mt-0.5">
                    Table {session.tableNumber} • Redeemed {session.redemptionCount}/{session.redemptionLimit} drinks
                  </Text>
                </View>
                <View className="items-end">
                  <Text className={`font-bold text-xs ${(isExpiring || isExpired) ? 'text-red' : 'text-gold'}`}>
                    {isExpired ? 'Expired' : `${formatTimeRemaining(diff)} left`}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Quick Management shortcuts */}
          <Text className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3 mt-4">Operational Registries</Text>
          <View className="bg-transparent border border-transparent rounded-xl p-2.5 mb-4">
            <TouchableOpacity 
              className="flex-row justify-between items-center py-2.5 border-b border-transparent bg-transparent"
              onPress={() => setAdminSubTab('rates')}
            >
              <Text className="text-themeText font-semibold text-xs" style={{ color: colors.text }}>Rate Card Management</Text>
              <Text style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1, color: colors.gold, fontFamily: 'monospace', fontSize: 9, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>{rates.length} Zones</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className="flex-row justify-between items-center py-2.5 border-b border-transparent"
              onPress={() => setAdminSubTab('cards')}
            >
              <Text className="text-themeText font-semibold text-xs" style={{ color: colors.text }}>Smart Card Inventory</Text>
              <Text style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1, color: colors.gold, fontFamily: 'monospace', fontSize: 9, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>{cards.length} Cards</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className="flex-row justify-between items-center py-2.5"
              onPress={() => setAdminSubTab('staff')}
            >
              <Text className="text-themeText font-semibold text-xs" style={{ color: colors.text }}>Staff User Management</Text>
              <Text style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1, color: colors.gold, fontFamily: 'monospace', fontSize: 9, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>{users.length} Accounts</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Cards Manager Sub-Tab */}
      {adminSubTab === 'cards' && (
        <View className="flex-1" style={{ backgroundColor: colors.bg }}>
          {/* Card KPIs as Filter Buttons */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
            {[
              { label: 'Total', filterVal: 'all' as const, count: cards.length, color: colors.text },
              { label: 'Available', filterVal: 'available' as const, count: cards.filter(c => c.status.toLowerCase() === 'available').length, color: 'colors.success' },
              { label: 'Assigned', filterVal: 'assigned' as const, count: cards.filter(c => c.status.toLowerCase() === 'assigned').length, color: 'colors.gold' },
              { label: 'Lost', filterVal: 'lost' as const, count: cards.filter(c => c.status.toLowerCase() === 'lost').length, color: 'colors.red' },
              { label: 'Damaged', filterVal: 'damaged' as const, count: cards.filter(c => c.status.toLowerCase() === 'damaged').length, color: colors.muted },
              { label: 'Inactive', filterVal: 'inactive' as const, count: cards.filter(c => c.status.toLowerCase() === 'inactive').length, color: '#a78bfa' },
            ].map((stat) => {
              const isActive = cardFilter === stat.filterVal;
              return (
                <View key={stat.label} style={{ width: '33.33%', padding: 4 }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: isActive ? (isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(212, 175, 55, 0.1)') : colors.card,
                      borderWidth: 1,
                      borderColor: isActive ? colors.gold : colors.border,
                      paddingVertical: 10,
                      borderRadius: 12,
                      alignItems: 'center'
                    }}
                    onPress={() => setCardFilter(stat.filterVal)}
                    activeOpacity={0.8}
                  >
                    <Text className="text-themeText text-[8px] font-bold uppercase tracking-wider" style={{ color: isActive ? colors.gold : colors.text }}>{stat.label}</Text>
                    <Text className="font-mono text-sm font-extrabold mt-0.5" style={{ color: stat.color }}>{stat.count}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
            {(() => {
              if (isTabLoading) {
                return <SkeletonLoader type="list-item" count={4} />;
              }

              const filteredCards = cards.filter(card => {
                const matchesSearch = card.cardUid.toLowerCase().includes(cardSearch.toLowerCase());
                const matchesFilter = cardFilter === 'all' || card.status.toLowerCase() === cardFilter.toLowerCase();
                return matchesSearch && matchesFilter;
              });

              if (filteredCards.length === 0) {
                return (
                  <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.text, fontSize: 12, textAlign: 'center' }}>No cards match current criteria</Text>
                  </View>
                );
              }

              return (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
                  {filteredCards.map(card => {
                    const statusLower = card.status.toLowerCase();
                    let badgeStyle = { color: colors.gold, borderColor: isDark ? 'rgba(245,166,35,0.2)' : 'rgba(212,175,55,0.2)', backgroundColor: isDark ? 'rgba(245,166,35,0.05)' : 'rgba(212,175,55,0.05)' };
                    if (statusLower === 'available') badgeStyle = { color: colors.success, borderColor: isDark ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.1)', backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.05)' };
                    else if (statusLower === 'lost') badgeStyle = { color: colors.red, borderColor: isDark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)', backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)' };
                    else if (statusLower === 'damaged') badgeStyle = { color: colors.muted, borderColor: colors.border, backgroundColor: colors.themeInput };
                    else if (statusLower === 'inactive') badgeStyle = { color: '#a78bfa', borderColor: 'rgba(167,139,250,0.2)', backgroundColor: 'rgba(167,139,250,0.05)' };

                    const isAvailable = statusLower === 'available';
                    const isAssigned = statusLower === 'assigned';
                    const isLost = statusLower === 'lost';
                    const isDamaged = statusLower === 'damaged';
                    const isInactive = statusLower === 'inactive';

                    return (
                      <View key={card.id} style={{ width: '50%', padding: 5 }}>
                        <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, minHeight: 144, justifyContent: 'space-between' }}>
                          {/* Header */}
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 11 }}>💳</Text>
                            </View>
                            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: badgeStyle.borderColor, backgroundColor: badgeStyle.backgroundColor }}>
                              <Text style={{ fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: badgeStyle.color }}>{card.status}</Text>
                            </View>
                          </View>

                          {/* Info */}
                          <View style={{ marginVertical: 8 }}>
                            <Text style={{ color: colors.text, fontFamily: 'monospace', fontWeight: 'bold', fontSize: 11 }} numberOfLines={1} ellipsizeMode="middle">{card.cardUid}</Text>
                            <Text style={{ color: colors.text, fontSize: 8, marginTop: 2 }}>
                              Writes: {card.writeCycles}
                            </Text>
                          </View>

                          {/* Actions */}
                          <View style={{ borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 6 }}>
                            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                              {isAvailable && (
                                <>
                                  <TouchableOpacity
                                    style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border }}
                                    onPress={() => updateCardStatus(card.cardUid, 'inactive')}
                                  >
                                    <Text className="text-[#a78bfa] text-[8px] font-bold">Deact</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(230,57,70,0.1)', borderWidth: 1, borderColor: 'rgba(230,57,70,0.2)' }}
                                    onPress={() => updateCardStatus(card.cardUid, 'lost')}
                                  >
                                    <Text className="text-red text-[8px] font-bold">Lost</Text>
                                  </TouchableOpacity>
                                </>
                              )}
                              {isAssigned && (
                                <>
                                  <TouchableOpacity
                                    style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(230,57,70,0.1)', borderWidth: 1, borderColor: 'rgba(230,57,70,0.2)' }}
                                    onPress={() => updateCardStatus(card.cardUid, 'lost')}
                                  >
                                    <Text className="text-red text-[8px] font-bold">Lost</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border }}
                                    onPress={() => updateCardStatus(card.cardUid, 'damaged')}
                                  >
                                    <Text style={{ color: colors.text, fontSize: 8, fontWeight: 'bold' }}>Dmg</Text>
                                  </TouchableOpacity>
                                </>
                              )}
                              {isInactive && (
                                <>
                                  <TouchableOpacity
                                    style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)' }}
                                    onPress={() => updateCardStatus(card.cardUid, 'available')}
                                  >
                                    <Text className="text-[8px] font-bold" style={{ color: colors.success }}>Activ</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(230,57,70,0.1)', borderWidth: 1, borderColor: 'rgba(230,57,70,0.2)' }}
                                    onPress={() => updateCardStatus(card.cardUid, 'lost')}
                                  >
                                    <Text className="text-red text-[8px] font-bold">Lost</Text>
                                  </TouchableOpacity>
                                </>
                              )}
                              {(isLost || isDamaged) && (
                                <TouchableOpacity
                                  style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)' }}
                                  onPress={() => updateCardStatus(card.cardUid, 'available')}
                                >
                                  <Text className="text-[8px] font-bold" style={{ color: colors.success }}>Available</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })()}
          </ScrollView>
        </View>
      )}

      {/* Rates Manager Sub-Tab */}
      {adminSubTab === 'rates' && (
        <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-[11px] font-bold text-muted uppercase tracking-wider">Rate Card Management</Text>
            <TouchableOpacity 
              className="bg-themeInput border border-transparent px-2.5 py-1.5 rounded-lg"
              onPress={() => fetchRates()}
            >
              <AppIcon name="refresh" label="Refresh" size={10} color="colors.gold" />
            </TouchableOpacity>
          </View>

          {isTabLoading ? (
            <SkeletonLoader type="list-item" count={3} />
          ) : (
            rates.map(rate => (
              <View key={rate.id || rate.placeType} className="bg-transparent border border-transparent rounded-xl p-3.5 mb-2.5">
                <View className="flex-row justify-between items-center mb-2">
                  <View>
                    <Text className="text-themeText font-bold text-sm" style={{ color: colors.text }}>
                      {rate.placeType === 'STANDING_BAR' ? 'Standing Bar' : (rate.placeType === 'PREMIUM_LOUNGE' ? 'Premium Lounge' : rate.placeType)}
                    </Text>
                    <Text className="text-muted text-[10px] font-mono mt-0.5">
                      Zone Key: {rate.placeType}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-gold font-mono font-extrabold text-sm">₹{rate.ratePerPerson}</Text>
                    <Text className="text-muted text-[9px] mt-0.5">Per Guest</Text>
                  </View>
                </View>

                {/* Stats & Parameters Grid */}
                <View className="flex-row justify-between items-center mt-2 border-t pt-2" style={{ borderTopColor: colors.divider }}>
                  <View className="flex-row gap-4">
                    <View>
                      <Text className="text-muted text-[8px] uppercase tracking-wider font-bold">Duration</Text>
                      <Text className="text-themeText text-xs font-bold mt-0.5" style={{ color: colors.text }}>{rate.durationHours} Hours</Text>
                    </View>
                    <View>
                      <Text className="text-muted text-[8px] uppercase tracking-wider font-bold">Drink Allowance</Text>
                      <Text className="text-xs font-bold mt-0.5" style={{ color: colors.success }}>{rate.maxDrinks} Drinks</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    className="px-3 py-1.5 rounded-lg bg-gold"
                    onPress={() => {
                      setSelectedRate(rate);
                      setEditRateName(rate.placeType);
                      setEditRatePrice(rate.ratePerPerson.toString());
                      setEditRateDuration(rate.durationHours.toString());
                      setEditRateAllowance(rate.maxDrinks.toString());
                      setIsEditRateOpen(true);
                    }}
                  >
                    <Text className="text-[10px] font-extrabold" style={{ color: colors.primaryButtonText }}>Edit Rate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Seating Tables Manager Sub-Tab */}
      {adminSubTab === 'tables' && (
        <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-[11px] font-bold text-muted uppercase tracking-wider">Tables Seating Manager</Text>
            <TouchableOpacity 
              className="bg-gold px-3 py-1.5 rounded-lg flex-row items-center gap-1"
              onPress={() => {
                setNewTableNumber('');
                setNewCapacity('2');
                setNewPlaceType('STANDING_BAR');
                setIsAddModalOpen(true);
              }}
            >
              <Text className="text-themeBg text-[10px] font-extrabold">+ Add Table</Text>
            </TouchableOpacity>
          </View>

          {isTabLoading ? (
            <SkeletonLoader type="list-item" count={3} />
          ) : (
            tables.map(table => {
              const isOccupied = table.status === TableStatus.OCCUPIED || table.occupiedSeats > 0;
              let statusColor = colors.success;
              if (table.status === TableStatus.MAINTENANCE) statusColor = colors.muted;
              else if (table.status === TableStatus.RESERVED) statusColor = '#3b82f6';
              else if (isOccupied) statusColor = colors.gold;

              return (
                <View key={table.id} className="bg-transparent border border-transparent rounded-xl p-3.5 mb-2.5">
                  <View className="flex-row justify-between items-center mb-2">
                    <View>
                      <Text className="text-themeText font-mono font-bold text-sm" style={{ color: colors.text }}>Table {table.number}</Text>
                      <Text className="text-muted text-[10px] uppercase font-bold mt-0.5">
                        {table.placeType === 'PREMIUM_LOUNGE' ? 'Premium Lounge' : 'Standing Bar'} • Capacity: {table.seats} Pax
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="font-extrabold text-[10px] uppercase" style={{ color: statusColor }}>{isOccupied ? 'occupied' : table.status}</Text>
                    </View>
                  </View>

                  {/* Status Toggles & Actions */}
                  <View className="flex-row justify-between items-center mt-2 border-t border-transparent pt-2">
                    <View className="flex-row gap-1.5">
                      {!isOccupied ? (
                        <>
                          <TouchableOpacity
                            className="px-2 py-1 rounded border" style={{ borderColor: table.status === TableStatus.AVAILABLE ? colors.success : colors.border, backgroundColor: table.status === TableStatus.AVAILABLE ? (isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.05)') : colors.input }} onPress={() => updateTableStatus(table.id, 'available')}><Text style={{ fontSize: 9, fontWeight: 'bold', color: table.status === TableStatus.AVAILABLE ? colors.success : colors.muted }}>Available</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            className="px-2 py-1 rounded border" style={{ borderColor: table.status === TableStatus.RESERVED ? '#3b82f6' : colors.border, backgroundColor: table.status === TableStatus.RESERVED ? (isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.05)') : colors.input }} onPress={() => updateTableStatus(table.id, 'reserved')}><Text style={{ fontSize: 9, fontWeight: 'bold', color: table.status === TableStatus.RESERVED ? '#3b82f6' : colors.muted }}>Reserve</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            className="px-2 py-1 rounded border" style={{ borderColor: table.status === TableStatus.MAINTENANCE ? colors.muted : colors.border, backgroundColor: table.status === TableStatus.MAINTENANCE ? (isDark ? 'rgba(142,142,147,0.1)' : 'rgba(142,142,147,0.05)') : colors.input }} onPress={() => updateTableStatus(table.id, 'maintenance')}><Text style={{ fontSize: 9, fontWeight: 'bold', color: table.status === TableStatus.MAINTENANCE ? colors.red : colors.muted }}>Maint</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text className="text-muted text-[9px] font-semibold italic">Locked (Occupied)</Text>
                      )}
                    </View>

                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        className={`px-2.5 py-1 rounded bg-transparent border border-transparent ${isOccupied ? 'opacity-50' : ''}`}
                        disabled={isOccupied}
                        onPress={() => {
                          if (isOccupied) {
                            showToast('Cannot edit an occupied table', 'danger');
                            return;
                          }
                          setSelectedTable(table);
                          setEditCapacity(table.seats.toString());
                          setIsEditModalOpen(true);
                        }}
                      >
                        <Text className="text-themeText text-[9px] font-bold" style={{ color: colors.text }}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className={`px-2.5 py-1 rounded bg-red/10 border border-red/20 ${isOccupied ? 'opacity-50' : ''}`}
                        disabled={isOccupied}
                        onPress={() => {
                          if (isOccupied) {
                            showToast('Cannot delete an occupied table', 'danger');
                            return;
                          }
                          deleteTable(table.id);
                        }}
                      >
                        <Text className="text-[9px] font-bold" style={{ color: 'colors.red' }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Reports & Charts Tab */}
      {adminSubTab === 'chart' && (
        <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {/* Timeframe selector */}
          <View className="mb-4">
            <Text className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Timeframe Filter</Text>
            <View className="flex-row bg-transparent rounded-xl p-1 border border-transparent gap-1 flex-wrap">
              {(['day', 'week', 'month', 'custom'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  className={`flex-1 min-w-[20%] py-2 items-center rounded-lg ${reportFilter === f ? 'bg-transparent border-[0.5px] border-gold/20' : ''}`}
                  onPress={() => {
                    setReportFilter(f);
                    if (f !== 'custom') {
                      setStartDateStr('');
                      setEndDateStr('');
                    }
                  }}
                >
                  <Text className={`text-[10px] font-bold capitalize ${reportFilter === f ? 'text-gold' : 'text-muted'}`}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Custom Date range input form */}
          {reportFilter === 'custom' && (
            <View className="bg-transparent border border-transparent rounded-xl p-3 mb-4">
              <Text className="text-gold text-[10px] font-bold uppercase tracking-wider mb-2">Custom Date Range (YYYY-MM-DD)</Text>
              <View className="flex-row gap-2 mb-2">
                <TextInput
                  className="flex-1 bg-themeInput text-themeText text-xs px-3 py-2 border border-transparent rounded-lg"
                  style={{ color: colors.text , backgroundColor: colors.themeInput}}
                  placeholder="Start: 2026-06-01"
                  placeholderTextColor={colors.placeholder}
                  value={customStart}
                  onChangeText={setCustomStart}
                />
                <TextInput
                  className="flex-1 bg-themeInput text-themeText text-xs px-3 py-2 border border-transparent rounded-lg"
                  style={{ color: colors.text , backgroundColor: colors.themeInput}}
                  placeholder="End: 2026-06-20"
                  placeholderTextColor={colors.placeholder}
                  value={customEnd}
                  onChangeText={setCustomEnd}
                />
              </View>
              <TouchableOpacity
                className="bg-gold py-2 rounded-lg items-center"
                onPress={() => {
                  if (!customStart.trim() || !customEnd.trim()) {
                    showToast('Please enter both start and end dates', 'danger');
                    return;
                  }
                  // simple YYYY-MM-DD validation
                  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                  if (!dateRegex.test(customStart.trim()) || !dateRegex.test(customEnd.trim())) {
                    showToast('Invalid date format. Use YYYY-MM-DD', 'danger');
                    return;
                  }
                  setStartDateStr(customStart.trim());
                  setEndDateStr(customEnd.trim());
                  showToast('Custom date filter applied', 'success');
                }}
              >
                <Text className="text-themeBg text-xs font-bold">Apply Date Range</Text>
              </TouchableOpacity>
            </View>
          )}

           {isTabLoading ? (
            <View className="mt-4">
              <SkeletonLoader type="card" count={3} />
            </View>
          ) : (
            <>
              {/* Metrics summary KPI sub-grid */}
              <Text className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Period Performance Summary</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 16 }}>
                {/* Revenue */}
                <View style={{ width: '33.33%', padding: 4 }}>
                  <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 12, alignItems: 'center' }}>
                    <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">Revenue</Text>
                    <Text className="font-mono text-gold text-xs font-bold mt-1">₹{(salesSummary?.todaySales || 0).toLocaleString()}</Text>
                  </View>
                </View>

                {/* Turnover */}
                <View style={{ width: '33.33%', padding: 4 }}>
                  <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 12, alignItems: 'center' }}>
                    <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">Turnover</Text>
                    <Text className="font-mono text-themeText text-xs font-bold mt-1" style={{ color: colors.text }}>{salesSummary?.checkoutCount || 0} groups</Text>
                  </View>
                </View>

                {/* Avg Stay */}
                <View style={{ width: '33.33%', padding: 4 }}>
                  <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 12, alignItems: 'center' }}>
                    <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">Avg Stay</Text>
                    <Text className="font-mono text-themeText text-xs font-bold mt-1" style={{ color: colors.text }}>
                      {(() => {
                        const tablesList = tableUtilization?.tables || [];
                        const totalStay = tablesList.reduce((sum: number, t: any) => sum + t.averageSessionDurationMinutes * t.turnoverCount, 0);
                        const totalTurnovers = tablesList.reduce((sum: number, t: any) => sum + t.turnoverCount, 0);
                        return totalTurnovers > 0 ? `${Math.round(totalStay / totalTurnovers)}m` : '0m';
                      })()}
                    </Text>
                  </View>
                </View>

                {/* Occupancy Rate */}
                <View style={{ width: '33.33%', padding: 4 }}>
                  <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 12, alignItems: 'center' }}>
                    <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">Occupancy Rate</Text>
                    <Text className="font-mono text-themeText text-xs font-bold mt-1" style={{ color: colors.text }}>
                      {Math.round((tableUtilization?.summary?.averageOccupancyRate || 0) * 100)}%
                    </Text>
                  </View>
                </View>

                {/* Redemptions */}
                <View style={{ width: '33.33%', padding: 4 }}>
                  <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 12, alignItems: 'center' }}>
                    <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">Redemptions</Text>
                    <Text className="font-mono text-xs font-bold mt-1" style={{ color: colors.success }}>{salesSummary?.todayRedemptions || 0} drinks</Text>
                  </View>
                </View>

                {/* Peak hour */}
                <View style={{ width: '33.33%', padding: 4 }}>
                  <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 12, alignItems: 'center' }}>
                    <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">Peak hour</Text>
                    <Text className="font-mono text-xs font-bold mt-1" style={{ color: colors.teal }}>
                      {(() => {
                        const pkH = hourlyBreakdown?.peakHour;
                        if (pkH === undefined) return 'N/A';
                        return pkH === 0 ? '12 AM' : (pkH < 12 ? `${pkH} AM` : (pkH === 12 ? '12 PM' : `${pkH - 12} PM`));
                      })()}
                    </Text>
                  </View>
                </View>
              </View>

              {/* SVG Bar Chart section */}
              <Text className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Hourly Redemption Frequency</Text>
              <View className="bg-transparent border border-transparent rounded-2xl p-4 mb-4">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-3">
                  <View className="flex-row items-end h-40 pb-3 border-b" style={{ gap: 8, paddingHorizontal: 5, borderBottomColor: colors.chartGrid }}>
                    {(() => {
                      const displayHours = hourlyBreakdown?.hourlyData || [];
                      const maxVal = Math.max(...displayHours.map((d: any) => d.redemptions || 0), 5);
                      const peakH = hourlyBreakdown?.peakHour;

                      return displayHours.map((hourData: any) => {
                        const isPeak = hourData.hour === peakH;
                        const barHeight = Math.round((hourData.redemptions / maxVal) * 110) + 10;
                        const formattedHour = hourData.hour === 0 ? '12a' : (hourData.hour < 12 ? `${hourData.hour}a` : (hourData.hour === 12 ? '12p' : `${hourData.hour - 12}p`));

                        return (
                          <View key={hourData.hour} className="items-center" style={{ width: 24 }}>
                            <View 
                              style={{ 
                                height: barHeight, 
                                width: 14, 
                                backgroundColor: isPeak ? colors.gold : (isDark ? '#27272A' : '#E4E4E7'),
                                borderTopLeftRadius: 4, 
                                borderTopRightRadius: 4,
                                borderBottomLeftRadius: 0,
                                borderBottomRightRadius: 0
                              }} 
                            />
                            <Text className="text-[8px] text-muted font-bold mt-1.5">{formattedHour}</Text>
                          </View>
                        );
                      });
                    })()}
                  </View>
                </ScrollView>

                {/* Busiest hour description */}
                <View className="border-t border-transparent pt-3">
                  {(() => {
                    const pkH = hourlyBreakdown?.peakHour;
                    const pkR = hourlyBreakdown?.peakRedemptions || 0;
                    const pkHStr = pkH !== undefined ? (pkH === 0 ? '12:00 AM' : (pkH < 12 ? `${pkH}:00 AM` : (pkH === 12 ? '12:00 PM' : `${pkH - 12}:00 PM`))) : 'N/A';
                    const pkData = (hourlyBreakdown?.hourlyData || []).find((h: any) => h.hour === pkH);

                    return (
                      <>
                        <Text className="text-gold text-xs font-bold mb-1">{pkHStr} ({pkR > 0 ? 'Busiest Peak Hour' : 'Standard Hour'})</Text>
                        <Text className="text-themeText text-[11px] font-semibold mb-0.5" style={{ color: colors.text }}>
                          Redemptions Served: {pkR} drinks
                        </Text>
                        <Text className="text-muted text-[9px] leading-3.5">
                          New Check-Ins: {pkData?.newTokens || 0} groups • Active Groups: {pkData?.activeTokens || 0}
                        </Text>
                      </>
                    );
                  })()}
                </View>
              </View>

              {/* Table Utilization Report */}
              <Text className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Table Utilization Report</Text>
              <View className="bg-transparent border border-transparent rounded-xl p-3.5">
                {(!tableUtilization || !tableUtilization.tables || tableUtilization.tables.length === 0) ? (
                  <Text className="text-muted text-xs text-center py-4">No table utilization data found</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    <View className="flex-row border-b border-transparent pb-1.5">
                      <Text className="flex-1 text-[8px] uppercase tracking-wider font-bold text-muted">Table</Text>
                      <Text className="flex-1.5 text-[8px] uppercase tracking-wider font-bold text-muted">Zone</Text>
                      <Text className="flex-1.5 text-[8px] uppercase tracking-wider font-bold text-muted text-right">Occ Hrs/Day</Text>
                      <Text className="flex-1 text-[8px] uppercase tracking-wider font-bold text-muted text-right">Turnover</Text>
                      <Text className="flex-1 text-[8px] uppercase tracking-wider font-bold text-muted text-right">Avg Stay</Text>
                    </View>
                    {tableUtilization.tables.map((t: any) => (
                      <View key={t.tableNumber} className="flex-row items-center border-b border-transparent py-1">
                        <Text className="flex-1 text-themeText font-mono text-xs font-bold" style={{ color: colors.text }}>{t.tableNumber}</Text>
                        <Text className="flex-1.5 text-muted text-[10px] truncate">{t.placeType === 'STANDING_BAR' ? 'Standing Bar' : (t.placeType === 'PREMIUM_LOUNGE' ? 'Premium Lounge' : t.placeType)}</Text>
                        <Text className="flex-1.5 text-themeText text-xs font-semibold text-right" style={{ color: colors.text }}>{t.averageOccupancyPerDay}h</Text>
                        <Text className="flex-1 text-xs font-bold text-right" style={{ color: colors.teal }}>{t.turnoverCount}</Text>
                        <Text className="flex-1 text-themeText text-xs font-semibold text-right" style={{ color: colors.text }}>{Math.round(t.averageSessionDurationMinutes)}m</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Add Table Modal */}
      <AlertModal
        visible={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setNewTableNumber('');
          setNewCapacity('');
        }}
        title="Add Seating Table"
      >
        <View>
          <View className="mb-4">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Table Number (e.g. S-13, L-11)</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                ${newTableNumber.trim().length > 0 ? (isNewTableNumberValid ? 'border-teal/30' : 'border-red/45') : colors.border }`}
              style={{ color: colors.text }}
              placeholder="S-13"
              placeholderTextColor={colors.placeholder}
              value={newTableNumber}
              onChangeText={setNewTableNumber}
              autoCapitalize="characters"
              editable={!isProcessing}
            />
            {newTableNumber.trim().length > 0 && !isNewTableNumberValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>Must start with S- or L- followed by a 2-3 digit number (e.g., S-12, L-04).</Text>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Place Type</Text>
            <View className="flex-row gap-2">
              <TouchableOpacity 
                className="flex-1 py-2.5 items-center rounded-xl border" style={{ borderColor: newPlaceType === 'STANDING_BAR' ? colors.gold : 'transparent', backgroundColor: newPlaceType === 'STANDING_BAR' ? (isDark ? 'rgba(245,166,35,0.05)' : 'rgba(212,175,55,0.05)') : colors.themeInput }}
                onPress={() => setNewPlaceType('STANDING_BAR')}
                disabled={isProcessing}
              >
                <Text className={`text-xs font-bold ${newPlaceType === 'STANDING_BAR' ? 'text-gold' : 'text-muted'}`}>Standing Bar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 py-2.5 items-center rounded-xl border" style={{ borderColor: newPlaceType === 'PREMIUM_LOUNGE' ? colors.gold : 'transparent', backgroundColor: newPlaceType === 'PREMIUM_LOUNGE' ? (isDark ? 'rgba(245,166,35,0.05)' : 'rgba(212,175,55,0.05)') : colors.themeInput }}
                onPress={() => setNewPlaceType('PREMIUM_LOUNGE')}
                disabled={isProcessing}
              >
                <Text className={`text-xs font-bold ${newPlaceType === 'PREMIUM_LOUNGE' ? 'text-gold' : 'text-muted'}`}>Premium Lounge</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-6">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Capacity (Pax)</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                ${newCapacity.trim().length > 0 ? (isNewCapacityValid ? 'border-teal/30' : 'border-red/45') : colors.border }`}
              style={{ color: colors.text }}
              placeholder="2"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              value={newCapacity}
              onChangeText={setNewCapacity}
              editable={!isProcessing}
            />
            {newCapacity.trim().length > 0 && !isNewCapacityValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>Capacity must be a number between 1 and 100.</Text>
            )}
          </View>

          <View className="flex-row justify-end gap-2.5">
            <TouchableOpacity className="py-2.5 px-4 rounded-xl" style={{ backgroundColor: colors.themeInput }} onPress={() => setIsAddModalOpen(false)}>
              <Text className="text-xs font-bold" style={{ color: colors.muted }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className={`py-2.5 px-4 rounded-xl ${(!isAddTableFormValid || isProcessing) ? 'opacity-50' : 'active:opacity-90'}`}
              style={{ backgroundColor: isProcessing ? (isDark ? '#27272A' : '#E4E4E7') : colors.gold }}
              disabled={!isAddTableFormValid || isProcessing}
              onPress={async () => {
                if (!isAddTableFormValid) return;
                if (!startAction('add_table')) return;
                try {
                  const capNum = parseInt(newCapacity, 10);
                  const success = await addTable(newTableNumber.toUpperCase().trim(), newPlaceType, capNum);
                  stopAction();
                  if (success) {
                    setIsAddModalOpen(false);
                  }
                } catch (e) {
                  stopAction();
                }
              }}
            >
              <Text className="text-xs font-extrabold" style={{ color: isProcessing ? colors.muted : colors.primaryButtonText }}>
                {loadingAction === 'add_table' ? `Saving... (${secondsLeft}s)` : 'Save Table'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </AlertModal>

      {/* Edit Table Modal */}
      <AlertModal
        visible={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Table ${selectedTable?.number}`}
      >
        <View>
          <View className="mb-6">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Capacity (Pax)</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                ${editCapacity.trim().length > 0 ? (isEditCapacityValid ? 'border-teal/30' : 'border-red/45') : colors.border }`}
              style={{ color: colors.text }}
              placeholder="2"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              value={editCapacity}
              onChangeText={setEditCapacity}
              editable={!isProcessing}
            />
            {editCapacity.trim().length > 0 && !isEditCapacityValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>Capacity must be a number between 1 and 100.</Text>
            )}
          </View>

          <View className="flex-row justify-end gap-2.5">
            <TouchableOpacity className="py-2.5 px-4 rounded-xl" style={{ backgroundColor: colors.themeInput }} onPress={() => setIsEditModalOpen(false)}>
              <Text className="text-xs font-bold" style={{ color: colors.muted }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className={`py-2.5 px-4 rounded-xl ${(!isEditCapacityValid || isProcessing) ? 'opacity-50' : 'active:opacity-90'}`}
              style={{ backgroundColor: isProcessing ? (isDark ? '#27272A' : '#E4E4E7') : colors.gold }}
              disabled={!isEditCapacityValid || isProcessing}
              onPress={async () => {
                if (!selectedTable || !isEditCapacityValid) return;
                if (!startAction('edit_table')) return;
                try {
                  const capNum = parseInt(editCapacity, 10);
                  const success = await editTable(selectedTable.id, selectedTable.number, selectedTable.placeType, capNum);
                  stopAction();
                  if (success) {
                    setIsEditModalOpen(false);
                  }
                } catch (e) {
                  stopAction();
                }
              }}
            >
              <Text className="text-xs font-extrabold" style={{ color: isProcessing ? colors.muted : colors.primaryButtonText }}>
                {loadingAction === 'edit_table' ? `Saving... (${secondsLeft}s)` : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </AlertModal>

      {/* Staff Manager Sub-Tab */}
      {adminSubTab === 'staff' && (
        <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-[11px] font-bold text-muted uppercase tracking-wider">Staff Management</Text>
            <TouchableOpacity 
              className="bg-gold px-3 py-1.5 rounded-lg flex-row items-center gap-1"
              onPress={() => {
                setNewStaffUsername('');
                setNewStaffFullName('');
                setNewStaffRole('receptionist');
                setNewStaffPassword('');
                setIsAddStaffOpen(true);
              }}
            >
              <Text className="text-themeBg text-[10px] font-extrabold">+ Add Staff</Text>
            </TouchableOpacity>
          </View>

          {isTabLoading ? (
            <SkeletonLoader type="list-item" count={3} />
          ) : (
            users.map(staff => {
              const isSelf = loggedUser?.id === staff.id;
              let roleBadgeStyle = { color: colors.gold, borderColor: isDark ? 'rgba(245,166,35,0.2)' : 'rgba(212,175,55,0.2)', backgroundColor: isDark ? 'rgba(245,166,35,0.05)' : 'rgba(212,175,55,0.05)' };
              if (staff.role.name === 'admin') roleBadgeStyle = { color: colors.red, borderColor: isDark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)', backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)' };
              else if (staff.role.name === 'bartender') roleBadgeStyle = { color: colors.success, borderColor: isDark ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.1)', backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.05)' };
              else if (staff.role.name === 'manager') roleBadgeStyle = { color: '#3b82f6', borderColor: 'rgba(59,130,246,0.2)', backgroundColor: 'rgba(59,130,246,0.05)' };

              return (
                <View key={staff.id} className="border rounded-xl p-3.5 mb-2.5" style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}>
                  <View className="flex-row justify-between items-center mb-2">
                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-themeText font-bold text-sm" style={{ color: colors.text }}>{staff.fullName}</Text>
                        {isSelf && (
                          <View className="bg-white/10 px-1.5 py-0.5 rounded">
                            <Text className="text-[8px] text-themeText font-bold">YOU</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-muted text-[10px] font-mono mt-0.5">
                        Username: {staff.username}
                      </Text>
                    </View>
                    <View className="items-end">
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: roleBadgeStyle.borderColor, backgroundColor: roleBadgeStyle.backgroundColor }}>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', color: roleBadgeStyle.color }}>{staff.role.name}</Text>
                      </View>
                      <Text style={{ fontSize: 9, fontWeight: 'semibold', marginTop: 4, color: staff.isActive ? colors.success : colors.red }}>
                        {staff.isActive ? 'Active' : 'Deactivated'}
                      </Text>
                    </View>
                  </View>

                  {/* Staff Actions */}
                  <View className="flex-row justify-between items-center mt-2 border-t border-transparent pt-2">
                    <View>
                      {isSelf ? (
                        <Text className="text-muted text-[9px] font-semibold italic">Cannot deactivate self</Text>
                      ) : (
                        <TouchableOpacity
                          className="px-2.5 py-1 rounded border" style={{ borderColor: staff.isActive ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)', backgroundColor: staff.isActive ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.05)' }}
                          onPress={() => updateStaffStatus(staff.id, !staff.isActive)}
                        >
                          <Text style={{ fontSize: 9, fontWeight: 'bold', color: staff.isActive ? colors.red : colors.success }}>
                            {staff.isActive ? 'Deactivate' : 'Activate'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <TouchableOpacity
                      className="px-2.5 py-1 rounded border" style={{ backgroundColor: colors.input, borderColor: colors.border }}
                      onPress={() => {
                        setSelectedStaff(staff);
                        setEditStaffUsername(staff.username);
                        setEditStaffFullName(staff.fullName);
                        setEditStaffRole(staff.role.name as any);
                        setEditStaffIsActive(staff.isActive);
                        setEditStaffPassword('');
                        setIsEditStaffOpen(true);
                      }}
                    >
                      <Text className="text-themeText text-[9px] font-bold" style={{ color: colors.text }}>Edit Profile</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Settings Sub-Tab */}
      {adminSubTab === 'settings' && (
        <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <Text className="text-[11px] font-bold text-muted uppercase tracking-wider mb-4">System Settings</Text>
          
          <View className="border rounded-2xl p-5 mb-6" style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}>
            <View className="flex-row items-center mb-3">
              <Text className="text-gold text-lg mr-2">⚙️</Text>
              <Text className="text-themeText text-sm font-bold" style={{ color: colors.text }}>Token Delivery Methods</Text>
            </View>
            <Text className="text-muted text-xs leading-5 mb-5" style={{ color: colors.muted }}>
              Configure which customer delivery methods are active in the system. Receptionists select the delivery method for each new customer session during registration.
            </Text>

            {/* NFC Card Toggle */}
            <View className="flex-row justify-between items-center py-4 border-b" style={{ borderBottomColor: colors.divider }}>
              <View style={{ flex: 1, paddingRight: 16 }}>
                <Text className="text-themeText text-xs font-bold" style={{ color: colors.text }}>NFC Card Registration</Text>
                <Text className="text-muted text-[10px] mt-1" style={{ color: colors.muted }}>
                  Allow receptionists to allocate and write tokens to physical NFC smart cards.
                </Text>
              </View>
              <TouchableOpacity
                className="px-4 py-2 rounded-xl border" style={{ borderColor: localNfcEnabled ? colors.success : 'transparent', backgroundColor: localNfcEnabled ? (isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.05)') : colors.themeInput }}
                onPress={() => {
                  if (localNfcEnabled && !localEmailQrEnabled) {
                    showToast('At least one token delivery method must remain active.', 'warning');
                    return;
                  }
                  setLocalNfcEnabled(!localNfcEnabled);
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: localNfcEnabled ? colors.success : colors.muted }}>
                  {localNfcEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Email QR Toggle */}
            <View className="flex-row justify-between items-center py-4">
              <View style={{ flex: 1, paddingRight: 16 }}>
                <Text className="text-themeText text-xs font-bold" style={{ color: colors.text }}>Email QR Code Delivery</Text>
                <Text className="text-muted text-[10px] mt-1" style={{ color: colors.muted }}>
                  Allow sessions to run cardless and email token barcodes/QRs to customer phones.
                </Text>
              </View>
              <TouchableOpacity
                className="px-4 py-2 rounded-xl border" style={{ borderColor: localEmailQrEnabled ? colors.success : 'transparent', backgroundColor: localEmailQrEnabled ? (isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.05)') : colors.themeInput }}
                onPress={() => {
                  if (localEmailQrEnabled && !localNfcEnabled) {
                    showToast('At least one token delivery method must remain active.', 'warning');
                    return;
                  }
                  setLocalEmailQrEnabled(!localEmailQrEnabled);
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: localEmailQrEnabled ? colors.success : colors.muted }}>
                  {localEmailQrEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            className={`w-full py-4 rounded-xl items-center justify-center min-h-[50px]
              ${(isSavingSettings || isProcessing) ? 'opacity-65' : 'active:opacity-90'}`}
            style={{ backgroundColor: (isSavingSettings || isProcessing) ? (isDark ? '#27272A' : '#E4E4E7') : colors.gold }}
            disabled={isSavingSettings || isProcessing}
            onPress={async () => {
              if (!startAction('save_settings')) return;
              setIsSavingSettings(true);
              try {
                const success = await updateDeliveryAvailability(localNfcEnabled, localEmailQrEnabled);
                stopAction();
                setIsSavingSettings(false);
              } catch (e) {
                stopAction();
                setIsSavingSettings(false);
              }
            }}
          >
            <Text className="font-extrabold text-sm" style={{ color: (isSavingSettings || isProcessing) ? colors.muted : colors.primaryButtonText }}>
              {loadingAction === 'save_settings' ? `Saving Settings... (${secondsLeft}s)` : 'Save Configurations'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {adminSubTab === 'customers' && (
        <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          {/* Status Filter Badges */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={{ flexGrow: 0, marginBottom: 12 }}
            contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
          >
            {(['all', 'active', 'extended', 'expired', 'pending_payment', 'closed', 'cancelled'] as const).map((statusVal) => {
              const isActive = customerStatusFilter === statusVal;
              return (
                <TouchableOpacity
                  key={statusVal}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: isActive ? colors.gold : colors.border,
                    backgroundColor: isActive ? (isDark ? 'rgba(245,166,35,0.1)' : 'rgba(212,175,55,0.1)') : colors.input
                  }}
                  onPress={() => setCustomerStatusFilter(statusVal)}
                >
                  <Text style={{ fontSize: 10, fontWeight: 'bold', color: isActive ? colors.gold : colors.text, textTransform: 'capitalize' }}>
                    {statusVal.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Sort Selector */}
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 6, paddingLeft: 2 }}>Sort By:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
              {([
                { value: 'latest_first', label: 'Latest First' },
                { value: 'oldest_first', label: 'Oldest First' },
                { value: 'expiring_soon', label: 'Expiring Soon' },
                { value: 'recently_updated', label: 'Recently Updated' },
                { value: 'customer_name', label: 'Customer Name' },
                { value: 'table_number', label: 'Table Number' }
              ] as const).map((opt) => {
                const isActive = customerSort === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={{
                      paddingVertical: 5,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: isActive ? colors.gold : colors.border,
                      backgroundColor: isActive ? (isDark ? 'rgba(245,166,35,0.08)' : 'rgba(212,175,55,0.08)') : colors.secondarySurface
                    }}
                    onPress={() => setCustomerSort(opt.value)}
                  >
                    <Text style={{ fontSize: 9, fontWeight: 'bold', color: isActive ? colors.gold : colors.muted }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Session Cards List */}
          <View style={{ gap: 10 }}>
            {(() => {
              if (isTabLoading) {
                return <SkeletonLoader type="list-item" count={3} />;
              }

              const filteredSessions = adminSessions.filter(s => {
                const matchesSearch = 
                  s.customerName.toLowerCase().includes(customerSearch.toLowerCase()) ||
                  s.phoneNumber.includes(customerSearch) ||
                  (s.email && s.email.toLowerCase().includes(customerSearch.toLowerCase())) ||
                  (s.tableNumber && s.tableNumber.toLowerCase().includes(customerSearch.toLowerCase())) ||
                  (s.cardUid && s.cardUid.toLowerCase().includes(customerSearch.toLowerCase())) ||
                  s.tokenNumber.toLowerCase().includes(customerSearch.toLowerCase());

                const matchesStatus = 
                  customerStatusFilter === 'all' || 
                  s.status === customerStatusFilter;

                return matchesSearch && matchesStatus;
              });

              if (filteredSessions.length === 0) {
                return (
                  <View style={{ backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, borderRadius: 16, padding: 20, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.text, fontSize: 12, textAlign: 'center' }}>No sessions match current criteria</Text>
                  </View>
                );
              }

              // Sort sessions
              const sortedSessions = [...filteredSessions].sort((a, b) => {
                switch (customerSort) {
                  case 'latest_first':
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                  case 'oldest_first':
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                  case 'customer_name':
                    return a.customerName.localeCompare(b.customerName);
                  case 'table_number':
                    return (a.tableNumber || '').localeCompare(b.tableNumber || '');
                  case 'recently_updated': {
                    const timeA = a.redemptions && a.redemptions.length > 0
                      ? new Date(a.redemptions[a.redemptions.length - 1].redeemedAt).getTime()
                      : new Date(a.createdAt).getTime();
                    const timeB = b.redemptions && b.redemptions.length > 0
                      ? new Date(b.redemptions[b.redemptions.length - 1].redeemedAt).getTime()
                      : new Date(b.createdAt).getTime();
                    return timeB - timeA;
                  }
                  case 'expiring_soon': {
                    const activeStatuses = [TokenStatus.ACTIVE, TokenStatus.EXTENDED];
                    const isAActive = activeStatuses.includes(a.status);
                    const isBActive = activeStatuses.includes(b.status);
                    if (isAActive && isBActive) {
                      return new Date(a.endTime).getTime() - new Date(b.endTime).getTime();
                    }
                    if (isAActive) return -1;
                    if (isBActive) return 1;
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                  }
                  default:
                    return 0;
                }
              });

              const paginatedSessions = sortedSessions.slice(0, visibleSessionsCount);
              const hasMore = sortedSessions.length > visibleSessionsCount;

              return (
                <>
                  {paginatedSessions.map(session => {
                    const isDeactivatable = 
                      session.status !== TokenStatus.CLOSED && 
                      session.status !== TokenStatus.CANCELLED;

                    let badgeStyle = { bg: colors.secondarySurface, border: colors.border, text: colors.muted, accentText: colors.text };
                    if (session.status === TokenStatus.ACTIVE) {
                      badgeStyle = { bg: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.25)', text: colors.success, accentText: colors.success };
                    } else if (session.status === TokenStatus.EXTENDED) {
                      badgeStyle = { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.25)', text: '#3B82F6', accentText: '#3B82F6' };
                    } else if (session.status === TokenStatus.PENDING_PAYMENT) {
                      badgeStyle = { bg: 'rgba(249, 115, 22, 0.08)', border: 'rgba(249, 115, 22, 0.25)', text: '#F97316', accentText: '#F97316' };
                    } else if (session.status === TokenStatus.EXPIRED) {
                      badgeStyle = { bg: 'rgba(107, 114, 128, 0.08)', border: 'rgba(107, 114, 128, 0.25)', text: '#6B7280', accentText: '#6B7280' };
                    } else if (session.status === TokenStatus.CANCELLED) {
                      badgeStyle = { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.25)', text: colors.red, accentText: colors.red };
                    } else if (session.status === TokenStatus.CLOSED) {
                      badgeStyle = { bg: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.25)', text: '#8B5CF6', accentText: '#8B5CF6' };
                    }

                    return (
                      <View 
                        key={session.id} 
                        style={{ 
                          backgroundColor: colors.card, 
                          borderColor: colors.border, 
                          borderWidth: 1.5,
                          borderRadius: 16,
                          padding: 16,
                          gap: 12,
                        }}
                      >
                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 13 }} numberOfLines={1}>{session.customerName}</Text>
                            <Text style={{ color: colors.muted, fontSize: 9, marginTop: 2 }}>{session.phoneNumber}</Text>
                          </View>
                          <View style={{ backgroundColor: badgeStyle.bg, borderColor: badgeStyle.border, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                            <Text style={{ color: badgeStyle.text, fontSize: 8.5, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>{session.status.replace('_', ' ')}</Text>
                          </View>
                        </View>

                        {/* Table and token details Grid */}
                        <View className="flex-row py-3 border-t border-b" style={{ borderColor: colors.divider, borderTopWidth: 1, borderBottomWidth: 1 }}>
                          <View className="flex-1">
                            <Text style={{ color: colors.muted, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Token ID</Text>
                            <Text style={{ color: colors.gold, fontFamily: 'monospace', fontSize: 10.5, fontWeight: 'bold', marginTop: 3 }}>{session.tokenNumber}</Text>
                          </View>
                          <View className="flex-grow flex-1" style={{ paddingHorizontal: 4 }}>
                            <Text style={{ color: colors.muted, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Seating Table</Text>
                            <Text style={{ color: colors.text, fontSize: 10.5, fontWeight: 'bold', marginTop: 3 }}>
                              {session.tableNumber ? `Table ${session.tableNumber}` : 'No Table'}
                            </Text>
                          </View>
                          <View className="flex-1 items-end">
                            <Text style={{ color: colors.muted, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Format / Pax</Text>
                            <Text style={{ color: colors.text, fontSize: 10.5, fontWeight: 'bold', marginTop: 3 }}>
                              {session.deliveryMode === 'EMAIL_QR' ? '📧 QR' : '💳 NFC'} • {session.persons}
                            </Text>
                          </View>
                        </View>

                        {/* Actions block */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            {session.status !== TokenStatus.CLOSED && session.status !== TokenStatus.CANCELLED ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={{ color: colors.muted, fontSize: 9 }}>
                                  Drinks: {session.redemptionCount}/{session.redemptionLimit}
                                </Text>
                                {(session.status === TokenStatus.ACTIVE || session.status === TokenStatus.EXTENDED || session.status === TokenStatus.EXPIRED) && (
                                  <Text style={{ color: (new Date(session.endTime).getTime() - Date.now() <= 15 * 60 * 1000) ? colors.red : colors.gold, fontSize: 9, fontWeight: 'bold' }}>
                                    ⏰ {formatTimeRemaining(new Date(session.endTime).getTime() - Date.now())}
                                  </Text>
                                )}
                              </View>
                            ) : (
                              <Text style={{ color: colors.muted, fontSize: 9 }}>
                                Drinks served: {session.redemptionCount} total
                              </Text>
                            )}
                          </View>
                          
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              style={{ backgroundColor: colors.secondaryButtonBg, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, alignItems: 'center' }}
                              onPress={() => setSelectedDetailsSession(session)}
                            >
                              <Text style={{ color: colors.text, fontSize: 9, fontWeight: 'bold' }}>View Details</Text>
                            </TouchableOpacity>

                            {isDeactivatable && (
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                {(session.status === TokenStatus.ACTIVE || session.status === TokenStatus.EXTENDED || session.status === TokenStatus.EXPIRED) && (
                                  <TouchableOpacity
                                    style={{ backgroundColor: 'rgba(245, 166, 35, 0.08)', borderWidth: 1.5, borderColor: 'rgba(245, 166, 35, 0.25)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, alignItems: 'center' }}
                                    onPress={() => {
                                      setSelectedAdminSession(session);
                                      setIsAdminExtendModalOpen(true);
                                    }}
                                  >
                                    <Text style={{ color: colors.gold, fontSize: 9, fontWeight: 'bold' }}>Extend</Text>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderWidth: 1.5, borderColor: 'rgba(239, 68, 68, 0.25)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, alignItems: 'center' }}
                                  onPress={() => {
                                    setDeactivateTargetSession({
                                      tokenNumber: session.tokenNumber,
                                      status: session.status,
                                      customerName: session.customerName
                                    });
                                    setForceRelease(false);
                                    setDeactivateConfirmModalOpen(true);
                                  }}
                                >
                                  <Text style={{ color: colors.red, fontSize: 9, fontWeight: 'bold' }}>End</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  {hasMore && (
                    <TouchableOpacity
                      style={{ 
                        backgroundColor: colors.secondarySurface, 
                        borderColor: colors.border, 
                        borderWidth: 1.5, 
                        borderRadius: 12, 
                        paddingVertical: 12, 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        marginTop: 4,
                        marginBottom: 20
                      }}
                      onPress={() => setVisibleSessionsCount(prev => prev + 10)}
                    >
                      <Text style={{ color: colors.gold, fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Show More Sessions ({sortedSessions.length - visibleSessionsCount} remaining)
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
          </View>
        </ScrollView>
      )}
      </View>

      {/* Add Staff Modal */}
      {/* Add Staff Modal */}
      <AlertModal
        visible={isAddStaffOpen}
        onClose={() => {
          setIsAddStaffOpen(false);
          setNewStaffFullName('');
          setNewStaffUsername('');
          setNewStaffPassword('');
        }}
        title="Add Staff Account"
      >
        <View>
          <View className="mb-4">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Full Name *</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                ${newStaffFullName.trim().length > 0 ? (isNewStaffFullNameValid ? 'border-teal/30' : 'border-red/45') : colors.border }`}
              style={{ color: colors.text }}
              placeholder="e.g. John Doe"
              placeholderTextColor={colors.placeholder}
              value={newStaffFullName}
              onChangeText={setNewStaffFullName}
              editable={!isProcessing}
            />
            {newStaffFullName.trim().length > 0 && !isNewStaffFullNameValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>Name must be between 2 and 100 characters, containing only letters.</Text>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Role</Text>
            <View className="flex-row flex-wrap gap-2">
              {(['receptionist', 'bartender', 'manager', 'admin'] as const).map(r => (
                <TouchableOpacity 
                  key={r}
                  className="flex-grow py-2 px-3 items-center rounded-xl border" style={{ borderColor: newStaffRole === r ? colors.gold : colors.border, backgroundColor: newStaffRole === r ? (isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(212, 175, 55, 0.1)') : colors.input }}
                  onPress={() => {
                    setNewStaffRole(r);
                    const prefix = r === 'admin' ? 'ADM' : (r === 'receptionist' ? 'REC' : (r === 'bartender' ? 'BAR' : 'MGR'));
                    if (!newStaffUsername || /^(REC|BAR|ADM|MGR)-\d{2}$/.test(newStaffUsername.trim().toUpperCase()) || newStaffUsername.trim().length <= 4) {
                      setNewStaffUsername(`${prefix}-05`);
                    }
                  }}
                  disabled={isProcessing}
                >
                  <Text className={`text-[10px] font-bold capitalize ${newStaffRole === r ? 'text-gold' : 'text-muted'}`}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Username (Format: {expectedNewStaffPrefix}-XX)</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm font-mono
                ${newStaffUsername.trim().length > 0 ? (isNewStaffUsernameValid ? 'border-teal/30' : 'border-red/45') : colors.border }`}
              style={{ color: colors.text }}
              placeholder={`${expectedNewStaffPrefix}-05`}
              placeholderTextColor={colors.placeholder}
              value={newStaffUsername}
              onChangeText={setNewStaffUsername}
              autoCapitalize="characters"
              editable={!isProcessing}
            />
            {newStaffUsername.trim().length > 0 && !isNewStaffUsernameValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>Expected prefix "{expectedNewStaffPrefix}-" followed by exactly 2 digits (e.g. {expectedNewStaffPrefix}-12).</Text>
            )}
          </View>

          <View className="mb-6">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>PIN (4 Digits) *</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm font-mono
                ${newStaffPassword.trim().length > 0 ? (isNewStaffPasswordValid ? 'border-teal/30' : 'border-red/45') : colors.border }`}
              style={{ color: colors.text }}
              placeholder="1234"
              placeholderTextColor={colors.placeholder}
              value={newStaffPassword}
              onChangeText={setNewStaffPassword}
              secureTextEntry
              keyboardType="numeric"
              maxLength={4}
              editable={!isProcessing}
            />
            {newStaffPassword.trim().length > 0 && !isNewStaffPasswordValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>Must be 4 digits.</Text>
            )}
          </View>

          <View className="flex-row justify-end gap-2.5">
            <TouchableOpacity className="py-2.5 px-4 rounded-xl" style={{ backgroundColor: colors.themeInput }} onPress={() => setIsAddStaffOpen(false)}>
              <Text className="text-xs font-bold" style={{ color: colors.muted }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className={`py-2.5 px-4 rounded-xl ${(isProcessing || !isAddStaffFormValid) ? 'opacity-50' : 'active:opacity-90'}`}
              style={{ backgroundColor: isProcessing ? (isDark ? '#27272A' : '#E4E4E7') : colors.gold }}
              disabled={!isAddStaffFormValid || isProcessing}
              onPress={async () => {
                if (!isAddStaffFormValid) return;
                if (!startAction('register_staff')) return;
                try {
                  const success = await registerStaff(
                    newStaffUsername.toUpperCase().trim(),
                    newStaffPassword,
                    newStaffFullName.trim(),
                    newStaffRole
                  );
                  stopAction();
                  if (success) {
                    setIsAddStaffOpen(false);
                  }
                } catch (e) {
                  stopAction();
                }
              }}
            >
              <Text className="text-xs font-extrabold" style={{ color: isProcessing ? colors.muted : colors.primaryButtonText }}>
                {loadingAction === 'register_staff' ? `Saving... (${secondsLeft}s)` : 'Save Staff'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </AlertModal>

      {/* Edit Staff Modal */}
      <AlertModal
        visible={isEditStaffOpen}
        onClose={() => setIsEditStaffOpen(false)}
        title="Edit Staff Profile"
      >
        <View>
          <View className="mb-4">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Full Name *</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                ${editStaffFullName.trim().length > 0 ? (isEditStaffFullNameValid ? 'border-teal/30' : 'border-red/45') : colors.border }`}
              style={{ color: colors.text }}
              placeholder="e.g. John Doe"
              placeholderTextColor={colors.placeholder}
              value={editStaffFullName}
              onChangeText={setEditStaffFullName}
              editable={!isProcessing}
            />
            {editStaffFullName.trim().length > 0 && !isEditStaffFullNameValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>Name must be between 2 and 100 characters, containing only letters.</Text>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Role</Text>
            <View className="flex-row flex-wrap gap-2">
              {(['receptionist', 'bartender', 'manager', 'admin'] as const).map(r => (
                <TouchableOpacity 
                  key={r}
                  className="flex-grow py-2 px-3 items-center rounded-xl border" style={{ borderColor: editStaffRole === r ? colors.gold : colors.border, backgroundColor: editStaffRole === r ? (isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(212, 175, 55, 0.1)') : colors.input }}
                  onPress={() => {
                    setEditStaffRole(r);
                    const prefix = r === 'admin' ? 'ADM' : (r === 'receptionist' ? 'REC' : (r === 'bartender' ? 'BAR' : 'MGR'));
                    if (!editStaffUsername || /^(REC|BAR|ADM|MGR)-\d{2}$/.test(editStaffUsername.trim().toUpperCase()) || editStaffUsername.trim().length <= 4) {
                      setEditStaffUsername(`${prefix}-05`);
                    }
                  }}
                  disabled={isProcessing}
                >
                  <Text className={`text-[10px] font-bold capitalize ${editStaffRole === r ? 'text-gold' : 'text-muted'}`}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Username (Format: {expectedEditStaffPrefix}-XX)</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm font-mono
                ${editStaffUsername.trim().length > 0 ? (isEditStaffUsernameValid ? 'border-teal/30' : 'border-red/45') : colors.border }`}
              style={{ color: colors.text }}
              placeholder={`${expectedEditStaffPrefix}-05`}
              placeholderTextColor={colors.placeholder}
              value={editStaffUsername}
              onChangeText={setEditStaffUsername}
              autoCapitalize="characters"
              editable={!isProcessing}
            />
            {editStaffUsername.trim().length > 0 && !isEditStaffUsernameValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>Expected prefix "{expectedEditStaffPrefix}-" followed by exactly 2 digits.</Text>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>PIN (Leave blank to keep current) *</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm font-mono
                ${editStaffPassword.trim().length > 0 ? (isEditStaffPasswordValid ? 'border-teal/30' : 'border-red/45') : colors.border }`}
              style={{ color: colors.text }}
              placeholder="••••"
              placeholderTextColor={colors.placeholder}
              value={editStaffPassword}
              onChangeText={setEditStaffPassword}
              secureTextEntry
              keyboardType="numeric"
              maxLength={4}
              editable={!isProcessing}
            />
            {editStaffPassword.trim().length > 0 && !isEditStaffPasswordValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>PIN must be 4 digits.</Text>
            )}
          </View>

          <View className="mb-6 flex-row items-center justify-between">
            <Text className="text-themeText text-xs font-semibold" style={{ color: colors.text }}>Account Active Status</Text>
            {loggedUser?.id === selectedStaff?.id ? (
              <Text className="text-muted text-[10px] italic">Locked (Logged-in User)</Text>
            ) : (
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="px-3 py-1.5 rounded-lg border" style={{ borderColor: editStaffIsActive ? colors.success : colors.border, backgroundColor: editStaffIsActive ? 'rgba(34, 197, 94, 0.05)' : colors.input }}
                  onPress={() => setEditStaffIsActive(true)}
                  disabled={isProcessing}
                >
                  <Text className="text-[10px] font-bold" style={{ color: editStaffIsActive ? colors.success : colors.muted }}>Active</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="px-3 py-1.5 rounded-lg border" style={{ borderColor: !editStaffIsActive ? colors.red : colors.border, backgroundColor: !editStaffIsActive ? 'rgba(239, 68, 68, 0.05)' : colors.input }}
                  onPress={() => setEditStaffIsActive(false)}
                  disabled={isProcessing}
                >
                  <Text className={`text-[10px] font-bold ${!editStaffIsActive ? 'text-red' : 'text-muted'}`}>Deactivated</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View className="flex-row justify-end gap-2.5">
            <TouchableOpacity className="py-2.5 px-4 rounded-xl" style={{ backgroundColor: colors.themeInput }} onPress={() => setIsEditStaffOpen(false)}>
              <Text className="text-xs font-bold" style={{ color: colors.muted }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className={`py-2.5 px-4 rounded-xl ${(isProcessing || !isEditStaffFormValid) ? 'opacity-50' : 'active:opacity-90'}`}
              style={{ backgroundColor: isProcessing ? (isDark ? '#27272A' : '#E4E4E7') : colors.gold }}
              disabled={!isEditStaffFormValid || isProcessing}
              onPress={async () => {
                if (!selectedStaff || !isEditStaffFormValid) return;
                if (!startAction('update_staff')) return;
                try {
                  const success = await updateStaff(
                    selectedStaff.id,
                    editStaffUsername.toUpperCase().trim(),
                    editStaffFullName.trim(),
                    editStaffRole,
                    editStaffIsActive,
                    editStaffPassword ? editStaffPassword : undefined
                  );
                  stopAction();
                  if (success) {
                    setIsEditStaffOpen(false);
                  }
                } catch (e) {
                  stopAction();
                }
              }}
            >
              <Text className="text-xs font-extrabold" style={{ color: isProcessing ? colors.muted : colors.primaryButtonText }}>
                {loadingAction === 'update_staff' ? `Saving... (${secondsLeft}s)` : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </AlertModal>

      {/* Edit Rate Modal */}
      <AlertModal
        visible={isEditRateOpen}
        onClose={() => setIsEditRateOpen(false)}
        title="Edit Rate Configuration"
      >
        <View>
          <View className="mb-4">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Place Type / Zone Name</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                ${editRateName.trim().length > 0 ? (isEditRateNameValid ? 'border-teal/30' : 'border-red/45') : 'border-transparent'}`}
              style={{ color: colors.text }}
              placeholder="e.g. VIP Lounge"
              placeholderTextColor={colors.placeholder}
              value={editRateName}
              onChangeText={setEditRateName}
              editable={!isProcessing}
            />
            {editRateName.trim().length > 0 && !isEditRateNameValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>Place type / zone name is required.</Text>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Base Price (₹ per Guest)</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                ${editRatePrice.trim().length > 0 ? (isEditRatePriceValid ? 'border-teal/30' : 'border-red/45') : 'border-transparent'}`}
              style={{ color: colors.text }}
              placeholder="500"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              value={editRatePrice}
              onChangeText={setEditRatePrice}
              editable={!isProcessing}
            />
            {editRatePrice.trim().length > 0 && !isEditRatePriceValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>Price must be a non-negative number.</Text>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Duration (Hours)</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                ${editRateDuration.trim().length > 0 ? (isEditRateDurationValid ? 'border-teal/30' : 'border-red/45') : 'border-transparent'}`}
              style={{ color: colors.text }}
              placeholder="2"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              value={editRateDuration}
              onChangeText={setEditRateDuration}
              editable={!isProcessing}
            />
            {editRateDuration.trim().length > 0 && !isEditRateDurationValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>Duration must be a number between 0.5 and 24 hours.</Text>
            )}
          </View>

          <View className="mb-6">
            <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Drinks Allowance (Per Guest)</Text>
            <TextInput
              className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                ${editRateAllowance.trim().length > 0 ? (isEditRateAllowanceValid ? 'border-teal/30' : 'border-red/45') : 'border-transparent'}`}
              style={{ color: colors.text }}
              placeholder="2"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              value={editRateAllowance}
              onChangeText={setEditRateAllowance}
              editable={!isProcessing}
            />
            {editRateAllowance.trim().length > 0 && !isEditRateAllowanceValid && (
              <Text className="text-[10px] text-red mt-1" style={{ color: colors.red }}>Drinks allowance must be an integer between 0 and 50.</Text>
            )}
          </View>

          <View className="flex-row justify-end gap-2.5">
            <TouchableOpacity className="py-2.5 px-4 rounded-xl" style={{ backgroundColor: colors.themeInput }} onPress={() => setIsEditRateOpen(false)}>
              <Text className="text-xs font-bold" style={{ color: colors.muted }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className={`py-2.5 px-4 rounded-xl ${(isProcessing || !isEditRateFormValid) ? 'opacity-50' : 'active:opacity-90'}`}
              style={{ backgroundColor: isProcessing ? (isDark ? '#27272A' : '#E4E4E7') : colors.gold }}
              disabled={!isEditRateFormValid || isProcessing}
              onPress={async () => {
                if (!selectedRate || !selectedRate.id || !isEditRateFormValid) return;
                if (!startAction('update_rates')) return;
                try {
                  const priceNum = parseFloat(editRatePrice);
                  const durNum = parseFloat(editRateDuration);
                  const drinksNum = parseInt(editRateAllowance, 10);

                  const success = await updateRateCard(
                    selectedRate.id,
                    priceNum,
                    durNum,
                    drinksNum,
                    editRateName.trim()
                  );
                  stopAction();
                  if (success) {
                    setIsEditRateOpen(false);
                  }
                } catch (e) {
                  stopAction();
                }
              }}
            >
              <Text className="text-xs font-extrabold" style={{ color: isProcessing ? colors.muted : colors.primaryButtonText }}>
                {loadingAction === 'update_rates' ? `Saving... (${secondsLeft}s)` : 'Save Rates'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </AlertModal>

      {/* Deactivate / End Session Confirmation Modal */}
      <AlertModal
        visible={deactivateConfirmModalOpen}
        onClose={() => {
          setDeactivateConfirmModalOpen(false);
          setDeactivateTargetSession(null);
        }}
        title="End Customer Session"
      >
        <View>
          <View className="w-12 h-12 rounded-full bg-red/10 border justify-center items-center mb-4 self-center" style={{ borderColor: colors.red }}>
            <Text className="text-xl">⚠️</Text>
          </View>

          <Text className="text-muted text-[11px] text-center mb-5" style={{ color: colors.muted }}>
            Are you sure you want to manually end the session for customer <Text className="font-bold text-themeText" style={{ color: colors.text }}>{deactivateTargetSession?.customerName}</Text>?
          </Text>

          {/* Details Box */}
          <View className="w-full border rounded-xl p-3 mb-5" style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1.5 }}>
            <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.border }}>
              <Text className="text-[10px] text-muted">Token Code:</Text>
              <Text className="text-[10px] font-mono font-bold" style={{ color: colors.gold }}>{deactivateTargetSession?.tokenNumber}</Text>
            </View>
            <View className="flex-row justify-between py-1.5">
              <Text className="text-[10px] text-muted">Current Status:</Text>
              <Text className="text-[10px] font-bold uppercase" style={{ color: colors.text }}>{deactivateTargetSession?.status}</Text>
            </View>
          </View>

          {/* Force Release Checkbox Section */}
          {deactivateTargetSession?.status !== TokenStatus.PENDING_PAYMENT && (
            <View className="flex-row items-center gap-2 mb-6 p-3 rounded-xl border border-red/15 bg-red/5">
              <TouchableOpacity 
                className={`w-5 h-5 rounded border justify-center items-center ${forceRelease ? 'bg-red border-red' : 'bg-transparent'}`}
                style={{ borderColor: forceRelease ? 'transparent' : colors.border }}
                onPress={() => setForceRelease(!forceRelease)}
              >
                {forceRelease && <Text className="text-white text-xs font-bold">✓</Text>}
              </TouchableOpacity>
              <View className="flex-1">
                <Text className="text-[11px] font-bold text-red">Force Release (Ghost/Orphan Override)</Text>
                <Text className="text-[9px] text-muted mt-0.5" style={{ color: colors.muted }}>
                  Forcibly sets table & card status directly to available, bypassing validation.
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View className="flex-row gap-2.5 w-full">
            <TouchableOpacity 
              className="flex-1 py-3 rounded-xl bg-themeInput items-center justify-center min-h-[44px]" 
              onPress={() => {
                setDeactivateConfirmModalOpen(false);
                setDeactivateTargetSession(null);
              }}
              disabled={isDeactivating}
            >
              <Text className="text-xs font-bold" style={{ color: colors.muted }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className="flex-1 py-3 rounded-xl bg-red items-center justify-center min-h-[44px]"
              style={{ opacity: isProcessing ? 0.6 : 1 }}
              onPress={async () => {
                if (!deactivateTargetSession) return;
                if (!startAction('deactivate_session')) return;
                setIsDeactivating(true);
                try {
                  const success = await adminDeactivateSession(
                    deactivateTargetSession.tokenNumber,
                    deactivateTargetSession.status,
                    forceRelease
                  );
                  stopAction();
                  setIsDeactivating(false);
                  if (success) {
                    setDeactivateConfirmModalOpen(false);
                    setDeactivateTargetSession(null);
                  }
                } catch (e) {
                  stopAction();
                  setIsDeactivating(false);
                }
              }}
              disabled={isProcessing}
            >
              <Text className="text-xs font-bold text-white">
                {loadingAction === 'deactivate_session' ? `Ending... (${secondsLeft}s)` : 'End Session'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </AlertModal>

      {/* ADMIN EXTEND SESSION PAYMENT CONFIRMATION MODAL */}
      <AlertModal
        visible={isAdminExtendModalOpen && selectedAdminSession !== null}
        onClose={() => {
          setIsAdminExtendModalOpen(false);
          setAdminExtendRefId('');
        }}
        title="Extend Session — 1 Hour (Admin)"
      >
        {selectedAdminSession && (
          <View>
            <View className="mb-4 gap-2 py-2 border-t border-b" style={{ borderColor: colors.border }}>
              <View className="flex-row justify-between">
                <Text className="text-xs" style={{ color: colors.muted }}>Customer</Text>
                <Text className="text-xs font-bold" style={{ color: colors.text }}>{selectedAdminSession.customerName}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs" style={{ color: colors.muted }}>Table</Text>
                <Text className="text-xs font-mono font-bold" style={{ color: colors.gold }}>Table {selectedAdminSession.tableNumber || 'N/A'}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs" style={{ color: colors.muted }}>Guest Count</Text>
                <Text className="text-xs font-bold" style={{ color: colors.text }}>{selectedAdminSession.persons} Pax</Text>
              </View>
              <View className="flex-row justify-between mt-1">
                <Text className="text-xs font-bold" style={{ color: colors.text }}>Extension Fee</Text>
                <Text className="text-xs font-bold" style={{ color: colors.gold }}>
                  ₹{(() => {
                    const rateCard = rates.find(r => r.placeType === selectedAdminSession.placeType);
                    const rate = rateCard ? rateCard.ratePerPerson : (selectedAdminSession.placeType === 'PREMIUM_LOUNGE' ? 1200 : 500);
                    const duration = rateCard?.durationHours || 2;
                    return (rate * selectedAdminSession.persons * (1 / duration)).toFixed(0);
                  })()}
                </Text>
              </View>
            </View>

            {/* Payment Mode Selector */}
            <Text className="text-xs font-semibold mb-2" style={{ color: colors.text }}>Payment Mode *</Text>
            <View className="flex-row gap-2 mb-4">
              {(['CASH', 'UPI'] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  className="flex-1 py-2.5 rounded-xl border items-center justify-center"
                  style={{
                    backgroundColor: adminExtendPaymentMode === mode ? 'rgba(212, 175, 55, 0.1)' : colors.input,
                    borderColor: adminExtendPaymentMode === mode ? colors.gold : colors.border,
                    borderWidth: 1.5
                  }}
                  onPress={() => setAdminExtendPaymentMode(mode)}
                  disabled={isProcessing}
                >
                  <Text className="text-[11px] font-bold" style={{ color: adminExtendPaymentMode === mode ? colors.gold : colors.muted }}>
                    {mode === 'CASH' ? '💵 CASH' : '📱 UPI'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Static Dummy QR Code for UPI */}
            {adminExtendPaymentMode === 'UPI' && (
              <View className="items-center justify-center mb-4 p-4 rounded-xl border" style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1.5 }}>
                <Text className="text-[11px] font-bold mb-2" style={{ color: colors.gold }}>Scan dummy QR to pay</Text>
                <Image
                  source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=demo@upi&pn=NFCBar&am=${(() => {
                    const rateCard = rates.find(r => r.placeType === selectedAdminSession.placeType);
                    const rate = rateCard ? rateCard.ratePerPerson : (selectedAdminSession.placeType === 'PREMIUM_LOUNGE' ? 1200 : 500);
                    const duration = rateCard?.durationHours || 2;
                    return (rate * selectedAdminSession.persons * (1 / duration)).toFixed(0);
                  })()}` }}
                  style={{ width: 150, height: 150, borderRadius: 8 }}
                />
                <Text className="text-[9px] font-semibold mt-2" style={{ color: colors.muted }}>Demo purposes only • No actual verification</Text>
              </View>
            )}

            {/* Actions */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl border items-center justify-center"
                style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1.5, opacity: isProcessing ? 0.5 : 1 }}
                onPress={() => {
                  setIsAdminExtendModalOpen(false);
                  setAdminExtendRefId('');
                }}
                disabled={isProcessing}
              >
                <Text className="text-sm font-bold" style={{ color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl items-center justify-center border"
                style={{
                  backgroundColor: isProcessing ? (isDark ? '#27272A' : '#E4E4E7') : colors.gold,
                  borderColor: isProcessing ? (isDark ? '#3F3F46' : '#D4D4D8') : colors.gold,
                  borderWidth: 1.5,
                  opacity: isProcessing ? 0.6 : 1
                }}
                onPress={handleAdminExtend}
                disabled={isProcessing}
              >
                <Text className="text-sm font-bold" style={{ color: isProcessing ? colors.muted : colors.goldButtonText }}>
                  {loadingAction === 'admin_extend' ? `Extending... (${secondsLeft}s)` : 'Confirm & Extend'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </AlertModal>

      {/* CUSTOMER SESSION DETAILS INSPECTOR MODAL */}
      <AlertModal
        visible={selectedDetailsSession !== null}
        onClose={() => setSelectedDetailsSession(null)}
        title="Session Inspector"
      >
        {selectedDetailsSession && (() => {
          const session = selectedDetailsSession;
          const totalDurationMinutes = Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / (60 * 1000));
          const remainingMinutes = Math.round((new Date(session.endTime).getTime() - Date.now()) / (60 * 1000));
          const extensionMinutes = session.extensions ? session.extensions.reduce((acc: number, ext: any) => acc + ext.extraMinutes, 0) : 0;
          const extensionAmount = session.extensions ? session.extensions.reduce((acc: number, ext: any) => acc + ext.additionalAmount, 0) : 0;

          // Helper to format timestamps nicely
          const formatTimestamp = (dateStr?: string) => {
            if (!dateStr) return 'N/A';
            const d = new Date(dateStr);
            return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
          };

          // Assemble timeline events
          const events: Array<{ type: string; title: string; desc: string; time: string; timestamp: number }> = [];
          
          if (session.createdAt) {
            events.push({
              type: 'created',
              title: 'Customer Session Created',
              desc: `Registered by receptionist (Issued ID: ${session.tokenNumber})`,
              time: formatTimestamp(session.createdAt),
              timestamp: new Date(session.createdAt).getTime()
            });
            if (session.deliveryMode === 'EMAIL_QR') {
              events.push({
                type: 'qr',
                title: 'QR Code Generated',
                desc: `Delivery format assigned: Email QR code`,
                time: formatTimestamp(session.createdAt),
                timestamp: new Date(session.createdAt).getTime()
              });
            }
          }
          if (session.startTime) {
            events.push({
              type: 'started',
              title: 'Session Started',
              desc: `Checked in & activated`,
              time: formatTimestamp(session.startTime),
              timestamp: new Date(session.startTime).getTime()
            });
            if (session.tableNumber) {
              events.push({
                type: 'table',
                title: 'Table Assigned',
                desc: `Table ${session.tableNumber} occupied`,
                time: formatTimestamp(session.startTime),
                timestamp: new Date(session.startTime).getTime()
              });
            }
            if (session.cardUid) {
              events.push({
                type: 'nfc',
                title: 'NFC Card Programmed',
                desc: `NFC Uid: ${session.cardUid}`,
                time: formatTimestamp(session.startTime),
                timestamp: new Date(session.startTime).getTime()
              });
            }
          }

          if (session.extensions) {
            session.extensions.forEach((ext: any) => {
              events.push({
                type: 'extend',
                title: 'Session Extended',
                desc: `Added +${ext.extraMinutes} mins | Approved by: ${ext.approvedBy}`,
                time: formatTimestamp(ext.extendedAt),
                timestamp: new Date(ext.extendedAt).getTime()
              });
            });
          }

          if (session.redemptions) {
            session.redemptions.forEach((red: any) => {
              events.push({
                type: 'redeem',
                title: `Drinks Redeemed (Seq #${red.redemptionSequence})`,
                desc: `Redemption processed by bartender: ${red.bartenderName}`,
                time: formatTimestamp(red.redeemedAt),
                timestamp: new Date(red.redeemedAt).getTime()
              });
            });
          }

          if (session.status === TokenStatus.EXPIRED) {
            events.push({
              type: 'expired',
              title: 'Session Expired',
              desc: `Chronological limit reached`,
              time: formatTimestamp(session.endTime),
              timestamp: new Date(session.endTime).getTime()
            });
          }

          if (session.closedAt) {
            events.push({
              type: 'closed',
              title: 'Checkout & Closed',
              desc: `Closed by: ${session.closedBy || 'System'}`,
              time: formatTimestamp(session.closedAt),
              timestamp: new Date(session.closedAt).getTime()
            });
            if (session.tableNumber) {
              events.push({
                type: 'release',
                title: 'Table Released',
                desc: `Table ${session.tableNumber} vacated & released`,
                time: formatTimestamp(session.closedAt),
                timestamp: new Date(session.closedAt).getTime()
              });
            }
          }

          if (session.cancelledAt) {
            events.push({
              type: 'cancelled',
              title: 'Session Cancelled',
              desc: `Cancelled by: ${session.cancelledBy || 'User'} (Reason: ${session.cancelReason || 'N/A'})`,
              time: formatTimestamp(session.cancelledAt),
              timestamp: new Date(session.cancelledAt).getTime()
            });
          }

          // Sort chronologically
          events.sort((a, b) => a.timestamp - b.timestamp);

          return (
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {/* Customer Info Card */}
              <View className="mb-4 p-3 rounded-xl border" style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border }}>
                <Text style={{ color: colors.gold, fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Customer Profile</Text>
                <View className="gap-2">
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Name</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.text }}>{session.customerName}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Mobile</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.text }}>{session.phoneNumber}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Email</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.text }}>{session.email || 'N/A'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Guest Count (Pax)</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.text }}>{session.persons}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Customer ID</Text>
                    <Text className="text-xs font-mono" style={{ color: colors.muted }} numberOfLines={1}>{session.customerId || 'N/A'}</Text>
                  </View>
                </View>
              </View>

              {/* Session Details Info */}
              <View className="mb-4 p-3 rounded-xl border" style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border }}>
                <Text style={{ color: colors.gold, fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Session Specifications</Text>
                <View className="gap-2">
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Session Status</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.gold }}>{session.status.toUpperCase()}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Assigned Table</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.text }}>{session.tableNumber ? `Table ${session.tableNumber}` : 'No Seating'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>NFC UID Reference</Text>
                    <Text className="text-xs font-mono font-bold" style={{ color: colors.text }}>{session.cardUid || 'N/A'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Start Time</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.text }}>{formatTimestamp(session.startTime)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>End Time</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.text }}>{formatTimestamp(session.endTime)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Base Duration</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.text }}>{totalDurationMinutes - extensionMinutes} mins</Text>
                  </View>
                  {extensionMinutes > 0 && (
                    <View className="flex-row justify-between">
                      <Text className="text-xs" style={{ color: colors.muted }}>Extended Duration</Text>
                      <Text className="text-xs font-bold" style={{ color: colors.gold }}>+{extensionMinutes} mins</Text>
                    </View>
                  )}
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Remaining Time</Text>
                    <Text className="text-xs font-bold" style={{ color: remainingMinutes > 0 ? colors.success : colors.red }}>
                      {remainingMinutes > 0 ? `${remainingMinutes} mins` : 'Expired'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Payment Summary */}
              <View className="mb-4 p-3 rounded-xl border" style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border }}>
                <Text style={{ color: colors.gold, fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Payment & Accounting</Text>
                <View className="gap-2">
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Base Paid Amount</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.text }}>₹{session.amountPaid - extensionAmount}</Text>
                  </View>
                  {extensionAmount > 0 && (
                    <View className="flex-row justify-between">
                      <Text className="text-xs" style={{ color: colors.muted }}>Extensions Surcharges</Text>
                      <Text className="text-xs font-bold" style={{ color: colors.text }}>₹{extensionAmount}</Text>
                    </View>
                  )}
                  <View className="flex-row justify-between">
                    <Text className="text-xs font-bold" style={{ color: colors.text }}>Total Settlement</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.gold }}>₹{session.amountPaid}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Payment Status</Text>
                    <Text className="text-xs font-bold" style={{ color: session.paymentVerified ? colors.success : colors.red }}>
                      {session.paymentVerified ? 'Verified' : 'Pending Verification'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Customer History Summary */}
              <View className="mb-4 p-3 rounded-xl border" style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border }}>
                <Text style={{ color: colors.gold, fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Customer History</Text>
                <View className="gap-2">
                  <View className="flex-row justify-between">
                    <Text className="text-xs" style={{ color: colors.muted }}>Total Registered Visits</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.text }}>{session.customerVisits || 1} times</Text>
                  </View>
                  {session.lastVisit && (
                    <View className="flex-row justify-between">
                      <Text className="text-xs" style={{ color: colors.muted }}>Previous Check-in</Text>
                      <Text className="text-xs font-bold" style={{ color: colors.text }}>{formatTimestamp(session.lastVisit)}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Chronological Session Timeline */}
              <View className="mb-4 p-3 rounded-xl border" style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border }}>
                <Text style={{ color: colors.gold, fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase', marginBottom: 12 }}>Session Timeline</Text>
                <View style={{ paddingLeft: 12 }}>
                  {events.map((ev, index) => (
                    <View key={index} style={{ flexDirection: 'row', marginBottom: 16 }}>
                      {/* Vertical line indicator */}
                      <View style={{ alignItems: 'center', marginRight: 12, position: 'relative' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, zIndex: 2 }} />
                        {index < events.length - 1 && (
                          <View style={{ width: 2, position: 'absolute', top: 8, bottom: -16, backgroundColor: colors.border, zIndex: 1 }} />
                        )}
                      </View>
                      <View style={{ flex: 1, marginTop: -3 }}>
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.text }}>{ev.title}</Text>
                        <Text style={{ fontSize: 9, color: colors.muted, marginTop: 2 }}>{ev.desc}</Text>
                        <Text style={{ fontSize: 8, color: colors.muted, marginTop: 4 }}>{ev.time}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Close Action */}
              <TouchableOpacity
                style={{ 
                  backgroundColor: colors.gold, 
                  borderRadius: 12, 
                  paddingVertical: 12, 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  marginTop: 10,
                  marginBottom: 10
                }}
                onPress={() => setSelectedDetailsSession(null)}
              >
                <Text style={{ color: colors.goldButtonText, fontWeight: 'bold', fontSize: 12 }}>Close Inspector</Text>
              </TouchableOpacity>
            </ScrollView>
          );
        })()}
      </AlertModal>
    </View>
  );
};

const styles = StyleSheet.create({});
