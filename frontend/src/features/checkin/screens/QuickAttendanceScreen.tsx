import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform 
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNfcBar } from '../../../context/NfcBarContext';
import { useTheme } from '../../../context/ThemeContext';
import { useResponsive } from '../../../utils/responsive';

export const QuickAttendanceScreen: React.FC = () => {
  const { colors, isDark } = useTheme();
  const { setScreen, showToast } = useNfcBar();
  const { width, height } = useResponsive();
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
        skipProcessing: Platform.OS === 'web' // skip extra processing if on web
      });

      if (!photo || !photo.uri) {
        showToast('Could not capture photo. Please try again.', 'danger');
        setIsSubmitting(false);
        setIsCameraActive(false);
        return;
      }

      // Build file payload
      const formData = new FormData();
      const filename = photo.uri.split('/').pop() || 'kiosk-capture.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      formData.append('file', {
        uri: photo.uri,
        name: filename,
        type
      } as any);

      // Call local backend Smart Attendance API
      const getBackendUrl = () => {
        const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
        if (envApiUrl && envApiUrl.trim().length > 0) {
          let cleaned = envApiUrl.trim();
          if (cleaned.endsWith('/')) {
            cleaned = cleaned.slice(0, -1);
          }
          if (Platform.OS === 'web' && !cleaned.endsWith('/api')) {
            cleaned = `${cleaned}/api`;
          }
          return cleaned;
        }
        return 'https://nfc-qr-code-production.up.railway.app/api';
      };

      const BACKEND_URL = getBackendUrl();
      const response = await fetch(`${BACKEND_URL}/attendance/quick`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || errorData.detail || 'Face not recognized. Please register first.';
        throw new Error(errorMsg);
      }

      const responseData = await response.json();
      setResult(responseData);
      setIsCameraActive(false);
      showToast(responseData.message || 'Attendance recorded successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Attendance verification failed.', 'danger', 5000);
      setIsCameraActive(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!permission || !permission.granted) {
    return (
      <View className="flex-grow items-center justify-center p-6 bg-black">
        <ActivityIndicator size="large" color="#D4AF37" />
        <Text className="text-white text-xs font-bold mt-4">Initializing Kiosk Camera...</Text>
      </View>
    );
  }

  const isCheckIn = result?.action === 'check-in';

  return (
    <View className="flex-1 bg-black relative">
      {result ? (
        // Clock-In/Out Success Details View
        <View className="flex-grow items-center justify-center p-6 bg-[#0B0D12]">
          <View className="bg-card border-2 border-[#22c55e]/20 rounded-3xl p-8 items-center justify-center max-w-[380px] w-full shadow-2xl">
            <View className="h-20 w-20 rounded-full bg-[#22c55e]/10 items-center justify-center mb-6">
              <Text style={{ fontSize: 40 }}>✅</Text>
            </View>
            
            <Text className="text-[#94A3B8] text-[10px] font-black uppercase tracking-widest mb-1">
              Attendance Verified
            </Text>
            
            <Text className="text-themeText text-xl font-black text-center mb-4" style={{ color: colors.text }}>
              {result.userName}
            </Text>

            <View className="flex-row items-center gap-2 mb-6">
              <View 
                className="px-3.5 py-1.5 rounded-full flex-row items-center gap-1.5" 
                style={{ backgroundColor: isCheckIn ? 'rgba(34,197,94,0.15)' : 'rgba(79,70,229,0.15)' }}
              >
                <Text style={{ fontSize: 12 }}>{isCheckIn ? '📥' : '📤'}</Text>
                <Text className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: isCheckIn ? '#22c55e' : '#6366f1' }}>
                  {isCheckIn ? 'Check In' : 'Check Out'}
                </Text>
              </View>
              <View className="px-3 py-1.5 rounded-full border border-border bg-input">
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
          <View className="absolute top-12 left-0 right-0 px-5 flex-row justify-between items-center z-10">
            <View className="flex-row items-center gap-1.5">
              <Text style={{ fontSize: 18 }}>🕒</Text>
              <Text className="text-white text-xs font-black uppercase tracking-wider">Kiosk Mode</Text>
            </View>
            <TouchableOpacity 
              className="px-4 py-2 border rounded-full bg-black/60"
              style={{ borderColor: 'rgba(255,255,255,0.2)' }}
              onPress={() => setScreen('login')}
            >
              <Text className="text-white text-[10px] font-bold uppercase tracking-wider">Return to Login</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-card border border-border rounded-3xl p-8 items-center justify-center max-w-[380px] w-full shadow-2xl">
            <View className="h-20 w-20 rounded-full bg-red/10 items-center justify-center mb-6">
              <Text style={{ fontSize: 40 }}>❌</Text>
            </View>
            <Text className="text-themeText text-lg font-black text-center mb-2" style={{ color: colors.text }}>
              Verification Stopped
            </Text>
            <Text className="text-muted text-xs text-center mb-6" style={{ color: colors.muted }}>
              Please look directly at the camera, ensure good lighting, and tap below to retry.
            </Text>
            <TouchableOpacity
              onPress={() => setIsCameraActive(true)}
              className="w-full py-3.5 rounded-xl items-center justify-center min-h-[48px]"
              style={{ backgroundColor: colors.gold }}
            >
              <Text className="text-black font-extrabold text-xs uppercase tracking-wider">Start Camera</Text>
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
                  borderColor: isSubmitting ? colors.gold : '#D4AF37',
                  borderStyle: isSubmitting ? 'solid' : 'dashed',
                  backgroundColor: 'transparent',
                  shadowColor: '#D4AF37',
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
          <View className="absolute top-12 left-0 right-0 px-5 flex-row justify-between items-center z-10">
            <View className="flex-row items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 border border-white/10">
              <Text style={{ fontSize: 14 }}>🕒</Text>
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
          <View className="absolute bottom-10 left-0 right-0 items-center px-6 z-10">
            <View className="px-4 py-1.5 rounded-full bg-black/70 border border-white/10 mb-4">
              <Text className="text-white/90 text-xs font-bold tracking-wide text-center">
                Center your face in the golden oval & tap to mark
              </Text>
            </View>
            
            <TouchableOpacity
              className="w-full max-w-[280px] py-4 rounded-full items-center justify-center min-h-[52px] shadow-2xl"
              style={{ 
                backgroundColor: isSubmitting ? '#4A4D55' : colors.gold,
                shadowColor: colors.gold,
                shadowOpacity: 0.35,
                shadowRadius: 12
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
                <Text className="text-[#0B0D12] text-xs font-black uppercase tracking-widest">
                  📷 MARK ATTENDANCE
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};
