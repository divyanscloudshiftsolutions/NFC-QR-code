import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNfcBar } from '../../context/NfcBarContext';
import { useTheme } from '../../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SessionToken, TokenStatus } from '../../types/nfc_bar';
import { AppIcon } from '../common/AppIcon';
import nfcService from '../../services/nfc/nfcManager';
import { useResponsive } from '../../utils/responsive';
import { useActionProgress } from '../../utils/actionProgress';

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

interface ReturnCardModalProps {
  onClose: () => void;
}

export const ReturnCardModal: React.FC<ReturnCardModalProps> = ({ onClose }) => {
  const { sessions, closeGuestSession, showToast, tokenType, nfcEnabled, emailQrEnabled } = useNfcBar();
  const { loadingAction, secondsLeft, startAction, stopAction, isProcessing } = useActionProgress();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { isTablet, isLargeScreen } = useResponsive();
  const isCentered = isTablet || isLargeScreen;
  const [returnStep, setReturnStep] = useState<number>(1);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  
  // Scanned Session details
  const [sessionDetails, setSessionDetails] = useState<SessionToken | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSanitizing, setIsSanitizing] = useState(false);
  const [redemptionsHistory, setRedemptionsHistory] = useState<any[]>([]);

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

  React.useEffect(() => {
    if (sessionDetails) {
      fetchRedemptionsHistory(sessionDetails.tokenNumber);
    } else {
      setRedemptionsHistory([]);
    }
  }, [sessionDetails]);

  const handlePhysicalScan = async () => {
    setIsScanning(true);
    setSelectedCardId(null);
    
    try {
      await nfcService.initialize();
      const details = await nfcService.readCardDetails();
      if (!details || !details.nfcUid) {
        throw new Error('Failed to read Card details from NFC.');
      }

      const cardUid = details.nfcUid;
      const tokenNumber = details.tokenNumber;
      setSelectedCardId(cardUid);

      // Search by cardUid or tokenNumber
      const activeSession = sessions.find(s => 
        (cardUid && s.cardUid === cardUid && s.status === TokenStatus.ACTIVE) ||
        (tokenNumber && s.tokenNumber === tokenNumber && s.status === TokenStatus.ACTIVE)
      );

      if (activeSession) {
        setSessionDetails(activeSession);
        setReturnStep(2);
      } else {
        showToast('No active session found', 'danger');
      }
    } catch (error: any) {
      console.error('Return Card NFC Scan error:', error);
      showToast('NFC scan failed', 'danger');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSimulateScan = (cardId: string) => {
    setIsScanning(true);
    setSelectedCardId(cardId);
    
    // Immediate simulation transition
    setIsScanning(false);
    const activeSession = sessions.find(s => s.cardUid === cardId && s.status === TokenStatus.ACTIVE);
    if (activeSession) {
      setSessionDetails(activeSession);
      setReturnStep(2);
    } else {
      showToast('No active session found', 'danger');
      setSelectedCardId(null);
    }
  };

  const handleConfirmClosure = async () => {
    if (!sessionDetails) return;
    if (!startAction('close_session')) return;
    
    try {
      if (sessionDetails.deliveryMode === 'EMAIL_QR') {
        const success = await closeGuestSession(sessionDetails.tokenNumber);
        stopAction();
        if (success) {
          setReturnStep(3);
        }
        return;
      }

      setIsSanitizing(true);
      try {
        await nfcService.initialize();
        const eraseSuccess = await nfcService.eraseCard();
        if (!eraseSuccess) {
          showToast('Card erase failed, closing session anyway', 'warning');
        }
      } catch (err) {
        console.error('NFC erase error on checkout:', err);
      } finally {
        setIsSanitizing(false);
      }

      const success = await closeGuestSession(sessionDetails.tokenNumber);
      stopAction();
      if (success) {
        setReturnStep(3);
      }
    } catch (e) {
      stopAction();
      showToast('An error occurred during checkout', 'danger');
    }
  };

  const formatMinutesUsed = (startTimeStr: string) => {
    const diff = new Date().getTime() - new Date(startTimeStr).getTime();
    return Math.max(0, Math.floor(diff / (60 * 1000)));
  };

  return (
    <View className="absolute inset-0 z-50" style={isCentered ? { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.overlay } : { justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
      <View 
        className={`shadow-2xl border ${isCentered ? 'rounded-[24px]' : 'rounded-t-[20px]'}`}
        style={[
          { 
            padding: 20,
            paddingBottom: insets.bottom + 16,
            backgroundColor: colors.modal,
            borderColor: colors.border,
            borderWidth: 1
          },
          isCentered 
            ? { width: '90%', maxWidth: 420, height: 500 }
            : { width: '100%', height: 480 + insets.bottom }
        ]}
      >
        {/* Header Row */}
        <View className="flex-row justify-between items-center pb-3 mb-4 border-b" style={{ borderBottomColor: colors.border }}>
          <Text className="text-base font-bold" style={{ color: colors.text }}>Return Smart Card</Text>
          <TouchableOpacity 
            onPress={onClose} 
            className="w-10 h-10 rounded-full justify-center items-center border"
            style={{ backgroundColor: colors.secondaryButtonBg, borderColor: colors.border }}
          >
            <AppIcon name="x" label="Dismiss" color={colors.muted} size={16} />
          </TouchableOpacity>
        </View>

        {/* STEP 1: SELECT SESSION OR SCAN NFC */}
        {returnStep === 1 && (
          <View className="flex-grow justify-center py-2">
            {!nfcEnabled ? (
              <View className="flex-1 flex-col justify-start">
                <Text className="text-[10px] font-bold uppercase tracking-wider mb-2 px-1" style={{ color: colors.muted }}>Select Guest to Check Out:</Text>
                <ScrollView className="flex-1" showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
                  {sessions.filter(s => s.status === TokenStatus.ACTIVE).length === 0 ? (
                    <View className="py-8 items-center">
                      <Text style={{ color: colors.muted, fontSize: 12 }}>No active guest sessions found.</Text>
                    </View>
                  ) : (
                    sessions.filter(s => s.status === TokenStatus.ACTIVE).map(s => (
                      <TouchableOpacity
                        key={s.id}
                        className="rounded-xl p-4 mb-2 flex-row justify-between items-center border"
                        style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
                        onPress={() => {
                          setSessionDetails(s);
                          setReturnStep(2);
                        }}
                      >
                        <View>
                          <Text className="text-xs font-bold" style={{ color: colors.text }}>{s.customerName}</Text>
                          <Text className="text-[9px] font-mono mt-0.5" style={{ color: colors.muted }}>{s.tokenNumber}</Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-[10px] font-extrabold uppercase" style={{ color: colors.gold }}>Table {s.tableNumber}</Text>
                          <Text className="text-[9px] mt-0.5" style={{ color: colors.muted }}>Drinks: {s.redemptionCount}/{s.redemptionLimit}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            ) : isScanning ? (
              <View className="items-center justify-center py-6">
                <ActivityIndicator size="large" color={colors.gold} />
                <Text className="text-[13px] mt-4 font-bold tracking-wider uppercase" style={{ color: colors.muted }}>Interfacing Card Chip...</Text>
              </View>
            ) : (
              <ScrollView className="flex-1" showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                <TouchableOpacity 
                  className="items-center justify-center mb-4 border rounded-2xl w-full py-6"
                  style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}
                  onPress={handlePhysicalScan}
                  activeOpacity={0.8}
                >
                  <Text className="text-4xl mb-2" style={{ color: colors.gold }}>💳</Text>
                  <Text className="text-[11px] font-bold tracking-widest uppercase" style={{ color: colors.gold }}>START NFC SCAN</Text>
                  <Text className="text-[9px] text-center max-w-[80%] mt-1.5 leading-4" style={{ color: colors.muted }}>
                    Position Client Smart Card on reader to check invoice details.
                  </Text>
                </TouchableOpacity>

                {/* Also show active sessions lookup list for hybrid checkout */}
                <Text className="text-[10px] font-bold uppercase tracking-wider mb-2 mt-2 px-1" style={{ color: colors.muted }}>Or Select Guest Session:</Text>
                {sessions.filter(s => s.status === TokenStatus.ACTIVE).length === 0 ? (
                  <View 
                    className="py-4 items-center rounded-xl border"
                    style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}
                  >
                    <Text className="text-[11px]" style={{ color: colors.muted }}>No active guest sessions found.</Text>
                  </View>
                ) : (
                  sessions.filter(s => s.status === TokenStatus.ACTIVE).map(s => (
                    <TouchableOpacity
                      key={s.id}
                      className="rounded-xl p-3 mb-2 flex-row justify-between items-center border"
                      style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
                      onPress={() => {
                        setSessionDetails(s);
                        setReturnStep(2);
                      }}
                    >
                      <View>
                        <Text className="text-xs font-bold" style={{ color: colors.text }}>{s.customerName}</Text>
                        <Text className="text-[9px] font-mono mt-0.5" style={{ color: colors.muted }}>{s.tokenNumber}</Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-[10px] font-extrabold uppercase" style={{ color: colors.gold }}>Table {s.tableNumber}</Text>
                        <Text className="text-[9px] mt-0.5" style={{ color: colors.muted }}>Drinks: {s.redemptionCount}/{s.redemptionLimit}</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        )}

        {/* STEP 2: SUMMARY CONFIRM OR SANITIZATION PROGRESS */}
        {returnStep === 2 && sessionDetails && (
          <View className="flex-grow justify-center py-2">
            {isSanitizing ? (
              <View className="items-center justify-center py-8">
                <ActivityIndicator size="large" color={colors.red} />
                <Text className="text-red font-bold text-sm mt-4 uppercase tracking-widest">
                  Sanitizing Card Block...
                </Text>
                <Text className="text-[11px] text-center mt-1" style={{ color: colors.muted }}>
                  Clearing card data and restoring to available stock
                </Text>
              </View>
            ) : (
              <>
                <Text className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: colors.gold }}>Session Summary Log</Text>
                
                {/* Itemized Scannable Invoice Grid */}
                <View 
                  className="rounded-xl p-4 border mb-4"
                  style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}
                >
                  <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                    <Text className="text-[11px]" style={{ color: colors.muted }}>Customer Name</Text>
                    <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{sessionDetails.customerName}</Text>
                  </View>
                  <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                    <Text className="text-[11px]" style={{ color: colors.muted }}>Table Occupied</Text>
                    <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{sessionDetails.tableNumber} ({sessionDetails.placeType.replace('_', ' ')})</Text>
                  </View>
                  <View className="flex-row justify-between py-2 border-b" style={{ borderBottomColor: colors.border }}>
                    <Text className="text-[11px]" style={{ color: colors.muted }}>Time Duration</Text>
                    <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{formatMinutesUsed(sessionDetails.startTime)} Min</Text>
                  </View>
                  <View className="flex-row justify-between py-2">
                    <Text className="text-[11px]" style={{ color: colors.muted }}>Drinks Allotted / Used</Text>
                    <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{sessionDetails.redemptionCount} / {sessionDetails.redemptionLimit} served</Text>
                  </View>
                </View>

                {redemptionsHistory && redemptionsHistory.length > 0 && (
                  <View className="mb-4" style={{ maxHeight: 150 }}>
                    <Text className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: colors.muted }}>Drinks Redemption Timeline (with seconds)</Text>
                    <ScrollView nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
                      <View className="rounded-xl p-3 border" style={{ backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1 }}>
                        {redemptionsHistory.map((item, index) => (
                          <View key={item.id || index} className="flex-row justify-between py-1.5 border-b" style={{ borderBottomColor: colors.border }}>
                            <Text className="text-[10px]" style={{ color: colors.text }}>Drink #{index + 1}</Text>
                            <Text className="text-[10px] font-mono font-bold" style={{ color: colors.gold }}>
                              {formatRedemptionTime(item.timestamp)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}

                <Text className="text-red text-center text-[10px] leading-4 mb-4 font-semibold">
                  Confirm closure: This will mark table {sessionDetails.tableNumber} as available, clear all card data, and return card ID {selectedCardId} back to available stock.
                </Text>

                <View className="flex-row gap-3">
                  <TouchableOpacity 
                    className="flex-1 py-3.5 rounded-xl border items-center justify-center min-h-[48px]" 
                    style={{ backgroundColor: colors.secondaryButtonBg, borderColor: colors.border, opacity: isProcessing ? 0.5 : 1 }}
                    onPress={() => setReturnStep(1)}
                    disabled={isProcessing}
                  >
                    <Text className="font-bold text-sm" style={{ color: colors.secondaryButtonText }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className="flex-1 bg-red/10 border border-red py-3.5 rounded-xl items-center justify-center min-h-[48px] active:opacity-90" 
                    style={{ borderColor: colors.red, opacity: isProcessing ? 0.5 : 1 }} 
                    onPress={handleConfirmClosure}
                    disabled={isProcessing}
                  >
                    <Text className="font-bold text-sm" style={{ color: colors.red }}>
                      {loadingAction === 'close_session' ? `Closing... (${secondsLeft}s)` : 'Close Session'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* STEP 3: SUCCESS WRAP */}
        {returnStep === 3 && (
          <View className="items-center justify-center py-4 flex-1">
            <View className="w-16 h-16 rounded-full bg-teal/10 border justify-center items-center mb-4" style={{ borderColor: colors.teal }}>
              <Text className="text-3xl font-extrabold" style={{ color: colors.teal }}>✓</Text>
            </View>
            <Text className="text-lg font-bold mb-2 text-center" style={{ color: colors.text }}>Session Closed Successfully</Text>
            <Text className="text-[11px] text-center leading-4 max-w-[85%] mb-6" style={{ color: colors.muted }}>
              Table seating freed. Card formatted and returned back to the active stock.
            </Text>
            <TouchableOpacity className="bg-gold py-3.5 rounded-xl w-full items-center justify-center min-h-[48px] border" style={{ borderColor: colors.gold }} onPress={onClose}>
              <Text className="font-extrabold text-sm" style={{ color: colors.goldButtonText }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

export default ReturnCardModal;
