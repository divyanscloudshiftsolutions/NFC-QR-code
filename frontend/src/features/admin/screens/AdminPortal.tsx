import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, Modal, StyleSheet, ActivityIndicator, Image
} from 'react-native';
import { useNfcBar } from '../../../context/NfcBarContext';
import { Table, PlaceType, TableStatus, TokenStatus, StaffMember, InventoryCard, CardStatus, RateCard } from '../../../types/nfc_bar';
import { AppIcon } from '../../../components/common/AppIcon';
import { useTheme } from '../../../context/ThemeContext';

export const AdminPortal: React.FC = () => {
  const { colors, isDark } = useTheme();
  const { 
    sessions, adminSessions, tables, users, cards, rates, user: loggedUser, addTable, editTable, updateTableStatus, deleteTable,
    registerStaff, updateStaff, updateStaffStatus, fetchCards, updateCardStatus, fetchRates, updateRateCard,
    salesSummary, tableUtilization, hourlyBreakdown, fetchReports, showToast,
    nfcEnabled, emailQrEnabled, updateDeliveryAvailability,
    fetchAdminSessions, adminDeactivateSession, extendSessionTime
  } = useNfcBar();
  const [adminSubTab, setAdminSubTab] = useState<'live' | 'tables' | 'staff' | 'chart' | 'cards' | 'rates' | 'settings' | 'customers'>('live');

  // Card inventory search & filter state
  const [cardSearch, setCardSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<'all' | 'available' | 'assigned' | 'lost' | 'damaged' | 'inactive'>('all');

  // Customer sessions tab state
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState<'all' | 'active' | 'extended' | 'expired' | 'pending_payment' | 'closed' | 'cancelled'>('all');
  const [deactivateConfirmModalOpen, setDeactivateConfirmModalOpen] = useState(false);
  const [deactivateTargetSession, setDeactivateTargetSession] = useState<{ tokenNumber: string; status: TokenStatus; customerName: string } | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [forceRelease, setForceRelease] = useState(false);

  // Extend Session modal states (Admin)
  const [isAdminExtendModalOpen, setIsAdminExtendModalOpen] = useState(false);
  const [selectedAdminSession, setSelectedAdminSession] = useState<any | null>(null);
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

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (adminSubTab === 'cards') {
      fetchCards();
    } else if (adminSubTab === 'rates') {
      fetchRates();
    } else if (adminSubTab === 'chart') {
      fetchReports(reportFilter, startDateStr || undefined, endDateStr || undefined);
    } else if (adminSubTab === 'customers') {
      fetchAdminSessions();
    } else if (adminSubTab === 'live') {
      fetchReports('day');
    }
  }, [adminSubTab, reportFilter, startDateStr, endDateStr]);

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
    
    const rateCard = rates.find(r => r.placeType === selectedAdminSession.placeType);
    const rate = rateCard ? rateCard.ratePerPerson : (selectedAdminSession.placeType === 'PREMIUM_LOUNGE' ? 1200 : 500);
    const duration = rateCard?.durationHours || 2;
    const amount = rate * selectedAdminSession.persons * (1 / duration);

    setIsAdminExtendingLoading(true);
    const success = await extendSessionTime(selectedAdminSession.tokenNumber, 1, amount);
    setIsAdminExtendingLoading(false);
    if (success) {
      setIsAdminExtendModalOpen(false);
      setSelectedAdminSession(null);
      setAdminExtendRefId('');
      setAdminExtendPaymentMode('CASH');
      await fetchAdminSessions();
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
              <AppIcon name="credit-card" label="Revenue Logo" color="#f5a623" size={12} />
              <Text className="text-muted text-[9px] font-bold uppercase tracking-wider">Revenue</Text>
            </View>
            <Text className="font-mono text-themeText text-base font-extrabold" style={{ color: colors.text }}>₹{((salesSummary?.todaySales || 0) / 1000).toFixed(1)}K</Text>
            <Text className="text-[#22c55e] text-[8px] font-semibold mt-0.5">+12.4% today</Text>
          </View>

          {/* Card 2: Guests */}
          <View style={{ width: 145, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 14, justifyContent: 'center' }}>
            <View className="flex-row items-center gap-1.5 mb-1">
              <AppIcon name="users" label="Guests Logo" color="#4ecdc4" size={12} />
              <Text className="text-muted text-[9px] font-bold uppercase tracking-wider">Guests</Text>
            </View>
            <Text className="font-mono text-themeText text-base font-extrabold" style={{ color: colors.text }}>{salesSummary?.totalCustomers || 0}</Text>
            <Text className="text-[#22c55e] text-[8px] font-semibold mt-0.5">{activeCount} active groups</Text>
          </View>

          {/* Card 3: Served */}
          <View style={{ width: 145, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 14, justifyContent: 'center' }}>
            <View className="flex-row items-center gap-1.5 mb-1">
              <AppIcon name="cup" label="Served Logo" color="#f5a623" size={12} />
              <Text className="text-muted text-[9px] font-bold uppercase tracking-wider">Served</Text>
            </View>
            <Text className="font-mono text-themeText text-base font-extrabold" style={{ color: colors.text }}>{salesSummary?.todayRedemptions || 0}</Text>
            <Text className="text-[#22c55e] text-[8px] font-semibold mt-0.5">coupons redeemed</Text>
          </View>

          {/* Card 4: Peak Hour */}
          <View style={{ width: 145, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 14, justifyContent: 'center' }}>
            <View className="flex-row items-center gap-1.5 mb-1">
              <AppIcon name="chart" label="Peak Logo" color="#e63946" size={12} />
              <Text className="text-muted text-[9px] font-bold uppercase tracking-wider">Peak Hour</Text>
            </View>
            <Text className="font-mono text-themeText text-base font-extrabold" style={{ color: colors.text }}>10 PM</Text>
            <Text className="text-[#e63946] text-[8px] font-semibold mt-0.5">94.8K Busiest shift</Text>
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
          <View style={{ flexDirection: 'row', backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, marginTop: 4, alignItems: 'center' }}>
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
              { label: 'Available', filterVal: 'available' as const, count: cards.filter(c => c.status.toLowerCase() === 'available').length, color: '#22c55e' },
              { label: 'Assigned', filterVal: 'assigned' as const, count: cards.filter(c => c.status.toLowerCase() === 'assigned').length, color: '#f5a623' },
              { label: 'Lost', filterVal: 'lost' as const, count: cards.filter(c => c.status.toLowerCase() === 'lost').length, color: '#e63946' },
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
                    let statusBadgeColor = 'text-gold border-gold/20 bg-gold/5';
                    if (statusLower === 'available') statusBadgeColor = 'text-[#22c55e] border-[#22c55e]/20 bg-[#22c55e]/5';
                    else if (statusLower === 'lost') statusBadgeColor = 'text-red border-red/20 bg-red/5';
                    else if (statusLower === 'damaged') statusBadgeColor = 'text-[#9ca3af] border-transparent bg-white/5';
                    else if (statusLower === 'inactive') statusBadgeColor = 'text-[#a78bfa] border-[#a78bfa]/20 bg-[#a78bfa]/5';

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
                            <View className={`px-2 py-0.5 rounded border ${statusBadgeColor}`}>
                              <Text style={{ fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' }}>{card.status}</Text>
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
                                    <Text className="text-[#22c55e] text-[8px] font-bold">Activ</Text>
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
                                  <Text className="text-[#22c55e] text-[8px] font-bold">Available</Text>
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
              <AppIcon name="refresh" label="Refresh" size={10} color="#f5a623" />
            </TouchableOpacity>
          </View>

          {rates.map(rate => (
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
                    <Text className="text-[#22c55e] text-xs font-bold mt-0.5">{rate.maxDrinks} Drinks</Text>
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
          ))}
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

          {tables.map(table => {
            const isOccupied = table.status === TableStatus.OCCUPIED || table.occupiedSeats > 0;
            let statusColor = 'text-[#22c55e]';
            if (table.status === TableStatus.MAINTENANCE) statusColor = 'text-muted';
            else if (table.status === TableStatus.RESERVED) statusColor = 'text-[#3b82f6]';
            else if (isOccupied) statusColor = 'text-[#f5a623]';

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
                    <Text className={`font-extrabold text-[10px] uppercase ${statusColor}`}>{isOccupied ? 'occupied' : table.status}</Text>
                  </View>
                </View>

                {/* Status Toggles & Actions */}
                <View className="flex-row justify-between items-center mt-2 border-t border-transparent pt-2">
                  <View className="flex-row gap-1.5">
                    {!isOccupied ? (
                      <>
                        <TouchableOpacity
                          className={`px-2 py-1 rounded border ${table.status === TableStatus.AVAILABLE ? 'border-[#22c55e] bg-[#22c55e]/5' : colors.border }`}
                          onPress={() => updateTableStatus(table.id, 'available')}
                        >
                          <Text style={{ fontSize: 9, fontWeight: 'bold', color: table.status === TableStatus.AVAILABLE ? '#22c55e' : colors.muted }}>Available</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          className={`px-2 py-1 rounded border ${table.status === TableStatus.RESERVED ? 'border-[#3b82f6] bg-[#3b82f6]/5' : colors.border }`}
                          onPress={() => updateTableStatus(table.id, 'reserved')}
                        >
                          <Text style={{ fontSize: 9, fontWeight: 'bold', color: table.status === TableStatus.RESERVED ? '#3b82f6' : colors.muted }}>Reserve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          className={`px-2 py-1 rounded border ${table.status === TableStatus.MAINTENANCE ? 'border-muted bg-[#7a7d8a]/5' : colors.border }`}
                          onPress={() => updateTableStatus(table.id, 'maintenance')}
                        >
                          <Text style={{ fontSize: 9, fontWeight: 'bold', color: table.status === TableStatus.MAINTENANCE ? '#e63946' : colors.muted }}>Maint</Text>
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
                      <Text className="text-[9px] font-bold" style={{ color: '#e63946' }}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
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
                  style={{ color: colors.text }}
                  placeholder="Start: 2026-06-01"
                  placeholderTextColor={colors.placeholder}
                  value={customStart}
                  onChangeText={setCustomStart}
                />
                <TextInput
                  className="flex-1 bg-themeInput text-themeText text-xs px-3 py-2 border border-transparent rounded-lg"
                  style={{ color: colors.text }}
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
                <Text className="font-mono text-[#22c55e] text-xs font-bold mt-1">{salesSummary?.todayRedemptions || 0} drinks</Text>
              </View>
            </View>

            {/* Peak hour */}
            <View style={{ width: '33.33%', padding: 4 }}>
              <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 12, alignItems: 'center' }}>
                <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">Peak hour</Text>
                <Text className="font-mono text-[#4ecdc4] text-xs font-bold mt-1">
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

                  if (displayHours.length === 0) {
                    return (
                      <View className="w-80 h-full justify-center items-center">
                        <Text className="text-muted text-xs">No redemption data available for this range</Text>
                      </View>
                    );
                  }

                  return displayHours.map((d: any) => {
                    const heightPct = ((d.redemptions || 0) / maxVal) * 100;
                    const isPeak = d.hour === peakH;
                    const displayHr = d.hour === 0 ? '12 AM' : (d.hour < 12 ? `${d.hour} AM` : (d.hour === 12 ? '12 PM' : `${d.hour - 12} PM`));

                    return (
                      <View key={d.hour} className="items-center w-8">
                        <View className="w-3.5 h-full bg-themeInput rounded-full justify-end overflow-hidden">
                          <View 
                            className={`w-full rounded-full ${isPeak ? 'bg-[#f5a623]' : 'bg-[#f5a623]/45'}`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </View>
                        <Text className="font-mono text-muted text-[8px] mt-1.5" numberOfLines={1}>
                          {displayHr.split(' ')[0]}
                        </Text>
                      </View>
                    );
                  });
                })()}
              </View>
            </ScrollView>
            
            {/* Dynamic Tooltip Info box */}
            <View className="bg-themeInput border border-transparent rounded-xl p-3">
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
                    <Text className="flex-1 text-[#4ecdc4] text-xs font-bold text-right">{t.turnoverCount}</Text>
                    <Text className="flex-1 text-themeText text-xs font-semibold text-right" style={{ color: colors.text }}>{Math.round(t.averageSessionDurationMinutes)}m</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Add Table Modal */}
      <Modal visible={isAddModalOpen} transparent animationType="slide">
        <View className="flex-1 justify-center p-4" style={{ backgroundColor: colors.overlay }}>
          <View className="border border-gold/20 rounded-2xl p-5 shadow-2xl" style={{ backgroundColor: colors.surface }}>
            <Text className="text-base font-bold text-gold mb-4">Add Seating Table</Text>
            
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
              />
              {newTableNumber.trim().length > 0 && !isNewTableNumberValid && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Must start with S- or L- followed by a 2-3 digit number (e.g., S-12, L-04).</Text>
                </View>
              )}
            </View>

            <View className="mb-4">
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>Place Type</Text>
              <View className="flex-row gap-2">
                <TouchableOpacity 
                  className={`flex-1 py-2.5 items-center rounded-xl border ${newPlaceType === 'STANDING_BAR' ? 'border-gold bg-gold/5' : 'border-transparent bg-themeInput'}`}
                  onPress={() => setNewPlaceType('STANDING_BAR')}
                >
                  <Text className={`text-xs font-bold ${newPlaceType === 'STANDING_BAR' ? 'text-gold' : 'text-muted'}`}>Standing Bar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  className={`flex-1 py-2.5 items-center rounded-xl border ${newPlaceType === 'PREMIUM_LOUNGE' ? 'border-gold bg-gold/5' : 'border-transparent bg-themeInput'}`}
                  onPress={() => setNewPlaceType('PREMIUM_LOUNGE')}
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
              />
              {newCapacity.trim().length > 0 && !isNewCapacityValid && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Capacity must be a number between 1 and 100.</Text>
                </View>
              )}
            </View>

            <View className="flex-row justify-end gap-2.5">
              <TouchableOpacity className="py-2.5 px-4 rounded-xl bg-themeInput" onPress={() => setIsAddModalOpen(false)}>
                <Text className="text-xs font-bold" style={{ color: colors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className={`py-2.5 px-4 rounded-xl bg-gold ${!isAddTableFormValid ? 'opacity-50' : 'active:opacity-90'}`}
                disabled={!isAddTableFormValid}
                onPress={async () => {
                  if (!isAddTableFormValid) return;
                  const capNum = parseInt(newCapacity, 10);
                  const success = await addTable(newTableNumber.toUpperCase().trim(), newPlaceType, capNum);
                  if (success) {
                    setIsAddModalOpen(false);
                  }
                }}
              >
                <Text className="text-xs font-extrabold" style={{ color: colors.primaryButtonText }}>Save Table</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Table Modal */}
      <Modal visible={isEditModalOpen} transparent animationType="slide">
        <View className="flex-1 justify-center p-4" style={{ backgroundColor: colors.overlay }}>
          <View className="border border-gold/20 rounded-2xl p-5 shadow-2xl" style={{ backgroundColor: colors.surface }}>
            <Text className="text-base font-bold text-gold mb-4">Edit Table {selectedTable?.number}</Text>

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
              />
              {editCapacity.trim().length > 0 && !isEditCapacityValid && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Capacity must be a number between 1 and 100.</Text>
                </View>
              )}
            </View>

            <View className="flex-row justify-end gap-2.5">
              <TouchableOpacity className="py-2.5 px-4 rounded-xl bg-themeInput" onPress={() => setIsEditModalOpen(false)}>
                <Text className="text-xs font-bold" style={{ color: colors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className={`py-2.5 px-4 rounded-xl bg-gold ${!isEditCapacityValid ? 'opacity-50' : 'active:opacity-90'}`}
                disabled={!isEditCapacityValid}
                onPress={async () => {
                  if (!selectedTable || !isEditCapacityValid) return;
                  const capNum = parseInt(editCapacity, 10);
                  const success = await editTable(selectedTable.id, selectedTable.number, selectedTable.placeType, capNum);
                  if (success) {
                    setIsEditModalOpen(false);
                  }
                }}
              >
                <Text className="text-xs font-extrabold" style={{ color: colors.primaryButtonText }}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

          {users.map(staff => {
            const isSelf = loggedUser?.id === staff.id;
            let roleBadgeColor = 'text-gold border-gold/20 bg-gold/5';
            if (staff.role.name === 'admin') roleBadgeColor = 'text-red border-red/20 bg-red/5';
            else if (staff.role.name === 'bartender') roleBadgeColor = 'text-[#22c55e] border-[#22c55e]/20 bg-[#22c55e]/5';
            else if (staff.role.name === 'manager') roleBadgeColor = 'text-[#3b82f6] border-[#3b82f6]/20 bg-[#3b82f6]/5';

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
                    <View className={`px-2 py-0.5 rounded border ${roleBadgeColor}`}>
                      <Text className="text-[9px] font-bold uppercase" style={{ fontSize: 9 }}>{staff.role.name}</Text>
                    </View>
                    <Text className={`text-[9px] font-semibold mt-1 ${staff.isActive ? 'text-[#22c55e]' : 'text-red'}`}>
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
                        className={`px-2.5 py-1 rounded border ${staff.isActive ? 'border-red/30 bg-red/5' : 'border-[#22c55e]/30 bg-[#22c55e]/5'}`}
                        onPress={() => updateStaffStatus(staff.id, !staff.isActive)}
                      >
                        <Text className={`text-[9px] font-bold ${staff.isActive ? 'text-red' : 'text-[#22c55e]'}`}>
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
          })}
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
                className={`px-4 py-2 rounded-xl border ${localNfcEnabled ? 'border-[#22c55e] bg-[#22c55e]/10' : 'border-transparent bg-themeInput'}`}
                onPress={() => {
                  if (localNfcEnabled && !localEmailQrEnabled) {
                    showToast('At least one token delivery method must remain active.', 'warning');
                    return;
                  }
                  setLocalNfcEnabled(!localNfcEnabled);
                }}
              >
                <Text className={`text-xs font-bold ${localNfcEnabled ? 'text-[#22c55e]' : 'text-muted'}`}>
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
                className={`px-4 py-2 rounded-xl border ${localEmailQrEnabled ? 'border-[#22c55e] bg-[#22c55e]/10' : 'border-transparent bg-themeInput'}`}
                onPress={() => {
                  if (localEmailQrEnabled && !localNfcEnabled) {
                    showToast('At least one token delivery method must remain active.', 'warning');
                    return;
                  }
                  setLocalEmailQrEnabled(!localEmailQrEnabled);
                }}
              >
                <Text className={`text-xs font-bold ${localEmailQrEnabled ? 'text-[#22c55e]' : 'text-muted'}`}>
                  {localEmailQrEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            className={`w-full bg-gold py-4 rounded-xl items-center justify-center min-h-[50px]
              ${isSavingSettings ? 'opacity-65' : 'active:opacity-90'}`}
            disabled={isSavingSettings}
            onPress={async () => {
              setIsSavingSettings(true);
              const success = await updateDeliveryAvailability(localNfcEnabled, localEmailQrEnabled);
              setIsSavingSettings(false);
            }}
          >
            <Text className="font-extrabold text-sm" style={{ color: colors.primaryButtonText }}>
              {isSavingSettings ? 'Saving Settings...' : 'Save Configurations'}
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

          {/* Session Cards List */}
          <View style={{ gap: 10 }}>
            {(() => {
              const filteredSessions = adminSessions.filter(s => {
                const matchesSearch = 
                  s.customerName.toLowerCase().includes(customerSearch.toLowerCase()) ||
                  s.phoneNumber.includes(customerSearch) ||
                  (s.email && s.email.toLowerCase().includes(customerSearch.toLowerCase())) ||
                  (s.tableNumber && s.tableNumber.toLowerCase().includes(customerSearch.toLowerCase())) ||
                  s.tokenNumber.toLowerCase().includes(customerSearch.toLowerCase());

                const matchesStatus = 
                  customerStatusFilter === 'all' || 
                  s.status === customerStatusFilter;

                return matchesSearch && matchesStatus;
              });

              if (filteredSessions.length === 0) {
                return (
                  <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.text, fontSize: 12, textAlign: 'center' }}>No sessions match current criteria</Text>
                  </View>
                );
              }

              return filteredSessions.map(session => {
                const isDeactivatable = 
                  session.status !== TokenStatus.CLOSED && 
                  session.status !== TokenStatus.CANCELLED;

                let badgeStyle = { bg: 'rgba(156, 163, 175, 0.1)', border: 'rgba(156, 163, 175, 0.2)', text: colors.muted };
                if (session.status === TokenStatus.ACTIVE) {
                  badgeStyle = { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' };
                } else if (session.status === TokenStatus.EXTENDED) {
                  badgeStyle = { bg: 'rgba(245, 166, 35, 0.15)', border: 'rgba(245, 166, 35, 0.3)', text: '#f5a623' };
                } else if (session.status === TokenStatus.EXPIRED) {
                  badgeStyle = { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' };
                } else if (session.status === TokenStatus.PENDING_PAYMENT) {
                  badgeStyle = { bg: 'rgba(212, 175, 55, 0.15)', border: 'rgba(212, 175, 55, 0.3)', text: '#d4af37' };
                }

                return (
                  <View 
                    key={session.id} 
                    style={{ 
                      backgroundColor: colors.card, 
                      borderColor: colors.border, 
                      borderWidth: 1,
                      borderRadius: 16,
                      padding: 12,
                      gap: 8
                    }}
                  >
                    {/* Header */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 12 }} numberOfLines={1}>{session.customerName}</Text>
                        <Text style={{ color: colors.muted, fontSize: 8, marginTop: 1 }}>{session.phoneNumber}</Text>
                      </View>
                      <View style={{ backgroundColor: badgeStyle.bg, borderColor: badgeStyle.border, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ color: badgeStyle.text, fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' }}>{session.status}</Text>
                      </View>
                    </View>

                    {/* Table and token details Grid */}
                    <View className="flex-row py-2 border-t border-b" style={{ borderColor: colors.border, borderTopWidth: 1, borderBottomWidth: 1 }}>
                      <View className="flex-1">
                        <Text style={{ color: colors.muted, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Token Number</Text>
                        <Text style={{ color: colors.gold, fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold', marginTop: 2 }}>{session.tokenNumber}</Text>
                      </View>
                      <View className="flex-1">
                        <Text style={{ color: colors.muted, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Seating Table</Text>
                        <Text style={{ color: colors.text, fontSize: 10, fontWeight: 'bold', marginTop: 2 }}>
                          {session.tableNumber ? `Table ${session.tableNumber}` : 'No Table'}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text style={{ color: colors.muted, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Format / Guests</Text>
                        <Text style={{ color: colors.text, fontSize: 10, fontWeight: 'bold', marginTop: 2 }}>
                          {session.deliveryMode === 'EMAIL_QR' ? '📧 QR' : '💳 NFC'} • {session.persons} pax
                        </Text>
                      </View>
                    </View>

                    {/* Actions block */}
                    <View className="flex-row justify-between items-center mt-1">
                      <View className="flex-grow">
                        {session.status !== TokenStatus.CLOSED && session.status !== TokenStatus.CANCELLED && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: colors.muted, fontSize: 9 }}>
                              Redeemed: {session.redemptionCount}/{session.redemptionLimit} drinks
                            </Text>
                            {(session.status === TokenStatus.ACTIVE || session.status === TokenStatus.EXTENDED || session.status === TokenStatus.EXPIRED) && (
                              <Text style={{ color: (new Date(session.endTime).getTime() - Date.now() <= 15 * 60 * 1000) ? '#ef4444' : colors.gold, fontSize: 9, fontWeight: 'bold' }}>
                                ⏰ {formatTimeRemaining(new Date(session.endTime).getTime() - Date.now())} left
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                      {isDeactivatable && (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {(session.status === TokenStatus.ACTIVE || session.status === TokenStatus.EXTENDED || session.status === TokenStatus.EXPIRED) && (
                            <TouchableOpacity
                              style={{ backgroundColor: 'rgba(245, 166, 35, 0.1)', borderWidth: 1, borderColor: 'rgba(245, 166, 35, 0.3)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignItems: 'center' }}
                              onPress={() => {
                                setSelectedAdminSession(session);
                                setIsAdminExtendModalOpen(true);
                              }}
                            >
                              <Text style={{ color: colors.gold, fontSize: 9, fontWeight: 'bold' }}>Extend</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignItems: 'center' }}
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
                            <Text style={{ color: '#ef4444', fontSize: 9, fontWeight: 'bold' }}>End Session</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );
              });
            })()}
          </View>
        </ScrollView>
      )}
      </View>

      {/* Add Staff Modal */}
      <Modal visible={isAddStaffOpen} transparent animationType="slide">
        <View className="flex-1 justify-center p-4" style={{ backgroundColor: colors.overlay }}>
          <View className="border border-gold/20 rounded-2xl p-5 shadow-2xl" style={{ backgroundColor: colors.surface }}>
            <Text className="text-base font-bold text-gold mb-4">Add Staff Account</Text>
            
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
              />
              {newStaffFullName.trim().length > 0 && !isNewStaffFullNameValid && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Name must be between 2 and 100 characters, containing only letters.</Text>
                </View>
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
                      // Autofill a standard format suffix if blank or matching previous roles
                      if (!newStaffUsername || /^(REC|BAR|ADM|MGR)-\d{2}$/.test(newStaffUsername.trim().toUpperCase()) || newStaffUsername.trim().length <= 4) {
                        setNewStaffUsername(`${prefix}-05`);
                      }
                    }}
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
              />
              <View className="mt-1.5">
                {newStaffUsername.trim().length > 0 ? (
                  isNewStaffUsernameValid ? (
                    <Text className="text-teal text-[10px] font-semibold">✓ Correct prefix code and 2-digit numeric suffix</Text>
                  ) : (
                    <View className="bg-red/5 border border-red/10 rounded-lg p-2">
                      <Text className="text-red text-[10px] leading-3.5">⚠️ Expected prefix "{expectedNewStaffPrefix}-" followed by exactly 2 digits (e.g. {expectedNewStaffPrefix}-12).</Text>
                    </View>
                  )
                ) : (
                  <Text className="text-muted text-[10px]">Enter employee identity code matching role suffix.</Text>
                )}
              </View>
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
              />
              <View className="flex-row justify-between items-center mt-1.5">
                <View className="flex-row gap-1.5">
                  {[0, 1, 2, 3].map(i => (
                    <View 
                      key={i} 
                      className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: newStaffPassword.length > i ? colors.gold : colors.border, backgroundColor: newStaffPassword.length > i ? colors.gold : colors.input }} 
                    />
                  ))}
                </View>
                {newStaffPassword.trim().length > 0 && (
                  <Text className={`text-[10px] font-bold ${isNewStaffPasswordValid ? 'text-teal' : 'text-red'}`}>
                    {isNewStaffPasswordValid ? '✓ 4-digit PIN ready' : '✗ Must be 4 digits'}
                  </Text>
                )}
              </View>
            </View>

            <View className="flex-row justify-end gap-2.5">
              <TouchableOpacity className="py-2.5 px-4 rounded-xl bg-themeInput" onPress={() => setIsAddStaffOpen(false)}>
                <Text className="text-xs font-bold" style={{ color: colors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className={`py-2.5 px-4 rounded-xl bg-gold ${!isAddStaffFormValid ? 'opacity-50' : 'active:opacity-90'}`}
                disabled={!isAddStaffFormValid}
                onPress={async () => {
                  if (!isAddStaffFormValid) return;
                  const success = await registerStaff(
                    newStaffUsername.toUpperCase().trim(),
                    newStaffPassword,
                    newStaffFullName.trim(),
                    newStaffRole
                  );
                  if (success) {
                    setIsAddStaffOpen(false);
                  }
                }}
              >
                <Text className="text-xs font-extrabold" style={{ color: colors.primaryButtonText }}>Save Staff</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Staff Modal */}
      <Modal visible={isEditStaffOpen} transparent animationType="slide">
        <View className="flex-1 justify-center p-4" style={{ backgroundColor: colors.overlay }}>
          <View className="border border-gold/20 rounded-2xl p-5 shadow-2xl" style={{ backgroundColor: colors.surface }}>
            <Text className="text-base font-bold text-gold mb-4">Edit Staff Profile</Text>
            
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
              />
              {editStaffFullName.trim().length > 0 && !isEditStaffFullNameValid && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Name must be between 2 and 100 characters, containing only letters.</Text>
                </View>
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
                      if (!editStaffUsername || /^(REC|BAR|ADM|MGR)-\d{2}$/.test(editStaffUsername.trim().toUpperCase())) {
                        setEditStaffUsername(`${prefix}-${editStaffUsername.split('-')[1] || '01'}`);
                      }
                    }}
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
                  ${editStaffUsername.trim().length > 0 ? (isEditStaffUsernameValid ? 'border-teal/30' : 'border-red/45') : 'border-transparent'}`}
                style={{ color: colors.text }}
                placeholder={`${expectedEditStaffPrefix}-05`}
                placeholderTextColor={colors.placeholder}
                value={editStaffUsername}
                onChangeText={setEditStaffUsername}
                autoCapitalize="characters"
              />
              <View className="mt-1.5">
                {editStaffUsername.trim().length > 0 ? (
                  isEditStaffUsernameValid ? (
                    <Text className="text-teal text-[10px] font-semibold">✓ Correct prefix code and 2-digit numeric suffix</Text>
                  ) : (
                    <View className="bg-red/5 border border-red/10 rounded-lg p-2">
                      <Text className="text-red text-[10px] leading-3.5">⚠️ Expected prefix "{expectedEditStaffPrefix}-" followed by exactly 2 digits (e.g. {expectedEditStaffPrefix}-12).</Text>
                    </View>
                  )
                ) : (
                  <Text className="text-muted text-[10px]">Enter employee identity code matching role suffix.</Text>
                )}
              </View>
            </View>

            <View className="mb-4">
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: colors.text }}>New PIN / Password (Leave blank to keep current)</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm font-mono
                  ${editStaffPassword.trim().length > 0 ? (isEditStaffPasswordValid ? 'border-teal/30' : 'border-red/45') : 'border-transparent'}`}
                style={{ color: colors.text }}
                placeholder="New 4-Digit PIN"
                placeholderTextColor={colors.placeholder}
                value={editStaffPassword}
                onChangeText={setEditStaffPassword}
                secureTextEntry
                keyboardType="numeric"
                maxLength={4}
              />
              <View className="flex-row justify-between items-center mt-1.5">
                <View className="flex-row gap-1.5">
                  {[0, 1, 2, 3].map(i => (
                    <View 
                      key={i} 
                      className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: editStaffPassword.length > i ? colors.gold : colors.border, backgroundColor: editStaffPassword.length > i ? colors.gold : colors.input }} 
                    />
                  ))}
                </View>
                {editStaffPassword.trim().length > 0 ? (
                  <Text className={`text-[10px] font-bold ${isEditStaffPasswordValid ? 'text-teal' : 'text-red'}`}>
                    {isEditStaffPasswordValid ? '✓ 4-digit PIN ready' : '✗ Must be 4 digits'}
                  </Text>
                ) : (
                  <Text className="text-muted text-[10px]">Keeping current PIN.</Text>
                )}
              </View>
            </View>

            <View className="mb-6 flex-row items-center justify-between">
              <Text className="text-themeText text-xs font-semibold" style={{ color: colors.text }}>Account Active Status</Text>
              {loggedUser?.id === selectedStaff?.id ? (
                <Text className="text-muted text-[10px] italic">Locked (Logged-in User)</Text>
              ) : (
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className="px-3 py-1.5 rounded-lg border" style={{ borderColor: editStaffIsActive ? '#22c55e' : colors.border, backgroundColor: editStaffIsActive ? 'rgba(34, 197, 94, 0.05)' : colors.input }}
                    onPress={() => setEditStaffIsActive(true)}
                  >
                    <Text className={`text-[10px] font-bold ${editStaffIsActive ? 'text-[#22c55e]' : 'text-muted'}`}>Active</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="px-3 py-1.5 rounded-lg border" style={{ borderColor: !editStaffIsActive ? colors.red : colors.border, backgroundColor: !editStaffIsActive ? 'rgba(239, 68, 68, 0.05)' : colors.input }}
                    onPress={() => setEditStaffIsActive(false)}
                  >
                    <Text className={`text-[10px] font-bold ${!editStaffIsActive ? 'text-red' : 'text-muted'}`}>Deactivated</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View className="flex-row justify-end gap-2.5">
              <TouchableOpacity className="py-2.5 px-4 rounded-xl bg-themeInput" onPress={() => setIsEditStaffOpen(false)}>
                <Text className="text-xs font-bold" style={{ color: colors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className={`py-2.5 px-4 rounded-xl bg-gold ${!isEditStaffFormValid ? 'opacity-50' : 'active:opacity-90'}`}
                disabled={!isEditStaffFormValid}
                onPress={async () => {
                  if (!selectedStaff || !isEditStaffFormValid) return;
                  const success = await updateStaff(
                    selectedStaff.id,
                    editStaffUsername.toUpperCase().trim(),
                    editStaffFullName.trim(),
                    editStaffRole,
                    editStaffIsActive,
                    editStaffPassword ? editStaffPassword : undefined
                  );
                  if (success) {
                    setIsEditStaffOpen(false);
                  }
                }}
              >
                <Text className="text-xs font-extrabold" style={{ color: colors.primaryButtonText }}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Rate Modal */}
      <Modal visible={isEditRateOpen} transparent animationType="slide">
        <View className="flex-1 justify-center p-4" style={{ backgroundColor: colors.overlay }}>
          <View className="border border-gold/20 rounded-2xl p-5 shadow-2xl" style={{ backgroundColor: colors.surface }}>
            <Text className="text-base font-bold text-gold mb-4">Edit Rate Configuration</Text>
            
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
              />
              {editRateName.trim().length > 0 && !isEditRateNameValid && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Place type / zone name is required.</Text>
                </View>
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
              />
              {editRatePrice.trim().length > 0 && !isEditRatePriceValid && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Price must be a non-negative number.</Text>
                </View>
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
              />
              {editRateDuration.trim().length > 0 && !isEditRateDurationValid && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Duration must be a number between 0.5 and 24 hours.</Text>
                </View>
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
              />
              {editRateAllowance.trim().length > 0 && !isEditRateAllowanceValid && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Drinks allowance must be an integer between 0 and 50.</Text>
                </View>
              )}
            </View>

            <View className="flex-row justify-end gap-2.5">
              <TouchableOpacity className="py-2.5 px-4 rounded-xl bg-themeInput" onPress={() => setIsEditRateOpen(false)}>
                <Text className="text-xs font-bold" style={{ color: colors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className={`py-2.5 px-4 rounded-xl bg-gold ${!isEditRateFormValid ? 'opacity-50' : 'active:opacity-90'}`}
                disabled={!isEditRateFormValid}
                onPress={async () => {
                  if (!selectedRate || !selectedRate.id || !isEditRateFormValid) return;
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
                  if (success) {
                    setIsEditRateOpen(false);
                  }
                }}
              >
                <Text className="text-xs font-extrabold" style={{ color: colors.primaryButtonText }}>Save Rates</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Deactivate / End Session Confirmation Modal */}
      <Modal visible={deactivateConfirmModalOpen} transparent animationType="fade">
        <View className="flex-1 justify-center items-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}>
          <View className="w-[90%] border rounded-2xl p-5 shadow-2xl" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
            <View className="w-12 h-12 rounded-full bg-red/10 border justify-center items-center mb-4 self-center" style={{ borderColor: '#EF4444' }}>
              <Text className="text-xl">⚠️</Text>
            </View>

            <Text className="text-base font-bold text-center text-gold mb-2">End Customer Session</Text>
            <Text className="text-muted text-[11px] text-center mb-5" style={{ color: colors.muted }}>
              Are you sure you want to manually end the session for customer <Text className="font-bold text-themeText" style={{ color: colors.text }}>{deactivateTargetSession?.customerName}</Text>?
            </Text>

            {/* Details Box */}
            <View className="w-full border rounded-xl p-3 mb-5" style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}>
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
                onPress={async () => {
                  if (!deactivateTargetSession) return;
                  setIsDeactivating(true);
                  const success = await adminDeactivateSession(
                    deactivateTargetSession.tokenNumber,
                    deactivateTargetSession.status,
                    forceRelease
                  );
                  setIsDeactivating(false);
                  if (success) {
                    setDeactivateConfirmModalOpen(false);
                    setDeactivateTargetSession(null);
                  }
                }}
                disabled={isDeactivating}
              >
                {isDeactivating ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-xs font-bold text-white">End Session</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADMIN EXTEND SESSION PAYMENT CONFIRMATION MODAL */}
      <Modal
        visible={isAdminExtendModalOpen && selectedAdminSession !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAdminExtendModalOpen(false)}
      >
        <View className="flex-1 bg-black/75 justify-center p-4">
          {selectedAdminSession && (
            <View 
              className="border border-gold/20 rounded-2xl p-5 shadow-2xl" 
              style={{ backgroundColor: colors.surface }}
            >
              <Text className="text-base font-bold text-gold mb-3">Extend Session — 1 Hour (Admin)</Text>
              
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
                      borderWidth: 1
                    }}
                    onPress={() => setAdminExtendPaymentMode(mode)}
                  >
                    <Text className="text-[11px] font-bold" style={{ color: adminExtendPaymentMode === mode ? colors.gold : colors.muted }}>
                      {mode === 'CASH' ? '💵 CASH' : '📱 UPI'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Static Dummy QR Code for UPI */}
              {adminExtendPaymentMode === 'UPI' && (
                <View className="items-center justify-center mb-4 p-4 rounded-xl border" style={{ backgroundColor: colors.input, borderColor: colors.border }}>
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
                  style={{ backgroundColor: colors.input, borderColor: colors.border }}
                  onPress={() => {
                    setIsAdminExtendModalOpen(false);
                    setAdminExtendRefId('');
                  }}
                  disabled={isAdminExtendingLoading}
                >
                  <Text className="text-sm font-bold" style={{ color: colors.text }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 py-3 rounded-xl items-center justify-center border"
                  style={{
                    backgroundColor: colors.gold,
                    borderColor: colors.gold,
                    borderWidth: 1
                  }}
                  onPress={handleAdminExtend}
                  disabled={isAdminExtendingLoading}
                >
                  {isAdminExtendingLoading ? (
                    <ActivityIndicator size="small" color={colors.goldButtonText} />
                  ) : (
                    <Text className="text-sm font-bold" style={{ color: colors.goldButtonText }}>Confirm & Extend</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({});
