import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, 
  ActivityIndicator, StyleSheet, Platform, Alert, Modal
} from 'react-native';
import { useNfcBar } from '../../../context/NfcBarContext';
import { SessionToken, PlaceType, TableStatus, TokenStatus } from '../../../types/nfc_bar';
import { isTableExpiring } from '../../../context/nfc_bar_utils';
import { AppIcon } from '../../../components/common/AppIcon';
import nfcService from '../../../services/nfc/nfcManager';
import { useResponsive } from '../../../utils/responsive';

export const CheckInWizard: React.FC = () => {
  const { tables, sessions, rates, checkInGuest, showToast, preselectedTableNumber, setPreselectedTableNumber, tokenType, nfcEnabled, emailQrEnabled } = useNfcBar();
  const { getTableColumns } = useResponsive();
  const cols = getTableColumns();
  const itemWidth = `${100 / cols}%` as any;
  const [step, setStep] = useState<number>(1);
  
  const initialMode = nfcEnabled ? 'NFC_CARD' : 'EMAIL_QR';
  const [selectedDeliveryMode, setSelectedDeliveryMode] = useState<'NFC_CARD' | 'EMAIL_QR'>(initialMode);
  
  useEffect(() => {
    if (!nfcEnabled && emailQrEnabled) {
      setSelectedDeliveryMode('EMAIL_QR');
    } else if (nfcEnabled && !emailQrEnabled) {
      setSelectedDeliveryMode('NFC_CARD');
    }
  }, [nfcEnabled, emailQrEnabled]);

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
  const isPhoneOk = isValidPhoneNumber(phone) && !isPhoneActive;
  const isEmailOk = selectedDeliveryMode === 'EMAIL_QR'
    ? (email.trim().length > 0 && isValidEmail(email))
    : isValidEmail(email);
  const isCapacityOk = guestCount <= maxAllowedSeats;
  const isStep1Valid = isNameOk && isPhoneOk && isEmailOk && isCapacityOk;
  const isStep2Valid = selectedTableNum !== null;

  const handleStep1Submit = () => {
    if (isStep1Valid) {
      if (isTablePreselected) {
        setStep(3);
      } else {
        setStep(2);
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

  const handlePaymentCollected = () => {
    if (selectedDeliveryMode === 'EMAIL_QR') {
      try {
        const token = checkInGuest({
          customerName: fullName,
          phoneNumber: phone,
          email: email.trim() ? email.trim().toLowerCase() : undefined,
          persons: guestCount,
          placeType,
          tableNumber: selectedTableNum!,
          amountPaid: totalPrice,
          redemptionLimit: maxDrinksTotal,
          cardUid: '',
          deliveryMode: 'EMAIL_QR'
        });

        if (!token) {
          throw new Error('Database registration failed.');
        }

        setCreatedSession(token);
        setNfcWriteState('success');
        setStep(4);
      } catch (error: any) {
        console.error('Email check-in error:', error);
        setNfcWriteState('error');
        setStep(4);
        showToast(error.message || 'Check-in failed.', 'danger');
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
    setStep(1);
  };

  return (
    <View className="flex-1 bg-bg p-4">
      {/* Screen Header */}
      <View className="mb-4">
        <View className="flex-row justify-between items-center">
          <Text className="text-[10px] font-bold text-gold uppercase tracking-widest">RECEPTIONIST</Text>
          <View className="flex-row items-center">
            <View className="w-1.5 h-1.5 rounded-full bg-teal mr-1.5" />
            <Text className="text-teal text-[10px] font-bold uppercase tracking-wider">Online</Text>
          </View>
        </View>
        <Text className="text-2xl font-bold text-themeText mt-1" style={{ color: '#f0ede6' }}>New Check-in</Text>
      </View>
      
      {/* Step Progress Pills */}
      <View className="flex-row justify-between mb-5 gap-2">
        {[1, 2, 3, 4].map(s => {
          const isDone = step > s;
          const isActive = step === s;
          return (
            <View 
              key={s} 
              className={`flex-grow h-1.5 rounded-full ${isDone ? 'bg-teal' : isActive ? 'bg-gold' : 'bg-input'}`}
            />
          );
        })}
      </View>

      <ScrollView className="flex-grow" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        
        {/* STEP 1: CUSTOMER DETAILS */}
        {step === 1 && (
          <View>
            {/* Customer Name Input */}
            <View className="bg-surface rounded-2xl p-4 mb-4 border border-white/5">
              <View className="flex-row items-center mb-1">
                <Text className="text-gold text-xs font-bold mr-1.5">👤</Text>
                <Text className="text-gold text-xs font-bold">Full Name *</Text>
              </View>
              <TextInput 
                style={{ color: '#f0ede6' }}
                className="text-base font-semibold py-1.5"
                placeholder="Rahul Mehta"
                placeholderTextColor="#9ca3af"
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
            <View className="bg-surface rounded-2xl p-4 mb-4 border border-white/5">
              <View className="flex-row items-center mb-1">
                <Text className="text-gold text-xs font-bold mr-1.5">📞</Text>
                <Text className="text-gold text-xs font-bold">Phone Number *</Text>
              </View>
              <TextInput 
                style={{ color: '#f0ede6' }}
                className="text-base font-semibold py-1.5"
                placeholder="+91 98765 43210"
                placeholderTextColor="#9ca3af"
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
            <View className="bg-surface rounded-2xl p-4 mb-4 border border-white/5">
              <View className="flex-row justify-between items-center mb-1">
                <View className="flex-row items-center">
                  <Text className="text-gold text-xs font-bold mr-1.5">✉️</Text>
                  <Text className="text-gold text-xs font-bold">Email</Text>
                </View>
                <Text className="text-muted text-[10px] uppercase tracking-wider font-semibold">optional</Text>
              </View>
              <TextInput 
                style={{ color: '#f0ede6' }}
                className="text-base font-semibold py-1.5"
                placeholder="rahul@email.com"
                placeholderTextColor="#9ca3af"
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
              {email.trim().length > 0 && !isEmailOk && (
                <View className="bg-red/5 border border-red/10 rounded-lg p-2 mt-1.5">
                  <Text className="text-red text-[10px] leading-3.5">⚠️ Please enter a valid Gmail address (lowercase letters, numbers, and dots only).</Text>
                </View>
              )}
            </View>

            {/* Delivery Method Selector (Only shown if BOTH are enabled) */}
            {nfcEnabled && emailQrEnabled && (
              <View className="bg-surface rounded-2xl p-4 mb-5 border border-white/5">
                <Text className="text-gold text-xs font-bold mb-3">📦 Delivery Method *</Text>
                <View className="flex-row gap-3">
                  <TouchableOpacity 
                    className={`flex-1 flex-row items-center justify-center py-3 rounded-xl border min-h-[44px]
                      ${selectedDeliveryMode === 'NFC_CARD' 
                        ? 'border-gold bg-gold/10' 
                        : 'border-white/5 bg-[#111318]'}`}
                    onPress={() => setSelectedDeliveryMode('NFC_CARD')}
                  >
                    <Text style={{ fontSize: 13, marginRight: 6 }}>💳</Text>
                    <Text className={`text-xs font-bold ${selectedDeliveryMode === 'NFC_CARD' ? 'text-gold' : 'text-muted'}`}>NFC Smart Card</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className={`flex-1 flex-row items-center justify-center py-3 rounded-xl border min-h-[44px]
                      ${selectedDeliveryMode === 'EMAIL_QR' 
                        ? 'border-gold bg-gold/10' 
                        : 'border-white/5 bg-[#111318]'}`}
                    onPress={() => setSelectedDeliveryMode('EMAIL_QR')}
                  >
                    <Text style={{ fontSize: 13, marginRight: 6 }}>📧</Text>
                    <Text className={`text-xs font-bold ${selectedDeliveryMode === 'EMAIL_QR' ? 'text-gold' : 'text-muted'}`}>Email QR Code</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Guest Pax Count Stepper */}
            <View className="bg-surface rounded-2xl p-4 mb-5 border border-white/5">
              <View className="flex-row items-center mb-3">
                <Text className="text-gold text-xs font-bold mr-1.5">👥</Text>
                <Text className="text-gold text-xs font-bold">Number of Persons *</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <TouchableOpacity 
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#27272a',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: guestCount <= 1 ? 0.3 : 1
                  }}
                  onPress={() => setGuestCount(c => Math.max(1, c - 1))}
                  disabled={guestCount <= 1}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: '#f0ede6', fontSize: 16, fontWeight: 'bold', lineHeight: 18 }}>−</Text>
                </TouchableOpacity>
                <Text style={{ color: '#f0ede6', fontSize: 14, fontWeight: 'bold', width: 24, textAlign: 'center' }}>{guestCount}</Text>
                <TouchableOpacity 
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#27272a',
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
                  <Text style={{ color: '#f0ede6', fontSize: 16, fontWeight: 'bold', lineHeight: 18 }}>+</Text>
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
              className={`py-4 rounded-2xl items-center justify-center min-h-[52px]
                ${!isStep1Valid ? 'bg-input' : 'bg-gold'}`}
              disabled={!isStep1Valid}
              onPress={handleStep1Submit}
            >
              <Text 
                className="font-extrabold text-base tracking-wide" 
                style={{ color: !isStep1Valid ? '#9ca3af' : '#08090d' }}
              >
                Continue  ➔
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          <View className="bg-surface rounded-[20px] p-5 border border-white/5 shadow-xl">
            <Text className="text-[11px] font-bold text-gold uppercase tracking-wider mb-4">Step 2 — Table Selection</Text>
            
            {/* Zone Choice Cards */}
            <Text className="text-themeText text-[13px] font-medium mb-2" style={{ color: '#f0ede6' }}>Select Seating Area</Text>
            <View className="flex-row flex-wrap mb-4" style={{ marginHorizontal: -8 }}>
              {rates.map((rate, idx) => {
                const isSelected = placeType === rate.placeType;
                const isPremium = rate.placeType.toLowerCase().includes('lounge') || idx % 2 === 1;
                const dotColor = isPremium ? 'bg-gold' : 'bg-teal';
                const borderColor = isSelected ? (isPremium ? 'border-gold bg-gold/5' : 'border-teal bg-teal/5') : 'border-white/5';
                
                return (
                  <View key={rate.id || rate.placeType} style={{ width: '50%', padding: 8 }}>
                    <TouchableOpacity 
                      style={{ minHeight: 92 }}
                      className={`w-full bg-input border rounded-xl p-3 ${borderColor}`}
                      onPress={() => { setPlaceType(rate.placeType); setSelectedTableNum(null); }}
                    >
                      <View className="flex-row items-center gap-1.5 mb-1">
                        <View className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                        <Text className="text-themeText font-extrabold text-[11px]" style={{ color: '#f0ede6' }}>
                          {rate.placeType === 'STANDING_BAR' ? 'Standing Bar' : (rate.placeType === 'PREMIUM_LOUNGE' ? 'Premium Lounge' : rate.placeType)}
                        </Text>
                      </View>
                      <Text className="text-themeText text-sm font-extrabold my-0.5" style={{ color: '#f0ede6' }}>₹{rate.ratePerPerson} / Pax</Text>
                      <Text className="text-muted text-[9px]">{rate.durationHours} hrs • {rate.maxDrinks} drink(s) allotted</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {/* Spatial Grid Layout Seating Plan */}
            <Text className="text-themeText text-[13px] font-medium mb-2" style={{ color: '#f0ede6' }}>Choose a Table Map</Text>
            <View className="flex-row flex-wrap mb-5" style={{ marginHorizontal: -6 }}>
              {tables
                .filter(t => t.placeType === placeType)
                .map(table => {
                  const isOccupied = table.status === TableStatus.OCCUPIED;
                  const isMaintenance = table.status === TableStatus.MAINTENANCE;
                  const isTooSmall = table.seats < guestCount;
                  const isSelected = selectedTableNum === table.number;
                  
                  let cardStyles = 'border-white/5 bg-input';
                  let textStyles = 'text-muted';
                  let labelTag = `${table.seats} Seats`;

                  if (isSelected) {
                    cardStyles = 'border-gold bg-gold/10';
                    textStyles = 'text-gold font-extrabold';
                  } else if (isOccupied) {
                    cardStyles = 'border-red/40 bg-surface opacity-70';
                    textStyles = 'text-red font-bold line-through';
                    labelTag = 'OCC';
                  } else if (isMaintenance) {
                    cardStyles = 'border-borderDark bg-surface opacity-55';
                    textStyles = 'text-muted font-semibold';
                    labelTag = 'MNT';
                  } else if (isTooSmall) {
                    cardStyles = 'border-borderDark bg-surface opacity-55';
                    textStyles = 'text-muted font-semibold';
                    labelTag = `${table.seats} PAX`;
                  } else {
                    cardStyles = 'border-teal/30 bg-input active:bg-teal/5';
                    textStyles = 'text-teal font-extrabold';
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
                        }}
                        className={cardStyles}
                        disabled={isOccupied || isMaintenance || isTooSmall}
                        onPress={() => setSelectedTableNum(table.number)}
                        activeOpacity={0.8}
                      >
                        <Text className={`font-mono text-xs ${textStyles}`}>
                          {table.number}
                        </Text>
                        {labelTag ? (
                          <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#9ca3af', marginTop: 1, textTransform: 'uppercase' }}>
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
              <TouchableOpacity className="flex-1 py-3.5 rounded-xl border border-borderDark items-center justify-center min-h-[48px]" onPress={() => setStep(1)}>
                <Text className="font-bold text-sm" style={{ color: '#9ca3af' }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className={`flex-[2] py-3.5 rounded-xl items-center justify-center min-h-[48px]
                  ${!isStep2Valid ? 'bg-input' : 'bg-gold'}`}
                disabled={!isStep2Valid}
                onPress={handleStep2Submit}
              >
                <Text 
                  className="font-bold text-sm" 
                  style={{ color: !isStep2Valid ? '#9ca3af' : '#08090d' }}
                >
                  Check Bill
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 3: BILLING SUMMARY */}
        {step === 3 && (
          <View className="bg-surface rounded-2xl p-5 border border-white/10 shadow-xl">
            <Text className="text-[10px] font-bold text-gold uppercase tracking-wider mb-4">Payment Summary</Text>
            
            {/* 2-Column Info Grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8, marginBottom: 12 }}>
              {/* Guest Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: '#1a1d26',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 }}>Guest</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#f0ede6' }} numberOfLines={1}>{fullName}</Text>
                </View>
              </View>

              {/* Phone Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: '#1a1d26',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 }}>Phone</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#f0ede6' }} numberOfLines={1}>{phone}</Text>
                </View>
              </View>

              {/* Area Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: '#1a1d26',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 }}>Area</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#f5a623' }} numberOfLines={1}>
                    {placeType === 'STANDING_BAR' ? 'Standing Bar' : 'Premium Lounge'}
                  </Text>
                </View>
              </View>

              {/* Table Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: '#1a1d26',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 }}>Table</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#f0ede6' }} numberOfLines={1}>{selectedTableNum}</Text>
                </View>
              </View>

              {/* Persons Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: '#1a1d26',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 }}>Persons</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#f0ede6' }} numberOfLines={1}>{guestCount} Pax</Text>
                </View>
              </View>

              {/* Duration Card */}
              <View style={{ width: '50%', padding: 8 }}>
                <View style={{
                  backgroundColor: '#1a1d26',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 56,
                  justifyContent: 'center'
                }}>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 }}>Duration</Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#f0ede6' }} numberOfLines={1}>{durationHours} hrs</Text>
                </View>
              </View>
            </View>

            {/* Total Amount Box */}
            <View style={{
              backgroundColor: 'rgba(245, 166, 35, 0.04)',
              borderWidth: 1,
              borderColor: 'rgba(245, 166, 35, 0.25)',
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#f0ede6', fontSize: 13, fontWeight: 'bold' }}>Total Bill</Text>
                <Text style={{ color: '#9ca3af', fontSize: 10, marginTop: 2 }}>₹{basePrice} × {guestCount} guests</Text>
              </View>
              <Text style={{ color: '#f5a623', fontSize: 22, fontWeight: '900' }}>₹{totalPrice.toLocaleString('en-IN')}</Text>
            </View>

            {/* Prompt Box */}
            <View style={{
              backgroundColor: 'rgba(245, 166, 35, 0.08)',
              borderWidth: 1,
              borderColor: 'rgba(245, 166, 35, 0.4)',
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20
            }}>
              <Text style={{ fontSize: 18 }}>💳</Text>
              <Text style={{ color: '#f5a623', fontSize: 12, fontWeight: 'bold', flex: 1 }}>
                Collect ₹{totalPrice.toLocaleString('en-IN')} — then confirm payment below
              </Text>
            </View>

            {/* Navigation keys */}
            <View className="flex-col gap-3">
              <TouchableOpacity 
                className="w-full bg-gold py-4 rounded-2xl items-center justify-center min-h-[52px] flex-row gap-2"
                onPress={handlePaymentCollected}
              >
                <Text className="text-base">✓</Text>
                <Text className="font-extrabold text-base tracking-wide" style={{ color: '#08090d' }}>
                  Payment Collected
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="w-full py-4 rounded-2xl border border-borderDark items-center justify-center min-h-[52px]" 
                onPress={() => setStep(isTablePreselected ? 1 : 2)}
              >
                <Text className="font-bold text-sm" style={{ color: '#9ca3af' }}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 4: RADAR PULSE SCANNER */}
        {step === 4 && (
          <View className="bg-surface rounded-2xl p-5 border border-white/10 shadow-xl">
              {nfcWriteState === 'idle' ? (
                <View className="items-center justify-center py-4 w-full">
                  {/* Premium Summary Grid */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8, marginBottom: 20, width: '100%' }}>
                    {/* Token ID Card - Full Width */}
                    <View style={{ width: '100%', padding: 8 }}>
                      <View style={{
                        backgroundColor: '#1a1d26',
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: 12,
                        padding: 12,
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 3 }}>Assigned Token ID</Text>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#f5a623', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 2 }}>
                          BAR - {new Date().toISOString().slice(0,10).replace(/-/g,'')} - {cardUid ? (cardUid.includes('-') ? cardUid.split('-')[1] : cardUid.slice(-5).toUpperCase()) : 'AX7K2'}
                        </Text>
                      </View>
                    </View>

                    {/* Area Zone Card */}
                    <View style={{ width: '50%', padding: 8 }}>
                      <View style={{
                        backgroundColor: '#1a1d26',
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: 12,
                        padding: 10,
                        minHeight: 52,
                        justifyContent: 'center'
                      }}>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 }}>Seating Area</Text>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#f0ede6' }} numberOfLines={1}>
                          {placeType === 'STANDING_BAR' ? 'Standing Bar' : 'Premium Lounge'}
                        </Text>
                      </View>
                    </View>

                    {/* Table Card */}
                    <View style={{ width: '50%', padding: 8 }}>
                      <View style={{
                        backgroundColor: '#1a1d26',
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: 12,
                        padding: 10,
                        minHeight: 52,
                        justifyContent: 'center'
                      }}>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 }}>Seating Table</Text>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#f0ede6' }} numberOfLines={1}>{selectedTableNum}</Text>
                      </View>
                    </View>

                    {/* Guests Card */}
                    <View style={{ width: '50%', padding: 8 }}>
                      <View style={{
                        backgroundColor: '#1a1d26',
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: 12,
                        padding: 10,
                        minHeight: 52,
                        justifyContent: 'center'
                      }}>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 }}>Guests</Text>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#f0ede6' }} numberOfLines={1}>{guestCount} Guests</Text>
                      </View>
                    </View>

                    {/* Coupons Card */}
                    <View style={{ width: '50%', padding: 8 }}>
                      <View style={{
                        backgroundColor: '#1a1d26',
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: 12,
                        padding: 10,
                        minHeight: 52,
                        justifyContent: 'center'
                      }}>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 }}>Drink Coupons</Text>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#f5a623' }} numberOfLines={1}>
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
                        <View style={{ position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 1, borderColor: 'rgba(245, 166, 35, 0.15)', alignItems: 'center', justifyContent: 'center' }} />
                        <View style={{ position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: 'rgba(245, 166, 35, 0.35)', alignItems: 'center', justifyContent: 'center' }} />
                        <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(245, 166, 35, 0.15)', borderWidth: 2, borderColor: '#f5a623', alignItems: 'center', justifyContent: 'center' }}>
                          <ActivityIndicator size="small" color="#f5a623" style={{ transform: [{ scale: 1.1 }] }} />
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={{ position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 1, borderColor: 'rgba(245, 166, 35, 0.15)', alignItems: 'center', justifyContent: 'center' }} />
                        <View style={{ position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: 'rgba(245, 166, 35, 0.25)', alignItems: 'center', justifyContent: 'center' }} />
                        <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(245, 166, 35, 0.15)', borderWidth: 2, borderColor: '#f5a623', alignItems: 'center', justifyContent: 'center', shadowColor: '#f5a623', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 }}>
                          <Text className="text-gold text-2xl">🛜</Text>
                        </View>
                      </>
                    )}
                  </View>
 
                  <Text 
                    className="text-muted text-xs text-center max-w-[80%] leading-5"
                    style={{ marginTop: 8, marginBottom: 28, color: '#9ca3af' }}
                  >
                    Place a blank NFC card near the device to program card
                  </Text>
 
                  <View className="flex-col w-full">
                    <TouchableOpacity 
                      className={`w-full bg-gold py-4 rounded-2xl items-center justify-center min-h-[52px] flex-row gap-2
                        ${isNfcWriting ? 'opacity-50' : ''}`}
                      onPress={handleWriteNfc}
                      disabled={isNfcWriting}
                      style={{ marginBottom: 12 }}
                    >
                      <Text className="text-base">🛜</Text>
                      <Text className="font-extrabold text-base tracking-wide" style={{ color: '#08090d' }}>
                        {isNfcWriting ? 'Programming...' : 'Program Card'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      className="w-full py-4 rounded-2xl border border-borderDark items-center justify-center min-h-[52px]" 
                      onPress={() => setStep(3)}
                      disabled={isNfcWriting}
                    >
                      <Text className="font-bold text-sm" style={{ color: '#9ca3af' }}>Back</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

            {/* Success screen overlay */}
            {nfcWriteState === 'success' && createdSession && (
              <View className="items-center justify-center py-4">
                <View className="w-16 h-16 rounded-full bg-teal/10 border border-teal justify-center items-center mb-4">
                  <Text className="text-teal text-3xl font-extrabold">✓</Text>
                </View>
                
                <Text className="text-lg font-bold text-themeText mb-2" style={{ color: '#f0ede6' }}>
                  {(createdSession?.deliveryMode || selectedDeliveryMode) === 'EMAIL_QR' ? 'Check-in Complete & Email Sent!' : 'Card Programmed Successfully!'}
                </Text>
                
                <View className="w-full bg-input border border-white/5 rounded-xl p-4 mb-6">
                  <View className="flex-row justify-between py-2 border-b border-white/5">
                    <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Customer Name:</Text>
                    <Text className="text-themeText text-[11px] font-bold" style={{ color: '#f0ede6' }}>{fullName}</Text>
                  </View>
                  <View className="flex-row justify-between py-2 border-b border-white/5">
                    <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Assigned Table:</Text>
                    <Text className="text-themeText text-[11px] font-bold" style={{ color: '#f0ede6' }}>{selectedTableNum}</Text>
                  </View>
                  {(createdSession?.deliveryMode || selectedDeliveryMode) !== 'EMAIL_QR' && (
                    <View className="flex-row justify-between py-2 border-b border-white/5">
                      <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Card Number:</Text>
                      <Text className="font-mono text-gold text-[11px] font-extrabold">{cardUid}</Text>
                    </View>
                  )}
                  <View className="flex-row justify-between py-2">
                    <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Drinks Included:</Text>
                    <Text className="text-themeText text-[11px] font-bold" style={{ color: '#f0ede6' }}>{maxDrinksTotal} Free Drinks</Text>
                  </View>
                </View>

                <TouchableOpacity className="bg-gold py-[15px] rounded-xl w-full items-center justify-center min-h-[48px]" onPress={resetWizard}>
                  <Text className="font-extrabold text-sm" style={{ color: '#08090d' }}>New Guest Check-in</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Error screen overlay */}
            {nfcWriteState === 'error' && (
              <View className="items-center justify-center py-4">
                <Text className="text-4xl mb-3">🛑</Text>
                <Text className="text-lg font-bold text-themeText mb-2" style={{ color: '#f0ede6' }}>Card Programming Failed</Text>
                <Text className="text-[11px] text-center leading-4 max-w-[85%] mb-6" style={{ color: '#9ca3af' }}>
                  Failed to program card. Make sure the card is placed correctly on the reader.
                </Text>
                <View className="flex-row gap-3 w-full">
                  <TouchableOpacity className="flex-1 py-3.5 rounded-xl border border-borderDark items-center justify-center min-h-[48px]" onPress={() => setNfcWriteState('idle')}>
                    <Text className="font-bold text-sm" style={{ color: '#9ca3af' }}>Retry Scan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-1 bg-gold py-3.5 rounded-xl items-center justify-center min-h-[48px]" onPress={resetWizard}>
                    <Text className="font-bold text-sm" style={{ color: '#08090d' }}>Reset Form</Text>
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
            backgroundColor: '#11131c',
            borderWidth: 1,
            borderColor: 'rgba(245, 166, 35, 0.2)',
            borderRadius: 20,
            padding: 22,
            alignItems: 'center',
            shadowColor: '#f5a623',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 8
          }}>
            <View style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: 'rgba(245, 166, 35, 0.1)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              borderWidth: 1,
              borderColor: 'rgba(245, 166, 35, 0.3)'
            }}>
              <Text style={{ fontSize: 22 }}>⚠️</Text>
            </View>

            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#f5a623', marginBottom: 10, textAlign: 'center', letterSpacing: 0.5 }}>
              Change Guest Count?
            </Text>

            <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 18, marginBottom: 24 }}>
              If you increase the number of persons, you can't match the selected table. You can select the number of persons based on the table availability.
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#1a1d26',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onPress={() => setShowCapacityAlert(false)}
              >
                <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: 'bold' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#f5a623',
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
                <Text style={{ color: '#08090d', fontSize: 13, fontWeight: '900' }}>Increase</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

