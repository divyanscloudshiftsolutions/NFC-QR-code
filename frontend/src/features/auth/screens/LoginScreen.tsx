import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, 
  Platform, KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNfcBar } from '../../../context/NfcBarContext';
import { useTheme } from '../../../context/ThemeContext';
import { AppIcon } from '../../../components/common/AppIcon';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { useResponsive } from '../../../utils/responsive';

export const LoginScreen: React.FC = () => {
  const { login, setScreen, faceAttendanceMandatory } = useNfcBar();
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

  // Camera states
  const [showCamera, setShowCamera] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

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

  const handleCameraCaptureAndLogin = async () => {
    if (isSubmitting || !cameraRef.current) return;
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: true,
        skipProcessing: Platform.OS === 'web'
      });

      if (!photo || !photo.base64) {
        throw new Error('Failed to capture image. Please try again.');
      }

      const employeeId = `${selectedRole}-${idSuffix}`;
      const success = await login(employeeId, enteredPin, photo.base64);
      if (success) {
        setShowCamera(false);
      } else {
        setErrorMsg('Face verification failed. Incorrect PIN or face mismatch.');
        setShowCamera(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during face verification.');
      setShowCamera(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    if (idSuffix.length !== 2 || enteredPin.length !== 4) {
      setErrorMsg('Please enter a 2-digit ID suffix and a 4-digit PIN.');
      return;
    }

    setErrorMsg('');

    if (faceAttendanceMandatory) {
      if (!cameraPermission || !cameraPermission.granted) {
        const res = await requestCameraPermission();
        if (!res.granted) {
          setErrorMsg('Camera permission is required for face attendance.');
          return;
        }
      }
      setShowCamera(true);
      return;
    }

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

  const { colors, isDark } = useTheme();

  if (showCamera) {
    if (!cameraPermission || !cameraPermission.granted) {
      return (
        <View className="flex-1 items-center justify-center p-6 bg-black">
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text className="text-white text-xs font-bold mt-4">Requesting camera access...</Text>
          <TouchableOpacity 
            className="mt-6 px-6 py-3 bg-red-600 rounded-xl"
            onPress={() => setShowCamera(false)}
          >
            <Text className="text-white font-bold text-sm">Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View className="flex-grow bg-black justify-between" style={{ paddingTop: insets.top }}>
        <View className="px-5 py-3.5 flex-row justify-between items-center bg-black/80 border-b border-white/10">
          <View className="flex-row items-center gap-2">
            <Text style={{ fontSize: 16 }}>👤</Text>
            <Text className="text-white text-sm font-bold">Face Verification Required</Text>
          </View>
          <TouchableOpacity 
            onPress={() => setShowCamera(false)}
            className="px-3.5 py-1.5 rounded-full bg-white/15 active:opacity-80"
          >
            <Text className="text-white text-xs font-semibold">Cancel</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-1 items-center justify-center relative">
          <CameraView 
            ref={cameraRef}
            facing="front"
            style={{ width: '100%', height: '100%', position: 'absolute' }}
          />
          {/* Oval Guide Overlay */}
          <View className="absolute inset-0 items-center justify-center bg-black/45">
            <View 
              style={{
                width: 240,
                height: 300,
                borderRadius: 150,
                borderWidth: 2.5,
                borderColor: '#D4AF37',
                borderStyle: 'dashed',
                backgroundColor: 'transparent',
                shadowColor: '#D4AF37',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
              }}
            />
            <View className="mt-6 px-4 py-2 rounded-full bg-black/80 border border-white/10 shadow-lg">
              <Text className="text-white/90 text-xs font-bold text-center">
                Center your face in the golden oval & tap to log in
              </Text>
            </View>
          </View>

          {isSubmitting && (
            <View className="absolute inset-0 bg-black/75 items-center justify-center">
              <ActivityIndicator size="large" color="#D4AF37" />
              <Text className="text-white text-xs font-semibold mt-4">Verifying identity with FaceMark...</Text>
            </View>
          )}
        </View>

        <View className="p-6 bg-black border-t border-white/10 items-center">
          <TouchableOpacity
            disabled={isSubmitting}
            onPress={handleCameraCaptureAndLogin}
            className="w-18 h-18 rounded-full border-4 border-white bg-[#D4AF37] items-center justify-center shadow-xl active:opacity-85"
            style={{ width: 68, height: 68, opacity: isSubmitting ? 0.6 : 1 }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.35)' }} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      className="flex-1"
      style={{ backgroundColor: colors.bg }}
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
          <Text className="text-[26px] font-extrabold tracking-widest uppercase" style={{ color: colors.gold }}>🍹 NFC BAR SYSTEM</Text>
          <Text className="text-[11px] tracking-wider uppercase mt-1" style={{ color: colors.muted }}>Enterprise Shift Management</Text>
        </View>

        {/* Credentials Form Box */}
        <View 
          className="rounded-[20px] shadow-2xl w-full max-w-[420px] self-center"
          style={{ 
            padding: cardPadding, 
            marginTop: cardMarginY, 
            marginBottom: cardMarginY,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1
          }}
        >
          
          {/* Error Message banner */}
          {errorMsg ? (
            <View className="bg-red/10 border border-red rounded-xl p-3 mb-4">
              <Text className="text-red text-xs text-center font-bold">⚠️ {errorMsg}</Text>
            </View>
          ) : null}

          {/* Role Segmented Controller */}
          <Text className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: colors.muted }}>1. Select Shift Role</Text>
          <View className="flex-row rounded-xl p-1 mb-5 gap-1" style={{ backgroundColor: colors.secondarySurface, borderColor: colors.border, borderWidth: isDark ? 0 : 1 }}>
            {(['REC', 'BAR', 'ADM', 'MGR'] as const).map(role => {
              const isSel = selectedRole === role;
              const roleLabels = { REC: 'Recep', BAR: 'Bar', ADM: 'Admin', MGR: 'Mngr' };
              return (
                <TouchableOpacity
                  key={role}
                  className="flex-1 py-2.5 rounded-lg items-center justify-center min-h-[40px]"
                  style={isSel ? { backgroundColor: colors.gold } : {}}
                  onPress={() => {
                    setSelectedRole(role);
                    setErrorMsg('');
                  }}
                  activeOpacity={0.8}
                >
                  <Text className="text-[11px] font-bold uppercase" style={{ color: isSel ? colors.goldButtonText : colors.muted }}>
                    {roleLabels[role]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Interactive Custom Form Display */}
          <Text className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: colors.muted }}>2. Enter Credentials</Text>
          <View className="flex-row gap-3 mb-5">
            {/* Employee ID Display */}
            <TouchableOpacity 
              className="flex-1 border rounded-xl p-3 items-center justify-center min-h-[56px]"
              style={{
                backgroundColor: colors.secondarySurface,
                borderColor: activeField === 'id' ? colors.gold : colors.inputBorder,
                borderWidth: 1
              }}
              onPress={() => setActiveField('id')}
              activeOpacity={0.9}
            >
              <Text className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: colors.muted }}>Employee ID</Text>
              <View className="flex-row items-center">
                <Text className="text-base font-extrabold" style={{ color: colors.text }}>
                  {selectedRole}-
                </Text>
                <Text className="text-base font-extrabold" style={{ color: idSuffix ? colors.text : 'rgba(156, 163, 175, 0.4)' }}>
                  {idSuffix || 'XX'}
                </Text>
                {activeField === 'id' && (
                  <View className="w-[2px] h-4 ml-0.5" style={{ backgroundColor: colors.gold }} />
                )}
              </View>
            </TouchableOpacity>

            {/* PIN/Password Display */}
            <TouchableOpacity 
              className="flex-1 border rounded-xl p-3 items-center justify-center min-h-[56px]"
              style={{
                backgroundColor: colors.secondarySurface,
                borderColor: activeField === 'pin' ? colors.gold : colors.inputBorder,
                borderWidth: 1
              }}
              onPress={() => setActiveField('pin')}
              activeOpacity={0.9}
            >
              <Text className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: colors.muted }}>Shift PIN</Text>
              <View className="flex-row items-center">
                <Text className="text-base font-extrabold tracking-widest" style={{ color: colors.text }}>
                  {enteredPin ? '•'.repeat(enteredPin.length) : '••••'}
                </Text>
                {activeField === 'pin' && enteredPin.length < 4 && (
                  <View className="w-[2px] h-4 ml-0.5" style={{ backgroundColor: colors.gold }} />
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
                      className="flex-1 rounded-xl items-center justify-center border"
                      style={{ 
                        height: numpadHeight,
                        backgroundColor: isAction ? colors.input : colors.surface,
                        borderColor: colors.border,
                        borderWidth: 1
                      }}
                      onPress={() => {
                        if (key === 'C') handleClear();
                        else if (key === '⌫') handleBackspace();
                        else handleKeyPress(key);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text className="text-base font-bold" style={{ color: key === 'C' ? '#e63946' : (key === '⌫' ? colors.gold : colors.text) }}>
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
            <View 
              className="w-5 h-5 rounded-md border justify-center items-center mr-2.5"
              style={{
                borderColor: rememberMe ? colors.gold : colors.muted,
                backgroundColor: rememberMe ? colors.gold : 'transparent'
              }}
            >
              {rememberMe && <Text className="text-xs font-bold" style={{ color: colors.goldButtonText }}>✓</Text>}
            </View>
            <Text className="text-[13px] font-medium" style={{ color: colors.muted }}>Remember this device</Text>
          </TouchableOpacity>

          {/* Submit Sign In Button */}
          <TouchableOpacity 
            className="py-3.5 rounded-xl items-center justify-center min-h-[48px] shadow-lg border"
            style={{ 
              backgroundColor: (idSuffix.length !== 2 || enteredPin.length !== 4 || isSubmitting) ? colors.input : colors.gold,
              borderColor: (idSuffix.length !== 2 || enteredPin.length !== 4 || isSubmitting) ? colors.border : colors.gold
            }}
            onPress={handleSignIn}
            disabled={idSuffix.length !== 2 || enteredPin.length !== 4 || isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={colors.goldButtonText} />
            ) : (
              <Text 
                className="font-extrabold text-[15px]" 
                style={{ color: (idSuffix.length !== 2 || enteredPin.length !== 4) ? colors.muted : colors.goldButtonText }}
              >
                Sign In Shift
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Collapsible Presets Chevron Tray */}
        <View className="w-full max-w-[420px] align-self-center mt-2">
          <TouchableOpacity 
            className="flex-row items-center justify-center py-2 rounded-xl border gap-2 min-h-[44px]"
            style={{ 
              backgroundColor: isDark ? 'rgba(17,19,24,0.4)' : colors.surface,
              borderColor: colors.border,
              borderWidth: 1
            }}
            onPress={() => setShowPresets(!showPresets)}
            activeOpacity={0.8}
          >
            <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: colors.muted }}>
              {showPresets ? 'Hide Shortcuts' : 'Show Staff Shortcuts'}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {showPresets ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {showPresets && (
            <View className="rounded-xl p-3 border mt-2 gap-2" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
              <View className="flex-row flex-wrap justify-between gap-2">
                <TouchableOpacity className="w-[48%] border rounded-xl p-3 flex-row items-center gap-2 min-h-[48px]" style={{ backgroundColor: colors.input, borderColor: colors.border }} onPress={() => handleQuickLogin('REC-01', '1234')}>
                  <AppIcon name="user" color={colors.gold} size={16} />
                  <Text className="text-[10px] font-bold" style={{ color: colors.text }}>Sarah (Recep)</Text>
                </TouchableOpacity>
                <TouchableOpacity className="w-[48%] border rounded-xl p-3 flex-row items-center gap-2 min-h-[48px]" style={{ backgroundColor: colors.input, borderColor: colors.border }} onPress={() => handleQuickLogin('BAR-02', '4321')}>
                  <AppIcon name="bartender" color={colors.gold} size={16} />
                  <Text className="text-[10px] font-bold" style={{ color: colors.text }}>John (Bar)</Text>
                </TouchableOpacity>
                <TouchableOpacity className="w-[48%] border rounded-xl p-3 flex-row items-center gap-2 min-h-[48px]" style={{ backgroundColor: colors.input, borderColor: colors.border }} onPress={() => handleQuickLogin('ADM-03', '8888')}>
                  <AppIcon name="shield" color={colors.gold} size={16} />
                  <Text className="text-[10px] font-bold" style={{ color: colors.text }}>Alex (Admin)</Text>
                </TouchableOpacity>
                <TouchableOpacity className="w-[48%] border rounded-xl p-3 flex-row items-center gap-2 min-h-[48px]" style={{ backgroundColor: colors.input, borderColor: colors.border }} onPress={() => handleQuickLogin('MGR-04', '9999')}>
                  <AppIcon name="user" color={colors.gold} size={16} />
                  <Text className="text-[10px] font-bold" style={{ color: colors.text }}>Elena (Manager)</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Quick Attendance Kiosk Button */}
        <View className="w-full max-w-[420px] align-self-center mt-4 mb-6 px-4">
          <TouchableOpacity 
            className="w-full py-3.5 border border-dashed rounded-xl items-center justify-center min-h-[48px] flex-row gap-2"
            style={{ 
              borderColor: colors.gold,
              backgroundColor: isDark ? 'rgba(212,175,55,0.05)' : 'rgba(212,175,55,0.02)'
            }}
            onPress={() => setScreen('quick_attendance')}
            activeOpacity={0.8}
          >
            <AppIcon name="camera" color={colors.gold} size={18} />
            <Text className="font-extrabold text-[12px] uppercase tracking-wider" style={{ color: colors.gold }}>
              Quick Attendance Kiosk
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;
