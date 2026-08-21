import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Grid3X3, 
  Wine, 
  DollarSign, 
  TrendingUp,
  Clock,
  LogOut,
  X,
  UserCheck,
  CalendarRange,
  RefreshCw,
  Activity,
  Bell,
  BarChart3,
  AlertCircle,
  Camera
} from 'lucide-react';
import { api } from '../services/api';
import type { Token, DashboardReport } from '../types';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { ExtendSessionModal } from '../components/modals/ExtendSessionModal';


interface LiveSessionTimerProps {
  endTime: string | Date;
  status: string;
}

const LiveSessionTimer: React.FC<LiveSessionTimerProps> = ({ endTime, status }) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const diffMs = new Date(endTime).getTime() - Date.now();
      return Math.max(0, Math.floor(diffMs / 1000));
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [endTime]);

  const upperStatus = String(status).toUpperCase();
  if (upperStatus === 'CLOSED' || upperStatus === 'COMPLETED') {
    return <span className="text-text-muted font-bold">Closed</span>;
  }
  if (upperStatus === 'EXPIRED' || timeLeft <= 0) {
    return <span className="text-red-500 font-bold">Expired</span>;
  }

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  const paddedMins = String(minutes).padStart(2, '0');
  const paddedSecs = String(seconds).padStart(2, '0');

  if (hours > 0) {
    const paddedHours = String(hours).padStart(2, '0');
    return <span className="font-mono font-bold text-primary">{paddedHours}:{paddedMins}:{paddedSecs}</span>;
  }

  return <span className="font-mono font-bold text-primary">{paddedMins}:{paddedSecs}</span>;
};

interface DashboardPageProps {
 onNavigate?: (tabId: string, adminSubtab?: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { showToast, user } = useAuth();
  const { tokens, allSessions, tables, isLoading, refreshTokens, refreshAllSessions, refreshTables, sessionAlerts, dismissAlert, rates } = useData();


  // Extend Modal State
  const [extendingToken, setExtendingToken] = useState<Token | null>(null);

  // Close Modal State
  const [closingToken, setClosingToken] = useState<Token | null>(null);
  const [closeReason, setCloseReason] = useState('CHECKOUT');
  const [isSubmittingClose, setIsSubmittingClose] = useState(false);

 // Dashboard Report Analytics State
 const [reportData, setReportData] = useState<DashboardReport['data'] | null>(null);
 const [isReportLoading, setIsReportLoading] = useState(false);
 const [reportError, setReportError] = useState<string | null>(null);

 const fetchReport = async () => {
   setIsReportLoading(true);
   setReportError(null);
   try {
     const res = await api.getDashboardReport('day');
     if (res && res.success) {
       setReportData(res.data);
     } else {
       setReportError('Failed to load report data.');
     }
   } catch (err: any) {
     setReportError(err.message || 'Failed to load report data.');
   } finally {
     setIsReportLoading(false);
   }
 };

 useEffect(() => {
   fetchReport();
   refreshAllSessions();
 }, []);

 const handleCloseSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!closingToken) return;

