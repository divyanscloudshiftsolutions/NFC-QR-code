import React, { useState, useEffect, useRef } from 'react';
import { Clock, X, Mail } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Token } from '../../types';

interface ExtendSessionModalProps {
  isOpen: boolean;
  token: Token | null;
  rates: any[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ExtendSessionModal: React.FC<ExtendSessionModalProps> = ({
  isOpen,
  token,
  rates,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useAuth();

  const [selectedOption, setSelectedOption] = useState<string>('20');
  const [customHours, setCustomHours] = useState<number>(1);
  const [customMinutes, setCustomMinutes] = useState<number>(0);
  const [customAmount, setCustomAmount] = useState<number>(0);
  const [customReason, setCustomReason] = useState<string>('');
  const [extensionPaymentMethod, setExtensionPaymentMethod] = useState<'CASH' | 'UPI' | 'COMPLIMENTARY'>('CASH');
  const [sendExtensionEmail, setSendExtensionEmail] = useState(false);
  const [showEmailConfirmModal, setShowEmailConfirmModal] = useState(false);
  const [showExtendPaymentConfirm, setShowExtendPaymentConfirm] = useState(false);
  const [isSubmittingExtension, setIsSubmittingExtension] = useState(false);

  const emailYesButtonRef = useRef<HTMLButtonElement | null>(null);

  const rateConfig = rates?.find((r: any) => r.id === token?.placeTypeId);
  const hourlyRate = rateConfig ? (rateConfig.ratePerPerson || 0) / ((rateConfig.baseTimeMinutes || 20) / 60) : 0;

  const effectiveMinutes = selectedOption === 'custom'
    ? (customHours * 60) + customMinutes
    : Number(selectedOption);

  const calculatedAmount = Math.round(hourlyRate * (effectiveMinutes / 60) * ((token?.personsCount || 1)));

  const effectiveAmount = extensionPaymentMethod === 'COMPLIMENTARY'
    ? 0
    : (selectedOption === 'custom' ? customAmount : calculatedAmount);

  useEffect(() => {
    if (selectedOption === 'custom' && extensionPaymentMethod !== 'COMPLIMENTARY') {
      setCustomAmount(calculatedAmount);
    }
  }, [selectedOption, effectiveMinutes, extensionPaymentMethod, calculatedAmount]);

  useEffect(() => {
    if (showEmailConfirmModal) {
      setTimeout(() => {
        emailYesButtonRef.current?.focus();
      }, 50);
    }
  }, [showEmailConfirmModal]);

  if (!isOpen || !token) return null;

  const currentEndTimeStr = token ? new Date(token.endTime).toLocaleString() : 'N/A';
  const baseTime = token && new Date(token.endTime).getTime() > Date.now() ? new Date(token.endTime) : new Date();
  const newEndTimeStr = new Date(baseTime.getTime() + effectiveMinutes * 60 * 1000).toLocaleString();

  const handleExtendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveMinutes < 1) {
      showToast('Extension duration must be at least 1 minute.', 'warning');
      return;
    }
    if (selectedOption === 'custom' && (isNaN(customAmount) || customAmount < 0)) {
      showToast('Extension amount cannot be negative or invalid.', 'warning');
      return;
    }
    setShowExtendPaymentConfirm(true);
  };

  const executeExtend = async () => {
    setShowExtendPaymentConfirm(false);
    setIsSubmittingExtension(true);
    try {
      await api.extendToken(
        token.tokenNumber,
        effectiveMinutes,
        effectiveAmount,
        sendExtensionEmail,
        extensionPaymentMethod,
        selectedOption === 'custom' ? 'CUSTOM' : 'PREDEFINED',
        selectedOption === 'custom' ? customReason : undefined
      );
      showToast(`Session extended by +${effectiveMinutes} minutes successfully!`, 'success');
      onSuccess();
    } catch (err: any) {
      showToast(err.message || 'Failed to extend session.', 'danger');
    } finally {
      setIsSubmittingExtension(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] dark:bg-black/75 bg-slate-900/35 flex items-center justify-center p-4 animate-fadeIn">
        <div className="bg-bg-surface border border-border-main rounded-3xl p-4 sm:p-6 w-full max-w-md space-y-4 relative text-text-main animate-fadeIn">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-text-muted hover:text-text-main cursor-pointer p-1"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-2 text-text-main font-bold text-sm pr-8">
            <Clock size={18} className="shrink-0" /> <span className="truncate">Extend Table {token.table?.tableNumber || token.tableNumber || 'N/A'}</span>
          </div>

          <form onSubmit={handleExtendSubmit} className="space-y-4">
            <div className="p-3 bg-bg-primary rounded-xl space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Customer:</span>
                <span className="font-semibold text-text-main">{token.customer?.name || 'Guest'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Group Size:</span>
                <span className="font-semibold text-text-main">{token.personsCount || 1} Guests</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Current End Time:</span>
                <span className="font-semibold text-text-main">{currentEndTimeStr}</span>
              </div>
              <div className="flex justify-between border-t border-border-main/50 pt-1 mt-1 font-bold">
                <span className="text-text-muted">New End Time:</span>
                <span className="text-primary">{newEndTimeStr}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Select Extension Duration <span className="text-red-500">*</span></label>
              <select
                value={selectedOption}
                onChange={e => {
                  setSelectedOption(e.target.value);
                }}
                className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
                required
              >
                <option value={20}>+20 Minutes (₹{Math.round(hourlyRate * (20 / 60) * (token.personsCount || 1))})</option>
                <option value={25}>+25 Minutes (₹{Math.round(hourlyRate * (25 / 60) * (token.personsCount || 1))})</option>
                <option value={30}>+30 Minutes (₹{Math.round(hourlyRate * (30 / 60) * (token.personsCount || 1))})</option>
                <option value="custom">Custom Duration...</option>
              </select>
            </div>

            {selectedOption === 'custom' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-text-muted mb-1">Hours</label>
                    <div className="flex items-center bg-bg-primary border border-border-main rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setCustomHours(prev => Math.max(0, prev - 1))}
                        className="px-3 py-2 text-text-muted hover:text-text-main hover:bg-bg-card font-bold border-r border-border-main transition-colors cursor-pointer select-none"
                      >
                        ▼
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        value={customHours}
                        onChange={e => {
                          const val = parseInt(e.target.value, 10);
                          setCustomHours(isNaN(val) ? 0 : Math.min(24, Math.max(0, val)));
                        }}
                        className="w-full text-center bg-transparent border-none text-xs font-bold text-text-main focus:ring-0 focus:outline-none py-1.5"
                      />
                      <button
                        type="button"
                        onClick={() => setCustomHours(prev => Math.min(24, prev + 1))}
                        className="px-3 py-2 text-text-muted hover:text-text-main hover:bg-bg-card font-bold border-l border-border-main transition-colors cursor-pointer select-none"
                      >
                        ▲
                      </button>
                    </div>
                  </div>

                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-text-muted mb-1">Minutes</label>
                    <div className="flex items-center bg-bg-primary border border-border-main rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomMinutes(prev => {
                            const newVal = prev - 1;
                            if (newVal < 0) {
                              if (customHours > 0) {
                                setCustomHours(h => h - 1);
                                return 59;
                              }
                              return 0;
                            }
                            return newVal;
                          });
                        }}
                        className="px-3 py-2 text-text-muted hover:text-text-main hover:bg-bg-card font-bold border-r border-border-main transition-colors cursor-pointer select-none"
                      >
                        ▼
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={customMinutes}
                        onChange={e => {
                          const val = parseInt(e.target.value, 10);
                          if (isNaN(val)) {
                            setCustomMinutes(0);
                          } else if (val >= 60) {
                            setCustomHours(h => Math.min(24, h + Math.floor(val / 60)));
                            setCustomMinutes(val % 60);
                          } else {
                            setCustomMinutes(Math.max(0, val));
                          }
                        }}
                        className="w-full text-center bg-transparent border-none text-xs font-bold text-text-main focus:ring-0 focus:outline-none py-1.5"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCustomMinutes(prev => {
                            const newVal = prev + 1;
                            if (newVal >= 60) {
                              if (customHours < 24) {
                                setCustomHours(h => h + 1);
                                return 0;
                              }
                              return 59;
                            }
                            return newVal;
                          });
                        }}
                        className="px-3 py-2 text-text-muted hover:text-text-main hover:bg-bg-card font-bold border-l border-border-main transition-colors cursor-pointer select-none"
                      >
                        ▲
                      </button>
                    </div>
                  </div>
                </div>

                {extensionPaymentMethod !== 'COMPLIMENTARY' && (
                  <div>
                    <label className="block text-xs font-semibold text-text-muted mb-1">Custom Amount (₹) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      min={0}
                      value={customAmount}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        setCustomAmount(isNaN(val) ? 0 : Math.max(0, val));
                      }}
                      className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main font-mono focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Reason for Extension</label>
                  <input
                    type="text"
                    value={customReason}
                    onChange={e => setCustomReason(e.target.value)}
                    placeholder="e.g. Customer requested additional session time"
                    className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Payment Method <span className="text-red-500">*</span></label>
              <select
                value={extensionPaymentMethod}
                onChange={e => {
                  setExtensionPaymentMethod(e.target.value as any);
                }}
                className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
                required
              >
                <option value="CASH">Cash Payment (Confirm Collection)</option>
                <option value="UPI">UPI QR Code (Simulated)</option>
                <option value="COMPLIMENTARY">Complimentary (No Charge)</option>
              </select>
            </div>

            {extensionPaymentMethod === 'UPI' && (
              <div className="flex flex-col items-center justify-center py-4 space-y-3 bg-bg-primary rounded-2xl border border-border-main mt-4 animate-fadeIn">
                <p className="text-xs font-bold text-text-main">Scan UPI QR to Pay ₹{effectiveAmount}</p>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=barmanagement@upi&pn=BarSystem&am=${effectiveAmount}&cu=INR`)}`}
                  alt="UPI Payment QR"
                  className="border-4 border-primary rounded-xl p-1 bg-white w-[150px] h-[150px]"
                />
                <p className="text-[10px] text-text-muted italic">Development Simulator Mode</p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="sendExtensionEmail"
                checked={sendExtensionEmail}
                onChange={e => {
                  const val = e.target.checked;
                  if (val) {
                    setShowEmailConfirmModal(true);
                  } else {
                    setSendExtensionEmail(false);
                  }
                }}
                className="rounded bg-bg-primary border-border-main text-primary focus:ring-0 focus:ring-offset-0"
              />
              <label htmlFor="sendExtensionEmail" className="text-xs font-semibold text-text-muted cursor-pointer select-none">
                Send updated session details email to customer
              </label>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-bg-primary hover:bg-bg-card text-xs font-semibold text-text-muted hover:text-text-main border border-border-main cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingExtension}
                className="flex-1 py-2.5 rounded-xl primary-btn text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingExtension ? 'Saving...' : 'Confirm Extension'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showEmailConfirmModal && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-main rounded-3xl p-6 w-full max-w-sm space-y-6 text-center shadow-2xl animate-fadeIn text-text-main">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto text-primary">
              <Mail size={24} />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-black uppercase tracking-wider">Confirm Email</h3>
              <p className="text-xs text-text-muted">
                Are you sure you want to send an email to the user?
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                ref={emailYesButtonRef}
                onClick={() => {
                  setSendExtensionEmail(true);
                  setShowEmailConfirmModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white font-bold text-xs shadow-md shadow-primary/10 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer border-none"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => {
                  setSendExtensionEmail(false);
                  setShowEmailConfirmModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl border border-border-main text-text-muted hover:text-text-main font-semibold text-xs hover:bg-bg-primary/50 active:scale-[0.98] transition-all cursor-pointer bg-transparent"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {showExtendPaymentConfirm && (
        <div className="fixed inset-0 z-[110] dark:bg-black/75 bg-slate-900/35 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-main rounded-3xl p-5 sm:p-6 w-full max-w-md space-y-4 relative text-text-main animate-fadeIn">
            <h3 className="text-base font-black uppercase tracking-wider text-primary">Confirm Extension Payment?</h3>
            <p className="text-xs text-text-muted">
              Payment has been collected. Do you want to confirm the session extension?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={executeExtend}
                className="flex-1 py-2.5 rounded-xl primary-btn text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                YES — Confirm Extension
              </button>
              <button
                onClick={() => setShowExtendPaymentConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-bg-primary hover:bg-bg-card border border-border-main text-xs font-bold text-text-muted hover:text-text-main cursor-pointer"
              >
                NO — Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
