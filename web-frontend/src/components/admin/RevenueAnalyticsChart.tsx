import React, { useState, useEffect } from 'react';
import { BarChart3, Download, TrendingUp } from 'lucide-react';
import { api } from '../../services/api';
import type { Token } from '../../types';
import { useAuth } from '../../context/AuthContext';

export const RevenueAnalyticsChart: React.FC = () => {
 const { showToast, isDark } = useAuth();
 const [tokens, setTokens] = useState<Token[]>([]);

 const loadData = async () => {
 try {
 const data = await api.getActiveTokens();
 setTokens(data);
 } catch {
 // Graceful fallback
 }
 };

 useEffect(() => {
 loadData();
 }, []);

 // Hourly Breakdown matching AdminPortal.tsx:L309
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

 const handleExportCSV = () => {
 try {
 const headers = 'TokenNumber,CustomerName,PhoneNumber,EmailAddress,Persons,RedemptionsUsed,TotalRedemptions,DeliveryMode,AmountPaid,Status\n';
 const rows = tokens.map(t => 
 `"${t.tokenNumber}","${t.customer?.name || ''}","${t.customer?.phoneNumber || ''}","${t.customer?.email || ''}",${t.personsCount},${t.redemptionsUsed},${t.totalRedemptionsAllowed},"${t.deliveryMode}",${t.amountPaid || 0},"${t.status}"`
 ).join('\n');

 const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.setAttribute('download', `sessions_export_${Date.now()}.csv`);
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);

 showToast('Sessions export CSV downloaded successfully!', 'success');
 } catch (err: any) {
 showToast('Failed to export CSV logs.', 'danger');
 }
 };

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
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3 pb-3 border-b border-border-main">
 <div className="flex items-center gap-2 text-text-main font-bold text-sm animate-fadeIn min-w-0 w-full sm:w-auto">
 <BarChart3 size={18} className="shrink-0" /> <span className="truncate">Hourly Revenue Breakdown & Peak Collections</span>
 </div>
 <span className="text-xs font-bold dark:text-emerald-400 text-emerald-700 flex items-center gap-1 shrink-0">
 <TrendingUp size={14} /> Peak Hour: 10:00 PM (₹94,800)
 </span>
 </div>

 <div className="overflow-x-auto custom-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0">
 <div className="flex gap-4 items-stretch h-64 mt-4 min-w-[500px]">
 {/* Y-Axis Labels Column */}
 <div className="flex flex-col justify-between text-[10px] font-mono text-text-muted font-bold py-3.5 select-none text-right w-10">
 <span>₹100k</span>
 <span>₹75k</span>
 <span>₹50k</span>
 <span>₹25k</span>
 <span>₹0</span>
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
 <div className="relative z-10 flex items-end justify-between gap-3 h-full">
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

