import React, { useState, useEffect } from 'react';
import { Clock, Search, RefreshCw, LogOut, X } from 'lucide-react';
import { api } from '../../services/api';
import type { Token } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

export const CustomerSessionsManager: React.FC = () => {
  const { showToast, isDark } = useAuth();
  const { tokens, isLoading, refreshTokens, refreshTables } = useData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  // Fetch tokens and tables on component mount
  useEffect(() => {
    refreshTokens();
    refreshTables();
  }, []);

  // Deactivate Session Modal State
  const [deactivatingToken, setDeactivatingToken] = useState<Token | null>(null);
  const [closeReason, setCloseReason] = useState('CHECKOUT');
  const [isSubmittingClose, setIsSubmittingClose] = useState(false);

  // Extend Session Modal State
  const [extendingToken, setExtendingToken] = useState<Token | null>(null);
  const [extraMinutes, setExtraMinutes] = useState(60);
  const [additionalAmount, setAdditionalAmount] = useState(500);
  const [isSubmittingExtend, setIsSubmittingExtend] = useState(false);

  const handleDeactivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deactivatingToken) return;

    setIsSubmittingClose(true);
    try {
      await api.closeToken(deactivatingToken.tokenNumber, closeReason);
      showToast(`Session ${deactivatingToken.tokenNumber} deactivated successfully.`, 'success');
      setDeactivatingToken(null);
      refreshTokens();
      refreshTables();
    } catch (err: any) {
      showToast(err.message || 'Failed to deactivate session.', 'danger');
    } finally {
      setIsSubmittingClose(false);
    }
  };

  const handleExtendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendingToken) return;

    setIsSubmittingExtend(true);
    try {
      await api.extendToken(extendingToken.tokenNumber, extraMinutes, additionalAmount);
      showToast(`Session ${extendingToken.tokenNumber} extended by ${extraMinutes} mins.`, 'success');
      setExtendingToken(null);
      refreshTokens();
    } catch (err: any) {
      showToast(err.message || 'Failed to extend session.', 'danger');
    } finally {
      setIsSubmittingExtend(false);
    }
  };

  const filteredTokens = tokens.filter(t => {
    const query = search.toLowerCase();
    const matchesSearch = 
      t.tokenNumber.toLowerCase().includes(query) ||
      (t.customer?.name || '').toLowerCase().includes(query) ||
      (t.customer?.phoneNumber || '').includes(query) ||
      (t.customer?.email || '').toLowerCase().includes(query);

    const matchesFilter = statusFilter === 'all' || (t.status || '').toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filteredTokens.length / itemsPerPage);
  const paginatedTokens = filteredTokens.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 dark:bg-transparent glass-panel border border-border-main border-x-0 border-t-0 rounded-none p-0 pb-4 mb-6">
        <div className="relative w-full md:w-auto md:flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 text-text-muted" size={16} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search token, name, or phone..."
            className="w-full bg-bg-primary border border-border-main rounded-xl pl-10 pr-4 py-2 text-xs text-text-main placeholder-gray-500 focus:outline-none dark:focus:border-[#8D6CE5] focus:border-primary"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 w-full md:w-auto">
          <div className="flex flex-nowrap overflow-x-auto custom-scrollbar gap-2 w-full sm:w-auto pb-1 sm:pb-0">
            {['all', 'active', 'extended', 'expired', 'closed'].map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all premium-tab-secondary active:scale-95 shrink-0 whitespace-nowrap ${
                  statusFilter === f ? 'active' : ''
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <button
            onClick={refreshTokens}
            className="w-full sm:w-auto justify-center px-3 sm:px-4 py-2 text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-all premium-btn-secondary shrink-0 whitespace-nowrap"
          >
            <div className="nav-icon-badge">
              <RefreshCw size={12} />
            </div>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Customer Sessions Directory Table */}
      <div className="glass-panel rounded-2xl p-3 sm:p-6 border border-border-main">
        {isLoading ? (
          <div className="py-12 text-center text-text-muted text-sm">Loading customer sessions...</div>
        ) : filteredTokens.length === 0 ? (
          <div className="py-12 text-center text-text-muted text-sm">No customer sessions found.</div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0">
            <table className="w-full text-left text-xs min-w-[800px]">
              <thead>
                <tr className="border-b border-border-main text-text-muted uppercase font-semibold text-[10px] tracking-wider">
                  <th className="pb-3 px-3">Token #</th>
                  <th className="pb-3 px-3">Customer Name</th>
                  <th className="pb-3 px-3">Contact Details</th>
                  <th className="pb-3 px-3">Guests</th>
                  <th className="pb-3 px-3">Redemptions</th>
                  <th className="pb-3 px-3">Delivery Mode</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-main">
                {paginatedTokens.map(tk => (
                  <tr key={tk.id} className="hover:bg-bg-primary transition-colors">
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
                    <td className="py-3 px-3 font-semibold text-text-main">{tk.personsCount} Guests</td>
                    <td className="py-3 px-3">
                      <span className="font-mono dark:text-amber-300 text-amber-700 font-bold">{tk.redemptionsUsed}</span> / {tk.totalRedemptionsAllowed} Drinks
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-bg-card text-text-muted border border-border-main">
                        {tk.deliveryMode}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold badge-active">
                        {tk.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 flex items-center gap-2">
                      <button
                        onClick={() => setExtendingToken(tk)}
                        className="px-2.5 py-1 rounded cursor-pointer dark:bg-amber-500/20 bg-amber-500/10 hover:dark:bg-amber-500/30 hover:bg-amber-500/20 dark:text-amber-300 text-amber-700 text-[10px] font-bold border border-amber-500/30 transition-all flex items-center gap-1"
                      >
                        <Clock size={12} /> Extend
                      </button>

                      <button
                        onClick={() => setDeactivatingToken(tk)}
                        className="px-2.5 py-1 rounded cursor-pointer dark:bg-red-500/20 bg-red-500/10 hover:dark:bg-red-500/30 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-800 active:bg-red-500/25 active:text-red-900 dark:text-red-400 text-red-700 text-[10px] font-bold border border-red-500/30 transition-all flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                      >
                        <LogOut size={12} /> Deactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination UI */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border-main text-xs">
            <span className="text-text-muted text-center sm:text-left">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredTokens.length)} of {filteredTokens.length} sessions
            </span>
            <div className="flex gap-1.5 sm:gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-border-main bg-bg-primary disabled:opacity-50 transition-all hover:bg-bg-surface text-text-main"
              >
                Prev
              </button>
              <div className="flex items-center gap-2 px-1 sm:px-2 text-text-main font-semibold">
                Page {currentPage} of {totalPages}
              </div>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-border-main bg-bg-primary disabled:opacity-50 transition-all hover:bg-bg-surface text-text-main"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* EXTEND SESSION MODAL */}
      {extendingToken && (
        <div className="fixed inset-0 z-[100] dark:bg-transparent bg-black/75 flex items-center justify-end p-0">
          <div className="bg-bg-surface border border-border-main border-y-0 border-r-0 border-l-[1px] dark:border-[rgba(255,255,255,0.1)] dark:bg-[#121212] rounded-none p-5 w-full md:w-[380px] relative text-text-main animate-none h-[100dvh] pointer-events-auto flex flex-col">
            <button 
              onClick={() => setExtendingToken(null)}
              className="absolute top-4 sm:top-6 right-4 sm:right-6 text-text-muted hover:text-text-main bg-bg-surface rounded-full z-10 p-0 hover:bg-bg-card"
            >
              <X size={18} />
            </button>

            <div className="flex items-start sm:items-center gap-2 dark:text-amber-400 text-amber-700 font-bold text-sm pr-8">
              <Clock size={18} className="shrink-0 mt-0.5 sm:mt-0" /> 
              <span>Admin Extend Session Time</span>
            </div>

            <p className="text-xs text-text-muted">
              Token Number: <span className="font-mono font-bold text-text-main">{extendingToken.tokenNumber}</span> ({extendingToken.customer?.name})
            </p>

            <form onSubmit={handleExtendSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Additional Minutes</label>
                <select
                  value={extraMinutes}
                  onChange={e => setExtraMinutes(Number(e.target.value))}
                  className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none dark:focus:border-[#8D6CE5] focus:border-primary"
                >
                  <option value={30}>30 Minutes</option>
                  <option value={60}>60 Minutes (1 Hour)</option>
                  <option value={120}>120 Minutes (2 Hours)</option>
                  <option value={180}>180 Minutes (3 Hours)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Additional Fee (₹)</label>
                <input
                  type="number"
                  value={additionalAmount}
                  onChange={e => setAdditionalAmount(Number(e.target.value))}
                  className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main font-mono focus:outline-none dark:focus:border-[#8D6CE5] focus:border-primary"
                  required
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-3 sm:pt-4">
                <button
                  type="button"
                  onClick={() => setExtendingToken(null)}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl text-[11px] sm:text-xs font-semibold transition-all premium-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExtend}
                  title={isSubmittingExtend ? "Request in progress" : undefined}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl primary-btn text-[11px] sm:text-xs font-bold uppercase tracking-wider"
                >
                  {isSubmittingExtend ? 'Extending...' : (
                    <>
                      <span className="hidden sm:inline">Confirm Extension</span>
                      <span className="sm:hidden">Confirm</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEACTIVATE SESSION MODAL */}
      {deactivatingToken && (
        <div className="fixed inset-0 z-[100] dark:bg-transparent bg-black/75 flex items-center justify-end p-0">
          <div className="bg-bg-surface border border-border-main border-y-0 border-r-0 border-l-[1px] dark:border-[rgba(255,255,255,0.1)] dark:bg-[#121212] rounded-none p-5 w-full md:w-[380px] relative text-text-main animate-none h-[100dvh] pointer-events-auto flex flex-col">
            <button 
              onClick={() => setDeactivatingToken(null)}
              className="absolute top-4 sm:top-6 right-4 sm:right-6 text-text-muted hover:text-text-main bg-bg-surface rounded-full z-10 p-0 hover:bg-bg-card"
            >
              <X size={18} />
            </button>

            <div className="flex items-start sm:items-center gap-2 dark:text-red-400 text-red-700 font-bold text-sm pr-8">
              <LogOut size={18} className="shrink-0 mt-0.5 sm:mt-0" /> 
              <span>Admin Deactivate Session</span>
            </div>

            <p className="text-xs text-text-muted">
              Token Number: <span className="font-mono font-bold text-text-main">{deactivatingToken.tokenNumber}</span> ({deactivatingToken.customer?.name})
            </p>

            <form onSubmit={handleDeactivateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Select Deactivation Reason</label>
                <select
                  value={closeReason}
                  onChange={e => setCloseReason(e.target.value)}
                  className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-red-500"
                >
                  <option value="CHECKOUT">Standard Guest Checkout</option>
                  <option value="EXPIRED">Session Time Expired</option>
                  <option value="CANCELLED">Deactivated by Admin</option>
                </select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-3 sm:pt-4">
                <button
                  type="button"
                  onClick={() => setDeactivatingToken(null)}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl text-[11px] sm:text-xs font-semibold transition-all premium-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingClose}
                  title={isSubmittingClose ? "Request in progress" : undefined}
                  className={`flex-1 py-2.5 sm:py-3 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    isDark ? 'primary-btn bg-red-500' : 'bg-red-500/10 text-red-700 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-800 active:bg-red-500/25 active:text-red-900 border border-red-500/30 focus:outline-none focus:ring-2 focus:ring-red-500/20'
                  }`}
                >
                  {isSubmittingClose ? 'Deactivating...' : (
                    <>
                      <span className="hidden sm:inline">Confirm Deactivation</span>
                      <span className="sm:hidden">Deactivate</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