 setIsSubmittingClose(true);
 try {
 await api.closeToken(closingToken.tokenNumber, closeReason);
 showToast(`Session ${closingToken.tokenNumber} closed (${closeReason}).`, 'success');
 setClosingToken(null);
 refreshTokens();
 refreshTables();
 } catch (err: any) {
 showToast(err.message || 'Failed to close session.', 'danger');
 } finally {
 setIsSubmittingClose(false);
 }
 };

  const activeTokens = tokens;
  const activeTokensCount = tokens.length;
  const occupiedTablesCount = tables.filter(t => t.status === 'occupied').length;
  const displayTablesCount = tables.length;
  const totalCapacity = tables.reduce((acc, t) => acc + t.capacity, 0);
  const totalGuestsInHouse = tokens.reduce((acc, tk) => acc + tk.personsCount, 0);
  const totalRedemptionsUsed = tokens.reduce((acc, tk) => acc + tk.redemptionsUsed, 0);
  const totalRevenue = reportData ? reportData.salesSummary.todaySales : 0;
  
  // KPI Calculations
  const avgCheckoutVal = reportData && reportData.salesSummary.checkoutCount > 0
    ? (reportData.salesSummary.todaySales / reportData.salesSummary.checkoutCount)
    : 0;
  const avgCheckoutDisplay = reportData 
    ? (avgCheckoutVal > 0 ? `₹${Math.round(avgCheckoutVal).toLocaleString()}` : '—') 
    : (isReportLoading ? '...' : '--');

  const drinkConversionVal = reportData && reportData.salesSummary.totalCustomers > 0
    ? (reportData.salesSummary.todayRedemptions / reportData.salesSummary.totalCustomers)
    : 0;
  const drinkConversionDisplay = reportData
    ? `${drinkConversionVal.toFixed(2)}`
    : (isReportLoading ? '...' : '--');

  const qrPassActiveDisplay = isReportLoading || isLoading
    ? '...'
    : String(activeTokensCount);

  let peakSeatingCount = 0;
  if (reportData && reportData.hourlyBreakdown?.hourlyData) {
    reportData.hourlyBreakdown.hourlyData.forEach((h: any) => {
      if (h.activeTokens > peakSeatingCount) {
        peakSeatingCount = h.activeTokens;
      }
    });
  }
  const peakSeatingDisplay = reportData
    ? (peakSeatingCount > 0 ? `${Math.round(peakSeatingCount)} Sessions` : '—')
    : (isReportLoading ? '...' : '--');

  // Chart Mapping (Hourly Revenue Trends)
  const revenueTrends = React.useMemo(() => {
    if (!reportData || !reportData.hourlyBreakdown?.hourlyData) return [];
    return reportData.hourlyBreakdown.hourlyData.map((h: any) => {
      const ampm = h.hour >= 12 ? 'PM' : 'AM';
      const displayHour = h.hour % 12 || 12;
      return {
        time: `${displayHour}:00 ${ampm}`,
        value: h.revenue || 0
      };
    });
  }, [reportData]);

  // Max value of revenueTrends to scale the height of chart bars dynamically
  const maxChartVal = React.useMemo(() => {
    if (revenueTrends.length === 0) return 60000;
    const max = Math.max(...revenueTrends.map(t => t.value));
    return max > 0 ? max : 60000;
  }, [revenueTrends]);

  // Dynamic Y-Axis Labels based on maxChartVal
  const yAxisLabels = React.useMemo(() => {
    const step = maxChartVal / 4;
    return Array.from({ length: 5 }, (_, i) => {
      const val = maxChartVal - (i * step);
      if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
      return `₹${Math.round(val)}`;
    });
  }, [maxChartVal]);

  // Peak Sales Hour string calculation
  const peakSalesHourStr = React.useMemo(() => {
    if (!reportData || !reportData.hourlyBreakdown?.hourlyData) return 'No Data';
    let maxRevenue = -1;
    let peakHourIndex = -1;
    reportData.hourlyBreakdown.hourlyData.forEach((h: any) => {
      if ((h.revenue || 0) > maxRevenue) {
        maxRevenue = h.revenue || 0;
        peakHourIndex = h.hour;
      }
    });
    if (peakHourIndex !== -1 && maxRevenue > 0) {
      const ampm = peakHourIndex >= 12 ? 'PM' : 'AM';
      const displayHour = peakHourIndex % 12 || 12;
      return `Peak Sales Hour (${displayHour}:00 ${ampm})`;
    }
    return 'No Sales Today';
  }, [reportData]);

  const notifications = sessionAlerts.filter(a => !a.dismissed);

  // Activities Stream generated dynamically from real session database logs (allSessions)
  const activities = React.useMemo(() => {
    const list: Array<{ id: string; desc: string; time: string; timestampVal: number }> = [];

    // Filter to today's events (local timezone)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    allSessions.forEach((s: any) => {
      const start = new Date(s.startTime);
      if (start >= today) {
        list.push({
          id: `checkin-${s.id}`,
          desc: `Token ${s.tokenNumber} checked in at ${s.tableNumber ? `Table ${s.tableNumber}` : 'Standing Bar'} (${s.persons || s.personsCount} guests)`,
          time: new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestampVal: start.getTime()
        });
      }

      if (s.closedAt) {
        const closed = new Date(s.closedAt);
        if (closed >= today) {
          list.push({
            id: `checkout-${s.id}`,
            desc: `Token ${s.tokenNumber} checked out from ${s.tableNumber ? `Table ${s.tableNumber}` : 'Standing Bar'}`,
            time: closed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestampVal: closed.getTime()
          });
        }
      }

      if (Array.isArray(s.extensions)) {
        s.extensions.forEach((ext: any) => {
          const extTime = new Date(ext.extendedAt);
          if (extTime >= today) {
            list.push({
              id: `ext-${ext.id || Math.random()}`,
              desc: `Token ${s.tokenNumber} session extended by ${ext.extraMinutes} minutes`,
              time: extTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              timestampVal: extTime.getTime()
            });
          }
        });
      }
    });

    // Sort descending by timestamp, take top 5
    return list.sort((a, b) => b.timestampVal - a.timestampVal).slice(0, 5);
  }, [allSessions]);

 return (
 <div className="space-y-6 text-text-main animate-fadeIn">
 {/* Demo Mode Toggle Header */}
 <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 sm:p-6 glass-panel rounded-2xl border border-border-main">
 <div>
 <h2 className="text-sm font-bold uppercase tracking-wider text-text-main flex items-center gap-2">
 <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
 System Overview Dashboard
 </h2>
 <p className="text-xs text-text-muted mt-0.5">
 Currently displaying live production database metrics
 </p>
 </div>
 </div>

 {/* Quick Actions Panel - ON TOP NEAT AND RESPONSIVE */}
 <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-border-main space-y-4">
 <div className="flex items-center justify-between pb-3 border-b border-border-main">
 <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Quick Operator Actions</h4>
 <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider">Control Panel</span>
 </div>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 pt-1">
 <button
 onClick={() => onNavigate?.('checkin')}
 className="w-full px-2 sm:px-4 py-2.5 rounded-xl text-[10px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all premium-btn-secondary text-center cursor-pointer focus:outline-none focus:ring-2 dark:focus:ring-[#D4AF37]/50 focus:ring-primary/50"
 >
 <div className="nav-icon-badge">
 <UserCheck size={14} />
 </div>
 <span>New Check-In</span>
 </button>

 <button
 onClick={() => onNavigate?.('tables')}
 className="w-full px-2 sm:px-4 py-2.5 rounded-xl text-[10px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all premium-btn-secondary text-center cursor-pointer focus:outline-none focus:ring-2 dark:focus:ring-[#D4AF37]/50 focus:ring-primary/50"
 >
 <div className="nav-icon-badge">
 <Grid3X3 size={14} />
 </div>
 <span>Table Layout</span>
 </button>

 <button
  onClick={() => onNavigate?.('tables/occupied')}
  className="w-full px-2 sm:px-4 py-2.5 rounded-xl text-[10px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all premium-btn-secondary text-center cursor-pointer focus:outline-none focus:ring-2 dark:focus:ring-[#D4AF37]/50 focus:ring-primary/50"
  >
  <div className="nav-icon-badge">
  <CalendarRange size={14} />
  </div>
  <span>Occupied Tables</span>
  </button>

  {user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'manager' ? (
    <button
      onClick={() => onNavigate?.('admin', 'customers')}
      className="w-full px-2 sm:px-4 py-2.5 rounded-xl text-[10px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all premium-btn-secondary text-center cursor-pointer focus:outline-none focus:ring-2 dark:focus:ring-[#D4AF37]/50 focus:ring-primary/50"
    >
      <div className="nav-icon-badge">
        <Users size={14} />
      </div>
      <span>Customer Sessions</span>
    </button>
  ) : (
    <button
      onClick={() => onNavigate?.('quick_attendance')}
      className="w-full px-2 sm:px-4 py-2.5 rounded-xl text-[10px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all premium-btn-secondary text-center cursor-pointer focus:outline-none focus:ring-2 dark:focus:ring-[#D4AF37]/50 focus:ring-primary/50"
    >
      <div className="nav-icon-badge">
        <Camera size={14} />
      </div>
      <span>Attendance</span>
    </button>
  )}
 </div>
 </div>

 {/* Metrics Grid */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
 <div className="glass-panel p-4 sm:p-6 rounded-2xl flex items-center justify-between border-l-4 dark:border-l-[#D4AF37] border-l-primary gap-4">
 <div className="min-w-0">
 <p className="text-xs font-semibold text-text-muted uppercase tracking-wider truncate">Active Guest Sessions</p>
 <h3 className="text-2xl font-black text-text-main mt-1">{activeTokensCount}</h3>
 <p className="text-[11px] dark:text-emerald-400 text-emerald-700 mt-1 flex items-center gap-1 font-medium truncate">
 <TrendingUp size={12} className="shrink-0" /> <span className="truncate">{totalGuestsInHouse} Total Guests In-House</span>
 </p>
 </div>
 <div className="w-12 h-12 rounded-xl dark:bg-[#D4AF37]/15 bg-primary/10 dark:text-[#D4AF37] text-primary flex items-center justify-center font-bold shrink-0">
 <Users size={24} />
 </div>
 </div>

 <div className="glass-panel p-4 sm:p-6 rounded-2xl flex items-center justify-between border-l-4 border-l-emerald-500 gap-4">
 <div className="min-w-0">
 <p className="text-xs font-semibold text-text-muted uppercase tracking-wider truncate">Seating Occupancy</p>
 <h3 className="text-2xl font-black text-text-main mt-1">{occupiedTablesCount} / {displayTablesCount}</h3>
 <p className="text-[11px] text-text-muted mt-1 truncate">
 Floor Capacity: {totalCapacity} Seats
 </p>
 </div>
 <div className="w-12 h-12 rounded-xl dark:bg-emerald-500/15 bg-emerald-500/10 dark:text-emerald-400 text-emerald-700 flex items-center justify-center font-bold shrink-0">
 <Grid3X3 size={24} />
 </div>
 </div>

 <div className="glass-panel p-4 sm:p-6 rounded-2xl flex items-center justify-between border-l-4 border-l-amber-500 gap-4">
 <div className="min-w-0">
 <p className="text-xs font-semibold text-text-muted uppercase tracking-wider truncate">Drink Redemptions</p>
 <h3 className="text-2xl font-black text-text-main mt-1">{totalRedemptionsUsed}</h3>
 <p className="text-[11px] dark:text-amber-400 text-amber-700 mt-1 truncate">Active Drinks Served Today</p>
 </div>
 <div className="w-12 h-12 rounded-xl dark:bg-amber-500/15 bg-amber-500/10 dark:text-amber-400 text-amber-700 flex items-center justify-center font-bold shrink-0">
 <Wine size={24} />
 </div>
 </div>

 <div className="glass-panel p-4 sm:p-6 rounded-2xl flex items-center justify-between border-l-4 border-l-blue-500 gap-4">
 <div className="min-w-0">
 <p className="text-xs font-semibold text-text-muted uppercase tracking-wider truncate">Session Revenue</p>
 <h3 className="text-2xl font-black text-text-main mt-1">₹{totalRevenue.toLocaleString()}</h3>
 <p className="text-[11px] dark:text-blue-400 text-blue-700 mt-1 truncate">Verified Gate Payments</p>
 </div>
 <div className="w-12 h-12 rounded-xl dark:bg-blue-500/15 bg-blue-500/10 dark:text-blue-400 text-blue-700 flex items-center justify-center font-bold shrink-0">
 <DollarSign size={24} />
 </div>
 </div>
 </div>

 {/* Active Guest Sessions Table - FULL WORKSPACE WIDTH */}
 <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-border-main">
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
 <div>
 <h3 className="text-base font-bold text-text-main">Live Customer Sessions</h3>
 <p className="text-xs text-text-muted">Real-time QR active seating tickets</p>
 </div>
 <button 
 onClick={() => { refreshTokens(); refreshTables(); refreshAllSessions(); fetchReport(); }}
 className="w-full sm:w-auto justify-center px-4 py-2 text-xs font-semibold transition-all premium-btn-secondary flex items-center gap-1.5"
 >
 <div className="nav-icon-badge">
 <RefreshCw size={12} />
 </div>
 <span>Refresh List</span>
 </button>
 </div>

 {isLoading ? (
 <div className="py-12 text-center text-text-muted text-sm">Loading live session data...</div>
 ) : activeTokens.length === 0 ? (
 <div className="py-12 text-center text-text-muted text-sm">No active customer sessions found.</div>
 ) : (
 <div className="overflow-x-auto overflow-y-auto max-h-[320px] custom-scrollbar">
 <table className="w-full text-left text-xs min-w-[600px]">
 <thead>
 <tr className="border-b border-border-main text-text-muted uppercase font-semibold text-[10px] tracking-wider">
 <th className="pb-3 px-3">Token #</th>
 <th className="pb-3 px-3">Customer</th>
 <th className="pb-3 px-3">Contact</th>
 <th className="pb-3 px-3">Persons</th>
 <th className="pb-3 px-3">Redemptions</th>
 <th className="pb-3 px-3">Status</th>
 <th className="pb-3 px-3 text-center">Time Left</th>
 <th className="pb-3 px-3">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border-main">
 {activeTokens.map(tk => (
 <tr key={tk.id} className="hover:bg-bg-card/50 transition-colors">
 <td className="py-3 px-3 font-mono font-bold text-text-main">{tk.tokenNumber}</td>
 <td className="py-3 px-3 font-semibold text-text-main">{tk.customer?.name || 'Walk-in Guest'}</td>
 <td className="py-3 px-3">
 <div className="flex flex-col">
 <span className="font-mono text-text-main">{tk.customer?.phoneNumber || 'N/A'}</span>
 {tk.customer?.email && (
 <span className="font-mono text-[10px] text-text-muted">{tk.customer.email}</span>
 )}
 </div>
 </td>
 <td className="py-3 px-3 font-semibold text-text-muted">{tk.personsCount} Guests</td>
 <td className="py-3 px-3">
 <span className="font-mono dark:text-amber-300 text-amber-700 font-bold">{tk.redemptionsUsed}</span> / {tk.totalRedemptionsAllowed} Drinks
 </td>
 <td className="py-3 px-3">
 <span className="px-2 py-0.5 rounded-full text-[10px] font-bold badge-active animate-pulse">
 {tk.status}
 </span>
 </td>
 <td className="py-3 px-3 text-center">
 <LiveSessionTimer endTime={tk.endTime} status={tk.status} />
 </td>
 <td className="py-3 px-3 flex items-center gap-2">
 <button
 onClick={() => setExtendingToken(tk)}
 className="px-2 py-1 rounded dark:bg-amber-500/10 bg-amber-500/5 hover:dark:bg-amber-500/20 hover:bg-amber-500/10 dark:text-amber-300 text-amber-700 text-[10px] font-bold border border-amber-500/30 transition-all flex items-center gap-1 cursor-pointer"
 title="Extend Session"
 >
 <Clock size={12} /> Extend
 </button>

 <button
 onClick={() => setClosingToken(tk)}
 className="px-2 py-1 rounded dark:bg-red-500/10 bg-red-500/5 hover:dark:bg-red-500/20 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-800 active:bg-red-500/25 active:text-red-900 dark:text-red-400 text-red-700 text-[10px] font-bold border border-red-500/30 transition-all flex items-center gap-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/20"
 title="Close Session"
 >
 <LogOut size={12} /> Checkout
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {/* KPI Summary Details - FULL WORKSPACE WIDTH */}
 <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-border-main space-y-4">
 <div className="flex items-center justify-between pb-3 border-b border-border-main">
 <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">KPI Analytics Summary</h4>
 <span className="text-[10px] dark:text-emerald-400 text-emerald-700 font-bold">Online</span>
 </div>

 <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-left">
 <div className="p-3.5 bg-bg-secondary-surface dark:bg-black/10 rounded-xl border border-border-main/50 flex flex-col justify-between">
 <span className="text-[9px] text-text-muted block uppercase font-semibold tracking-wider">Avg Checkout</span>
 <span className="text-sm font-black text-text-main block mt-1">{avgCheckoutDisplay}</span>
 </div>
 <div className="p-3.5 bg-bg-secondary-surface dark:bg-black/10 rounded-xl border border-border-main/50 flex flex-col justify-between">
 <span className="text-[9px] text-text-muted block uppercase font-semibold tracking-wider">Drink Conversion</span>
 <span className="text-sm font-black text-text-main block mt-1">{drinkConversionDisplay}</span>
 </div>
 <div className="p-3.5 bg-bg-secondary-surface dark:bg-black/10 rounded-xl border border-border-main/50 flex flex-col justify-between">
 <span className="text-[9px] text-text-muted block uppercase font-semibold tracking-wider">QR Pass Active</span>
 <span className="text-sm font-black text-text-main block mt-1">{qrPassActiveDisplay}</span>
 </div>
 <div className="p-3.5 bg-bg-secondary-surface dark:bg-black/10 rounded-xl border border-border-main/50 flex flex-col justify-between">
 <span className="text-[9px] text-text-muted block uppercase font-semibold tracking-wider">Peak Seating</span>
 <span className="text-sm font-black text-text-main block mt-1">{peakSeatingDisplay}</span>
 </div>
 </div>
 </div>

 {/* Main Content Layout Grid */}
 <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
 
 {/* Hourly Revenue Analytics Chart - SPANS 2 COLUMNS */}
 <div className="lg:col-span-2 glass-panel p-4 sm:p-6 rounded-2xl border border-border-main flex flex-col justify-between min-h-[340px] md:h-[340px]">
 <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between pb-3 border-b border-border-main shrink-0">
 <div className="flex items-center gap-2 text-text-main font-bold text-sm">
 <BarChart3 size={18} className="shrink-0" /> <span className="truncate">Hourly Revenue Analytics & Seating Peaks</span>
 </div>
 <span className="text-xs font-bold dark:text-emerald-400 text-emerald-700 flex items-center gap-1 shrink-0">
 <TrendingUp size={14} /> {peakSalesHourStr}
 </span>
 </div>

 <div className="flex flex-col space-y-2 mt-4 flex-1 justify-center overflow-x-auto custom-scrollbar">
 {revenueTrends.length === 0 ? (
 <div className="flex-1 flex items-center justify-center text-text-muted text-xs">
 No data available to display trends.
 </div>
 ) : (
 <div className="min-w-[400px]">
 {/* Main Chart Row */}
 <div className="flex gap-4 items-stretch h-36">
 {/* Y-Axis */}
 <div className="flex flex-col justify-between text-[9px] font-mono text-text-muted font-bold py-1 select-none text-right w-10">
 {yAxisLabels.map((lbl, idx) => (
 <span key={idx}>{lbl}</span>
 ))}
 </div>

 {/* Bars Container */}
 <div className="flex-1 border-l border-b border-border-main px-2 flex justify-between items-end relative h-full">
 {/* Background Grid lines */}
 <div className="absolute inset-0 flex flex-col justify-between pointer-events-none select-none pb-1">
 <div className="w-full border-t border-border-main/15 h-0" />
 <div className="w-full border-t border-border-main/15 h-0" />
 <div className="w-full border-t border-border-main/15 h-0" />
 <div className="w-full border-t border-border-main/15 h-0" />
 <div className="w-full h-0" />
 </div>

 {revenueTrends.map((trend, idx) => {
 const isPeak = trend.value === maxChartVal;
 const percent = Math.min(100, (trend.value / maxChartVal) * 100);
 return (
 <div key={idx} className="flex flex-col items-center flex-1 group h-full justify-end relative z-10">
 {/* Tooltip amount on hover */}
 <div className="absolute -top-6 text-[9px] font-mono font-bold text-[#D4AF37] hidden group-hover:block bg-bg-surface px-1.5 py-0.5 rounded border border-border-main z-20 pointer-events-none whitespace-nowrap">
 ₹{trend.value.toLocaleString()}
 </div>
 <div 
 style={{ height: `${percent}%` }}
 className={`w-6 md:w-8 rounded-t transition-all duration-300 cursor-pointer ${
 isPeak 
 ? 'bg-gradient-to-t from-[#D4AF37] to-[#F5E08B] hover:scale-105' 
 : 'analytics-bar-regular hover:scale-105'
 }`}
 />
 </div>
 );
 })}
 </div>
 </div>

 {/* X-Axis labels row */}
 <div className="flex gap-4 pl-14 pr-2 pb-1">
 {revenueTrends.map((trend, idx) => (
 <span key={idx} className="text-[10px] font-semibold text-text-muted flex-1 text-center select-none">
 {trend.time}
 </span>
 ))}
 </div>
 </div>
 )}
 </div>

 {/* Chart Legend Footer */}
 <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-4 mt-2 border-t border-border-main text-[10px] font-bold text-text-muted select-none shrink-0">
 <div className="flex items-center gap-2">
 <div className="w-2.5 h-2.5 rounded bg-gradient-to-t from-[#D4AF37] to-[#F5E08B]" />
 <span>Peak Hour Revenue</span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2.5 h-2.5 rounded analytics-bar-regular border border-border-main" />
 <span>Regular Shift Revenue</span>
 </div>
 </div>
 </div>

 {/* Live Alerts & Notifications - SPANS 1 COLUMN */}
 <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-border-main flex flex-col justify-between h-[300px] lg:h-[340px]">
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-border-main shrink-0">
 <div className="flex items-center gap-2 dark:text-red-400 text-red-700 font-bold text-sm">
 <Bell size={18} /> Live System Alerts
 </div>
 <span className="px-2 py-0.5 rounded-full dark:bg-red-500/10 bg-red-500/10 dark:text-red-400 text-red-700 dark:border-red-500/20 border-red-500/30 text-[10px] font-bold shrink-0">
 {notifications.length} Active
 </span>
 </div>

 <div className="space-y-3 flex-1 overflow-y-auto my-3 pr-1 custom-scrollbar">
 {notifications.length === 0 ? (
 <div className="flex-1 flex items-center justify-center h-full text-text-muted text-xs">
 No active alerts.
 </div>
 ) : (
 notifications.map((notif) => {
 const isExpiring = notif.title.toLowerCase().includes('expire') || notif.title.toLowerCase().includes('warning');
 const isPayment = notif.title.toLowerCase().includes('payment') || notif.title.toLowerCase().includes('confirm');
 const isCritical = notif.title.toLowerCase().includes('critical') || notif.title.toLowerCase().includes('alert');
 
 const iconColorClass = isExpiring 
 ? 'text-amber-700 bg-amber-500/15 dark:bg-amber-500/10 dark:text-amber-400' 
 : isPayment 
 ? 'text-emerald-700 bg-emerald-500/15 dark:bg-emerald-500/10 dark:text-emerald-400' 
 : isCritical
 ? 'text-red-700 bg-red-500/15 dark:bg-red-500/10 dark:text-red-400'
 : 'text-primary bg-primary/10';

 return (
 <div key={notif.id} className="p-3 rounded-xl bg-bg-secondary-surface dark:bg-black/10 border border-border-main flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between animate-fadeIn">
 <div className="flex items-start gap-3 min-w-0 flex-1">
 <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${iconColorClass}`}>
 <AlertCircle size={14} />
 </div>
 <div className="flex-1 min-w-0 text-left">
 <h5 className="text-xs font-bold text-text-main flex items-center justify-between gap-2">
 <span className="truncate">{notif.title}</span>
 <span className="text-[9px] font-medium text-text-muted font-mono shrink-0">{notif.timestamp}</span>
 </h5>
 <p className="text-[11px] text-text-muted mt-1 font-bold">Table {notif.tableNumber}</p>
 <p className="text-[11px] text-text-muted">Customer: {notif.customerName}</p>
 <p className="text-[11px] text-red-500 dark:text-red-400 font-extrabold mt-1">Expires in {notif.remainingTimeStr}</p>
 </div>
 </div>
 <button
 onClick={() => dismissAlert(notif.id)}
 className="w-full sm:w-auto px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-bold border border-red-500/20 transition-all cursor-pointer whitespace-nowrap self-stretch sm:self-center flex items-center justify-center shrink-0"
 >
 Dismiss
 </button>
 </div>
 );
 })
 )}
 </div>
 </div>

 {/* Recent Live Activities - SPANS 1 COLUMN */}
 <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-border-main flex flex-col justify-between h-[300px] lg:h-[340px]">
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-border-main shrink-0">
 <div className="flex items-center gap-2 text-text-main font-bold text-sm">
 <Activity size={18} className="animate-pulse shrink-0" /> <span className="truncate">Recent Live Activities</span>
 </div>
 <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider shrink-0">Audit Stream</span>
 </div>

 <div className="flex-1 overflow-y-auto my-3 pr-1 custom-scrollbar">
 {activities.length === 0 ? (
 <div className="flex-1 flex items-center justify-center h-full text-text-muted text-xs">
 No recent activities.
 </div>
 ) : (
 <div className="relative pl-6 space-y-4 border-l border-border-main ml-3 py-1">
 {activities.map((act) => (
 <div key={act.id} className="relative text-xs">
 <div className="absolute -left-[30px] top-1 w-2.5 h-2.5 rounded-full bg-[#D4AF37] border-2 border-bg-surface shadow-[0_0_8px_rgba(212,175,55,0.6)] z-10 animate-pulse" />
 <div className="flex-1">
 <p className="text-text-main font-medium">{act.desc}</p>
 <span className="text-[9px] text-text-muted font-mono block mt-0.5">{act.time}</span>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>

 </div>

 <ExtendSessionModal
      isOpen={extendingToken !== null}
      token={extendingToken!}
      rates={rates}
      onClose={() => setExtendingToken(null)}
      onSuccess={() => {
        setExtendingToken(null);
        refreshTokens();
        refreshAllSessions();
      }}
    />

 {/* CLOSE / CHECKOUT SESSION MODAL */}
 {closingToken && (
 <div className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-4">
 <div className="bg-bg-surface border border-border-main rounded-3xl p-5 sm:p-6 w-full max-w-md space-y-4 relative text-text-main animate-fadeIn">
 <button 
 onClick={() => setClosingToken(null)}
 className="absolute top-4 right-4 text-text-muted hover:text-text-main cursor-pointer"
 >
 <X size={18} />
 </button>

 <div className="flex items-center gap-2 text-text-main font-bold text-sm">
 <LogOut size={18} className="text-red-500" /> Checkout / Close Session
 </div>

 <p className="text-xs text-text-muted">
 Token Number: <span className="font-mono font-bold text-text-main">{closingToken.tokenNumber}</span> ({closingToken.customer?.name})
 </p>

 <form onSubmit={handleCloseSubmit} className="space-y-4">
 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1">Select Close Reason</label>
 <select
 value={closeReason}
 onChange={e => setCloseReason(e.target.value)}
 className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
 >
 <option value="CHECKOUT">Standard Guest Checkout</option>
 <option value="EXPIRED">Session Time Expired</option>
 <option value="CANCELLED">Session Cancelled by Reception</option>
 </select>
 </div>

 <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
 <button
 type="button"
 onClick={() => setClosingToken(null)}
 className="flex-1 py-3 rounded-xl text-xs font-semibold transition-all premium-btn-secondary"
 >
 Cancel
 </button>
 <button
 type="submit"
 disabled={isSubmittingClose}
 title={isSubmittingClose ? "Request in progress" : undefined}
 className="flex-1 py-3 rounded-xl dark:bg-red-500/20 bg-red-500/10 dark:hover:bg-red-600 hover:bg-red-600 dark:text-red-200 text-red-700 dark:hover:text-white hover:text-white text-xs font-bold uppercase tracking-wider border border-red-500/30 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/20"
 >
 {isSubmittingClose ? 'Closing...' : 'Close & Release Table'}
 </button>
 </div>
 </form>
 </div>
 </div>
 )}
 </div>
 );
};
