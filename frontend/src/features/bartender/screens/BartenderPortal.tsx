// Updated for production readiness
import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, 
  ActivityIndicator, StyleSheet, Modal, Platform, Animated
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNfcBar, getFriendlyErrorMessage, getBackendUrl } from '../../../context/NfcBarContext';
import { useTheme } from '../../../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SessionToken, TokenStatus } from '../../../types/nfc_bar';
import { AppIcon } from '../../../components/common/AppIcon';
import nfcService from '../../../services/nfc/nfcManager';
import { useActionProgress } from '../../../utils/actionProgress';

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

export const BartenderPortal: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
  const { sessions, redeemDrinkForCard, undoDrinkRedemption, tokenType, nfcEnabled, emailQrEnabled, fetchLatestState, showToast, setOverlayActive } = useNfcBar();
  const { loadingAction, secondsLeft, startAction, stopAction, isProcessing } = useActionProgress();
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
    if (!startAction('close_session')) return;
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
      stopAction();
      if (res.ok) {
        showToast('Session closed successfully.', 'success');
        setShowCloseConfirm(false);
        setTokenToClose(null);
        setBartenderState('idle');
        setActiveSession(null);
        await fetchLatestState();
      } else {
        showToast(getFriendlyErrorMessage(data, 'Unable to close the session. Please try again.'), 'danger');
      }
    } catch (err: any) {
      stopAction();
      showToast('Unable to close the session. Please check your network connection.', 'danger');
    } finally {
      setIsClosingSession(false);
    }
  };

  const handleQrScanForClose = () => {
    setScanningForClose(true);
  };

  const handleQrCodeScannedForClose = async (qrData: string) => {
    if (!qrData) return;
    if (!startAction('close_session_qr')) return;
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
      stopAction();
      if (res.ok) {
        showToast('Session closed successfully.', 'success');
        setBartenderState('idle');
        setActiveSession(null);
        await fetchLatestState();
      } else {
        showToast(getFriendlyErrorMessage(data, 'Unable to close the session. Please try again.'), 'danger');
      }
    } catch (err: any) {
      stopAction();
      showToast('Unable to close the session. Please check your network connection.', 'danger');
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

  // Interactive drink animations and queue management
  const opQueueRef = React.useRef<{ type: 'SERVE' | 'UNDO'; index: number }[]>([]);
  const isProcessingQueueRef = React.useRef(false);
  const animatedValuesRef = React.useRef<{ [key: number]: Animated.Value }>({});
  
  const [servingIndices, setServingIndices] = useState<number[]>([]);
  const [undoingIndices, setUndoingIndices] = useState<number[]>([]);
  const [queuedIndices, setQueuedIndices] = useState<{ [key: number]: 'SERVE' | 'UNDO' }>({});

  const getAnimValue = (slotIndex: number, initiallyServed: boolean) => {
    if (!animatedValuesRef.current[slotIndex]) {
      animatedValuesRef.current[slotIndex] = new Animated.Value(initiallyServed ? 1 : 0);
    }
    return animatedValuesRef.current[slotIndex];
  };

  const updateQueuedState = () => {
    const queued: { [key: number]: 'SERVE' | 'UNDO' } = {};
    opQueueRef.current.forEach((op, index) => {
      if (index > 0) {
        queued[op.index] = op.type;
      }
    });
    setQueuedIndices(queued);
  };

  // Reset animations and queue on active session change
  React.useEffect(() => {
    opQueueRef.current = [];
    isProcessingQueueRef.current = false;
    animatedValuesRef.current = {};
    setServingIndices([]);
    setUndoingIndices([]);
    setQueuedIndices({});
  }, [activeSession?.tokenNumber]);

  // Keep animations in sync with state updates
  React.useEffect(() => {
    if (activeSession) {
      const used = activeSession.redemptionCount;
      const limit = activeSession.redemptionLimit;
      for (let i = 1; i <= limit; i++) {
        const isRedeemed = i <= used;
        const anim = animatedValuesRef.current[i];
        if (anim && !servingIndices.includes(i) && !undoingIndices.includes(i)) {
          anim.setValue(isRedeemed ? 1 : 0);
        }
      }
    }
  }, [activeSession?.redemptionCount, servingIndices, undoingIndices]);

  React.useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      setTimeTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  React.useEffect(() => {
    setOverlayActive(isActive && isProcessing);
    return () => setOverlayActive(false);
  }, [isActive, isProcessing, setOverlayActive]);

  // Sync activeSession details whenever global sessions array refreshes (e.g. from background polling sync)
  React.useEffect(() => {
    if (activeSession) {
      const updated = sessions.find(s => s.tokenNumber === activeSession.tokenNumber);
      if (updated) {
        setActiveSession(updated);
      } else {
        // If session was closed, cancelled or checked out, dismiss the detail view
        setActiveSession(null);
        setBartenderState('scanning');
      }
    }
  }, [sessions]);

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
    setScannedCardUid(cardId);
    setErrorMessage('');
    
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
  };

  const processQueue = async () => {
    if (isProcessingQueueRef.current || opQueueRef.current.length === 0) return;
    isProcessingQueueRef.current = true;

    const op = opQueueRef.current[0];
    
    if (op.type === 'SERVE') {
      const targetIndex = op.index;
      setServingIndices(prev => [...prev, targetIndex]);
      updateQueuedState();

      const anim = getAnimValue(targetIndex, false);
      Animated.timing(anim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: false,
      }).start(async (result) => {
        if (!result.finished) {
          setServingIndices(prev => prev.filter(i => i !== targetIndex));
          opQueueRef.current.shift();
          updateQueuedState();
          isProcessingQueueRef.current = false;
          processQueue();
          return;
        }

        try {
          const res = await redeemDrinkForCard(scannedCardUid!);
          if (res.success) {
            setActiveSession(prev => {
              if (!prev) return null;
              const nextCount = prev.redemptionCount + 1;
              if (nextCount >= prev.redemptionLimit) {
                setBartenderState('depleted');
              } else {
                setBartenderState('scanned');
              }
              return { ...prev, redemptionCount: nextCount };
            });
            fetchRedemptionsHistory(activeSession!.tokenNumber);
            showToast(`Drink #${targetIndex} redeemed successfully!`, 'success');
          } else {
            Animated.timing(anim, {
              toValue: 0,
              duration: 500,
              useNativeDriver: false,
            }).start();
            showToast(res.error || 'Redemption blocked', 'danger');
          }
        } catch (err) {
          Animated.timing(anim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: false,
          }).start();
          showToast('Redemption request failed.', 'danger');
        } finally {
          setServingIndices(prev => prev.filter(i => i !== targetIndex));
          opQueueRef.current.shift();
          updateQueuedState();
          isProcessingQueueRef.current = false;
          processQueue();
        }
      });

    } else if (op.type === 'UNDO') {
      const targetIndex = op.index;
      setUndoingIndices(prev => [...prev, targetIndex]);
      updateQueuedState();

      const anim = getAnimValue(targetIndex, true);
      Animated.timing(anim, {
        toValue: 0,
        duration: 2000,
        useNativeDriver: false,
      }).start(async (result) => {
        if (!result.finished) {
          setUndoingIndices(prev => prev.filter(i => i !== targetIndex));
          opQueueRef.current.shift();
          updateQueuedState();
          isProcessingQueueRef.current = false;
          processQueue();
          return;
        }

        try {
          const res = await undoDrinkRedemption(scannedCardUid!);
          if (res.success) {
            setActiveSession(prev => {
              if (!prev) return null;
              const nextCount = Math.max(0, prev.redemptionCount - 1);
              setBartenderState('scanned');
              return { ...prev, redemptionCount: nextCount };
            });
            fetchRedemptionsHistory(activeSession!.tokenNumber);
            showToast(`Drink #${targetIndex} undone successfully!`, 'success');
          } else {
            Animated.timing(anim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: false,
            }).start();
            showToast(res.error || 'Undo blocked', 'danger');
          }
        } catch (err) {
          Animated.timing(anim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: false,
          }).start();
          showToast('Undo request failed.', 'danger');
        } finally {
          setUndoingIndices(prev => prev.filter(i => i !== targetIndex));
          opQueueRef.current.shift();
          updateQueuedState();
          isProcessingQueueRef.current = false;
          processQueue();
        }
      });
    }
  };

  const getQueuedServeCount = () => opQueueRef.current.filter(op => op.type === 'SERVE').length;
  const getQueuedUndoCount = () => opQueueRef.current.filter(op => op.type === 'UNDO').length;

  const enqueueServe = () => {
    if (!scannedCardUid || !activeSession) return;
    const used = activeSession.redemptionCount;
    const limit = activeSession.redemptionLimit;
    const serves = getQueuedServeCount();
    const undos = getQueuedUndoCount();
    
    if (used + serves - undos >= limit) {
      showToast('All drinks already redeemed or queued.', 'warning');
      return;
    }

    const nextIndex = used + serves - undos + 1;
    opQueueRef.current.push({ type: 'SERVE', index: nextIndex });
    updateQueuedState();
    processQueue();
  };

  const enqueueUndo = () => {
    if (!scannedCardUid || !activeSession) return;
    const used = activeSession.redemptionCount;
    const serves = getQueuedServeCount();
    const undos = getQueuedUndoCount();
    
    const lastServedIndex = used + serves - undos;
    if (lastServedIndex <= 0) {
      showToast('No redeemed drinks to undo.', 'warning');
      return;
    }

    opQueueRef.current.push({ type: 'UNDO', index: lastServedIndex });
    updateQueuedState();
    processQueue();
  };

  const handleServeDrink = () => {
    enqueueServe();
  };

  const handleUndoServe = () => {
    enqueueUndo();
  };

  // Render drinks balance dots/slots using visual card vectors in a 4-column grid
  const renderDrinkSlots = () => {
    if (!activeSession) return null;
    const limit = activeSession.redemptionLimit;
    const used = activeSession.redemptionCount;
    
    const completedSlots: React.ReactNode[] = [];
    const remainingSlots: React.ReactNode[] = [];
    
    for (let i = 1; i <= limit; i++) {
      const isRedeemed = i <= used;
      const isServing = servingIndices.includes(i);
      const isUndoing = undoingIndices.includes(i);
      const isQueuedServe = queuedIndices[i] === 'SERVE';
      const isQueuedUndo = queuedIndices[i] === 'UNDO';

      const anim = getAnimValue(i, isRedeemed);
      const heightInterpolate = anim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%']
      });

      const handlePressSlot = () => {
        const serves = getQueuedServeCount();
        const undos = getQueuedUndoCount();
        const lastServedIndex = used + serves - undos;

        if (i <= lastServedIndex) {
          if (i === lastServedIndex) {
            enqueueUndo();
          } else {
            showToast('Only the latest redeemed drink can be undone first.', 'warning');
          }
        } else {
          enqueueServe();
        }
      };

      const slotEl = (
        <TouchableOpacity
          key={i}
          activeOpacity={0.8}
          onPress={handlePressSlot}
          style={{ 
            height: 48,
            borderColor: isRedeemed ? colors.border : colors.gold, 
            borderWidth: 1.5,
            position: 'relative',
            overflow: 'hidden',
          }}
          className="rounded-xl items-center justify-center"
        >
          {/* Animated liquid fill */}
          <Animated.View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: heightInterpolate,
              backgroundColor: isDark ? 'rgba(245, 166, 35, 0.25)' : 'rgba(212, 175, 55, 0.2)',
            }}
          />

          {/* Queued/Pending state overlay */}
          {(isQueuedServe || isQueuedUndo) && (
            <View 
              style={{ position: 'absolute', top: 2, right: 4 }}
              className="bg-black/40 rounded-full px-1 py-0.5"
            >
              <Text style={{ fontSize: 7, color: 'white', fontWeight: 'bold' }}>QUEUED</Text>
            </View>
          )}

          {/* Main content label */}
          {isServing || isQueuedServe ? (
            <View className="flex-row items-center gap-1">
              <AppIcon name="glass" color={colors.gold} size={16} />
              <AppIcon name="clock" color={colors.gold} size={12} />
            </View>
          ) : isUndoing || isQueuedUndo ? (
            <View className="flex-row items-center gap-1">
              <AppIcon name="check" color={colors.muted} size={14} />
              <AppIcon name="clock" color={colors.muted} size={12} />
            </View>
          ) : isRedeemed ? (
            <Text className="text-xs font-bold" style={{ color: colors.muted }}>✓ Served</Text>
          ) : (
            <View className="flex-row items-center gap-1">
              <AppIcon name="glass" color={colors.gold} size={14} />
              <Text className="text-gold text-xs font-extrabold" style={{ color: colors.gold }}>Serve</Text>
            </View>
          )}
        </TouchableOpacity>
      );

      if (isRedeemed && !isUndoing) {
        completedSlots.push(slotEl);
      } else {
        remainingSlots.push(slotEl);
      }
    }

    return (
      <View className="mt-3">
        {completedSlots.length > 0 && (
          <View className="mb-4">
            <Text className="text-[9px] uppercase tracking-wider mb-2" style={{ color: colors.muted }}>Served Drinks</Text>
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
              {completedSlots.map((slot, index) => (
                <View key={index} style={{ width: '25%', padding: 6 }}>
                  {slot}
                </View>
              ))}
            </View>
          </View>
        )}
        
        {remainingSlots.length > 0 && (
          <View>
            <Text className="text-[9px] uppercase tracking-wider mb-2" style={{ color: colors.muted }}>Available Drinks</Text>
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
              {remainingSlots.map((slot, index) => (
                <View key={index} style={{ width: '25%', padding: 6 }}>
                  {slot}
                </View>
              ))}
            </View>
          </View>
        )}
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
                style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}
              >
                <Text className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: colors.gold }}>Lookup Guest Session</Text>
                <View className="flex-row gap-2 items-center">
                  <TextInput
                    className="flex-1 border rounded-xl px-4 py-3 text-sm font-semibold min-h-[48px]"
                    style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5, color: colors.text }}
                    placeholder="Enter Token (e.g. BAR-2026...)"
                    placeholderTextColor={colors.placeholder}
                    value={enteredToken}
                    onChangeText={setEnteredToken}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <TouchableOpacity 
                    className="px-5 py-3 rounded-xl min-h-[48px] justify-center items-center border"
                    style={{ backgroundColor: colors.gold, borderColor: colors.gold }}
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
                        style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}
                        onPress={() => {
                          setEnteredToken(s.tokenNumber);
                          handleTokenLookup(s.tokenNumber);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text className="text-xs font-bold" style={{ color: colors.text }}>{s.customerName}</Text>
                          <Text className="text-[10px] font-mono mt-0.5" style={{ color: colors.muted }}>{s.tokenNumber}</Text>
                          <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            <Text className="text-[9px]" style={{ color: colors.muted }}>📞 {s.phoneNumber}</Text>
                            {s.email ? (
                              <Text className="text-[9px]" style={{ color: colors.muted }}>✉️ {s.email}</Text>
                            ) : null}
                          </View>
                        </View>
                        <View className="items-center px-2">
                          <Text className="text-[10px] font-bold" style={{ color: isExpired ? colors.red : colors.gold }}>
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
                  className="w-full rounded-[20px] py-5 items-center justify-center shadow-xl border"
                  style={{ backgroundColor: colors.gold, borderColor: colors.gold, borderWidth: 1.5 }}
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
                style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}
              >
                <Text className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: colors.gold }}>Lookup Guest Session</Text>
                <View className="flex-row gap-2 items-center">
                  <TextInput
                    className="flex-1 border rounded-xl px-4 py-3 text-sm font-semibold min-h-[48px]"
                    style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5, color: colors.text }}
                    placeholder="Enter Token (e.g. BAR-2026...)"
                    placeholderTextColor={colors.placeholder}
                    value={enteredToken}
                    onChangeText={setEnteredToken}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <TouchableOpacity 
                    className="px-5 py-3 rounded-xl min-h-[48px] justify-center items-center border"
                    style={{ backgroundColor: colors.gold, borderColor: colors.gold }}
                    onPress={() => handleTokenLookup(enteredToken)}
                  >
                    <Text className="font-extrabold text-xs" style={{ color: colors.goldButtonText }}>VALIDATE</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Start QR Scan Target */}
              <TouchableOpacity 
                className="w-full rounded-[20px] py-4 items-center justify-center shadow-xl border mb-3"
                style={{ backgroundColor: colors.gold, borderColor: colors.gold, borderWidth: 1.5 }}
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
                className="w-full rounded-[20px] py-4 items-center justify-center shadow-xl border mb-4"
                style={{ backgroundColor: colors.gold, borderColor: colors.gold, borderWidth: 1.5 }}
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
                  style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5 }}
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
                      style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}
                      onPress={() => {
                        setEnteredToken(s.tokenNumber);
                        handleTokenLookup(s.tokenNumber);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text className="text-xs font-bold" style={{ color: colors.text }}>{s.customerName}</Text>
                        <Text className="text-[9px] font-mono mt-0.5" style={{ color: colors.muted }}>{s.tokenNumber}</Text>
                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                          <Text className="text-[9px]" style={{ color: colors.muted }}>📞 {s.phoneNumber}</Text>
                          {s.email ? (
                            <Text className="text-[9px]" style={{ color: colors.muted }}>✉️ {s.email}</Text>
                          ) : null}
                        </View>
                      </View>
                      <View className="items-center px-2">
                        <Text className="text-[9px] font-bold" style={{ color: isExpired ? colors.red : colors.gold }}>
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
                onBarcodeScanned={({ data }: { data: string }) => {
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
                  backgroundColor: colors.bg
                }}
              >
                <ActivityIndicator size="large" color={colors.teal} />
                <Text className="text-sm font-bold mt-4 uppercase tracking-wider" style={{ color: colors.text }}>Scanning Smart Tag...</Text>
                <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Interfacing credentials via NFC link</Text>
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
                  backgroundColor: 'rgba(0,0,0,0.4)'
                }}
              >
                {/* Top Bar Indicator */}
                <View style={{ position: 'absolute', top: 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'center', zIndex: 12 }}>
                  <View className="px-4 py-2 rounded-full bg-black/80 border border-white/10 flex-row items-center gap-2">
                    <Text style={{ fontSize: 14 }}>🍷</Text>
                    <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Bartender QR Redemption</Text>
                  </View>
                </View>

                {/* Red scanning laser line */}
                <View 
                  style={{
                    position: 'absolute',
                    left: '15%',
                    right: '15%',
                    height: 2,
                    backgroundColor: '#EF4444',
                    top: '50%',
                    zIndex: 11,
                    shadowColor: '#EF4444',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.8,
                    shadowRadius: 8,
                  }}
                />

                {/* Centered target guide frame */}
                <View 
                  style={{ 
                    width: 260, 
                    height: 260, 
                    borderWidth: 2.5, 
                    borderColor: colors.gold, 
                    borderRadius: 20, 
                    backgroundColor: 'transparent',
                    shadowColor: colors.gold,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.35,
                    shadowRadius: 10,
                  }} 
                />
                
                <View className="mt-6 px-4 py-2 rounded-full bg-black/80 border border-white/10">
                  <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>
                    Align QR Code within the golden frame
                  </Text>
                </View>
                
                {/* Cancel button */}
                <TouchableOpacity 
                  className="absolute bottom-10 bg-white/15 px-8 py-3.5 rounded-full border border-white/20 active:opacity-80 shadow-lg"
                  style={{ zIndex: 12 }}
                  onPress={() => setBartenderState('idle')}
                >
                  <Text className="text-white font-extrabold text-xs uppercase tracking-wider">Cancel Scan</Text>
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
              backgroundColor: isDark ? 'rgba(34, 197, 94, 0.12)' : '#F0FDF4',
              borderColor: isDark ? 'rgba(34, 197, 94, 0.4)' : '#BBF7D0',
              borderWidth: 1.5
            }}
          >
            <Text className="text-xs font-bold" style={{ color: colors.teal }}>✓ Active Session: {activeSession.tokenNumber}</Text>
            <View className="px-2 py-0.5 rounded" style={{ backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)' }}>
              <Text className="font-extrabold text-[8px]" style={{ color: colors.teal }}>{activeSession.placeType.replace('_', ' ')}</Text>
            </View>
          </View>

          {/* Customer info card */}
          <View 
            className="rounded-[20px] p-5 shadow-xl border"
            style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}
          >
            <View className="flex-row items-center mb-4">
              <View 
                className="w-12 h-12 rounded-full border items-center justify-center mr-4"
                style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5 }}
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
              style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5 }}
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
              style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5 }}
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
                <View className="rounded-xl p-3 border" style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5 }}>
                  {redemptionsHistory.map((item, index) => (
                    <View key={item.id || index} className="flex-row justify-between py-1 border-b" style={{ borderBottomColor: colors.divider }}>
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
                className="py-3.5 rounded-xl items-center justify-center mb-4 min-h-[44px] border" 
                onPress={handleUndoServe}
                disabled={false}
                style={{ 
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FCA5A5',
                  borderWidth: 1.5,
                  opacity: 1 
                }}
                activeOpacity={0.8}
              >
                <Text className="font-extrabold text-xs" style={{ color: colors.red }}>
                  {loadingAction === 'undo_serve' ? `Undoing... (${secondsLeft}s)` : '↩ Undo Last Drink Redemption'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Session Controls */}
            <Text className="text-[10px] font-bold uppercase tracking-wider mt-4 mb-2" style={{ color: colors.muted }}>Session Controls</Text>
            <View className="flex-row gap-3 mb-4">
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl border items-center justify-center min-h-[44px]" 
                style={{ 
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FCA5A5',
                  borderWidth: 1.5,
                  opacity: isProcessing ? 0.5 : 1 
                }}
                onPress={() => handleConfirmCloseSession(activeSession.tokenNumber)}
                disabled={isProcessing}
              >
                <Text className="font-bold text-xs" style={{ color: colors.red }}>Close Section</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl border items-center justify-center min-h-[44px]" 
                style={{ 
                  backgroundColor: colors.secondaryButtonBg, 
                  borderColor: colors.border, 
                  borderWidth: 1.5,
                  opacity: isProcessing ? 0.5 : 1 
                }}
                onPress={handleQrScanForClose}
                disabled={isProcessing}
              >
                <Text className="font-bold text-xs" style={{ color: colors.text }}>Scan QR</Text>
              </TouchableOpacity>
            </View>

            {/* Serve / Next Buttons */}
            <View className="flex-row gap-3 mt-2">
              <TouchableOpacity 
                className="flex-1 py-3.5 rounded-xl border items-center justify-center min-h-[48px]" 
                style={{ 
                  backgroundColor: colors.secondaryButtonBg, 
                  borderColor: colors.border, 
                  borderWidth: 1.5,
                  opacity: isProcessing ? 0.5 : 1 
                }}
                onPress={() => setBartenderState('idle')}
                disabled={isProcessing}
              >
                <Text className="font-bold text-sm" style={{ color: colors.secondaryButtonText }}>Next Card</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-[2] py-3.5 rounded-xl items-center justify-center min-h-[48px] border" 
                style={{ 
                  borderColor: colors.teal,
                  backgroundColor: isProcessing ? (isDark ? '#27272A' : '#E4E4E7') : colors.teal,
                  borderWidth: 1.5,
                  opacity: isProcessing ? 0.5 : 1
                }}
                disabled={isProcessing}
                onPress={handleServeDrink}
              >
                <Text className="font-black text-sm" style={{ color: isProcessing ? colors.muted : (isDark ? colors.goldButtonText : '#FFFFFF') }}>
                  {loadingAction === 'serve_drink' ? `Serving... (${secondsLeft}s)` : 'Serve Drink'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {/* DRINK COUPONS DEPLETED WARNING STATE */}
      {bartenderState === 'depleted' && activeSession && (
        <ScrollView className="flex-1 mt-2" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <View 
            className="rounded-xl p-3 mb-4 border"
            style={{
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
              borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FCA5A5',
              borderWidth: 1.5
            }}
          >
            <Text className="text-xs font-bold" style={{ color: colors.red }}>🛑 Drink limit fully reached!</Text>
          </View>

          <View 
            className="rounded-[20px] p-5 shadow-xl border"
            style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}
          >
            <Text className="font-bold text-base text-center mb-1" style={{ color: colors.text }}>{activeSession.customerName}</Text>
            <Text className="text-[11px] text-center mb-4" style={{ color: colors.muted }}>Table {activeSession.tableNumber} • {activeSession.placeType.replace('_',' ')}</Text>
            
            <View 
              className="rounded-xl p-4 mb-5 border"
              style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: 1.5 }}
            >
              <Text className="text-xs leading-5 text-center" style={{ color: colors.muted }}>
                This smart card has 0 available drink tokens. Customer has already redeemed all {activeSession.redemptionLimit} cover coupon(s). Request receptionist to add extensions.
              </Text>
            </View>

            {/* Undo last serve safety trigger */}
            {activeSession.redemptionCount > 0 && (
              <TouchableOpacity 
                className="py-3.5 rounded-xl items-center justify-center mb-4 min-h-[44px] border" 
                onPress={handleUndoServe}
                disabled={false}
                style={{ 
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FCA5A5',
                  borderWidth: 1.5,
                  opacity: 1 
                }}
                activeOpacity={0.8}
              >
                <Text className="font-extrabold text-xs" style={{ color: colors.red }}>
                  {loadingAction === 'undo_serve' ? `Undoing... (${secondsLeft}s)` : '↩ Undo Last Drink Redemption'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Session Controls */}
            <Text className="text-[10px] font-bold uppercase tracking-wider mt-4 mb-2" style={{ color: colors.muted }}>Session Controls</Text>
            <View className="flex-row gap-3 mb-4">
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl border items-center justify-center min-h-[44px]" 
                style={{ 
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FCA5A5',
                  borderWidth: 1.5,
                  opacity: isProcessing ? 0.5 : 1 
                }}
                onPress={() => handleConfirmCloseSession(activeSession.tokenNumber)}
                disabled={isProcessing}
              >
                <Text className="font-bold text-xs" style={{ color: colors.red }}>Close Section</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl border items-center justify-center min-h-[44px]" 
                style={{ 
                  backgroundColor: colors.secondaryButtonBg, 
                  borderColor: colors.border, 
                  borderWidth: 1.5,
                  opacity: isProcessing ? 0.5 : 1 
                }}
                onPress={handleQrScanForClose}
                disabled={isProcessing}
              >
                <Text className="font-bold text-xs" style={{ color: colors.text }}>Scan QR</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              className="py-3.5 rounded-xl w-full items-center justify-center min-h-[48px] border" 
              style={{ 
                backgroundColor: isProcessing ? (isDark ? '#27272A' : '#E4E4E7') : colors.gold,
                borderColor: isProcessing ? (isDark ? '#3F3F46' : '#D4D4D8') : colors.gold,
                borderWidth: 1.5,
                opacity: isProcessing ? 0.5 : 1 
              }}
              onPress={() => setBartenderState('idle')}
              disabled={isProcessing}
            >
              <Text className="font-bold text-sm" style={{ color: isProcessing ? colors.muted : colors.goldButtonText }}>Tap Next Card</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ERROR SCAN STATE */}
      {bartenderState === 'error' && (
        <View className="flex-1 justify-center">
          <View 
            className="rounded-[20px] p-5 items-center py-8 shadow-xl border"
            style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}
          >
            <Text className="text-5xl mb-3">🛑</Text>
            <Text className="text-lg font-bold mb-2" style={{ color: colors.text }}>Scan Error</Text>
            <Text className="text-xs text-center leading-5 max-w-[80%] mb-6" style={{ color: colors.muted }}>{errorMessage}</Text>
            
            <TouchableOpacity 
              className="py-3.5 rounded-xl w-full items-center justify-center min-h-[48px] border" 
              style={{ backgroundColor: colors.gold, borderColor: colors.gold, borderWidth: 1.5 }}
              onPress={() => setBartenderState('idle')}
            >
              <Text className="font-bold text-sm" style={{ color: colors.goldButtonText }}>Tap Next Card</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Confirmation Modal */}
      {showCloseConfirm && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.65)', justifyContent: 'center', zIndex: 100, padding: 24, flexDirection: 'row', alignItems: 'center' }]}>
          <View className="rounded-[20px] p-6 w-full max-w-[340px] border shadow-2xl" style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1.5 }}>
            <Text className="font-extrabold text-base mb-2" style={{ color: colors.text }}>Close Section</Text>
            <Text className="text-xs leading-5 mb-6" style={{ color: colors.muted }}>
              Are you sure you want to close this section? This will end the customer's active session and temporarily place the section under maintenance.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl border items-center justify-center min-h-[44px]" 
                style={{ 
                  backgroundColor: colors.secondaryButtonBg, 
                  borderColor: colors.border, 
                  borderWidth: 1.5,
                  opacity: isClosingSession ? 0.5 : 1 
                }}
                onPress={() => {
                  setShowCloseConfirm(false);
                  setTokenToClose(null);
                }}
                disabled={isClosingSession}
              >
                <Text className="font-bold text-xs" style={{ color: colors.secondaryButtonText }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl items-center justify-center min-h-[44px] border" 
                style={{ 
                  backgroundColor: isProcessing ? (isDark ? '#27272A' : '#E4E4E7') : colors.red,
                  borderColor: isProcessing ? (isDark ? '#3F3F46' : '#D4D4D8') : colors.red,
                  borderWidth: 1.5,
                  opacity: isProcessing ? 0.6 : 1
                }}
                onPress={executeCloseSession}
                disabled={isProcessing}
              >
                <Text className="font-bold text-xs text-white" style={{ color: isProcessing ? colors.muted : '#FFFFFF' }}>
                  {loadingAction === 'close_session' ? `Closing... (${secondsLeft}s)` : 'Yes, Close Section'}
                </Text>
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
              onBarcodeScanned={({ data }: { data: string }) => {
                if (data) {
                  handleQrCodeScannedForClose(data);
                }
              }}
            />
          ) : (
            <ActivityIndicator size="large" color={colors.teal} />
          )}
          <TouchableOpacity 
            className="absolute bottom-10 px-6 py-3 rounded-xl border"
            style={{ backgroundColor: colors.red, borderColor: colors.red, borderWidth: 1.5 }}
            onPress={() => setScanningForClose(false)}
          >
            <Text className="text-white font-extrabold text-xs uppercase tracking-wider">Cancel QR Scan</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

