// Updated for production readiness
import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, 
  ActivityIndicator, StyleSheet, Modal
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNfcBar } from '../../../context/NfcBarContext';
import { useTheme } from '../../../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SessionToken, TokenStatus } from '../../../types/nfc_bar';
import { AppIcon } from '../../../components/common/AppIcon';
import nfcService from '../../../services/nfc/nfcManager';

const formatRedemptionTime = (timestampStr: string) => {
  const date = new Date(timestampStr);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');
  const strMinutes = String(minutes).padStart(2, '0');
  const strSeconds = String(seconds).padStart(2, '0');
  return `${strHours}:${strMinutes}:${strSeconds} ${ampm}`;
};

export const BartenderPortal: React.FC = () => {
  const { sessions, redeemDrinkForCard, undoDrinkRedemption, tokenType, nfcEnabled, emailQrEnabled, fetchLatestState, showToast } = useNfcBar();
  const { colors, isDark } = useTheme();
  const [bartenderState, setBartenderState] = useState<'idle' | 'scanning' | 'scanned' | 'depleted' | 'error'>('idle');
  const [scannedCardUid, setScannedCardUid] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [enteredToken, setEnteredToken] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  // Session Close Workflows
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [tokenToClose, setTokenToClose] = useState<string | null>(null);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [scanningForClose, setScanningForClose] = useState(false);

  const handleConfirmCloseSession = (tokenNum: string) => {
    setTokenToClose(tokenNum);
    setShowCloseConfirm(true);
  };

  const executeCloseSession = async () => {
    if (!tokenToClose) return;
    setIsClosingSession(true);
    try {
      const activeToken = await AsyncStorage.getItem('nfc_bar_user_token');
      const res = await fetch(`${BACKEND_URL}/sessions/${tokenToClose}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ eraseCard: true })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Section successfully closed', 'success');
        setShowCloseConfirm(false);
        setTokenToClose(null);
        setBartenderState('idle');
        setActiveSession(null);
        await fetchLatestState();
      } else {
        showToast(data.error || 'Failed to close section', 'danger');
      }
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'danger');
    } finally {
      setIsClosingSession(false);
    }
  };

  const handleQrScanForClose = () => {
    setScanningForClose(true);
  };

  const handleQrCodeScannedForClose = async (qrData: string) => {
    if (!qrData) return;
    setScanningForClose(false);
    setIsClosingSession(true);
    try {
      const activeToken = await AsyncStorage.getItem('nfc_bar_user_token');
      const res = await fetch(`${BACKEND_URL}/sessions/close-by-qr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ qrData, eraseCard: true })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Section successfully closed via QR scan', 'success');
        setBartenderState('idle');
        setActiveSession(null);
        await fetchLatestState();
      } else {
        showToast(data.error || 'Failed to close section via QR', 'danger');
      }
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'danger');
    } finally {
      setIsClosingSession(false);
    }
  };

  const handleQrScan = async () => {
    setErrorMessage('');
    setScannedCardUid(null);
    setActiveSession(null);

    if (permission && !permission.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setErrorMessage('Camera permission is required to scan QR codes.');
        setBartenderState('error');
        return;
      }
    }
    setBartenderState('scanning');
  };
  
  // Scanned Session cache
  const [activeSession, setActiveSession] = useState<SessionToken | null>(null);
  const [redemptionsHistory, setRedemptionsHistory] = useState<any[]>([]);
  const [timeTick, setTimeTick] = useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setTimeTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getBackendUrl = () => {
    const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (envApiUrl && envApiUrl.trim().length > 0) {
      return envApiUrl.trim();
    }
    return 'https://nfc-qr-code-production.up.railway.app/api';
  };
  const BACKEND_URL = getBackendUrl();

  const fetchRedemptionsHistory = async (tokenNum: string) => {
    try {
      const token = await AsyncStorage.getItem('nfc_bar_user_token');
      if (!token) return;
      const res = await fetch(`${BACKEND_URL}/tokens/${tokenNum}/redemptions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRedemptionsHistory(data);
      }
    } catch (err) {
      console.warn('Failed to fetch redemption history:', err);
    }
  };

  const handleTokenLookup = (tokenNum: string) => {
    const cleanToken = tokenNum.trim().toUpperCase();
    if (!cleanToken) return;

    setScannedCardUid(cleanToken);
    setErrorMessage('');
    
    const found = sessions.find(s => s.tokenNumber === cleanToken && s.status === TokenStatus.ACTIVE && s.paymentVerified === true);
    if (!found) {
      setBartenderState('error');
      setErrorMessage('Unknown card or token session closed.');
      return;
    }

    // Check expiration
    const now = new Date();
    if (now > new Date(found.endTime)) {
      setActiveSession(found);
      setBartenderState('error');
      setErrorMessage('Expired session! Entitlements locked.');
      return;
    }

    // Check drinks depletion
    if (found.redemptionCount >= found.redemptionLimit) {
      setActiveSession(found);
      setBartenderState('depleted');
      return;
    }

    setActiveSession(found);
    setBartenderState('scanned');
    fetchRedemptionsHistory(found.tokenNumber);
  };

  const handlePhysicalScan = async () => {
    setBartenderState('scanning');
    setErrorMessage('');
    setScannedCardUid(null);
    setActiveSession(null);

    try {
      await nfcService.initialize();
      const details = await nfcService.readCardDetails();
      if (!details || !details.nfcUid) {
        throw new Error('Failed to read card information.');
      }

      const cardUid = details.nfcUid;
      const tokenNumber = details.tokenNumber;
      setScannedCardUid(cardUid);

      // Find active session either by cardUid or by tokenNumber
      const found = sessions.find(s => 
        ((cardUid && s.cardUid === cardUid && s.status === TokenStatus.ACTIVE) || 
         (tokenNumber && s.tokenNumber === tokenNumber && s.status === TokenStatus.ACTIVE)) &&
        s.paymentVerified === true
      );

      if (!found) {
        setBartenderState('error');
        setErrorMessage('Unknown card or token session closed.');
        return;
      }
      
      // Check expiration
      const now = new Date();
      if (now > new Date(found.endTime)) {
        setActiveSession(found);
        setBartenderState('error');
        setErrorMessage('Expired session! Entitlements locked.');
        return;
      }

      // Check drinks depletion
      if (found.redemptionCount >= found.redemptionLimit) {
        setActiveSession(found);
        setBartenderState('depleted');
        return;
      }

      setActiveSession(found);
      setBartenderState('scanned');
      fetchRedemptionsHistory(found.tokenNumber);
    } catch (error: any) {
      console.error('Bartender NFC Scan error:', error);
      setBartenderState('error');
      setErrorMessage(error.message || 'NFC Scan failed.');
    }
  };

  const handleSimulateScan = (cardId: string) => {
    setBartenderState('scanning');
    setScannedCardUid(cardId);
    setErrorMessage('');
    
    setTimeout(() => {
      // Find active session
      const found = sessions.find(s => s.cardUid === cardId && s.status === TokenStatus.ACTIVE && s.paymentVerified === true);
      if (!found) {
        setBartenderState('error');
        setErrorMessage('Unknown card or token session closed.');
        return;
      }
      
      // Check expiration
      const now = new Date();
      if (now > new Date(found.endTime)) {
        setActiveSession(found);
        setBartenderState('error');
        setErrorMessage('Expired session! Entitlements locked.');
        return;
      }

      // Check drinks depletion
      if (found.redemptionCount >= found.redemptionLimit) {
        setActiveSession(found);
        setBartenderState('depleted');
        return;
      }

      setActiveSession(found);
      setBartenderState('scanned');
    }, 1600); // 1.6s scan animation
  };

  const handleServeDrink = () => {
    if (!scannedCardUid || !activeSession) return;
    
    const res = redeemDrinkForCard(scannedCardUid);
    if (res.success) {
      // Refresh current details locally
      setActiveSession(prev => prev ? {
        ...prev,
        redemptionCount: prev.redemptionCount + 1
      } : null);
      fetchRedemptionsHistory(activeSession.tokenNumber);

      // Transition to depleted if limit is hit
      if (activeSession.redemptionCount + 1 >= activeSession.redemptionLimit) {
        setBartenderState('depleted');
      }
    } else {
      setBartenderState('error');
      setErrorMessage(res.error || 'Redemption blocked');
    }
  };

  const handleUndoServe = () => {
    if (!scannedCardUid || !activeSession) return;
    
    const res = undoDrinkRedemption(scannedCardUid);
    if (res.success) {
      // Refresh current details locally
      setActiveSession(prev => prev ? {
        ...prev,
        redemptionCount: Math.max(0, prev.redemptionCount - 1)
      } : null);

      // Transition back to scanned state (since we are not depleted anymore)
      setBartenderState('scanned');
    } else {
      setBartenderState('error');
      setErrorMessage(res.error || 'Undo blocked');
    }
  };

  // Render drinks balance dots/slots using visual card vectors in a 4-column grid
  const renderDrinkSlots = () => {
    if (!activeSession) return null;
    const limit = activeSession.redemptionLimit;
    const used = activeSession.redemptionCount;
    const slots = [];
    
    for (let i = 1; i <= limit; i++) {
      const isRedeemed = i <= used;
      slots.push(
        <View 
          style={{ 
            height: 44,
            borderColor: isRedeemed ? colors.border : colors.gold, 
            backgroundColor: isRedeemed ? 'transparent' : (isDark ? 'rgba(245, 166, 35, 0.1)' : 'rgba(212, 175, 55, 0.1)')
          }}
          className="rounded-xl items-center justify-center border"
        >
          {isRedeemed ? (
            <Text className="text-xs font-bold" style={{ color: colors.muted }}>✓</Text>
          ) : (
            <Text className="text-gold text-sm font-bold">🍹</Text>
          )}
        </View>
      );
    }
    
    return (
      <View className="flex-row flex-wrap mt-3" style={{ marginHorizontal: -6 }}>
        {slots.map((slot, index) => (
          <View key={index} style={{ width: '25%', padding: 6 }}>
            {slot}
          </View>
        ))}
      </View>
    );
  };

  const calculateTimeRemaining = (endTimeStr: string) => {
    const diff = new Date(endTimeStr).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const totalSecs = Math.floor(diff / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  };

  return (
    <View className="flex-1 p-4 justify-between" style={{ backgroundColor: colors.bg }}>
      
      {/* Top Title Section */}
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-xl font-bold" style={{ color: colors.text }}>Drink Redemption</Text>
        <View 
          className="px-2 py-0.5 rounded border"
          style={{ 
            backgroundColor: isDark ? 'rgba(78,205,196,0.15)' : 'rgba(29,78,216,0.05)', 
            borderColor: isDark ? 'rgba(78,205,196,0.2)' : 'rgba(29,78,216,0.1)' 
          }}
        >
          <Text className="font-extrabold text-[9px] tracking-wider" style={{ color: colors.teal }}>
            {emailQrEnabled && !nfcEnabled ? 'EMAIL QR PORTAL' : (nfcEnabled && !emailQrEnabled ? 'NFC PORTAL' : 'HYBRID PORTAL')}
          </Text>
        </View>
      </View>

      {/* IDLE SCAN TARGET: Massive lower third CTA */}
      {bartenderState === 'idle' && (
        <View className="flex-1 justify-start">
          {!nfcEnabled ? (
            <View className="flex-1 flex-col">
              {/* Email / Token manual input block */}
              <View 
                className="rounded-[20px] p-5 shadow-xl mb-4 border"
                style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
              >
                <Text className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: colors.gold }}>Lookup Guest Session</Text>
                <View className="flex-row gap-2 items-center">
                  <TextInput
                    className="flex-1 border rounded-xl px-4 py-3 text-sm font-semibold min-h-[48px]"
                    style={{ backgroundColor: colors.input, borderColor: colors.inputBorder, borderWidth: 1, color: colors.text }}
                    placeholder="Enter Token (e.g. BAR-2026...)"
                    placeholderTextColor={colors.placeholder}
                    value={enteredToken}
                    onChangeText={setEnteredToken}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <TouchableOpacity 
                    className="bg-gold px-5 py-3 rounded-xl min-h-[48px] justify-center items-center border"
                    style={{ borderColor: colors.gold }}
                    onPress={() => handleTokenLookup(enteredToken)}
                  >
                    <Text className="font-extrabold text-xs" style={{ color: colors.goldButtonText }}>VALIDATE</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Active sessions list helper */}
              <Text className="text-[10px] font-bold uppercase tracking-wider mb-2.5 px-1" style={{ color: colors.muted }}>Active Checked-in Guests:</Text>
              <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                {sessions.filter(s => s.status === TokenStatus.ACTIVE && s.paymentVerified === true).length === 0 ? (
                  <View className="py-8 items-center">
                    <Text style={{ color: colors.muted, fontSize: 12 }}>No active guest sessions found.</Text>
                  </View>
                ) : (
                  sessions.filter(s => s.status === TokenStatus.ACTIVE && s.paymentVerified === true).map(s => {
                    const isExpired = calculateTimeRemaining(s.endTime) === 'Expired';
                    return (
                      <TouchableOpacity
                        key={s.id}
                        className="rounded-xl p-4 mb-2 flex-row justify-between items-center border"
                        style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
                        onPress={() => {
                          setEnteredToken(s.tokenNumber);
                          handleTokenLookup(s.tokenNumber);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text className="text-xs font-bold" style={{ color: colors.text }}>{s.customerName}</Text>
                          <Text className="text-[10px] font-mono mt-0.5" style={{ color: colors.muted }}>{s.tokenNumber}</Text>
                        </View>
                        <View className="items-center px-2">
                          <Text className="text-[10px] font-bold" style={{ color: isExpired ? '#ff6b6b' : colors.gold }}>
                            ⏰ {calculateTimeRemaining(s.endTime)}
                          </Text>
                        </View>
                        <View className="items-end" style={{ minWidth: 70 }}>
                          <Text className="text-[10px] font-extrabold uppercase" style={{ color: colors.gold }}>Table {s.tableNumber}</Text>
                          <Text className="text-[9px] mt-0.5" style={{ color: colors.muted }}>Drinks: {s.redemptionCount}/{s.redemptionLimit}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          ) : !emailQrEnabled ? (
            <View className="flex-1 justify-between flex-col py-6">
              <View className="flex-1 items-center justify-center">
                {/* Visual Icon Illustration */}
                <View 
                  className="w-24 h-24 rounded-full border items-center justify-center mb-4"
                  style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
                >
                  <Text className="text-4xl">🍹</Text>
                </View>
                <Text className="text-base font-extrabold" style={{ color: colors.text }}>Redemption Scan Target</Text>
                <Text className="text-[11px] text-center max-w-[70%] mt-1.5 leading-4" style={{ color: colors.muted }}>
                  Align physical card with sensor scanner to check drink token balance.
                </Text>
              </View>
              
              {/* Lower Third scan CTA and quick simulators */}
              <View className="flex-col gap-4">
                <TouchableOpacity 
                  className="w-full bg-gold rounded-[20px] py-5 items-center justify-center shadow-xl border"
                  style={{ borderColor: colors.gold }}
                  onPress={handlePhysicalScan}
                  activeOpacity={0.85}
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xl">🛜</Text>
                    <Text className="font-black text-base tracking-widest uppercase" style={{ color: colors.goldButtonText }}>START NFC SCAN</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* Lookup Guest Session */}
              <View 
                className="rounded-[20px] p-5 shadow-xl mb-4 border"
                style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
              >
                <Text className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: colors.gold }}>Lookup Guest Session</Text>
                <View className="flex-row gap-2 items-center">
                  <TextInput
                    className="flex-1 border rounded-xl px-4 py-3 text-sm font-semibold min-h-[48px]"
                    style={{ backgroundColor: colors.input, borderColor: colors.inputBorder, borderWidth: 1, color: colors.text }}
                    placeholder="Enter Token (e.g. BAR-2026...)"
                    placeholderTextColor={colors.placeholder}
                    value={enteredToken}
                    onChangeText={setEnteredToken}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <TouchableOpacity 
                    className="bg-gold px-5 py-3 rounded-xl min-h-[48px] justify-center items-center border"
                    style={{ borderColor: colors.gold }}
                    onPress={() => handleTokenLookup(enteredToken)}
                  >
                    <Text className="font-extrabold text-xs" style={{ color: colors.goldButtonText }}>VALIDATE</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Start QR Scan Target */}
              <TouchableOpacity 
                className="w-full bg-gold rounded-[20px] py-4 items-center justify-center shadow-xl border mb-3"
                style={{ borderColor: colors.gold }}
                onPress={handleQrScan}
                activeOpacity={0.85}
              >
                <View className="flex-row items-center gap-2">
                  <Text style={{ fontSize: 16 }}>📷</Text>
                  <Text className="font-black text-sm tracking-widest uppercase" style={{ color: colors.goldButtonText }}>START QR SCAN</Text>
                </View>
              </TouchableOpacity>

              {/* Start NFC Scan Target */}
              <TouchableOpacity 
                className="w-full bg-gold rounded-[20px] py-4 items-center justify-center shadow-xl border mb-4"
                style={{ borderColor: colors.gold }}
                onPress={handlePhysicalScan}
                activeOpacity={0.85}
              >
                <View className="flex-row items-center gap-2">
                  <Text style={{ fontSize: 16 }}>🛜</Text>
                  <Text className="font-black text-sm tracking-widest uppercase" style={{ color: colors.goldButtonText }}>START NFC SCAN</Text>
                </View>
              </TouchableOpacity>

              {/* Active Checked-in Guests */}
              <Text className="text-[10px] font-bold uppercase tracking-wider mb-2.5 px-1" style={{ color: colors.muted }}>Active Checked-in Guests:</Text>
              {sessions.filter(s => s.status === TokenStatus.ACTIVE && s.paymentVerified === true).length === 0 ? (
                <View 
                  className="py-6 items-center border rounded-xl"
                  style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}
                >
                  <Text style={{ color: colors.muted, fontSize: 12 }}>No active guest sessions found.</Text>
                </View>
              ) : (
                sessions.filter(s => s.status === TokenStatus.ACTIVE && s.paymentVerified === true).map(s => {
                  const isExpired = calculateTimeRemaining(s.endTime) === 'Expired';
                  return (
                    <TouchableOpacity
                      key={s.id}
                      className="rounded-xl p-3.5 mb-2 flex-row justify-between items-center border"
                      style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
                      onPress={() => {
                        setEnteredToken(s.tokenNumber);
                        handleTokenLookup(s.tokenNumber);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text className="text-xs font-bold" style={{ color: colors.text }}>{s.customerName}</Text>
                        <Text className="text-[9px] font-mono mt-0.5" style={{ color: colors.muted }}>{s.tokenNumber}</Text>
                      </View>
                      <View className="items-center px-2">
                        <Text className="text-[9px] font-bold" style={{ color: isExpired ? '#ff6b6b' : colors.gold }}>
                          ⏰ {calculateTimeRemaining(s.endTime)}
                        </Text>
                      </View>
                      <View className="items-end" style={{ minWidth: 65 }}>
                        <Text className="text-[10px] font-extrabold uppercase" style={{ color: colors.gold }}>Table {s.tableNumber}</Text>
                        <Text className="text-[9px] mt-0.5" style={{ color: colors.muted }}>Drinks: {s.redemptionCount}/{s.redemptionLimit}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>
      )}

      {/* SCANNING ACTIVE STATE */}
      {bartenderState === 'scanning' && (
        <Modal
          visible={bartenderState === 'scanning'}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setBartenderState('idle')}
        >
          <View style={{ flex: 1, backgroundColor: '#000000', position: 'relative' }}>
            {emailQrEnabled && permission && permission.granted ? (
              <CameraView
                key={bartenderState === 'scanning' ? "bartender-active-camera" : "bartender-inactive-camera"}
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
                onBarcodeScanned={({ data }) => {
                  if (data && data !== scannedCardUid) {
                    setScannedCardUid(data);
                    handleTokenLookup(data);
                  }
                }}
              />
            ) : (
              <View 
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: '#000000'
                }}
              >
                <ActivityIndicator size="large" color={colors.teal} />
                <Text className="text-sm font-bold mt-4 uppercase tracking-wider" style={{ color: '#ffffff' }}>Scanning Smart Tag...</Text>
                <Text style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 11, marginTop: 4 }}>Interfacing credentials via NFC link</Text>
              </View>
            )}

            {/* Transparent Overlay Container to Align Controls over the CameraView layer */}
            {emailQrEnabled && permission && permission.granted && (
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
                
                {/* Cancel button placed identically to Check-in/Bartender's */}
                <TouchableOpacity 
                  className="absolute bottom-6 bg-red px-6 py-3 rounded-xl border border-red"
                  style={{ zIndex: 12 }}
                  onPress={() => setBartenderState('idle')}
                >
                  <Text className="text-white font-bold text-xs uppercase tracking-wider">Cancel Scan</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Modal>
      )}

      {/* SCANNED ACTIVE SESSION CARD */}
      {bartenderState === 'scanned' && activeSession && (
        <ScrollView className="flex-1 mt-2" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <View 
            className="border rounded-xl p-3 mb-4 flex-row items-center justify-between"
            style={{ 
              backgroundColor: isDark ? 'rgba(78,205,196,0.1)' : 'rgba(29, 78, 216, 0.05)',
              borderColor: isDark ? 'rgba(78,205,196,0.2)' : 'rgba(29, 78, 216, 0.1)'
            }}
          >
            <Text className="text-xs font-bold" style={{ color: colors.teal }}>✓ Active Session: {activeSession.tokenNumber}</Text>
            <View className="px-2 py-0.5 rounded" style={{ backgroundColor: isDark ? 'rgba(78,205,196,0.2)' : 'rgba(29, 78, 216, 0.1)' }}>
              <Text className="font-extrabold text-[8px]" style={{ color: colors.teal }}>{activeSession.placeType.replace('_', ' ')}</Text>
            </View>
          </View>

          {/* Customer info card */}
          <View 
            className="rounded-[20px] p-5 shadow-xl border"
            style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
          >
            <View className="flex-row items-center mb-4">
              <View 
                className="w-12 h-12 rounded-full border items-center justify-center mr-4"
                style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}
              >
                <Text className="text-xl">👤</Text>
              </View>
              <View className="flex-1">
                <Text className="font-bold text-base" style={{ color: colors.text }}>{activeSession.customerName}</Text>
                <Text className="font-mono text-[10px] font-bold mt-0.5" style={{ color: colors.gold }}>Table assigned: {activeSession.tableNumber}</Text>
              </View>
            </View>

            <View 
              className="flex-row justify-between rounded-xl p-3 mb-5 border"
              style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}
            >
              <View className="flex-1 items-center border-r" style={{ borderRightColor: colors.border }}>
                <Text className="text-[9px] uppercase tracking-wider mb-1" style={{ color: colors.muted }}>Guests Size</Text>
                <Text className="font-bold text-xs" style={{ color: colors.text }}>{activeSession.persons} Pax</Text>
              </View>
              <View className="flex-grow flex-1 items-center">
                <Text className="text-[9px] uppercase tracking-wider mb-1" style={{ color: colors.muted }}>Time Remaining</Text>
                <Text className="font-bold text-xs" style={{ color: colors.text }}>{calculateTimeRemaining(activeSession.endTime)}</Text>
              </View>
            </View>

            {/* Drink Coupon Counter Meter */}
            <Text className="text-[11px] font-bold uppercase tracking-wider mb-2 text-center" style={{ color: colors.muted }}>Remaining Beverage Balance</Text>
            <View 
              className="rounded-xl p-4 mb-4 border"
              style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}
            >
              <Text className="text-xs text-center mb-3" style={{ color: colors.muted }}>
                Redeemed <Text className="font-bold" style={{ color: colors.gold }}>{activeSession.redemptionCount}</Text> of {activeSession.redemptionLimit} coupons
              </Text>
              
              {/* Visual Drink grid boxes */}
              {renderDrinkSlots()}
            </View>

            {redemptionsHistory && redemptionsHistory.length > 0 && (
              <View className="mb-4">
                <Text className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: colors.muted }}>Redemption Log (with seconds)</Text>
                <View className="rounded-xl p-3 border" style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}>
                  {redemptionsHistory.map((item, index) => (
                    <View key={item.id || index} className="flex-row justify-between py-1 border-b" style={{ borderBottomColor: colors.border }}>
                      <Text className="text-[10px]" style={{ color: colors.text }}>Drink #{index + 1}</Text>
                      <Text className="text-[10px] font-mono font-bold" style={{ color: colors.gold }}>
                        {formatRedemptionTime(item.timestamp)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Safety Countermeasure: Undo Last Action Banner Button */}
            {activeSession.redemptionCount > 0 && (
              <TouchableOpacity 
                className="bg-red/10 border border-red/20 py-3.5 rounded-xl items-center justify-center mb-4 min-h-[44px]" 
                onPress={handleUndoServe}
                activeOpacity={0.8}
              >
                <Text className="text-red font-extrabold text-xs">↩ Undo Last Drink Redemption</Text>
              </TouchableOpacity>
            )}

            {/* Session Controls */}
            <Text className="text-[10px] font-bold uppercase tracking-wider mt-4 mb-2" style={{ color: colors.muted }}>Session Controls</Text>
            <View className="flex-row gap-3 mb-4">
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl border items-center justify-center min-h-[44px] bg-red/10" 
                style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}
                onPress={() => handleConfirmCloseSession(activeSession.tokenNumber)}
              >
                <Text className="font-bold text-xs text-red">Close Section</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl border items-center justify-center min-h-[44px]" 
                style={{ backgroundColor: colors.secondaryButtonBg, borderColor: colors.border }}
                onPress={handleQrScanForClose}
              >
                <Text className="font-bold text-xs" style={{ color: colors.text }}>Scan QR</Text>
              </TouchableOpacity>
            </View>

            {/* Serve / Next Buttons */}
            <View className="flex-row gap-3 mt-2">
              <TouchableOpacity 
                className="flex-1 py-3.5 rounded-xl border items-center justify-center min-h-[48px]" 
                style={{ backgroundColor: colors.secondaryButtonBg, borderColor: colors.border }}
                onPress={() => setBartenderState('idle')}
              >
                <Text className="font-bold text-sm" style={{ color: colors.secondaryButtonText }}>Next Card</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-[2] bg-teal py-3.5 rounded-xl items-center justify-center min-h-[48px] border" 
                style={{ borderColor: colors.teal }}
                onPress={handleServeDrink}
              >
                <Text className="font-black text-sm" style={{ color: isDark ? colors.goldButtonText : '#FFFFFF' }}>Serve Drink</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {/* DRINK COUPONS DEPLETED WARNING STATE */}
      {bartenderState === 'depleted' && activeSession && (
        <ScrollView className="flex-1 mt-2" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <View className="bg-red/10 border border-red/20 rounded-xl p-3 mb-4">
            <Text className="text-red text-xs font-bold">🛑 Drink limit fully reached!</Text>
          </View>

          <View 
            className="rounded-[20px] p-5 shadow-xl border"
            style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
          >
            <Text className="font-bold text-base text-center mb-1" style={{ color: colors.text }}>{activeSession.customerName}</Text>
            <Text className="text-[11px] text-center mb-4" style={{ color: colors.muted }}>Table {activeSession.tableNumber} • {activeSession.placeType.replace('_',' ')}</Text>
            
            <View 
              className="rounded-xl p-4 mb-5 border"
              style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}
            >
              <Text className="text-xs leading-5 text-center" style={{ color: colors.muted }}>
                This smart card has 0 available drink tokens. Customer has already redeemed all {activeSession.redemptionLimit} cover coupon(s). Request receptionist to add extensions.
              </Text>
            </View>

            {/* Undo last serve safety trigger */}
            {activeSession.redemptionCount > 0 && (
              <TouchableOpacity 
                className="bg-red/10 border border-red/20 py-3.5 rounded-xl items-center justify-center mb-4 min-h-[44px]" 
                onPress={handleUndoServe}
                activeOpacity={0.8}
              >
                <Text className="text-red font-extrabold text-xs">↩ Undo Last Drink Redemption</Text>
              </TouchableOpacity>
            )}

            {/* Session Controls */}
            <Text className="text-[10px] font-bold uppercase tracking-wider mt-4 mb-2" style={{ color: colors.muted }}>Session Controls</Text>
            <View className="flex-row gap-3 mb-4">
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl border items-center justify-center min-h-[44px] bg-red/10" 
                style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}
                onPress={() => handleConfirmCloseSession(activeSession.tokenNumber)}
              >
                <Text className="font-bold text-xs text-red">Close Section</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl border items-center justify-center min-h-[44px]" 
                style={{ backgroundColor: colors.secondaryButtonBg, borderColor: colors.border }}
                onPress={handleQrScanForClose}
              >
                <Text className="font-bold text-xs" style={{ color: colors.text }}>Scan QR</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              className="bg-gold py-3.5 rounded-xl w-full items-center justify-center min-h-[48px] border" 
              style={{ borderColor: colors.gold }}
              onPress={() => setBartenderState('idle')}
            >
              <Text className="font-bold text-sm" style={{ color: colors.goldButtonText }}>Tap Next Card</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ERROR SCAN STATE */}
      {bartenderState === 'error' && (
        <View className="flex-1 justify-center">
          <View 
            className="rounded-[20px] p-5 items-center py-8 shadow-xl border"
            style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
          >
            <Text className="text-5xl mb-3">🛑</Text>
            <Text className="text-lg font-bold mb-2" style={{ color: colors.text }}>Scan Error</Text>
            <Text className="text-xs text-center leading-5 max-w-[80%] mb-6" style={{ color: colors.muted }}>{errorMessage}</Text>
            
            <TouchableOpacity 
              className="bg-gold py-3.5 rounded-xl w-full items-center justify-center min-h-[48px] border" 
              style={{ borderColor: colors.gold }}
              onPress={() => setBartenderState('idle')}
            >
              <Text className="font-bold text-sm" style={{ color: colors.goldButtonText }}>Tap Next Card</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Confirmation Modal */}
      {showCloseConfirm && (
        <View style={StyleSheet.absoluteFill} className="bg-black/60 items-center justify-center z-50 p-6">
          <View className="rounded-[20px] p-6 w-full max-w-[340px] border shadow-2xl" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
            <Text className="font-extrabold text-base mb-2" style={{ color: colors.text }}>Close Section</Text>
            <Text className="text-xs leading-5 mb-6" style={{ color: colors.muted }}>
              Are you sure you want to close this section? This will end the customer's active session and temporarily place the section under maintenance.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl border items-center justify-center min-h-[44px]" 
                style={{ backgroundColor: colors.secondaryButtonBg, borderColor: colors.border }}
                onPress={() => {
                  setShowCloseConfirm(false);
                  setTokenToClose(null);
                }}
                disabled={isClosingSession}
              >
                <Text className="font-bold text-xs" style={{ color: colors.secondaryButtonText }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 bg-red py-3 rounded-xl items-center justify-center min-h-[44px] border" 
                style={{ borderColor: '#ef4444' }}
                onPress={executeCloseSession}
                disabled={isClosingSession}
              >
                {isClosingSession ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="font-bold text-xs text-white">Yes, Close Section</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* QR Scan Overlay for Close */}
      {scanningForClose && (
        <View style={StyleSheet.absoluteFill} className="bg-black z-50 items-center justify-center">
          {permission && permission.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              onBarcodeScanned={({ data }) => {
                if (data) {
                  handleQrCodeScannedForClose(data);
                }
              }}
            />
          ) : (
            <ActivityIndicator size="large" color={colors.teal} />
          )}
          <TouchableOpacity 
            className="absolute bottom-10 bg-red px-6 py-3 rounded-xl border border-red"
            onPress={() => setScanningForClose(false)}
          >
            <Text className="text-white font-extrabold text-xs uppercase tracking-wider">Cancel QR Scan</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

