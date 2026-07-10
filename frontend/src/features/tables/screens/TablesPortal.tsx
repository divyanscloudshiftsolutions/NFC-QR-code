import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, TextInput, ScrollView, 
  Platform, Modal, ActivityIndicator, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNfcBar } from '../../../context/NfcBarContext';
import { useTheme } from '../../../context/ThemeContext';
import { Table, SessionToken, PlaceType, TableStatus, TokenStatus, UserRole } from '../../../types/nfc_bar';
import { isTableExpiring } from '../../../context/nfc_bar_utils';
import { AppIcon } from '../../../components/common/AppIcon';
import { useResponsive } from '../../../utils/responsive';
import { AlertModal } from '../../../components/common/AlertModal';
import { useActionProgress } from '../../../utils/actionProgress';

export const TablesPortal: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
  const { tables, sessions, extendSessionTime, closeGuestSession, user, setOverlayActive, setPreselectedTableNumber, setTab, rates } = useNfcBar();
  const { loadingAction, secondsLeft, startAction, stopAction, isProcessing } = useActionProgress();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedPlace, setSelectedPlace] = useState<PlaceType>('STANDING_BAR');
  
  const { getTableColumns } = useResponsive();
  const cols = getTableColumns();
  const itemWidth = `${(100 / cols) - 0.1}%` as any;
  const [filter, setFilter] = useState<'all' | 'available' | 'occupied' | 'expiring'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionToken | null>(null);

  // Extend session modal states
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [extendPaymentMode, setExtendPaymentMode] = useState<'CASH' | 'UPI'>('CASH');
  const [extendRefId, setExtendRefId] = useState('');
  const [isExtendingLoading, setIsExtendingLoading] = useState(false);

  useEffect(() => {
    setOverlayActive(isActive && isBottomSheetOpen);
    return () => setOverlayActive(false);
  }, [isBottomSheetOpen, isActive, setOverlayActive]);

  // Automatically sync local selectedSession state with global sessions context updates
  useEffect(() => {
    if (selectedTable) {
      const activeToken = sessions.find(s => s.tableNumber === selectedTable.number && s.status !== TokenStatus.CLOSED);
      setSelectedSession(activeToken || null);
    } else {
      setSelectedSession(null);
    }
  }, [sessions, selectedTable]);

  const [timeTick, setTimeTick] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      setTimeTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  // Stats
  const placeTables = tables.filter(t => t.placeType === selectedPlace);
  const totalCount = placeTables.length;
  const occupiedCount = placeTables.filter(t => t.status === TableStatus.OCCUPIED).length;
  const freeCount = placeTables.filter(t => t.status === TableStatus.AVAILABLE).length;

  const handleTableTap = (table: Table) => {
    setSelectedTable(table);
    const activeToken = sessions.find(s => s.tableNumber === table.number && s.status !== TokenStatus.CLOSED);
    if (activeToken) {
      setSelectedSession(activeToken);
    } else {
      setSelectedSession(null);
    }
    setIsBottomSheetOpen(true);
  };

  const handleExtend = async () => {
    if (!selectedSession) return;
    if (!startAction('extend_session')) return;
    
    // Calculate extension amount
    const rateCard = rates.find(r => r.placeType === selectedSession.placeType);
    const rate = rateCard ? rateCard.ratePerPerson : (selectedSession.placeType === 'PREMIUM_LOUNGE' ? 1200 : 500);
    const duration = rateCard?.durationHours || 2;
    const amount = rate * selectedSession.persons * (1 / duration);

    setIsExtendingLoading(true);
    try {
      const success = await extendSessionTime(selectedSession.tokenNumber, 1, amount);
      stopAction();
      setIsExtendingLoading(false);
      if (success) {
        const updated = sessions.find(s => s.tokenNumber === selectedSession.tokenNumber);
        if (updated) setSelectedSession(updated);
        setIsExtendModalOpen(false);
        setIsBottomSheetOpen(false);
        setExtendRefId('');
        setExtendPaymentMode('CASH');
      }
    } catch (e) {
      stopAction();
      setIsExtendingLoading(false);
    }
  };

  const handleCloseSession = async () => {
    if (!selectedSession) return;
    if (!startAction('close_session')) return;
    try {
      const success = await closeGuestSession(selectedSession.tokenNumber);
      stopAction();
      if (success) {
        setIsBottomSheetOpen(false);
      }
    } catch (e) {
      stopAction();
    }
  };

  const renderTableLayout = (table: Table, activeToken: SessionToken | null) => {
    const capacity = table.seats;
    const persons = activeToken && table.status === TableStatus.OCCUPIED ? activeToken.persons : 0;
    
    // Distribute seats: top row = half, bottom row = other half
    const topCount = Math.ceil(capacity / 2);
    const bottomCount = Math.floor(capacity / 2);

    // Seats are filled left-to-right, top row first
    const filledTop = Math.min(persons, topCount);
    const filledBottom = Math.max(0, persons - topCount);

    const isExpiring = isTableExpiring(table.number, sessions);
    const isOccupied = table.status === TableStatus.OCCUPIED;

    // Determine colors/classes based on status
    let primaryColor = colors.gold; // Gold default
    let labelText = 'Occupied';
    let filledBg = isDark ? 'rgba(245, 166, 35, 0.12)' : '#FEF3C7';
    
    if (table.status === TableStatus.MAINTENANCE) {
      primaryColor = colors.muted; // Muted gray
      filledBg = isDark ? 'rgba(122, 125, 138, 0.12)' : '#F4F4F5';
      labelText = 'Maintenance';
    } else if (table.status === TableStatus.RESERVED) {
      primaryColor = isDark ? '#60A5FA' : '#2563EB'; // Blue
      filledBg = isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF';
      labelText = 'Reserved';
    } else if (isExpiring) {
      primaryColor = colors.red; // Red
      filledBg = isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2';
      labelText = 'Expiring';
    } else if (table.status === TableStatus.AVAILABLE) {
      primaryColor = colors.success; // Green
      filledBg = isDark ? 'rgba(34, 197, 94, 0.12)' : '#F0FDF4';
      labelText = 'Free';
    }

    const Seat = ({ filled, side, placeholder = false }: { filled: boolean; side: 'top' | 'bottom'; placeholder?: boolean }) => {
      if (placeholder) {
        return (
          <View style={{ width: 36, height: 52 }} />
        );
      }

      const chairColor = filled ? primaryColor : colors.muted;

      return (
        <View className="items-center" style={{ flexDirection: 'column', gap: 4 }}>
          {side === 'top' && (
            <View
              style={{ width: 4, height: 12, borderRadius: 2, backgroundColor: chairColor }}
            />
          )}
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: filled ? primaryColor : colors.border,
              backgroundColor: filled ? filledBg : colors.secondarySurface
            }}
          >
            <Text style={{ color: filled ? primaryColor : colors.muted, fontSize: 13, fontWeight: 'bold' }}>
              👤
            </Text>
          </View>
          {side === 'bottom' && (
            <View
              style={{ width: 4, height: 12, borderRadius: 2, backgroundColor: chairColor }}
            />
          )}
        </View>
      );
    };

    return (
      <View 
        className="items-center py-4 rounded-2xl mb-4 border"
        style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5 }}
      >
        <Text className="text-[10px] uppercase font-bold tracking-wider mb-4" style={{ color: colors.muted, fontFamily: Platform.OS !== 'web' ? 'System' : 'monospace' }}>
          TABLE SEATING MAP ({labelText})
        </Text>

        <View className="flex-col items-center" style={{ gap: 8 }}>
          {/* Top seats */}
          <View className="flex-row justify-center" style={{ gap: 12 }}>
            {Array.from({ length: topCount }).map((_, i) => (
              <Seat key={`t${i}`} filled={i < filledTop} side="top" />
            ))}
          </View>

          {/* Table surface */}
          <View
            className="flex-row items-center justify-center rounded-2xl px-6 py-4 border"
            style={{
              minWidth: Math.max(120, topCount * 48),
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1.5
            }}
          >
            <View className="items-center">
              <Text className="text-xs font-bold font-mono mb-1" style={{ color: colors.gold }}>
                {table.number} ({persons}/{capacity} seats)
              </Text>
              <View className="flex-row justify-center" style={{ gap: 4 }}>
                {Array.from({ length: capacity }).map((_, i) => (
                  <View
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: i < persons ? primaryColor : colors.muted }}
                  />
                ))}
              </View>
            </View>
          </View>

          {/* Bottom seats */}
          <View className="flex-row justify-center" style={{ gap: 12 }}>
            {Array.from({ length: topCount }).map((_, i) => {
              if (i < bottomCount) {
                return <Seat key={`b${i}`} filled={i < filledBottom} side="bottom" />;
              }
              return <Seat key={`b${i}`} filled={false} side="bottom" placeholder={true} />;
            })}
          </View>
        </View>

        {/* Legend */}
        <View className="flex-row justify-center mt-5" style={{ gap: 16 }}>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
            <Text className="text-xs" style={{ color: colors.muted }}>Occupied ({persons})</Text>
          </View>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.muted }} />
            <Text className="text-xs" style={{ color: colors.muted }}>Free ({capacity - persons})</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderMetadataDetails = (table: Table, activeToken: SessionToken | null) => {
    const isOccupied = table.status === TableStatus.OCCUPIED;
    const isExpiring = isTableExpiring(table.number, sessions);
    const isSessionExpired = activeToken ? (new Date(activeToken.endTime).getTime() <= Date.now()) : false;
    
    let statusText = 'Available';
    let statusTextColor = colors.success;
    
    if (table.status === TableStatus.MAINTENANCE) {
      statusText = 'Maintenance';
      statusTextColor = colors.muted;
    } else if (table.status === TableStatus.RESERVED) {
      statusText = 'Reserved';
      statusTextColor = isDark ? '#60A5FA' : '#2563EB';
    } else if (isSessionExpired) {
      statusText = 'Expired';
      statusTextColor = colors.red;
    } else if (isExpiring) {
      statusText = 'Expiring Soon';
      statusTextColor = colors.red;
    } else if (isOccupied) {
      statusText = 'Occupied';
      statusTextColor = colors.gold;
    }

    const itemLabelColor = colors.muted;
    const itemValueColor = colors.text;

    return (
      <View 
        className="rounded-xl p-3.5 border mb-4"
        style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}
      >
        <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
          <Text className="text-[11px]" style={{ color: itemLabelColor }}>Table Number</Text>
          <Text className="text-[11px] font-bold" style={{ color: itemValueColor }}>{table.number}</Text>
        </View>
        <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
          <Text className="text-[11px]" style={{ color: itemLabelColor }}>Place Type</Text>
          <Text className="text-[11px] font-semibold" style={{ color: itemValueColor }}>
            {table.placeType === 'STANDING_BAR' ? 'Standing Bar' : 'Premium Lounge'}
          </Text>
        </View>
        <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
          <Text className="text-[11px]" style={{ color: itemLabelColor }}>Capacity</Text>
          <Text className="text-[11px] font-semibold" style={{ color: itemValueColor }}>{table.seats} Seats</Text>
        </View>
        <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
          <Text className="text-[11px]" style={{ color: itemLabelColor }}>Current Occupancy</Text>
          <Text className="text-[11px] font-semibold" style={{ color: itemValueColor }}>
            {isOccupied ? `${table.occupiedSeats} / ${table.totalCapacity} Seats occupied` : '0 / ' + table.seats + ' occupied'}
          </Text>
        </View>
        <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
          <Text className="text-[11px]" style={{ color: itemLabelColor }}>Current Status</Text>
          <Text className="text-[11px] font-bold" style={{ color: statusTextColor }}>{statusText}</Text>
        </View>

        {activeToken ? (
          <>
            <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
              <Text className="text-[11px]" style={{ color: itemLabelColor }}>Current Group</Text>
              <Text className="text-[11px] font-bold" style={{ color: itemValueColor }}>{activeToken.persons} Guests</Text>
            </View>
            <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
              <Text className="text-[11px]" style={{ color: itemLabelColor }}>Session Start Time</Text>
              <Text className="text-[11px] font-semibold" style={{ color: itemValueColor }}>
                {new Date(activeToken.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
              <Text className="text-[11px]" style={{ color: itemLabelColor }}>Session Time Left</Text>
              <Text className="text-[11px] font-bold" style={{ color: isExpiring ? colors.red : itemValueColor }}>
                {calculateTimeRemaining(activeToken.endTime) === 'Expired' ? 'Expired' : `${calculateTimeRemaining(activeToken.endTime)} left`}
              </Text>
            </View>
            <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
              <Text className="text-[11px]" style={{ color: itemLabelColor }}>Drinks Used / Total</Text>
              <Text className="text-[11px] font-semibold" style={{ color: itemValueColor }}>
                {activeToken.redemptionCount} / {activeToken.redemptionLimit}
              </Text>
            </View>
            <View className="flex-row justify-between py-1.5">
              <Text className="text-[11px]" style={{ color: itemLabelColor }}>Remaining Drinks</Text>
              <Text className="text-[11px] font-bold" style={{ color: itemValueColor }}>
                {Math.max(0, activeToken.redemptionLimit - activeToken.redemptionCount)}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
              <Text className="text-[11px]" style={{ color: itemLabelColor }}>Current Group</Text>
              <Text className="text-[11px] font-semibold" style={{ color: colors.muted }}>None (Free Table)</Text>
            </View>
            <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
              <Text className="text-[11px]" style={{ color: itemLabelColor }}>Session Start Time</Text>
              <Text className="text-[11px] font-semibold" style={{ color: colors.muted }}>N/A</Text>
            </View>
            <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
              <Text className="text-[11px]" style={{ color: itemLabelColor }}>Session Time Left</Text>
              <Text className="text-[11px] font-semibold" style={{ color: colors.muted }}>N/A</Text>
            </View>
            <View className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
              <Text className="text-[11px]" style={{ color: itemLabelColor }}>Drinks Used / Total</Text>
              <Text className="text-[11px] font-semibold" style={{ color: colors.muted }}>N/A</Text>
            </View>
            <View className="flex-row justify-between py-1.5">
              <Text className="text-[11px]" style={{ color: itemLabelColor }}>Remaining Drinks</Text>
              <Text className="text-[11px] font-semibold" style={{ color: colors.muted }}>N/A</Text>
            </View>
          </>
        )}
      </View>
    );
  };

  const calculateTimeRemaining = (endTimeStr: string) => {
    const diff = new Date(endTimeStr).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const totalSecs = Math.floor(diff / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  };

  // Filters logic
  const filteredTables = placeTables.filter(table => {
    // Search filter
    if (searchQuery && !table.number.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    // Status filter
    if (filter === 'available') return table.status === TableStatus.AVAILABLE;
    if (filter === 'occupied') return table.status === TableStatus.OCCUPIED;
    if (filter === 'expiring') return isTableExpiring(table.number, sessions);
    return true;
  });

  return (
    <View className="flex-1 p-4" style={{ backgroundColor: colors.bg }}>
      <View className="mb-4">
        <Text className="text-2xl font-bold" style={{ color: colors.text }}>Table Occupancy</Text>
      </View>
      
      {/* Segmented Place Types */}
      <View 
        className="flex-row rounded-xl p-1 mb-4 border"
        style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5 }}
      >
        <TouchableOpacity 
          className="flex-1 py-[13px] items-center rounded-lg"
          style={selectedPlace === 'STANDING_BAR' ? { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border } : {}}
          onPress={() => setSelectedPlace('STANDING_BAR')}
        >
          <Text 
            className="text-[12px] font-semibold"
            style={{ color: selectedPlace === 'STANDING_BAR' ? colors.gold : colors.muted }}
          >
            Standing Bar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          className="flex-1 py-[13px] items-center rounded-lg"
          style={selectedPlace === 'PREMIUM_LOUNGE' ? { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border } : {}}
          onPress={() => setSelectedPlace('PREMIUM_LOUNGE')}
        >
          <Text 
            className="text-[12px] font-semibold"
            style={{ color: selectedPlace === 'PREMIUM_LOUNGE' ? colors.gold : colors.muted }}
          >
            Premium Lounge
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats Chips Row */}
      <View className="flex-row justify-between mb-4" style={{ marginHorizontal: -4 }}>
        <View 
          className="flex-1 items-center border p-3 rounded-xl mx-1"
          style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}
        >
          <Text className="text-lg font-bold" style={{ color: colors.text }}>{totalCount}</Text>
          <Text className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: colors.muted }}>Total</Text>
        </View>
        <View 
          className="flex-1 items-center border p-3 rounded-xl mx-1"
          style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}
        >
          <Text className="text-lg font-bold" style={{ color: colors.gold }}>{occupiedCount}</Text>
          <Text className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: colors.muted }}>Occupied</Text>
        </View>
        <View 
          className="flex-1 items-center border p-3 rounded-xl mx-1"
          style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}
        >
          <Text className="text-lg font-bold" style={{ color: colors.success }}>{freeCount}</Text>
          <Text className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: colors.muted }}>Free</Text>
        </View>
      </View>

      {/* Filters Pills Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-12 mb-3">
        {['all', 'available', 'occupied', 'expiring'].map(f => (
          <TouchableOpacity
            key={f}
            className="px-4 py-3 rounded-full border mr-1.5 justify-center"
            style={{
              backgroundColor: filter === f ? (isDark ? 'rgba(245, 166, 35, 0.12)' : 'rgba(212, 175, 55, 0.12)') : colors.secondarySurface,
              borderColor: filter === f ? colors.gold : colors.border,
              borderWidth: 1.5
            }}
            onPress={() => setFilter(f as any)}
          >
            <Text className="text-[9px] font-bold" style={{ color: filter === f ? colors.gold : colors.muted }}>
              {f.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search Input bar */}
      <View className="mb-3">
        <TextInput 
          className="border rounded-xl py-3 px-4 text-xs font-semibold"
          style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, color: colors.text, borderWidth: 1.5 }}
          placeholder="Search Table ID... (e.g. S-03)"
          placeholderTextColor={colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
      </View>

      {/* Table grid layout map */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, paddingBottom: 20 }}>
          {filteredTables.map(table => {
            const activeToken = sessions.find(s => s.tableNumber === table.number && s.status === TokenStatus.ACTIVE);
            const isOccupied = table.status === TableStatus.OCCUPIED;
            const isExp = isTableExpiring(table.number, sessions);
            let statusColor = colors.success; // Green
            let statusTextColor = colors.success;
            let statusText = 'Available';
            
            if (table.status === TableStatus.MAINTENANCE) {
              statusColor = colors.muted; // Gray
              statusTextColor = colors.muted;
              statusText = 'Maintenance';
            } else if (table.status === TableStatus.RESERVED) {
              statusColor = isDark ? '#60A5FA' : '#2563EB'; // Blue
              statusTextColor = isDark ? '#60A5FA' : '#2563EB';
              statusText = 'Reserved';
            } else if (isExp) {
              statusColor = colors.red; // Red
              statusTextColor = colors.red;
              statusText = 'Expiring Soon';
            } else if (isOccupied) {
              statusColor = colors.gold; // Amber
              statusTextColor = colors.gold;
              statusText = 'Occupied';
            }

            return (
              <View key={table.id} style={{ width: itemWidth, padding: 4 }}>
                <TouchableOpacity
                  style={{ 
                    minHeight: 110,
                    backgroundColor: isExp 
                      ? (isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2') 
                      : (table.status === TableStatus.AVAILABLE 
                         ? (isDark ? 'rgba(34, 197, 94, 0.12)' : '#F0FDF4') 
                         : (table.status === TableStatus.RESERVED 
                            ? (isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF') 
                            : (table.status === TableStatus.OCCUPIED 
                               ? (isDark ? 'rgba(245, 166, 35, 0.12)' : '#FEF3C7') 
                               : colors.secondarySurface))),
                    borderColor: isExp 
                      ? colors.red 
                      : (table.status === TableStatus.AVAILABLE 
                         ? (isDark ? 'rgba(34, 197, 94, 0.35)' : '#BBF7D0') 
                         : (table.status === TableStatus.RESERVED 
                            ? (isDark ? 'rgba(59, 130, 246, 0.35)' : '#BFDBFE') 
                            : (table.status === TableStatus.OCCUPIED 
                               ? (isDark ? 'rgba(245, 166, 35, 0.3)' : '#FDE68A') 
                               : colors.border))),
                    borderWidth: 1.5,
                    borderRadius: 12,
                    padding: 10
                  }}
                  onPress={() => handleTableTap(table)}
                  activeOpacity={0.8}
                >
                  {/* Header Row */}
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="font-mono text-[13px] font-bold" style={{ color: colors.gold }}>{table.number}</Text>
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-[8px] font-bold uppercase" style={{ color: statusTextColor }}>
                        {statusText}
                      </Text>
                      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                    </View>
                  </View>

                  {/* Place Type Label */}
                  <Text className="text-[10px] mb-2 leading-4" style={{ color: colors.muted }}>
                    {table.placeType === 'STANDING_BAR' ? 'Standing Bar' : 'Premium Lounge'}
                  </Text>

                  {/* Capacity & Occupancy Display */}
                  {isOccupied && activeToken ? (
                    <View className="gap-1.5 mt-1">
                      <View className="flex-row items-center gap-1">
                        <Text className="text-[10px]">👥</Text>
                        <Text className="text-[10px] font-bold" style={{ color: colors.text }}>
                          {activeToken.persons}/{table.seats} Pax
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Text className="text-[10px]">⏱</Text>
                        <Text className="text-[10px] font-bold" style={{ color: isExp ? colors.red : colors.text }}>
                          {calculateTimeRemaining(activeToken.endTime) === 'Expired' ? 'Expired' : `${calculateTimeRemaining(activeToken.endTime)}`}
                        </Text>
                      </View>
                      {/* Miniature token drink balance indicator */}
                      <View className="flex-row items-center gap-1 mt-0.5">
                        <Text className="text-[10px]">🍹</Text>
                        <Text className="text-[9px] font-semibold" style={{ color: colors.text }}>
                          {activeToken.redemptionCount}/{activeToken.redemptionLimit} coupons
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-1 mt-1">
                      <Text className="text-[10px]">👥</Text>
                      <Text className="text-[10px] font-semibold" style={{ color: colors.muted }}>{table.seats} Seats Cap</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* LEGEND BAR */}
      <View 
        className="flex-row justify-around py-3 border-t"
        style={{ borderTopColor: colors.border, borderTopWidth: 1.5, backgroundColor: colors.bg }}
      >
        <View className="flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.success }} />
          <Text className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.muted }}>Free</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.gold }} />
          <Text className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.muted }}>Occupied</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.red }} />
          <Text className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.muted }}>Expiring</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isDark ? '#60A5FA' : '#2563EB' }} />
          <Text className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.muted }}>Reserved</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.muted }} />
          <Text className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.muted }}>Maint</Text>
        </View>
      </View>

      {/* SEATING DETAIL SLIDE BOTTOM SHEET MODAL */}
      <Modal
        visible={isBottomSheetOpen && selectedTable !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsBottomSheetOpen(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}>
          {selectedTable && (
            <View 
              className="rounded-t-[20px] p-4 border-t"
              style={{ 
                paddingBottom: insets.bottom + 16,
                marginTop: insets.top + 10,
                maxHeight: '90%',
                backgroundColor: colors.modal,
                borderTopColor: colors.border,
                borderTopWidth: 1.5
              }}
            >
              {/* Header */}
              <View className="flex-row justify-between items-center pb-3 mb-2 border-b" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1.5 }}>
                <View>
                  <Text className="text-base font-bold" style={{ color: colors.text }}>Table {selectedTable.number}</Text>
                  <Text className="text-[11px]" style={{ color: colors.muted }}>
                    {selectedTable.placeType === 'STANDING_BAR' ? 'Standing Bar' : 'Premium Lounge'}
                  </Text>
                </View>
                <TouchableOpacity 
                  onPress={() => setIsBottomSheetOpen(false)} 
                  className="w-11 h-11 rounded-full justify-center items-center border"
                  style={{ backgroundColor: colors.secondaryButtonBg, borderColor: colors.border, borderWidth: 1.5 }}
                >
                  <AppIcon name="x" label="Close details" color={colors.muted} size={18} />
                </TouchableOpacity>
              </View>

              {/* Scrollable content area */}
              <ScrollView 
                style={{ flexGrow: 0, flexShrink: 1 }} 
                contentContainerStyle={{ paddingVertical: 4 }}
                showsVerticalScrollIndicator={false}
              >
                {/* VISUAL SEATING BLUEPRINT */}
                {renderTableLayout(selectedTable, selectedSession)}

                {/* Structured Metadata Details List */}
                {renderMetadataDetails(selectedTable, selectedSession)}
              </ScrollView>

              {/* Actions row */}
              <View className="mt-3">
                {selectedTable.status === TableStatus.AVAILABLE ? (
                  <TouchableOpacity 
                    className="w-full py-[15px] rounded-xl items-center justify-center mb-1.5 border" 
                    style={{ backgroundColor: colors.success, borderColor: colors.success, borderWidth: 1.5 }}
                    onPress={() => {
                      setPreselectedTableNumber(selectedTable.number);
                      setTab('checkin');
                      setIsBottomSheetOpen(false);
                    }}
                  >
                    <Text className="font-bold text-sm" style={{ color: '#ffffff' }}>Assign Table</Text>
                  </TouchableOpacity>
                ) : null}
 
                {selectedSession && user?.role !== UserRole.MANAGER && (
                  <View className="flex-row gap-2.5 mb-1.5">
                    <TouchableOpacity 
                      className="flex-1 border py-[15px] rounded-xl items-center justify-center" 
                      style={{ backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2', borderColor: colors.red, borderWidth: 1.5, opacity: isProcessing ? 0.5 : 1 }} 
                      onPress={handleCloseSession}
                      disabled={isProcessing}
                    >
                      <Text className="font-bold text-sm" style={{ color: colors.red }}>
                        {loadingAction === 'close_session' ? `Closing... (${secondsLeft}s)` : 'Close Session'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      className="flex-1 py-[15px] rounded-xl items-center justify-center border" 
                      style={{ backgroundColor: colors.gold, borderColor: colors.gold, borderWidth: 1.5, opacity: isProcessing ? 0.5 : 1 }} 
                      onPress={() => setIsExtendModalOpen(true)}
                      disabled={isProcessing}
                    >
                      <Text className="font-bold text-[13px]" style={{ color: colors.goldButtonText }}>Extend Time</Text>
                    </TouchableOpacity>
                  </View>
                )}
 
                {selectedSession && user?.role === UserRole.MANAGER && (
                  <View 
                    className="rounded-xl p-3 mb-2 border items-center justify-center"
                    style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5 }}
                  >
                    <Text className="text-[11px] font-semibold" style={{ color: colors.muted }}>Read-only access for Manager role</Text>
                  </View>
                )}
 
                <TouchableOpacity 
                  className="w-full py-[15px] rounded-xl items-center justify-center border" 
                  style={{ backgroundColor: colors.secondaryButtonBg, borderColor: colors.border, borderWidth: 1.5 }}
                  onPress={() => setIsBottomSheetOpen(false)}
                >
                  <Text className="font-bold text-sm" style={{ color: colors.text }}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* EXTEND SESSION PAYMENT CONFIRMATION MODAL */}
      <AlertModal
        visible={isExtendModalOpen && selectedSession !== null}
        onClose={() => {
          setIsExtendModalOpen(false);
          setExtendRefId('');
        }}
        title="Extend Session — 1 Hour"
      >
        {selectedSession && (
          <View>
            <View className="mb-4 gap-2 py-2 border-t border-b" style={{ borderTopColor: colors.divider, borderBottomColor: colors.divider, borderTopWidth: 1.5, borderBottomWidth: 1.5 }}>
              <View className="flex-row justify-between">
                <Text className="text-xs" style={{ color: colors.muted }}>Customer</Text>
                <Text className="text-xs font-bold" style={{ color: colors.text }}>{selectedSession.customerName}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs" style={{ color: colors.muted }}>Table</Text>
                <Text className="text-xs font-mono font-bold" style={{ color: colors.gold }}>Table {selectedSession.tableNumber || 'N/A'}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs" style={{ color: colors.muted }}>Guest Count</Text>
                <Text className="text-xs font-bold" style={{ color: colors.text }}>{selectedSession.persons} Pax</Text>
              </View>
              <View className="flex-row justify-between mt-1">
                <Text className="text-xs font-bold" style={{ color: colors.text }}>Extension Fee</Text>
                <Text className="text-xs font-bold" style={{ color: colors.gold }}>
                  ₹{(() => {
                    const rateCard = rates.find(r => r.placeType === selectedSession.placeType);
                    const rate = rateCard ? rateCard.ratePerPerson : (selectedSession.placeType === 'PREMIUM_LOUNGE' ? 1200 : 500);
                    const duration = rateCard?.durationHours || 2;
                    return (rate * selectedSession.persons * (1 / duration)).toFixed(0);
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
                    backgroundColor: extendPaymentMode === mode ? (isDark ? 'rgba(245, 166, 35, 0.12)' : 'rgba(212, 175, 55, 0.12)') : colors.secondarySurface,
                    borderColor: extendPaymentMode === mode ? colors.gold : colors.border,
                    borderWidth: 1.5
                  }}
                  onPress={() => setExtendPaymentMode(mode)}
                >
                  <Text className="text-[11px] font-bold" style={{ color: extendPaymentMode === mode ? colors.gold : colors.muted }}>
                    {mode === 'CASH' ? '💵 CASH' : '📱 UPI'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Static Dummy QR Code for UPI */}
            {extendPaymentMode === 'UPI' && (
              <View className="items-center justify-center mb-4 p-4 rounded-xl border" style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5 }}>
                <Text className="text-[11px] font-bold mb-2" style={{ color: colors.gold }}>Scan dummy QR to pay</Text>
                <Image
                  source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=demo@upi&pn=NFCBar&am=${(() => {
                    const rateCard = rates.find(r => r.placeType === selectedSession.placeType);
                    const rate = rateCard ? rateCard.ratePerPerson : (selectedSession.placeType === 'PREMIUM_LOUNGE' ? 1200 : 500);
                    const duration = rateCard?.durationHours || 2;
                    return (rate * selectedSession.persons * (1 / duration)).toFixed(0);
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
                style={{ backgroundColor: colors.secondaryButtonBg, borderColor: colors.border, borderWidth: 1.5, opacity: isProcessing ? 0.5 : 1 }}
                onPress={() => {
                  setIsExtendModalOpen(false);
                  setExtendRefId('');
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
                onPress={handleExtend}
                disabled={isProcessing}
              >
                <Text className="text-sm font-bold" style={{ color: isProcessing ? colors.muted : colors.goldButtonText }}>
                  {loadingAction === 'extend_session' ? `Extending... (${secondsLeft}s)` : 'Confirm & Extend'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </AlertModal>
    </View>
  );
};
