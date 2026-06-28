import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, 
  ActivityIndicator, StyleSheet
} from 'react-native';
import { useNfcBar } from '../../../context/NfcBarContext';
import { SessionToken, TokenStatus } from '../../../types/nfc_bar';
import { AppIcon } from '../../../components/common/AppIcon';
import nfcService from '../../../services/nfc/nfcManager';

export const BartenderPortal: React.FC = () => {
  const { sessions, redeemDrinkForCard, undoDrinkRedemption, tokenType, nfcEnabled, emailQrEnabled } = useNfcBar();
  const [bartenderState, setBartenderState] = useState<'idle' | 'scanning' | 'scanned' | 'depleted' | 'error'>('idle');
  const [scannedCardUid, setScannedCardUid] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [enteredToken, setEnteredToken] = useState('');
  
  // Scanned Session cache
  const [activeSession, setActiveSession] = useState<SessionToken | null>(null);

  const handleTokenLookup = (tokenNum: string) => {
    const cleanToken = tokenNum.trim().toUpperCase();
    if (!cleanToken) return;

    setScannedCardUid(cleanToken);
    setErrorMessage('');
    
    const found = sessions.find(s => s.tokenNumber === cleanToken && s.status === TokenStatus.ACTIVE);
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
        (cardUid && s.cardUid === cardUid && s.status === TokenStatus.ACTIVE) || 
        (tokenNumber && s.tokenNumber === tokenNumber && s.status === TokenStatus.ACTIVE)
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
      const found = sessions.find(s => s.cardUid === cardId && s.status === TokenStatus.ACTIVE);
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
          style={{ height: 44 }}
          className={`rounded-xl items-center justify-center border
            ${isRedeemed ? 'border-white/5 bg-transparent' : 'border-gold bg-gold/10'}`}
        >
          {isRedeemed ? (
            <Text className="text-muted text-xs font-bold">✓</Text>
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
    const diff = new Date(endTimeStr).getTime() - new Date().getTime();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${mins}m`;
  };

  return (
    <View className="flex-1 bg-bg p-4 justify-between">
      
      {/* Top Title Section */}
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-xl font-bold text-themeText" style={{ color: '#f0ede6' }}>Drink Redemption</Text>
        <View className="bg-teal/15 px-2 py-0.5 rounded border border-teal/20">
          <Text className="text-teal font-extrabold text-[9px] tracking-wider">
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
              <View className="bg-surface rounded-[20px] p-5 border border-white/5 shadow-xl mb-4">
                <Text className="text-[10px] font-bold text-gold uppercase tracking-wider mb-3">Lookup Guest Session</Text>
                <View className="flex-row gap-2 items-center">
                  <TextInput
                    className="flex-1 bg-bg border border-borderDark rounded-xl px-4 py-3 text-sm font-semibold text-[#f0ede6] min-h-[48px]"
                    placeholder="Enter Token (e.g. BAR-2026...)"
                    placeholderTextColor="#9ca3af"
                    value={enteredToken}
                    onChangeText={setEnteredToken}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <TouchableOpacity 
                    className="bg-gold px-5 py-3 rounded-xl min-h-[48px] justify-center items-center"
                    onPress={() => handleTokenLookup(enteredToken)}
                  >
                    <Text className="font-extrabold text-xs" style={{ color: '#08090d' }}>VALIDATE</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Active sessions list helper */}
              <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2.5 px-1">Active Checked-in Guests:</Text>
              <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
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
                        setEnteredToken(s.tokenNumber);
                        handleTokenLookup(s.tokenNumber);
                      }}
                    >
                      <View>
                        <Text className="text-themeText text-xs font-bold" style={{ color: '#f0ede6' }}>{s.customerName}</Text>
                        <Text className="text-muted text-[10px] font-mono mt-0.5">{s.tokenNumber}</Text>
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
          ) : !emailQrEnabled ? (
            <View className="flex-1 justify-between flex-col py-6">
              <View className="flex-1 items-center justify-center">
                {/* Visual Icon Illustration */}
                <View className="w-24 h-24 rounded-full bg-surface border border-white/5 items-center justify-center mb-4">
                  <Text className="text-4xl">🍹</Text>
                </View>
                <Text className="text-themeText text-base font-extrabold" style={{ color: '#f0ede6' }}>Redemption Scan Target</Text>
                <Text className="text-muted text-[11px] text-center max-w-[70%] mt-1.5 leading-4">
                  Align physical card with sensor scanner to check drink token balance.
                </Text>
              </View>
              
              {/* Lower Third scan CTA and quick simulators */}
              <View className="flex-col gap-4">
                <TouchableOpacity 
                  className="w-full bg-gold rounded-[20px] py-5 items-center justify-center shadow-xl border border-gold/20"
                  onPress={handlePhysicalScan}
                  activeOpacity={0.85}
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xl">🛜</Text>
                    <Text className="font-black text-base tracking-widest uppercase" style={{ color: '#08090d' }}>START NFC SCAN</Text>
                  </View>
                </TouchableOpacity>


              </View>
            </View>
          ) : (
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* Lookup Guest Session */}
              <View className="bg-surface rounded-[20px] p-5 border border-white/5 shadow-xl mb-4">
                <Text className="text-[10px] font-bold text-gold uppercase tracking-wider mb-3">Lookup Guest Session</Text>
                <View className="flex-row gap-2 items-center">
                  <TextInput
                    className="flex-1 bg-bg border border-borderDark rounded-xl px-4 py-3 text-sm font-semibold text-[#f0ede6] min-h-[48px]"
                    placeholder="Enter Token (e.g. BAR-2026...)"
                    placeholderTextColor="#9ca3af"
                    value={enteredToken}
                    onChangeText={setEnteredToken}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <TouchableOpacity 
                    className="bg-gold px-5 py-3 rounded-xl min-h-[48px] justify-center items-center"
                    onPress={() => handleTokenLookup(enteredToken)}
                  >
                    <Text className="font-extrabold text-xs" style={{ color: '#08090d' }}>VALIDATE</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Start NFC Scan Target */}
              <TouchableOpacity 
                className="w-full bg-gold rounded-[20px] py-4 items-center justify-center shadow-xl border border-gold/20 mb-4"
                onPress={handlePhysicalScan}
                activeOpacity={0.85}
              >
                <View className="flex-row items-center gap-2">
                  <Text style={{ fontSize: 16 }}>🛜</Text>
                  <Text className="font-black text-sm tracking-widest uppercase" style={{ color: '#08090d' }}>START NFC SCAN</Text>
                </View>
              </TouchableOpacity>



              {/* Active Checked-in Guests */}
              <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2.5 px-1">Active Checked-in Guests:</Text>
              {sessions.filter(s => s.status === TokenStatus.ACTIVE).length === 0 ? (
                <View className="py-6 items-center bg-input border border-white/5 rounded-xl">
                  <Text className="text-muted text-xs">No active guest sessions found.</Text>
                </View>
              ) : (
                sessions.filter(s => s.status === TokenStatus.ACTIVE).map(s => (
                  <TouchableOpacity
                    key={s.id}
                    className="bg-surface border border-white/5 rounded-xl p-3.5 mb-2 flex-row justify-between items-center"
                    onPress={() => {
                      setEnteredToken(s.tokenNumber);
                      handleTokenLookup(s.tokenNumber);
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

      {/* SCANNING ACTIVE STATE */}
      {bartenderState === 'scanning' && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#4ecdc4" />
          <Text className="text-themeText text-sm font-bold mt-4 uppercase tracking-wider" style={{ color: '#f0ede6' }}>Scanning Smart Tag...</Text>
          <Text className="text-muted text-[11px] mt-1">Interfacing credentials via NFC link</Text>
        </View>
      )}

      {/* SCANNED ACTIVE SESSION CARD */}
      {bartenderState === 'scanned' && activeSession && (
        <ScrollView className="flex-1 mt-2" contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          {/* Active Session info banner */}
          <View className="bg-teal/10 border border-teal/20 rounded-xl p-3 mb-4 flex-row items-center justify-between">
            <Text className="text-teal text-xs font-bold">✓ Active Session: {activeSession.tokenNumber}</Text>
            <View className="bg-teal/20 px-2 py-0.5 rounded">
              <Text className="text-teal font-extrabold text-[8px]">{activeSession.placeType.replace('_', ' ')}</Text>
            </View>
          </View>

          {/* Customer info card */}
          <View className="bg-surface rounded-[20px] p-5 border border-white/5 shadow-xl">
            <View className="flex-row items-center mb-4">
              <View className="w-12 h-12 rounded-full bg-input border border-white/5 items-center justify-center mr-4">
                <Text className="text-xl">👤</Text>
              </View>
              <View className="flex-1">
                <Text className="text-themeText font-bold text-base" style={{ color: '#f0ede6' }}>{activeSession.customerName}</Text>
                <Text className="text-gold font-mono text-[10px] font-bold mt-0.5">Table assigned: {activeSession.tableNumber}</Text>
              </View>
            </View>

            <View className="flex-row justify-between bg-input border border-white/5 rounded-xl p-3 mb-5">
              <View className="flex-1 items-center border-r border-white/5">
                <Text className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#9ca3af' }}>Guests Size</Text>
                <Text className="text-themeText font-bold text-xs" style={{ color: '#f0ede6' }}>{activeSession.persons} Pax</Text>
              </View>
              <View className="flex-grow flex-1 items-center">
                <Text className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#9ca3af' }}>Time Remaining</Text>
                <Text className="text-themeText font-bold text-xs" style={{ color: '#f0ede6' }}>{calculateTimeRemaining(activeSession.endTime)}</Text>
              </View>
            </View>

            {/* Drink Coupon Counter Meter */}
            <Text className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 text-center">Remaining Beverage Balance</Text>
            <View className="bg-input border border-white/5 rounded-xl p-4 mb-4">
              <Text className="text-xs text-center mb-3" style={{ color: '#9ca3af' }}>
                Redeemed <Text className="text-gold font-bold">{activeSession.redemptionCount}</Text> of {activeSession.redemptionLimit} coupons
              </Text>
              
              {/* Visual Drink grid boxes */}
              {renderDrinkSlots()}
            </View>

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

            {/* Serve / Next Buttons */}
            <View className="flex-row gap-3 mt-2">
              <TouchableOpacity className="flex-1 py-3.5 rounded-xl border border-borderDark items-center justify-center min-h-[48px]" onPress={() => setBartenderState('idle')}>
                <Text className="font-bold text-sm" style={{ color: '#9ca3af' }}>Next Card</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-[2] bg-teal py-3.5 rounded-xl items-center justify-center min-h-[48px] active:opacity-90" 
                onPress={handleServeDrink}
              >
                <Text className="font-black text-sm" style={{ color: '#08090d' }}>Serve Drink</Text>
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

          <View className="bg-surface rounded-[20px] p-5 border border-white/5 shadow-xl">
            <Text className="text-themeText font-bold text-base text-center mb-1" style={{ color: '#f0ede6' }}>{activeSession.customerName}</Text>
            <Text className="text-muted text-[11px] text-center mb-4">Table {activeSession.tableNumber} • {activeSession.placeType.replace('_',' ')}</Text>
            
            <View className="bg-input border border-white/5 rounded-xl p-4 mb-5">
              <Text className="text-xs leading-5 text-center" style={{ color: '#9ca3af' }}>
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

            <TouchableOpacity className="bg-gold py-3.5 rounded-xl w-full items-center justify-center min-h-[48px] active:opacity-90" onPress={() => setBartenderState('idle')}>
              <Text className="font-bold text-sm" style={{ color: '#08090d' }}>Tap Next Card</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ERROR SCAN STATE */}
      {bartenderState === 'error' && (
        <View className="flex-1 justify-center">
          <View className="bg-surface rounded-[20px] p-5 border border-white/5 items-center py-8 shadow-xl">
            <Text className="text-5xl mb-3">🛑</Text>
            <Text className="text-lg font-bold text-themeText mb-2" style={{ color: '#f0ede6' }}>Scan Error</Text>
            <Text className="text-muted text-xs text-center leading-5 max-w-[80%] mb-6">{errorMessage}</Text>
            
            <TouchableOpacity className="bg-gold py-3.5 rounded-xl w-full items-center justify-center min-h-[48px] active:opacity-90" onPress={() => setBartenderState('idle')}>
              <Text className="font-bold text-sm" style={{ color: '#08090d' }}>Tap Next Card</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

