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
  Camera,
  Settings,
  Sun,
  Moon
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
    return <span className="text-red-500 font-bold animate-pulse">Expired</span>;
  }

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  const paddedMins = String(minutes).padStart(2, '0');
  const paddedSecs = String(seconds).padStart(2, '0');

  // Time-left visual state thresholds:
  // > 15 minutes (900 seconds) -> green text
  // 5 to 15 minutes (300 to 900 seconds) -> amber text
  // < 5 minutes (< 300 seconds) -> red text
  let colorClass = 'text-emerald-400';
  if (timeLeft < 300) {
    colorClass = 'text-red-500 animate-pulse';
  } else if (timeLeft <= 900) {
    colorClass = 'text-amber-400';
  }

  if (hours > 0) {
    const paddedHours = String(hours).padStart(2, '0');
    return <span className={`font-mono font-bold ${colorClass}`}>{paddedHours}:{paddedMins}:{paddedSecs}</span>;
  }

  return <span className={`font-mono font-bold ${colorClass}`}>{paddedMins}:{paddedSecs}</span>;
};

interface DashboardPageProps {
  onNavigate?: (tabId: string, adminSubtab?: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { showToast, user } = useAuth();
  const { 
    tokens, 
    allSessions, 
    tables, 
    isLoading, 
    refreshTokens, 
    refreshAllSessions, 
    refreshTables, 
    sessionAlerts, 
    dismissAlert, 
    rates 
  } = useData();

  // Normalize user role before branching
  const rawRole = user?.role ? user.role.toLowerCase() : '';
  const isAdmin = rawRole === 'admin';
  const isManager = rawRole === 'manager';
  const isReceptionist = rawRole === 'receptionist';
  const isBartender = rawRole === 'bartender';
  const isManagement = isAdmin || isManager;

  // Touch/Interactive Chart Selection State
  const [selectedRevenueNode, setSelectedRevenueNode] = useState<number | null>(null);
  const [selectedSeatingNode, setSelectedSeatingNode] = useState<number | null>(null);

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
    // Only query report and all sessions APIs if management role is authorized to prevent 403 Forbidden responses
    if (isManagement) {
      fetchReport();
      refreshAllSessions();
    }
  }, [user]);

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
  
  // Authoritative daily revenue
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

  // Seating Peaks Line Chart Mapper
  const seatingPeaksTrends = React.useMemo(() => {
    if (!reportData || !reportData.hourlyBreakdown?.hourlyData) return [];
    return reportData.hourlyBreakdown.hourlyData.map((h: any) => {
      const ampm = h.hour >= 12 ? 'PM' : 'AM';
      const displayHour = h.hour % 12 || 12;
      return {
        time: `${displayHour}:00 ${ampm}`,
        activeTokens: h.activeTokens || 0
      };
    });
  }, [reportData]);

  const maxActiveTokensVal = React.useMemo(() => {
    if (seatingPeaksTrends.length === 0) return 10;
    const max = Math.max(...seatingPeaksTrends.map(t => t.activeTokens));
    return max > 0 ? max : 10;
  }, [seatingPeaksTrends]);

  const lineChartPathData = React.useMemo(() => {
    if (seatingPeaksTrends.length < 2) return { linePath: '', areaPath: '', points: [] };
    const width = 500;
    const height = 120;
    const padding = 10;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const points = seatingPeaksTrends.map((t, idx) => {
      const x = padding + (idx / (seatingPeaksTrends.length - 1)) * chartWidth;
      const y = padding + chartHeight - (t.activeTokens / maxActiveTokensVal) * chartHeight;
      return { x, y, time: t.time, value: t.activeTokens };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(height).toFixed(1)} L ${points[0].x.toFixed(1)} ${(height).toFixed(1)} Z`;
    
    return { linePath, areaPath, points };
  }, [seatingPeaksTrends, maxActiveTokensVal]);

  // Priority Actions Configuration depending on user role
  interface PriorityAction {
    title: string;
    desc: string;
    icon: React.ComponentType<any>;
    primary: boolean;
    onClick: () => void;
  }

  const priorityActionsList = React.useMemo<PriorityAction[]>(() => {
    if (isManagement) {
      return [
        { title: 'New Check-In', desc: 'Start Guest Session', icon: UserCheck, primary: true, onClick: () => onNavigate?.('checkin') },
        { title: 'Occupied Tables', desc: 'View Active Tables', icon: CalendarRange, primary: false, onClick: () => onNavigate?.('tables/occupied') },
        { title: 'Table Layout', desc: 'Manage Floor Plan', icon: Grid3X3, primary: false, onClick: () => onNavigate?.('tables') },
        { title: 'Customer Sessions', desc: 'Manage Active Sessions', icon: Users, primary: true, onClick: () => onNavigate?.('admin', 'customers') },
      ];
    }
    if (isReceptionist) {
      return [
        { title: 'New Check-In', desc: 'Start Guest Session', icon: UserCheck, primary: true, onClick: () => onNavigate?.('checkin') },
        { title: 'Occupied Tables', desc: 'View Active Tables', icon: CalendarRange, primary: false, onClick: () => onNavigate?.('tables/occupied') },
        { title: 'Table Layout', desc: 'Manage Floor Plan', icon: Grid3X3, primary: false, onClick: () => onNavigate?.('tables') },
        { title: 'Attendance', desc: 'Manage Attendance', icon: Camera, primary: false, onClick: () => onNavigate?.('quick_attendance') },
      ];
    }
    // Bartender
    return [
      { title: 'QR Scan', desc: 'Scan Customer QR', icon: Wine, primary: true, onClick: () => onNavigate?.('bartender/scan') },
      { title: 'Occupied Tables', desc: 'View Active Tables', icon: CalendarRange, primary: false, onClick: () => onNavigate?.('tables/occupied') },
      { title: 'Table Layout', desc: 'View Floor Plan', icon: Grid3X3, primary: false, onClick: () => onNavigate?.('tables') },
      { title: 'Attendance', desc: 'View Attendance', icon: Camera, primary: false, onClick: () => onNavigate?.('quick_attendance') },
    ];
  }, [isManagement, isReceptionist, onNavigate]);

  // Live Overview metric cards mapping
  const metricCards = React.useMemo(() => {
    const list = [
      {
        title: 'Active Guest Sessions',
        value: activeTokensCount,
        sub: (
          <span className="flex items-center gap-1 dark:text-emerald-400 text-emerald-700">
            <TrendingUp size={10} /> 12% vs yesterday
          </span>
        ),
        icon: Users,
        colorClass: 'border-l-primary dark:border-l-[#D4AF37] dark:bg-[#D4AF37]/5',
        iconBgClass: 'dark:bg-[#D4AF37]/10 dark:text-[#D4AF37] text-primary'
      },
      {
        title: 'Total Guests In-House',
        value: totalGuestsInHouse,
        sub: (
          <span className="flex items-center gap-1 dark:text-emerald-400 text-emerald-700">
            <TrendingUp size={10} /> 8% vs yesterday
          </span>
        ),
        icon: Users,
        colorClass: 'border-l-emerald-500 bg-emerald-500/5',
        iconBgClass: 'dark:bg-emerald-500/10 dark:text-emerald-400 text-emerald-700'
      },
    ];

    if (isManagement || isReceptionist) {
      const occupancyPercent = totalCapacity > 0 ? Math.round((totalGuestsInHouse / totalCapacity) * 100) : 0;
      list.push({
        title: 'Seating Occupancy',
        value: `${occupancyPercent}%`,
        sub: <span className="text-text-muted">{totalGuestsInHouse} / {totalCapacity} Seats</span>,
        icon: Grid3X3,
        colorClass: 'border-l-emerald-500 bg-emerald-500/5',
        iconBgClass: 'dark:bg-emerald-500/10 dark:text-emerald-400 text-emerald-700'
      });
    }

    if (isManagement || isBartender) {
      list.push({
        title: 'Drink Redemptions',
        value: totalRedemptionsUsed,
        sub: <span className="text-text-muted">Today</span>,
        icon: Wine,
        colorClass: 'border-l-amber-500 bg-amber-500/5',
        iconBgClass: 'dark:bg-amber-500/10 dark:text-amber-400 text-amber-700'
      });
    }

    if (isManagement) {
      list.push({
        title: 'Session Revenue',
        value: `₹${totalRevenue.toLocaleString()}`,
        sub: <span className="text-text-muted">Verified Payments</span>,
        icon: DollarSign,
        colorClass: 'border-l-blue-500 bg-blue-500/5',
        iconBgClass: 'dark:bg-blue-500/10 dark:text-blue-400 text-blue-700'
      });
    }

    return list;
  }, [isManagement, isReceptionist, isBartender, activeTokensCount, totalGuestsInHouse, totalCapacity, totalRedemptionsUsed, totalRevenue]);

  // Dynamic alert list generation based on active tokens, table statuses, and role restriction
  const notifications = React.useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      message: string;
      customerName: string;
      tableNumber: string;
      remainingTimeStr?: string;
      type: 'expire' | 'checkout' | 'assign' | 'attendance';
      actionLabel?: string;
      onAction?: () => void;
    }> = [];

    // 1. Expiration alerts from data context
    sessionAlerts.forEach(a => {
      if (a.dismissed) return;
      const tk = tokens.find(t => t.id === a.id);
      
      list.push({
        id: a.id,
        title: 'Session Expiring Soon',
        message: `Table ${a.tableNumber} • ${a.customerName}`,
        customerName: a.customerName,
        tableNumber: a.tableNumber,
        remainingTimeStr: a.remainingTimeStr,
        type: 'expire',
        actionLabel: 'Extend',
        onAction: () => {
          if (tk) setExtendingToken(tk);
        }
      });
    });

    // 2. Awaiting checkout alerts (active sessions in pending_payment state or fully expired)
    tokens.forEach(tk => {
      const isExpired = new Date(tk.endTime).getTime() <= Date.now();
      if (tk.status === 'PENDING_PAYMENT' || isExpired) {
        list.push({
          id: `checkout-${tk.id}`,
          title: 'Table awaiting checkout',
          message: `Table ${tk.tableNumber || 'N/A'} • ${tk.customer?.name || 'Guest'}`,
          customerName: tk.customer?.name || 'Guest',
          tableNumber: tk.tableNumber || 'N/A',
          remainingTimeStr: isExpired ? '00:00:00' : 'Awaiting Payment',
          type: 'checkout',
          actionLabel: 'Checkout',
          onAction: () => setClosingToken(tk)
        });
      }
    });

    // 3. Vacant tables available (Filtered out for Bartender)
    if (!isBartender) {
      tables.filter(t => t.status === 'vacant').slice(0, 2).forEach(t => {
        list.push({
          id: `vacant-${t.id}`,
          title: `Table ${t.tableNumber || t.name} is now available`,
          message: `${t.capacity}-Seater • Ready for check-in`,
          customerName: 'N/A',
          tableNumber: t.tableNumber || t.name,
          type: 'assign',
          actionLabel: 'Assign',
          onAction: () => onNavigate?.('tables')
        });
      });
    }

    // 4. Pending attendance check-ins (Filtered out for Bartender)
    if (!isBartender) {
      const pendingPaymentCount = tokens.filter(tk => tk.status === 'PENDING_PAYMENT').length;
      if (pendingPaymentCount > 0) {
        list.push({
          id: 'pending-attendance',
          title: 'Pending customer attendance',
          message: `${pendingPaymentCount} pending check-ins`,
          customerName: 'Multiple',
          tableNumber: 'N/A',
          type: 'attendance',
          actionLabel: 'View',
          onAction: () => onNavigate?.('checkin')
        });
      }
    }

    return list;
  }, [sessionAlerts, tokens, tables, isBartender, onNavigate]);

  // Dynamic activities stream logs for Admin/Manager
  const activities = React.useMemo(() => {
    if (!isManagement) return [];
    
    const list: Array<{ id: string; desc: string; time: string; timestampVal: number }> = [];
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

    return list.sort((a, b) => b.timestampVal - a.timestampVal).slice(0, 5);
  }, [allSessions, isManagement]);

   return (
    <div className="space-y-6 text-text-main animate-fadeIn pb-12">
      {/* Priority Actions Section (Mobile optimized compact columns) */}
      <div className="space-y-3">
        <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Priority Actions</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {priorityActionsList.map((act, i) => {
            const Icon = act.icon;
            return (
              <button
                key={i}
                onClick={act.onClick}
                className={`w-full p-2.5 sm:p-4 rounded-xl flex flex-col sm:flex-row items-center sm:items-start justify-between gap-1.5 sm:gap-3 transition-all duration-300 text-center sm:text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 ${
                  act.primary
                    ? 'bg-gradient-to-br from-[#D4AF37]/10 to-transparent border border-[#D4AF37]/30 hover:border-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.08)] col-span-2 sm:col-span-1'
                    : 'glass-panel border border-border-main/60 hover:border-border-main hover:bg-bg-card/50'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3 w-full min-w-0">
                  <div className={`p-1.5 sm:p-2.5 rounded-lg shrink-0 ${
                    act.primary 
                      ? 'bg-[#D4AF37]/15 text-[#D4AF37]' 
                      : 'bg-border-main/20 text-text-muted group-hover:text-text-main'
                  } transition-colors`}>
                    <Icon size={14} className="sm:w-4 sm:h-4" />
                  </div>
                  <div className="min-w-0 text-center sm:text-left w-full">
                    <h5 className={`text-[10px] sm:text-xs font-bold transition-colors truncate ${act.primary ? 'text-white' : 'text-text-main group-hover:text-white'}`}>
                      {act.title}
                    </h5>
                    <p className="text-[8px] sm:text-[10px] text-text-muted mt-0.5 truncate">{act.desc}</p>
                  </div>
                </div>
                <div className="hidden sm:block text-xs font-bold transition-transform group-hover:translate-x-1 text-text-muted group-hover:text-text-main">
                  →
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Live Overview Metrics Grid */}
      <div className="space-y-3">
        <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Live Overview</h4>
        <div className={`grid grid-cols-2 md:grid-cols-3 ${isManagement ? 'xl:grid-cols-5' : 'xl:grid-cols-3'} gap-3 sm:gap-4`}>
          {metricCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div key={i} className={`glass-panel p-3.5 sm:p-4 rounded-xl flex items-center justify-between border-l-4 ${card.colorClass} border-border-main/50 gap-3`}>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-text-muted uppercase tracking-wider truncate">{card.title}</p>
                  <h3 className="text-lg sm:text-2xl font-black text-text-main mt-0.5 sm:mt-1 tracking-tight">{card.value}</h3>
                  <p className="text-[9px] sm:text-[10px] mt-1 font-semibold truncate flex items-center gap-1">{card.sub}</p>
                </div>
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${card.iconBgClass}`}>
                  <Icon size={16} className="sm:w-5 sm:h-5" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Live Customer Sessions (2/3) & Attention Needed (1/3) Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Live Customer Sessions Card */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-4 sm:p-6 border border-border-main space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border-main pb-3">
            <div>
              <h3 className="text-sm font-bold text-text-main">Live Customer Sessions</h3>
              <p className="text-xs text-text-muted mt-0.5">Real-time QR active seating tickets</p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button 
                onClick={() => { refreshTokens(); refreshTables(); if (isManagement) { refreshAllSessions(); fetchReport(); } }}
                className="flex-1 sm:flex-none justify-center px-3 py-1.5 text-[10px] sm:text-xs font-semibold transition-all premium-btn-secondary flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={12} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-text-muted text-xs">Loading live session data...</div>
          ) : activeTokens.length === 0 ? (
            <div className="py-8 sm:py-12 text-center text-text-muted text-xs space-y-3">
              <p>No active customer sessions found.</p>
              {!isBartender && (
                <button 
                  onClick={() => onNavigate?.('checkin')} 
                  className="px-3 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#F5E08B] text-black text-xs font-bold transition-all cursor-pointer shadow-[0_0_10px_rgba(212,175,55,0.2)]"
                >
                  New Check-In
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop view - Table layout */}
              <div className="hidden sm:block overflow-x-auto overflow-y-auto max-h-[320px] custom-scrollbar">
                <table className="w-full text-left text-[11px] min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border-main text-text-muted uppercase font-semibold text-[10px] tracking-wider">
                      <th className="pb-3 px-3">Token #</th>
                      <th className="pb-3 px-3">Customer</th>
                      <th className="pb-3 px-3">Contact</th>
                      <th className="pb-3 px-3">Persons</th>
                      <th className="pb-3 px-3">Drinks</th>
                      <th className="pb-3 px-3">Status</th>
                      <th className="pb-3 px-3 text-center">Time Left</th>
                      <th className="pb-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-main">
                    {activeTokens.map(tk => {
                      const statusStr = String(tk.status).toUpperCase();
                      let badgeClass = 'bg-border-main/20 text-text-muted border border-border-main/30';
                      if (statusStr === 'ACTIVE' || statusStr === 'EXTENDED') {
                        badgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                      } else if (statusStr === 'EXPIRING') {
                        badgeClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                      } else if (statusStr === 'PENDING_PAYMENT') {
                        badgeClass = 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse';
                      }

                      return (
                        <tr key={tk.id} className="hover:bg-bg-card/50 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-text-main">{tk.tokenNumber}</td>
                          <td className="py-2.5 px-3 font-semibold text-text-main">{tk.customer?.name || 'Walk-in Guest'}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col">
                              <span className="font-mono text-text-main">{tk.customer?.phoneNumber || 'N/A'}</span>
                              {tk.customer?.email && (
                                <span className="font-mono text-[9px] text-text-muted">{tk.customer.email}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-text-muted">{tk.personsCount} Guests</td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono dark:text-amber-300 text-amber-700 font-bold">{tk.redemptionsUsed}</span> / {tk.totalRedemptionsAllowed} Drinks
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${badgeClass}`}>
                              {tk.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <LiveSessionTimer endTime={tk.endTime} status={tk.status} />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setExtendingToken(tk)}
                                className="px-2 py-1 rounded dark:bg-amber-500/10 bg-amber-500/5 hover:dark:bg-amber-500/20 hover:bg-amber-500/10 dark:text-amber-300 text-amber-700 text-[10px] font-bold border border-amber-500/30 transition-all flex items-center gap-1 cursor-pointer"
                                title="Extend Session"
                              >
                                <Clock size={10} /> Extend
                              </button>
                              <button
                                onClick={() => setClosingToken(tk)}
                                className="px-2 py-1 rounded dark:bg-red-500/10 bg-red-500/5 hover:dark:bg-red-500/20 hover:bg-red-500/15 dark:text-red-400 text-red-700 text-[10px] font-bold border border-red-500/30 transition-all flex items-center gap-1 cursor-pointer"
                                title="Close Session"
                              >
                                <LogOut size={10} /> Checkout
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile view - Grid of high-density cards (under 640px) */}
              <div className="block sm:hidden space-y-3">
                {activeTokens.map(tk => {
                  const statusStr = String(tk.status).toUpperCase();
                  let badgeClass = 'bg-border-main/20 text-text-muted border border-border-main/30';
                  if (statusStr === 'ACTIVE' || statusStr === 'EXTENDED') {
                    badgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                  } else if (statusStr === 'EXPIRING') {
                    badgeClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                  } else if (statusStr === 'PENDING_PAYMENT') {
                    badgeClass = 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse';
                  }

                  return (
                    <div key={tk.id} className="p-4 rounded-xl bg-bg-secondary-surface dark:bg-black/10 border border-border-main space-y-3 text-left">
                      <div className="flex items-center justify-between border-b border-border-main/55 pb-2">
                        <span className="font-mono font-bold text-text-main text-xs">{tk.tokenNumber}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${badgeClass}`}>
                          {tk.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <div>
                          <span className="text-[9px] text-text-muted block font-semibold uppercase">Guest</span>
                          <span className="font-semibold text-text-main truncate block">{tk.customer?.name || 'Walk-in Guest'}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-text-muted block font-semibold uppercase">Location</span>
                          <span className="font-semibold text-text-main block">{tk.tableNumber ? `Table ${tk.tableNumber}` : 'Standing Bar'}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-text-muted block font-semibold uppercase">Group Size</span>
                          <span className="font-semibold text-text-muted block">{tk.personsCount} Guests</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-text-muted block font-semibold uppercase">Drinks Redeemed</span>
                          <span className="font-semibold text-text-muted block">
                            <span className="dark:text-amber-300 text-amber-700 font-bold">{tk.redemptionsUsed}</span> / {tk.totalRedemptionsAllowed}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-bg-primary/45 p-2 rounded-lg border border-border-main/50 text-xs">
                        <span className="text-text-muted">Time Left:</span>
                        <LiveSessionTimer endTime={tk.endTime} status={tk.status} />
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          onClick={() => setExtendingToken(tk)}
                          className="w-full py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-300 text-xs font-bold border border-amber-500/20 transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Clock size={12} /> Extend
                        </button>
                        <button
                          onClick={() => setClosingToken(tk)}
                          className="w-full py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold border border-red-500/20 transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <LogOut size={12} /> Checkout
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Attention Needed Column (Height adjusted dynamically to prevent empty spaces) */}
        <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-border-main flex flex-col justify-between min-h-[180px] lg:h-[396px]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-border-main shrink-0">
            <div className="flex items-center gap-2 dark:text-red-400 text-red-700 font-bold text-sm">
              <Bell size={18} /> <span>Attention Needed</span>
            </div>
            <span className="px-2 py-0.5 rounded-full dark:bg-red-500/10 bg-red-500/10 dark:text-red-400 text-red-700 dark:border-red-500/20 border-red-500/30 text-[10px] font-bold shrink-0">
              {notifications.length} Active
            </span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto my-3 pr-1 custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="flex-1 flex items-center justify-center h-full text-text-muted text-xs py-6">
                No attention required
              </div>
            ) : (
              notifications.map((notif) => {
                let iconColorClass = 'text-primary bg-primary/10';
                if (notif.type === 'expire') {
                  iconColorClass = 'text-amber-700 bg-amber-500/15 dark:bg-amber-500/10 dark:text-amber-400';
                } else if (notif.type === 'checkout') {
                  iconColorClass = 'text-red-700 bg-red-500/15 dark:bg-red-500/10 dark:text-red-400';
                } else if (notif.type === 'assign') {
                  iconColorClass = 'text-emerald-700 bg-emerald-500/15 dark:bg-emerald-500/10 dark:text-emerald-400';
                } else if (notif.type === 'attendance') {
                  iconColorClass = 'text-[#D4AF37] bg-[#D4AF37]/15 dark:bg-[#D4AF37]/10';
                }

                return (
                  <div key={notif.id} className="p-3 rounded-xl bg-bg-secondary-surface dark:bg-black/10 border border-border-main flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between animate-fadeIn text-left">
                    <div className="flex items-start gap-2.5 min-w-0 w-full">
                      <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${iconColorClass}`}>
                        <AlertCircle size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h5 className="text-xs font-bold text-text-main leading-tight truncate">
                          {notif.title}
                        </h5>
                        <p className="text-[11px] text-text-muted mt-0.5 break-words font-semibold">{notif.message}</p>
                        {notif.remainingTimeStr && notif.type === 'expire' && (
                          <p className="text-[10px] text-red-500 dark:text-red-400 font-extrabold mt-1">Expires in {notif.remainingTimeStr}</p>
                        )}
                      </div>
                    </div>
                    {notif.actionLabel && notif.onAction && (
                      <button
                        onClick={notif.onAction}
                        className="w-full sm:w-auto px-3 py-1.5 sm:py-1 rounded bg-[#D4AF37]/10 hover:bg-[#D4AF37]/25 text-[#D4AF37] text-xs sm:text-[10px] font-bold border border-[#D4AF37]/20 transition-all cursor-pointer whitespace-nowrap flex items-center justify-center shrink-0 self-stretch sm:self-center"
                      >
                        {notif.actionLabel}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 5. KPI Analytics Summary (Admin / Manager Only) */}
      {isManagement && (
        <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-border-main space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border-main">
            <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">KPI Analytics Summary</h4>
            <span className="text-[10px] dark:text-[#D4AF37] text-primary font-bold">Verified Daily Metrics</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 text-left">
            <div className="p-3.5 bg-bg-secondary-surface dark:bg-black/10 rounded-xl border border-border-main/50 flex flex-col justify-between">
              <span className="text-[9px] text-text-muted block uppercase font-semibold tracking-wider">Avg Checkout</span>
              <span className="text-sm font-black text-text-main block mt-1">{avgCheckoutDisplay}</span>
            </div>
            <div className="p-3.5 bg-bg-secondary-surface dark:bg-black/10 rounded-xl border border-border-main/50 flex flex-col justify-between">
              <span className="text-[9px] text-text-muted block uppercase font-semibold tracking-wider">Drink Conversion</span>
              <span className="text-sm font-black text-text-main block mt-1">{drinkConversionDisplay} Drinks</span>
            </div>
            <div className="p-3.5 bg-bg-secondary-surface dark:bg-black/10 rounded-xl border border-border-main/50 flex flex-col justify-between">
              <span className="text-[9px] text-text-muted block uppercase font-semibold tracking-wider">QR Pass Active</span>
              <span className="text-sm font-black text-text-main block mt-1">{qrPassActiveDisplay} Passes</span>
            </div>
            <div className="p-3.5 bg-bg-secondary-surface dark:bg-black/10 rounded-xl border border-border-main/50 flex flex-col justify-between">
              <span className="text-[9px] text-text-muted block uppercase font-semibold tracking-wider">Peak Seating</span>
              <span className="text-sm font-black text-text-main block mt-1">{peakSeatingDisplay}</span>
            </div>
          </div>
        </div>
      )}

      {/* 6. Hourly Revenue & Seating Peaks Side-by-Side Charts (Admin / Manager Only) */}
      {isManagement && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Hourly Revenue Chart Card */}
            <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-border-main flex flex-col justify-between min-h-[340px]">
              <div className="flex items-center justify-between pb-3 border-b border-border-main shrink-0 text-left">
                <div className="flex items-center gap-2 text-text-main font-bold text-xs sm:text-sm">
                  <BarChart3 size={16} className="shrink-0" /> <span>Hourly Revenue Trends</span>
                </div>
                <span className="text-[10px] font-bold dark:text-emerald-400 text-emerald-700 flex items-center gap-1 shrink-0">
                  {selectedRevenueNode !== null 
                    ? `₹${revenueTrends[selectedRevenueNode].value.toLocaleString()} at ${revenueTrends[selectedRevenueNode].time}`
                    : peakSalesHourStr}
                </span>
              </div>

              <div className="flex flex-col space-y-2 mt-4 flex-1 justify-center overflow-x-auto custom-scrollbar">
                {revenueTrends.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-text-muted text-xs">
                    No revenue trends recorded today.
                  </div>
                ) : (
                  <div className="min-w-[280px]">
                    {/* Main Chart Row */}
                    <div className="flex gap-2 items-stretch h-36">
                      {/* Y-Axis */}
                      <div className="flex flex-col justify-between text-[9px] font-mono text-text-muted font-bold py-1 text-right w-10 shrink-0">
                        {yAxisLabels.map((lbl, idx) => (
                          <span key={idx}>{lbl}</span>
                        ))}
                      </div>

                      {/* Bars Container */}
                      <div className="flex-1 border-l border-b border-border-main px-2 flex justify-between items-end relative h-full">
                        {/* Background Grid lines */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-1">
                          <div className="w-full border-t border-border-main/15 h-0" />
                          <div className="w-full border-t border-border-main/15 h-0" />
                          <div className="w-full border-t border-border-main/15 h-0" />
                          <div className="w-full border-t border-border-main/15 h-0" />
                          <div className="w-full h-0" />
                        </div>

                        {revenueTrends.map((trend, idx) => {
                          const isPeak = trend.value === maxChartVal;
                          const percent = Math.min(100, (trend.value / maxChartVal) * 100);
                          const isSelected = selectedRevenueNode === idx;
                          return (
                            <div 
                              key={idx} 
                              onClick={() => setSelectedRevenueNode(selectedRevenueNode === idx ? null : idx)}
                              className="flex flex-col items-center flex-1 group h-full justify-end relative z-10 mx-0.5"
                            >
                              {/* Tooltip amount on hover / touch toggle */}
                              <div className={`absolute -top-6 text-[9px] font-mono font-bold text-[#D4AF37] bg-bg-surface px-1.5 py-0.5 rounded border border-border-main z-20 pointer-events-none whitespace-nowrap ${
                                isSelected ? 'block' : 'hidden group-hover:block'
                              }`}>
                                ₹{trend.value.toLocaleString()}
                              </div>
                              <div 
                                style={{ height: `${percent}%` }}
                                className={`w-4 sm:w-6 rounded-t transition-all duration-300 cursor-pointer ${
                                  isSelected || isPeak 
                                    ? 'bg-gradient-to-t from-[#D4AF37] to-[#F5E08B] hover:scale-105' 
                                    : 'analytics-bar-regular hover:scale-105'
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* X-Axis labels row (Responsive filter hidden odd entries on mobile) */}
                    <div className="flex gap-2 pl-12 pr-2 pb-1 mt-1 text-[8px] font-mono text-text-muted font-bold">
                      {revenueTrends.map((trend, idx) => (
                        <span key={idx} className={`flex-1 text-center truncate ${idx % 2 === 0 ? 'inline' : 'hidden sm:inline'}`}>
                          {trend.time.replace(':00', '')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Chart Legend */}
              <div className="flex items-center justify-center gap-4 pt-3 mt-2 border-t border-border-main text-[9px] font-bold text-text-muted shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded bg-gradient-to-t from-[#D4AF37] to-[#F5E08B]" />
                  <span>Peak Hour</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded analytics-bar-regular border border-border-main" />
                  <span>Regular</span>
                </div>
              </div>
            </div>

            {/* Seating Peaks Custom SVG Line Chart Card */}
            <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-border-main flex flex-col justify-between min-h-[340px]">
              <div className="flex items-center justify-between pb-3 border-b border-border-main shrink-0 text-left">
                <div className="flex items-center gap-2 text-text-main font-bold text-xs sm:text-sm">
                  <Grid3X3 size={16} className="shrink-0 text-[#D4AF37]" /> <span>Seating Peaks Trend</span>
                </div>
                <span className="text-[10px] font-bold text-[#D4AF37] shrink-0">
                  {selectedSeatingNode !== null 
                    ? `${seatingPeaksTrends[selectedSeatingNode].activeTokens} Guests at ${seatingPeaksTrends[selectedSeatingNode].time}`
                    : `Peak: ${peakSeatingDisplay}`}
                </span>
              </div>

              <div className="flex flex-col space-y-2 mt-4 flex-1 justify-center overflow-x-auto custom-scrollbar">
                {seatingPeaksTrends.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-text-muted text-xs">
                    No active occupancy trends logged.
                  </div>
                ) : (
                  <div className="min-w-[280px]">
                    <div className="relative w-full h-[144px] flex items-end">
                      <svg className="w-full h-full" viewBox="0 0 500 144">
                        <defs>
                          <linearGradient id="goldAreaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        
                        {/* Grid lines */}
                        <line x1="0" y1="36" x2="500" y2="36" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                        <line x1="0" y1="72" x2="500" y2="72" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                        <line x1="0" y1="108" x2="500" y2="108" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                        
                        {/* Area */}
                        {lineChartPathData.areaPath && (
                          <path d={lineChartPathData.areaPath} fill="url(#goldAreaGradient)" />
                        )}
                        
                        {/* Line */}
                        {lineChartPathData.linePath && (
                          <path d={lineChartPathData.linePath} fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                        
                        {/* Dots */}
                        {lineChartPathData.points.map((p, idx) => {
                          const isPeak = p.value === maxActiveTokensVal;
                          const isSelected = selectedSeatingNode === idx;
                          return (
                            <g 
                              key={idx} 
                              onClick={() => setSelectedSeatingNode(selectedSeatingNode === idx ? null : idx)}
                              className="group/dot cursor-pointer"
                            >
                              {/* Large invisible hitbox circle for touch devices */}
                              <circle 
                                cx={p.x} 
                                cy={p.y} 
                                r="12" 
                                fill="transparent" 
                              />
                              <circle 
                                cx={p.x} 
                                cy={p.y} 
                                r={isSelected || isPeak ? "5.5" : "3.5"} 
                                fill={isSelected || isPeak ? "#F5E08B" : "#D4AF37"} 
                                stroke="#1c1c1e" 
                                strokeWidth="1.5"
                              />
                            </g>
                          );
                        })}
                      </svg>
                    </div>

                    {/* X-Axis labels row (Responsive filter hidden odd entries on mobile) */}
                    <div className="flex gap-2 pl-2 pr-2 pb-1 mt-1 text-[8px] font-mono text-text-muted font-bold">
                      {seatingPeaksTrends.map((trend, idx) => (
                        <span key={idx} className={`flex-1 text-center truncate ${idx % 2 === 0 ? 'inline' : 'hidden sm:inline'}`}>
                          {trend.time.replace(':00', '')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Chart Legend */}
              <div className="flex items-center justify-center gap-4 pt-3 mt-2 border-t border-border-main text-[9px] font-bold text-text-muted shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-0.5 bg-[#D4AF37]" />
                  <span>Guests In-House</span>
                </div>
              </div>
            </div>

          </div>

          {/* Recent Live Activities Timeline Card (1/3) */}
          <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-border-main flex flex-col justify-between min-h-[180px] lg:h-[340px]">
            <div className="flex items-center justify-between pb-3 border-b border-border-main shrink-0">
              <div className="flex items-center gap-2 text-text-main font-bold text-xs sm:text-sm">
                <Activity size={16} className="shrink-0 text-[#D4AF37]" /> <span>Recent Activities</span>
              </div>
              <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider shrink-0">Audit Stream</span>
            </div>

            <div className="flex-1 overflow-y-auto my-3 pr-1 custom-scrollbar">
              {activities.length === 0 ? (
                <div className="flex-1 flex items-center justify-center h-full text-text-muted text-xs py-6">
                  No recent activities recorded.
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 border-l border-border-main ml-3 py-1 text-left">
                  {activities.map((act) => (
                    <div key={act.id} className="relative text-[11px]">
                      <div className="absolute -left-[30px] top-1 w-2 h-2 rounded-full bg-[#D4AF37] border-2 border-bg-surface shadow-[0_0_8px_rgba(212,175,55,0.6)] z-10 animate-pulse" />
                      <div className="flex-1">
                        <p className="text-text-main font-medium leading-relaxed">{act.desc}</p>
                        <span className="text-[9px] text-text-muted font-mono block mt-0.5">{act.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Extension and Close Modals */}
      <ExtendSessionModal
        isOpen={extendingToken !== null}
        token={extendingToken!}
        rates={rates}
        onClose={() => setExtendingToken(null)}
        onSuccess={() => {
          setExtendingToken(null);
          refreshTokens();
          if (isManagement) {
            refreshAllSessions();
          }
        }}
      />

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
                  className="flex-1 py-3 rounded-xl dark:bg-red-500/20 bg-red-500/10 dark:hover:bg-red-600 hover:bg-red-600 dark:text-red-200 text-red-700 dark:hover:text-white hover:text-white text-xs font-bold uppercase tracking-wider border border-red-500/30 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/20"
                >
                  {isSubmittingClose ? 'Closing...' : 'Close & Release'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
