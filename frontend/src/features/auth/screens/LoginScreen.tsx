import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, 
  Platform, KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNfcBar } from '../../../context/NfcBarContext';
import { AppIcon } from '../../../components/common/AppIcon';

import { useResponsive } from '../../../utils/responsive';

export const LoginScreen: React.FC = () => {
  const { login } = useNfcBar();
  const insets = useSafeAreaInsets();
  const { isSmallPhone, height } = useResponsive();
  const numpadHeight = isSmallPhone || height < 700 ? 44 : 54;
  const cardPadding = isSmallPhone || height < 700 ? 16 : 20;
  const cardMarginY = isSmallPhone || height < 700 ? 12 : 24;
  
  // Custom Numpad Input States
  const [selectedRole, setSelectedRole] = useState<'REC' | 'BAR' | 'ADM' | 'MGR'>('REC');
  const [idSuffix, setIdSuffix] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [activeField, setActiveField] = useState<'id' | 'pin'>('id');
  
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  // Auto-focus logic: Switch to PIN once ID has 2 digits
  useEffect(() => {
    if (idSuffix.length === 2 && activeField === 'id') {
      setActiveField('pin');
    }
  }, [idSuffix, activeField]);

  const handleKeyPress = (num: string) => {
    setErrorMsg('');
    if (activeField === 'id') {
      if (idSuffix.length < 2) {
        setIdSuffix(prev => prev + num);
      }
    } else {
      if (enteredPin.length < 4) {
        setEnteredPin(prev => prev + num);
      }
    }
  };

  const handleBackspace = () => {
    setErrorMsg('');
    if (activeField === 'pin') {
      if (enteredPin.length > 0) {
        setEnteredPin(prev => prev.slice(0, -1));
      } else {
        // Fall back to ID editing if PIN is empty
        setActiveField('id');
        setIdSuffix(prev => prev.slice(0, -1));
      }
    } else {
      if (idSuffix.length > 0) {
        setIdSuffix(prev => prev.slice(0, -1));
      }
    }
  };

  const handleClear = () => {
    setErrorMsg('');
    setIdSuffix('');
    setEnteredPin('');
    setActiveField('id');
  };

  const handleSignIn = async () => {
    if (idSuffix.length !== 2 || enteredPin.length !== 4) {
      setErrorMsg('Please enter a 2-digit ID suffix and a 4-digit PIN.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);
    const employeeId = `${selectedRole}-${idSuffix}`;
    
    try {
      const success = await login(employeeId, enteredPin);
      if (!success) {
        setErrorMsg('Authentication failed. Incorrect ID or PIN.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLogin = async (id: string, code: string) => {
    const parts = id.split('-');
    const rolePrefix = parts[0] as 'REC' | 'BAR' | 'ADM' | 'MGR';
    const suffix = parts[1] || '';
    
    setSelectedRole(rolePrefix);
    setIdSuffix(suffix);
    setEnteredPin(code);
    setActiveField('pin');
    
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      await login(id, code);
    } catch (err) {
      setErrorMsg('Shortcut login failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={{ 
          flexGrow: 1, 
          justifyContent: 'space-between', 
          padding: 16,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 16,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Header Branding */}
        <View className="items-center mt-4">
          <Text className="text-[26px] font-extrabold text-gold tracking-widest uppercase">🍹 NFC BAR SYSTEM</Text>
          <Text className="text-[11px] text-muted tracking-wider uppercase mt-1">Enterprise Shift Management</Text>
        </View>

        {/* Credentials Form Box */}
        <View 
          className="bg-surface rounded-[20px] border border-white/5 shadow-2xl w-full max-w-[420px] self-center"
          style={{ padding: cardPadding, marginTop: cardMarginY, marginBottom: cardMarginY }}
        >
          
          {/* Error Message banner */}
          {errorMsg ? (
            <View className="bg-red/10 border border-red rounded-xl p-3 mb-4">
              <Text className="text-red text-xs text-center font-bold">⚠️ {errorMsg}</Text>
            </View>
          ) : null}

          {/* Role Segmented Controller */}
          <Text className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>1. Select Shift Role</Text>
          <View className="flex-row bg-input rounded-xl p-1 mb-5 gap-1">
            {(['REC', 'BAR', 'ADM', 'MGR'] as const).map(role => {
              const isSel = selectedRole === role;
              const roleLabels = { REC: 'Recep', BAR: 'Bar', ADM: 'Admin', MGR: 'Mngr' };
              return (
                <TouchableOpacity
                  key={role}
                  className={`flex-1 py-2.5 rounded-lg items-center justify-center min-h-[40px] ${isSel ? 'bg-gold' : 'bg-transparent'}`}
                  onPress={() => {
                    setSelectedRole(role);
                    setErrorMsg('');
                  }}
                  activeOpacity={0.8}
                >
                  <Text className="text-[11px] font-bold uppercase" style={{ color: isSel ? '#08090d' : '#9ca3af' }}>
                    {roleLabels[role]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Interactive Custom Form Display */}
          <Text className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>2. Enter Credentials</Text>
          <View className="flex-row gap-3 mb-5">
            {/* Employee ID Display */}
            <TouchableOpacity 
              className={`flex-1 bg-input border rounded-xl p-3 items-center justify-center min-h-[56px]
                ${activeField === 'id' ? 'border-gold' : 'border-white/5'}`}
              onPress={() => setActiveField('id')}
              activeOpacity={0.9}
            >
              <Text className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: '#9ca3af' }}>Employee ID</Text>
              <View className="flex-row items-center">
                <Text className="text-base font-extrabold" style={{ color: '#f0ede6' }}>
                  {selectedRole}-
                </Text>
                <Text className="text-base font-extrabold" style={{ color: idSuffix ? '#f0ede6' : 'rgba(156, 163, 175, 0.4)' }}>
                  {idSuffix || 'XX'}
                </Text>
                {activeField === 'id' && (
                  <View className="w-[2px] h-4 bg-gold ml-0.5" />
                )}
              </View>
            </TouchableOpacity>

            {/* PIN/Password Display */}
            <TouchableOpacity 
              className={`flex-1 bg-input border rounded-xl p-3 items-center justify-center min-h-[56px]
                ${activeField === 'pin' ? 'border-gold' : 'border-white/5'}`}
              onPress={() => setActiveField('pin')}
              activeOpacity={0.9}
            >
              <Text className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: '#9ca3af' }}>Shift PIN</Text>
              <View className="flex-row items-center">
                <Text className="text-base font-extrabold tracking-widest" style={{ color: '#f0ede6' }}>
                  {enteredPin ? '•'.repeat(enteredPin.length) : '••••'}
                </Text>
                {activeField === 'pin' && enteredPin.length < 4 && (
                  <View className="w-[2px] h-4 bg-gold ml-0.5" />
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* Custom Onscreen Numpad Grid Matrix */}
          <View className="flex-col gap-2 mb-4">
            {[
              ['1', '2', '3'],
              ['4', '5', '6'],
              ['7', '8', '9'],
              ['C', '0', '⌫']
            ].map((row, rowIndex) => (
              <View key={rowIndex} className="flex-row gap-2">
                {row.map(key => {
                  const isAction = key === 'C' || key === '⌫';
                  return (
                    <TouchableOpacity
                      key={key}
                      className={`flex-1 rounded-xl items-center justify-center border border-white/5
                        ${isAction ? 'bg-input' : 'bg-surface active:bg-input'}`}
                      style={{ height: numpadHeight }}
                      onPress={() => {
                        if (key === 'C') handleClear();
                        else if (key === '⌫') handleBackspace();
                        else handleKeyPress(key);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text className="text-base font-bold" style={{ color: key === 'C' ? '#e63946' : (key === '⌫' ? '#f5a623' : '#f0ede6') }}>
                        {key}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Remember device toggle */}
          <TouchableOpacity 
            className="flex-row items-center mb-5 mt-1 min-h-[44px]"
            onPress={() => setRememberMe(!rememberMe)}
            activeOpacity={0.8}
          >
            <View className={`w-5 h-5 rounded-md border border-muted justify-center items-center mr-2.5 ${rememberMe ? 'border-gold bg-gold' : ''}`}>
              {rememberMe && <Text className="text-xs font-bold" style={{ color: '#08090d' }}>✓</Text>}
            </View>
            <Text className="text-[13px] font-medium" style={{ color: '#9ca3af' }}>Remember this device</Text>
          </TouchableOpacity>

          {/* Submit Sign In Button */}
          <TouchableOpacity 
            className={`py-3.5 rounded-xl items-center justify-center min-h-[48px] shadow-lg
              ${(idSuffix.length !== 2 || enteredPin.length !== 4 || isSubmitting) ? 'bg-input' : 'bg-gold'}`}
            onPress={handleSignIn}
            disabled={idSuffix.length !== 2 || enteredPin.length !== 4 || isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#08090d" />
            ) : (
              <Text 
                className="font-extrabold text-[15px]" 
                style={{ color: (idSuffix.length !== 2 || enteredPin.length !== 4) ? '#9ca3af' : '#08090d' }}
              >
                Sign In Shift
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Collapsible Presets Chevron Tray */}
        <View className="w-full max-w-[420px] align-self-center mt-2">
          <TouchableOpacity 
            className="flex-row items-center justify-center py-2 bg-surface/40 rounded-xl border border-white/5 gap-2 min-h-[44px]"
            onPress={() => setShowPresets(!showPresets)}
            activeOpacity={0.8}
          >
            <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#9ca3af' }}>
              {showPresets ? 'Hide Shortcuts' : 'Show Staff Shortcuts'}
            </Text>
            <Text style={{ color: '#9ca3af', fontSize: 12 }}>
              {showPresets ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {showPresets && (
            <View className="bg-surface rounded-xl p-3 border border-white/5 mt-2 gap-2">
              <View className="flex-row flex-wrap justify-between gap-2">
                <TouchableOpacity className="w-[48%] bg-input border border-white/5 rounded-xl p-3 flex-row items-center gap-2 min-h-[48px]" onPress={() => handleQuickLogin('REC-01', '1234')}>
                  <Text className="text-base">👩‍💼</Text>
                  <Text className="text-themeText text-[10px] font-bold" style={{ color: '#f0ede6' }}>Sarah (Recep)</Text>
                </TouchableOpacity>
                <TouchableOpacity className="w-[48%] bg-input border border-white/5 rounded-xl p-3 flex-row items-center gap-2 min-h-[48px]" onPress={() => handleQuickLogin('BAR-02', '4321')}>
                  <Text className="text-base">🍹</Text>
                  <Text className="text-themeText text-[10px] font-bold" style={{ color: '#f0ede6' }}>John (Bar)</Text>
                </TouchableOpacity>
                <TouchableOpacity className="w-[48%] bg-input border border-white/5 rounded-xl p-3 flex-row items-center gap-2 min-h-[48px]" onPress={() => handleQuickLogin('ADM-03', '8888')}>
                  <Text className="text-base">🛡️</Text>
                  <Text className="text-themeText text-[10px] font-bold" style={{ color: '#f0ede6' }}>Alex (Admin)</Text>
                </TouchableOpacity>
                <TouchableOpacity className="w-[48%] bg-input border border-white/5 rounded-xl p-3 flex-row items-center gap-2 min-h-[48px]" onPress={() => handleQuickLogin('MGR-04', '9999')}>
                  <Text className="text-base">👑</Text>
                  <Text className="text-themeText text-[10px] font-bold" style={{ color: '#f0ede6' }}>Elena (Manager)</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;
