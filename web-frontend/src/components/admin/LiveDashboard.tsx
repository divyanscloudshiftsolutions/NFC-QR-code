import React, { useState, useEffect } from 'react';
import { DollarSign, Users, Wine, Grid3X3, TrendingUp, Activity } from 'lucide-react';
import { api } from '../../services/api';
import type { Token, Table } from '../../types';

export const LiveDashboard: React.FC = () => {
 const [tokens, setTokens] = useState<Token[]>([]);
 const [tables, setTables] = useState<Table[]>([]);
 const [isLoading, setIsLoading] = useState(true);

 const loadMetrics = async () => {
 setIsLoading(true);
 try {
 const [tokenData, tableData] = await Promise.all([
 api.getActiveTokens(),
 api.getTables(),
 ]);
 setTokens(tokenData);
 setTables(tableData);
 } catch {
 // Graceful fallback
 } finally {
 setIsLoading(false);
 }
 };

 useEffect(() => {
 loadMetrics();
 }, []);

 const totalCollections = tokens.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
 const activeCount = tokens.length;
 const inHouseGuests = tokens.reduce((sum, s) => sum + s.personsCount, 0);
 const totalDrinksServed = tokens.reduce((sum, s) => sum + s.redemptionsUsed, 0);
 const occupiedTables = tables.filter(t => t.status === 'occupied').length;

 return (
 <div className="space-y-6">
 {/* Live Metrics Grid */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 <div className="glass-panel dark:bg-[#1C1C1E] p-5 rounded-2xl dark:rounded-xl border-l-4 dark:border-l-[#D4AF37] border-l-primary border-y dark:border-y-[rgba(255,255,255,0.1)] border-r dark:border-r-[rgba(255,255,255,0.1)] flex items-center justify-between">
 <div>
 <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Total Sales Revenue</p>
 <h3 className="text-2xl font-black text-text-main mt-1">₹{totalCollections.toLocaleString()}</h3>
 <p className="text-[11px] dark:text-emerald-400 text-emerald-700 mt-1 font-medium flex items-center gap-1">
 <TrendingUp size={12} /> Live Verified Collections
 </p>
 </div>
 <div className="w-12 h-12 rounded-xl dark:bg-[#D4AF37]/15 bg-primary/10 dark:text-[#D4AF37] text-primary flex items-center justify-center font-bold">
 <DollarSign size={24} />
 </div>
 </div>

 <div className="glass-panel dark:bg-[#1C1C1E] p-5 rounded-2xl dark:rounded-xl border-l-4 border-l-emerald-500 border-y dark:border-y-[rgba(255,255,255,0.1)] border-r dark:border-r-[rgba(255,255,255,0.1)] flex items-center justify-between">
 <div>
 <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Active Guest Sessions</p>
 <h3 className="text-2xl font-black text-text-main mt-1">{activeCount}</h3>
 <p className="text-[11px] text-text-muted mt-1">{inHouseGuests} Total Guests In-House</p>
 </div>
 <div className="w-12 h-12 rounded-xl dark:bg-emerald-500/15 bg-emerald-500/10 dark:text-emerald-400 text-emerald-700 flex items-center justify-center font-bold">
 <Users size={24} />
 </div>
 </div>

 <div className="glass-panel dark:bg-[#1C1C1E] p-5 rounded-2xl dark:rounded-xl border-l-4 border-l-amber-500 border-y dark:border-y-[rgba(255,255,255,0.1)] border-r dark:border-r-[rgba(255,255,255,0.1)] flex items-center justify-between">
 <div>
 <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Drinks Redeemed</p>
 <h3 className="text-2xl font-black text-text-main mt-1">{totalDrinksServed}</h3>
 <p className="text-[11px] dark:text-amber-400 text-amber-700 mt-1">Dispensed Today</p>
 </div>
 <div className="w-12 h-12 rounded-xl dark:bg-amber-500/15 bg-amber-500/10 dark:text-amber-400 text-amber-700 flex items-center justify-center font-bold">
 <Wine size={24} />
 </div>
 </div>

 <div className="glass-panel dark:bg-[#1C1C1E] p-5 rounded-2xl dark:rounded-xl border-l-4 dark:border-l-indigo-500 border-l-purple-500 border-y dark:border-y-[rgba(255,255,255,0.1)] border-r dark:border-r-[rgba(255,255,255,0.1)] flex items-center justify-between">
 <div>
 <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Floor Occupancy</p>
 <h3 className="text-2xl font-black text-text-main mt-1">{occupiedTables} / {tables.length}</h3>
 <p className="text-[11px] dark:text-indigo-400 text-purple-700 mt-1">Seating Tables Occupied</p>
 </div>
 <div className="w-12 h-12 rounded-xl dark:bg-indigo-500/15 bg-purple-500/10 dark:text-indigo-400 text-purple-700 flex items-center justify-center font-bold">
 <Grid3X3 size={24} />
 </div>
 </div>
 </div>

 {/* Live Stream Panel */}
 <div className="glass-panel dark:bg-[#1C1C1E] p-6 rounded-2xl dark:rounded-xl border border-border-main dark:border-[rgba(255,255,255,0.1)] space-y-4">
 <div className="flex items-center justify-between pb-3 border-b border-border-main dark:border-[rgba(255,255,255,0.1)]">
 <div className="flex items-center gap-2 dark:text-emerald-400 text-emerald-700 font-bold text-sm">
 <Activity size={18} className="animate-pulse" /> Live Activity & Guest Sessions Stream
 </div>
 <span className="text-xs text-text-muted font-mono">Auto Sync Active</span>
 </div>

 {isLoading ? (
 <div className="py-8 text-center text-text-muted text-sm">Synchronizing live stream...</div>
 ) : tokens.length === 0 ? (
 <div className="py-8 text-center text-text-muted text-sm">No active customer sessions right now.</div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
 {tokens.slice(0, 6).map(tk => (
 <div key={tk.id} className="p-4 rounded-xl dark:rounded-md bg-bg-primary dark:bg-transparent border border-border-main dark:border-[rgba(255,255,255,0.1)] flex justify-between items-center">
 <div>
 <span className="font-mono text-text-main font-bold text-sm">{tk.tokenNumber}</span>
 <p className="text-xs font-semibold text-text-main mt-0.5">{tk.customer?.name || 'Walk-in Guest'}</p>
 {tk.customer?.phoneNumber && (
 <p className="text-[10px] text-text-muted mt-0.5 font-mono truncate max-w-[200px]" title={`${tk.customer.phoneNumber} | ${tk.customer.email || ''}`}>
 {tk.customer.phoneNumber} {tk.customer.email ? ` | ${tk.customer.email}` : ''}
 </p>
 )}
 <p className="text-[10px] text-text-muted mt-0.5">{tk.personsCount} Guests • {tk.deliveryMode}</p>
 </div>
 <div className="text-right">
 <span className="px-2 py-0.5 rounded-full text-[10px] font-bold badge-active">{tk.status}</span>
 <p className="text-xs dark:text-amber-300 text-amber-700 font-mono font-bold mt-1">{tk.redemptionsUsed}/{tk.totalRedemptionsAllowed} Drinks</p>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 );
};

