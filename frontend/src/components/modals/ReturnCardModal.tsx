import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNfcBar } from '../../context/NfcBarContext';
import { SessionToken, TokenStatus } from '../../types/nfc_bar';
import { AppIcon } from '../common/AppIcon';
import nfcService from '../../services/nfc/nfcManager';
import { useResponsive } from '../../utils/responsive';

interface ReturnCardModalProps {
  onClose: () => void;
}

export const ReturnCardModal: React.FC<ReturnCardModalProps> = ({ onClose }) => {
  const { sessions, closeGuestSession, showToast, tokenType, nfcEnabled, emailQrEnabled } = useNfcBar();
  const insets = useSafeAreaInsets();
  const { isTablet, isLargeScreen } = useResponsive();
  const isCentered = isTablet || isLargeScreen;
  const [returnStep, setReturnStep] = useState<number>(1);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  
  // Scanned Session details
  const [sessionDetails, setSessionDetails] = useState<SessionToken | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSanitizing, setIsSanitizing] = useState(false);

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
        showToast('This smart card has no active session!', 'danger');
      }
    } catch (error: any) {
      console.error('Return Card NFC Scan error:', error);
      showToast(error.message || 'NFC Scan failed.', 'danger');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSimulateScan = (cardId: string) => {
    setIsScanning(true);
    setSelectedCardId(cardId);
    
    setTimeout(() => {
      setIsScanning(false);
      const activeSession = sessions.find(s => s.cardUid === cardId && s.status === TokenStatus.ACTIVE);
      if (activeSession) {
        setSessionDetails(activeSession);
        setReturnStep(2);
      } else {
        showToast('This smart card has no active session!', 'danger');
        setSelectedCardId(null);
      }
    }, 1500); // 1.5s chip validation
  };

  const handleConfirmClosure = async () => {
    if (!sessionDetails) return;
    
    if (sessionDetails.deliveryMode === 'EMAIL_QR') {
      const success = closeGuestSession(sessionDetails.tokenNumber);
      if (success) {
        setReturnStep(3);
      }
      return;
    }

    setIsSanitizing(true);
    try {
      await nfcService.initialize();
      showToast('Wiping card blocks...', 'info');
      
      const eraseSuccess = await nfcService.eraseCard();
      // Add a small artificial delay so the user experiences the sanitization animation
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      if (!eraseSuccess) {
        showToast('NFC card erase failed, continuing closure...', 'warning');
      }
    } catch (err) {
      console.error('NFC erase error on checkout:', err);
    } finally {
      setIsSanitizing(false);
    }

    const success = closeGuestSession(sessionDetails.tokenNumber);
    if (success) {
      setReturnStep(3);
    }
  };

  const formatMinutesUsed = (startTimeStr: string) => {
    const diff = new Date().getTime() - new Date(startTimeStr).getTime();
    return Math.max(0, Math.floor(diff / (60 * 1000)));
  };

  return (
    <View className={`absolute inset-0 bg-black/65 z-50 ${isCentered ? 'justify-center items-center' : 'justify-end'}`}>
      <View 
        className={`bg-surface border border-white/5 shadow-2xl ${isCentered ? 'rounded-[24px]' : 'rounded-t-[20px]'}`}
        style={[
          { 
            padding: 20,
            paddingBottom: insets.bottom + 16,
          },
          isCentered 
            ? { width: '90%', maxWidth: 420, height: 500 }
            : { width: '100%', height: 480 + insets.bottom }
        ]}
      >
        {/* Header Row */}
        <View className="flex-row justify-between items-center pb-3 mb-4 border-b border-white/5">
          <Text className="text-base font-bold text-themeText" style={{ color: '#f0ede6' }}>Return Smart Card</Text>
          <TouchableOpacity onPress={onClose} className="w-10 h-10 rounded-full bg-input justify-center items-center">
            <AppIcon name="x" label="Dismiss" color="#7a7d8a" size={16} />
          </TouchableOpacity>
        </View>

        {/* STEP 1: SELECT SESSION OR SCAN NFC */}
        {returnStep === 1 && (
          <View className="flex-grow justify-center py-2">
            {!nfcEnabled ? (
              <View className="flex-1 flex-col justify-start">
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2 px-1">Select Guest to Check Out:</Text>
                <ScrollView className="flex-1" showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
                  {sessions.filter(s => s.status === TokenStatus.ACTIVE).length === 0 ? (
                    <View className="py-8 items-center">
                      <Text className="text-muted text-xs">No active guest sessions found.</Text>
                    </View>
                  ) : (
                    sessions.filter(s => s.status === TokenStatus.ACTIVE).map(s => (
                      <TouchableOpacity
                        key={s.id}
                        className="bg-surface border border-white/5 rounded-xl p-4 mb-2 flex-row justify-between items-center"
                        onPress={() => {
                          setSessionDetails(s);
                          setReturnStep(2);
                        }}
                      >
                        <View>
                          <Text className="text-themeText text-xs font-bold" style={{ color: '#f0ede6' }}>{s.customerName}</Text>
                          <Text className="text-muted text-[9px] font-mono mt-0.5">{s.tokenNumber}</Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-gold text-[10px] font-extrabold uppercase">Table {s.tableNumber}</Text>
                          <Text className="text-muted text-[9px] mt-0.5">Drinks: {s.redemptionCount}/{s.redemptionLimit}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            ) : isScanning ? (
              <View className="items-center justify-center py-6">
                <ActivityIndicator size="large" color="#f5a623" />
                <Text className="text-muted text-[13px] mt-4 font-bold tracking-wider uppercase">Interfacing Card Chip...</Text>
              </View>
            ) : (
              <ScrollView className="flex-1" showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                <TouchableOpacity 
                  className="items-center justify-center mb-4 bg-input border border-white/5 rounded-2xl w-full py-6"
                  onPress={handlePhysicalScan}
                  activeOpacity={0.8}
                >
                  <Text className="text-4xl text-gold mb-2">💳</Text>
                  <Text className="text-[11px] font-bold text-gold tracking-widest uppercase">START NFC SCAN</Text>
                  <Text className="text-muted text-[9px] text-center max-w-[80%] mt-1 leading-3.5">
                    Position Client Smart Card on reader to check invoice details.
                  </Text>
                </TouchableOpacity>



                {/* Also show active sessions lookup list for hybrid checkout */}
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2 mt-2 px-1">Or Select Guest Session:</Text>
                {sessions.filter(s => s.status === TokenStatus.ACTIVE).length === 0 ? (
                  <View className="py-4 items-center bg-input rounded-xl border border-white/5">
                    <Text className="text-muted text-[11px]">No active guest sessions found.</Text>
                  </View>
                ) : (
                  sessions.filter(s => s.status === TokenStatus.ACTIVE).map(s => (
                    <TouchableOpacity
                      key={s.id}
                      className="bg-surface border border-white/5 rounded-xl p-3 mb-2 flex-row justify-between items-center"
                      onPress={() => {
                        setSessionDetails(s);
                        setReturnStep(2);
                      }}
                    >
                      <View>
                        <Text className="text-themeText text-xs font-bold" style={{ color: '#f0ede6' }}>{s.customerName}</Text>
                        <Text className="text-muted text-[9px] font-mono mt-0.5">{s.tokenNumber}</Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-gold text-[10px] font-extrabold uppercase">Table {s.tableNumber}</Text>
                        <Text className="text-muted text-[9px] mt-0.5">Drinks: {s.redemptionCount}/{s.redemptionLimit}</Text>
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
          <View className="flex-1 justify-center py-2">
            {isSanitizing ? (
              <View className="items-center justify-center py-8">
                <ActivityIndicator size="large" color="#e63946" />
                <Text className="text-red font-bold text-sm mt-4 uppercase tracking-widest">
                  Sanitizing Card Block...
                </Text>
                <Text className="text-muted text-[11px] text-center mt-1">
                  Erase and reset NDEF records to available state
                </Text>
              </View>
            ) : (
              <>
                <Text className="text-[11px] font-bold text-gold uppercase tracking-wider mb-3">Session Summary Log</Text>
                
                {/* Itemized Scannable Invoice Grid */}
                <View className="bg-input rounded-xl p-4 border border-white/5 mb-4">
                  <View className="flex-row justify-between py-2 border-b border-white/5">
                    <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Customer Name</Text>
                    <Text className="text-themeText text-[11px] font-bold" style={{ color: '#f0ede6' }}>{sessionDetails.customerName}</Text>
                  </View>
                  <View className="flex-row justify-between py-2 border-b border-white/5">
                    <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Table Occupied</Text>
                    <Text className="text-themeText text-[11px] font-bold" style={{ color: '#f0ede6' }}>{sessionDetails.tableNumber} ({sessionDetails.placeType.replace('_', ' ')})</Text>
                  </View>
                  <View className="flex-row justify-between py-2 border-b border-white/5">
                    <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Time Duration</Text>
                    <Text className="text-themeText text-[11px] font-bold" style={{ color: '#f0ede6' }}>{formatMinutesUsed(sessionDetails.startTime)} Min</Text>
                  </View>
                  <View className="flex-row justify-between py-2">
                    <Text className="text-[11px]" style={{ color: '#9ca3af' }}>Drinks Allotted / Used</Text>
                    <Text className="text-themeText text-[11px] font-bold" style={{ color: '#f0ede6' }}>{sessionDetails.redemptionCount} / {sessionDetails.redemptionLimit} served</Text>
                  </View>
                </View>

                <Text className="text-red text-center text-[10px] leading-4 mb-4 font-semibold">
                  Confirm closure: This will mark table {sessionDetails.tableNumber} as available, erase the physical card NDEF payload, and return card ID {selectedCardId} to inventory stock.
                </Text>

                <View className="flex-row gap-3">
                  <TouchableOpacity className="flex-1 py-3.5 rounded-xl border border-borderDark items-center justify-center min-h-[48px]" onPress={() => setReturnStep(1)}>
                    <Text className="font-bold text-sm" style={{ color: '#9ca3af' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-1 bg-red/10 border border-red py-3.5 rounded-xl items-center justify-center min-h-[48px] active:opacity-90" onPress={handleConfirmClosure}>
                    <Text className="font-bold text-sm" style={{ color: '#e63946' }}>Close Session</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* STEP 3: SUCCESS WRAP */}
        {returnStep === 3 && (
          <View className="items-center justify-center py-4 flex-1">
            <View className="w-16 h-16 rounded-full bg-teal/10 border border-teal justify-center items-center mb-4">
              <Text className="text-teal text-3xl font-extrabold">✓</Text>
            </View>
            <Text className="text-lg font-bold text-themeText mb-2" style={{ color: '#f0ede6' }}>Session Closed Successfully</Text>
            <Text className="text-muted text-[11px] text-center leading-4 max-w-[85%] mb-6">
              Table seating freed. Card formatted and returned back to the active stock.
            </Text>
            <TouchableOpacity className="bg-gold py-3.5 rounded-xl w-full items-center justify-center min-h-[48px] active:opacity-90" onPress={onClose}>
              <Text className="font-extrabold text-sm" style={{ color: '#08090d' }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

export default ReturnCardModal;
