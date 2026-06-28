import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, Modal, StyleSheet
} from 'react-native';
import { useNfcBar } from '../../../context/NfcBarContext';
import { Table, PlaceType, TableStatus, TokenStatus, StaffMember, InventoryCard, CardStatus, RateCard } from '../../../types/nfc_bar';
import { AppIcon } from '../../../components/common/AppIcon';

export const AdminPortal: React.FC = () => {
  const { 
    sessions, tables, users, cards, rates, user: loggedUser, addTable, editTable, updateTableStatus, deleteTable,
    registerStaff, updateStaff, updateStaffStatus, fetchCards, updateCardStatus, fetchRates, updateRateCard,
    salesSummary, tableUtilization, hourlyBreakdown, fetchReports, showToast,
    nfcEnabled, emailQrEnabled, updateDeliveryAvailability
  } = useNfcBar();
  const [adminSubTab, setAdminSubTab] = useState<'live' | 'tables' | 'staff' | 'chart' | 'cards' | 'rates' | 'settings'>('live');

  // Card inventory search & filter state
  const [cardSearch, setCardSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<'all' | 'available' | 'assigned' | 'lost' | 'damaged' | 'inactive'>('all');

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

  useEffect(() => {
    if (adminSubTab === 'cards') {
      fetchCards();
    } else if (adminSubTab === 'rates') {
      fetchRates();
    } else if (adminSubTab === 'chart') {
      fetchReports(reportFilter, startDateStr || undefined, endDateStr || undefined);
    }
  }, [adminSubTab, reportFilter, startDateStr, endDateStr]);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

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
  const activeCount = sessions.filter(s => s.status === TokenStatus.ACTIVE).length;
  const guestCount = sessions.filter(s => s.status === TokenStatus.ACTIVE).reduce((sum, s) => sum + s.persons, 0);
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

  return (
    <View className="flex-1 bg-themeBg p-4">
      {/* Screen Header */}
      <View className="mb-4">
        <View className="flex-row justify-between items-center">
          <Text className="text-[10px] font-bold text-red uppercase tracking-widest">ADMIN</Text>
          <Text className="text-muted text-[10px] font-bold uppercase tracking-wider">
            {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </View>
        <Text className="text-2xl font-bold text-themeText mt-1" style={{ color: '#f0ede6' }}>Dashboard</Text>
      </View>

      {/* KPI 2x2 grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginBottom: 16 }}>
        <View style={{ width: '50%', padding: 5 }}>
          <View style={{ backgroundColor: '#151821', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)', padding: 14, borderRadius: 16 }}>
            <View className="flex-row items-center gap-1.5 mb-2">
              <AppIcon name="credit-card" label="Revenue Logo" color="#f5a623" size={14} />
              <Text className="text-muted text-[10px] font-semibold uppercase tracking-wider">Revenue</Text>
            </View>
            <Text className="font-mono text-themeText text-xl font-extrabold" style={{ color: '#f0ede6' }}>₹{(totalCollections / 1000).toFixed(1)}K</Text>
            <Text className="text-[#22c55e] text-[9px] font-semibold mt-1">+12.4% today</Text>
          </View>
        </View>

        <View style={{ width: '50%', padding: 5 }}>
          <View style={{ backgroundColor: '#151821', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)', padding: 14, borderRadius: 16 }}>
            <View className="flex-row items-center gap-1.5 mb-2">
              <AppIcon name="users" label="Guests Logo" color="#4ecdc4" size={14} />
              <Text className="text-muted text-[10px] font-semibold uppercase tracking-wider">Guests</Text>
            </View>
            <Text className="font-mono text-themeText text-xl font-extrabold" style={{ color: '#f0ede6' }}>{guestCount}</Text>
            <Text className="text-[#22c55e] text-[9px] font-semibold mt-1">{activeCount} groups active</Text>
          </View>
        </View>

        <View style={{ width: '50%', padding: 5 }}>
          <View style={{ backgroundColor: '#151821', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)', padding: 14, borderRadius: 16 }}>
            <View className="flex-row items-center gap-1.5 mb-2">
              <AppIcon name="cup" label="Served Logo" color="#f5a623" size={14} />
              <Text className="text-muted text-[10px] font-semibold uppercase tracking-wider">Served</Text>
            </View>
            <Text className="font-mono text-themeText text-xl font-extrabold" style={{ color: '#f0ede6' }}>{totalDrinksRedeemed}</Text>
            <Text className="text-[#22c55e] text-[9px] font-semibold mt-1">coupons redeemed</Text>
          </View>
        </View>

        <View style={{ width: '50%', padding: 5 }}>
          <View style={{ backgroundColor: '#151821', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)', padding: 14, borderRadius: 16 }}>
            <View className="flex-row items-center gap-1.5 mb-2">
              <AppIcon name="chart" label="Peak Logo" color="#e63946" size={14} />
              <Text className="text-muted text-[10px] font-semibold uppercase tracking-wider">Peak Hour</Text>
            </View>
            <Text className="font-mono text-themeText text-xl font-extrabold" style={{ color: '#f0ede6' }}>10 PM</Text>
            <Text className="text-[#e63946] text-[9px] font-semibold mt-1">94.8K Busiest shift</Text>
          </View>
        </View>
      </View>

      {/* Segmented control for Switcher */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 16 }}>
        {[
          { tab: 'live', label: 'Tokens', icon: '📱' },
          { tab: 'tables', label: 'Tables', icon: '🪑' },
          { tab: 'cards', label: 'Cards', icon: '💳' },
          { tab: 'rates', label: 'Rates', icon: '💰' },
          { tab: 'staff', label: 'Staff', icon: '👥' },
          { tab: 'chart', label: 'Charts', icon: '📈' },
          { tab: 'settings', label: 'Settings', icon: '⚙️' },
        ].map((item) => {
          const isActive = adminSubTab === item.tab;
          return (
            <View key={item.tab} style={{ width: '33.33%', padding: 4 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: isActive ? 'rgba(245, 166, 35, 0.1)' : '#111318',
                  borderWidth: 1,
                  borderColor: isActive ? 'rgba(245, 166, 35, 0.35)' : 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onPress={() => setAdminSubTab(item.tab as any)}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 13, marginBottom: 2 }}>{item.icon}</Text>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: isActive ? '#f5a623' : '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* Dynamic Sub-Views */}
      {adminSubTab === 'live' && (
        <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <Text className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">Live tokens database</Text>
          {sessions.filter(s => s.status === TokenStatus.ACTIVE).map(session => {
            // Expiring check
            const diff = new Date(session.endTime).getTime() - new Date().getTime();
            const isExpiring = diff > 0 && diff < 15 * 60 * 1000; // less than 15 mins
            const isExpired = diff <= 0;

            return (
              <View 
                key={session.id} 
                className={`flex-row justify-between items-center bg-surface border border-white/5 rounded-xl p-3.5 mb-2
                  ${(isExpiring || isExpired) ? 'border-red/25 bg-red/5' : ''}
                `}
              >
                <View className="flex-1">
                  <Text className="text-themeText font-bold text-xs" style={{ color: '#f0ede6' }}>{session.customerName}</Text>
                  <Text className="text-muted text-[10px] mt-0.5">
                    Table {session.tableNumber} • Redeemed {session.redemptionCount}/{session.redemptionLimit} drinks
                  </Text>
                </View>
                <View className="items-end">
                  <Text className={`font-bold text-xs ${(isExpiring || isExpired) ? 'text-red' : 'text-gold'}`}>
                    {isExpired ? 'Expired' : `${Math.max(0, Math.floor(diff / (60 * 60 * 1000)))}h ${Math.max(0, Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000)))}m left`}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Quick Management shortcuts */}
          <Text className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3 mt-4">Operational Registries</Text>
          <View className="bg-surface border border-white/5 rounded-xl p-2.5 mb-4">
            <TouchableOpacity 
              className="flex-row justify-between items-center py-2.5 border-b border-white/5 bg-transparent"
              onPress={() => setAdminSubTab('rates')}
            >
              <Text className="text-themeText font-semibold text-xs" style={{ color: '#f0ede6' }}>Rate Card Management</Text>
              <Text className="bg-themeInput text-gold font-mono text-[9px] font-bold px-2 py-0.5 rounded-md border border-white/5">{rates.length} Zones</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className="flex-row justify-between items-center py-2.5 border-b border-white/5"
              onPress={() => setAdminSubTab('cards')}
            >
              <Text className="text-themeText font-semibold text-xs" style={{ color: '#f0ede6' }}>Smart Card Inventory</Text>
              <Text className="bg-themeInput text-gold font-mono text-[9px] font-bold px-2 py-0.5 rounded-md border border-white/5">{cards.length} Cards</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className="flex-row justify-between items-center py-2.5"
              onPress={() => setAdminSubTab('staff')}
            >
              <Text className="text-themeText font-semibold text-xs" style={{ color: '#f0ede6' }}>Staff User Management</Text>
              <Text className="bg-themeInput text-gold font-mono text-[9px] font-bold px-2 py-0.5 rounded-md border border-white/5">{users.length} Accounts</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Cards Manager Sub-Tab */}
      {adminSubTab === 'cards' && (
        <View className="flex-1">
          {/* Card KPIs */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
            {[
              { label: 'Total', count: cards.length, color: '#f0ede6' },
              { label: 'Available', count: cards.filter(c => c.status.toLowerCase() === 'available').length, color: '#22c55e' },
              { label: 'Assigned', count: cards.filter(c => c.status.toLowerCase() === 'assigned').length, color: '#f5a623' },
              { label: 'Lost', count: cards.filter(c => c.status.toLowerCase() === 'lost').length, color: '#e63946' },
              { label: 'Damaged', count: cards.filter(c => c.status.toLowerCase() === 'damaged').length, color: '#9ca3af' },
              { label: 'Inactive', count: cards.filter(c => c.status.toLowerCase() === 'inactive').length, color: '#a78bfa' },
            ].map((stat) => (
              <View key={stat.label} style={{ width: '33.33%', padding: 4 }}>
                <View style={{
                  backgroundColor: '#151821',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.05)',
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: 'center'
                }}>
                  <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">{stat.label}</Text>
                  <Text className="font-mono text-sm font-extrabold mt-0.5" style={{ color: stat.color }}>{stat.count}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Search bar & Filter */}
          <View className="flex-row gap-2 mb-3 items-center">
            <View className="flex-1 flex-row bg-themeInput border border-white/5 rounded-xl px-3 py-1.5 items-center">
              <AppIcon name="search" label="Search cards" size={12} color="#7a7d8a" />
              <TextInput
                className="flex-1 ml-1.5 text-themeText text-xs p-0"
                style={{ color: '#f0ede6' }}
                placeholder="Search by UID..."
                placeholderTextColor="#9ca3af"
                value={cardSearch}
                onChangeText={setCardSearch}
                autoCapitalize="characters"
              />
              {cardSearch ? (
                <TouchableOpacity onPress={() => setCardSearch('')}>
                  <AppIcon name="x" label="Clear search" size={12} color="#7a7d8a" />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity 
              className="bg-themeInput border border-white/5 px-2.5 py-2 rounded-xl"
              onPress={() => fetchCards()}
            >
              <AppIcon name="refresh" label="Refresh" size={12} color="#f5a623" />
            </TouchableOpacity>
          </View>

          {/* Horizontal Filters */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            className="flex-row mb-3"
            contentContainerStyle={{ gap: 6, paddingRight: 10 }}
          >
            {(['all', 'available', 'assigned', 'lost', 'damaged', 'inactive'] as const).map(filter => {
              const isActive = cardFilter === filter;
              let labelColor = isActive ? 'text-gold' : 'text-muted';
              let borderColor = isActive ? 'border-gold bg-gold/5' : 'border-white/5 bg-themeInput';

              return (
                <TouchableOpacity
                  key={filter}
                  className={`px-3 py-1.5 rounded-lg border ${borderColor}`}
                  onPress={() => setCardFilter(filter)}
                >
                  <Text className={`text-[10px] font-bold capitalize ${labelColor}`}>
                    {filter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
            {cards.filter(card => {
              const matchesSearch = card.cardUid.toLowerCase().includes(cardSearch.toLowerCase());
              const matchesFilter = cardFilter === 'all' || card.status.toLowerCase() === cardFilter.toLowerCase();
              return matchesSearch && matchesFilter;
            }).length === 0 ? (
              <View className="bg-surface border border-white/5 rounded-xl p-8 items-center justify-center">
                <Text className="text-muted text-xs">No cards found matching current criteria</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
                {cards.filter(card => {
                  const matchesSearch = card.cardUid.toLowerCase().includes(cardSearch.toLowerCase());
                  const matchesFilter = cardFilter === 'all' || card.status.toLowerCase() === cardFilter.toLowerCase();
                  return matchesSearch && matchesFilter;
                }).map(card => {
                  const statusLower = card.status.toLowerCase();
                  let statusBadgeColor = 'text-gold border-gold/20 bg-gold/5';
                  if (statusLower === 'available') statusBadgeColor = 'text-[#22c55e] border-[#22c55e]/20 bg-[#22c55e]/5';
                  else if (statusLower === 'lost') statusBadgeColor = 'text-red border-red/20 bg-red/5';
                  else if (statusLower === 'damaged') statusBadgeColor = 'text-[#9ca3af] border-white/10 bg-white/5';
                  else if (statusLower === 'inactive') statusBadgeColor = 'text-[#a78bfa] border-[#a78bfa]/20 bg-[#a78bfa]/5';

                  // Rules-based locking
                  const isAssigned = statusLower === 'assigned';
                  const isLost = statusLower === 'lost';
                  const isDamaged = statusLower === 'damaged';
                  const isInactive = statusLower === 'inactive';
                  const isAvailable = statusLower === 'available';

                  return (
                    <View key={card.id} style={{ width: '50%', padding: 5 }}>
                      <View 
                        style={{
                          backgroundColor: '#151821',
                          borderWidth: 1,
                          borderColor: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: 16,
                          padding: 12,
                          minHeight: 144,
                          justifyContent: 'space-between'
                        }}
                      >
                        {/* Header: Chip / Icon + Status Badge */}
                        <View className="flex-row justify-between items-start mb-1.5">
                          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 11 }}>💳</Text>
                          </View>
                          <View className={`px-2 py-0.5 rounded border ${statusBadgeColor}`}>
                            <Text style={{ fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' }}>{card.status}</Text>
                          </View>
                        </View>

                        {/* Middle: Card UID & Info */}
                        <View className="mb-2">
                          <View className="flex-row items-center gap-1 flex-wrap">
                            <Text className="text-themeText font-mono font-bold text-[11px]" style={{ color: '#f0ede6' }} numberOfLines={1} ellipsizeMode="middle">
                              {card.cardUid}
                            </Text>
                            {card.writeCycles > 50 && (
                              <View className="bg-red/10 border border-red/20 px-1 rounded">
                                <Text className="text-red text-[6px] font-extrabold uppercase">Wear</Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-muted text-[8px] mt-1">
                            Writes: {card.writeCycles}
                            {card.lastWrittenAt ? `\nLast: ${new Date(card.lastWrittenAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : ''}
                          </Text>
                        </View>

                        {/* Actions Row */}
                        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.05)', paddingTop: 8, marginTop: 4 }}>
                          <View className="flex-row flex-wrap gap-1">
                            {isAvailable && (
                              <>
                                <TouchableOpacity
                                  style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: '#1a1d26', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}
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
                                  style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}
                                  onPress={() => updateCardStatus(card.cardUid, 'damaged')}
                                >
                                  <Text className="text-[#9ca3af] text-[8px] font-bold">Dmg</Text>
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
                              <Text className="text-muted text-[8px] italic py-0.5">Card locked</Text>
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* Rates Manager Sub-Tab */}
      {adminSubTab === 'rates' && (
        <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-[11px] font-bold text-muted uppercase tracking-wider">Rate Card Management</Text>
            <TouchableOpacity 
              className="bg-themeInput border border-white/5 px-2.5 py-1.5 rounded-lg"
              onPress={() => fetchRates()}
            >
              <AppIcon name="refresh" label="Refresh" size={10} color="#f5a623" />
            </TouchableOpacity>
          </View>

          {rates.map(rate => (
            <View key={rate.id || rate.placeType} className="bg-surface border border-white/5 rounded-xl p-3.5 mb-2.5">
              <View className="flex-row justify-between items-center mb-2">
                <View>
                  <Text className="text-themeText font-bold text-sm" style={{ color: '#f0ede6' }}>
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
              <View className="flex-row justify-between items-center mt-2 border-t border-white/5 pt-2">
                <View className="flex-row gap-4">
                  <View>
                    <Text className="text-muted text-[8px] uppercase tracking-wider font-bold">Duration</Text>
                    <Text className="text-themeText text-xs font-bold mt-0.5" style={{ color: '#f0ede6' }}>{rate.durationHours} Hours</Text>
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
                  <Text className="text-[10px] font-extrabold" style={{ color: '#08090d' }}>Edit Rate</Text>
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
              <View key={table.id} className="bg-surface border border-white/5 rounded-xl p-3.5 mb-2.5">
                <View className="flex-row justify-between items-center mb-2">
                  <View>
                    <Text className="text-themeText font-mono font-bold text-sm" style={{ color: '#f0ede6' }}>Table {table.number}</Text>
                    <Text className="text-muted text-[10px] uppercase font-bold mt-0.5">
                      {table.placeType === 'PREMIUM_LOUNGE' ? 'Premium Lounge' : 'Standing Bar'} • Capacity: {table.seats} Pax
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className={`font-extrabold text-[10px] uppercase ${statusColor}`}>{isOccupied ? 'occupied' : table.status}</Text>
                  </View>
                </View>

                {/* Status Toggles & Actions */}
                <View className="flex-row justify-between items-center mt-2 border-t border-white/5 pt-2">
                  <View className="flex-row gap-1.5">
                    {!isOccupied ? (
                      <>
                        <TouchableOpacity
                          className={`px-2 py-1 rounded border ${table.status === TableStatus.AVAILABLE ? 'border-[#22c55e] bg-[#22c55e]/5' : 'border-white/5'}`}
                          onPress={() => updateTableStatus(table.id, 'available')}
                        >
                          <Text style={{ fontSize: 9, fontWeight: 'bold', color: table.status === TableStatus.AVAILABLE ? '#22c55e' : '#9ca3af' }}>Available</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          className={`px-2 py-1 rounded border ${table.status === TableStatus.RESERVED ? 'border-[#3b82f6] bg-[#3b82f6]/5' : 'border-white/5'}`}
                          onPress={() => updateTableStatus(table.id, 'reserved')}
                        >
                          <Text style={{ fontSize: 9, fontWeight: 'bold', color: table.status === TableStatus.RESERVED ? '#3b82f6' : '#9ca3af' }}>Reserve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          className={`px-2 py-1 rounded border ${table.status === TableStatus.MAINTENANCE ? 'border-muted bg-[#7a7d8a]/5' : 'border-white/5'}`}
                          onPress={() => updateTableStatus(table.id, 'maintenance')}
                        >
                          <Text style={{ fontSize: 9, fontWeight: 'bold', color: table.status === TableStatus.MAINTENANCE ? '#e63946' : '#9ca3af' }}>Maint</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text className="text-muted text-[9px] font-semibold italic">Locked (Occupied)</Text>
                    )}
                  </View>

                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      className={`px-2.5 py-1 rounded bg-[#111318] border border-white/5 ${isOccupied ? 'opacity-50' : ''}`}
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
                      <Text className="text-themeText text-[9px] font-bold" style={{ color: '#f0ede6' }}>Edit</Text>
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
            <View className="flex-row bg-[#111318] rounded-xl p-1 border border-[#262629] gap-1 flex-wrap">
              {(['day', 'week', 'month', 'custom'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  className={`flex-1 min-w-[20%] py-2 items-center rounded-lg ${reportFilter === f ? 'bg-[#1a1d26] border-[0.5px] border-gold/20' : ''}`}
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
            <View className="bg-surface border border-white/5 rounded-xl p-3 mb-4">
              <Text className="text-gold text-[10px] font-bold uppercase tracking-wider mb-2">Custom Date Range (YYYY-MM-DD)</Text>
              <View className="flex-row gap-2 mb-2">
                <TextInput
                  className="flex-1 bg-themeInput text-themeText text-xs px-3 py-2 border border-white/5 rounded-lg"
                  style={{ color: '#f0ede6' }}
                  placeholder="Start: 2026-06-01"
                  placeholderTextColor="#9ca3af"
                  value={customStart}
                  onChangeText={setCustomStart}
                />
                <TextInput
                  className="flex-1 bg-themeInput text-themeText text-xs px-3 py-2 border border-white/5 rounded-lg"
                  style={{ color: '#f0ede6' }}
                  placeholder="End: 2026-06-20"
                  placeholderTextColor="#9ca3af"
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
              <View style={{ backgroundColor: '#151821', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)', padding: 10, borderRadius: 12, alignItems: 'center' }}>
                <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">Revenue</Text>
                <Text className="font-mono text-gold text-xs font-bold mt-1">₹{(salesSummary?.todaySales || 0).toLocaleString()}</Text>
              </View>
            </View>

            {/* Turnover */}
            <View style={{ width: '33.33%', padding: 4 }}>
              <View style={{ backgroundColor: '#151821', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)', padding: 10, borderRadius: 12, alignItems: 'center' }}>
                <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">Turnover</Text>
                <Text className="font-mono text-themeText text-xs font-bold mt-1" style={{ color: '#f0ede6' }}>{salesSummary?.checkoutCount || 0} groups</Text>
              </View>
            </View>

            {/* Avg Stay */}
            <View style={{ width: '33.33%', padding: 4 }}>
              <View style={{ backgroundColor: '#151821', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)', padding: 10, borderRadius: 12, alignItems: 'center' }}>
                <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">Avg Stay</Text>
                <Text className="font-mono text-themeText text-xs font-bold mt-1" style={{ color: '#f0ede6' }}>
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
              <View style={{ backgroundColor: '#151821', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)', padding: 10, borderRadius: 12, alignItems: 'center' }}>
                <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">Occupancy Rate</Text>
                <Text className="font-mono text-themeText text-xs font-bold mt-1" style={{ color: '#f0ede6' }}>
                  {Math.round((tableUtilization?.summary?.averageOccupancyRate || 0) * 100)}%
                </Text>
              </View>
            </View>

            {/* Redemptions */}
            <View style={{ width: '33.33%', padding: 4 }}>
              <View style={{ backgroundColor: '#151821', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)', padding: 10, borderRadius: 12, alignItems: 'center' }}>
                <Text className="text-muted text-[8px] font-bold uppercase tracking-wider">Redemptions</Text>
                <Text className="font-mono text-[#22c55e] text-xs font-bold mt-1">{salesSummary?.todayRedemptions || 0} drinks</Text>
              </View>
            </View>

            {/* Peak hour */}
            <View style={{ width: '33.33%', padding: 4 }}>
              <View style={{ backgroundColor: '#151821', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)', padding: 10, borderRadius: 12, alignItems: 'center' }}>
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
          <View className="bg-surface border border-white/5 rounded-2xl p-4 mb-4">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-3">
              <View className="flex-row items-end h-40 pb-3 border-b border-[#6b7280]" style={{ gap: 8, paddingHorizontal: 5 }}>
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
            <View className="bg-themeInput border border-white/5 rounded-xl p-3">
              {(() => {
                const pkH = hourlyBreakdown?.peakHour;
                const pkR = hourlyBreakdown?.peakRedemptions || 0;
                const pkHStr = pkH !== undefined ? (pkH === 0 ? '12:00 AM' : (pkH < 12 ? `${pkH}:00 AM` : (pkH === 12 ? '12:00 PM' : `${pkH - 12}:00 PM`))) : 'N/A';
                const pkData = (hourlyBreakdown?.hourlyData || []).find((h: any) => h.hour === pkH);
                
                return (
                  <>
                    <Text className="text-gold text-xs font-bold mb-1">{pkHStr} ({pkR > 0 ? 'Busiest Peak Hour' : 'Standard Hour'})</Text>
                    <Text className="text-themeText text-[11px] font-semibold mb-0.5" style={{ color: '#f0ede6' }}>
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
          <View className="bg-surface border border-white/5 rounded-xl p-3.5">
            {(!tableUtilization || !tableUtilization.tables || tableUtilization.tables.length === 0) ? (
              <Text className="text-muted text-xs text-center py-4">No table utilization data found</Text>
            ) : (
              <View style={{ gap: 8 }}>
                <View className="flex-row border-b border-white/10 pb-1.5">
                  <Text className="flex-1 text-[8px] uppercase tracking-wider font-bold text-muted">Table</Text>
                  <Text className="flex-1.5 text-[8px] uppercase tracking-wider font-bold text-muted">Zone</Text>
                  <Text className="flex-1.5 text-[8px] uppercase tracking-wider font-bold text-muted text-right">Occ Hrs/Day</Text>
                  <Text className="flex-1 text-[8px] uppercase tracking-wider font-bold text-muted text-right">Turnover</Text>
                  <Text className="flex-1 text-[8px] uppercase tracking-wider font-bold text-muted text-right">Avg Stay</Text>
                </View>
                {tableUtilization.tables.map((t: any) => (
                  <View key={t.tableNumber} className="flex-row items-center border-b border-white/5 py-1">
                    <Text className="flex-1 text-themeText font-mono text-xs font-bold" style={{ color: '#f0ede6' }}>{t.tableNumber}</Text>
                    <Text className="flex-1.5 text-muted text-[10px] truncate">{t.placeType === 'STANDING_BAR' ? 'Standing Bar' : (t.placeType === 'PREMIUM_LOUNGE' ? 'Premium Lounge' : t.placeType)}</Text>
                    <Text className="flex-1.5 text-themeText text-xs font-semibold text-right" style={{ color: '#f0ede6' }}>{t.averageOccupancyPerDay}h</Text>
                    <Text className="flex-1 text-[#4ecdc4] text-xs font-bold text-right">{t.turnoverCount}</Text>
                    <Text className="flex-1 text-themeText text-xs font-semibold text-right" style={{ color: '#f0ede6' }}>{Math.round(t.averageSessionDurationMinutes)}m</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Add Table Modal */}
      <Modal visible={isAddModalOpen} transparent animationType="slide">
        <View className="flex-1 justify-center bg-black/60 p-4">
          <View className="bg-surface border border-gold/20 rounded-2xl p-5 shadow-2xl">
            <Text className="text-base font-bold text-gold mb-4">Add Seating Table</Text>
            
            <View className="mb-4">
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Table Number (e.g. S-13, L-11)</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                  ${newTableNumber.trim().length > 0 ? (isNewTableNumberValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder="S-13"
                placeholderTextColor="#9ca3af"
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
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Place Type</Text>
              <View className="flex-row gap-2">
                <TouchableOpacity 
                  className={`flex-1 py-2.5 items-center rounded-xl border ${newPlaceType === 'STANDING_BAR' ? 'border-gold bg-gold/5' : 'border-white/5 bg-themeInput'}`}
                  onPress={() => setNewPlaceType('STANDING_BAR')}
                >
                  <Text className={`text-xs font-bold ${newPlaceType === 'STANDING_BAR' ? 'text-gold' : 'text-muted'}`}>Standing Bar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  className={`flex-1 py-2.5 items-center rounded-xl border ${newPlaceType === 'PREMIUM_LOUNGE' ? 'border-gold bg-gold/5' : 'border-white/5 bg-themeInput'}`}
                  onPress={() => setNewPlaceType('PREMIUM_LOUNGE')}
                >
                  <Text className={`text-xs font-bold ${newPlaceType === 'PREMIUM_LOUNGE' ? 'text-gold' : 'text-muted'}`}>Premium Lounge</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View className="mb-6">
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Capacity (Pax)</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                  ${newCapacity.trim().length > 0 ? (isNewCapacityValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder="2"
                placeholderTextColor="#9ca3af"
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
                <Text className="text-xs font-bold" style={{ color: '#9ca3af' }}>Cancel</Text>
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
                <Text className="text-xs font-extrabold" style={{ color: '#08090d' }}>Save Table</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Table Modal */}
      <Modal visible={isEditModalOpen} transparent animationType="slide">
        <View className="flex-1 justify-center bg-black/60 p-4">
          <View className="bg-surface border border-gold/20 rounded-2xl p-5 shadow-2xl">
            <Text className="text-base font-bold text-gold mb-4">Edit Table {selectedTable?.number}</Text>

            <View className="mb-6">
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Capacity (Pax)</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                  ${editCapacity.trim().length > 0 ? (isEditCapacityValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder="2"
                placeholderTextColor="#9ca3af"
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
                <Text className="text-xs font-bold" style={{ color: '#9ca3af' }}>Cancel</Text>
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
                <Text className="text-xs font-extrabold" style={{ color: '#08090d' }}>Save Changes</Text>
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
              <View key={staff.id} className="bg-surface border border-white/5 rounded-xl p-3.5 mb-2.5">
                <View className="flex-row justify-between items-center mb-2">
                  <View className="flex-1 mr-2">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-themeText font-bold text-sm" style={{ color: '#f0ede6' }}>{staff.fullName}</Text>
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
                <View className="flex-row justify-between items-center mt-2 border-t border-white/5 pt-2">
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
                    className="px-2.5 py-1 rounded bg-[#111318] border border-white/5"
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
                    <Text className="text-themeText text-[9px] font-bold" style={{ color: '#f0ede6' }}>Edit Profile</Text>
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
          
          <View className="bg-surface border border-white/5 rounded-2xl p-5 mb-6">
            <View className="flex-row items-center mb-3">
              <Text className="text-gold text-lg mr-2">⚙️</Text>
              <Text className="text-themeText text-sm font-bold" style={{ color: '#f0ede6' }}>Token Delivery Methods</Text>
            </View>
            <Text className="text-muted text-xs leading-5 mb-5" style={{ color: '#9ca3af' }}>
              Configure which customer delivery methods are active in the system. Receptionists select the delivery method for each new customer session during registration.
            </Text>

            {/* NFC Card Toggle */}
            <View className="flex-row justify-between items-center py-4 border-b border-white/5">
              <View style={{ flex: 1, paddingRight: 16 }}>
                <Text className="text-themeText text-xs font-bold" style={{ color: '#f0ede6' }}>NFC Card Registration</Text>
                <Text className="text-muted text-[10px] mt-1" style={{ color: '#9ca3af' }}>
                  Allow receptionists to allocate and write tokens to physical NFC smart cards.
                </Text>
              </View>
              <TouchableOpacity
                className={`px-4 py-2 rounded-xl border ${localNfcEnabled ? 'border-[#22c55e] bg-[#22c55e]/10' : 'border-white/10 bg-themeInput'}`}
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
                <Text className="text-themeText text-xs font-bold" style={{ color: '#f0ede6' }}>Email QR Code Delivery</Text>
                <Text className="text-muted text-[10px] mt-1" style={{ color: '#9ca3af' }}>
                  Allow sessions to run cardless and email token barcodes/QRs to customer phones.
                </Text>
              </View>
              <TouchableOpacity
                className={`px-4 py-2 rounded-xl border ${localEmailQrEnabled ? 'border-[#22c55e] bg-[#22c55e]/10' : 'border-white/10 bg-themeInput'}`}
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
            <Text className="font-extrabold text-sm text-[#08090d]">
              {isSavingSettings ? 'Saving Settings...' : 'Save Configurations'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Add Staff Modal */}
      <Modal visible={isAddStaffOpen} transparent animationType="slide">
        <View className="flex-1 justify-center bg-black/60 p-4">
          <View className="bg-surface border border-gold/20 rounded-2xl p-5 shadow-2xl">
            <Text className="text-base font-bold text-gold mb-4">Add Staff Account</Text>
            
            <View className="mb-4">
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Full Name *</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                  ${newStaffFullName.trim().length > 0 ? (isNewStaffFullNameValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder="e.g. John Doe"
                placeholderTextColor="#9ca3af"
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
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Role</Text>
              <View className="flex-row flex-wrap gap-2">
                {(['receptionist', 'bartender', 'manager', 'admin'] as const).map(r => (
                  <TouchableOpacity 
                    key={r}
                    className={`flex-grow py-2 px-3 items-center rounded-xl border ${newStaffRole === r ? 'border-gold bg-gold/5' : 'border-white/5 bg-themeInput'}`}
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
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Username (Format: {expectedNewStaffPrefix}-XX)</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm font-mono
                  ${newStaffUsername.trim().length > 0 ? (isNewStaffUsernameValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder={`${expectedNewStaffPrefix}-05`}
                placeholderTextColor="#9ca3af"
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
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>PIN (4 Digits) *</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm font-mono
                  ${newStaffPassword.trim().length > 0 ? (isNewStaffPasswordValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder="1234"
                placeholderTextColor="#9ca3af"
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
                      className={`w-2.5 h-2.5 rounded-full border ${newStaffPassword.length > i ? 'bg-gold border-gold' : 'border-white/10 bg-themeInput'}`} 
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
                <Text className="text-xs font-bold" style={{ color: '#9ca3af' }}>Cancel</Text>
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
                <Text className="text-xs font-extrabold" style={{ color: '#08090d' }}>Save Staff</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Staff Modal */}
      <Modal visible={isEditStaffOpen} transparent animationType="slide">
        <View className="flex-1 justify-center bg-black/60 p-4">
          <View className="bg-surface border border-gold/20 rounded-2xl p-5 shadow-2xl">
            <Text className="text-base font-bold text-gold mb-4">Edit Staff Profile</Text>
            
            <View className="mb-4">
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Full Name *</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                  ${editStaffFullName.trim().length > 0 ? (isEditStaffFullNameValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder="e.g. John Doe"
                placeholderTextColor="#9ca3af"
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
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Role</Text>
              <View className="flex-row flex-wrap gap-2">
                {(['receptionist', 'bartender', 'manager', 'admin'] as const).map(r => (
                  <TouchableOpacity 
                    key={r}
                    className={`flex-grow py-2 px-3 items-center rounded-xl border ${editStaffRole === r ? 'border-gold bg-gold/5' : 'border-white/5 bg-themeInput'}`}
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
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Username (Format: {expectedEditStaffPrefix}-XX)</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm font-mono
                  ${editStaffUsername.trim().length > 0 ? (isEditStaffUsernameValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder={`${expectedEditStaffPrefix}-05`}
                placeholderTextColor="#9ca3af"
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
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>New PIN / Password (Leave blank to keep current)</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm font-mono
                  ${editStaffPassword.trim().length > 0 ? (isEditStaffPasswordValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder="New 4-Digit PIN"
                placeholderTextColor="#9ca3af"
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
                      className={`w-2.5 h-2.5 rounded-full border ${editStaffPassword.length > i ? 'bg-gold border-gold' : 'border-white/10 bg-themeInput'}`} 
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
              <Text className="text-themeText text-xs font-semibold" style={{ color: '#f0ede6' }}>Account Active Status</Text>
              {loggedUser?.id === selectedStaff?.id ? (
                <Text className="text-muted text-[10px] italic">Locked (Logged-in User)</Text>
              ) : (
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className={`px-3 py-1.5 rounded-lg border ${editStaffIsActive ? 'border-[#22c55e] bg-[#22c55e]/5' : 'border-white/5 bg-themeInput'}`}
                    onPress={() => setEditStaffIsActive(true)}
                  >
                    <Text className={`text-[10px] font-bold ${editStaffIsActive ? 'text-[#22c55e]' : 'text-muted'}`}>Active</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`px-3 py-1.5 rounded-lg border ${!editStaffIsActive ? 'border-red bg-red/5' : 'border-white/5 bg-themeInput'}`}
                    onPress={() => setEditStaffIsActive(false)}
                  >
                    <Text className={`text-[10px] font-bold ${!editStaffIsActive ? 'text-red' : 'text-muted'}`}>Deactivated</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View className="flex-row justify-end gap-2.5">
              <TouchableOpacity className="py-2.5 px-4 rounded-xl bg-themeInput" onPress={() => setIsEditStaffOpen(false)}>
                <Text className="text-xs font-bold" style={{ color: '#9ca3af' }}>Cancel</Text>
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
                <Text className="text-xs font-extrabold" style={{ color: '#08090d' }}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Rate Modal */}
      <Modal visible={isEditRateOpen} transparent animationType="slide">
        <View className="flex-1 justify-center bg-black/60 p-4">
          <View className="bg-surface border border-gold/20 rounded-2xl p-5 shadow-2xl">
            <Text className="text-base font-bold text-gold mb-4">Edit Rate Configuration</Text>
            
            <View className="mb-4">
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Place Type / Zone Name</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                  ${editRateName.trim().length > 0 ? (isEditRateNameValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder="e.g. VIP Lounge"
                placeholderTextColor="#9ca3af"
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
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Base Price (₹ per Guest)</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                  ${editRatePrice.trim().length > 0 ? (isEditRatePriceValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder="500"
                placeholderTextColor="#9ca3af"
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
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Duration (Hours)</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                  ${editRateDuration.trim().length > 0 ? (isEditRateDurationValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder="2"
                placeholderTextColor="#9ca3af"
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
              <Text className="text-themeText text-xs font-semibold mb-1.5" style={{ color: '#f0ede6' }}>Drinks Allowance (Per Guest)</Text>
              <TextInput
                className={`bg-themeInput text-themeText border rounded-xl py-2.5 px-4 text-sm
                  ${editRateAllowance.trim().length > 0 ? (isEditRateAllowanceValid ? 'border-teal/30' : 'border-red/45') : 'border-white/5'}`}
                style={{ color: '#f0ede6' }}
                placeholder="2"
                placeholderTextColor="#9ca3af"
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
                <Text className="text-xs font-bold" style={{ color: '#9ca3af' }}>Cancel</Text>
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
                <Text className="text-xs font-extrabold" style={{ color: '#08090d' }}>Save Rates</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({});
