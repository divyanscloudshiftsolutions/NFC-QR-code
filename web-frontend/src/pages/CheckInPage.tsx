import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
 User, 
 Phone, 
 Mail, 
 Users, 
 CreditCard, 
 QrCode, 
 CheckCircle2, 
 ChevronRight, 
 ChevronLeft, 
 Grid3X3,
 Receipt,
 RotateCcw,
 AlertTriangle,
 Camera,
 Minus,
 Plus
} from 'lucide-react';
import { api } from '../services/api';
import type { Token, Table } from '../types';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import jsQR from 'jsqr';

export const CheckInPage: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
 const { showToast, preselectedTable, setPreselectedTable } = useAuth();
 const { tables, rates, tokens: activeTokens, refreshTables, refreshTokens, refreshReservations } = useData();
 const [stage, setStage] = useState<1 | 2 | 3 | 4 | 5>(1);
 const [reservationId, setReservationId] = useState('');

 // Stage 1: Form Input States
 const [phoneNumber, setPhoneNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [emailConflict, setEmailConflict] = useState(false);
  const [phoneConflict, setPhoneConflict] = useState(false);
  const [personsCount, setPersonsCount] = useState<number | ''>(2);
  const deliveryMode = 'EMAIL_QR';
  const [selectedPlaceTypeId, setSelectedPlaceTypeId] = useState('standing_bar');

 // Stage 2: Seating State
 const [selectedTableId, setSelectedTableId] = useState('');
 const [originalTableStatus, setOriginalTableStatus] = useState<'available' | 'reserved' | ''>('');

 // Stage 3: Camera & QR Scanner State
 const videoRef = useRef<HTMLVideoElement | null>(null);
 const activeStreamRef = useRef<MediaStream | null>(null);
 const cameraRequestIdRef = useRef(0);
 const lastScannedCodeRef = useRef<string | null>(null);
 const [cameraActive, setCameraActive] = useState(false);
 const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
 const [cameraError, setCameraError] = useState<string | null>(null);
 const [stream, setStream] = useState<MediaStream | null>(null);
 const [qrCodeInput, setQrCodeInput] = useState('');
 const [isVerifyingQr, setIsVerifyingQr] = useState(false);
 const [qrVerificationSuccess, setQrVerificationSuccess] = useState(false);
 const [qrVerificationError, setQrVerificationError] = useState<string | null>(null);

 // Stage 4: Payment Details State
 const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI'>('CASH');
 const [isSubmitting, setIsSubmitting] = useState(false);

 // Stage 5: Output Pass Ticket
 const [createdToken, setCreatedToken] = useState<Token | null>(null);

  // Pre-registered flow state
  const [activePendingToken, setActivePendingToken] = useState<Token | null>(null);

  const [isSendingQr, setIsSendingQr] = useState(false);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const [hasCheckedIncomplete, setHasCheckedIncomplete] = useState(false);

  // Stop Confirmation States
  const [showStopCheckInConfirmModal, setShowStopCheckInConfirmModal] = useState(false);
  const [onConfirmStop, setOnConfirmStop] = useState<(() => void) | null>(null);

  // Capacity Warning States
  const [showCapacityWarning, setShowCapacityWarning] = useState(false);
  const [hasDismissedCapacityWarning, setHasDismissedCapacityWarning] = useState(false);
  const [attemptedPersonsCount, setAttemptedPersonsCount] = useState<number | null>(null);
  const [showPaymentCollectedConfirm, setShowPaymentCollectedConfirm] = useState(false);

  // Load incomplete check-in state on mount
  useEffect(() => {
    const redirectOriginalStatus = localStorage.getItem('bar_checkin_original_status');
    if (redirectOriginalStatus) {
      setOriginalTableStatus(redirectOriginalStatus as 'available' | 'reserved' | '');
      localStorage.removeItem('bar_checkin_original_status');
    }

    const saved = localStorage.getItem('bar_incomplete_checkin');
    const savedTarget = localStorage.getItem('bar_checkin_assign_target');

    if (saved && !hasCheckedIncomplete) {
      setShowContinuePrompt(true);
    } else if (savedTarget) {
      // If no draft, load target assignment directly
      try {
        const target = JSON.parse(savedTarget);
        setCustomerName(target.customerName || '');
        setPhoneNumber(target.phoneNumber ? (target.phoneNumber.startsWith('+91') ? target.phoneNumber.substring(3) : target.phoneNumber) : '');
        setEmail(target.email || '');
        setPersonsCount(target.personsCount || 2);
        setSelectedTableId(target.tableId || '');
        setSelectedPlaceTypeId(target.placeTypeId || 'standing_bar');
        setReservationId(target.reservationId || '');
        if (redirectOriginalStatus) {
          setOriginalTableStatus(redirectOriginalStatus as any);
        }
      } catch (e) {
        console.error("Failed to parse assign target on mount", e);
      }
      localStorage.removeItem('bar_checkin_assign_target');
    }
    setHasCheckedIncomplete(true);
  }, []);

  const handleStopCheckInWithConfirmation = (action: () => void) => {
    setOnConfirmStop(() => action);
    setShowStopCheckInConfirmModal(true);
  };

  // Keyboard listeners for Stop Confirmation Modal
  useEffect(() => {
    if (!showStopCheckInConfirmModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const yesBtn = document.getElementById('stop-confirm-yes-btn');
        if (yesBtn) {
          (yesBtn as HTMLButtonElement).click();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const noBtn = document.getElementById('stop-confirm-no-btn');
        if (noBtn) {
          (noBtn as HTMLButtonElement).click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showStopCheckInConfirmModal]);

  const renderStopCheckInConfirmModal = showStopCheckInConfirmModal && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border-main rounded-3xl p-6 w-full max-w-sm space-y-6 text-center shadow-2xl animate-fadeIn text-text-main">
        <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} />
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-black uppercase tracking-wider text-red-500">Stop Check-In?</h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Are you sure you want to stop this Check-In?
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            autoFocus
            id="stop-confirm-yes-btn"
            type="button"
            onClick={() => {
              if (onConfirmStop) onConfirmStop();
              setShowStopCheckInConfirmModal(false);
              setOnConfirmStop(null);
            }}
            className="flex-1 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all bg-red-500 hover:bg-red-600 text-white cursor-pointer"
          >
            YES — Stop Check-In
          </button>
          <button
            id="stop-confirm-no-btn"
            type="button"
            onClick={() => {
              setShowStopCheckInConfirmModal(false);
              setOnConfirmStop(null);
            }}
            className="flex-1 px-4 py-3 rounded-xl text-xs font-bold transition-all border border-border-main hover:bg-bg-primary text-text-muted hover:text-text-main cursor-pointer"
          >
            NO — Continue Check-In
          </button>
        </div>
      </div>
    </div>
  );

  // Save incomplete check-in state to localStorage on change
  useEffect(() => {
    if (stage === 5 || createdToken) {
      localStorage.removeItem('bar_incomplete_checkin');
      return;
    }

    if (phoneNumber || customerName || email || selectedTableId) {
      const state = {
        phoneNumber,
        customerName,
        email,
        personsCount,
        selectedPlaceTypeId,
        selectedTableId,
        stage,
        activePendingToken,
        qrVerificationSuccess,
        paymentMode,
        originalTableStatus,
        reservationId
      };
      localStorage.setItem('bar_incomplete_checkin', JSON.stringify(state));
    }
  }, [phoneNumber, customerName, email, personsCount, selectedPlaceTypeId, selectedTableId, stage, activePendingToken, qrVerificationSuccess, paymentMode, createdToken, originalTableStatus, reservationId]);

  // Real-time backend validation with 400ms debounce
  useEffect(() => {
    const p = phoneNumber.trim();
    const e = email.trim();

    if (!p && !e) {
      setPhoneConflict(false);
      setEmailConflict(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const body: any = {};
        if (p) body.phoneNumber = p;
        if (e) body.email = e;
        if (activePendingToken?.tokenNumber) {
          body.tokenNumber = activePendingToken.tokenNumber;
        }

        const res = await api.validateDuplicate(body);
        if (res && res.conflicts) {
          setPhoneConflict(!!res.conflicts.phone);
          setEmailConflict(!!res.conflicts.email);
        } else {
          setPhoneConflict(false);
          setEmailConflict(false);
        }
      } catch (err) {
        console.error('Error during duplicate validation:', err);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [phoneNumber, email, activePendingToken]);

  const handleContinueCheckIn = async () => {
    // Release new target table lock if they chose to resume previous draft instead
    const savedTarget = localStorage.getItem('bar_checkin_assign_target');
    if (savedTarget) {
      try {
        const target = JSON.parse(savedTarget);
        if (target.tableId) {
          await api.unlockTable(target.tableId);
        }
      } catch (e) {
        console.warn('Failed to unlock target table on resume:', e);
      }
      localStorage.removeItem('bar_checkin_assign_target');
    }

    const saved = localStorage.getItem('bar_incomplete_checkin');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        setPhoneNumber(state.phoneNumber || '');
        setCustomerName(state.customerName || '');
        setEmail(state.email || '');
        setPersonsCount(state.personsCount || 2);
        setSelectedPlaceTypeId(state.selectedPlaceTypeId || 'standing_bar');
        setSelectedTableId(state.selectedTableId || '');
        setStage(state.stage || 1);
        setActivePendingToken(state.activePendingToken || null);
        setQrVerificationSuccess(state.qrVerificationSuccess || false);
        setPaymentMode(state.paymentMode || 'CASH');
        setOriginalTableStatus(state.originalTableStatus || '');
        setReservationId(state.reservationId || '');
      } catch (e) {
        console.error("Failed to parse incomplete check-in state", e);
      }
    }
    setShowContinuePrompt(false);
  };

  const handleAbandonCheckIn = async () => {
    const savedDraft = localStorage.getItem('bar_incomplete_checkin');
    let draftTableId = '';
    if (savedDraft) {
      try {
        const state = JSON.parse(savedDraft);
        draftTableId = state.selectedTableId || '';
      } catch (e) {
        console.error("Failed to parse saved draft inside abandon:", e);
      }
    }

    const tableToUnlock = selectedTableId || draftTableId;
    localStorage.removeItem('bar_incomplete_checkin');
    
    // Load new target check-in details if present
    const savedTarget = localStorage.getItem('bar_checkin_assign_target');
    let target: any = null;
    if (savedTarget) {
      try {
        target = JSON.parse(savedTarget);
      } catch (e) {
        console.error("Failed to parse assign target in abandon:", e);
      }
      localStorage.removeItem('bar_checkin_assign_target');
    }

    setPhoneNumber('');
    setCustomerName('');
    setEmail('');
    setPersonsCount(2);
    setSelectedTableId('');
    setStage(1);
    setActivePendingToken(null);
    setQrVerificationSuccess(false);
    setPaymentMode('CASH');
    setOriginalTableStatus('');
    setReservationId('');
    setShowContinuePrompt(false);

    if (target) {
      setCustomerName(target.customerName || '');
      setPhoneNumber(target.phoneNumber ? (target.phoneNumber.startsWith('+91') ? target.phoneNumber.substring(3) : target.phoneNumber) : '');
      setEmail(target.email || '');
      setPersonsCount(target.personsCount || 2);
      setSelectedTableId(target.tableId || '');
      setSelectedPlaceTypeId(target.placeTypeId || 'standing_bar');
      setReservationId(target.reservationId || '');
      const redirectOriginalStatus = localStorage.getItem('bar_checkin_original_status');
      if (redirectOriginalStatus) {
        setOriginalTableStatus(redirectOriginalStatus as any);
      }
    }

    // Unlock the old draft table if it is different from the new target table
    if (tableToUnlock && (!target || target.tableId !== tableToUnlock)) {
      try {
        await api.unlockTable(tableToUnlock);
        refreshTables();
      } catch (err: any) {
        console.warn('Failed to release lock on old draft table:', err);
      }
    }
  };

  const checkDetailsChanged = () => {
    if (!activePendingToken) return true;
    const activePhone = activePendingToken.customer?.phoneNumber || (activePendingToken as any).phoneNumber || '';
    const activeName = activePendingToken.customer?.name || (activePendingToken as any).customerName || '';
    const activeEmail = activePendingToken.customer?.email || (activePendingToken as any).email || '';
    const activePersons = activePendingToken.personsCount || (activePendingToken as any).persons || 0;

    const currentNormalizedPhone = phoneNumber.trim().startsWith('+91') ? phoneNumber.trim() : `+91${phoneNumber.trim()}`;
    const activeNormalizedPhone = activePhone.trim().startsWith('+91') ? activePhone.trim() : `+91${activePhone.trim()}`;

    return (
      activeNormalizedPhone !== currentNormalizedPhone ||
      activeName !== customerName.trim() ||
      activeEmail.toLowerCase() !== email.trim().toLowerCase() ||
      Number(activePersons) !== Number(personsCount) ||
      activePendingToken.tableId !== selectedTableId ||
      activePendingToken.placeTypeId !== selectedPlaceTypeId
    );
  };

  const handleStage2Submit = async () => {
    if (!checkDetailsChanged() && activePendingToken) {
      setStage(3);
      return;
    }

    setIsSendingQr(true);
    try {
      const selectedTable = tables.find(t => t.id === selectedTableId);
      const tableNumber = selectedTable ? selectedTable.tableNumber : '';

      const res = await api.createPendingCheckIn({
        phoneNumber: phoneNumber.trim(),
        customerName: customerName.trim(),
        email: email.trim() || '',
        personsCount: typeof personsCount === 'number' ? personsCount : 1,
        placeTypeId: selectedPlaceTypeId,
        tableId: selectedTableId || undefined,
        tableNumber: tableNumber || undefined,
        tokenNumber: activePendingToken?.tokenNumber || undefined
      });

      if (res && res.success && res.token) {
        setActivePendingToken(res.token);
        setQrVerificationSuccess(false);
        showToast('QR Code generated and dispatched to guest email.', 'success');
        setStage(3);
      } else {
        showToast('Failed to generate pending check-in. Please try again.', 'danger');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to generate pending check-in.', 'danger');
    } finally {
      setIsSendingQr(false);
    }
  };

  const getStage2ButtonText = () => {
    if (isSendingQr) return 'Sending QR...';
    if (!activePendingToken) return 'Send QR';
    if (checkDetailsChanged()) return 'Update & Send QR';
    return 'Proceed to QR';
  };

  // EXACT VALIDATION REGEXES MATCHING REACT NATIVE SOURCE OF TRUTH
  const isValidName = (name: string): boolean => {
    const trimmed = name.trim();
    return /^[a-zA-Z\s.'-]{2,100}$/.test(trimmed);
  };

  const isValidPhone = (phone: string): boolean => {
    const trimmed = phone.trim();
    return /^(?:\+91)?[6-9]\d{9}$/.test(trimmed);
  };

  const isValidEmail = (emailStr: string): boolean => {
    if (!emailStr || !emailStr.trim()) return true;
    const trimmed = emailStr.trim().toLowerCase();
    const regex = /^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9]+(\.[a-z0-9]+)*@gmail\.com$/;
    return regex.test(trimmed);
  };

  // Active Check-in Duplicate Session Check
  const normalizedPhone = phoneNumber.trim().startsWith('+91') ? phoneNumber.trim() : `+91${phoneNumber.trim()}`;
  const isPhoneActive = activeTokens.some(t => 
    (t.customer?.phoneNumber === phoneNumber.trim() || t.customer?.phoneNumber === normalizedPhone) &&
    (t.status?.toUpperCase() === 'ACTIVE' || t.status?.toUpperCase() === 'EXTENDED')
  );

  const isEmailActive = email.trim() ? activeTokens.some(t =>
    t.customer?.email?.toLowerCase() === email.trim().toLowerCase() &&
    (t.status?.toUpperCase() === 'ACTIVE' || t.status?.toUpperCase() === 'EXTENDED')
  ) : false;

  // React Native exact step validation booleans
  const isNameOk = isValidName(customerName);
  const isPhoneOk = isValidPhone(phoneNumber) && !isPhoneActive && !phoneConflict;
  const isEmailOk = email.trim().length > 0 && isValidEmail(email) && !isEmailActive && !emailConflict;

 const selectedTableObj = tables.find(t => t.id === selectedTableId);
 
 // Dynamic Max Capacities based on tables configuration
 const maxCapacity = tables.length > 0 ? Math.max(...tables.map(t => t.capacity)) : 20;
 const isCapacityOk = typeof personsCount === 'number' && personsCount > 0 && personsCount <= maxCapacity;

 // Zone specific max capacities
 const standardTables = tables.filter(t => t.placeTypeId === 'STANDING_BAR' || t.tableNumber.startsWith('S-') || !t.tableNumber.startsWith('L-'));
 const premiumTables = tables.filter(t => t.placeTypeId === 'PREMIUM_LOUNGE' || t.tableNumber.startsWith('L-'));
 const standardMaxCapacity = standardTables.length > 0 ? Math.max(...standardTables.map(t => t.capacity)) : 6;
 const premiumMaxCapacity = premiumTables.length > 0 ? Math.max(...premiumTables.map(t => t.capacity)) : 20;

 // Generate quick-select buttons dynamically from actual table capacities configuration
 const quickSelectButtons = useMemo(() => {
 if (tables.length === 0) return [1, 2, 3, 4, 5, 6, 8, 10];
 const capacities = Array.from(new Set(tables.map(t => t.capacity))).sort((a, b) => a - b);
 const list = new Set<number>();
 list.add(1);
 capacities.forEach(c => {
 if (c > 0) list.add(c);
 });
 return Array.from(list).sort((a, b) => a - b);
 }, [tables]);

 // Find database UUIDs for standard bar and premium lounge
 const dbStandardRate = rates.find(r => r.name?.toUpperCase() === 'STANDING_BAR' || r.name?.toLowerCase().includes('standing'));
 const dbPremiumRate = rates.find(r => r.name?.toUpperCase() === 'PREMIUM_LOUNGE' || r.name?.toLowerCase().includes('lounge'));
 const standardId = dbStandardRate?.id || 'standing_bar';
 const premiumId = dbPremiumRate?.id || 'premium_lounge';

 // Sync selectedPlaceTypeId to standardId once rates load
 useEffect(() => {
 if (selectedPlaceTypeId === 'standing_bar' && standardId !== 'standing_bar') {
 setSelectedPlaceTypeId(standardId);
 }
 }, [rates, standardId]);



 // Auto-adjust selected place category type if headcount exceeds the maximum capacity of the standard zone
 useEffect(() => {
 const personsCountNum = typeof personsCount === 'number' ? personsCount : 0;
 if (selectedPlaceTypeId === standardId && personsCountNum > standardMaxCapacity) {
 setSelectedPlaceTypeId(premiumId);
 }
 }, [personsCount, standardMaxCapacity, selectedPlaceTypeId, standardId, premiumId]);

 // STEP 1 VALIDATION BARRIER (Button disabled if false)
 const isStep1Valid = isNameOk && isPhoneOk && isEmailOk && isCapacityOk;

 // Pre-select table if navigated from Tables floor plan
 useEffect(() => {
 if (preselectedTable) {
 const matchedCategory = preselectedTable.number.startsWith('L-') ? premiumId : standardId;
 setSelectedPlaceTypeId(preselectedTable.placeTypeId || matchedCategory);
 setSelectedTableId(preselectedTable.id);
setPersonsCount(preselectedTable.capacity);
        showToast(`Table ${preselectedTable.number} (Max ${preselectedTable.capacity} guests) pre-selected for check-in.`, 'info');
      }
    }, [preselectedTable, standardId, premiumId]);

  const handleTableSelect = async (tb: Table) => {
    const isCurrentlySelected = selectedTableId === tb.id;
    if (isCurrentlySelected) {
      try {
        await api.unlockTable(tb.id);
        setSelectedTableId('');
        setOriginalTableStatus('');
        refreshTables();
        showToast(`Table ${tb.tableNumber} released.`, 'info');
      } catch (err: any) {
        showToast(err.message || `Failed to release table ${tb.tableNumber}.`, 'danger');
      }
    } else {
      const previousTableId = selectedTableId;
      try {
        await api.lockTable(tb.id);
        
        if (previousTableId) {
          try {
            await api.unlockTable(previousTableId);
          } catch (unlockErr: any) {
            console.warn(`Failed to unlock previous table ${previousTableId}:`, unlockErr);
          }
        }
        
        setSelectedTableId(tb.id);
        setOriginalTableStatus(tb.status as any);
        refreshTables();
        showToast(`Table ${tb.tableNumber} locked for check-in.`, 'success');
      } catch (err: any) {
        showToast(err.message || `Failed to lock table ${tb.tableNumber} for check-in.`, 'danger');
      }
    }
  };

  // Derived current rate card
 const currentRateCard = rates.find(r => r.id === selectedPlaceTypeId) || {
 id: selectedPlaceTypeId,
 name: selectedPlaceTypeId === premiumId ? 'Premium Lounge' : 'Standing Bar',
 ratePerPerson: selectedPlaceTypeId === premiumId ? (dbPremiumRate?.ratePerPerson ?? 1000) : (dbStandardRate?.ratePerPerson ?? 500),
 baseTimeMinutes: selectedPlaceTypeId === premiumId ? (dbPremiumRate?.baseTimeMinutes ?? 180) : (dbStandardRate?.baseTimeMinutes ?? 120),
 redemptionsPerPerson: selectedPlaceTypeId === premiumId ? (dbPremiumRate?.redemptionsPerPerson ?? 4) : (dbStandardRate?.redemptionsPerPerson ?? 2),
 };

 const personsCountNum = typeof personsCount === 'number' ? personsCount : 0;
 const calculatedTotal = personsCountNum * (currentRateCard.ratePerPerson || 0);
 const totalAllowedDrinks = personsCountNum * (currentRateCard.redemptionsPerPerson || 0);

 const handleStage1Next = (e: React.FormEvent) => {
 e.preventDefault();

 if (!isStep1Valid) {
 if (!isNameOk) showToast('Please enter a valid customer full name (2-100 letters).', 'danger');
 else if (!isPhoneOk) showToast('Please enter a valid 10-digit Indian mobile number.', 'danger');
 else if (!isEmailOk) showToast('Please enter a valid email address.', 'danger');
 else if (!isCapacityOk) showToast(`Please enter a valid headcount between 1 and ${maxCapacity} guests.`, 'danger');
 return;
 }

 if (preselectedTable) {
 setStage(3); // Go to Stage 3 (QR Scan) if preselected
 } else {
 setStage(2);
 }
 };

  // Capacity Warning State Handlers
  const handlePersonsCountChange = (val: number | string) => {
    if (val === '') {
      setPersonsCount('');
      return;
    }
    const finalVal = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(finalVal) || finalVal <= 0) return;

    if (finalVal > maxCapacity) {
      showToast(`Headcount cannot exceed Table maximum capacity of ${maxCapacity} seats.`, 'warning');
      setPersonsCount(maxCapacity);
      return;
    }

    if (selectedTableObj && finalVal > selectedTableObj.capacity) {
      setAttemptedPersonsCount(finalVal);
      setShowCapacityWarning(true);
    } else {
      setPersonsCount(finalVal);
      setAttemptedPersonsCount(null);
      setShowCapacityWarning(false);
    }
  };

  const handleKeepTable = () => {
    if (selectedTableObj) {
      setPersonsCount(selectedTableObj.capacity);
    }
    setAttemptedPersonsCount(null);
    setShowCapacityWarning(false);
    setHasDismissedCapacityWarning(true);
  };

  const handleChangeTable = async () => {
    const tableToUnlock = selectedTableId;
    if (tableToUnlock) {
      try {
        await api.unlockTable(tableToUnlock);
        refreshTables();
      } catch (err: any) {
        console.warn('Failed to unlock table on change table action:', err);
      }
    }

    setSelectedTableId('');
    setOriginalTableStatus('');

    if (attemptedPersonsCount !== null) {
      setPersonsCount(attemptedPersonsCount);
    }

    setAttemptedPersonsCount(null);
    setShowCapacityWarning(false);
    setHasDismissedCapacityWarning(false);
    setStage(2);
  };

  // Trigger capacity popup when pre-filled count exceeds pre-filled table's capacity
  useEffect(() => {
    const personsCountNum = typeof personsCount === 'number' ? personsCount : 0;
    if (selectedTableObj && personsCountNum > selectedTableObj.capacity) {
      if (!hasDismissedCapacityWarning) {
        setShowCapacityWarning(true);
      }
    } else {
      setShowCapacityWarning(false);
      setHasDismissedCapacityWarning(false);
    }
  }, [selectedTableId, selectedTableObj, hasDismissedCapacityWarning, personsCount]);

  const renderCapacityWarningModal = showCapacityWarning && selectedTableObj && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border-main rounded-3xl p-6 w-full max-w-sm space-y-6 text-center shadow-2xl animate-fadeIn text-text-main">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} />
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-black uppercase tracking-wider text-amber-500">Table Capacity Exceeded</h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Do you want to change the table because the capacity is {selectedTableObj.capacity}, or continue with the current table with {selectedTableObj.capacity} people?
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={handleKeepTable}
            className="flex-1 px-4 py-3 rounded-xl text-xs font-bold transition-all border border-border-main hover:bg-bg-primary text-text-muted hover:text-text-main cursor-pointer"
          >
            Keep Current Table
          </button>
          <button
            type="button"
            onClick={handleChangeTable}
            className="flex-1 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all bg-amber-500 hover:bg-amber-600 text-white cursor-pointer"
          >
            Change Table
          </button>
        </div>
      </div>
    </div>
  );

  // Camera & QR control methods
 const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
 setCameraError(null);
 stopCamera();

 const requestId = ++cameraRequestIdRef.current;

 try {
 let mediaStream: MediaStream;
 try {
 mediaStream = await navigator.mediaDevices.getUserMedia({
 video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
 audio: false,
 });
 } catch {
 mediaStream = await navigator.mediaDevices.getUserMedia({
 video: true,
 audio: false,
 });
 }

 if (requestId !== cameraRequestIdRef.current) {
 mediaStream.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 return;
 }

 activeStreamRef.current = mediaStream;
 setStream(mediaStream);
 setCameraActive(true);
 } catch {
 setCameraError('Camera access unavailable. Please grant browser camera permissions or use manual token verification.');
 setCameraActive(false);
 }
 };

 const stopCamera = () => {
 cameraRequestIdRef.current++;
 if (activeStreamRef.current) {
 activeStreamRef.current.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 activeStreamRef.current = null;
 }
 if (stream) {
 stream.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 setStream(null);
 }
 if (videoRef.current && videoRef.current.srcObject) {
 try {
 const srcObj = videoRef.current.srcObject as MediaStream;
 if (srcObj && srcObj.getTracks) {
 srcObj.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 }
 videoRef.current.pause();
 videoRef.current.srcObject = null;
 } catch {}
 }
 setCameraActive(false);
 };

 const toggleFacingMode = () => {
 const nextMode = facingMode === 'user' ? 'environment' : 'user';
 setFacingMode(nextMode);
 if (cameraActive) {
 startCamera(nextMode);
 }
 };

 // Bind video stream whenever stream state or videoRef mounts
 useEffect(() => {
 if (cameraActive && stream && videoRef.current) {
 videoRef.current.srcObject = stream;
 videoRef.current.play().catch(() => {});
 }
 }, [cameraActive, stream, stage]);

  // Automatically handle camera state based on active stage/subtab
  useEffect(() => {
  if (stage === 3) {
  startCamera();
  } else {
  stopCamera();
  }
  return () => {
  stopCamera();
  };
  }, [stage]);

  // Frame-by-frame loop for QR code detection using jsQR
  useEffect(() => {
    let animationFrameId: number;
    let scanning = true;

    const scanFrame = () => {
      if (!scanning) return;

      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data) {
            const decoded = code.data.trim();
            if (decoded && decoded !== lastScannedCodeRef.current) {
              lastScannedCodeRef.current = decoded;
              console.log("[QR Scanner] Decoded QR code:", decoded);
              handleVerifyQR(decoded);

              // Allow scanning the same code again after 3 seconds if it was rejected/failed
              setTimeout(() => {
                if (lastScannedCodeRef.current === decoded) {
                  lastScannedCodeRef.current = null;
                }
              }, 3000);
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(scanFrame);
    };

    if (cameraActive && stage === 3) {
      scanning = true;
      animationFrameId = requestAnimationFrame(scanFrame);
    }

    return () => {
      scanning = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [cameraActive, stage]);

 // Page visibility & window focus camera lifecycle management
 const cameraActiveRef = useRef(cameraActive);
 const shouldResumeRef = useRef(false);

 useEffect(() => {
 cameraActiveRef.current = cameraActive;
 }, [cameraActive]);

 useEffect(() => {
 const handleVisibilityChange = () => {
 if (document.hidden) {
 if (cameraActiveRef.current) {
 shouldResumeRef.current = true;
 stopCamera();
 }
 } else {
 if (shouldResumeRef.current) {
 shouldResumeRef.current = false;
 if (stage === 3) {
 startCamera();
 }
 }
 }
 };

 const handleWindowBlur = () => {
 if (cameraActiveRef.current) {
 shouldResumeRef.current = true;
 stopCamera();
 }
 };

 const handleWindowFocus = () => {
 if (shouldResumeRef.current) {
 shouldResumeRef.current = false;
 if (stage === 3) {
 startCamera();
 }
 }
 };

 document.addEventListener('visibilitychange', handleVisibilityChange);
 window.addEventListener('blur', handleWindowBlur);
 window.addEventListener('focus', handleWindowFocus);

 return () => {
 document.removeEventListener('visibilitychange', handleVisibilityChange);
 window.removeEventListener('blur', handleWindowBlur);
 window.removeEventListener('focus', handleWindowFocus);
 };
 }, [stage]);

 // Component unmount stream cleanup
 useEffect(() => {
 return () => {
 cameraRequestIdRef.current++;
 if (activeStreamRef.current) {
 activeStreamRef.current.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 activeStreamRef.current = null;
 }
 if (stream) {
 stream.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 }
 };
 }, []);

 const handleVerifyQR = async (code: string) => {
 const cleanCode = code.trim();
 if (!cleanCode) return;
 setIsVerifyingQr(true);
 setQrVerificationError(null);
 setQrVerificationSuccess(false);

 try {
 const res = await api.verifyCheckInQR(cleanCode);
  if (res.success && res.token) {
  setQrVerificationSuccess(true);
  setActivePendingToken(res.token); // Store scanned pending token
  showToast(`Token #${res.token.tokenNumber} verified successfully!`, 'success');
  
  // Populate inputs if verified pre-registered session returned
  const returnedName = res.token.customer?.name || (res.token as any).customerName;
  const returnedPhone = res.token.customer?.phoneNumber || (res.token as any).phoneNumber;
  const returnedEmail = res.token.customer?.email || (res.token as any).email;
  const returnedPersons = res.token.personsCount || (res.token as any).persons;

  if (returnedName) setCustomerName(returnedName);
  if (returnedPhone) setPhoneNumber(returnedPhone);
  if (returnedEmail) setEmail(returnedEmail);
  if (returnedPersons) setPersonsCount(returnedPersons);
  
  setStage(4); // Advance to payment
  stopCamera();
  } else {
  setQrVerificationError('Token verification failed.');
  showToast('Token QR verification failed.', 'danger');
  }
 } catch (err: any) {
 setQrVerificationError(err.message || 'Invalid or expired QR token.');
 showToast(err.message || 'Token verification failed.', 'danger');
 } finally {
 setIsVerifyingQr(false);
 }
 };

 const handleFinalCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStep1Valid) {
      showToast('Form inputs are invalid. Please check Stage 1 details.', 'danger');
      setStage(1);
      return;
    }
    setShowPaymentCollectedConfirm(true);
  };

  const executeFinalCheckIn = async () => {
    setShowPaymentCollectedConfirm(false);
    setIsSubmitting(true);

    try {
      let res;
      if (activePendingToken) {
        const selectedTable = tables.find(t => t.id === selectedTableId);
        const tableNumber = selectedTable ? selectedTable.tableNumber : '';

        // 1. Update check-in and table allocation options inside pending state first
        await api.createPendingCheckIn({
          phoneNumber: phoneNumber.trim(),
          customerName: customerName.trim(),
          email: email.trim() || '',
          personsCount: typeof personsCount === 'number' ? personsCount : 1,
          placeTypeId: selectedPlaceTypeId,
          tableId: selectedTableId || undefined,
          tableNumber: tableNumber || undefined,
          tokenNumber: activePendingToken.tokenNumber
        });

        // 2. Activate token payment and seat occupation
        res = await api.activateSession(activePendingToken.tokenNumber, tableNumber, calculatedTotal);
      } else {
        res = await api.createCustomerCheckIn({
          phoneNumber: phoneNumber.trim(),
          customerName: customerName.trim(),
          email: email.trim() || undefined,
          personsCount: typeof personsCount === 'number' ? personsCount : 1,
          placeTypeId: selectedPlaceTypeId,
          deliveryMode
        });
      }

      if (res.success && res.token) {
        setCreatedToken(res.token);
        if (!activePendingToken && selectedTableId) {
          await api.assignTable(selectedTableId, res.token.id).catch(() => {});
        }
        if (reservationId) {
          await api.assignReservation(reservationId).catch(() => {});
          setReservationId('');
        }
        showToast(`Guest ${customerName} checked in successfully! Token: ${res.token.tokenNumber}`, 'success');
        refreshTokens();
        refreshTables();
        refreshReservations();
        setActivePendingToken(null); // Reset pending check-in tracker
        setStage(5);
      } else {
        showToast('Check-in failed. Please try again.', 'danger');
      }
    } catch (err: any) {
      showToast(err.message || 'Check-in failed.', 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetWizard = async () => {
    const savedDraft = localStorage.getItem('bar_incomplete_checkin');
    let draftTableId = '';
    if (savedDraft) {
      try {
        const state = JSON.parse(savedDraft);
        draftTableId = state.selectedTableId || '';
      } catch (e) {
        console.error("Failed to parse saved draft inside reset:", e);
      }
    }

    const tableToUnlock = selectedTableId || draftTableId;
    localStorage.removeItem('bar_incomplete_checkin');
    setStage(1);
    setPhoneNumber('');
    setCustomerName('');
    setEmail('');
    setPersonsCount(2);
    setSelectedTableId('');
    setCreatedToken(null);
    setPreselectedTable(null);
    setActivePendingToken(null);
    setQrVerificationSuccess(false);
    setOriginalTableStatus('');
    
    if (tableToUnlock && !createdToken) {
      try {
        await api.unlockTable(tableToUnlock);
        refreshTables();
      } catch (err: any) {
        console.warn('Failed to release lock on table:', err);
      }
    }
  };

 // Filter available tables by place category & seating capacity compatibility matching React Native
  const compatibleAvailableTables = tables.filter(t => {
    const isAvailable = t.status === 'available' || t.id === selectedTableId;
    const isCapacitySuitable = typeof personsCount === 'number' && t.capacity >= personsCount;
    const matchesCategory = selectedPlaceTypeId === premiumId
      ? (t.placeTypeId === 'PREMIUM_LOUNGE' || t.tableNumber.startsWith('L-'))
      : (t.placeTypeId === 'STANDING_BAR' || t.tableNumber.startsWith('S-') || !t.tableNumber.startsWith('L-'));
    return isAvailable && isCapacitySuitable && matchesCategory;
  });

  if (showContinuePrompt) {
    return (
      <>
        <div className="max-w-md mx-auto my-12">
          <div className="glass-panel p-6 rounded-3xl border border-amber-500/30 bg-amber-500/5 space-y-6 text-center shadow-xl">
            <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto text-amber-500">
              <AlertTriangle size={32} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-text-main">Incomplete Check-In Found</h2>
              <p className="text-sm text-text-muted">
                An incomplete check-in session for a customer is currently saved. Would you like to resume it?
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={handleContinueCheckIn}
                className="w-full py-3.5 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all"
              >
                Resume Check-In
              </button>
              <button
                onClick={() => handleStopCheckInWithConfirmation(handleAbandonCheckIn)}
                className="w-full py-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-bold text-sm hover:bg-red-500/20 active:scale-[0.98] transition-all"
              >
                STOP CHECK-IN
              </button>
            </div>
          </div>
        </div>
        {renderStopCheckInConfirmModal}
        {renderCapacityWarningModal}
      </>
    );
  }

  return (
  <div className="max-w-7xl mx-auto space-y-6">
 
 {/* Wizard Progress Header Bar */}
 <div className="glass-panel p-4 rounded-2xl border border-border-main relative overflow-hidden">
 {/* Background connector line */}
 <div className="absolute left-[6%] right-[6%] top-1/2 -translate-y-1/2 h-[2px] bg-amber-500/10 dark:bg-amber-300/10 -z-10" />
 
 {/* Progress fill line */}
 <div 
 className="absolute left-[6%] top-1/2 -translate-y-1/2 h-[2px] bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500 0_0_8px_rgba(217,119,6,0.3)] 0_0_8px_rgba(251,191,36,0.4)] transition-all duration-500 ease-out -z-10"
 style={{ width: `${((stage - 1) / 4) * 88}%` }}
 />

 <div className="flex items-center justify-between w-full">
 {[
 { num: 1, label: 'Customer Info' },
 { num: 2, label: 'Table Seating' },
 { num: 3, label: 'QR Verification' },
 { num: 4, label: 'Payment Details' },
 { num: 5, label: 'Pass Generated' },
 ].map(step => {
 const isCompleted = stage > step.num;
 const isActive = stage === step.num;
 return (
 <div key={step.num} className="flex flex-col items-center gap-1.5 relative z-10">
 <div 
 className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all duration-300 ${
 isCompleted 
 ? 'bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500 text-black font-black border border-amber-600/30' 
 : isActive 
 ? 'bg-amber-500/10 dark:bg-amber-300/15 text-amber-700 dark:text-amber-300 font-black 0_0_12px_rgba(217,119,6,0.25)] 0_0_15px_rgba(251,191,36,0.3)] ring-2 ring-amber-500/25 dark:ring-amber-300/30 border border-amber-500/40 dark:border-amber-300/50 scale-105' 
 : 'bg-amber-500/[0.03] dark:bg-amber-300/[0.03] text-amber-600/40 dark:text-amber-400/40 border border-amber-500/10 dark:border-amber-300/10'
 }`}
 >
 {isCompleted ? '✓' : step.num}
 </div>
 <span className={`text-[10px] uppercase tracking-wider font-extrabold transition-all hidden md:block ${
  isActive ? 'text-amber-700 dark:text-amber-300' : isCompleted ? 'text-amber-600 dark:text-amber-400/80' : 'text-text-muted'
 }`}>
 {step.label}
 </span>
 </div>
 );
 })}
 </div>

 {/* Mobile-only status text tracker */}
 <div className="text-center mt-2.5 text-[10px] uppercase tracking-widest font-black text-amber-600 dark:text-amber-400 md:hidden">
 Step {stage} of 5: {[
'Customer Info',
 'Table Seating',
 'QR Verification',
 'Payment Details',
 'Pass Generated'
 ][stage - 1]}
 </div>
  {stage !== 5 && (phoneNumber || customerName || email || selectedTableId) && (
    <div className="flex justify-end mt-2 px-2">
      <button
        type="button"
        onClick={() => handleStopCheckInWithConfirmation(handleResetWizard)}
        className="px-3 py-1.5 rounded-lg border border-red-500/20 hover:border-red-500/40 bg-red-500/5 text-[10px] uppercase tracking-wider font-extrabold text-red-500 hover:bg-red-500/10 transition-all flex items-center gap-1 cursor-pointer"
      >
        STOP CHECK-IN
      </button>
    </div>
  )}
 </div>

 {/* Main Dual-Column Desktop Grid */}
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
 
 {/* Left 8 Columns: Active Stage Form Panel */}
 <div className="lg:col-span-8 space-y-6">
 
 {/* STAGE 1: CUSTOMER DETAILS ENTRY */}
 {stage === 1 && (
 <div className="glass-panel p-5 md:p-8 rounded-3xl border border-border-main space-y-6">
 <div className="flex items-center gap-3 pb-4 border-b border-border-main">
 <div className="w-10 h-10 rounded-xl dark:bg-amber-500/15 bg-amber-500/10 dark:text-amber-400 text-amber-700 flex items-center justify-center font-bold">
 <User size={20} />
 </div>
 <div>
 <h3 className="text-lg font-bold text-text-main">Stage 1: Guest Information</h3>
 <p className="text-xs text-text-muted">Enter customer contact details for session check-in</p>
 </div>
 </div>

 {onNavigate && (originalTableStatus === 'reserved' || selectedTableId) && (
   <button
     type="button"
     onClick={() => onNavigate(originalTableStatus === 'reserved' ? 'tables/reservations' : 'tables/layout')}
     className="px-3 py-1.5 rounded-lg border border-border-main text-xs font-semibold text-text-muted hover:text-text-main flex items-center gap-1 cursor-pointer transition-colors w-fit mb-2"
   >
     <ChevronLeft size={14} /> Back to {originalTableStatus === 'reserved' ? 'Reservations' : 'Tables Layout'}
   </button>
 )}

 <form onSubmit={handleStage1Next} className="space-y-5">
 


 {/* 2. CUSTOMER INPUT FIELDS WITH INLINE REAL-TIME VALIDATION */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1.5 flex items-center gap-1.5">
 <Phone size={14} className="text-text-main" /> Phone Number <span className="dark:text-red-400 text-red-700">*</span>
 </label>
 <input
 type="tel"
 value={phoneNumber}
 onChange={e => setPhoneNumber(e.target.value)}
 placeholder="e.g. 9999999999"
 className={`w-full bg-bg-primary border rounded-xl px-4 py-3 text-base md:text-sm text-text-main focus:outline-none transition-all ${
 phoneNumber.trim().length > 0 && (!isValidPhone(phoneNumber) || phoneConflict)
 ? 'border-red-500/80 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
 : 'border-border-main dark:focus:border-[#D4AF37] focus:border-primary focus:ring-2 dark:focus:ring-[#D4AF37]/20 focus:ring-primary/20'
 }`}
 required
 />
 {phoneNumber.trim().length > 0 && !isValidPhone(phoneNumber) && (
 <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 mt-1.5 flex items-center gap-1.5 text-[11px] dark:text-red-400 text-red-700">
 <AlertTriangle size={14} className="shrink-0" />
 <span>Please enter a valid 10-digit Indian mobile number (starts with 6-9).</span>
 </div>
 )}
 {phoneConflict && (
 <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 mt-1.5 flex items-center gap-1.5 text-[11px] dark:text-red-400 text-red-700">
 <AlertTriangle size={14} className="shrink-0" />
 <span>This phone number is already checked in.</span>
 </div>
 )}
 </div>

 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1.5 flex items-center gap-1.5">
 <User size={14} className="text-text-main" /> Customer Full Name <span className="dark:text-red-400 text-red-700">*</span>
 </label>
 <input
 type="text"
 value={customerName}
 onChange={e => setCustomerName(e.target.value)}
 placeholder="e.g. First Last"
 className={`w-full bg-bg-primary border rounded-xl px-4 py-3 text-base md:text-sm text-text-main focus:outline-none transition-all ${
 customerName.trim().length > 0 && !isNameOk
 ? 'border-red-500/80 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
 : 'border-border-main dark:focus:border-[#D4AF37] focus:border-primary focus:ring-2 dark:focus:ring-[#D4AF37]/20 focus:ring-primary/20'
 }`}
 required
 />
 {customerName.trim().length > 0 && !isNameOk && (
 <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 mt-1.5 flex items-center gap-1.5 text-[11px] dark:text-red-400 text-red-700">
 <AlertTriangle size={14} className="shrink-0" />
 <span>Full name must be 2-100 characters (letters, spaces, dots, apostrophes only).</span>
 </div>
 )}
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <div className="flex items-center justify-between mb-1.5">
 <label className="text-xs font-semibold text-text-muted flex items-center gap-1.5">
 <Mail size={14} className="text-text-main" /> Email Address
 </label>
 <span className="text-[10px] font-extrabold uppercase tracking-wider dark:text-red-400 text-red-700">
 REQUIRED
 </span>
 </div>
 <input
 type="email"
 value={email}
 onChange={e => setEmail(e.target.value)}
 placeholder="e.g. name@example.com"
 className={`w-full bg-bg-primary border rounded-xl px-4 py-3 text-base md:text-sm text-text-main focus:outline-none transition-all ${
    email.trim().length === 0 || !isValidEmail(email) || emailConflict
    ? 'border-red-500/80 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
    : 'border-border-main dark:focus:border-[#D4AF37] focus:border-primary focus:ring-2 dark:focus:ring-[#D4AF37]/20 focus:ring-primary/20'
  }`}
  />
  {email.trim().length === 0 && (
    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 mt-1.5 flex items-center gap-1.5 text-[11px] dark:text-red-400 text-red-700">
      <AlertTriangle size={14} className="shrink-0" />
      <span>Email address is strictly required for Digital Email QR Pass delivery.</span>
    </div>
  )}
 {email.trim().length > 0 && !isValidEmail(email) && (
 <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 mt-1.5 flex items-center gap-1.5 text-[11px] dark:text-red-400 text-red-700">
 <AlertTriangle size={14} className="shrink-0" />
 <span>Please enter a valid email address (e.g. name@domain.com).</span>
 </div>
 )}
 {emailConflict && (
 <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 mt-1.5 flex items-center gap-1.5 text-[11px] dark:text-red-400 text-red-700">
 <AlertTriangle size={14} className="shrink-0" />
 <span>This email ID is already checked in.</span>
 </div>
 )}
 </div>

 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1.5 flex items-center gap-1.5">
 <Users size={14} className="text-text-main" /> Guest Headcount (Persons)
 </label>
 
 {/* Custom Increment/Decrement and Editable Input Control */}
 <div className={`flex items-center justify-between mb-3 bg-bg-primary border rounded-xl p-1 w-full max-w-[160px] transition-all duration-200 ${
 personsCount !== '' && !isCapacityOk
 ? 'border-red-500/80 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/20'
 : 'border-border-main dark:focus-within:border-[#D4AF37] focus-within:border-primary focus-within:ring-2 dark:focus-within:ring-[#D4AF37]/20 focus-within:ring-primary/20'
 }`}>
 <button
 type="button"
 onClick={() => handlePersonsCountChange(Math.max(1, personsCountNum - 1))}
 disabled={personsCountNum <= 1}
 className="w-7 h-7 rounded-lg bg-bg-card hover:bg-bg-primary text-text-main flex items-center justify-center disabled:opacity-30 disabled:hover:bg-bg-card transition-all cursor-pointer border border-border-main/40 shrink-0"
 title={personsCountNum <= 1 ? "Minimum 1 guest" : "Decrease headcount"}
 >
 <Minus size={10} className="stroke-[3]" />
 </button>
 <input
 type="text"
 inputMode="numeric"
 pattern="[0-9]*"
 value={personsCount}
 placeholder="2"
 onChange={e => handlePersonsCountChange(e.target.value)}
 className="w-12 bg-transparent text-center text-base md:text-sm font-black text-text-main focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-text select-all"
 />
 <button
 type="button"
 onClick={() => handlePersonsCountChange(personsCountNum + 1)}
 disabled={personsCountNum >= maxCapacity}
 className="w-7 h-7 rounded-lg bg-bg-card hover:bg-bg-primary text-text-main flex items-center justify-center disabled:opacity-30 disabled:hover:bg-bg-card transition-all cursor-pointer border border-border-main/40 shrink-0"
 title={personsCountNum >= maxCapacity ? "Maximum seats reached" : "Increase headcount"}
 >
 <Plus size={10} className="stroke-[3]" />
 </button>
 </div>

 <div className="flex flex-wrap items-center gap-2">
 {quickSelectButtons.map((count: number) => (
 <button
 type="button"
 key={count}
 onClick={() => handlePersonsCountChange(count)}
 className={`px-3.5 py-2.5 text-xs font-bold transition-all ${
 personsCount === count
 ? 'premium-tab-secondary active active:scale-95'
 : count > maxCapacity 
 ? 'bg-bg-primary text-gray-600 border-border-main line-through opacity-50 cursor-not-allowed'
 : 'premium-tab-secondary active:scale-95'
 }`}
 >
 {count} {count === 1 ? 'Guest' : 'Guests'}
 </button>
 ))}
 </div>
 </div>
 </div>

 {/* STAGE 1 SUBMIT BUTTON (STRICTLY DISABLED UNTIL isStep1Valid IS TRUE) */}
 <div className="pt-4 flex flex-col sm:flex-row items-center sm:justify-between gap-4 border-t border-border-main">
 <div className="text-xs text-text-muted w-full sm:w-auto text-center sm:text-left">
 {!isStep1Valid ? (
 <span className="dark:text-amber-400 text-amber-700 flex items-center justify-center sm:justify-start gap-1">
 <AlertTriangle size={14} /> Complete all required fields above to proceed
 </span>
 ) : (
 <span className="dark:text-emerald-400 text-emerald-700 font-bold flex items-center justify-center sm:justify-start gap-1">
 ✓ All inputs validated
 </span>
 )}
 </div>

 <button
 type="submit"
 disabled={!isStep1Valid}
 title={!isStep1Valid ? "Fill required details" : undefined}
 className="px-8 py-3.5 rounded-xl primary-btn flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider transition-all w-full sm:w-auto"
 >
 <span>Proceed to Seating Plan</span>
 <ChevronRight size={16} />
 </button>
 </div>
 </form>
 </div>
 )}

 {/* STAGE 2: SEATING ZONE & RATE SELECTION */}
 {stage === 2 && (
 <div className="glass-panel p-5 md:p-8 rounded-3xl border border-border-main space-y-6">
 <div className="flex items-center gap-3 pb-4 border-b border-border-main">
 <div className="w-10 h-10 rounded-xl dark:bg-amber-500/15 bg-amber-500/10 dark:text-amber-400 text-amber-700 flex items-center justify-center font-bold">
 <Grid3X3 size={20} />
 </div>
 <div>
 <h3 className="text-lg font-bold text-text-main">Stage 2: Rate Category & Seating Plan</h3>
 <p className="text-xs text-text-muted">Select rate plan and assign floor seating table</p>
 </div>
 </div>

 <div>
 <label className="block text-xs font-semibold text-text-muted mb-2">1. Select Rate Category</label>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {(rates.length > 0 ? rates : [
 { id: 'standing_bar', name: 'Standing Bar', ratePerPerson: 500, redemptionsPerPerson: 2, baseTimeMinutes: 120 },
 { id: 'premium_lounge', name: 'Premium Lounge', ratePerPerson: 1000, redemptionsPerPerson: 4, baseTimeMinutes: 180 },
 ]).map(rc => {
 const rcId = rc.id || (rc.name?.toLowerCase().includes('lounge') ? premiumId : standardId);
 const isSel = selectedPlaceTypeId === rcId;
 const isAvailable = rcId === premiumId
 ? personsCountNum <= premiumMaxCapacity
 : personsCountNum <= standardMaxCapacity;

 return (
 <div
 key={rcId}
 onClick={() => {
 if (isAvailable) {
 setSelectedPlaceTypeId(rcId);
 } else {
 showToast(`${rc.name || (rcId === premiumId ? 'Premium Lounge' : 'Standing Bar')} is unavailable for a group of ${personsCount} (Max table capacity is ${rcId === premiumId ? premiumMaxCapacity : standardMaxCapacity} seats).`, 'warning');
 }
 }}
 className={`p-5 rounded-2xl border transition-all flex flex-col justify-between h-36 ${
 !isAvailable
 ? 'bg-bg-primary/40 border-border-main/50 opacity-40 cursor-not-allowed'
 : isSel
 ? 'dark:bg-[#D4AF37]/15 bg-primary/10 dark:border-[#D4AF37] border-primary cursor-pointer'
 : 'bg-bg-primary border-border-main hover:bg-bg-card cursor-pointer'
 }`}
 >
 <div className="flex items-center justify-between">
 <span className="font-bold text-text-main text-sm">{rc.name || (rcId === 'premium_lounge' ? 'Premium Lounge' : 'Standing Bar')}</span>
 {!isAvailable ? (
 <span className="text-[9px] font-bold bg-red-500/10 border border-red-500/20 text-red-500 px-2 py-0.5 rounded-full uppercase tracking-wider">
 Unavailable
 </span>
 ) : isSel ? (
 <CheckCircle2 size={18} className="text-text-main" />
 ) : null}
 </div>
 <div>
 <p className="text-2xl font-black text-text-main">₹{rc.ratePerPerson} <span className="text-xs text-text-muted font-normal">/ person</span></p>
 <p className="text-[11px] dark:text-amber-300 text-amber-700 mt-1 font-semibold">
 {rc.redemptionsPerPerson || 2} Drinks Included • {Math.round((rc.baseTimeMinutes || 120) / 60)} Hours
 </p>
 </div>
 </div>
 );
 })}
 </div>
 </div>

 <div>
 <label className="block text-xs font-semibold text-text-muted mb-2">2. Assign Seating Table (Filtered for {personsCountNum} Guests)</label>
 {compatibleAvailableTables.length === 0 ? (
 <p className="text-xs text-text-muted py-3">No available tables with capacity for {personsCountNum} guests in this zone. You may proceed without table assignment.</p>
 ) : (
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 {compatibleAvailableTables.map(tb => {
 const isSel = selectedTableId === tb.id;
 return (
 <button
 key={tb.id}
 type="button"
 onClick={() => handleTableSelect(tb)}
 className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
 isSel
 ? 'bg-emerald-500/20 border-emerald-400 dark:text-emerald-300 text-emerald-700 font-bold '
 : 'bg-bg-primary border-border-main text-text-muted hover:bg-bg-card'
 }`}
 >
 <p className="font-mono text-sm font-black">{tb.tableNumber}</p>
 <p className="text-[10px] text-text-muted mt-0.5">{personsCountNum} / {tb.capacity} Seats</p>
 </button>
 );
 })}
 </div>
 )}
 </div>

 <div className="pt-4 flex flex-col-reverse sm:flex-row items-center sm:justify-between gap-3">
 <button
 type="button"
 onClick={() => setStage(1)}
 className="px-6 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all premium-btn-secondary w-full sm:w-auto"
 >
 <ChevronLeft size={16} /> Back
 </button>

  <button
  type="button"
  disabled={!selectedTableId || isSendingQr}
  onClick={handleStage2Submit}
  className="px-8 py-3.5 rounded-xl primary-btn flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
  >
  <span>{getStage2ButtonText()}</span>
  <ChevronRight size={16} />
  </button>
  </div>
 </div>
 )}

 {/* STAGE 3: QR PASS SCAN & VERIFY */}
 {stage === 3 && (
 <div className="glass-panel p-5 md:p-8 rounded-3xl border border-border-main space-y-6">
 <div className="flex items-center gap-3 pb-4 border-b border-border-main">
 <div className="w-10 h-10 rounded-xl dark:bg-amber-500/15 bg-amber-500/10 dark:text-amber-400 text-amber-700 flex items-center justify-center font-bold">
 <QrCode size={20} />
 </div>
 <div>
 <h3 className="text-lg font-bold text-text-main">Stage 3: Guest QR Verification</h3>
 <p className="text-xs text-text-muted">Scan pre-registration QR code or enter token number manually</p>
 </div>
 </div>

 {/* Live Camera Viewfinder Layer */}
 <div className="relative rounded-2xl overflow-hidden bg-bg-primary border border-border-main aspect-[3/4] sm:aspect-video max-h-[55vh] lg:max-h-[60vh] flex flex-col items-center justify-center ">
 {cameraActive ? (
 <>
 <video 
 ref={videoRef} 
 autoPlay 
 playsInline 
 muted 
 className="w-full h-full object-cover" 
 />
 
 {/* Ambient Scanning Line across the full view */}
 <div className="absolute left-0 right-0 h-[2px] bg-emerald-500/60 top-1/2 -translate-y-1/2 z-20 shadow-[0_0_12px_#10B981] animate-pulse" />
 
 {/* Smart Full-Frame Corner Brackets */}
 <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-emerald-400 rounded-tl-lg pointer-events-none z-10" />
 <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-emerald-400 rounded-tr-lg pointer-events-none z-10" />
 <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-emerald-400 rounded-bl-lg pointer-events-none z-10" />
 <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-emerald-400 rounded-br-lg pointer-events-none z-10" />

 {/* Ambient Text Identifier */}
 <div className="absolute top-4 left-12 z-10 bg-black/60 px-2 py-0.5 rounded-md border border-white/10">
 <span className="text-[9px] text-emerald-400 font-black uppercase tracking-wider">Full-Frame Auto Scanner</span>
 </div>

 <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 w-[90%] sm:w-max max-w-[280px] px-4 py-1.5 rounded-full border border-border-main z-30 flex items-center justify-center">
 <p className="text-[10px] text-text-main font-extrabold uppercase tracking-widest text-center leading-tight">
 Place QR Code anywhere in the camera view
 </p>
 </div>

 {/* Camera Control Switches */}
 <div className="absolute top-4 right-4 flex gap-2 z-30">
 <button
 type="button"
 onClick={toggleFacingMode}
 className="px-2.5 py-1.5 rounded-lg bg-black/75 hover:bg-black text-[10px] font-bold text-white border border-white/15 transition-all cursor-pointer"
 >
 Switch Source
 </button>
 <button
 type="button"
 onClick={stopCamera}
 className="px-2.5 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-[10px] font-bold text-white border border-red-500/30 transition-all cursor-pointer"
 >
 Close Viewfinder
 </button>
 </div>
 </>
 ) : (
 <div className="text-center p-6 space-y-4">
 <QrCode className="mx-auto text-text-muted animate-pulse" size={44} />
 <div>
 <p className="text-xs text-text-muted font-bold">Live QR Scanner Inactive</p>
 <p className="text-[10px] text-text-muted mt-0.5">Activate camera to verify digital passes automatically</p>
 </div>
 {cameraError && (
 <p className="text-[11px] dark:text-amber-400 text-amber-700 font-semibold max-w-md mx-auto">{cameraError}</p>
 )}
 <button
 type="button"
 onClick={() => startCamera(facingMode)}
 className="px-5 py-2.5 rounded-xl bg-bg-primary hover:bg-bg-card text-xs font-bold text-text-muted border border-border-main inline-flex items-center gap-2 transition-all cursor-pointer "
 >
 <Camera size={14} /> Start Camera Scanner
 </button>
 </div>
 )}
 </div>

 {/* Manual Input Fallback */}
 <div className="space-y-2.5">
 <label className="block text-xs font-semibold text-text-muted">Or Input Token Number Manually</label>
 <div className="flex flex-col sm:flex-row gap-2.5">
 <input
 type="text"
 value={qrCodeInput}
 onChange={e => {
 setQrCodeInput(e.target.value.toUpperCase());
 setQrVerificationError(null);
 }}
 placeholder="e.g. BAR-20260728-1"
 className="flex-1 bg-bg-primary border border-border-main rounded-xl px-4 py-2.5 text-base md:text-sm text-text-main font-mono placeholder-gray-500 focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary focus:ring-2 dark:focus:ring-[#D4AF37]/20 focus:ring-primary/20"
 />
 <button
 type="button"
 disabled={isVerifyingQr || !qrCodeInput.trim()}
 title={isVerifyingQr ? "Verification in progress" : !qrCodeInput.trim() ? "Enter QR Code" : undefined}
 onClick={() => handleVerifyQR(qrCodeInput)}
 className="px-6 py-2.5 rounded-xl primary-btn text-xs font-black uppercase tracking-wider disabled:opacity-40 transition-all cursor-pointer w-full sm:w-auto"
 >
 {isVerifyingQr ? 'Verifying...' : 'Verify Token'}
 </button>
 </div>

 {qrVerificationError && (
 <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-center gap-1.5 text-[11px] dark:text-red-400 text-red-700">
 <AlertTriangle size={14} className="shrink-0" />
 <span>{qrVerificationError}</span>
 </div>
 )}

 {qrVerificationSuccess && (
 <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 flex items-center gap-1.5 text-[11px] dark:text-emerald-400 text-emerald-700">
 <CheckCircle2 size={14} className="shrink-0" />
 <span>Token verified! Member details populated successfully.</span>
 </div>
 )}
 </div>

 {/* Stage Navigation Buttons */}
 <div className="pt-4 border-t border-border-main flex flex-col-reverse sm:flex-row items-center sm:justify-between gap-3">
 <button
 type="button"
 onClick={() => {
 stopCamera();
 if (preselectedTable) {
 setStage(1); // Go back to stage 1 if preselected from table plan
 } else {
 setStage(2);
 }
 }}
 className="px-6 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all premium-btn-secondary w-full sm:w-auto"
 >
 <ChevronLeft size={16} /> Back
 </button>

  <button
  type="button"
  disabled={!qrVerificationSuccess}
  onClick={() => {
  stopCamera();
  setStage(4);
  }}
  className={`px-8 py-3.5 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider w-full sm:w-auto transition-all ${
    qrVerificationSuccess 
      ? 'primary-btn cursor-pointer' 
      : 'bg-neutral-200 dark:bg-neutral-800 text-text-muted cursor-not-allowed opacity-50'
  }`}
  >
  <span>Proceed to Payment</span>
  <ChevronRight size={16} />
  </button>
  </div>
 </div>
 )}

 {/* STAGE 4: PAYMENT DETAILS */}
 {stage === 4 && (
 <div className="glass-panel p-5 md:p-8 rounded-3xl border border-border-main space-y-6">
 <div className="flex items-center gap-3 pb-4 border-b border-border-main">
 <div className="w-10 h-10 rounded-xl dark:bg-amber-500/15 bg-amber-500/10 dark:text-amber-400 text-amber-700 flex items-center justify-center font-bold">
 <CreditCard size={20} />
 </div>
 <div>
 <h3 className="text-lg font-bold text-text-main">Stage 4: Payment Method & Confirmation</h3>
 <p className="text-xs text-text-muted">Collect payment and complete check-in pass issuance</p>
 </div>
 </div>

 <form onSubmit={handleFinalCheckInSubmit} className="space-y-6">

 <div>
 <label className="block text-xs font-semibold text-text-muted mb-2">Payment Method</label>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <button
 type="button"
 onClick={() => setPaymentMode('CASH')}
 className={`py-3.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
 paymentMode === 'CASH'
 ? 'dark:bg-[#D4AF37] bg-primary dark:text-black text-white dark:border-[#D4AF37] border-primary font-black '
 : 'bg-bg-primary text-text-muted border-border-main hover:bg-bg-card'
 }`}
 >
 💵 Cash Payment
 </button>
 <button
 type="button"
 onClick={() => setPaymentMode('UPI')}
 className={`py-3.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
 paymentMode === 'UPI'
 ? 'dark:bg-[#D4AF37] bg-primary dark:text-black text-white dark:border-[#D4AF37] border-primary font-black '
 : 'bg-bg-primary text-text-muted border-border-main hover:bg-bg-card'
 }`}
 >
 📲 UPI / Digital Pay
 </button>
 </div>
 </div>

 <div className="pt-4 flex flex-col-reverse sm:flex-row items-center sm:justify-between gap-3 border-t border-border-main mt-4">
 <button
 type="button"
 onClick={() => setStage(3)}
 className="px-6 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all premium-btn-secondary w-full sm:w-auto"
 >
 <ChevronLeft size={16} /> Back
 </button>

 <button
 type="submit"
 disabled={isSubmitting || !isStep1Valid}
 title={isSubmitting ? "Check-in in progress" : !isStep1Valid ? "Verify token first" : undefined}
 className="px-8 py-3.5 rounded-xl primary-btn flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer w-full sm:w-auto"
 >
 {isSubmitting ? (
 <span>Issuing Pass...</span>
 ) : (
 <>
 <span>Confirm Check-In & Issue Pass</span>
 <CheckCircle2 size={16} />
 </>
 )}
 </button>
 </div>
 </form>
 </div>
 )}

 {/* STAGE 5: CHECK-IN SUCCESS PASS TICKET */}
 {stage === 5 && createdToken && (
 <div className="glass-panel p-5 md:p-8 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 space-y-6 text-center">
 <div className="w-16 h-16 rounded-full bg-emerald-500/20 dark:text-emerald-400 text-emerald-700 flex items-center justify-center mx-auto">
 <CheckCircle2 size={36} />
 </div>
 <div>
 <h3 className="text-xl font-black text-text-main">Check-In Successful!</h3>
 <p className="text-xs text-text-muted mt-1">Pass Issued for {createdToken.customer?.name || (createdToken as any).customerName}</p>
 </div>

 <div className="glass-panel p-6 rounded-2xl border border-border-main text-left space-y-3 font-mono text-xs max-w-md mx-auto">
 <div className="flex justify-between border-b border-border-main pb-2">
 <span className="text-text-muted">Token Number:</span>
 <span className="font-bold text-text-main">{createdToken.tokenNumber}</span>
 </div>
 <div className="flex justify-between border-b border-border-main pb-2">
 <span className="text-text-muted">Customer Phone:</span>
 <span className="text-text-main">{createdToken.customer?.phoneNumber || (createdToken as any).phoneNumber}</span>
 </div>
 <div className="flex justify-between border-b border-border-main pb-2">
 <span className="text-text-muted">Customer Email:</span>
 <span className="text-text-main truncate max-w-[200px]" title={createdToken.customer?.email || (createdToken as any).email}>{createdToken.customer?.email || (createdToken as any).email || '—'}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-text-muted">Drink Allowance:</span>
 <span className="dark:text-amber-300 text-amber-700 font-bold">{totalAllowedDrinks} Drinks ({createdToken.redemptionsUsed} Used)</span>
 </div>
 </div>

 <button
 type="button"
 onClick={handleResetWizard}
 className="px-8 py-3.5 rounded-xl primary-btn text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
 >
 <RotateCcw size={16} /> Check In Next Guest
 </button>
 </div>
 )}
 </div>

 {/* Right 4 Columns: Live Billing Summary Receipt Side Panel */}
 <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-6">
 {/* Header Card */}
 <div className="glass-panel p-6 rounded-3xl border border-border-main space-y-5 ">
 <div className="flex items-center gap-2.5 pb-3.5 border-b border-border-main">
 <Receipt size={18} className="text-text-main" />
 <h4 className="text-xs font-black text-text-main uppercase tracking-wider font-sans">
 {selectedTableId ? 'Live Check-In Receipt' : 'Live Rate Comparison'}
 </h4>
 </div>

 {selectedTableId ? (
 /* Single Selected Area Receipt (Only after Table Selection) */
 <div className="space-y-4 text-xs font-sans">
 {/* Customer & Delivery Channel Info Card */}
 <div className="p-3.5 rounded-2xl bg-bg-primary border border-border-main space-y-2.5">
 <p className="text-[9px] font-black uppercase text-text-muted tracking-widest">Customer Details</p>
 <div className="flex justify-between items-center text-text-muted">
 <span>Name:</span>
 <span className="font-bold text-text-main text-right truncate max-w-[160px]" title={customerName}>{customerName || '—'}</span>
 </div>
 <div className="flex justify-between items-center text-text-muted">
 <span>Phone:</span>
 <span className="font-mono font-bold text-text-main text-right">{phoneNumber || '—'}</span>
 </div>
 <div className="flex justify-between items-center text-text-muted">
 <span>Email:</span>
 <span className="font-mono font-bold text-text-main text-right truncate max-w-[160px]" title={email}>{email || '—'}</span>
 </div>
 </div>

 {/* Seating Assignment Info Card */}
 <div className="p-3.5 rounded-2xl bg-bg-primary border border-border-main space-y-2.5">
 <p className="text-[9px] font-black uppercase text-text-muted tracking-widest">Seating Assignment</p>
 <div className="flex justify-between items-center text-text-muted">
 <span>Selected Area:</span>
 <span className="font-bold text-text-main text-right">{currentRateCard.name}</span>
 </div>
 <div className="flex justify-between items-center text-text-muted">
 <span>Assigned Table:</span>
 <span className="font-mono font-bold dark:text-emerald-400 text-emerald-700 text-right">
 {selectedTableObj ? `Table ${selectedTableObj.tableNumber}` : '🚨 Unassigned'}
 </span>
 </div>
 <div className="flex justify-between items-center text-text-muted">
 <span>Guest Headcount:</span>
 <span className="font-bold text-text-main text-right">{personsCountNum} {personsCountNum === 1 ? 'Person' : 'Persons'}</span>
 </div>
 </div>

 {/* Calculation & Pricing Card */}
 <div className="p-3.5 rounded-2xl bg-bg-primary border border-border-main space-y-2.5">
 <p className="text-[9px] font-black uppercase text-text-muted tracking-widest">Cover Calculation</p>
 <div className="flex justify-between items-center text-text-muted">
 <span>Base Cover / Guest:</span>
 <span className="text-text-main font-bold">₹{currentRateCard.ratePerPerson}</span>
 </div>
 <div className="flex justify-between items-center text-text-muted">
 <span>Hourly Duration:</span>
 <span className="dark:text-emerald-400 text-emerald-700 font-bold">{Math.round((currentRateCard.baseTimeMinutes || 120) / 60)} Hours</span>
 </div>
 <div className="flex justify-between items-center text-text-muted">
 <span>Drink Allowance:</span>
 <span className="dark:text-amber-300 text-amber-700 font-bold">{currentRateCard.redemptionsPerPerson} Drinks / Person</span>
 </div>
 <div className="border-t border-border-main/50 pt-2.5 mt-1 space-y-2">
 <div className="flex justify-between items-center text-text-muted">
 <span>Cover Charge Calculation:</span>
 <span className="font-mono text-text-main font-bold">₹{currentRateCard.ratePerPerson} × {personsCountNum}</span>
 </div>
 <div className="flex justify-between items-center text-text-muted">
 <span>Beverages Allocation:</span>
 <span className="font-mono dark:text-amber-300 text-amber-700 font-bold">{currentRateCard.redemptionsPerPerson} × {personsCountNum} = {totalAllowedDrinks} Drinks</span>
 </div>
 </div>
 </div>

 {/* Total Summary Footer */}
 <div className="pt-4 border-t border-border-main flex justify-between items-center bg-bg-primary -mx-6 -mb-6 p-6 rounded-b-3xl">
 <div>
 <span className="text-[10px] text-text-muted uppercase font-black tracking-wider">Total Payable Amount</span>
 <p className="text-[10px] text-text-muted mt-0.5">Includes entry cover & drinks</p>
 </div>
 <div className="text-right">
 <span className="text-2xl font-black text-text-main">₹{calculatedTotal}</span>
 </div>
 </div>
 </div>
 ) : (
 /* Before Table Selection: Compare both sections side-by-side or stacked */
 <div className="space-y-4 text-xs font-sans">
 <p className="text-[10px] font-black uppercase text-text-muted tracking-wider">
 Compare Seating Cover Options
 </p>

 {/* Standard Bar Summary */}
 {(() => {
 const standardRate = dbStandardRate || {
 id: 'standing_bar',
 name: 'Standing Bar',
 ratePerPerson: 500,
 baseTimeMinutes: 120,
 redemptionsPerPerson: 2,
 };
 const standardAvailableCount = tables.filter(t => (t.placeTypeId === 'STANDING_BAR' || t.tableNumber.startsWith('S-') || !t.tableNumber.startsWith('L-')) && t.status === 'available' && t.capacity >= personsCountNum).length;
 const isAvailable = personsCountNum > 0 && personsCountNum <= standardMaxCapacity;
 const standardTotal = (standardRate.ratePerPerson || 0) * personsCountNum;
 const standardDrinks = (standardRate.redemptionsPerPerson || 0) * personsCountNum;

 return (
 <div className={`p-4 rounded-2xl border transition-all ${
 !isAvailable 
 ? 'bg-bg-primary/50 border-border-main opacity-50' 
 : 'bg-bg-primary border-border-main'
 }`}>
 <div className="flex justify-between items-center pb-2 border-b border-border-main/50 mb-2">
 <span className="font-bold text-text-main">Standard Bar</span>
 {!isAvailable ? (
 <span className="text-[8px] font-bold bg-red-500/10 border border-red-500/20 text-red-500 px-2 py-0.5 rounded-full uppercase">
 {personsCountNum === 0 ? 'No Headcount' : 'Unavailable'}
 </span>
 ) : (
 <span className="text-[8px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded-full uppercase">
 Available
 </span>
 )}
 </div>
 <div className="space-y-1.5 text-[11px]">
 <div className="flex justify-between text-text-muted">
 <span>Rate per Head:</span>
 <span className="text-text-main font-bold">₹{standardRate.ratePerPerson}</span>
 </div>
 <div className="flex justify-between text-text-muted">
 <span>Max Seat Support:</span>
 <span className="text-text-main font-bold">{standardMaxCapacity} Seats</span>
 </div>
 <div className="flex justify-between text-text-muted">
 <span>Available Tables:</span>
 <span className="text-text-main font-bold">{standardAvailableCount} Tables</span>
 </div>
 <div className="flex justify-between text-text-muted">
 <span>Beverage Quota:</span>
 <span className="dark:text-amber-300 text-amber-700 font-bold">{standardDrinks} Drinks</span>
 </div>
 {personsCountNum > 0 && (
 <div className="flex justify-between text-text-muted">
 <span>Calculation:</span>
 <span className="font-mono text-text-main">₹{standardRate.ratePerPerson} × {personsCountNum}</span>
 </div>
 )}
 <div className="flex justify-between items-baseline pt-1.5 border-t border-border-main/50 mt-1">
 <span className="font-bold text-text-main">Estimated Cost:</span>
 <span className="text-base font-black text-text-main">₹{standardTotal}</span>
 </div>
 </div>
 </div>
 );
 })()}

 {/* Premium Lounge Summary */}
 {(() => {
 const premiumRate = dbPremiumRate || {
 id: 'premium_lounge',
 name: 'Premium Lounge',
 ratePerPerson: 1000,
 baseTimeMinutes: 180,
 redemptionsPerPerson: 4,
 };
 const premiumAvailableCount = tables.filter(t => (t.placeTypeId === 'PREMIUM_LOUNGE' || t.tableNumber.startsWith('L-')) && t.status === 'available' && t.capacity >= personsCountNum).length;
 const isAvailable = personsCountNum > 0 && personsCountNum <= premiumMaxCapacity;
 const premiumTotal = (premiumRate.ratePerPerson || 0) * personsCountNum;
 const premiumDrinks = (premiumRate.redemptionsPerPerson || 0) * personsCountNum;

 return (
 <div className={`p-4 rounded-2xl border transition-all ${
 !isAvailable 
 ? 'bg-bg-primary/50 border-border-main opacity-50' 
 : 'bg-bg-primary border-border-main'
 }`}>
 <div className="flex justify-between items-center pb-2 border-b border-border-main/50 mb-2">
 <span className="font-bold text-text-main">Premium Lounge</span>
 {!isAvailable ? (
 <span className="text-[8px] font-bold bg-red-500/10 border border-red-500/20 text-red-500 px-2 py-0.5 rounded-full uppercase">
 {personsCountNum === 0 ? 'No Headcount' : 'Unavailable'}
 </span>
 ) : (
 <span className="text-[8px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded-full uppercase">
 Available
 </span>
 )}
 </div>
 <div className="space-y-1.5 text-[11px]">
 <div className="flex justify-between text-text-muted">
 <span>Rate per Head:</span>
 <span className="text-text-main font-bold">₹{premiumRate.ratePerPerson}</span>
 </div>
 <div className="flex justify-between text-text-muted">
 <span>Max Seat Support:</span>
 <span className="text-text-main font-bold">{premiumMaxCapacity} Seats</span>
 </div>
 <div className="flex justify-between text-text-muted">
 <span>Available Tables:</span>
 <span className="text-text-main font-bold">{premiumAvailableCount} Tables</span>
 </div>
 <div className="flex justify-between text-text-muted">
 <span>Beverage Quota:</span>
 <span className="dark:text-amber-300 text-amber-700 font-bold">{premiumDrinks} Drinks</span>
 </div>
 {personsCountNum > 0 && (
 <div className="flex justify-between text-text-muted">
 <span>Calculation:</span>
 <span className="font-mono text-text-main">₹{premiumRate.ratePerPerson} × {personsCountNum}</span>
 </div>
 )}
 <div className="flex justify-between items-baseline pt-1.5 border-t border-border-main/50 mt-1">
 <span className="font-bold text-text-main">Estimated Cost:</span>
 <span className="text-base font-black text-text-main">₹{premiumTotal}</span>
 </div>
 </div>
 </div>
 );
 })()}

 <div className="bg-bg-primary border border-border-main p-3 rounded-2xl text-[10px] text-text-muted">
 🚨 Please select a table in Stage 2 to generate the final receipt pass.
 </div>
 </div>
 )}
 </div>
 </div>

      {renderStopCheckInConfirmModal}
      {renderCapacityWarningModal}
      {showPaymentCollectedConfirm && (
        <div className="fixed inset-0 z-[100] dark:bg-black/75 bg-slate-900/35 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-main rounded-3xl p-5 sm:p-6 w-full max-w-md space-y-4 relative text-text-main animate-fadeIn">
            <h3 className="text-base font-black uppercase tracking-wider text-primary">Confirm Payment Collection?</h3>
            <p className="text-xs text-text-muted">
              Payment has been collected. Do you want to proceed with Check-In?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={executeFinalCheckIn}
                className="flex-1 py-2.5 rounded-xl primary-btn text-xs font-bold uppercase tracking-wider cursor-pointer border-none"
              >
                YES — Proceed
              </button>
              <button
                onClick={() => setShowPaymentCollectedConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-bg-primary hover:bg-bg-card border border-border-main text-xs font-bold text-text-muted hover:text-text-main cursor-pointer"
              >
                NO — Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
 );
};
