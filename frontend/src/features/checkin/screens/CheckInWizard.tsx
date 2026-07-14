import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, 
  ActivityIndicator, StyleSheet, Platform, Alert, Modal, Image,
  Animated, LayoutAnimation, UIManager, BackHandler
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNfcBar } from '../../../context/NfcBarContext';
import { useTheme } from '../../../context/ThemeContext';
import { SessionToken, PlaceType, TableStatus, TokenStatus, UserRole } from '../../../types/nfc_bar';
import { isTableExpiring } from '../../../context/nfc_bar_utils';
import { AppIcon } from '../../../components/common/AppIcon';
import nfcService from '../../../services/nfc/nfcManager';
import { useResponsive } from '../../../utils/responsive';
import { AlertModal } from '../../../components/common/AlertModal';
import { ProgressOverlay } from '../../../components/common/ProgressOverlay';
import { useActionProgress } from '../../../utils/actionProgress';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const CheckInWizard: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
  const { 
    tables, sessions, rates, checkInGuest, showToast, 
    preselectedTableNumber, setPreselectedTableNumber, tokenType, 
    nfcEnabled, emailQrEnabled,
    createPendingSession, verifyQrCode, activatePendingSession, cancelPendingSession, setTab, setOverlayActive,
    pendingSessions, fetchPendingSessions, resumingPendingSession, setResumingPendingSession
  } = useNfcBar();
  const { loadingAction, secondsLeft, startAction, stopAction, isProcessing } = useActionProgress();
  const { colors, isDark } = useTheme();
  const { getTableColumns } = useResponsive();
  const cols = getTableColumns();
  const itemWidth = `${(100 / cols) - 0.1}%` as any;
  const [stepState, setStepState] = useState<number>(1);
  const setStep = (nextStep: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStepState(nextStep);
  };
  const step = stepState;

  const [isNfcWriting, setIsNfcWriting] = useState(false);

  // Animated values for Pax stepper buttons
  const minusScale = useRef(new Animated.Value(1)).current;
  const plusScale = useRef(new Animated.Value(1)).current;

  // Animated value for NFC writing loop
  const radarAnim = useRef(new Animated.Value(0)).current;

  const animateButton = (scale: Animated.Value) => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 40, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true })
    ]).start();
  };

  useEffect(() => {
    if (isNfcWriting) {
      radarAnim.setValue(0);
      Animated.loop(
        Animated.timing(radarAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true
        })
      ).start();
    } else {
      radarAnim.stopAnimation();
    }
  }, [isNfcWriting]);

  const pulseScale1 = radarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.4]
  });
  const pulseOpacity1 = radarAnim.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [0.5, 0.25, 0]
  });

  const pulseScale2 = radarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.25]
  });
  const pulseOpacity2 = radarAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.6, 0.3, 0]
  });

  const [permission, requestPermission] = useCameraPermissions();
  
  const initialMode = nfcEnabled ? 'NFC_CARD' : 'EMAIL_QR';
  const [selectedDeliveryMode, setSelectedDeliveryMode] = useState<'NFC_CARD' | 'EMAIL_QR'>(initialMode);

  // Email QR state variables
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [scannedToken, setScannedToken] = useState<string>('');
  const [isVerifyingQr, setIsVerifyingQr] = useState<boolean>(false);
  const [isActivating, setIsActivating] = useState<boolean>(false);
  const [qrVerificationError, setQrVerificationError] = useState<string | null>(null);
  const [qrVerificationSuccess, setQrVerificationSuccess] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  
  useEffect(() => {
    if (!nfcEnabled && emailQrEnabled) {
      setSelectedDeliveryMode('EMAIL_QR');
    } else if (nfcEnabled && !emailQrEnabled) {
      setSelectedDeliveryMode('NFC_CARD');
    }
  }, [nfcEnabled, emailQrEnabled]);

  useEffect(() => {
    if (step === 5) {
      if (permission && !permission.granted && permission.canAskAgain) {
        requestPermission();
      }
    }
  }, [step, permission]);

  // Form values
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [guestCount, setGuestCount] = useState<number>(1);
  const [placeType, setPlaceType] = useState<PlaceType>('STANDING_BAR');
  const [selectedTableNum, setSelectedTableNum] = useState<string | null>(null);
  const [cardUid, setCardUid] = useState<string>('');
  const [focusedField, setFocusedField] = useState<'name' | 'phone' | 'email' | null>(null);
  const [isTablePreselected, setIsTablePreselected] = useState(false);
  const [showCapacityAlert, setShowCapacityAlert] = useState(false);

  useEffect(() => {
    if (preselectedTableNumber) {
      setSelectedTableNum(preselectedTableNumber);
      const isStanding = preselectedTableNumber.startsWith('S');
      setPlaceType(isStanding ? 'STANDING_BAR' : 'PREMIUM_LOUNGE');
      
      const targetTable = tables.find(t => t.number === preselectedTableNumber);
      if (targetTable) {
        setGuestCount(targetTable.seats);
      }
      
      setIsTablePreselected(true);
      setPreselectedTableNumber(null); // Clear it
    }
  }, [preselectedTableNumber, tables]);

  // Android hardware back button handler for CheckInWizard
  useEffect(() => {
    const handleWizardBack = () => {
      // 0. Only intercept if this tab screen is active
      if (!isActive) {
        return false;
      }

      // 1. Block back press if NFC card is writing
      if (isNfcWriting) {
        return true; // Consume event (block)
      }

      // 2. Go back one step in wizard
      if (stepState > 1) {
        setStepState(stepState - 1);
        return true;
      }

      // 3. Unsaved changes check on Step 1
      const isDirty = fullName.trim().length > 0 || phone.trim().length > 0 || email.trim().length > 0;
      if (stepState === 1 && isDirty) {
        Alert.alert(
          'Discard Changes',
          'You have unsaved check-in details. Are you sure you want to go back?',
          [
            { text: 'Continue Editing', style: 'cancel' },
            { 
              text: 'Discard Changes', 
              style: 'destructive',
              onPress: () => {
                // Reset form values
                setFullName('');
                setPhone('');
                setEmail('');
                setGuestCount(1);
                // Return to home tab
                setTab('tables');
              } 
            }
          ]
        );
        return true;
      }

      return false; // Let it bubble up to root handler
    };

    let subscription: any;
    if (Platform.OS === 'android') {
      subscription = BackHandler.addEventListener('hardwareBackPress', handleWizardBack);
    }
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [stepState, fullName, phone, email, isNfcWriting, isActive]);

  useEffect(() => {
    setOverlayActive(isActive && (isNfcWriting || isProcessing));
    return () => setOverlayActive(false);
  }, [isActive, isNfcWriting, isProcessing, setOverlayActive]);

  useEffect(() => {
    if (resumingPendingSession) {
      handleResumePending(resumingPendingSession);
      setResumingPendingSession(null);
    }
  }, [resumingPendingSession]);

  useEffect(() => {
    if (rates.length > 0) {
      const hasCurrent = rates.some(r => r.placeType === placeType);
      if (!hasCurrent) {
        const fallback = rates.find(r => r.placeType === 'STANDING_BAR' || r.placeType === 'PREMIUM_LOUNGE');
        if (fallback) setPlaceType(fallback.placeType);
      }
    }
  }, [rates, placeType]);
  useEffect(() => {
    if (isActive && step === 1) {
      fetchPendingSessions().catch(() => {});
    }
  }, [isActive, step]);
  
  // Simulated outputs
  const [createdSession, setCreatedSession] = useState<SessionToken | null>(null);
  const [nfcWriteState, setNfcWriteState] = useState<'idle' | 'success' | 'error'>('idle');
  const [activationError, setActivationError] = useState<string | null>(null);

  // Business check: Phone active session warning (normalize phone input to start with +91)
  const normalizedInputPhone = phone.trim().startsWith('+91') ? phone.trim() : `+91${phone.trim()}`;
  const isPhoneActive = sessions.some(s => 
    s.phoneNumber === normalizedInputPhone && 
    (s.status === TokenStatus.ACTIVE || s.status === TokenStatus.EXTENDED)
  );
  const isEmailActive = (email && email.trim()) ? sessions.some(s => 
    s.email && s.email.trim().toLowerCase() === email.trim().toLowerCase() && 
    (s.status === TokenStatus.ACTIVE || s.status === TokenStatus.EXTENDED)
  ) : false;
  const activeRate = rates.find(r => r.placeType === placeType);

  const isValidPhoneNumber = (num: string) => {
    const trimmed = num.trim();
    return /^(?:\+91)?[6-9]\d{9}$/.test(trimmed);
  };

  const isValidEmail = (value: string): boolean => {
    if (!value || !value.trim()) return true;
    const emailStr = value.trim();
    const regex = /^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9]+(\.[a-z0-9]+)*@gmail\.com$/;
    return regex.test(emailStr);
  };

  const isValidName = (nameStr: string) => {
    const trimmed = nameStr.trim();
    return /^[a-zA-Z\s.'-]{2,100}$/.test(trimmed);
  };

  const selectedTableObj = tables.find(t => t.number === selectedTableNum);
  const maxAllowedSeats = selectedTableObj ? selectedTableObj.seats : 20;

  // Validation checks for step progression
  const isNameOk = isValidName(fullName);
  const [showPendingExistsModal, setShowPendingExistsModal] = useState(false);
  const [pendingExistsTokenNumber, setPendingExistsTokenNumber] = useState('');
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false);
  const [checkinPaymentMode, setCheckinPaymentMode] = useState<'CASH' | 'UPI'>('CASH');

  const isPhoneOk = isValidPhoneNumber(phone) && !isPhoneActive;
  const isEmailOk = selectedDeliveryMode === 'EMAIL_QR'
    ? (email.trim().length > 0 && isValidEmail(email) && !isEmailActive)
    : (isValidEmail(email) && !isEmailActive);
  const isCapacityOk = guestCount <= maxAllowedSeats;
  const isStep1Valid = isNameOk && isPhoneOk && isEmailOk && isCapacityOk;
  const isStep2Valid = selectedTableNum !== null;

  const handleStep1Submit = async () => {
    if (isStep1Valid) {
      if (selectedDeliveryMode === 'EMAIL_QR') {
        setStep(2);
      } else {
        if (isTablePreselected) {
          setStep(3);
        } else {
          setStep(2);
        }
      }
    }
  };

  const handleStep2Submit = async () => {
    if (selectedDeliveryMode === 'EMAIL_QR') {
      if (!startAction('create_pending')) return;
      setIsActivating(true);
      try {
        const pendingSession = await createPendingSession({
          customerName: fullName,
          phoneNumber: phone,
          email: email.trim(),
          personsCount: guestCount,
          placeType,
          placeTypeId: rates.find(r => r.placeType === placeType)?.id,
          tableNumber: selectedTableNum || undefined,
          tokenNumber: pendingToken || undefined
        });
        stopAction();
        setIsActivating(false);
        if (pendingSession) {
          setPendingToken(pendingSession.tokenNumber);
          setScannedToken('');
          setQrVerificationSuccess(false);
          setQrVerificationError(null);
          if (selectedTableNum) {
            setStep(5);
          } else {
            setStep(4);
          }
        }
      } catch (err: any) {
        stopAction();
        setIsActivating(false);
        if (err.code === 'PENDING_SESSION_EXISTS') {
          setPendingExistsTokenNumber(err.tokenNumber);
          setShowPendingExistsModal(true);
        } else {
          showToast(err.message || 'Unable to complete the check-in. Please try again.', 'danger');
        }
      }
    } else {
      if (isStep2Valid) setStep(3);
    }
  };

  // Load dynamic rates with safety fallbacks
  const rateCard = rates.find(r => r.placeType === placeType) || rates[0] || { ratePerPerson: placeType === 'STANDING_BAR' ? 500 : 1200, durationHours: placeType === 'STANDING_BAR' ? 2 : 3, maxDrinks: placeType === 'STANDING_BAR' ? 2 : 3 };
  const basePrice = rateCard.ratePerPerson;
  const durationHours = rateCard.durationHours;
  const totalPrice = basePrice * guestCount;
  const maxDrinksPerPerson = rateCard.maxDrinks;
  const maxDrinksTotal = maxDrinksPerPerson * guestCount;

  const handlePaymentCollected = async () => {
    if (selectedDeliveryMode === 'EMAIL_QR') {
      if (!pendingToken || !selectedTableNum) {
        showToast('Unable to complete the check-in. The selected table or session information is missing.', 'danger');
        return;
      }
      if (!startAction('activate_pending')) return;
      setIsNfcWriting(true);
      setActivationError(null);
      try {
        const token = await activatePendingSession(pendingToken, selectedTableNum, totalPrice);
        stopAction();
        setIsNfcWriting(false);
        if (token) {
          setCreatedSession(token);
          setNfcWriteState('success');
          setStep(4);
        } else {
          setActivationError('Failed to activate session. No token returned.');
          setNfcWriteState('error');
          setStep(4);
        }
      } catch (error: any) {
        stopAction();
        setIsNfcWriting(false);
        console.error('Activation error:', error);
        setNfcWriteState('error');
        setStep(4);
        setActivationError(error.message || 'Unable to activate the session. Please try again.');
        showToast(error.message || 'Unable to activate the session. Please try again.', 'danger');
      }
    } else {
      setCardUid('');
      setStep(4);
    }
  };

  const handleWriteNfc = async () => {
    if (!startAction('write_card')) return;
    setIsNfcWriting(true);
    setNfcWriteState('idle');
    
    try {
      await nfcService.initialize();
      
      // 1. Scan card to get physical UID
      showToast('Hold the smart card near the device to scan.', 'info');
      const details = await nfcService.readCardDetails();
      if (!details || !details.nfcUid) {
        throw new Error('Failed to read Card UID from NFC tag.');
      }
      
      const physicalCardUid = details.nfcUid;
      setCardUid(physicalCardUid);
      
      // 2. Call checkInGuest to register token in DB / offline queue
      const token = await checkInGuest({
        customerName: fullName,
        phoneNumber: phone,
        email: email.trim() ? email.trim().toLowerCase() : undefined,
        persons: guestCount,
        placeType,
        tableNumber: selectedTableNum!,
        amountPaid: totalPrice,
        redemptionLimit: maxDrinksTotal,
        cardUid: physicalCardUid,
        deliveryMode: 'NFC_CARD'
      });

      if (!token) {
        throw new Error('Database registration failed.');
      }

      // 3. Write token number back to physical card NDEF record
      showToast('Writing data to the smart card... Please keep it close to the device.', 'info');
      const writeSuccess = await nfcService.writeToCard(token.tokenNumber);
      if (!writeSuccess) {
        throw new Error('Failed to write NDEF token number onto tag.');
      }

      stopAction();
      setCreatedSession(token);
      setNfcWriteState('success');
      showToast('Customer checked in successfully.', 'success');
    } catch (error: any) {
      stopAction();
      console.error('NFC Write process error:', error);
      setNfcWriteState('error');
      let friendlyMsg = 'Unable to complete the check-in. Please try again.';
      if (error.message?.includes('Failed to read Card UID')) {
        friendlyMsg = 'Could not read the smart card. Please check the placement and try again.';
      } else if (error.message?.includes('Database registration failed')) {
        friendlyMsg = 'Unable to complete the check-in. Please check your connection and try again.';
      } else if (error.message?.includes('Failed to write NDEF')) {
        friendlyMsg = 'Could not register the check-in on the smart card. Please try scanning again.';
      } else if (error.message) {
        friendlyMsg = error.message;
      }
      showToast(friendlyMsg, 'danger');
    } finally {
      setIsNfcWriting(false);
    }
  };

  const handleResumePending = (pending: SessionToken) => {
    // 1. Check if the table is still available:
    const selectedTable = tables.find(t => t.number === pending.tableNumber);
    const isAvailable = selectedTable ? (selectedTable.status === 'available') : false;

    setFullName(pending.customerName);
    setPhone(pending.phoneNumber);
    setEmail(pending.email || '');
    setGuestCount(pending.persons);
    setPlaceType(pending.placeType);
    setPendingToken(pending.tokenNumber);
    setScannedToken('');
    setQrVerificationSuccess(false);
    setQrVerificationError(null);

    if (pending.deliveryMode) {
      setSelectedDeliveryMode(pending.deliveryMode);
    }

    if (pending.tableNumber && !isAvailable) {
      // Clear selected table and redirect to table selection (Step 2)
      setSelectedTableNum(null);
      setStep(2);
      showToast(`Table ${pending.tableNumber} is no longer available. Please select another table.`, 'warning');
    } else {
      setSelectedTableNum(pending.tableNumber || null);
      // Determine the resume step:
      if (!pending.tableNumber) {
        // 1. Pending at table selection
        setStep(2);
      } else if (pending.emailSent === false) {
        // 2. Pending at QR generation
        setStep(5);
      } else {
        // 3. Pending at payment
        setStep(3);
      }
    }
  };

  const handleClosePending = (pending: SessionToken) => {
    Alert.alert(
      'Close Pending Check-in',
      `Are you sure you want to permanently close the pending check-in for ${pending.customerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Close Session', 
          style: 'destructive',
          onPress: async () => {
            if (!startAction('cancel_pending')) return;
            try {
              const success = await cancelPendingSession(pending.tokenNumber, 'USER_CANCELLED');
              stopAction();
              if (success) {
                showToast('Pending check-in closed successfully.', 'success');
                await fetchPendingSessions();
              } else {
                showToast('Failed to close pending check-in.', 'danger');
              }
            } catch (err: any) {
              stopAction();
              showToast(err.message || 'Error closing pending session.', 'danger');
            }
          }
        }
      ]
    );
  };

  const resetWizard = () => {
    setFullName('');
    setPhone('');
    setEmail('');
    setGuestCount(1);
    setPlaceType('STANDING_BAR');
    setSelectedTableNum(null);
    setCardUid('');
    setCreatedSession(null);
    setNfcWriteState('idle');
    setIsTablePreselected(false);
    setPendingToken(null);
    setScannedToken('');
    setIsVerifyingQr(false);
    setIsActivating(false);
    setQrVerificationError(null);
    setQrVerificationSuccess(false);
    setStep(1);
  };

  return (
    <View className="flex-1 p-4" style={{ backgroundColor: colors.bg }}>
      {/* Screen Header */}
      <View className="mb-4">
        <View className="flex-row justify-between items-center">
          <Text className="text-[10px] font-bold uppercase tracking-widest" style={{ color: colors.gold }}>RECEPTIONIST</Text>
          <View className="flex-row items-center">
            <View className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: colors.teal }} />
            <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.teal }}>Online</Text>
          </View>
        </View>
        <Text className="text-2xl font-bold mt-1" style={{ color: colors.text }}>New Check-in</Text>
      </View>
      
      {/* Step Progress Pills */}
      <View className="flex-row justify-between mb-5 gap-2">
        {(selectedDeliveryMode === 'EMAIL_QR' ? [1, 2, 3, 4] : [1, 2, 3]).map(s => {
          let isDone = false;
          let isActive = false;
          if (selectedDeliveryMode === 'EMAIL_QR') {
            if (s === 1) {
              isDone = step === 2 || step === 5 || step === 3 || step === 4;
              isActive = step === 1;
            } else if (s === 2) {
              isDone = step === 5 || step === 3 || step === 4;
              isActive = step === 2;
            } else if (s === 3) {
              isDone = step === 3 || step === 4;
              isActive = step === 5;
            } else if (s === 4) {
              isDone = step === 4;
              isActive = step === 3;
            }
          } else {
            isDone = step > s;
            isActive = step === s;
          }
          return (
            <View 
              key={s} 
              className="flex-grow h-1.5 rounded-full"
              style={{ backgroundColor: isDone ? colors.teal : isActive ? colors.gold : (isDark ? colors.border : '#E2E8F0') }}
            />
          );
        })}
      </View>

      <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        
        {/* STEP 1.5: QR SCAN VALIDATION */}
        {step === 5 && (
          <View 
            className="rounded-2xl p-5 shadow-xl border mb-4"
            style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
          >
            <Text className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: colors.gold }}>Step 3 — QR Verification</Text>
            <Text className="text-sm font-semibold mb-4" style={{ color: colors.text }}>
              A pending check-in session has been created. The QR code has been dispatched to {email.toLowerCase() || 'your email'}.
            </Text>

            {/* START QR SCAN button (Reusing style from BartenderPortal.tsx) */}
            <TouchableOpacity 
              className="w-full bg-gold rounded-[20px] py-4 items-center justify-center shadow-xl border mb-4"
              style={{ borderColor: colors.gold }}
              onPress={async () => {
                if (!permission || !permission.granted) {
                  const res = await requestPermission();
                  if (!res.granted) {
                    Alert.alert('Permission Denied', 'Camera permission is required to scan QR codes.');
                    return;
                  }
                }
                setIsCameraActive(true);
              }}
              activeOpacity={0.85}
            >
              <View className="flex-row items-center gap-2">
                <Text style={{ fontSize: 16 }}>📷</Text>
                <Text className="font-black text-sm tracking-widest uppercase" style={{ color: colors.goldButtonText }}>START QR SCAN</Text>
              </View>
            </TouchableOpacity>

            {/* Full-Screen Camera Scanner Modal */}
            <Modal
              visible={isCameraActive}
              animationType="slide"
              transparent={false}
              onRequestClose={() => setIsCameraActive(false)}
            >
              <View style={{ flex: 1, backgroundColor: '#000000', position: 'relative' }}>
                {permission && permission.granted && isCameraActive && (
                  <CameraView
                    key={isCameraActive ? "active-camera-view" : "inactive-camera-view"}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      width: '100%',
                      height: '100%',
                      zIndex: 1
                    }}
                    facing="back"
                    onBarcodeScanned={async ({ data }) => {
                      if (data && !isVerifyingQr) {
                        setIsCameraActive(false);
                        setScannedToken(data);
                        setIsVerifyingQr(true);
                        const verifiedToken = await verifyQrCode(data);
                        setIsVerifyingQr(false);
                        if (verifiedToken) {
                          if (verifiedToken.placeType) {
                            setPlaceType(verifiedToken.placeType);
                          }
                          if (verifiedToken.persons) {
                            setGuestCount(verifiedToken.persons);
                          }
                          if (verifiedToken.tableNumber) {
                            setSelectedTableNum(verifiedToken.tableNumber);
                          }
                          setQrVerificationSuccess(true);
                          setStep(3); // Proceed to Payment Confirmation
                        } else {
                          setQrVerificationError('Invalid or expired QR token.');
                        }
                      }
                    }}
                  />
                )}
                
                {/* Overlay layer matching Bartender UI/UX */}
                <View 
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 10,
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: 'transparent'
                  }}
                >
                  {/* Red scanning line in the middle */}
                  <View 
                    style={{
                      position: 'absolute',
                      left: 16,
                      right: 16,
                      height: 1.5,
                      backgroundColor: '#EF4444',
                      top: '50%',
                      zIndex: 11
                    }}
                  />

                  {/* Centered target guide frame */}
                  <View style={{ width: 250, height: 250, borderWidth: 2, borderColor: colors.gold, borderRadius: 16, backgroundColor: 'transparent' }} />
                  
                  <Text style={{ color: '#ffffff', marginTop: 24, fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center', paddingHorizontal: 20 }}>
                    Align QR Code within the frame
                  </Text>
                  
                  {/* Cancel button placed identically to Bartender's */}
                  <TouchableOpacity 
                    className="absolute bottom-6 bg-red px-6 py-3 rounded-xl border border-red"
                    style={{ zIndex: 12 }}
                    onPress={() => setIsCameraActive(false)}
                  >
                    <Text className="text-white font-bold text-xs uppercase tracking-wider">Cancel Scan</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

            {/* Input field for token number */}
            <Text className="text-xs font-bold mb-1.5" style={{ color: colors.gold }}>QR Code Token</Text>
            <TextInput 
              style={{ color: colors.text, backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 'bold' }}
              placeholder="Paste BAR-XXXXXXXXXX or scanned JWT here"
              placeholderTextColor={colors.placeholder}
              value={scannedToken}
              onChangeText={(text) => {
                setScannedToken(text);
                setQrVerificationError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {qrVerificationError && (
              <View className="bg-red/5 border border-red/10 rounded-lg p-2.5 mt-2">
                <Text className="text-red text-xs leading-4">⚠️ {qrVerificationError}</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity 
                className="flex-1 py-3.5 rounded-xl border items-center justify-center min-h-[48px]"
                style={{ 
                  backgroundColor: isDark ? colors.secondarySurface : '#F1F5F9', 
                  borderColor: isDark ? colors.border : '#CBD5E1',
                  borderWidth: 1.5
                }}
                onPress={() => setShowCancelConfirmModal(true)}
              >
                <Text className="font-bold text-sm" style={{ color: colors.muted }}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                className="flex-grow flex-1 py-3.5 rounded-xl items-center justify-center min-h-[48px] border"
                style={{ 
                  borderColor: colors.gold,
                  backgroundColor: isProcessing ? (isDark ? '#27272A' : '#E4E4E7') : colors.gold,
                  opacity: isProcessing ? 0.5 : 1
                }}
                disabled={isProcessing}
                onPress={async () => {
                  if (!scannedToken.trim()) {
                    setQrVerificationError('Please enter the scanned QR token.');
                    return;
                  }
                  if (!startAction('verify_qr')) return;
                  setIsVerifyingQr(true);
                  try {
                    const verifiedToken = await verifyQrCode(scannedToken.trim());
                    stopAction();
                    setIsVerifyingQr(false);
                    if (verifiedToken) {
                      if (verifiedToken.placeType) {
                        setPlaceType(verifiedToken.placeType);
                      }
                      if (verifiedToken.persons) {
                        setGuestCount(verifiedToken.persons);
                      }
                      if (verifiedToken.tableNumber) {
                        setSelectedTableNum(verifiedToken.tableNumber);
                      }
                      setQrVerificationSuccess(true);
                      setStep(3); // Proceed to Payment Confirmation
                    } else {
                      setQrVerificationError('Invalid or expired QR token.');
                    }
                  } catch (e: any) {
                    stopAction();
                    setIsVerifyingQr(false);
                    setQrVerificationError(e.message || 'Verification failed.');
                  }
                }}
              >
                <Text 
                  className="font-bold text-sm" 
                  style={{ color: isProcessing ? colors.muted : colors.goldButtonText }}
                >
                  {loadingAction === 'verify_qr' ? `Verifying... (${secondsLeft}s)` : 'Verify QR'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Quick Testing Simulator helper */}
            {pendingToken && (
              <TouchableOpacity 
                className="mt-3 py-2.5 rounded-xl items-center justify-center border"
                style={{
                  backgroundColor: isDark ? 'rgba(78, 205, 196, 0.1)' : '#E0F2FE',
                  borderColor: isDark ? 'rgba(78, 205, 196, 0.2)' : '#BAE6FD',
                  borderWidth: 1
                }}
                onPress={() => setScannedToken(pendingToken)}
              >
                <Text style={{ color: colors.teal, fontSize: 11, fontWeight: 'bold' }}>🧪 Simulate scanning generated QR: {pendingToken}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}        {/* STEP 1: CUSTOMER DETAILS */}
        {step === 1 && (
          <View 
            className="rounded-[20px] p-5 shadow-xl border mb-4"
            style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 }}
          >
            <Text className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: colors.gold }}>Step 1 — Guest Details</Text>
            
            {/* Customer Name Input */}
            <View 
              className="rounded-2xl p-4 mb-4 border"
              style={{ 
                backgroundColor: colors.secondarySurface, 
                borderColor: focusedField === 'name' ? colors.gold : (isDark ? colors.inputBorder : '#CBD5E1'),
                borderWidth: 1.5
              }}
            >
              <View className="flex-row items-center mb-1">
                <Text className="text-xs font-bold mr-1.5" style={{ color: colors.gold }}>👤</Text>
                <Text className="text-xs font-bold" style={{ color: colors.gold }}>Full Name *</Text>
              </View>
              <TextInput 
                style={{ color: colors.text }}
                className="text-base font-semibold py-1.5"
                placeholder="Rahul Mehta"
                placeholderTextColor={colors.placeholder}
                value={fullName}
                onChangeText={(text) => {
                  if (focusedField === 'name') setFullName(text);
                }}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
                autoComplete="name"
                autoCorrect={false}
                textContentType="name"
                importantForAutofill="yes"
              />
              {fullName.trim().length > 0 && !isNameOk && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Name must be between 2 and 100 characters, containing only letters and standard symbols.</Text>
                </View>
              )}
            </View>

            {/* Phone Number Input */}
            <View 
              className="rounded-2xl p-4 mb-4 border"
              style={{ 
                backgroundColor: colors.secondarySurface, 
                borderColor: focusedField === 'phone' ? colors.gold : (isDark ? colors.inputBorder : '#CBD5E1'),
                borderWidth: 1.5
              }}
            >
              <View className="flex-row items-center mb-1">
                <Text className="text-xs font-bold mr-1.5" style={{ color: colors.gold }}>📞</Text>
                <Text className="text-xs font-bold" style={{ color: colors.gold }}>Phone Number *</Text>
              </View>
              <TextInput 
                style={{ color: colors.text }}
                className="text-base font-semibold py-1.5"
                placeholder="+91 98765 43210"
                placeholderTextColor={colors.placeholder}
                value={phone}
                onChangeText={(text) => {
                  if (focusedField === 'phone') setPhone(text);
                }}
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField(null)}
                keyboardType="phone-pad"
                maxLength={13}
                autoComplete="tel"
                autoCorrect={false}
                textContentType="telephoneNumber"
                importantForAutofill="yes"
              />
              {phone.trim().length > 0 && !isValidPhoneNumber(phone) && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Must be a valid 10-digit number starting with 6-9 (e.g. 9876543210 or +919876543210).</Text>
                </View>
              )}
              {isPhoneActive && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Email ID or phone number already has an active check-in. Please use another one.</Text>
                </View>
              )}
            </View>

            {/* Email Address Input */}
            <View 
              className="rounded-2xl p-4 mb-4 border"
              style={{ 
                backgroundColor: colors.secondarySurface, 
                borderColor: focusedField === 'email' ? colors.gold : (isDark ? colors.inputBorder : '#CBD5E1'),
                borderWidth: 1.5
              }}
            >
              <View className="flex-row justify-between items-center mb-1">
                <View className="flex-row items-center">
                  <Text className="text-xs font-bold mr-1.5" style={{ color: colors.gold }}>✉️</Text>
                  <Text className="text-xs font-bold" style={{ color: colors.gold }}>Email</Text>
                </View>
                <Text 
                  className="text-[10px] uppercase tracking-wider font-semibold" 
                  style={{ color: selectedDeliveryMode === 'EMAIL_QR' ? colors.red : colors.muted }}
                >
                  {selectedDeliveryMode === 'EMAIL_QR' ? 'required' : 'optional'}
                </Text>
              </View>
              <TextInput 
                style={{ color: colors.text }}
                className="text-base font-semibold py-1.5"
                placeholder="rahul@email.com"
                placeholderTextColor={colors.placeholder}
                value={email}
                onChangeText={(text) => {
                  if (focusedField === 'email') setEmail(text);
                }}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                textContentType="emailAddress"
                importantForAutofill="yes"
              />
              {selectedDeliveryMode === 'EMAIL_QR' && email.trim().length === 0 && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Email address is required for Email QR Code delivery.</Text>
                </View>
              )}
              {email.trim().length > 0 && !isValidEmail(email) && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Please enter a valid Gmail address (lowercase letters, numbers, and dots only).</Text>
                </View>
              )}
              {isEmailActive && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Email ID or phone number already has an active check-in. Please use another one.</Text>
                </View>
              )}
            </View>

            {/* Delivery Method Selector (Only shown if BOTH are enabled) */}
            {nfcEnabled && emailQrEnabled && (
              <View 
                className="rounded-2xl p-4 mb-5 border"
                style={{ backgroundColor: colors.secondarySurface, borderColor: isDark ? colors.border : '#CBD5E1', borderWidth: 1.5 }}
              >
                <Text className="text-xs font-bold mb-3" style={{ color: colors.gold }}>📦 Delivery Method *</Text>
                <View className="flex-row gap-3">
                  <TouchableOpacity 
                    className="flex-1 flex-row items-center justify-center py-3 rounded-xl border min-h-[44px]"
                    style={{
                      backgroundColor: selectedDeliveryMode === 'NFC_CARD' ? (isDark ? 'rgba(245,166,35,0.12)' : '#FEF3C7') : colors.surface,
                      borderColor: selectedDeliveryMode === 'NFC_CARD' ? colors.gold : (isDark ? colors.border : '#CBD5E1'),
                      borderWidth: 1.5
                    }}
                    onPress={() => setSelectedDeliveryMode('NFC_CARD')}
                  >
                    <Text style={{ fontSize: 13, marginRight: 6 }}>💳</Text>
                    <Text className="text-xs font-bold" style={{ color: selectedDeliveryMode === 'NFC_CARD' ? colors.gold : colors.muted }}>NFC Smart Card</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className="flex-1 flex-row items-center justify-center py-3 rounded-xl border min-h-[44px]"
                    style={{
                      backgroundColor: selectedDeliveryMode === 'EMAIL_QR' ? (isDark ? 'rgba(245,166,35,0.12)' : '#FEF3C7') : colors.surface,
                      borderColor: selectedDeliveryMode === 'EMAIL_QR' ? colors.gold : (isDark ? colors.border : '#CBD5E1'),
                      borderWidth: 1.5
                    }}
                    onPress={() => setSelectedDeliveryMode('EMAIL_QR')}
                  >
                    <Text style={{ fontSize: 13, marginRight: 6 }}>📧</Text>
                    <Text className="text-xs font-bold" style={{ color: selectedDeliveryMode === 'EMAIL_QR' ? colors.gold : colors.muted }}>Email QR Code</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Guest Pax Count Stepper */}
            <View 
              className="rounded-2xl p-4 mb-5 border"
              style={{ backgroundColor: colors.secondarySurface, borderColor: isDark ? colors.border : '#CBD5E1', borderWidth: 1.5 }}
            >
              <View className="flex-row items-center mb-3">
                <Text className="text-xs font-bold mr-1.5" style={{ color: colors.gold }}>👥</Text>
                <Text className="text-xs font-bold" style={{ color: colors.gold }}>Number of Persons *</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <Animated.View style={{ transform: [{ scale: minusScale }] }}>
                  <TouchableOpacity 
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: colors.surface,
                      borderColor: isDark ? colors.border : '#CBD5E1',
                      borderWidth: 1.5,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: guestCount <= 1 ? 0.35 : 1
                    }}
                    onPress={() => {
                      animateButton(minusScale);
                      setGuestCount(c => Math.max(1, c - 1));
                    }}
                    disabled={guestCount <= 1}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold', lineHeight: 18 }}>−</Text>
                  </TouchableOpacity>
                </Animated.View>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: 'bold', width: 24, textAlign: 'center' }}>{guestCount}</Text>
                <Animated.View style={{ transform: [{ scale: plusScale }] }}>
                  <TouchableOpacity 
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: colors.surface,
                      borderColor: isDark ? colors.border : '#CBD5E1',
                      borderWidth: 1.5,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: guestCount >= 20 ? 0.35 : 1
                    }}
                    onPress={() => {
                      animateButton(plusScale);
                      if (selectedTableNum !== null && guestCount >= maxAllowedSeats) {
                        setShowCapacityAlert(true);
                      } else {
                        setGuestCount(c => Math.min(20, c + 1));
                      }
                    }}
                    disabled={guestCount >= 20}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold', lineHeight: 18 }}>+</Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
              {selectedTableNum !== null && guestCount === maxAllowedSeats && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-2">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Maximum capacity of selected table ({maxAllowedSeats} seats) reached.</Text>
                </View>
              )}
            </View>

            {/* Next Action */}
            <TouchableOpacity 
              className="py-4 rounded-2xl items-center justify-center min-h-[52px] border"
              style={{
                backgroundColor: !isStep1Valid ? (isDark ? '#27272A' : '#E4E4E7') : colors.gold,
                borderColor: !isStep1Valid ? (isDark ? '#3F3F46' : '#D4D4D8') : colors.gold,
                borderWidth: 1.5,
                opacity: !isStep1Valid ? 0.6 : 1
              }}
              disabled={!isStep1Valid}
              onPress={handleStep1Submit}
            >
              <Text 
                className="font-extrabold text-base tracking-wide" 
                style={{ color: !isStep1Valid ? colors.muted : colors.goldButtonText }}
              >
                Continue  ➔
              </Text>
            </TouchableOpacity>
            
            {pendingSessions.length > 0 && (
              <View 
                className="rounded-[20px] p-5 shadow-xl border mt-4"
                style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 }}
              >
                <Text className="text-[11px] font-bold uppercase tracking-wider mb-3.5" style={{ color: colors.gold }}>
                  ⏳ Pending Payment Check-ins ({pendingSessions.length})
                </Text>
                
                {pendingSessions.map((pending) => (
                  <View 
                    key={pending.id} 
                    className="border rounded-xl p-3 mb-3"
                    style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5 }}
                  >
                    <View className="flex-row justify-between items-center mb-1.5">
                      <Text className="text-[13px] font-bold" style={{ color: colors.text }}>
                        {pending.customerName}
                      </Text>
                      <View className="flex-row gap-2">
                        <TouchableOpacity 
                          className="px-3 py-1.5 rounded-lg bg-teal items-center justify-center"
                          onPress={() => handleResumePending(pending)}
                          activeOpacity={0.8}
                        >
                          <Text className="text-[10px] font-bold text-white">Resume</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          className="px-3 py-1.5 rounded-lg bg-red/10 border border-red/35 items-center justify-center"
                          onPress={() => handleClosePending(pending)}
                          activeOpacity={0.8}
                        >
                          <Text className="text-[10px] font-bold text-red" style={{ color: colors.red }}>Close</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    
                    <Text className="text-[11px] mb-1" style={{ color: colors.muted }}>
                      📞 {pending.phoneNumber} {pending.email ? `• ✉️ ${pending.email}` : ''}
                    </Text>
                    <Text className="text-[10px] font-bold uppercase" style={{ color: colors.gold }}>
                      {pending.placeType.replace('_', ' ')} • {pending.persons} Pax • {pending.tableNumber ? `Table ${pending.tableNumber}` : 'Waiting List'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {step === 2 && (
          <View 
            className="rounded-[20px] p-5 shadow-xl border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
          >
            <Text className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: colors.gold }}>Step 2 — Table Selection</Text>
            
            {/* Zone Choice Cards */}
            <Text className="text-[13px] font-medium mb-2" style={{ color: colors.text }}>Select Seating Area</Text>
            <View className="flex-row flex-wrap mb-4" style={{ marginHorizontal: -8 }}>
              {rates.map((rate, idx) => {
                const isSelected = placeType === rate.placeType;
                const isPremium = rate.placeType.toLowerCase().includes('lounge') || idx % 2 === 1;
                const dotColor = isPremium ? 'bg-gold' : 'bg-teal';
                
                return (
                  <View key={rate.id || rate.placeType} style={{ width: '50%', padding: 8 }}>
                    <TouchableOpacity 
                      style={{ 
                        minHeight: 92,
                        backgroundColor: isSelected ? (isDark ? 'rgba(245,166,35,0.12)' : '#FEF3C7') : colors.themeInput,
                        borderColor: isSelected ? colors.gold : colors.border,
                        borderWidth: 1.5,
                        borderRadius: 12,
                        padding: 12,
                        opacity: (pendingToken && !isSelected) ? 0.4 : 1
                      }}
                      disabled={!!pendingToken && !isSelected}
                      onPress={() => { setPlaceType(rate.placeType); setSelectedTableNum(null); }}
                    >
                      <View className="flex-row items-center gap-1.5 mb-1">
                        <View className={`w-1.5 h-1.5 rounded-full ${dotColor}`} style={!isDark && dotColor === 'bg-teal' ? { backgroundColor: colors.teal } : {}} />
                        <Text className="font-extrabold text-[11px]" style={{ color: colors.text }}>
                          {rate.placeType === 'STANDING_BAR' ? 'Standing Bar' : (rate.placeType === 'PREMIUM_LOUNGE' ? 'Premium Lounge' : rate.placeType)}
                        </Text>
                      </View>
                      <Text className="text-sm font-extrabold my-0.5" style={{ color: colors.text }}>₹{rate.ratePerPerson} / Pax</Text>
                      <Text className="text-[9px]" style={{ color: colors.muted }}>{rate.durationHours} hrs • {rate.maxDrinks} drink(s) allotted</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {/* Spatial Grid Layout Seating Plan */}
            <Text className="text-[13px] font-medium mb-2" style={{ color: colors.text }}>Choose a Table Map</Text>
            <View className="flex-row flex-wrap mb-5" style={{ marginHorizontal: -6 }}>
              {tables
                .filter(t => t.placeType === placeType)
                .map(table => {
                  const isOccupied = table.status === TableStatus.OCCUPIED;
                  const isMaintenance = table.status === TableStatus.MAINTENANCE;
                  const isTooSmall = table.seats < guestCount;
                  const isSelected = selectedTableNum === table.number;
                  
                  let bgCol = colors.themeInput;
                  let borderCol = colors.border;
                  let textCol = colors.muted;
                  let labelTag = `${table.seats} Seats`;

                  if (isSelected) {
                    bgCol = isDark ? 'rgba(245,166,35,0.12)' : '#FEF3C7';
                    borderCol = colors.gold;
                    textCol = isDark ? colors.gold : '#B45309';
                  } else if (isOccupied) {
                    bgCol = isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2';
                    borderCol = '#EF4444';
                    textCol = '#EF4444';
                    labelTag = 'OCCUPIED';
                  } else if (isMaintenance) {
                    bgCol = isDark ? '#27272A' : '#F4F4F5';
                    borderCol = isDark ? '#3F3F46' : '#D4D4D8';
                    textCol = colors.muted;
                    labelTag = 'MNT';
                  } else if (isTooSmall) {
                    bgCol = isDark ? '#27272A' : '#F4F4F5';
                    borderCol = isDark ? '#3F3F46' : '#D4D4D8';
                    textCol = colors.muted;
                    labelTag = `${table.seats} PAX`;
                  } else {
                    bgCol = isDark ? 'rgba(34,197,94,0.12)' : '#F0FDF4';
                    borderCol = isDark ? 'rgba(34,197,94,0.4)' : '#22C55E';
                    textCol = isDark ? colors.teal : '#16A34A';
                  }

                  return (
                    <View key={table.id} style={{ width: itemWidth, padding: 6 }}>
                      <TouchableOpacity
                        style={{
                          width: '100%',
                          height: 52,
                          borderRadius: 12,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderWidth: 1.5,
                          backgroundColor: bgCol,
                          borderColor: borderCol
                        }}
                        disabled={isOccupied || isMaintenance || isTooSmall}
                        onPress={() => setSelectedTableNum(table.number)}
                        activeOpacity={0.8}
                      >
                        <Text className="font-mono text-xs" style={{ color: textCol }}>
                          {table.number}
                        </Text>
                        {labelTag ? (
                          <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.muted, marginTop: 1, textTransform: 'uppercase' }}>
                            {labelTag}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    </View>
                  );
                })}
            </View>

            {/* Navigation keys */}
            <View className="flex-row gap-3">
              <TouchableOpacity 
                className="flex-1 py-3.5 rounded-xl border items-center justify-center min-h-[48px]" 
                style={{ 
                  backgroundColor: isDark ? colors.secondarySurface : '#F1F5F9', 
                  borderColor: isDark ? colors.border : '#CBD5E1',
                  borderWidth: 1.5
                }} 
                onPress={() => setStep(1)}
              >
                <Text className="font-bold text-sm" style={{ color: colors.muted }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-[2] py-3.5 rounded-xl items-center justify-center min-h-[48px] border"
                style={{ 
                  backgroundColor: (isProcessing) ? (isDark ? '#27272A' : '#E4E4E7') : ((selectedDeliveryMode === 'EMAIL_QR' || isStep2Valid) ? colors.gold : (isDark ? '#27272A' : '#E4E4E7')),
                  borderColor: (isProcessing) ? (isDark ? '#3F3F46' : '#D4D4D8') : ((selectedDeliveryMode === 'EMAIL_QR' || isStep2Valid) ? colors.gold : (isDark ? '#3F3F46' : '#D4D4D8')),
                  borderWidth: 1.5,
                  opacity: (isProcessing) ? 0.6 : ((selectedDeliveryMode === 'EMAIL_QR' || isStep2Valid) ? 1 : 0.6)
                }}
                disabled={isProcessing || (selectedDeliveryMode !== 'EMAIL_QR' && !isStep2Valid)}
                onPress={handleStep2Submit}
              >
                <Text 
                  className="font-bold text-sm" 
                  style={{ color: (isProcessing) ? colors.muted : ((selectedDeliveryMode === 'EMAIL_QR' || isStep2Valid) ? colors.goldButtonText : colors.muted) }}
                >
                  {loadingAction === 'create_pending' 
                    ? `Processing... (${secondsLeft}s)`
                    : (selectedDeliveryMode === 'EMAIL_QR' 
                        ? (selectedTableNum ? 'Assign & Send QR' : 'Join Waiting List')
                        : 'Check Bill')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 3: BILLING SUMMARY */}
        {step === 3 && (
          <View 
            className="rounded-2xl p-5 shadow-xl border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
          >
            <Text className="text-[10px] font-bold uppercase tracking-wider mb-4" style={{ color: colors.gold }}>{selectedDeliveryMode === 'EMAIL_QR' ? 'Step 4' : 'Step 3'} — Payment & Confirmation</Text>
            
            {/* 2-Column Info Grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8, marginBottom: 12 }}>
              {/* Guest Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: isDark ? 'rgba(245,166,35,0.08)' : '#FEF3C7',
                  borderWidth: 1.5,
                  borderColor: colors.gold,
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.gold, textTransform: 'uppercase', marginBottom: 2 }}>Guest</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>{fullName}</Text>
                </View>
              </View>

              {/* Phone Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: colors.secondarySurface,
                  borderWidth: 1.25,
                  borderColor: isDark ? colors.border : '#E2E8F0',
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Phone</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>{phone}</Text>
                </View>
              </View>

              {/* Area Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: colors.secondarySurface,
                  borderWidth: 1.25,
                  borderColor: isDark ? colors.border : '#E2E8F0',
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Area</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.gold }} numberOfLines={1}>
                    {placeType === 'STANDING_BAR' ? 'Standing Bar' : (placeType === 'PREMIUM_LOUNGE' ? 'Premium Lounge' : placeType.replace('_', ' '))}
                  </Text>
                </View>
              </View>

              {/* Table Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: colors.secondarySurface,
                  borderWidth: 1.25,
                  borderColor: isDark ? colors.border : '#E2E8F0',
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Table</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>{selectedTableNum}</Text>
                </View>
              </View>

              {/* Persons Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: colors.secondarySurface,
                  borderWidth: 1.25,
                  borderColor: isDark ? colors.border : '#E2E8F0',
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Persons</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>{guestCount} Pax</Text>
                </View>
              </View>

              {/* Duration Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: colors.secondarySurface,
                  borderWidth: 1.25,
                  borderColor: isDark ? colors.border : '#E2E8F0',
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Duration</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>{durationHours} hrs</Text>
                </View>
              </View>
            </View>

            {/* Total Amount Box */}
            <View style={{
              backgroundColor: isDark ? 'rgba(245, 166, 35, 0.08)' : '#FEF3C7',
              borderWidth: 1.5,
              borderColor: colors.gold,
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: 'bold' }}>Total Bill</Text>
                <Text style={{ color: isDark ? colors.muted : '#4B5563', fontSize: 10, marginTop: 2 }}>₹{basePrice} × {guestCount} guests</Text>
              </View>
              <Text style={{ color: isDark ? colors.gold : '#B45309', fontSize: 22, fontWeight: '900' }}>₹{totalPrice.toLocaleString('en-IN')}</Text>
            </View>

            {/* Payment Mode Selector */}
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.text, marginBottom: 8 }}>Payment Mode *</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {(['CASH', 'UPI'] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: checkinPaymentMode === mode ? (isDark ? 'rgba(245, 166, 35, 0.12)' : '#FEF3C7') : colors.secondarySurface,
                    borderColor: checkinPaymentMode === mode ? colors.gold : (isDark ? colors.border : '#CBD5E1')
                  }}
                  onPress={() => setCheckinPaymentMode(mode)}
                >
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: checkinPaymentMode === mode ? (isDark ? colors.gold : '#B45309') : colors.muted }}>
                    {mode === 'CASH' ? '💵 CASH' : '📱 UPI'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Static Dummy QR Code for UPI */}
            {checkinPaymentMode === 'UPI' && (
              <View style={{
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.secondarySurface,
                borderWidth: 1.5,
                borderColor: isDark ? colors.border : '#CBD5E1',
                borderRadius: 20,
                padding: 20,
                marginBottom: 16,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 4
              }}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.gold, marginBottom: 8 }}>Scan dummy QR to pay</Text>
                <View style={{ padding: 8, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
                  <Image
                    source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=demo@upi&pn=NFCBar&am=${totalPrice}` }}
                    style={{ width: 150, height: 150, borderRadius: 8 }}
                  />
                </View>
                <Text style={{ fontSize: 9, color: colors.muted, marginTop: 8, fontWeight: '600' }}>Demo purposes only • No actual verification</Text>
              </View>
            )}

            {/* Prompt Box */}
            <View style={{
              backgroundColor: isDark ? 'rgba(245, 166, 35, 0.08)' : '#FEF3C7',
              borderWidth: 1.5,
              borderColor: colors.gold,
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20
            }}>
              <Text style={{ fontSize: 18 }}>{checkinPaymentMode === 'CASH' ? '💵' : '📱'}</Text>
              <Text style={{ color: isDark ? colors.gold : '#B45309', fontSize: 12, fontWeight: 'bold', flex: 1 }}>
                {checkinPaymentMode === 'CASH' 
                  ? `Collect Cash ₹${totalPrice.toLocaleString('en-IN')} — then confirm payment below`
                  : `Verify UPI transfer of ₹${totalPrice.toLocaleString('en-IN')} — then confirm payment below`}
              </Text>
            </View>

            {/* Navigation keys */}
            <View className="flex-col gap-3">
              <TouchableOpacity 
                className="w-full bg-gold py-4 rounded-2xl items-center justify-center min-h-[52px] flex-row gap-2 border"
                style={{ 
                  backgroundColor: isProcessing ? (isDark ? '#27272A' : '#E4E4E7') : colors.gold,
                  borderColor: isProcessing ? (isDark ? '#3F3F46' : '#D4D4D8') : colors.gold,
                  opacity: isProcessing ? 0.6 : 1
                }}
                disabled={isProcessing}
                onPress={() => {
                  if (selectedDeliveryMode === 'EMAIL_QR') {
                    setShowPaymentConfirmModal(true);
                  } else {
                    handlePaymentCollected();
                  }
                }}
              >
                {loadingAction === 'activate_pending' ? (
                  <Text className="font-extrabold text-base tracking-wide" style={{ color: colors.muted }}>
                    Processing... ({secondsLeft}s)
                  </Text>
                ) : (
                  <>
                    <Text className="text-base">✓</Text>
                    <Text className="font-extrabold text-base tracking-wide" style={{ color: colors.goldButtonText }}>
                      Payment Collected
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                className="w-full py-4 rounded-2xl border items-center justify-center min-h-[52px]" 
                style={{ 
                  backgroundColor: isDark ? colors.secondarySurface : '#F1F5F9', 
                  borderColor: isDark ? colors.border : '#CBD5E1',
                  borderWidth: 1.5
                }}
                onPress={() => setStep(isTablePreselected ? 1 : 2)}
              >
                <Text className="font-bold text-sm" style={{ color: colors.muted }}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 4: RADAR PULSE SCANNER */}
        {step === 4 && (
          <View 
            className="rounded-2xl p-5 shadow-xl border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
          >
            {selectedDeliveryMode === 'EMAIL_QR' ? (
              // EMAIL_QR Flow Success/Error Views
              (!selectedTableNum && pendingToken) ? (
                <View className="items-center justify-center py-4">
                  <View className="w-16 h-16 rounded-full bg-gold/10 border justify-center items-center mb-4" style={{ borderColor: colors.gold }}>
                    <Text className="text-3xl font-extrabold" style={{ color: colors.gold }}>⏳</Text>
                  </View>
                  
                  <Text className="text-lg font-bold mb-2 text-center" style={{ color: colors.text }}>
                    Customer Placed on Waiting List
                  </Text>
                  <Text className="text-xs text-center mb-6 leading-4 max-w-[85%]" style={{ color: colors.muted }}>
                    All tables in this seating zone are currently occupied or too small. No email has been sent. Once a table is assigned, the QR code will be generated and dispatched.
                  </Text>
                  
                  <View className="w-full border rounded-xl p-4 mb-6" style={{ backgroundColor: colors.secondarySurface, borderColor: isDark ? colors.border : '#E2E8F0', borderWidth: 1.5 }}>
                    <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                      <Text className="text-[11px]" style={{ color: colors.muted }}>Customer Name:</Text>
                      <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{fullName}</Text>
                    </View>
                    <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                      <Text className="text-[11px]" style={{ color: colors.muted }}>Phone Number:</Text>
                      <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{phone}</Text>
                    </View>
                    <View className="flex-row justify-between py-2">
                      <Text className="text-[11px]" style={{ color: colors.muted }}>Email:</Text>
                      <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{email}</Text>
                    </View>
                  </View>

                  <TouchableOpacity 
                    className="bg-gold py-[15px] rounded-xl w-full items-center justify-center min-h-[48px] border mb-3" 
                    style={{ borderColor: colors.gold }} 
                    onPress={resetWizard}
                  >
                    <Text className="font-extrabold text-sm" style={{ color: colors.goldButtonText }}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : nfcWriteState === 'success' ? (
                <View className="items-center justify-center py-4">
                  <View className="w-16 h-16 rounded-full bg-teal/10 border justify-center items-center mb-4" style={{ borderColor: colors.teal }}>
                    <Text className="text-3xl font-extrabold" style={{ color: colors.teal }}>✓</Text>
                  </View>
                  
                  <Text className="text-lg font-bold mb-2 text-center" style={{ color: colors.text }}>
                    New guest has arrived successfully.
                  </Text>
                  
                  <View className="w-full border rounded-xl p-4 mb-6" style={{ backgroundColor: colors.secondarySurface, borderColor: isDark ? colors.border : '#E2E8F0', borderWidth: 1.5 }}>
                    <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                      <Text className="text-[11px]" style={{ color: colors.muted }}>Customer Name:</Text>
                      <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{fullName}</Text>
                    </View>
                    <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                      <Text className="text-[11px]" style={{ color: colors.muted }}>Assigned Table:</Text>
                      <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{selectedTableNum}</Text>
                    </View>
                    <View className="flex-row justify-between py-2">
                      <Text className="text-[11px]" style={{ color: colors.muted }}>Drinks Included:</Text>
                      <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{maxDrinksTotal} Free Drinks</Text>
                    </View>
                  </View>

                  <TouchableOpacity 
                    className="bg-gold py-[15px] rounded-xl w-full items-center justify-center min-h-[48px] border mb-3" 
                    style={{ borderColor: colors.gold }} 
                    onPress={() => {
                      setTab('bartender');
                      resetWizard();
                    }}
                  >
                    <Text className="font-extrabold text-sm" style={{ color: colors.goldButtonText }}>Go to Bartender Dashboard</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    className="py-[15px] rounded-xl w-full items-center justify-center min-h-[48px] border" 
                    style={{ 
                      backgroundColor: isDark ? colors.secondarySurface : '#F1F5F9', 
                      borderColor: isDark ? colors.border : '#CBD5E1',
                      borderWidth: 1.5
                    }} 
                    onPress={resetWizard}
                  >
                    <Text className="font-bold text-sm" style={{ color: colors.muted }}>Check in Another Guest</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View className="items-center justify-center py-4">
                  <Text className="text-4xl mb-3">🛑</Text>
                  <Text className="text-lg font-bold mb-2" style={{ color: colors.text }}>Activation Failed</Text>
                  <Text className="text-[11px] text-center leading-4 max-w-[85%] mb-6" style={{ color: colors.muted }}>
                    {activationError || "Failed to activate the guest session on the server. Please check the network and try again."}
                  </Text>
                  <View className="flex-row gap-3 w-full">
                    <TouchableOpacity 
                      className="flex-grow flex-1 py-3.5 rounded-xl border items-center justify-center min-h-[48px]" 
                      style={{ 
                        backgroundColor: isDark ? colors.secondarySurface : '#F1F5F9', 
                        borderColor: isDark ? colors.border : '#CBD5E1',
                        borderWidth: 1.5
                      }} 
                      onPress={handlePaymentCollected}
                    >
                      <Text className="font-bold text-sm" style={{ color: colors.muted }}>Retry Activation</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      className="flex-grow flex-1 bg-gold py-3.5 rounded-xl items-center justify-center min-h-[48px] border" 
                      style={{ borderColor: colors.gold }} 
                      onPress={resetWizard}
                    >
                      <Text className="font-bold text-sm" style={{ color: colors.goldButtonText }}>Reset Form</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            ) : (
              // NFC_CARD Flow Views
              <>
                {nfcWriteState === 'idle' ? (
                  <View className="items-center justify-center py-4 w-full">
                    {/* Premium Summary Grid */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8, marginBottom: 20, width: '100%' }}>
                      {/* Token ID Card - Full Width */}
                      <View style={{ width: '100%', padding: 8 }}>
                        <View style={{
                          backgroundColor: isDark ? 'rgba(245,166,35,0.08)' : '#FEF3C7',
                          borderWidth: 1.5,
                          borderColor: colors.gold,
                          borderRadius: 12,
                          padding: 12,
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.gold, textTransform: 'uppercase', marginBottom: 3 }}>Assigned Token Code</Text>
                          <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 2 }}>
                            BAR - {new Date().toISOString().slice(0,10).replace(/-/g,'')} - {cardUid ? (cardUid.includes('-') ? cardUid.split('-')[1] : cardUid.slice(-5).toUpperCase()) : 'AX7K2'}
                          </Text>
                        </View>
                      </View>

                      {/* Area Zone Card */}
                      <View style={{ width: '50%', padding: 8 }}>
                        <View style={{
                          backgroundColor: colors.secondarySurface,
                          borderWidth: 1.5,
                          borderColor: isDark ? colors.border : '#E2E8F0',
                          borderRadius: 12,
                          padding: 10,
                          minHeight: 52,
                          justifyContent: 'center'
                        }}>
                          <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Seating Area</Text>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>
                            {placeType === 'STANDING_BAR' ? 'Standing Bar' : (placeType === 'PREMIUM_LOUNGE' ? 'Premium Lounge' : placeType.replace('_', ' '))}
                          </Text>
                        </View>
                      </View>

                      {/* Table Card */}
                      <View style={{ width: '50%', padding: 8 }}>
                        <View style={{
                          backgroundColor: colors.secondarySurface,
                          borderWidth: 1.5,
                          borderColor: isDark ? colors.border : '#E2E8F0',
                          borderRadius: 12,
                          padding: 10,
                          minHeight: 52,
                          justifyContent: 'center'
                        }}>
                          <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Seating Table</Text>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>{selectedTableNum}</Text>
                        </View>
                      </View>

                      {/* Guests Card */}
                      <View style={{ width: '50%', padding: 8 }}>
                        <View style={{
                          backgroundColor: colors.secondarySurface,
                          borderWidth: 1.5,
                          borderColor: isDark ? colors.border : '#E2E8F0',
                          borderRadius: 12,
                          padding: 10,
                          minHeight: 52,
                          justifyContent: 'center'
                        }}>
                          <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Guests</Text>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>{guestCount} Guests</Text>
                        </View>
                      </View>

                      {/* Drink Coupons Card */}
                      <View style={{ width: '50%', padding: 8 }}>
                        <View style={{
                          backgroundColor: colors.secondarySurface,
                          borderWidth: 1.5,
                          borderColor: isDark ? colors.border : '#E2E8F0',
                          borderRadius: 12,
                          padding: 10,
                          minHeight: 52,
                          justifyContent: 'center'
                        }}>
                          <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Drink Coupons</Text>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.gold }} numberOfLines={1}>
                            {activeRate ? activeRate.maxDrinks * guestCount : guestCount * 2} Drinks
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Visual Sweeping Radar Scanner Pulse */}
                    <View 
                      style={{ 
                        width: 144, 
                        height: 144, 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        marginTop: 24, 
                        marginBottom: 24, 
                        position: 'relative' 
                      }}
                    >
                      {isNfcWriting ? (
                        <>
                          <Animated.View style={{ position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 1.5, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', opacity: pulseOpacity1, transform: [{ scale: pulseScale1 }] }} />
                          <Animated.View style={{ position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 2.5, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', opacity: pulseOpacity2, transform: [{ scale: pulseScale2 }] }} />
                          <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: isDark ? 'rgba(245, 166, 35, 0.15)' : '#FEF3C7', borderWidth: 2, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator size="small" color={colors.gold} style={{ transform: [{ scale: 1.1 }] }} />
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={{ position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 1, borderColor: isDark ? 'rgba(245, 166, 35, 0.15)' : 'rgba(200, 155, 60, 0.15)', alignItems: 'center', justifyContent: 'center' }} />
                          <View style={{ position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: isDark ? 'rgba(245, 166, 35, 0.25)' : 'rgba(200, 155, 60, 0.25)', alignItems: 'center', justifyContent: 'center' }} />
                          <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: isDark ? 'rgba(245, 166, 35, 0.15)' : '#FEF3C7', borderWidth: 2, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', shadowColor: colors.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 }}>
                            <Text className="text-2xl" style={{ color: colors.gold }}>🛜</Text>
                          </View>
                        </>
                      )}
                    </View>
   
                    <Text 
                      className="text-xs text-center max-w-[80%] leading-5"
                      style={{ marginTop: 8, marginBottom: 28, color: colors.muted }}
                    >
                      Place a blank card near the phone to write card details
                    </Text>
   
                    <View className="flex-col w-full">
                      <TouchableOpacity 
                        className="w-full bg-gold py-4 rounded-2xl items-center justify-center min-h-[52px] flex-row gap-2 border"
                        onPress={handleWriteNfc}
                        disabled={isNfcWriting || isProcessing}
                        style={{ 
                          marginBottom: 12, 
                          opacity: (isNfcWriting || isProcessing) ? 0.5 : 1, 
                          borderColor: colors.gold,
                          backgroundColor: (isNfcWriting || isProcessing) ? (isDark ? '#27272A' : '#E4E4E7') : colors.gold
                        }}
                      >
                        <Text className="text-base">🛜</Text>
                        <Text className="font-extrabold text-base tracking-wide" style={{ color: (isNfcWriting || isProcessing) ? colors.muted : colors.goldButtonText }}>
                          {loadingAction === 'write_card' ? `Writing... (${secondsLeft}s)` : (isNfcWriting ? 'Writing to Card...' : 'Write to Card')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        className="w-full py-4 rounded-2xl border items-center justify-center min-h-[52px]" 
                        style={{ 
                          backgroundColor: isDark ? colors.secondarySurface : '#F1F5F9', 
                          borderColor: isDark ? colors.border : '#CBD5E1',
                          borderWidth: 1.5
                        }}
                        onPress={() => setStep(3)}
                        disabled={isNfcWriting}
                      >
                        <Text className="font-bold text-sm" style={{ color: colors.muted }}>Back</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {/* Success screen overlay */}
                {nfcWriteState === 'success' && createdSession && (
                  <View className="items-center justify-center py-4">
                    <View className="w-16 h-16 rounded-full bg-teal/10 border justify-center items-center mb-4" style={{ borderColor: colors.teal }}>
                      <Text className="text-3xl font-extrabold" style={{ color: colors.teal }}>✓</Text>
                    </View>
                    
                    <Text className="text-lg font-bold mb-2 text-center" style={{ color: colors.text }}>
                      Card Programmed Successfully!
                    </Text>
                    
                    <View className="w-full border rounded-xl p-4 mb-6" style={{ backgroundColor: colors.secondarySurface, borderColor: isDark ? colors.border : '#E2E8F0', borderWidth: 1.5 }}>
                      <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                        <Text className="text-[11px]" style={{ color: colors.muted }}>Customer Name:</Text>
                        <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{fullName}</Text>
                      </View>
                      <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                        <Text className="text-[11px]" style={{ color: colors.muted }}>Assigned Table:</Text>
                        <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{selectedTableNum}</Text>
                      </View>
                      <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                        <Text className="text-[11px]" style={{ color: colors.muted }}>Card Number:</Text>
                        <Text className="font-mono text-[11px] font-extrabold" style={{ color: colors.gold }}>{cardUid}</Text>
                      </View>
                      <View className="flex-row justify-between py-2">
                        <Text className="text-[11px]" style={{ color: colors.muted }}>Drinks Included:</Text>
                        <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{maxDrinksTotal} Free Drinks</Text>
                      </View>
                    </View>

                    <TouchableOpacity 
                      className="bg-gold py-[15px] rounded-xl w-full items-center justify-center min-h-[48px] border" 
                      style={{ borderColor: colors.gold }} 
                      onPress={resetWizard}
                    >
                      <Text className="font-extrabold text-sm" style={{ color: colors.goldButtonText }}>New Guest Check-in</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Error screen overlay */}
                {nfcWriteState === 'error' && (
                  <View className="items-center justify-center py-4">
                    <Text className="text-4xl mb-3">🛑</Text>
                    <Text className="text-lg font-bold mb-2" style={{ color: colors.text }}>Card Setup Failed</Text>
                    <Text className="text-[11px] text-center leading-4 max-w-[85%] mb-6" style={{ color: colors.muted }}>
                      Failed to write details to the card. Make sure the card is placed correctly near the phone.
                    </Text>
                    <View className="flex-row gap-3 w-full">
                      <TouchableOpacity 
                        className="flex-1 py-3.5 rounded-xl border items-center justify-center min-h-[48px]" 
                        style={{ 
                          backgroundColor: isDark ? colors.secondarySurface : '#F1F5F9', 
                          borderColor: isDark ? colors.border : '#CBD5E1',
                          borderWidth: 1.5
                        }} 
                        onPress={() => setNfcWriteState('idle')}
                      >
                        <Text className="font-bold text-sm" style={{ color: colors.muted }}>Retry Scan</Text>
                      </TouchableOpacity>
                      <TouchableOpacity className="flex-1 bg-gold py-3.5 rounded-xl items-center justify-center min-h-[48px] border" style={{ borderColor: colors.gold }} onPress={resetWizard}>
                        <Text className="font-bold text-sm" style={{ color: colors.goldButtonText }}>Reset Form</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Beautiful Custom Design Capacity Alert Modal */}
      <AlertModal
        visible={showCapacityAlert}
        onClose={() => setShowCapacityAlert(false)}
        title="Change Guest Count?"
      >
        <View style={{ alignItems: 'center' }}>
          <View style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(200, 155, 60, 0.1)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            borderWidth: 1.5,
            borderColor: isDark ? 'rgba(245, 166, 35, 0.3)' : colors.border
          }}>
            <Text style={{ fontSize: 22 }}>⚠️</Text>
          </View>

          <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: 24 }}>
            If you increase the number of persons, you can't match the selected table. You can select the number of persons based on the table availability.
          </Text>

          <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: colors.input,
                borderWidth: 1.5,
                borderColor: colors.border,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onPress={() => setShowCapacityAlert(false)}
            >
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: 'bold' }}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: colors.gold,
                borderWidth: 1.5,
                borderColor: colors.gold,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onPress={() => {
                setShowCapacityAlert(false);
                setSelectedTableNum(null);
                setIsTablePreselected(false);
                setGuestCount(c => Math.min(20, c + 1));
                showToast("Table selection reset. Please select an available table matching your seating options.", "info");
              }}
            >
              <Text style={{ color: colors.goldButtonText, fontSize: 13, fontWeight: '900' }}>Increase</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AlertModal>

      {/* Pending Session Exists Modal */}
      <AlertModal
        visible={showPendingExistsModal}
        onClose={() => setShowPendingExistsModal(false)}
        title="Pending Session Found"
      >
        <View style={{ alignItems: 'center' }}>
          <View style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(200, 155, 60, 0.1)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            borderWidth: 1.5,
            borderColor: isDark ? 'rgba(245, 166, 35, 0.3)' : colors.border
          }}>
            <Text style={{ fontSize: 22 }}>⏳</Text>
          </View>

          <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: 24 }}>
            A pending payment session already exists for this customer.
          </Text>

          <View style={{ flexDirection: 'column', gap: 10, width: '100%' }}>
            <TouchableOpacity
              style={{
                width: '100%',
                backgroundColor: colors.gold,
                borderWidth: 1.5,
                borderColor: colors.gold,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onPress={() => {
                setShowPendingExistsModal(false);
                const matchingSession = pendingSessions.find(s => s.tokenNumber === pendingExistsTokenNumber);
                if (matchingSession) {
                  handleResumePending(matchingSession);
                } else {
                  setPendingToken(pendingExistsTokenNumber);
                  setScannedToken('');
                  setQrVerificationSuccess(false);
                  setQrVerificationError(null);
                  setStep(5);
                }
              }}
            >
              <Text style={{ color: colors.goldButtonText, fontSize: 13, fontWeight: '900' }}>Continue Check-in</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                width: '100%',
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                borderWidth: 1.5,
                borderColor: '#EF4444',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onPress={async () => {
                setShowPendingExistsModal(false);
                await cancelPendingSession(pendingExistsTokenNumber, 'SESSION_RESTARTED');
                handleStep1Submit();
              }}
            >
              <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: 'bold' }}>Cancel Existing & Start New</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                width: '100%',
                backgroundColor: colors.input,
                borderWidth: 1.5,
                borderColor: colors.border,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onPress={() => setShowPendingExistsModal(false)}
            >
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: 'bold' }}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AlertModal>

      {/* Cancel Pending Session Confirmation Modal */}
      <AlertModal
        visible={showCancelConfirmModal}
        onClose={() => setShowCancelConfirmModal(false)}
        title="Cancel Check-in"
      >
        <View style={{ alignItems: 'center' }}>
          <View style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            borderWidth: 1.5,
            borderColor: '#EF4444'
          }}>
            <Text style={{ fontSize: 22 }}>⚠️</Text>
          </View>

          <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: 24 }}>
            Are you sure you want to cancel this pending check-in? The guest session has not been activated yet.
          </Text>

          <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: colors.input,
                borderWidth: 1.5,
                borderColor: colors.border,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onPress={() => setShowCancelConfirmModal(false)}
            >
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: 'bold' }}>Continue Check-in</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: '#EF4444',
                borderWidth: 1.5,
                borderColor: '#EF4444',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onPress={async () => {
                setShowCancelConfirmModal(false);
                if (pendingToken) {
                  await cancelPendingSession(pendingToken, 'USER_CANCELLED');
                }
                resetWizard();
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>Cancel Check-in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AlertModal>

      {/* Payment Confirmation Modal */}
      <AlertModal
        visible={showPaymentConfirmModal}
        onClose={() => setShowPaymentConfirmModal(false)}
        title="Payment Confirmation"
      >
        <View style={{ alignItems: 'center' }}>
          <View style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(200, 155, 60, 0.1)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            borderWidth: 1.5,
            borderColor: isDark ? 'rgba(245, 166, 35, 0.3)' : colors.border
          }}>
            <Text style={{ fontSize: 22 }}>💳</Text>
          </View>

          <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: 24 }}>
            Has the customer successfully completed the payment? Only confirm the payment after verifying that the payment has been received.
          </Text>

          <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: colors.input,
                borderWidth: 1.5,
                borderColor: colors.border,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onPress={() => setShowPaymentConfirmModal(false)}
            >
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: 'bold' }}>No</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: colors.teal,
                borderWidth: 1.5,
                borderColor: colors.teal,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onPress={() => {
                setShowPaymentConfirmModal(false);
                handlePaymentCollected();
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>Yes, Payment Received</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AlertModal>
    </View>
  );
};

