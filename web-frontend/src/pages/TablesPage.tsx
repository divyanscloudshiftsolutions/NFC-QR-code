import React, { useState } from 'react';
import { Grid3X3, RefreshCw, X, CheckCircle2, Users, ArrowRight, Search, UserPlus } from 'lucide-react';
import { api } from '../services/api';
import type { Table, Token } from '../types';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { TableDiagram } from '../components/TableDiagram';
import { SeatingRow } from '../components/SeatingRow';

interface TablesPageProps {
 onNavigateToCheckIn?: () => void;
 activeTab: string;
 setActiveTab: (tab: string) => void;
}

export const TablesPage: React.FC<TablesPageProps> = ({ onNavigateToCheckIn, activeTab, setActiveTab }) => {
 const { showToast, setPreselectedTable } = useAuth();
 const { tables: realTables, tokens: realTokens, isLoading, refreshTables, refreshTokens } = useData();

 // Temporary mock data fallback for UI verification
 const useMockFallback = false; // Set to false to disable and restore real data

 const mockTables: Table[] = [
 { id: 'mock-t1', tableNumber: 'M1', placeTypeId: 'standing_bar', capacity: 4, status: 'available', isActive: true },
 { id: 'mock-t2', tableNumber: 'M2', placeTypeId: 'standing_bar', capacity: 4, status: 'occupied', isActive: true },
 { id: 'mock-t3', tableNumber: 'M3', placeTypeId: 'standing_bar', capacity: 4, status: 'occupied', isActive: true },
 { id: 'mock-t4', tableNumber: 'M4', placeTypeId: 'standing_bar', capacity: 4, status: 'available', isActive: true },
 { id: 'mock-t5', tableNumber: 'M5', placeTypeId: 'standing_bar', capacity: 4, status: 'occupied', isActive: true },
 { id: 'mock-t6', tableNumber: 'M6', placeTypeId: 'standing_bar', capacity: 4, status: 'occupied', isActive: true },
 { id: 'mock-t7', tableNumber: 'ML1', placeTypeId: 'premium_lounge', capacity: 6, status: 'available', isActive: true },
 { id: 'mock-t8', tableNumber: 'ML2', placeTypeId: 'premium_lounge', capacity: 6, status: 'occupied', isActive: true },
 { id: 'mock-t9', tableNumber: 'ML3', placeTypeId: 'premium_lounge', capacity: 6, status: 'occupied', isActive: true },
 ];

 const mockTokens: Token[] = [
 // Table 02: Partially Occupied -> 2/4 seats filled
 {
 id: 'mock-tk2',
 tokenNumber: 'BAR-MOCK-02',
 customerId: 'mock-c2',
 customer: { id: 'mock-c2', name: 'Alice Smith', phoneNumber: '9876543210', totalVisits: 1 },
 personsCount: 2,
 placeTypeId: 'standing_bar',
 amountPaid: 1000,
 paymentVerified: true,
 startTime: new Date().toISOString(),
 endTime: new Date(Date.now() + 7200000).toISOString(),
 totalRedemptionsAllowed: 4,
 redemptionsUsed: 1,
 status: 'ACTIVE',
 issuedBy: 'admin',
 deliveryMode: 'EMAIL_QR',
 tableId: 'mock-t2'
 },
 // Table 03: Occupied -> 4/4 seats filled
 {
 id: 'mock-tk3',
 tokenNumber: 'BAR-MOCK-03',
 customerId: 'mock-c3',
 customer: { id: 'mock-c3', name: 'Bob Johnson', phoneNumber: '9876543211', totalVisits: 2 },
 personsCount: 4,
 placeTypeId: 'standing_bar',
 amountPaid: 2000,
 paymentVerified: true,
 startTime: new Date().toISOString(),
 endTime: new Date(Date.now() + 7200000).toISOString(),
 totalRedemptionsAllowed: 8,
 redemptionsUsed: 3,
 status: 'ACTIVE',
 issuedBy: 'admin',
 deliveryMode: 'EMAIL_QR',
 tableId: 'mock-t3'
 },
 // Table 05: Partially Occupied -> 2/4 seats filled
 {
 id: 'mock-tk5',
 tokenNumber: 'BAR-MOCK-05',
 customerId: 'mock-c5',
 customer: { id: 'mock-c5', name: 'Charlie Brown', phoneNumber: '9876543212', totalVisits: 3 },
 personsCount: 2,
 placeTypeId: 'standing_bar',
 amountPaid: 1000,
 paymentVerified: true,
 startTime: new Date().toISOString(),
 endTime: new Date(Date.now() + 7200000).toISOString(),
 totalRedemptionsAllowed: 4,
 redemptionsUsed: 0,
 status: 'ACTIVE',
 issuedBy: 'admin',
 deliveryMode: 'EMAIL_QR',
 tableId: 'mock-t5'
 },
 // Table 06: Occupied -> 4/4 seats filled
 {
 id: 'mock-tk6',
 tokenNumber: 'BAR-MOCK-06',
 customerId: 'mock-c6',
 customer: { id: 'mock-c6', name: 'David Miller', phoneNumber: '9876543213', totalVisits: 1 },
 personsCount: 4,
 placeTypeId: 'standing_bar',
 amountPaid: 2000,
 paymentVerified: true,
 startTime: new Date().toISOString(),
 endTime: new Date(Date.now() + 7200000).toISOString(),
 totalRedemptionsAllowed: 8,
 redemptionsUsed: 4,
 status: 'ACTIVE',
 issuedBy: 'admin',
 deliveryMode: 'EMAIL_QR',
 tableId: 'mock-t6'
 },
 // Table 08: Partially Occupied -> 3/6 seats filled
 {
 id: 'mock-tk8',
 tokenNumber: 'BAR-MOCK-08',
 customerId: 'mock-c8',
 customer: { id: 'mock-c8', name: 'Emma Wilson', phoneNumber: '9876543214', totalVisits: 2 },
 personsCount: 3,
 placeTypeId: 'premium_lounge',
 amountPaid: 3000,
 paymentVerified: true,
 startTime: new Date().toISOString(),
 endTime: new Date(Date.now() + 7200000).toISOString(),
 totalRedemptionsAllowed: 6,
 redemptionsUsed: 2,
 status: 'ACTIVE',
 issuedBy: 'admin',
 deliveryMode: 'EMAIL_QR',
 tableId: 'mock-t8'
 },
 // Table 09: Occupied -> 6/6 seats filled
 {
 id: 'mock-tk9',
 tokenNumber: 'BAR-MOCK-09',
 customerId: 'mock-c9',
 customer: { id: 'mock-c9', name: 'Frank Thomas', phoneNumber: '9876543215', totalVisits: 5 },
 personsCount: 6,
 placeTypeId: 'premium_lounge',
 amountPaid: 6000,
 paymentVerified: true,
 startTime: new Date().toISOString(),
 endTime: new Date(Date.now() + 7200000).toISOString(),
 totalRedemptionsAllowed: 12,
 redemptionsUsed: 6,
 status: 'ACTIVE',
 issuedBy: 'admin',
 deliveryMode: 'EMAIL_QR',
 tableId: 'mock-t9'
 }
 ];

 const tables = useMockFallback ? [...realTables, ...mockTables] : realTables;
 const tokens = useMockFallback ? [...realTokens, ...mockTokens] : realTokens;
 const [placeZone, setPlaceZoneState] = useState<'STANDING_BAR' | 'PREMIUM_LOUNGE'>(() => {
 return (localStorage.getItem('bar_web_tables_zone') as 'STANDING_BAR' | 'PREMIUM_LOUNGE') || 'STANDING_BAR';
 });
 const setPlaceZone = (zone: 'STANDING_BAR' | 'PREMIUM_LOUNGE') => {
 setPlaceZoneState(zone);
 localStorage.setItem('bar_web_tables_zone', zone);
 };
 
 // Local layout filter for when the route is 'tables/layout'
 const [layoutFilter, setLayoutFilter] = useState<string>('all');

 // Compute actual filter based on the activeTab route
 const filter = activeTab === 'tables/reservations' ? 'reserved' : layoutFilter;

 const setFilter = (val: string) => {
 if (val === 'reserved') {
 setActiveTab('tables/reservations');
 } else {
 setLayoutFilter(val);
 setActiveTab('tables/layout');
 }
 };

 // Assign Modal State
 const [assigningTable, setAssigningTable] = useState<Table | null>(null);
 const [selectedTokenId, setSelectedTokenId] = useState('');
 const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

 // Centered Table Inspection Dialog Modal State
 const [inspectingTable, setInspectingTable] = useState<Table | null>(null);

 const handleRefresh = async () => {
 await Promise.all([refreshTables(), refreshTokens()]);
 };

 const zoneFilteredTables = tables.filter(tb => {
 const p = (tb.placeTypeId || tb.categoryName || tb.tableNumber || '').toUpperCase();
 if (placeZone === 'STANDING_BAR') {
 return p.includes('STANDING') || p.includes('BAR') || tb.tableNumber.startsWith('S-');
 }
 return p.includes('PREMIUM') || p.includes('LOUNGE') || tb.tableNumber.startsWith('L-');
 });

 const filteredTables = zoneFilteredTables.filter(t => {
    if (activeTab === 'tables/reservations') {
      return t.status === 'reserved' || t.status === 'in_checkin';
    } else {
      if (t.status === 'reserved' || t.status === 'in_checkin') return false;
      if (layoutFilter === 'available') return t.status === 'available';
      if (layoutFilter === 'occupied') return t.status === 'occupied';
      return true;
    }
  });

 const handleRelease = async (tableId: string) => {
 try {
 await api.releaseTable(tableId);
 showToast('Table released successfully!', 'success');
 if (inspectingTable && inspectingTable.id === tableId) {
 setInspectingTable(null);
 }
 refreshTables();
 refreshTokens();
 } catch (err: any) {
 showToast(err.message || 'Failed to release table.', 'danger');
 }
 };

 const handleAssignSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!assigningTable || !selectedTokenId) return;

 setIsSubmittingAssign(true);
 try {
 await api.assignTable(assigningTable.id, selectedTokenId);
 showToast(`Table ${assigningTable.tableNumber} assigned successfully!`, 'success');
 setAssigningTable(null);
 setSelectedTokenId('');
 refreshTables();
 refreshTokens();
 } catch (err: any) {
 showToast(err.message || 'Failed to assign table.', 'danger');
 } finally {
 setIsSubmittingAssign(false);
 }
 };

  const handleReserveTable = async (tableId: string) => {
    try {
      await api.patchTableStatus(tableId, 'reserved');
      showToast('Table reserved successfully!', 'success');
      if (inspectingTable && inspectingTable.id === tableId) {
        setInspectingTable(prev => prev ? { ...prev, status: 'reserved' } : null);
      }
      refreshTables();
    } catch (err: any) {
      showToast(err.message || 'Failed to reserve table.', 'danger');
    }
  };

  const handleCancelReservation = async (tableId: string) => {
    try {
      await api.patchTableStatus(tableId, 'available');
      showToast('Reservation cancelled successfully!', 'success');
      if (inspectingTable && inspectingTable.id === tableId) {
        setInspectingTable(prev => prev ? { ...prev, status: 'available' } : null);
      }
      refreshTables();
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel reservation.', 'danger');
    }
  };

  const handleRedirectToCheckIn = async (tb: Table) => {
    try {
      const originalStatus = tb.status; // 'available' or 'reserved'
      await api.lockTable(tb.id);
      
      localStorage.setItem('bar_checkin_original_status', originalStatus);
      
      const placeType = (tb.tableNumber.startsWith('S-') || tb.tableNumber.startsWith('M')) ? 'standing_bar' : 'premium_lounge';
      setPreselectedTable({
        id: tb.id,
        number: tb.tableNumber,
        capacity: tb.capacity || 4,
        placeTypeId: placeType,
      });
      setInspectingTable(null);
      if (onNavigateToCheckIn) {
        onNavigateToCheckIn();
      }
      refreshTables();
    } catch (err: any) {
      showToast(err.message || 'Failed to lock table for check-in. It may have been selected by another user.', 'danger');
    }
  };

 const inspectingToken = inspectingTable 
 ? tokens.find(tk => tk.tableId === inspectingTable.id || (tk.table && tk.table.id === inspectingTable.id))
 : null;

 return (
 <div className="space-y-6 text-text-main">
 
 {/* Non-Overlapping Structured Control Toolbar */}
 <div className="dark:bg-transparent glass-panel border border-border-main border-x-0 border-t-0 rounded-none p-0 pb-4 mb-6 space-y-4">
 {/* Tier 1: Primary Zone Switcher Tabs */}
 <div className="flex flex-wrap items-center justify-between gap-4 pt-3 pb-4 border-b border-border-main w-full">
 <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto px-4">
 <button
 onClick={() => setPlaceZone('STANDING_BAR')}
 className={`w-full sm:w-auto px-4 py-2.5 text-[11px] sm:text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all premium-tab-primary text-center shrink-0 ${
 placeZone === 'STANDING_BAR' ? 'active' : ''
 }`}
 >
 Standard Zone (Standing Bar)
 </button>

 <button
 onClick={() => setPlaceZone('PREMIUM_LOUNGE')}
 className={`w-full sm:w-auto px-4 py-2.5 text-[11px] sm:text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all premium-tab-primary text-center shrink-0 ${
 placeZone === 'PREMIUM_LOUNGE' ? 'active' : ''
 }`}
 >
 Premium Zone (Lounge)
 </button>
 </div>

 <div className="text-xs font-bold text-text-muted w-full sm:w-auto text-left sm:text-right flex items-center justify-between sm:block px-4">
 <span>Total Tables:</span> <span className="text-text-main font-mono text-sm sm:text-xs">{filteredTables.length}</span>
 </div>
 </div>

 {/* Tier 2: Secondary Status Filters & Refresh Action */}
 <div className="flex flex-wrap items-center justify-between gap-4 w-full px-4">
 <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
 <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider mr-1 w-full sm:w-auto block mb-1 sm:mb-0">Status Filter:</span>
 {['all', 'available', 'occupied', 'reserved'].map(f => (
 <button
 key={f}
 onClick={() => setFilter(f)}
 className={`px-3 sm:px-3.5 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all premium-tab-secondary ${
 filter === f ? 'active' : ''
 }`}
 >
 {f}
 </button>
 ))}
 </div>

 <button
 onClick={handleRefresh}
 className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-xs font-bold flex items-center justify-center gap-2 whitespace-nowrap transition-all premium-btn-secondary active"
 >
 <div className="nav-icon-badge">
 <RefreshCw size={12} />
 </div>
 <span>Refresh Floor Plan</span>
 </button>
 </div>
 </div>

 {/* Stable Table Cards Floor Plan Grid */}
 {isLoading ? (
 <div className="py-20 text-center text-text-muted text-sm">Loading floor layout & seat maps...</div>
 ) : filteredTables.length === 0 ? (
 <div className="glass-panel p-12 rounded-3xl border border-border-main text-center space-y-3">
 <p className="text-text-muted text-sm">No tables match your filter parameters.</p>
 </div>
 ) : (
 <div className="space-y-8">
 {Array.from(new Set(filteredTables.map(tb => tb.capacity || 4)))
 .sort((a, b) => b - a)
 .map(cap => {
 const capTables = filteredTables
 .filter(tb => (tb.capacity || 4) === cap)
 .sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true, sensitivity: 'base' }));

 if (capTables.length === 0) return null;

 return (
 <SeatingRow key={cap} capacity={cap} tableCount={capTables.length}>
 {capTables.map(tb => {
 const isOccupied = tb.status === 'occupied';
 const capacity = tb.capacity || 4;
 const assignedToken = tokens.find(tk => tk.tableId === tb.id || (tk.table && tk.table.id === tb.id));
 const occupiedCount = assignedToken ? (assignedToken.personsCount || 1) : (isOccupied ? capacity : 0);
 const sizeCategory = capacity <= 2 ? 'Small' : capacity <= 4 ? 'Medium' : capacity <= 6 ? 'Large' : 'VIP Executive';

 const isFull = isOccupied && occupiedCount >= capacity;
 const isPartial = isOccupied && occupiedCount > 0 && occupiedCount < capacity;

 return (
 <div
 key={tb.id}
 onClick={() => setInspectingTable(tb)}
 className={`w-[290px] shrink-0 snap-start p-5 rounded-3xl dark:rounded-xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between gap-3 min-h-[295px] dark:bg-[#1C1C1E] ${
 inspectingTable?.id === tb.id ? 'dark:border-primary' : 'dark:border-white/10'
 } ${
 isFull
 ? 'bg-bg-surface/50 border-red-500/30 '
 : isPartial
 ? 'bg-bg-surface/50 border-amber-500/30 '
 : tb.status === 'reserved'
 ? 'bg-bg-surface border-blue-500/20 '
 : tb.status === 'maintenance'
 ? 'bg-bg-surface/50 border-border-main opacity-60 '
 : 'bg-bg-surface border-emerald-500/30 dark:hover:border-primary/50 hover:border-primary/50 dark: '
 }`}
 >
 {/* Header: Table Number & Semantic Status Pill */}
 <div className="flex items-center justify-between">
 <div>
 <span className="font-mono dark:text-[#D4AF37] text-primary font-black text-xl tracking-wide">{tb.tableNumber}</span>
 <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wider block mt-0.5">
 {placeZone === 'STANDING_BAR' ? 'Standard Zone' : 'Premium Zone'}
 </p>
 </div>

 <span
 className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
 isFull
 ? 'dark:bg-red-500/15 bg-red-500/10 dark:text-red-400 text-red-700 border border-red-500/30'
 : isPartial
 ? 'dark:bg-amber-500/15 bg-amber-500/10 dark:text-amber-400 text-amber-700 border border-amber-500/30'
 : tb.status === 'reserved'
 ? 'dark:bg-blue-500/15 bg-blue-500/10 dark:text-blue-400 text-blue-700 border border-blue-500/30'
 : tb.status === 'maintenance'
 ? 'dark:bg-zinc-800/50 bg-zinc-200/50 text-text-muted border border-border-main'
 : 'dark:bg-emerald-500/15 bg-emerald-500/10 dark:text-emerald-400 text-emerald-700 border border-emerald-500/30'
 }`}
 >
 {isOccupied ? <Users size={12} /> : <CheckCircle2 size={12} />}
 <span className="capitalize">
 {isFull ? 'Occupied' : isPartial ? 'Partially Occupied' : tb.status}
 </span>
 </span>
 </div>

 {/* Central Dynamic Table Diagram Container */}
 <div className="py-1 px-2 rounded-2xl bg-bg-primary/80 border border-border-main flex items-center justify-center h-28 relative">
 <TableDiagram
 capacity={capacity}
 occupiedCount={occupiedCount}
 status={tb.status}
 tableNumber={tb.tableNumber}
 />
 </div>

 {/* Info Bar - Size, Capacity & Token Metadata */}
 <div className="space-y-1 text-xs px-1">
 <div className="flex items-center justify-between text-[11px] font-bold text-text-muted">
 <span className="uppercase text-[10px] tracking-wider">{sizeCategory} • {capacity} {capacity === 1 ? 'Person' : 'Persons'}</span>
 <span className={
 isFull
 ? 'dark:text-red-400 text-red-700 font-extrabold'
 : isPartial
 ? 'dark:text-amber-400 text-amber-700 font-extrabold'
 : tb.status === 'reserved'
 ? 'dark:text-blue-400 text-blue-700 font-extrabold'
 : 'dark:text-emerald-400 text-emerald-700 font-extrabold'
 }>
 {occupiedCount} / {capacity} Seats
 </span>
 </div>

 {assignedToken ? (
 <div className="flex items-center justify-between text-[11px] border-t border-border-main/40 pt-1 text-text-muted">
 <span className="font-semibold truncate max-w-[120px]">👤 {assignedToken.customer?.name || 'Guest'}</span>
 <span className="font-mono text-text-main font-bold">{assignedToken.tokenNumber}</span>
 </div>
 ) : (
 <div className="text-[10px] text-text-muted border-t border-border-main/30 pt-1 flex justify-between">
 <span>Rate Allowance:</span>
 <span className="font-mono font-bold text-text-main">₹500 / Session</span>
 </div>
 )}
 </div>

 {/* Card Action Row */}
 <div className="flex gap-2 pt-1 border-t border-border-main/50">
    {tb.status === 'occupied' ? (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setInspectingTable(tb);
        }}
        className="w-full py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 dark:hover:bg-amber-500/20 dark:text-amber-300 text-amber-700 text-xs font-bold border border-amber-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Search size={14} /> Inspect Details
      </button>
    ) : tb.status === 'in_checkin' ? (
      <button
        disabled
        onClick={(e) => e.stopPropagation()}
        className="w-full py-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/30 text-xs font-bold transition-all text-center cursor-not-allowed"
      >
        In Check-In
      </button>
    ) : tb.status === 'reserved' ? (
      <>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRedirectToCheckIn(tb);
          }}
          className="flex-1 py-2.5 rounded-xl primary-btn text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <UserPlus size={14} /> Check-In
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCancelReservation(tb.id);
          }}
          className="flex-1 py-2.5 rounded-xl dark:bg-red-500/10 bg-red-500/5 hover:dark:bg-red-500/20 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-800 active:bg-red-500/25 active:text-red-900 dark:text-red-400 text-red-700 text-xs font-bold border border-red-500/30 transition-all cursor-pointer text-center"
        >
          Cancel
        </button>
      </>
    ) : tb.status === 'available' ? (
      <>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRedirectToCheckIn(tb);
          }}
          className="flex-1 py-2.5 rounded-xl primary-btn text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <UserPlus size={14} /> Assign
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleReserveTable(tb.id);
          }}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-primary text-primary hover:bg-primary/5 transition-all cursor-pointer text-center"
        >
          Reserve
        </button>
      </>
    ) : (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setInspectingTable(tb);
        }}
        className="w-full py-2.5 rounded-xl bg-bg-primary hover:bg-bg-card border border-border-main text-text-muted hover:text-text-main transition-all cursor-pointer flex items-center justify-center gap-1.5"
      >
        <Search size={14} /> Inspect
      </button>
    )}
 </div>
 </div>
 );
 })}
 </SeatingRow>
 );
 })}
 </div>
 )}

 {/* INSPECT DETAILS MODAL */}
 {(() => {
 if (!inspectingTable) return null;
 const capacity = inspectingTable.capacity || 4;
 const assignedToken = tokens.find(tk => tk.tableId === inspectingTable.id || (tk.table && tk.table.id === inspectingTable.id));
 const isOccupied = inspectingTable.status === 'occupied';
 const occupiedCount = assignedToken ? (assignedToken.personsCount || 1) : (isOccupied ? capacity : 0);

 return (
 <div className="fixed inset-0 z-50 dark:bg-transparent bg-slate-900/40 flex items-center justify-end p-0 animate-fadeIn pointer-events-none">
 <div className="w-full md:w-[380px] bg-bg-surface border border-border-main border-y-0 border-r-0 border-l-[1px] dark:border-[rgba(255,255,255,0.1)] dark:bg-[#121212] rounded-none p-5 relative text-text-main animate-none h-[100dvh] pointer-events-auto flex flex-col">
 
 {/* Header */}
 <div className="flex items-center justify-between pb-4 dark:pb-5 border-b border-border-main dark:border-[rgba(255,255,255,0.1)] shrink-0">
 <div className="flex items-center gap-2 text-text-main font-bold text-sm sm:text-base pr-2 dark:text-white">
 <span className="hidden dark:block w-2.5 h-2.5 rounded-full bg-red-400" />
 <span className="truncate dark:text-lg">T-{inspectingTable.tableNumber.padStart(2, '0')}</span>
 <span className="hidden dark:block text-[10px] text-primary ml-2 uppercase">VIP Lounge</span>
 </div>
 <button 
 onClick={() => setInspectingTable(null)}
 className="p-0 rounded-lg dark:bg-transparent bg-bg-surface hover:bg-bg-card hover:bg-transparent text-text-muted hover:text-text-main transition-all cursor-pointer shrink-0"
 >
 <X size={20} />
 </button>
 </div>

 {/* Scrollable Content Area */}
 <div className="flex-1 overflow-y-auto py-5 space-y-6 no-scrollbar">
 {/* Top Center Visual Seating View using TableDiagram */}
 <div className="dark:bg-transparent p-5 rounded-none bg-bg-primary border border-border-main dark:border-[rgba(255,255,255,0.1)] flex flex-col items-center justify-center space-y-3">
 <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
 Visual Seating Alignment ({occupiedCount} / {capacity} Seats Occupied)
 </p>

 <div className="w-full max-w-sm h-36 flex items-center justify-center">
 <TableDiagram
 capacity={capacity}
 occupiedCount={occupiedCount}
 status={inspectingTable.status}
 tableNumber={inspectingTable.tableNumber}
 />
 </div>
 </div>

 {/* Table & Session Metrics */}
 <div className="grid grid-cols-2 gap-3 text-xs">
 <div className="dark:bg-transparent p-3.5 rounded-none bg-bg-primary border border-border-main dark:border-[rgba(255,255,255,0.1)] space-y-1">
 <span className="text-text-muted text-[10px] font-bold uppercase">Status</span>
 <p className={`font-bold text-sm uppercase ${inspectingTable.status === 'occupied' ? 'dark:text-amber-400 text-amber-700' : 'dark:text-emerald-400 text-emerald-700'}`}>
 {inspectingTable.status}
 </p>
 </div>

 <div className="dark:bg-transparent p-3.5 rounded-none bg-bg-primary border border-border-main dark:border-[rgba(255,255,255,0.1)] space-y-1">
 <span className="text-text-muted text-[10px] font-bold uppercase">Capacity Limit</span>
 <p className="font-bold text-sm text-text-main">{inspectingTable.capacity} Guests Max</p>
 </div>
 </div>

 {inspectingToken && (
 <div className="dark:bg-transparent p-4 rounded-none bg-bg-primary border border-border-main dark:border-[rgba(255,255,255,0.1)] space-y-2 text-xs">
 <div className="flex justify-between">
 <span className="text-text-muted">Assigned Customer:</span>
 <span className="font-bold text-text-main">{inspectingToken.customer?.name || 'Guest'} ({inspectingToken.customer?.phoneNumber || '—'})</span>
 </div>
 <div className="flex justify-between">
 <span className="text-text-muted">Token Pass:</span>
 <span className="font-mono text-text-main font-bold">{inspectingToken.tokenNumber}</span>
 </div>
 </div>
 )}
 </div>

 {/* Action Buttons (Footer) */}
 <div className="pt-5 border-t border-border-main dark:border-[rgba(255,255,255,0.1)] flex flex-col gap-3 shrink-0">
  {inspectingTable.status === 'occupied' ? (
    <>
      <button
        type="button"
        onClick={() => handleRelease(inspectingTable.id)}
        className="w-full py-2.5 rounded-md dark:rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-400 font-bold text-[13px] border border-red-500/30 transition-all text-center cursor-pointer"
      >
        Release Table
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button className="py-2.5 rounded-md bg-transparent border border-primary text-primary font-bold text-[11px] transition-all cursor-pointer">Transfer</button>
        <button className="py-2.5 rounded-md bg-transparent border border-primary text-primary font-bold text-[11px] transition-all cursor-pointer">Extend</button>
      </div>
    </>
  ) : inspectingTable.status === 'in_checkin' ? (
    <button
      type="button"
      disabled
      className="w-full py-3 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[13px] font-bold text-center cursor-not-allowed"
    >
      In Check-In (Locked)
    </button>
  ) : (
    <>
      <button
        type="button"
        onClick={() => handleRedirectToCheckIn(inspectingTable)}
        className="w-full py-3 rounded-md primary-btn text-[13px] font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer dark:text-black"
      >
        <span className="dark:hidden">Assign Guest & Check-In</span>
        <span className="hidden dark:block">+ Add Order</span>
        <ArrowRight size={16} className="dark:hidden" />
      </button>
      
      {inspectingTable.status === 'reserved' && (
        <button
          type="button"
          onClick={() => handleCancelReservation(inspectingTable.id)}
          className="w-full py-2.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-400 font-bold text-[13px] border border-red-500/30 transition-all text-center cursor-pointer"
        >
          Cancel Reservation
        </button>
      )}

      {inspectingTable.status === 'available' && (
        <button
          type="button"
          onClick={() => handleReserveTable(inspectingTable.id)}
          className="w-full py-2.5 rounded-md bg-transparent border border-primary text-primary font-bold text-[13px] transition-all text-center cursor-pointer"
        >
          Reserve Table
        </button>
      )}
    </>
  )}

 <button
 type="button"
 onClick={() => setInspectingTable(null)}
 className="w-full py-2.5 rounded-md bg-transparent text-[11px] font-bold text-text-muted hover:text-text-main border border-border-main dark:border-[rgba(255,255,255,0.1)] cursor-pointer"
 >
 Close Drawer
 </button>
 </div>
 </div>
 </div>
 );
 })()}

 {/* ASSIGN TABLE MODAL */}
 {assigningTable && (
 <div className="fixed inset-0 z-50 dark:bg-black/75 bg-slate-900/35 flex items-center justify-center p-4">
 <div className="bg-bg-surface border border-border-main rounded-3xl p-4 sm:p-6 w-full max-w-md space-y-4 relative text-text-main animate-fadeIn">
 <button 
 onClick={() => setAssigningTable(null)}
 className="absolute top-4 right-4 text-text-muted hover:text-text-main cursor-pointer p-1"
 >
 <X size={18} />
 </button>

 <div className="flex items-center gap-2 text-text-main font-bold text-sm pr-8">
 <Grid3X3 size={18} className="shrink-0" /> <span className="truncate">Assign Table {assigningTable.tableNumber}</span>
 </div>

 <form onSubmit={handleAssignSubmit} className="space-y-4">
 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1">Active Guest Token Pass</label>
 {tokens.length === 0 ? (
 <p className="text-xs text-text-muted p-2 bg-bg-primary rounded-xl">No active guest tokens available for assignment.</p>
 ) : (
 <select
 value={selectedTokenId}
 onChange={e => setSelectedTokenId(e.target.value)}
 className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
 required
 >
 <option value="">Select Token Pass...</option>
 {tokens.map(tk => (
 <option key={tk.id} value={tk.id}>
 {tk.tokenNumber} — {tk.customer?.name || 'Guest'} ({tk.personsCount} Persons)
 </option>
 ))}
 </select>
 )}
 </div>

 <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
 <button
 type="button"
 onClick={() => setAssigningTable(null)}
 className="flex-1 py-2.5 rounded-xl bg-bg-primary hover:bg-bg-card text-xs font-semibold text-text-muted hover:text-text-main border border-border-main cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="submit"
 disabled={isSubmittingAssign || !selectedTokenId}
 title={isSubmittingAssign ? "Assigning seat..." : !selectedTokenId ? "Select active token" : undefined}
 className="flex-1 py-2.5 rounded-xl primary-btn text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
 >
 {isSubmittingAssign ? 'Assigning...' : 'Confirm Seating'}
 </button>
 </div>
 </form>
 </div>
 </div>
 )}

 </div>
 );
};


