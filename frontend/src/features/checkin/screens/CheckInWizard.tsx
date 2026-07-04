import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, 
  ActivityIndicator, StyleSheet, Platform, Alert, Modal
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNfcBar } from '../../../context/NfcBarContext';
import { useTheme } from '../../../context/ThemeContext';
import { SessionToken, PlaceType, TableStatus, TokenStatus } from '../../../types/nfc_bar';
import { isTableExpiring } from '../../../context/nfc_bar_utils';
import { AppIcon } from '../../../components/common/AppIcon';
import nfcService from '../../../services/nfc/nfcManager';
import { useResponsive } from '../../../utils/responsive';

export const CheckInWizard: React.FC = () => {
  const { 
    tables, sessions, rates, checkInGuest, showToast, 
    preselectedTableNumber, setPreselectedTableNumber, tokenType, 
    nfcEnabled, emailQrEnabled,
    createPendingSession, verifyQrCode, activatePendingSession, cancelPendingSession, setTab
  } = useNfcBar();
  const { colors, isDark } = useTheme();
  const { getTableColumns } = useResponsive();
  const cols = getTableColumns();
  const itemWidth = `${(100 / cols) - 0.1}%` as any;
  const [step, setStep] = useState<number>(1);
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
  
  // Simulated outputs
  const [createdSession, setCreatedSession] = useState<SessionToken | null>(null);
  const [isNfcWriting, setIsNfcWriting] = useState(false);
  const [nfcWriteState, setNfcWriteState] = useState<'idle' | 'success' | 'error'>('idle');

  // Business check: Phone active session warning
  const isPhoneActive = sessions.some(s => s.phoneNumber === phone && s.status === TokenStatus.ACTIVE);
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

  const isPhoneOk = isValidPhoneNumber(phone) && !isPhoneActive;
  const isEmailOk = selectedDeliveryMode === 'EMAIL_QR'
    ? (email.trim().length > 0 && isValidEmail(email))
    : isValidEmail(email);
  const isCapacityOk = guestCount <= maxAllowedSeats;
  const isStep1Valid = isNameOk && isPhoneOk && isEmailOk && isCapacityOk;
  const isStep2Valid = selectedTableNum !== null;

  const handleStep1Submit = async () => {
    if (isStep1Valid) {
      if (selectedDeliveryMode === 'EMAIL_QR') {
        setIsActivating(true);
        try {
          const pendingSession = await createPendingSession({
            customerName: fullName,
            phoneNumber: phone,
            email: email.trim(),
            personsCount: guestCount,
            placeType
          });
          setIsActivating(false);
          if (pendingSession) {
            setPendingToken(pendingSession.tokenNumber);
            setScannedToken('');
            setQrVerificationSuccess(false);
            setQrVerificationError(null);
            setStep(5);
          }
        } catch (err: any) {
          setIsActivating(false);
          if (err.code === 'PENDING_SESSION_EXISTS') {
            setPendingExistsTokenNumber(err.tokenNumber);
            setShowPendingExistsModal(true);
          }
        }
      } else {
        if (isTablePreselected) {
          setStep(3);
        } else {
          setStep(2);
        }
      }
    }
  };

  const handleStep2Submit = () => {
    if (isStep2Valid) setStep(3);
  };

  // Load dynamic rates with safety fallbacks
  const rateCard = rates.find(r => r.placeType === placeType) || rates[0] || { ratePerPerson: placeType === 'STANDING_BAR' ? 500 : 900, durationHours: placeType === 'STANDING_BAR' ? 2 : 3, maxDrinks: placeType === 'STANDING_BAR' ? 2 : 6 };
  const basePrice = rateCard.ratePerPerson;
  const durationHours = rateCard.durationHours;
  const totalPrice = basePrice * guestCount;
  const maxDrinksPerPerson = rateCard.maxDrinks;
  const maxDrinksTotal = maxDrinksPerPerson * guestCount;

  const handlePaymentCollected = async () => {
    if (selectedDeliveryMode === 'EMAIL_QR') {
      if (!pendingToken || !selectedTableNum) {
        showToast('Session token or table selection is missing.', 'danger');
        return;
      }
      setIsNfcWriting(true);
      try {
        const token = await activatePendingSession(pendingToken, selectedTableNum, totalPrice);
        setIsNfcWriting(false);
        if (token) {
          setCreatedSession(token);
          setNfcWriteState('success');
          setStep(4);
        } else {
          setNfcWriteState('error');
          setStep(4);
        }
      } catch (error: any) {
        setIsNfcWriting(false);
        console.error('Activation error:', error);
        setNfcWriteState('error');
        setStep(4);
        showToast(error.message || 'Activation failed.', 'danger');
      }
    } else {
      setCardUid('');
      setStep(4);
    }
  };

  const handleWriteNfc = async () => {
    setIsNfcWriting(true);
    setNfcWriteState('idle');
    
    try {
      await nfcService.initialize();
      
      // 1. Scan card to get physical UID
      showToast('Scan NFC card to fetch Card UID...', 'info');
      const details = await nfcService.readCardDetails();
      if (!details || !details.nfcUid) {
        throw new Error('Failed to read Card UID from NFC tag.');
      }
      
      const physicalCardUid = details.nfcUid;
      setCardUid(physicalCardUid);
      
      // 2. Call checkInGuest to register token in DB / offline queue
      const token = checkInGuest({
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
      showToast('Writing token to physical NFC card...', 'info');
      const writeSuccess = await nfcService.writeToCard(token.tokenNumber);
      if (!writeSuccess) {
        throw new Error('Failed to write NDEF token number onto tag.');
      }

      setCreatedSession(token);
      setNfcWriteState('success');
      showToast('NFC card programmed successfully!', 'success');
    } catch (error: any) {
      console.error('NFC Write process error:', error);
      setNfcWriteState('error');
      showToast(error.message || 'NFC program failed.', 'danger');
    } finally {
      setIsNfcWriting(false);
    }
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
        {[1, 2, 3, 4].map(s => {
          let isDone = false;
          let isActive = false;
          if (selectedDeliveryMode === 'EMAIL_QR') {
            if (s === 1) {
              isDone = step > 1;
              isActive = step === 1;
            } else if (s === 2) {
              isDone = step === 3 || step === 4;
              isActive = step === 5 || step === 2;
            } else if (s === 3) {
              isDone = step === 4;
              isActive = step === 3;
            } else if (s === 4) {
              isActive = step === 4;
            }
          } else {
            isDone = step > s;
            isActive = step === s;
          }
          return (
            <View 
              key={s} 
              className="flex-grow h-1.5 rounded-full"
              style={{ backgroundColor: isDone ? colors.teal : isActive ? colors.gold : colors.input }}
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
            <Text className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: colors.gold }}>Step 1.5 — QR Dispatch & Verification</Text>
            <Text className="text-sm font-semibold mb-4" style={{ color: colors.text }}>
              A pending check-in session has been created. The QR code has been dispatched to {email.toLowerCase()}.
            </Text>

            {/* Explicit Camera Scanner Trigger Button */}
            <TouchableOpacity 
              className="w-full py-4 rounded-xl items-center justify-center mb-4 flex-row gap-2"
              style={{ backgroundColor: colors.gold, borderRadius: 12 }}
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
            >
              <Text className="text-3xl">📷</Text>
              <Text className="font-bold text-sm" style={{ color: colors.goldButtonText }}>Open Camera Scanner</Text>
            </TouchableOpacity>

            {/* Full-Screen Camera Scanner Modal */}
            <Modal
              visible={isCameraActive}
              animationType="slide"
              transparent={false}
              onRequestClose={() => setIsCameraActive(false)}
            >
              <View style={{ flex: 1, backgroundColor: '#000000' }}>
                {permission && permission.granted && isCameraActive && (
                  <CameraView
                    style={StyleSheet.absoluteFillObject}
                    facing="back"
                    onBarcodeScanned={async ({ data }) => {
                      if (data && !isVerifyingQr) {
                        setIsCameraActive(false);
                        setScannedToken(data);
                        setIsVerifyingQr(true);
                        const verifiedToken = await verifyQrCode(data);
                        setIsVerifyingQr(false);
                        if (verifiedToken) {
                          setQrVerificationSuccess(true);
                          setStep(2); // Proceed to Table Selection
                        } else {
                          setQrVerificationError('Invalid or expired QR token.');
                        }
                      }
                    }}
                  />
                )}
                
                {/* Transparent Overlay Container to Align Controls without affecting CameraView layout */}
                <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' }]}>
                  {/* Scanner Target Guide Overlay */}
                  <View style={{ width: 250, height: 250, borderWidth: 2, borderColor: colors.gold, borderRadius: 16, backgroundColor: 'transparent', position: 'relative' }}>
                    <View 
                      style={{ position: 'absolute', left: 10, right: 10, height: 1.5, backgroundColor: 'red', top: '50%' }}
                    />
                  </View>
                  
                  <Text style={{ color: '#ffffff', marginTop: 24, fontSize: 14, fontWeight: '600', textAlign: 'center', paddingHorizontal: 20 }}>
                    Align the customer's QR code within the frame to scan
                  </Text>
                  
                  <TouchableOpacity
                    style={{ position: 'absolute', bottom: 40, backgroundColor: 'rgba(255, 255, 255, 0.4)', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 20 }}
                    onPress={() => setIsCameraActive(false)}
                  >
                    <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>Cancel Scan</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

            {/* Input field for token number */}
            <Text className="text-xs font-bold mb-1.5" style={{ color: colors.gold }}>QR Code Token</Text>
            <TextInput 
              style={{ color: colors.text, backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 'bold' }}
              placeholder="Paste BAR-XXXXXXXXXX or scanned JWT here"
              placeholderTextColor={colors.muted}
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
                style={{ backgroundColor: colors.input, borderColor: colors.border }}
                onPress={() => setShowCancelConfirmModal(true)}
              >
                <Text className="font-bold text-sm" style={{ color: colors.muted }}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                className="flex-grow flex-1 bg-gold py-3.5 rounded-xl items-center justify-center min-h-[48px] border"
                style={{ borderColor: colors.gold }}
                onPress={async () => {
                  if (!scannedToken.trim()) {
                    setQrVerificationError('Please enter the scanned QR token.');
                    return;
                  }
                  setIsVerifyingQr(true);
                  const verifiedToken = await verifyQrCode(scannedToken.trim());
                  setIsVerifyingQr(false);
                  if (verifiedToken) {
                    setQrVerificationSuccess(true);
                    setStep(2); // Proceed to Table Selection
                  } else {
                    setQrVerificationError('Invalid or expired QR token.');
                  }
                }}
              >
                <Text className="font-bold text-sm" style={{ color: colors.goldButtonText }}>Verify QR</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Testing Simulator helper */}
            {pendingToken && (
              <TouchableOpacity 
                className="mt-3 bg-teal/10 border border-teal/20 py-2.5 rounded-xl items-center justify-center"
                onPress={() => setScannedToken(pendingToken)}
              >
                <Text className="text-teal text-xs font-bold">🧪 Simulate scanning generated QR: {pendingToken}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        
        {/* STEP 1: CUSTOMER DETAILS */}
        {step === 1 && (
          <View>
            {/* Customer Name Input */}
            <View 
              className="rounded-2xl p-4 mb-4 border"
              style={{ 
                backgroundColor: colors.surface, 
                borderColor: focusedField === 'name' ? colors.gold : colors.inputBorder,
                borderWidth: 1 
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
                placeholderTextColor={colors.muted}
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
                backgroundColor: colors.surface, 
                borderColor: focusedField === 'phone' ? colors.gold : colors.inputBorder,
                borderWidth: 1 
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
                placeholderTextColor={colors.muted}
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
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Customer already has an active session.</Text>
                </View>
              )}
            </View>

            {/* Email Address Input */}
            <View 
              className="rounded-2xl p-4 mb-4 border"
              style={{ 
                backgroundColor: colors.surface, 
                borderColor: focusedField === 'email' ? colors.gold : colors.inputBorder,
                borderWidth: 1 
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
                placeholderTextColor={colors.muted}
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
              {email.trim().length > 0 && !isEmailOk && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Please enter a valid Gmail address (lowercase letters, numbers, and dots only).</Text>
                </View>
              )}
            </View>

            {/* Delivery Method Selector (Only shown if BOTH are enabled) */}
            {nfcEnabled && emailQrEnabled && (
              <View 
                className="rounded-2xl p-4 mb-5 border"
                style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
              >
                <Text className="text-xs font-bold mb-3" style={{ color: colors.gold }}>📦 Delivery Method *</Text>
                <View className="flex-row gap-3">
                  <TouchableOpacity 
                    className="flex-1 flex-row items-center justify-center py-3 rounded-xl border min-h-[44px]"
                    style={{
                      backgroundColor: selectedDeliveryMode === 'NFC_CARD' ? (isDark ? 'rgba(245,166,35,0.1)' : 'rgba(200,155,60,0.1)') : colors.input,
                      borderColor: selectedDeliveryMode === 'NFC_CARD' ? colors.gold : colors.border,
                      borderWidth: 1
                    }}
                    onPress={() => setSelectedDeliveryMode('NFC_CARD')}
                  >
                    <Text style={{ fontSize: 13, marginRight: 6 }}>💳</Text>
                    <Text className="text-xs font-bold" style={{ color: selectedDeliveryMode === 'NFC_CARD' ? colors.gold : colors.muted }}>NFC Smart Card</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className="flex-1 flex-row items-center justify-center py-3 rounded-xl border min-h-[44px]"
                    style={{
                      backgroundColor: selectedDeliveryMode === 'EMAIL_QR' ? (isDark ? 'rgba(245,166,35,0.1)' : 'rgba(200,155,60,0.1)') : colors.input,
                      borderColor: selectedDeliveryMode === 'EMAIL_QR' ? colors.gold : colors.border,
                      borderWidth: 1
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
              style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
            >
              <View className="flex-row items-center mb-3">
                <Text className="text-xs font-bold mr-1.5" style={{ color: colors.gold }}>👥</Text>
                <Text className="text-xs font-bold" style={{ color: colors.gold }}>Number of Persons *</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <TouchableOpacity 
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: isDark ? '#27272a' : colors.input,
                    borderColor: colors.border,
                    borderWidth: isDark ? 0 : 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: guestCount <= 1 ? 0.3 : 1
                  }}
                  onPress={() => setGuestCount(c => Math.max(1, c - 1))}
                  disabled={guestCount <= 1}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold', lineHeight: 18 }}>−</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: 'bold', width: 24, textAlign: 'center' }}>{guestCount}</Text>
                <TouchableOpacity 
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: isDark ? '#27272a' : colors.input,
                    borderColor: colors.border,
                    borderWidth: isDark ? 0 : 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: guestCount >= 20 ? 0.3 : 1
                  }}
                  onPress={() => {
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
                backgroundColor: !isStep1Valid ? colors.input : colors.gold,
                borderColor: !isStep1Valid ? colors.border : colors.gold
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
                        backgroundColor: isSelected ? (isPremium ? 'rgba(245,166,35,0.05)' : 'rgba(78,205,196,0.05)') : colors.input,
                        borderColor: isSelected ? (isPremium ? colors.gold : colors.teal) : colors.border,
                        borderWidth: 1,
                        borderRadius: 12,
                        padding: 12
                      }}
                      onPress={() => { setPlaceType(rate.placeType); setSelectedTableNum(null); }}
                    >
                      <View className="flex-row items-center gap-1.5 mb-1">
                        <View className={`w-1.5 h-1.5 rounded-full ${dotColor}`} style={!isDark && dotColor === 'bg-teal' ? { backgroundColor: colors.teal } : {}} />
                        <Text className="font-extrabold text-[11px]" style={{ color: colors.text }}>
                          {rate.placeType === 'STANDING_BAR' ? 'Standing Bar Area' : (rate.placeType === 'PREMIUM_LOUNGE' ? 'Premium Lounge Area' : rate.placeType)}
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
                  
                  let bgCol = colors.input;
                  let borderCol = colors.border;
                  let textCol = colors.muted;
                  let labelTag = `${table.seats} Seats`;

                  if (isSelected) {
                    bgCol = isDark ? 'rgba(245,166,35,0.1)' : 'rgba(200,155,60,0.1)';
                    borderCol = colors.gold;
                    textCol = colors.gold;
                  } else if (isOccupied) {
                    bgCol = isDark ? 'rgba(230,57,70,0.1)' : 'rgba(230,57,70,0.05)';
                    borderCol = '#e63946';
                    textCol = '#e63946';
                    labelTag = 'OCC';
                  } else if (isMaintenance) {
                    bgCol = colors.surface;
                    borderCol = colors.border;
                    textCol = colors.muted;
                    labelTag = 'MNT';
                  } else if (isTooSmall) {
                    bgCol = colors.surface;
                    borderCol = colors.border;
                    textCol = colors.muted;
                    labelTag = `${table.seats} PAX`;
                  } else {
                    bgCol = colors.input;
                    borderCol = isDark ? 'rgba(78,205,196,0.3)' : 'rgba(28,46,74,0.3)';
                    textCol = colors.teal;
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
                          borderWidth: 1,
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
              <TouchableOpacity className="flex-1 py-3.5 rounded-xl border items-center justify-center min-h-[48px]" style={{ backgroundColor: colors.input, borderColor: colors.border }} onPress={() => setStep(1)}>
                <Text className="font-bold text-sm" style={{ color: colors.muted }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-[2] py-3.5 rounded-xl items-center justify-center min-h-[48px] border"
                style={{ 
                  backgroundColor: !isStep2Valid ? colors.input : colors.gold,
                  borderColor: !isStep2Valid ? colors.border : colors.gold
                }}
                disabled={!isStep2Valid}
                onPress={handleStep2Submit}
              >
                <Text 
                  className="font-bold text-sm" 
                  style={{ color: !isStep2Valid ? colors.muted : colors.goldButtonText }}
                >
                  Check Bill
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
            <Text className="text-[10px] font-bold uppercase tracking-wider mb-4" style={{ color: colors.gold }}>Payment Summary</Text>
            
            {/* 2-Column Info Grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8, marginBottom: 12 }}>
              {/* Guest Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: colors.input,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Guest</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>{fullName}</Text>
                </View>
              </View>

              {/* Phone Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: colors.input,
                  borderWidth: 1,
                  borderColor: colors.border,
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
                  backgroundColor: colors.input,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Area</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.gold }} numberOfLines={1}>
                    {placeType === 'STANDING_BAR' ? 'Standing Bar Area' : 'Premium Lounge Area'}
                  </Text>
                </View>
              </View>

              {/* Table Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: colors.input,
                  borderWidth: 1,
                  borderColor: colors.border,
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
                  backgroundColor: colors.input,
                  borderWidth: 1,
                  borderColor: colors.border,
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
                  backgroundColor: colors.input,
                  borderWidth: 1,
                  borderColor: colors.border,
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
              backgroundColor: isDark ? 'rgba(245, 166, 35, 0.04)' : 'rgba(200, 155, 60, 0.05)',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(245, 166, 35, 0.25)' : 'rgba(200, 155, 60, 0.3)',
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: 'bold' }}>Total Bill</Text>
                <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>₹{basePrice} × {guestCount} guests</Text>
              </View>
              <Text style={{ color: colors.gold, fontSize: 22, fontWeight: '900' }}>₹{totalPrice.toLocaleString('en-IN')}</Text>
            </View>

            {/* Prompt Box */}
            <View style={{
              backgroundColor: isDark ? 'rgba(245, 166, 35, 0.08)' : 'rgba(200, 155, 60, 0.08)',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(245, 166, 35, 0.4)' : 'rgba(200, 155, 60, 0.4)',
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20
            }}>
              <Text style={{ fontSize: 18 }}>💳</Text>
              <Text style={{ color: colors.gold, fontSize: 12, fontWeight: 'bold', flex: 1 }}>
                Collect ₹{totalPrice.toLocaleString('en-IN')} — then confirm payment below
              </Text>
            </View>

            {/* Navigation keys */}
            <View className="flex-col gap-3">
              <TouchableOpacity 
                className="w-full bg-gold py-4 rounded-2xl items-center justify-center min-h-[52px] flex-row gap-2 border"
                style={{ borderColor: colors.gold }}
                onPress={() => {
                  if (selectedDeliveryMode === 'EMAIL_QR') {
                    setShowPaymentConfirmModal(true);
                  } else {
                    handlePaymentCollected();
                  }
                }}
              >
                <Text className="text-base">✓</Text>
                <Text className="font-extrabold text-base tracking-wide" style={{ color: colors.goldButtonText }}>
                  Payment Collected
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="w-full py-4 rounded-2xl border items-center justify-center min-h-[52px]" 
                style={{ backgroundColor: colors.input, borderColor: colors.border }}
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
              {nfcWriteState === 'idle' ? (
                <View className="items-center justify-center py-4 w-full">
                  {/* Premium Summary Grid */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8, marginBottom: 20, width: '100%' }}>
                    {/* Token ID Card - Full Width */}
                    <View style={{ width: '100%', padding: 8 }}>
                      <View style={{
                        backgroundColor: colors.input,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 12,
                        padding: 12,
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 3 }}>Assigned Token Code</Text>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.gold, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 2 }}>
                          BAR - {new Date().toISOString().slice(0,10).replace(/-/g,'')} - {cardUid ? (cardUid.includes('-') ? cardUid.split('-')[1] : cardUid.slice(-5).toUpperCase()) : 'AX7K2'}
                        </Text>
                      </View>
                    </View>

                    {/* Area Zone Card */}
                    <View style={{ width: '50%', padding: 8 }}>
                      <View style={{
                        backgroundColor: colors.input,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 12,
                        padding: 10,
                        minHeight: 52,
                        justifyContent: 'center'
                      }}>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Seating Area</Text>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>
                          {placeType === 'STANDING_BAR' ? 'Standing Bar Area' : 'Premium Lounge Area'}
                        </Text>
                      </View>
                    </View>

                    {/* Table Card */}
                    <View style={{ width: '50%', padding: 8 }}>
                      <View style={{
                        backgroundColor: colors.input,
                        borderWidth: 1,
                        borderColor: colors.border,
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
                        backgroundColor: colors.input,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 12,
                        padding: 10,
                        minHeight: 52,
                        justifyContent: 'center'
                      }}>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.muted, textTransform: 'uppercase', marginBottom: 2 }}>Guests</Text>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>{guestCount} Guests</Text>
                      </View>
                    </View>

                    {/* Coupons Card */}
                    <View style={{ width: '50%', padding: 8 }}>
                      <View style={{
                        backgroundColor: colors.input,
                        borderWidth: 1,
                        borderColor: colors.border,
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
                        <View style={{ position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 1, borderColor: isDark ? 'rgba(245, 166, 35, 0.15)' : 'rgba(200, 155, 60, 0.15)', alignItems: 'center', justifyContent: 'center' }} />
                        <View style={{ position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: isDark ? 'rgba(245, 166, 35, 0.35)' : 'rgba(200, 155, 60, 0.35)', alignItems: 'center', justifyContent: 'center' }} />
                        <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: isDark ? 'rgba(245, 166, 35, 0.15)' : 'rgba(200, 155, 60, 0.15)', borderWidth: 2, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
                          <ActivityIndicator size="small" color={colors.gold} style={{ transform: [{ scale: 1.1 }] }} />
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={{ position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 1, borderColor: isDark ? 'rgba(245, 166, 35, 0.15)' : 'rgba(200, 155, 60, 0.15)', alignItems: 'center', justifyContent: 'center' }} />
                        <View style={{ position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: isDark ? 'rgba(245, 166, 35, 0.25)' : 'rgba(200, 155, 60, 0.25)', alignItems: 'center', justifyContent: 'center' }} />
                        <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: isDark ? 'rgba(245, 166, 35, 0.15)' : 'rgba(200, 155, 60, 0.15)', borderWidth: 2, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', shadowColor: colors.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 }}>
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
                      disabled={isNfcWriting}
                      style={{ marginBottom: 12, opacity: isNfcWriting ? 0.5 : 1, borderColor: colors.gold }}
                    >
                      <Text className="text-base">🛜</Text>
                      <Text className="font-extrabold text-base tracking-wide" style={{ color: colors.goldButtonText }}>
                        {isNfcWriting ? 'Writing to Card...' : 'Write to Card'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      className="w-full py-4 rounded-2xl border items-center justify-center min-h-[52px]" 
                      style={{ backgroundColor: colors.input, borderColor: colors.border }}
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
                  {(createdSession?.deliveryMode || selectedDeliveryMode) === 'EMAIL_QR' ? 'Payment confirmed. Guest session is now active.' : 'Card Programmed Successfully!'}
                </Text>
                
                <View className="w-full border rounded-xl p-4 mb-6" style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}>
                  <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                    <Text className="text-[11px]" style={{ color: colors.muted }}>Customer Name:</Text>
                    <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{fullName}</Text>
                  </View>
                  <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                    <Text className="text-[11px]" style={{ color: colors.muted }}>Assigned Table:</Text>
                    <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{selectedTableNum}</Text>
                  </View>
                  {(createdSession?.deliveryMode || selectedDeliveryMode) !== 'EMAIL_QR' && (
                    <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                      <Text className="text-[11px]" style={{ color: colors.muted }}>Card Number:</Text>
                      <Text className="font-mono text-[11px] font-extrabold" style={{ color: colors.gold }}>{cardUid}</Text>
                    </View>
                  )}
                  <View className="flex-row justify-between py-2">
                    <Text className="text-[11px]" style={{ color: colors.muted }}>Drinks Included:</Text>
                    <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{maxDrinksTotal} Free Drinks</Text>
                  </View>
                </View>

                {(createdSession?.deliveryMode || selectedDeliveryMode) === 'EMAIL_QR' ? (
                  <TouchableOpacity 
                    className="bg-gold py-[15px] rounded-xl w-full items-center justify-center min-h-[48px] border" 
                    style={{ borderColor: colors.gold }} 
                    onPress={() => {
                      setTab('bartender');
                      resetWizard();
                    }}
                  >
                    <Text className="font-extrabold text-sm" style={{ color: colors.goldButtonText }}>View in Bartender Page</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    className="bg-gold py-[15px] rounded-xl w-full items-center justify-center min-h-[48px] border" 
                    style={{ borderColor: colors.gold }} 
                    onPress={resetWizard}
                  >
                    <Text className="font-extrabold text-sm" style={{ color: colors.goldButtonText }}>New Guest Check-in</Text>
                  </TouchableOpacity>
                )}
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
                  <TouchableOpacity className="flex-1 py-3.5 rounded-xl border items-center justify-center min-h-[48px]" style={{ backgroundColor: colors.input, borderColor: colors.border }} onPress={() => setNfcWriteState('idle')}>
                    <Text className="font-bold text-sm" style={{ color: colors.muted }}>Retry Scan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-1 bg-gold py-3.5 rounded-xl items-center justify-center min-h-[48px] border" style={{ borderColor: colors.gold }} onPress={resetWizard}>
                    <Text className="font-bold text-sm" style={{ color: colors.goldButtonText }}>Reset Form</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Beautiful Custom Design Capacity Alert Modal */}
      <Modal
        visible={showCapacityAlert}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCapacityAlert(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}>
          <View style={{
            width: '90%',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(245, 166, 35, 0.2)' : colors.border,
            borderRadius: 20,
            padding: 22,
            alignItems: 'center',
            shadowColor: colors.gold,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 8
          }}>
            <View style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(200, 155, 60, 0.1)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(245, 166, 35, 0.3)' : colors.border
            }}>
              <Text style={{ fontSize: 22 }}>⚠️</Text>
            </View>

            <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.gold, marginBottom: 10, textAlign: 'center', letterSpacing: 0.5 }}>
              Change Guest Count?
            </Text>

            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: 24 }}>
              If you increase the number of persons, you can't match the selected table. You can select the number of persons based on the table availability.
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: colors.input,
                  borderWidth: 1,
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
                  borderWidth: 1,
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
                  showToast("Table selection reset. Please select a matching table.", "info");
                }}
              >
                <Text style={{ color: colors.goldButtonText, fontSize: 13, fontWeight: '900' }}>Increase</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pending Session Exists Modal */}
      <Modal
        visible={showPendingExistsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPendingExistsModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}>
          <View style={{
            width: '90%',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(245, 166, 35, 0.2)' : colors.border,
            borderRadius: 20,
            padding: 22,
            alignItems: 'center',
            shadowColor: colors.gold,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 8
          }}>
            <View style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(200, 155, 60, 0.1)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(245, 166, 35, 0.3)' : colors.border
            }}>
              <Text style={{ fontSize: 22 }}>⏳</Text>
            </View>

            <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.gold, marginBottom: 10, textAlign: 'center', letterSpacing: 0.5 }}>
              Pending Session Found
            </Text>

            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: 24 }}>
              A pending payment session already exists for this customer.
            </Text>

            <View style={{ flexDirection: 'column', gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={{
                  width: '100%',
                  backgroundColor: colors.gold,
                  borderWidth: 1,
                  borderColor: colors.gold,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onPress={() => {
                  setPendingToken(pendingExistsTokenNumber);
                  setScannedToken('');
                  setQrVerificationSuccess(false);
                  setQrVerificationError(null);
                  setShowPendingExistsModal(false);
                  setStep(5);
                }}
              >
                <Text style={{ color: colors.goldButtonText, fontSize: 13, fontWeight: '900' }}>Continue Check-in</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  width: '100%',
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                  borderWidth: 1,
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
                  borderWidth: 1,
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
        </View>
      </Modal>

      {/* Cancel Pending Session Confirmation Modal */}
      <Modal
        visible={showCancelConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCancelConfirmModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}>
          <View style={{
            width: '90%',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(245, 166, 35, 0.2)' : colors.border,
            borderRadius: 20,
            padding: 22,
            alignItems: 'center',
            shadowColor: colors.gold,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 8
          }}>
            <View style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              borderWidth: 1,
              borderColor: '#EF4444'
            }}>
              <Text style={{ fontSize: 22 }}>⚠️</Text>
            </View>

            <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.gold, marginBottom: 10, textAlign: 'center', letterSpacing: 0.5 }}>
              Cancel Check-in
            </Text>

            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: 24 }}>
              Are you sure you want to cancel this pending check-in? The guest session has not been activated yet.
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: colors.input,
                  borderWidth: 1,
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
                  borderWidth: 1,
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
        </View>
      </Modal>

      {/* Payment Confirmation Modal */}
      <Modal
        visible={showPaymentConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPaymentConfirmModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}>
          <View style={{
            width: '90%',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(245, 166, 35, 0.2)' : colors.border,
            borderRadius: 20,
            padding: 22,
            alignItems: 'center',
            shadowColor: colors.gold,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 8
          }}>
            <View style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(200, 155, 60, 0.1)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(245, 166, 35, 0.3)' : colors.border
            }}>
              <Text style={{ fontSize: 22 }}>💳</Text>
            </View>

            <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.gold, marginBottom: 10, textAlign: 'center', letterSpacing: 0.5 }}>
              Payment Confirmation
            </Text>

            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: 24 }}>
              Has the customer successfully completed the payment? Only confirm the payment after verifying that the payment has been received.
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: colors.input,
                  borderWidth: 1,
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
                  borderWidth: 1,
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
        </View>
      </Modal>
    </View>
  );
};

