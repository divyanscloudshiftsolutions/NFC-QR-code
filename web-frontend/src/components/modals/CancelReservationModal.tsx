import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface CancelReservationModalProps {
  isOpen: boolean;
  reservation: {
    id?: string;
    tableId: string;
    customerName: string;
    phoneNumber?: string;
    table?: {
      tableNumber: string;
    };
    tokenNumber?: string;
  } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const CancelReservationModal: React.FC<CancelReservationModalProps> = ({
  isOpen,
  reservation,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useAuth();
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [closureReasonOption, setClosureReasonOption] = useState('Customer Vacated Early');
  const [closureCustomExplanation, setClosureCustomExplanation] = useState('');

  if (!isOpen || !reservation) return null;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingCancel(true);
    try {
      if (reservation.tokenNumber) {
        const reasonDetail = closureReasonOption === 'Other / Administrative Closure' && closureCustomExplanation
          ? `Other - ${closureCustomExplanation}`
          : closureReasonOption;
        await api.closeToken(reservation.tokenNumber, reasonDetail);
        showToast('Session closed successfully.', 'success');
      } else if (reservation.id) {
        await api.cancelReservation(reservation.id);
        showToast('Reservation cancelled successfully.', 'success');
      } else {
        await api.patchTableStatus(reservation.tableId, 'available');
        showToast('Reservation cancelled successfully.', 'success');
      }
      onSuccess();
    } catch (err: any) {
      showToast(err.message || (reservation.tokenNumber ? 'Failed to close session.' : 'Failed to cancel reservation.'), 'danger');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] dark:bg-black/75 bg-slate-900/35 flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border-main rounded-3xl p-4 sm:p-6 w-full max-w-md space-y-4 relative text-text-main animate-fadeIn">
        <button 
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-main cursor-pointer p-1"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 text-text-main font-bold text-sm pr-8 text-red-500">
          <AlertTriangle size={18} className="shrink-0" />
          <span className="truncate">
            {reservation.tokenNumber ? 'Close Session' : 'Cancel Reservation'}
          </span>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-text-muted">
              {reservation.tokenNumber 
                ? 'Are you sure you want to close this session:' 
                : 'Are you sure you want to cancel the reservation for:'}
            </p>
            <div className="p-3 bg-bg-primary rounded-xl space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Customer:</span>
                <span className="font-semibold text-text-main">{reservation.customerName}</span>
              </div>
              {reservation.phoneNumber && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Phone:</span>
                  <span className="font-semibold text-text-main">{reservation.phoneNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-muted">Table:</span>
                <span className="font-bold dark:text-primary text-primary font-mono">
                  {reservation.table?.tableNumber || 'N/A'}
                </span>
              </div>
              {reservation.tokenNumber && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Session Token:</span>
                  <span className="font-mono text-text-main font-bold">
                    {reservation.tokenNumber}
                  </span>
                </div>
              )}
            </div>

            {reservation.tokenNumber && (
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">
                    Reason for Closure <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={closureReasonOption}
                    onChange={e => setClosureReasonOption(e.target.value)}
                    className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
                    required
                  >
                    <option value="Customer Vacated Early">Customer Vacated Early</option>
                    <option value="Session Opened by Mistake">Session Opened by Mistake</option>
                    <option value="Other / Administrative Closure">Other / Administrative Closure</option>
                  </select>
                </div>

                {closureReasonOption === 'Other / Administrative Closure' && (
                  <div>
                    <label className="block text-xs font-semibold text-text-muted mb-1">
                      Explanation <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={closureCustomExplanation}
                      onChange={e => setClosureCustomExplanation(e.target.value)}
                      placeholder="Enter details about why this session is being closed..."
                      className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary min-h-[60px]"
                      required
                    />
                  </div>
                )}
              </div>
            )}

            <p className="text-[11px] text-red-500/80 italic pt-1">
              {reservation.tokenNumber 
                ? 'This will close the active session and release the table back to "available" immediately.'
                : 'This will release the table back to "available" immediately.'}
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-bg-primary hover:bg-bg-card text-xs font-semibold text-text-muted hover:text-text-main border border-border-main cursor-pointer"
            >
              No, Keep it
            </button>
            <button
              type="submit"
              disabled={isSubmittingCancel}
              className="flex-1 py-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 active:bg-red-700 text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer border-none"
            >
              {isSubmittingCancel 
                ? (reservation.tokenNumber ? 'Closing...' : 'Cancelling...') 
                : (reservation.tokenNumber ? 'Yes, Close Session' : 'Yes, Cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
