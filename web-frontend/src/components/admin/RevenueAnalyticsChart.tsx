import React, { useEffect, useMemo } from 'react';
import { BarChart3, Download, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

export const RevenueAnalyticsChart: React.FC = () => {
  const { showToast, isDark } = useAuth();
  const { allSessions, isLoading, refreshAllSessions } = useData();

  useEffect(() => {
    refreshAllSessions();
  }, []);

  const today = useMemo(() => new Date(), []);
  const targetYear = today.getFullYear();
  const targetMonth = today.getMonth();
  const targetDate = today.getDate();

  const isToday = (dateInput: string | Date | undefined) => {
    if (!dateInput) return false;
    const d = new Date(dateInput);
    return d.getFullYear() === targetYear &&
           d.getMonth() === targetMonth &&
           d.getDate() === targetDate;
  };

  // Filter valid revenue-generating tokens/sessions for today
  const todayRevenueTokens = useMemo(() => {
    return allSessions.filter(t => {
      // paymentVerified must be true and status must not be CANCELLED
      if (!t.paymentVerified || String(t.status).toUpperCase() === 'CANCELLED') {
        return false;
      }
      const startIsToday = isToday(t.startTime);
      const hasTodayExtension = t.extensions?.some((ext: any) => isToday(ext.extendedAt));
      return startIsToday || hasTodayExtension;
    });
  }, [allSessions, targetYear, targetMonth, targetDate]);

  // Aggregate hourly revenue buckets for the chart (continuous operational window: 6 PM to 1 AM)
  const hourlyData = useMemo(() => {
    const template = [
      { hour: '6 PM', amount: 0, hourInt: 18, peak: false },
      { hour: '7 PM', amount: 0, hourInt: 19, peak: false },
      { hour: '8 PM', amount: 0, hourInt: 20, peak: false },
      { hour: '9 PM', amount: 0, hourInt: 21, peak: false },
      { hour: '10 PM', amount: 0, hourInt: 22, peak: false },
      { hour: '11 PM', amount: 0, hourInt: 23, peak: false },
      { hour: '12 AM', amount: 0, hourInt: 0, peak: false },
      { hour: '1 AM', amount: 0, hourInt: 1, peak: false },
    ];

    const mapHourToBucketIndex = (hour: number) => {
      if (hour >= 18 && hour <= 23) {
        return hour - 18;
      }
      if (hour === 0 || hour === 1) {
        return hour + 6;
      }
      return -1;
    };

    todayRevenueTokens.forEach(t => {
      // 1. Cover Charge: occurs at session startTime
      if (isToday(t.startTime)) {
        const startHour = new Date(t.startTime).getHours();
        const idx = mapHourToBucketIndex(startHour);
        if (idx !== -1) {
          template[idx].amount += Number(t.amountPaid || 0);
        }
      }

      // 2. Extensions: occurs at extension extendedAt time
      if (t.extensions && Array.isArray(t.extensions)) {
        t.extensions.forEach((ext: any) => {
          if (isToday(ext.extendedAt)) {
            const extHour = new Date(ext.extendedAt).getHours();
            const idx = mapHourToBucketIndex(extHour);
            if (idx !== -1) {
              template[idx].amount += Number(ext.additionalAmount || 0);
            }
          }
        });
      }
    });

    // Find the peak hour index dynamically
    let peakIndex = -1;
    let maxAmount = 0;
    template.forEach((item, index) => {
      if (item.amount > maxAmount) {
        maxAmount = item.amount;
        peakIndex = index;
      }
    });

    if (peakIndex !== -1 && maxAmount > 0) {
      template[peakIndex].peak = true;
    }

    return template;
  }, [todayRevenueTokens, targetYear, targetMonth, targetDate]);

  const { peakHourName, peakAmount } = useMemo(() => {
    const peakItem = hourlyData.find(d => d.peak);
    return {
      peakHourName: peakItem ? peakItem.hour : 'N/A',
      peakAmount: peakItem ? peakItem.amount : 0
    };
  }, [hourlyData]);

  const maxVal = useMemo(() => {
    const amt = Math.max(...hourlyData.map(d => d.amount));
    return amt > 0 ? amt : 1; // Prevent division by zero
  }, [hourlyData]);

  const yAxisLabels = useMemo(() => {
    const formatYLabel = (val: number) => {
      if (val >= 100000) return `₹${(val / 1000).toFixed(0)}k`;
      if (val >= 1000) return `₹${(val / 1000).toFixed(1)}k`;
      return `₹${Math.round(val)}`;
    };
    return [
      formatYLabel(maxVal),
      formatYLabel(maxVal * 0.75),
      formatYLabel(maxVal * 0.5),
      formatYLabel(maxVal * 0.25),
      formatYLabel(0)
    ];
  }, [maxVal]);

  const handleExportCSV = () => {
    try {
      const headers = 'TokenNumber,CustomerName,PhoneNumber,EmailAddress,Persons,RedemptionsUsed,TotalRedemptions,DeliveryMode,AmountPaid,TodayRevenueContribution,Status\n';
      const rows = todayRevenueTokens.map(t => {
        const baseRev = isToday(t.startTime) ? Number(t.amountPaid || 0) : 0;
        const extRev = (t.extensions || []).reduce((sum: number, ext: any) => {
          return sum + (isToday(ext.extendedAt) ? Number(ext.additionalAmount || 0) : 0);
        }, 0);
        const totalSessionTodayRevenue = baseRev + extRev;

        const custName = t.customerName || t.customer?.name || '';
        const phone = t.phoneNumber || t.customer?.phoneNumber || '';
        const email = t.email || t.customer?.email || '';
        const persons = t.persons || t.personsCount || 0;
        const redemptions = t.redemptionCount || t.redemptionsUsed || 0;
        const totalRed = t.redemptionLimit || t.totalRedemptionsAllowed || 0;
        const mode = t.deliveryMode || '';
        const amt = t.amountPaid || 0;
        const status = t.status || '';

        return `"${t.tokenNumber}","${custName}","${phone}","${email}",${persons},${redemptions},${totalRed},"${mode}",${amt},${totalSessionTodayRevenue},"${status}"`;
      }).join('\n');

      const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `revenue_report_${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDate).padStart(2, '0')}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('Revenue sessions export CSV downloaded successfully!', 'success');
    } catch (err: any) {
      showToast('Failed to export CSV logs.', 'danger');
    }
  };

  const peakText = peakAmount > 0 
    ? `Peak Hour: ${peakHourName} (₹${peakAmount.toLocaleString()})`
    : 'No sales recorded today';

  return (
    <div className="space-y-6">
      {/* Action Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 glass-panel p-3 sm:p-4 rounded-2xl border border-border-main">
        <div>
          <h3 className="text-sm font-bold text-text-main uppercase tracking-wider">Revenue Analytics & Sales Summary</h3>
          <p className="text-xs text-text-muted">Peak hour analysis and financial collections</p>
        </div>

        <button
          onClick={handleExportCSV}
          className="w-full sm:w-auto justify-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl primary-btn text-[11px] sm:text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0"
        >
          <Download size={14} className="sm:w-4 sm:h-4" /> 
          <span className="hidden sm:inline">Export Sessions CSV</span>
          <span className="sm:hidden">Export CSV</span>
        </button>
      </div>

      {/* Hourly Sales Bar Chart Component */}
      <div className="glass-panel p-3 sm:p-6 rounded-2xl border border-border-main space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 md:gap-3 pb-3 border-b border-border-main">
          <div className="flex items-center gap-2 text-text-main font-bold text-sm animate-fadeIn min-w-0 w-full md:w-auto">
            <BarChart3 size={18} className="shrink-0" /> <span className="truncate">Hourly Revenue Breakdown & Peak Collections</span>
          </div>
          <span className="text-xs font-bold dark:text-emerald-400 text-emerald-700 flex items-center gap-1 shrink-0">
            <TrendingUp size={14} /> {peakText}
          </span>
        </div>

        <div className="overflow-x-auto custom-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0">
  <div className="flex gap-2 sm:gap-4 items-stretch h-64 mt-4 min-w-[420px] sm:min-w-[500px]">
  {/* Y-Axis Labels Column */}
  <div className="flex flex-col justify-between text-[10px] font-mono text-text-muted font-bold py-3.5 select-none text-right w-10 shrink-0">
  {yAxisLabels.map((lbl, idx) => (
    <span key={idx}>{lbl}</span>
  ))}
  </div>

  {/* Chart Content Base Grid Area */}
  <div className="flex-1 relative border-l border-b border-border-main/60 pb-6 px-1.5">
  {/* Background Grid lines */}
  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none select-none pb-6">
  <div className="w-full border-t border-border-main/20 h-0" />
  <div className="w-full border-t border-border-main/20 h-0" />
  <div className="w-full border-t border-border-main/20 h-0" />
  <div className="w-full border-t border-border-main/20 h-0" />
  <div className="w-full h-0" />
  </div>

  {/* Columns Container */}
  <div className="relative z-10 flex items-end justify-between gap-1.5 sm:gap-3 h-full">
 {hourlyData.map(d => {
 const heightPercent = Math.round((d.amount / maxVal) * 100);
 return (
 <div key={d.hour} className="group flex-1 flex flex-col items-center h-full justify-end relative">
 
 {/* Hover Floating Tooltip Popup */}
 <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-30 transition-all duration-200">
 <div className="dark:bg-bg-surface bg-zinc-900 dark:border-border-main border-zinc-800 px-3 py-2 rounded-xl text-[10px] whitespace-nowrap dark:text-text-main text-white font-bold">
 <p className="dark:text-text-muted text-zinc-400">Hour: {d.hour}</p>
 <p className="dark:text-[#D4AF37] text-primary font-black text-xs mt-0.5">₹{d.amount.toLocaleString()}</p>
 <p className="text-[9px] dark:text-text-muted text-zinc-400 font-medium mt-0.5">
 {d.peak ? '🔥 Peak Hour' : 'Regular Shift'}
 </p>
 </div>
 <div className="w-2 h-2 dark:bg-bg-surface bg-zinc-900 border-r border-b dark:border-border-main border-zinc-800 rotate-45 -mt-1" />
 </div>

 {/* Numerical Label on top of the Bar */}
 <span className="text-[9px] font-mono text-text-muted font-bold mb-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
 ₹{(d.amount / 1000).toFixed(0)}k
 </span>

 {/* Bar Visual Element */}
 <div 
 onClick={() => showToast(`Hour: ${d.hour} - Revenue: ₹${d.amount.toLocaleString()}${d.peak ? ' (Peak)' : ''}`, 'info')}
 style={{ height: `${heightPercent * 0.8}%` }}
 className={`w-full rounded-t-xl transition-all duration-300 cursor-pointer ${
 d.peak 
 ? 'bg-gradient-to-t from-[#D4AF37] to-[#F5E08B] hover:scale-105 active:scale-95' 
 : 'analytics-bar-regular hover:scale-105 active:scale-95'
 }`}
 />
 
 {/* X-Axis Tick Label */}
 <span className={`text-[10px] font-bold absolute top-full mt-2.5 whitespace-nowrap select-none ${
 d.peak ? (isDark ? 'text-[#D4AF37]' : 'text-primary') : 'text-text-muted'
 }`}>
 {d.hour}
 </span>
 </div>
 );
 })}
 </div>
 </div>
 </div>
 </div>

 {/* Chart Legend Footer */}
 <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 pt-3 sm:pt-4 border-t border-border-main text-[10px] sm:text-[11px] font-bold text-text-muted select-none">
 <div className="flex items-center gap-1.5 sm:gap-2">
 <div className="w-3 h-3 rounded bg-gradient-to-t from-[#D4AF37] to-[#F5E08B]" />
 <span>Peak Hour Revenue</span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded analytics-bar-regular" />
 <span>Regular Shift Revenue</span>
 </div>
 </div>
 </div>
 </div>
 );
};

