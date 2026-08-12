import React, { useState, useEffect } from 'react';
import { DollarSign, Edit3, RefreshCw, X, Clock, Wine } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

export const RateManagement: React.FC = () => {
 const { showToast } = useAuth();
 const { rates: rawRates, isLoading, refreshRates } = useData();
 const [editingRate, setEditingRate] = useState<any | null>(null);

 // Fetch rates on component mount
 useEffect(() => {
 refreshRates();
 }, []);

 // Form State
 const [ratePerPerson, setRatePerPerson] = useState('500');
 const [durationHours, setDurationHours] = useState('2');
 const [drinkAllowance, setDrinkAllowance] = useState('2');
 const [isSubmitting, setIsSubmitting] = useState(false);

 const rates = rawRates.filter((r: any) => (r.id !== 'vip_lounge' && r.name !== 'VIP Lounge' && r.placeType !== 'VIP_LOUNGE'));

 const openEditModal = (r: any) => {
 setEditingRate(r);
 setRatePerPerson(String(r.ratePerPerson || 500));
 setDurationHours(String(Math.round((r.baseTimeMinutes || 120) / 60)));
 setDrinkAllowance(String(r.redemptionsPerPerson || 2));
 };

 // Validation rules matching AdminPortal.tsx:L293-L300
 const priceVal = parseFloat(ratePerPerson);
 const isPriceValid = !isNaN(priceVal) && priceVal >= 0;
 const durationVal = parseFloat(durationHours);
 const isDurationValid = !isNaN(durationVal) && durationVal >= 0.5 && durationVal <= 24;
 const drinksVal = parseInt(drinkAllowance, 10);
 const isDrinksValid = !isNaN(drinksVal) && drinksVal >= 0 && drinksVal <= 50;
 const isFormValid = isPriceValid && isDurationValid && isDrinksValid;

 const handleUpdateRate = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!editingRate || !isFormValid) return;

 setIsSubmitting(true);
 try {
 await api.updateRateCard(editingRate.id, {
 ratePerPerson: priceVal,
 baseTimeMinutes: Math.round(durationVal * 60),
 redemptionsPerPerson: drinksVal,
 });
 showToast(`Rate card for ${editingRate.name || editingRate.placeType} updated!`, 'success');
 setEditingRate(null);
 refreshRates();
 } catch (err: any) {
 showToast(err.message || 'Failed to update rate card.', 'danger');
 } finally {
 setIsSubmitting(false);
 }
 };

 return (
 <div className="space-y-6">
 {/* Top Header */}
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 dark:bg-transparent glass-panel border border-border-main border-x-0 border-t-0 rounded-none p-0 pb-4 mb-6">
 <div>
 <h3 className="text-sm font-bold text-text-main uppercase tracking-wider">Place Type Rate Cards & Pricing Config</h3>
 <p className="text-xs text-text-muted">Configure cover charge rates, base hours, and drink allowances</p>
 </div>

 <button
 onClick={refreshRates}
 className="w-full sm:w-auto justify-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-all premium-btn-secondary shrink-0"
 >
 <div className="nav-icon-badge">
 <RefreshCw size={12} />
 </div>
 <span className="hidden sm:inline">Refresh Rates</span>
 <span className="sm:hidden">Refresh</span>
 </button>
 </div>

 {/* Rates Cards Grid */}
 {isLoading ? (
 <div className="py-12 text-center text-text-muted text-sm">Loading rate cards...</div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
 {rates.map(r => (
 <div key={r.id} className="glass-panel dark:bg-[#1C1C1E] p-4 sm:p-6 rounded-3xl dark:rounded-xl border border-border-main dark:border-[rgba(255,255,255,0.1)] space-y-3 sm:space-y-4 relative overflow-hidden flex flex-col justify-between">
 <div>
 <div className="flex items-center justify-between mb-2">
 <span className="font-bold text-text-main text-base">{r.name || r.placeType}</span>
 <button
 onClick={() => openEditModal(r)}
 className="p-2 transition-all premium-btn-secondary flex items-center justify-center"
 title="Edit Rate Card"
 >
 <div className="nav-icon-badge m-0">
 <Edit3 size={12} />
 </div>
 </button>
 </div>

 <p className="text-3xl font-black dark:text-[#D4AF37] text-primary">₹{r.ratePerPerson} <span className="text-xs font-normal text-text-muted">/ person</span></p>

 <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border-main text-xs text-text-muted space-y-1.5 sm:space-y-2">
 <p className="flex items-center justify-between">
 <span className="text-text-muted flex items-center gap-1.5"><Clock size={14} /> Base Duration:</span>
 <span className="font-bold text-text-main">{Math.round((r.baseTimeMinutes || 120) / 60)} Hours</span>
 </p>
 <p className="flex items-center justify-between">
 <span className="text-text-muted flex items-center gap-1.5"><Wine size={14} /> Drink Allowance:</span>
 <span className="font-bold dark:text-amber-300 text-amber-700">{r.redemptionsPerPerson || 2} Drinks / Guest</span>
 </p>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* EDIT RATE CARD MODAL */}
 {editingRate && (
 <div className="fixed inset-0 z-50 dark:bg-transparent bg-black/75 flex items-center justify-end p-0 pointer-events-none animate-fadeIn">
 <div className="bg-bg-surface border border-border-main border-y-0 border-r-0 border-l-[1px] dark:border-[rgba(255,255,255,0.1)] dark:bg-[#121212] rounded-none p-5 w-full md:w-[380px] space-y-4 relative text-text-main animate-none h-[100dvh] pointer-events-auto flex flex-col">
 
 <div className="flex items-center justify-between pb-4 dark:pb-5 border-b border-border-main dark:border-[rgba(255,255,255,0.1)] shrink-0">
 <div className="flex items-center gap-2 text-text-main font-bold text-sm">
 <DollarSign size={18} className="shrink-0" /> Edit Rate Card ({editingRate.name || editingRate.placeType})
 </div>
 <button 
 onClick={() => setEditingRate(null)}
 className="p-0 rounded-lg dark:bg-transparent bg-bg-surface hover:bg-bg-card text-text-muted hover:text-text-main shrink-0 cursor-pointer"
 >
 <X size={18} />
 </button>
 </div>

 <div className="flex-1 overflow-y-auto py-5 space-y-4 no-scrollbar">
 <form onSubmit={handleUpdateRate} className="space-y-4">
 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1">Rate Per Person (₹)</label>
 <input
 type="number"
 value={ratePerPerson}
 onChange={e => setRatePerPerson(e.target.value)}
 min={0}
 className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main font-mono focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
 required
 />
 </div>

 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1">Base Duration (Hours: 0.5 - 24)</label>
 <input
 type="number"
 step="0.5"
 value={durationHours}
 onChange={e => setDurationHours(e.target.value)}
 min={0.5}
 max={24}
 className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main font-mono focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
 required
 />
 </div>

 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1">Drink Allowance Per Person (0 - 50)</label>
 <input
 type="number"
 value={drinkAllowance}
 onChange={e => setDrinkAllowance(e.target.value)}
 min={0}
 max={50}
 className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main font-mono focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
 required
 />
 </div>

 <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-border-main dark:border-[rgba(255,255,255,0.1)] shrink-0">
 <button
 type="button"
 onClick={() => setEditingRate(null)}
 className="flex-1 py-2.5 rounded-md bg-transparent border border-border-main dark:border-[rgba(255,255,255,0.1)] text-xs font-bold text-text-muted hover:text-text-main cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="submit"
 disabled={isSubmitting || !isFormValid}
 title={isSubmitting ? "Saving..." : !isFormValid ? "Fill all fields" : undefined}
 className="flex-1 py-2.5 rounded-md primary-btn text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer dark:text-black"
 >
 {isSubmitting ? 'Saving...' : (
 <>
 <span className="hidden sm:inline">Update Pricing</span>
 <span className="sm:hidden">Update</span>
 </>
 )}
 </button>
 </div>
 </form>
 </div>
 </div>
 </div>
 )}
 </div>
 );
};

