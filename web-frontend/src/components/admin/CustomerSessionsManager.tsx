import React, { useState, useEffect } from 'react';
import { Clock, Search, RefreshCw, LogOut, X, Eye } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

export const CustomerSessionsManager: React.FC = () => {
  const { showToast, isDark } = useAuth();
  const { allSessions, isLoading, refreshAllSessions, refreshTables } = useData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  // Fetch tokens and tables on component mount
  useEffect(() => {
    refreshAllSessions();
    refreshTables();
  }, []);

  // Close Session Modal State
  const [deactivatingToken, setDeactivatingToken] = useState<any | null>(null);
  const [closeReason, setCloseReason] = useState('Customer Vacated Early');
  const [closeReasonDetail, setCloseReasonDetail] = useState('');
  const [isSubmittingClose, setIsSubmittingClose] = useState(false);

  // Extend Session Modal State
  const [extendingToken, setExtendingToken] = useState<any | null>(null);
  const [extraMinutes, setExtraMinutes] = useState(20);
  const [additionalAmount, setAdditionalAmount] = useState(500);
  const [isSubmittingExtend, setIsSubmittingExtend] = useState(false);

  // History Details Modal State
  const [viewingHistoryToken, setViewingHistoryToken] = useState<any | null>(null);

  const handleDeactivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deactivatingToken) return;

    if (closeReason === 'Other / Administrative Closure' && !closeReasonDetail.trim()) {
      showToast('Please provide a short explanation for Other / Administrative Closure.', 'warning');
      return;
    }

    setIsSubmittingClose(true);
    try {
      await api.closeToken(deactivatingToken.tokenNumber, closeReason, closeReasonDetail);
      showToast(`Session ${deactivatingToken.tokenNumber} closed successfully.`, 'success');
      setDeactivatingToken(null);
      setCloseReason('Customer Vacated Early');
      setCloseReasonDetail('');
      refreshAllSessions();
      refreshTables();
    } catch (err: any) {
      showToast(err.message || 'Failed to close session.', 'danger');
    } finally {
      setIsSubmittingClose(false);
    }
  };

  const handleExtendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendingToken) return;

    setIsSubmittingExtend(true);
    try {
      await api.extendToken(extendingToken.tokenNumber, extraMinutes, additionalAmount, false, 'CASH');
      showToast(`Session ${extendingToken.tokenNumber} extended by ${extraMinutes} mins.`, 'success');
      setExtendingToken(null);
      refreshAllSessions();
    } catch (err: any) {
      showToast(err.message || 'Failed to extend session.', 'danger');
    } finally {
      setIsSubmittingExtend(false);
    }
  };

  const filteredTokens = allSessions.filter(t => {
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
            onClick={refreshAllSessions}
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
            <table className="w-full text-left text-xs min-w-[850px]">
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
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold badge-active uppercase">
                        {tk.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 flex items-center gap-2">
                      <button
                        onClick={() => setViewingHistoryToken(tk)}
                        className="px-2 py-1 rounded cursor-pointer dark:bg-bg-primary bg-bg-card hover:dark:bg-bg-card hover:bg-bg-primary dark:text-text-main text-text-main text-[10px] font-bold border border-border-main transition-all flex items-center gap-1 focus:outline-none"
                        title="View Complete Session History"
                      >
                        <Eye size={12} /> Details
                      </button>

                      {(tk.status.toLowerCase() === 'active' || tk.status.toLowerCase() === 'extended') && (
                        <>
                          <button
                            onClick={() => setExtendingToken(tk)}
                            className="px-2.5 py-1 rounded cursor-pointer dark:bg-amber-500/20 bg-amber-500/10 hover:dark:bg-amber-500/30 hover:bg-amber-500/20 dark:text-amber-300 text-amber-700 text-[10px] font-bold border border-amber-500/30 transition-all flex items-center gap-1 focus:outline-none"
                          >
                            <Clock size={12} /> Extend
                          </button>

                          <button
                            onClick={() => setDeactivatingToken(tk)}
                            className="px-2.5 py-1 rounded cursor-pointer dark:bg-red-500/20 bg-red-500/10 hover:dark:bg-red-500/30 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-800 active:bg-red-500/25 active:text-red-900 dark:text-red-400 text-red-700 text-[10px] font-bold border border-red-500/30 transition-all flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                          >
                            <LogOut size={12} /> Close
                          </button>
                        </>
                      )}
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
                className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-border-main bg-bg-primary disabled:opacity-50 transition-all hover:bg-bg-surface text-text-main cursor-pointer"
              >
                Prev
              </button>
              <div className="flex items-center gap-2 px-1 sm:px-2 text-text-main font-semibold">
                Page {currentPage} of {totalPages}
              </div>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-border-main bg-bg-primary disabled:opacity-50 transition-all hover:bg-bg-surface text-text-main cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* EXTEND SESSION MODAL */}
      {extendingToken && (
        <div className="fixed inset-0 z-[100] dark:bg-transparent bg-black/75 flex items-center justify-end p-0 animate-none">
          <div className="bg-bg-surface border border-border-main border-y-0 border-r-0 border-l-[1px] dark:border-[rgba(255,255,255,0.1)] dark:bg-[#121212] rounded-none p-5 w-full md:w-[380px] relative text-text-main h-[100dvh] pointer-events-auto flex flex-col">
            <button 
              onClick={() => setExtendingToken(null)}
              className="absolute top-4 sm:top-6 right-4 sm:right-6 text-text-muted hover:text-text-main bg-bg-surface rounded-full z-10 p-1.5 hover:bg-bg-card cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-start sm:items-center gap-2 dark:text-amber-400 text-amber-700 font-bold text-sm pr-8">
              <Clock size={18} className="shrink-0 mt-0.5 sm:mt-0" /> 
              <span>Admin Extend Session Time</span>
            </div>

            <p className="text-xs text-text-muted mt-1.5">
              Token Number: <span className="font-mono font-bold text-text-main">{extendingToken.tokenNumber}</span> ({extendingToken.customer?.name})
            </p>

            <form onSubmit={handleExtendSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Additional Minutes</label>
                <select
                  value={extraMinutes}
                  onChange={e => setExtraMinutes(Number(e.target.value))}
                  className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none dark:focus:border-[#8D6CE5] focus:border-primary"
                >
                  <option value={20}>20 Minutes</option>
                  <option value={25}>25 Minutes</option>
                  <option value={30}>30 Minutes</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Additional Fee (₹)</label>
                <input
                  type="number"
                  value={additionalAmount}
                  onChange={e => setAdditionalAmount(Number(e.target.value))}
                  className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none dark:focus:border-[#8D6CE5] focus:border-primary font-mono"
                  min={0}
                  required
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-3 sm:pt-4">
                <button
                  type="button"
                  onClick={() => setExtendingToken(null)}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl text-[11px] sm:text-xs font-semibold transition-all premium-btn-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExtend}
                  title={isSubmittingExtend ? "Request in progress" : undefined}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl primary-btn text-[11px] sm:text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  {isSubmittingExtend ? 'Extending...' : 'Confirm Extension'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLOSE SESSION MODAL */}
      {deactivatingToken && (
        <div className="fixed inset-0 z-[100] dark:bg-transparent bg-black/75 flex items-center justify-end p-0 animate-none">
          <div className="bg-bg-surface border border-border-main border-y-0 border-r-0 border-l-[1px] dark:border-[rgba(255,255,255,0.1)] dark:bg-[#121212] rounded-none p-5 w-full md:w-[380px] relative text-text-main h-[100dvh] pointer-events-auto flex flex-col">
            <button 
              onClick={() => setDeactivatingToken(null)}
              className="absolute top-4 sm:top-6 right-4 sm:right-6 text-text-muted hover:text-text-main bg-bg-surface rounded-full z-10 p-1.5 hover:bg-bg-card cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-start sm:items-center gap-2 dark:text-red-400 text-red-700 font-bold text-sm pr-8">
              <LogOut size={18} className="shrink-0 mt-0.5 sm:mt-0" /> 
              <span>Close Customer Session</span>
            </div>

            <p className="text-xs text-text-muted mt-1.5">
              Token Number: <span className="font-mono font-bold text-text-main">{deactivatingToken.tokenNumber}</span> ({deactivatingToken.customer?.name})
            </p>

            <form onSubmit={handleDeactivateSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Select Closure Reason <span className="text-red-500">*</span></label>
                <select
                  value={closeReason}
                  onChange={e => setCloseReason(e.target.value)}
                  className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-red-500"
                >
                  <option value="Customer Vacated Early">Customer Vacated Early</option>
                  <option value="Session Opened by Mistake">Session Opened by Mistake</option>
                  <option value="Other / Administrative Closure">Other / Administrative Closure</option>
                </select>
              </div>

              {closeReason === 'Other / Administrative Closure' && (
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Explanation <span className="text-red-500">*</span></label>
                  <textarea
                    value={closeReasonDetail}
                    onChange={e => setCloseReasonDetail(e.target.value)}
                    placeholder="Provide a brief explanation for closure..."
                    className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-red-500 h-20 resize-none"
                    maxLength={100}
                    required
                  />
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-3 sm:pt-4">
                <button
                  type="button"
                  onClick={() => setDeactivatingToken(null)}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl text-[11px] sm:text-xs font-semibold transition-all premium-btn-secondary cursor-pointer"
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
                  {isSubmittingClose ? 'Closing...' : 'Confirm Closure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW HISTORY / DETAILS MODAL */}
      {viewingHistoryToken && (
        <div className="fixed inset-0 z-[100] dark:bg-transparent bg-black/75 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-main dark:border-[rgba(255,255,255,0.1)] dark:bg-[#121212] rounded-3xl p-6 w-full max-w-2xl relative text-text-main max-h-[85vh] flex flex-col animate-fadeIn font-sans">
            <button 
              onClick={() => setViewingHistoryToken(null)}
              className="absolute top-4 right-4 text-text-muted hover:text-text-main bg-bg-surface rounded-full p-1.5 hover:bg-bg-card cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 text-primary font-bold text-base border-b border-border-main pb-3 mb-4">
              <Clock size={20} className="shrink-0 text-[#8D6CE5]" /> 
              <span>Session Audit History</span>
            </div>

            <div className="overflow-y-auto custom-scrollbar flex-1 space-y-5 pr-2">
              {/* Session Overview Card */}
              <div className="p-4 bg-bg-primary rounded-2xl border border-border-main space-y-2 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-text-muted block">Token Number</span>
                    <span className="font-mono font-bold text-text-main text-sm">{viewingHistoryToken.tokenNumber}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block">Customer Name</span>
                    <span className="font-semibold text-text-main">{viewingHistoryToken.customer?.name}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block">Phone Number</span>
                    <span className="font-mono font-semibold text-text-main">{viewingHistoryToken.customer?.phoneNumber}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block">Table Assigned</span>
                    <span className="font-bold text-text-main">{viewingHistoryToken.tableNumber ? `Table ${viewingHistoryToken.tableNumber}` : 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block">Status</span>
                    <span className="font-bold uppercase badge-active px-2 py-0.5 rounded-full inline-block mt-0.5 text-[10px]">
                      {viewingHistoryToken.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted block">Guests/Headcount</span>
                    <span className="font-semibold text-text-main">{viewingHistoryToken.personsCount} Guests</span>
                  </div>
                </div>
                <div className="border-t border-border-main/50 pt-2 grid grid-cols-2 gap-3 text-[11px] text-text-muted font-semibold">
                  <div>Started At: <span className="text-text-main">{new Date(viewingHistoryToken.createdAt).toLocaleString()}</span></div>
                  <div>Expires At: <span className="text-text-main">{new Date(viewingHistoryToken.expiresAt).toLocaleString()}</span></div>
                </div>
              </div>



              {/* Extension History */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Session Extension Logs</h4>
                {!viewingHistoryToken.extensions || viewingHistoryToken.extensions.length === 0 ? (
                  <div className="text-xs text-text-muted italic bg-bg-primary/30 p-3 rounded-xl border border-border-main/50 text-center">No extensions recorded for this session.</div>
                ) : (
                  <div className="space-y-2">
                    {viewingHistoryToken.extensions.map((ext: any, idx: number) => (
                      <div key={idx} className="p-3 bg-bg-primary rounded-xl border border-border-main text-xs flex flex-col sm:flex-row justify-between gap-2">
                        <div>
                          <div className="font-semibold text-text-main">Extension: <span className="text-primary">+{ext.extraMinutes} mins</span> | Amount Paid: <span className="font-bold text-text-main">₹{ext.additionalAmount}</span></div>
                          <div className="text-[11px] text-text-muted mt-0.5 font-semibold">Payment Method: <span className="text-text-main uppercase">{ext.paymentMethod || 'CASH'}</span></div>
                        </div>
                        <div className="text-right text-[11px] text-text-muted shrink-0 self-end sm:self-center">
                          <div>Time: <span className="text-text-main font-semibold">{new Date(ext.extendedAt).toLocaleString()}</span></div>
                          <div>Approved By: <span className="text-text-main font-semibold">{ext.approvedBy}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Closure Details */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Closure Details</h4>
                {viewingHistoryToken.status.toLowerCase() !== 'closed' ? (
                  <div className="text-xs text-text-muted italic bg-bg-primary/30 p-3 rounded-xl border border-border-main/50 text-center">Session is currently active.</div>
                ) : (
                  <div className="p-3 bg-bg-primary rounded-xl border border-border-main text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Closure Time:</span>
                      <span className="font-semibold text-text-main">{viewingHistoryToken.closedAt ? new Date(viewingHistoryToken.closedAt).toLocaleString() : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Closure Reason:</span>
                      <span className="font-bold text-red-500 uppercase">{viewingHistoryToken.closure?.closeReason || viewingHistoryToken.closeReason || 'MANUAL'}</span>
                    </div>
                    {viewingHistoryToken.closure?.reasonDetail && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Detail Description:</span>
                        <span className="font-semibold text-text-main max-w-xs text-right break-words">{viewingHistoryToken.closure.reasonDetail}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-text-muted">Closed By Operator:</span>
                      <span className="font-semibold text-text-main">{viewingHistoryToken.closedBy || 'N/A'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border-main pt-4 mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingHistoryToken(null)}
                className="px-5 py-2 rounded-xl bg-bg-primary hover:bg-bg-card text-xs font-semibold text-text-muted hover:text-text-main border border-border-main cursor-pointer"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
