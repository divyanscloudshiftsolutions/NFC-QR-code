import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, TextInput, ScrollView, 
  Platform, Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNfcBar } from '../../../context/NfcBarContext';
import { Table, SessionToken, PlaceType, TableStatus, TokenStatus, UserRole } from '../../../types/nfc_bar';
import { isTableExpiring } from '../../../context/nfc_bar_utils';
import { AppIcon } from '../../../components/common/AppIcon';
import { useResponsive } from '../../../utils/responsive';

export const TablesPortal: React.FC = () => {
  const { tables, sessions, extendSessionTime, closeGuestSession, user, setOverlayActive, setPreselectedTableNumber, setTab } = useNfcBar();
  const insets = useSafeAreaInsets();
  const [selectedPlace, setSelectedPlace] = useState<PlaceType>('STANDING_BAR');
  
  const { getTableColumns } = useResponsive();
  const cols = getTableColumns();
  const itemWidth = `${100 / cols}%` as any;
  const [filter, setFilter] = useState<'all' | 'available' | 'occupied' | 'expiring'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionToken | null>(null);

  useEffect(() => {
    setOverlayActive(isBottomSheetOpen);
    return () => setOverlayActive(false);
  }, [isBottomSheetOpen, setOverlayActive]);

  // Stats
  const placeTables = tables.filter(t => t.placeType === selectedPlace);
  const totalCount = placeTables.length;
  const occupiedCount = placeTables.filter(t => t.status === TableStatus.OCCUPIED).length;
  const freeCount = placeTables.filter(t => t.status === TableStatus.AVAILABLE).length;

  const handleTableTap = (table: Table) => {
    setSelectedTable(table);
    // Find active session for this table (active, extended, or expired)
    const activeToken = sessions.find(s => s.tableNumber === table.number && s.status !== TokenStatus.CLOSED);
    if (activeToken) {
      setSelectedSession(activeToken);
    } else {
      setSelectedSession(null);
    }
    setIsBottomSheetOpen(true);
  };

  const handleExtend = () => {
    if (!selectedSession) return;
    const success = extendSessionTime(selectedSession.tokenNumber, 1);
    if (success) {
      // Reload states locally
      const updated = sessions.find(s => s.tokenNumber === selectedSession.tokenNumber);
      if (updated) setSelectedSession(updated);
      setIsBottomSheetOpen(false);
    }
  };

  const handleCloseSession = () => {
    if (!selectedSession) return;
    const success = closeGuestSession(selectedSession.tokenNumber);
    if (success) {
      setIsBottomSheetOpen(false);
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
    let primaryColor = '#f5a623'; // Gold default
    let labelText = 'Occupied';
    
    if (table.status === TableStatus.MAINTENANCE) {
      primaryColor = '#7a7d8a'; // Muted gray
      labelText = 'Maintenance';
    } else if (table.status === TableStatus.RESERVED) {
      primaryColor = '#3b82f6'; // Blue
      labelText = 'Reserved';
    } else if (isExpiring) {
      primaryColor = '#e63946'; // Red
      labelText = 'Expiring';
    } else if (table.status === TableStatus.AVAILABLE) {
      primaryColor = '#22c55e'; // Green
      labelText = 'Free';
    }

    const Seat = ({ filled, side, placeholder = false }: { filled: boolean; side: 'top' | 'bottom'; placeholder?: boolean }) => {
      if (placeholder) {
        return (
          <View style={{ width: 36, height: 52 }} />
        );
      }

      const chairColor = filled ? primaryColor : '#7a7d8a';
      const bgClass = filled ? 'bg-[#f5a623]/15' : 'bg-[#151821]';
      const borderStyle = filled ? { borderColor: primaryColor } : { borderColor: 'rgba(255,255,255,0.08)' };

      return (
        <View className="items-center" style={{ flexDirection: 'column', gap: 4 }}>
          {side === 'top' && (
            <View
              style={{ width: 4, height: 12, borderRadius: 2, backgroundColor: chairColor }}
            />
          )}
          <View
            style={[
              {
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
              },
              borderStyle
            ]}
            className={`${bgClass}`}
          >
            <Text style={{ color: filled ? primaryColor : 'rgba(255,255,255,0.2)', fontSize: 13, fontWeight: 'bold' }}>
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
      <View className="items-center py-4 bg-[#11131c] border border-white/5 rounded-2xl mb-4">
        <Text className="text-muted text-[10px] uppercase font-bold tracking-wider mb-4" style={{ fontFamily: Platform.OS !== 'web' ? 'System' : 'monospace' }}>
          SEATING LAYOUT ({labelText})
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
            className="flex-row items-center justify-center rounded-2xl px-6 py-4 bg-[#151821] border border-white/5"
            style={{
              minWidth: Math.max(120, topCount * 48),
            }}
          >
            <View className="items-center">
              <Text className="text-xs font-bold font-mono text-gold mb-1">
                {table.number} ({persons}/{capacity} seats)
              </Text>
              <View className="flex-row justify-center" style={{ gap: 4 }}>
                {Array.from({ length: capacity }).map((_, i) => (
                  <View
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: i < persons ? primaryColor : 'rgba(255,255,255,0.15)' }}
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
            <Text className="text-xs text-muted">Occupied ({persons})</Text>
          </View>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <View className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <Text className="text-xs text-muted">Free ({capacity - persons})</Text>
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
    let statusTextColor = 'text-[#22c55e]';
    
    if (table.status === TableStatus.MAINTENANCE) {
      statusText = 'Maintenance';
      statusTextColor = 'text-muted';
    } else if (table.status === TableStatus.RESERVED) {
      statusText = 'Reserved';
      statusTextColor = 'text-[#3b82f6]';
    } else if (isSessionExpired) {
      statusText = 'Expired';
      statusTextColor = 'text-red';
    } else if (isExpiring) {
      statusText = 'Expiring Soon';
      statusTextColor = 'text-red';
    } else if (isOccupied) {
      statusText = 'Occupied';
      statusTextColor = 'text-[#f5a623]';
    }

    return (
      <View className="bg-themeInput rounded-xl p-3.5 border border-white/5 mb-4">
        <View className="flex-row justify-between py-1.5 border-b border-white/5">
          <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Table Number</Text>
          <Text className="text-themeText text-[11px] font-bold" style={{ color: '#f0ede6' }}>{table.number}</Text>
        </View>
        <View className="flex-row justify-between py-1.5 border-b border-white/5">
          <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Place Type</Text>
          <Text className="text-themeText text-[11px] font-semibold" style={{ color: '#f0ede6' }}>
            {table.placeType === 'STANDING_BAR' ? 'Standing Bar' : 'Premium Lounge'}
          </Text>
        </View>
        <View className="flex-row justify-between py-1.5 border-b border-white/5">
          <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Capacity</Text>
          <Text className="text-themeText text-[11px] font-semibold" style={{ color: '#f0ede6' }}>{table.seats} Seats</Text>
        </View>
        <View className="flex-row justify-between py-1.5 border-b border-white/5">
          <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Current Occupancy</Text>
          <Text className="text-themeText text-[11px] font-semibold" style={{ color: '#f0ede6' }}>
            {isOccupied ? `${table.occupiedSeats} / ${table.totalCapacity} Seats occupied` : '0 / ' + table.seats + ' occupied'}
          </Text>
        </View>
        <View className="flex-row justify-between py-1.5 border-b border-white/5">
          <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Current Status</Text>
          <Text className={`text-[11px] font-bold ${statusTextColor}`}>{statusText}</Text>
        </View>

        {activeToken ? (
          <>
            <View className="flex-row justify-between py-1.5 border-b border-white/5">
              <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Current Group</Text>
              <Text className="text-themeText text-[11px] font-bold" style={{ color: '#f0ede6' }}>{activeToken.persons} Guests</Text>
            </View>
            <View className="flex-row justify-between py-1.5 border-b border-white/5">
              <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Session Start Time</Text>
              <Text className="text-themeText text-[11px] font-semibold" style={{ color: '#f0ede6' }}>
                {new Date(activeToken.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <View className="flex-row justify-between py-1.5 border-b border-white/5">
              <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Session Time Left</Text>
              <Text className="text-themeText text-[11px] font-bold" style={{ color: '#f0ede6' }}>
                {calculateTimeRemaining(activeToken.endTime) === 'Expired' ? 'Expired' : `${calculateTimeRemaining(activeToken.endTime)} left`}
              </Text>
            </View>
            <View className="flex-row justify-between py-1.5 border-b border-white/5">
              <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Drinks Used / Total</Text>
              <Text className="text-themeText text-[11px] font-semibold" style={{ color: '#f0ede6' }}>
                {activeToken.redemptionCount} / {activeToken.redemptionLimit}
              </Text>
            </View>
            <View className="flex-row justify-between py-1.5">
              <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Remaining Drinks</Text>
              <Text className="text-themeText text-[11px] font-bold" style={{ color: '#f0ede6' }}>
                {Math.max(0, activeToken.redemptionLimit - activeToken.redemptionCount)}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View className="flex-row justify-between py-1.5 border-b border-white/5">
              <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Current Group</Text>
              <Text className="text-themeText/45 text-[11px] font-semibold" style={{ color: '#f0ede6' }}>None (Free Table)</Text>
            </View>
            <View className="flex-row justify-between py-1.5 border-b border-white/5">
              <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Session Start Time</Text>
              <Text className="text-themeText/45 text-[11px] font-semibold" style={{ color: '#f0ede6' }}>N/A</Text>
            </View>
            <View className="flex-row justify-between py-1.5 border-b border-white/5">
              <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Session Time Left</Text>
              <Text className="text-themeText/45 text-[11px] font-semibold" style={{ color: '#f0ede6' }}>N/A</Text>
            </View>
            <View className="flex-row justify-between py-1.5 border-b border-white/5">
              <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Drinks Used / Total</Text>
              <Text className="text-themeText/45 text-[11px] font-semibold" style={{ color: '#f0ede6' }}>N/A</Text>
            </View>
            <View className="flex-row justify-between py-1.5">
              <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Remaining Drinks</Text>
              <Text className="text-themeText/45 text-[11px] font-semibold" style={{ color: '#f0ede6' }}>N/A</Text>
            </View>
          </>
        )}
      </View>
    );
  };

  const calculateTimeRemaining = (endTimeStr: string) => {
    const diff = new Date(endTimeStr).getTime() - new Date().getTime();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${mins}m`;
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
    <View className="flex-1 bg-themeBg p-4">
      <View className="mb-4">
        <Text className="text-2xl font-bold text-themeText" style={{ color: '#f0ede6' }}>Table Occupancy</Text>
      </View>
      
      {/* Segmented Place Types */}
      <View className="flex-row bg-[#111318] rounded-xl p-1 border border-[#262629] mb-4">
        <TouchableOpacity 
          className={`flex-1 py-[13px] items-center rounded-lg ${selectedPlace === 'STANDING_BAR' ? 'bg-[#1a1d26] border-[0.5px] border-gold/20' : ''}`}
          onPress={() => setSelectedPlace('STANDING_BAR')}
        >
          <Text className={`text-[12px] font-semibold ${selectedPlace === 'STANDING_BAR' ? 'text-gold' : 'text-muted'}`}>
            Standing Bar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          className={`flex-1 py-[13px] items-center rounded-lg ${selectedPlace === 'PREMIUM_LOUNGE' ? 'bg-[#1a1d26] border-[0.5px] border-gold/20' : ''}`}
          onPress={() => setSelectedPlace('PREMIUM_LOUNGE')}
        >
          <Text className={`text-[12px] font-semibold ${selectedPlace === 'PREMIUM_LOUNGE' ? 'text-gold' : 'text-muted'}`}>
            Premium Lounge
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats Chips Row */}
      <View className="flex-row justify-between mb-4">
        <View className="flex-1 items-center bg-surface border border-white/5 p-3 rounded-xl mx-1">
          <Text className="text-lg font-bold text-themeText" style={{ color: '#f0ede6' }}>{totalCount}</Text>
          <Text className="text-muted text-[9px] uppercase tracking-wider mt-0.5">Total</Text>
        </View>
        <View className="flex-1 items-center bg-surface border border-white/5 p-3 rounded-xl mx-1">
          <Text className="text-lg font-bold text-[#f59e0b]">{occupiedCount}</Text>
          <Text className="text-muted text-[9px] uppercase tracking-wider mt-0.5">Occupied</Text>
        </View>
        <View className="flex-1 items-center bg-surface border border-white/5 p-3 rounded-xl mx-1">
          <Text className="text-lg font-bold text-[#22c55e]">{freeCount}</Text>
          <Text className="text-muted text-[9px] uppercase tracking-wider mt-0.5">Free</Text>
        </View>
      </View>

      {/* Filters Pills Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-12 mb-3">
        {['all', 'available', 'occupied', 'expiring'].map(f => (
          <TouchableOpacity
            key={f}
            className={`px-4 py-3 rounded-full bg-surface border mr-1.5 justify-center ${filter === f ? 'border-gold bg-gold/5' : 'border-borderDark'}`}
            onPress={() => setFilter(f as any)}
          >
            <Text className={`text-[9px] font-bold ${filter === f ? 'text-gold' : 'text-muted'}`}>
              {f.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search Input bar */}
      <View className="mb-3">
        <TextInput 
          className="bg-surface text-themeText border border-borderDark rounded-xl py-3 px-4 text-xs" style={{ color: '#f0ede6' }}
          placeholder="Search Table ID... (e.g. S-03)"
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Table grid nodes */}
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row flex-wrap pb-6" style={{ marginHorizontal: -6 }}>
          {filteredTables.map(table => {
            const activeToken = sessions.find(s => s.tableNumber === table.number && s.status === TokenStatus.ACTIVE);
            const isOccupied = table.status === TableStatus.OCCUPIED;
            const isExp = isTableExpiring(table.number, sessions);
            let statusColor = 'bg-[#22c55e]'; // Green
            let statusTextColor = '#22c55e';
            let statusText = 'Available';
            
            if (table.status === TableStatus.MAINTENANCE) {
              statusColor = 'bg-[#7a7d8a]'; // Gray
              statusTextColor = '#9ca3af';
              statusText = 'Maintenance';
            } else if (table.status === TableStatus.RESERVED) {
              statusColor = 'bg-[#3b82f6]'; // Blue
              statusTextColor = '#3b82f6';
              statusText = 'Reserved';
            } else if (isExp) {
              statusColor = 'bg-[#e63946]'; // Red
              statusTextColor = '#e63946';
              statusText = 'Expiring Soon';
            } else if (isOccupied) {
              statusColor = 'bg-[#f5a623]'; // Amber
              statusTextColor = '#f5a623';
              statusText = 'Occupied';
            }

            return (
              <View key={table.id} style={{ width: itemWidth, padding: 6 }}>
                <TouchableOpacity
                  style={{ minHeight: 124 }}
                  className={`w-full bg-surface rounded-xl p-3.5 border
                    ${isExp ? 'border-red bg-red/5 shadow-red/20 shadow-lg' : 'border-borderDark'}
                    ${table.status === TableStatus.AVAILABLE ? 'border-green-500/10' : ''}
                    ${table.status === TableStatus.RESERVED ? 'border-blue-500/10' : ''}
                  `}
                  onPress={() => handleTableTap(table)}
                  activeOpacity={0.8}
                >
                  {/* Header Row */}
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="font-mono text-[13px] font-bold" style={{ color: '#f5a623' }}>{table.number}</Text>
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-[8px] font-bold uppercase" style={{ color: statusTextColor }}>
                        {statusText}
                      </Text>
                      <View className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                    </View>
                  </View>

                  {/* Place Type Label */}
                  <Text className="text-muted text-[10px] mb-2 leading-4">
                    {table.placeType === 'STANDING_BAR' ? 'Standing Bar' : 'Premium Lounge'}
                  </Text>

                  {/* Capacity & Occupancy Display */}
                  {isOccupied && activeToken ? (
                    <View className="gap-1.5 mt-1">
                      <View className="flex-row items-center gap-1">
                        <Text className="text-[10px]">👥</Text>
                        <Text className="text-themeText text-[10px] font-bold" style={{ color: '#f0ede6' }}>
                          {activeToken.persons}/{table.seats} Pax
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Text className="text-[10px]">⏱</Text>
                        <Text className={`text-[10px] font-bold ${isExp ? 'text-red' : 'text-themeText'}`} style={{ color: isExp ? '#e63946' : '#f0ede6' }}>
                          {calculateTimeRemaining(activeToken.endTime) === 'Expired' ? 'Expired' : `${calculateTimeRemaining(activeToken.endTime)}`}
                        </Text>
                      </View>
                      {/* Miniature token drink balance indicator */}
                      <View className="flex-row items-center gap-1 mt-0.5">
                        <Text className="text-[10px]">🍹</Text>
                        <Text className="text-themeText text-[9px] font-semibold" style={{ color: '#f0ede6' }}>
                          {activeToken.redemptionCount}/{activeToken.redemptionLimit} coupons
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-1 mt-1">
                      <Text className="text-[10px]">👥</Text>
                      <Text className="text-muted text-[10px] font-semibold">{table.seats} Seats Cap</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* LEGEND BAR */}
      <View className="flex-row justify-around py-3 border-t border-white/5 bg-themeBg">
        <View className="flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
          <Text className="text-[9px] uppercase font-bold tracking-wider" style={{ color: '#9ca3af' }}>Free</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full bg-[#f5a623]" />
          <Text className="text-[9px] uppercase font-bold tracking-wider" style={{ color: '#9ca3af' }}>Occupied</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full bg-[#e63946]" />
          <Text className="text-[9px] uppercase font-bold tracking-wider" style={{ color: '#9ca3af' }}>Expiring</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
          <Text className="text-[9px] uppercase font-bold tracking-wider" style={{ color: '#9ca3af' }}>Reserved</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full bg-[#7a7d8a]" />
          <Text className="text-[9px] uppercase font-bold tracking-wider" style={{ color: '#9ca3af' }}>Maint</Text>
        </View>
      </View>

      {/* SEATING DETAIL SLIDE BOTTOM SHEET MODAL */}
      <Modal
        visible={isBottomSheetOpen && selectedTable !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsBottomSheetOpen(false)}
      >
        <View className="flex-1 bg-black/65 justify-end">
          {selectedTable && (
            <View 
              className="bg-surface rounded-t-[20px] p-4 border-t border-white/10"
              style={{ 
                paddingBottom: insets.bottom + 16,
                minHeight: 380 + insets.bottom 
              }}
            >
              {/* Header */}
              <View className="flex-row justify-between items-center pb-3 mb-4 border-b border-white/5">
                <View>
                  <Text className="text-base font-bold text-themeText" style={{ color: '#f0ede6' }}>Seating Node {selectedTable.number}</Text>
                  <Text className="text-muted text-[11px]">
                    {selectedTable.placeType === 'STANDING_BAR' ? 'Standing Bar Area' : 'Premium Lounge Area'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setIsBottomSheetOpen(false)} className="w-11 h-11 rounded-full bg-themeInput justify-center items-center">
                  <AppIcon name="x" label="Close details" color="#7a7d8a" size={18} />
                </TouchableOpacity>
              </View>
 
              {/* VISUAL SEATING BLUEPRINT */}
              {renderTableLayout(selectedTable, selectedSession)}
 
              {/* Structured Metadata Details List */}
              {renderMetadataDetails(selectedTable, selectedSession)}
 
              {/* Actions row */}
              <View className="mt-2">
                {selectedTable.status === TableStatus.AVAILABLE ? (
                  <TouchableOpacity 
                    className="w-full bg-[#22c55e] py-[15px] rounded-xl items-center justify-center mb-1.5" 
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
                    <TouchableOpacity className="flex-1 bg-red/10 border border-red py-[15px] rounded-xl items-center justify-center" onPress={handleCloseSession}>
                      <Text className="font-bold text-sm" style={{ color: '#e63946' }}>Close Session</Text>
                    </TouchableOpacity>
                    <TouchableOpacity className="flex-1 bg-gold py-[15px] rounded-xl items-center justify-center" onPress={handleExtend}>
                      <Text className="font-bold text-[13px]" style={{ color: '#08090d' }}>Extend Time</Text>
                    </TouchableOpacity>
                  </View>
                )}
 
                {selectedSession && user?.role === UserRole.MANAGER && (
                  <View className="bg-themeInput rounded-xl p-3 mb-2 border border-white/5 items-center justify-center">
                    <Text className="text-[11px] font-semibold" style={{ color: '#9ca3af' }}>Read-only access for Manager role</Text>
                  </View>
                )}
 
                <TouchableOpacity className="w-full bg-themeInput py-[15px] rounded-xl items-center justify-center" onPress={() => setIsBottomSheetOpen(false)}>
                  <Text className="text-themeText font-bold text-sm" style={{ color: '#f0ede6' }}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
};
