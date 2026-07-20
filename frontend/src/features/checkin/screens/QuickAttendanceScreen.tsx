import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform 
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNfcBar } from '../../../context/NfcBarContext';
import { useTheme } from '../../../context/ThemeContext';
import { useResponsive } from '../../../utils/responsive';
import { AppIcon } from '../../../components/common/AppIcon';

export const QuickAttendanceScreen: React.FC = () => {
  const { colors, isDark } = useTheme();
  const { setScreen, showToast } = useNfcBar();
  const { width, height } = useResponsive();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Auto-reset results view back to active camera after 5 seconds
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => {
      setResult(null);
      setIsCameraActive(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [result]);

  // Screen unmount cleanup to release camera device
  useEffect(() => {
    return () => {
      setIsCameraActive(false);
    };
  }, []);

  // Request camera permission on mount if not already granted
  useEffect(() => {
    (async () => {
      if (!permission || !permission.granted) {
        const res = await requestPermission();
        if (!res.granted) {
          Alert.alert(
            'Permission Required',
            'Camera access is required to use the Quick Attendance Kiosk.',
            [{ text: 'Return to Login', onPress: () => setScreen('login') }]
          );
        }
      }
    })();
  }, [permission]);

  const handleCaptureAndMark = async () => {
    if (isSubmitting || !cameraRef.current) return;
    setIsSubmitting(true);
    
    try {
      // Capture front camera frame
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: true,
        skipProcessing: Platform.OS === 'web'
      });

      if (!photo || !photo.base64) {
        throw new Error('Failed to capture frame from camera.');
      }

      // Send to Quick Attendance backend API
      const envApiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://nfc-qr-code-production.up.railway.app/api';
      const cleanApiUrl = envApiUrl.endsWith('/') ? envApiUrl.slice(0, -1) : envApiUrl;
      const endpoint = cleanApiUrl.endsWith('/api') ? `${cleanApiUrl}/attendance/quick` : `${cleanApiUrl}/api/attendance/quick`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoBase64: photo.base64 })
      });

      const data = await response.json();
      setIsSubmitting(false);

      if (response.ok && data.success) {
        setResult(data);
        setIsCameraActive(false);
        showToast(
          `Attendance marked successfully: ${data.userName} (${data.action})`,
          'success',
          5000
        );
      } else {
        const errDesc = data.error?.message || 'Biometric recognition failed. Please try again.';
        showToast(errDesc, 'danger', 5000);
      }
    } catch (err: any) {
      setIsSubmitting(false);
      showToast(
        err.message || 'Unable to connect to biometric verification service.',
        'danger',
        5000
      );
    }
  };

  if (!permission || !permission.granted) {
    return (
      <View className="flex-1 bg-black justify-center items-center p-6">
        <ActivityIndicator size="large" color="#FF9F1C" />
        <Text className="text-white text-xs font-bold mt-4">Initializing Kiosk Camera...</Text>
      </View>
    );
  }

  const isCheckIn = result?.action === 'check-in';

  return (
    <View className="flex-1 bg-black relative" style={{ paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(12, insets.bottom) }}>
      {result ? (
        // Clock-In/Out Success Details View
        <View className="flex-grow items-center justify-center p-6 bg-[#0B0D12]">
          <View className="bg-[#111318] border-2 border-[#10B981]/30 rounded-3xl p-8 items-center justify-center max-w-[380px] w-full shadow-2xl">
            <View className="h-20 w-20 rounded-full bg-[#10B981]/15 items-center justify-center mb-6 border border-[#10B981]/30">
              <AppIcon name="check" color="#10B981" size={36} />
            </View>
            
            <Text className="text-[#94A3B8] text-[10px] font-black uppercase tracking-widest mb-1">
              Attendance Verified
            </Text>
            
            <Text className="text-white text-xl font-black text-center mb-4">
              {result.userName}
            </Text>

            <View className="flex-row items-center gap-2 mb-6">
              <View 
                className="px-3.5 py-1.5 rounded-full flex-row items-center gap-1.5" 
                style={{ backgroundColor: isCheckIn ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)' }}
              >
                <AppIcon name={isCheckIn ? 'checkin' : 'clock'} color={isCheckIn ? '#10B981' : '#6366f1'} size={14} />
                <Text className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: isCheckIn ? '#10B981' : '#6366f1' }}>
                  {isCheckIn ? 'Check In' : 'Check Out'}
                </Text>
              </View>
              <View className="px-3 py-1.5 rounded-full border border-white/10 bg-[#171A22]">
                <Text className="text-muted text-[10px] font-extrabold" style={{ color: colors.muted }}>
                  {((result.confidence || 1.0) * 100).toFixed(1)}% Match
                </Text>
              </View>
            </View>

            <Text className="text-muted text-[11px] font-bold mb-4" style={{ color: colors.muted }}>
              {new Date(result.timestamp).toLocaleTimeString()} · {new Date(result.timestamp).toLocaleDateString()}
            </Text>

            <Text className="text-muted text-[10px] italic text-center" style={{ color: colors.muted }}>
              Resuming camera in a few seconds...
            </Text>
          </View>
        </View>
      ) : !isCameraActive ? (
        // Verification Stopped / Retry View
        <View className="flex-grow items-center justify-center p-6 bg-[#0B0D12]">
          {/* Top Floating Control Bar */}
          <View 
            className="absolute left-0 right-0 px-5 flex-row justify-between items-center z-10"
            style={{ top: Math.max(16, insets.top) }}
          >
            <View className="flex-row items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 border border-white/10">
              <AppIcon name="clock" color="#FF9F1C" size={14} />
              <Text className="text-white text-xs font-black uppercase tracking-wider">Kiosk Mode</Text>
            </View>
            <TouchableOpacity 
              className="px-4 py-2 border rounded-full bg-black/60 border-white/20 active:opacity-80"
              onPress={() => setScreen('login')}
            >
              <Text className="text-white text-[10px] font-bold uppercase tracking-wider">Return to Login</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-[#111318] border border-white/10 rounded-3xl p-8 items-center justify-center max-w-[380px] w-full shadow-2xl">
            <View className="h-20 w-20 rounded-full bg-[#EF4444]/15 items-center justify-center mb-6 border border-[#EF4444]/30">
              <AppIcon name="x" color="#EF4444" size={36} />
            </View>
            <Text className="text-white text-lg font-black text-center mb-2">
              Verification Stopped
            </Text>
            <Text className="text-muted text-xs text-center mb-6" style={{ color: colors.muted }}>
              Please look directly at the camera, ensure good lighting, and tap below to retry.
            </Text>
            <TouchableOpacity
              onPress={() => setIsCameraActive(true)}
              className="w-full py-3.5 rounded-xl items-center justify-center min-h-[48px] bg-[#FF9F1C]"
            >
              <Text className="text-[#08090D] font-extrabold text-xs uppercase tracking-wider">Start Camera</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        // Active Kiosk Camera Capture View
        <View className="flex-1 relative">
          {isCameraActive && (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              key="quick-attendance-camera"
            />
          )}

          {/* Transparent Circular/Oval Overlay Guide */}
          <View style={StyleSheet.absoluteFill} className="items-center justify-center">
            {/* Dark Mask Top */}
            <View style={{ flex: 1, width: '100%', backgroundColor: 'rgba(0,0,0,0.55)' }} />
            {/* Center Oval row */}
            <View className="flex-row items-center justify-center" style={{ height: 300 }}>
              <View style={{ flex: 1, height: '100%', backgroundColor: 'rgba(0,0,0,0.55)' }} />
              {/* Oval outline container */}
              <View 
                style={{ 
                  width: 240, 
                  height: 300, 
                  borderRadius: 150, 
                  borderWidth: 2.5, 
                  borderColor: isSubmitting ? '#FF9F1C' : '#FF9F1C',
                  borderStyle: isSubmitting ? 'solid' : 'dashed',
                  backgroundColor: 'transparent',
                  shadowColor: '#FF9F1C',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.4,
                  shadowRadius: 12,
                }} 
              />
              <View style={{ flex: 1, height: '100%', backgroundColor: 'rgba(0,0,0,0.55)' }} />
            </View>
            {/* Dark Mask Bottom */}
            <View style={{ flex: 1.4, width: '100%', backgroundColor: 'rgba(0,0,0,0.55)' }} />
          </View>

          {/* Top Floating Control Bar */}
          <View 
            className="absolute left-0 right-0 px-5 flex-row justify-between items-center z-10"
            style={{ top: Math.max(16, insets.top) }}
          >
            <View className="flex-row items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 border border-white/10">
              <AppIcon name="clock" color="#FF9F1C" size={14} />
              <Text className="text-white text-xs font-black uppercase tracking-wider">Kiosk Attendance</Text>
            </View>
            <TouchableOpacity 
              className="px-4 py-2 border rounded-full bg-black/70 border-white/20 active:opacity-80"
              onPress={() => setScreen('login')}
            >
              <Text className="text-white text-[11px] font-bold uppercase tracking-wider">Return to Login</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Floating Instructions & Capture Controls */}
          <View 
            className="absolute left-0 right-0 items-center px-6 z-10"
            style={{ bottom: Math.max(20, insets.bottom) }}
          >
            <View className="px-4 py-1.5 rounded-full bg-black/70 border border-white/10 mb-4">
              <Text className="text-white/90 text-xs font-bold tracking-wide text-center">
                Center your face in the golden oval & tap to mark
              </Text>
            </View>
            
            <TouchableOpacity
              className="w-full max-w-[280px] py-4 rounded-full flex-row items-center justify-center gap-2.5 min-h-[52px] shadow-2xl bg-[#FF9F1C]"
              style={{ 
                shadowColor: '#FF9F1C',
                shadowOpacity: 0.35,
                shadowRadius: 12,
                opacity: isSubmitting ? 0.6 : 1
              }}
              onPress={handleCaptureAndMark}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#0B0D12" />
                  <Text className="text-[#0B0D12] text-xs font-black uppercase tracking-wider">Verifying Face...</Text>
                </View>
              ) : (
                <>
                  <AppIcon name="camera" color="#0B0D12" size={18} />
                  <Text className="text-[#0B0D12] text-xs font-black uppercase tracking-widest">
                    MARK ATTENDANCE
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};
