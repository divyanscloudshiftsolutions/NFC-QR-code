import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, Alert, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNfcBar, getBackendUrl } from '../../../context/NfcBarContext';
import { useTheme } from '../../../context/ThemeContext';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AppIcon } from '../../../components/common/AppIcon';
import { SkeletonLoader } from '../../../components/common/SkeletonLoader';

export const StaffAttendanceDashboard: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const { colors, isDark } = useTheme();
  const { user, showToast, faceAttendanceMandatory } = useNfcBar();

  const [personalStats, setPersonalStats] = useState<any>(null);
  const [personalHistory, setPersonalHistory] = useState<any[]>([]);
  const [isLoadingPersonal, setIsLoadingPersonal] = useState(true);

  // Filter States
  const [historyFilter, setHistoryFilter] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Camera checkin/out states
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const dashboardCameraRef = useRef<any>(null);
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Live Timer states
  const [elapsedTimeStr, setElapsedTimeStr] = useState('00:00:00');

  const BACKEND_URL = getBackendUrl();

  const fetchPersonalData = async () => {
    setIsLoadingPersonal(true);
    try {
      const activeToken = await AsyncStorage.getItem('nfc_bar_user_token');
      if (!activeToken) return;

      // 1. Fetch Stats & Active Shift
      const sumRes = await fetch(`${BACKEND_URL}/attendance/me/summary`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        if (sumData.success) {
          setPersonalStats(sumData.stats);
        }
      }

      // 2. Fetch History with Filters
      const params = new URLSearchParams();
      params.append('filter', historyFilter);
      if (historyFilter === 'custom') {
        if (customStartDate) params.append('startDate', customStartDate);
        if (customEndDate) params.append('endDate', customEndDate);
      }

      const histRes = await fetch(`${BACKEND_URL}/attendance/me/history?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (histRes.ok) {
        const histData = await histRes.json();
        if (histData.success) {
          setPersonalHistory(histData.history);
        }
      }
    } catch (err) {
      console.warn('Failed to load personal stats/history:', err);
    } finally {
      setIsLoadingPersonal(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      fetchPersonalData();
    }
  }, [isActive, historyFilter, customStartDate, customEndDate]);

  useEffect(() => {
    return () => {
      setIsCameraActive(false);
    };
  }, [isActive]);

  // Live Timer Tick Hook
  useEffect(() => {
    let timerId: any;
    if (personalStats?.activeShift?.checkInTime) {
      const updateTimer = () => {
        const checkInMs = new Date(personalStats.activeShift.checkInTime).getTime();
        const diffSeconds = Math.max(0, Math.floor((Date.now() - checkInMs) / 1000));
        
        const hours = Math.floor(diffSeconds / 3600);
        const minutes = Math.floor((diffSeconds % 3600) / 60);
        const seconds = diffSeconds % 60;

        const pad = (n: number) => String(n).padStart(2, '0');
        setElapsedTimeStr(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
      };

      updateTimer();
      timerId = setInterval(updateTimer, 1000);
    } else {
      setElapsedTimeStr('00:00:00');
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [personalStats?.activeShift]);

  // Manual Check-In trigger
  const triggerManualCheckIn = () => {
    Alert.alert(
      'Check-In Confirmation',
      'Do you want to Check-In?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes', onPress: () => handleManualCheckInOutAPI('checkin') }
      ]
    );
  };

  // Manual Check-Out trigger
  const triggerManualCheckOut = () => {
    Alert.alert(
      'Check-Out Confirmation',
      'Do you want to Check-Out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes', onPress: () => handleManualCheckInOutAPI('checkout') }
      ]
    );
  };

  const handleManualCheckInOutAPI = async (type: 'checkin' | 'checkout') => {
    try {
      const activeToken = await AsyncStorage.getItem('nfc_bar_user_token');
      const res = await fetch(`${BACKEND_URL}/attendance/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(type === 'checkin' ? 'Successfully Checked In' : 'Successfully Checked Out', 'success');
        fetchPersonalData();
      } else {
        showToast(data.error?.message || 'Action failed', 'danger');
      }
    } catch (err) {
      showToast('Connection failed', 'danger');
    }
  };

  // Face Check-In/Check-Out Camera capture
  const startFaceVerification = async () => {
    if (!cameraPermission || !cameraPermission.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        showToast('Camera permission is required.', 'danger');
        return;
      }
    }
    setIsCameraActive(true);
  };

  // Face Check-In/Check-Out Camera capture
  const handleFaceCheckInOut = async (type: 'checkin' | 'checkout') => {
    if (isVerifyingFace || !dashboardCameraRef.current) return;
    setIsVerifyingFace(true);

    try {
      if (!cameraPermission || !cameraPermission.granted) {
        const res = await requestCameraPermission();
        if (!res.granted) {
          showToast('Camera permission is required.', 'danger');
          setIsVerifyingFace(false);
          setIsCameraActive(false);
          return;
        }
      }

      const photo = await dashboardCameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: true,
        skipProcessing: Platform.OS === 'web'
      });

      if (photo && photo.base64) {
        const activeToken = await AsyncStorage.getItem('nfc_bar_user_token');
        const res = await fetch(`${BACKEND_URL}/attendance/${type}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeToken}`
          },
          body: JSON.stringify({ photoBase64: photo.base64 })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast(type === 'checkin' ? 'Face check-in successful' : 'Face check-out successful', 'success');
          fetchPersonalData();
        } else {
          showToast(data.error?.message || 'Face verification failed', 'danger', 5000);
        }
      }
    } catch (err: any) {
      showToast('Unable to connect to the face verification service. Please check your internet connection and try again.', 'danger', 5000);
    } finally {
      setIsVerifyingFace(false);
      setIsCameraActive(false);
    }
  };

  const formatDate = (isoStr: string) => {
    if (!isoStr) return '-';
    const date = new Date(isoStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatTime = (isoStr: string) => {
    if (!isoStr) return '-';
    const date = new Date(isoStr);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const isCheckedIn = !!personalStats?.activeShift;

  return (
    <ScrollView className="flex-1 px-4 py-3" style={{ backgroundColor: colors.bg }}>
      <Text className="text-xl font-extrabold mb-4" style={{ color: colors.text }}>Shift Attendance</Text>

      {/* 1. CURRENT SHIFT STATUS VIEW */}
      <View className="p-4 border rounded-2xl mb-4 gap-3" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
        <Text className="text-[10px] font-bold uppercase tracking-wider text-white/50">Current Shift Status</Text>
        
        {isCheckedIn ? (
          <View>
            <Text className="text-base font-extrabold text-[#22c55e]">CHECKED IN</Text>
            <Text className="text-xs text-white/60 mt-1">In: {formatTime(personalStats.activeShift.checkInTime)}</Text>
            
            {/* Live timer display */}
            <View className="flex-row items-center mt-3 bg-black/30 p-2.5 rounded-xl self-start">
              <Text className="text-xs text-white/60 mr-2">Working Time:</Text>
              <Text className="text-sm font-black text-[#D4AF37]">{elapsedTimeStr}</Text>
            </View>
          </View>
        ) : (
          <View>
            <Text className="text-base font-extrabold text-white/40">CHECKED OUT</Text>
            <Text className="text-xs text-white/40 mt-1">No active shift running.</Text>
          </View>
        )}

        {/* Action checking triggers */}
        <View className="border-t border-white/5 pt-3 mt-1">
          {faceAttendanceMandatory ? (
            // Face camera clocking trigger
            <View className="gap-3">
              <Text className="text-xs font-bold text-white/80">Face Verification Mandatory</Text>
              
              {isCameraActive ? (
                <View className="gap-3">
                  <View className="h-[300px] w-full rounded-2xl overflow-hidden relative border border-white/10 bg-black">
                    <CameraView
                      ref={dashboardCameraRef}
                      facing="front"
                      style={{ width: '100%', height: '100%' }}
                    />
                    
                    {/* Oval overlay outline guide */}
                    <View className="absolute inset-0 items-center justify-center bg-black/40">
                      <View
                        style={{
                          width: 200,
                          height: 250,
                          borderRadius: 125,
                          borderWidth: 2.5,
                          borderColor: '#D4AF37',
                          borderStyle: 'dashed',
                          backgroundColor: 'transparent',
                          shadowColor: '#D4AF37',
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.35,
                          shadowRadius: 10,
                        }}
                      />
                    </View>

                    {isVerifyingFace && (
                      <View className="absolute inset-0 bg-black/85 justify-center items-center">
                        <ActivityIndicator size="small" color="#D4AF37" />
                        <Text className="text-white text-xs font-semibold mt-2">Verifying biometric template...</Text>
                      </View>
                    )}
                  </View>

                  <View className="flex-row gap-2.5">
                    <TouchableOpacity
                      disabled={isVerifyingFace}
                      accessibilityRole="button"
                      accessibilityLabel={isCheckedIn ? 'Capture photo for clock out' : 'Capture photo for clock in'}
                      accessibilityState={{ disabled: isVerifyingFace }}
                      onPress={() => handleFaceCheckInOut(isCheckedIn ? 'checkout' : 'checkin')}
                      className="flex-grow py-3.5 bg-[#FF9F1C] rounded-xl flex-row items-center justify-center gap-2 min-h-[48px] active:opacity-85 shadow-lg"
                    >
                      <AppIcon name="camera" color="#08090D" size={16} />
                      <Text className="text-[#08090D] font-black text-xs uppercase tracking-wider">
                        {isCheckedIn ? 'Capture Out' : 'Capture In'}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      disabled={isVerifyingFace}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel face camera"
                      onPress={() => setIsCameraActive(false)}
                      className="px-6 py-3.5 bg-white/10 rounded-xl items-center min-h-[48px] justify-center active:opacity-80"
                    >
                      <Text className="text-white font-extrabold text-xs uppercase tracking-wider">Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={startFaceVerification}
                  accessibilityRole="button"
                  accessibilityLabel={isCheckedIn ? 'Start Face Clock-Out verification' : 'Start Face Clock-In verification'}
                  className="py-3.5 bg-[#FF9F1C] rounded-xl flex-row items-center justify-center gap-2 min-h-[48px]"
                >
                  <AppIcon name="camera" color="#08090D" size={18} />
                  <Text className="text-[#08090D] font-black text-xs uppercase tracking-wider">
                    {isCheckedIn ? 'Start Face Clock-Out' : 'Start Face Clock-In'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            // Manual clocking trigger
            <View>
              {isCheckedIn ? (
                <TouchableOpacity
                  onPress={triggerManualCheckOut}
                  accessibilityRole="button"
                  accessibilityLabel="Close Attendance shift manually"
                  className="py-3 bg-red/20 border border-red/40 rounded-xl items-center min-h-[48px] justify-center"
                >
                  <Text className="text-red font-extrabold text-sm uppercase tracking-wider">Close Attendance</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={triggerManualCheckIn}
                  accessibilityRole="button"
                  accessibilityLabel="Register shift presence manually"
                  className="py-3 bg-emerald-600 rounded-xl items-center min-h-[48px] justify-center"
                >
                  <Text className="text-white font-extrabold text-sm uppercase tracking-wider">Yes, I am Present</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
 
      {/* 2. STATS CARDS PANEL */}
      <View className="flex-row flex-wrap justify-between mb-4">
        {[
          { label: 'Present Days', val: personalStats?.presentDays || 0, color: '#22c55e' },
          { label: 'Absent Days', val: personalStats?.absentDays || 0, color: '#ef4444' },
          { label: 'Half Days', val: personalStats?.halfDays || 0, color: '#f59e0b' },
          { label: 'Late Arrivals', val: personalStats?.lateArrivals || 0, color: '#a855f7' },
          { label: 'Early Leaves', val: personalStats?.earlyLeaves || 0, color: '#3b82f6' },
          { label: 'Total Hours', val: `${personalStats?.totalWorkingHours || 0}h`, color: '#D4AF37' }
        ].map((s, idx) => (
          <View key={idx} className="w-[30%] p-3 rounded-xl border mb-3" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <Text className="text-[10px] font-bold uppercase tracking-wider text-white/50">{s.label}</Text>
            <Text className="text-lg font-black mt-1" style={{ color: s.color }}>{s.val}</Text>
          </View>
        ))}
      </View>
 
      {/* 3. HISTORY FILTER LOG PANEL */}
      <View className="mb-4">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-sm font-extrabold uppercase tracking-wider" style={{ color: colors.muted }}>Shift History</Text>
          
          {/* History filter selectors */}
          <View className="flex-row bg-themeBg/10 rounded-lg p-1">
            {[
              { key: 'today', val: 'Today' },
              { key: 'week', val: 'Week' },
              { key: 'month', val: 'Month' },
              { key: 'custom', val: 'Range' }
            ].map(f => (
              <TouchableOpacity
                key={f.key}
                accessibilityRole="tab"
                accessibilityLabel={`Show history for ${f.val}`}
                accessibilityState={{ selected: historyFilter === f.key }}
                onPress={() => setHistoryFilter(f.key as any)}
                className={`px-2 py-1 rounded-md ${historyFilter === f.key ? 'bg-[#D4AF37]' : ''}`}
              >
                <Text className={`text-[10px] font-bold ${historyFilter === f.key ? 'text-black' : 'text-white/60'}`}>{f.val}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Custom date range picker input fields */}
        {historyFilter === 'custom' && (
          <View className="flex-row gap-2 mb-3">
            <TextInput
              placeholder="Start Date (YYYY-MM-DD)"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={customStartDate}
              onChangeText={setCustomStartDate}
              style={{ flex: 1, backgroundColor: colors.surface, color: 'white', padding: 8, borderRadius: 8, fontSize: 11, borderWidth: 1, borderColor: colors.border }}
            />
            <TextInput
              placeholder="End Date (YYYY-MM-DD)"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={customEndDate}
              onChangeText={setCustomEndDate}
              style={{ flex: 1, backgroundColor: colors.surface, color: 'white', padding: 8, borderRadius: 8, fontSize: 11, borderWidth: 1, borderColor: colors.border }}
            />
          </View>
        )}

        {isLoadingPersonal ? (
          <SkeletonLoader type="list-item" count={3} />
        ) : (
          <View>
            {personalHistory.length === 0 ? (
              <Text className="text-white/40 text-xs italic py-4">No shift attendance logs found.</Text>
            ) : (
              personalHistory.map((item, idx) => (
                <View key={idx} className="p-3 border rounded-xl mb-2 flex-row justify-between items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                  <View>
                    <Text className="text-xs font-bold text-white">{formatDate(item.checkInTime)}</Text>
                    <Text className="text-[10px] text-white/50 mt-0.5">
                      In: {formatTime(item.checkInTime)} | Out: {formatTime(item.checkOutTime)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <View className={`px-2 py-0.5 rounded-full ${item.primaryState === 'PRESENT' ? 'bg-[#22c55e]/20' : (item.primaryState === 'HALF_DAY' ? 'bg-[#f59e0b]/20' : 'bg-[#ef4444]/20')}`}>
                      <Text className={`text-[9px] font-bold ${item.primaryState === 'PRESENT' ? 'text-[#22c55e]' : (item.primaryState === 'HALF_DAY' ? 'text-[#f59e0b]' : 'text-[#ef4444]')}`}>
                        {item.primaryState}
                      </Text>
                    </View>
                    {item.isLate && <Text className="text-[8px] font-bold text-[#a855f7] mt-1">LATE ARRIVAL</Text>}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </View>

    </ScrollView>
  );
};
