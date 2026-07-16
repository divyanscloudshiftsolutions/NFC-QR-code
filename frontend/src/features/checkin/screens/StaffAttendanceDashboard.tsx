import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet, TextInput, Alert, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertModal } from '../../../components/common/AlertModal';
import { useNfcBar } from '../../../context/NfcBarContext';
import { useTheme } from '../../../context/ThemeContext';
import { useResponsive } from '../../../utils/responsive';
import { CameraView, useCameraPermissions } from 'expo-camera';

export const StaffAttendanceDashboard: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const { colors, isDark } = useTheme();
  const { user, showToast, faceAttendanceMandatory, setScreen } = useNfcBar();
  const { isSmallPhone, height } = useResponsive();

  const [activeTab, setActiveTab] = useState<'me' | 'team' | 'settings'>('me');
  const [personalStats, setPersonalStats] = useState<any>(null);
  const [personalHistory, setPersonalHistory] = useState<any[]>([]);
  const [isLoadingPersonal, setIsLoadingPersonal] = useState(true);

  // Admin/Manager States
  const [adminSummary, setAdminSummary] = useState<any>(null);
  const [teamLogs, setTeamLogs] = useState<any[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Editing Log Modal States
  const [editingLog, setEditingLog] = useState<any>(null);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [editReason, setEditReason] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Manual Log States
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [manualUserId, setManualUserId] = useState('');
  const [manualCheckIn, setManualCheckIn] = useState('');
  const [manualCheckOut, setManualCheckOut] = useState('');
  const [allUsersList, setAllUsersList] = useState<any[]>([]);

  // Face Enrollment States
  const [enrollingUser, setEnrollingUser] = useState<any>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [showEnrollCamera, setShowEnrollCamera] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const enrollCameraRef = useRef<any>(null);
  const [isEnrollingFace, setIsEnrollingFace] = useState(false);

  // Settings States
  const [settings, setSettings] = useState<any>({
    shiftStart: '09:00',
    lateThreshold: '09:15',
    shiftEnd: '18:00',
    earlyLeaveThreshold: '17:00',
    minHalfDay: 4.0,
    minFullDay: 8.0,
    minOvertime: 9.0,
    faceMandatory: false,
    timezone: 'UTC'
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const canManageTeam = isAdmin || isManager;

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

  const fetchPersonalData = async () => {
    setIsLoadingPersonal(true);
    try {
      const activeToken = await AsyncStorage.getItem('nfc_bar_user_token');
      if (!activeToken) return;

      const sumRes = await fetch(`${BACKEND_URL}/attendance/me/summary`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        if (sumData.success) setPersonalStats(sumData.stats);
      }

      const histRes = await fetch(`${BACKEND_URL}/attendance/me/history`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (histRes.ok) {
        const histData = await histRes.json();
        if (histData.success) setPersonalHistory(histData.history);
      }
    } catch (err) {
      console.warn('Failed to load personal attendance data:', err);
    } finally {
      setIsLoadingPersonal(false);
    }
  };

  const fetchTeamData = async () => {
    if (!canManageTeam) return;
    setIsLoadingTeam(true);
    try {
      const activeToken = await AsyncStorage.getItem('nfc_bar_user_token');
      if (!activeToken) return;

      const sumRes = await fetch(`${BACKEND_URL}/attendance/admin/summary`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        if (sumData.success) setAdminSummary(sumData.summary);
      }

      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (roleFilter) params.append('role', roleFilter);
      if (statusFilter) params.append('status', statusFilter);

      const logsRes = await fetch(`${BACKEND_URL}/attendance/admin/logs?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        if (logsData.success) setTeamLogs(logsData.logs);
      }

      // Fetch all users list for manual check-in dropdown
      const usersRes = await fetch(`${BACKEND_URL}/users`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        if (usersData.success) setAllUsersList(usersData.users || []);
      }
    } catch (err) {
      console.warn('Failed to load team logs:', err);
    } finally {
      setIsLoadingTeam(false);
    }
  };

  const fetchSettingsData = async () => {
    if (!isAdmin) return;
    try {
      const activeToken = await AsyncStorage.getItem('nfc_bar_user_token');
      if (!activeToken) return;

      const res = await fetch(`${BACKEND_URL}/config/attendance-settings`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) setSettings(data.settings);
      }
    } catch (err) {
      console.warn('Failed to load settings:', err);
    }
  };

  useEffect(() => {
    if (isActive) {
      fetchPersonalData();
      if (canManageTeam) {
        fetchTeamData();
      }
      if (isAdmin) {
        fetchSettingsData();
      }
    }
  }, [isActive, searchQuery, roleFilter, statusFilter, activeTab]);

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const activeToken = await AsyncStorage.getItem('nfc_bar_user_token');
      const res = await fetch(`${BACKEND_URL}/config/attendance-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        showToast('Settings saved successfully.', 'success');
      } else {
        showToast('Failed to save settings.', 'danger');
      }
    } catch (err) {
      showToast('Connection failed.', 'danger');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleUpdateLog = async () => {
    if (!editingLog) return;
    setIsSavingEdit(true);
    try {
      const activeToken = await AsyncStorage.getItem('nfc_bar_user_token');
      const res = await fetch(`${BACKEND_URL}/attendance/admin/logs/${editingLog.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          checkInTime: editCheckIn,
          checkOutTime: editCheckOut || null,
          reason: editReason
        })
      });
      if (res.ok) {
        showToast('Attendance log updated successfully.', 'success');
        setEditingLog(null);
        fetchTeamData();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error?.message || 'Failed to update log.', 'danger');
      }
    } catch (err) {
      showToast('Connection error.', 'danger');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCreateManualLog = async () => {
    if (!manualUserId || !manualCheckIn) {
      showToast('Employee and Check-in time are required.', 'danger');
      return;
    }
    try {
      const activeToken = await AsyncStorage.getItem('nfc_bar_user_token');
      const res = await fetch(`${BACKEND_URL}/attendance/admin/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          userId: manualUserId,
          checkInTime: manualCheckIn,
          checkOutTime: manualCheckOut || null
        })
      });
      if (res.ok) {
        showToast('Manual attendance log created.', 'success');
        setIsCreatingManual(false);
        setManualUserId('');
        setManualCheckIn('');
        setManualCheckOut('');
        fetchTeamData();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error?.message || 'Failed to create manual log.', 'danger');
      }
    } catch (err) {
      showToast('Connection error.', 'danger');
    }
  };

  // Face enrollment photo capture
  const handleEnrollFaceCapture = async () => {
    if (isEnrollingFace || !enrollCameraRef.current) return;
    setIsEnrollingFace(true);

    try {
      const photo = await enrollCameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: true,
        skipProcessing: Platform.OS === 'web'
      });

      if (photo && photo.base64) {
        const nextImages = [...capturedImages, photo.base64];
        setCapturedImages(nextImages);

        if (nextImages.length >= 3) {
          // Upload all templates
          const activeToken = await AsyncStorage.getItem('nfc_bar_user_token');
          const res = await fetch(`${BACKEND_URL}/attendance/admin/enroll-face/${enrollingUser.id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${activeToken}`
            },
            body: JSON.stringify({ imagesBase64: nextImages })
          });

          if (res.ok) {
            showToast(`Face registered successfully for ${enrollingUser.fullName}!`, 'success');
          } else {
            showToast('Failed to register face templates.', 'danger');
          }

          setShowEnrollCamera(false);
          setEnrollingUser(null);
          setCapturedImages([]);
        } else {
          showToast(`Sample ${nextImages.length}/3 captured. Take another.`, 'warning');
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Capture failed.', 'danger');
    } finally {
      setIsEnrollingFace(false);
    }
  };

  const triggerFaceEnrollment = async (staffMember: any) => {
    if (!cameraPermission || !cameraPermission.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        showToast('Camera access required for face enrollment.', 'danger');
        return;
      }
    }
    setEnrollingUser(staffMember);
    setCapturedImages([]);
    setShowEnrollCamera(true);
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

  if (showEnrollCamera) {
    return (
      <View className="flex-1 bg-black justify-between">
        <View className="p-4 flex-row justify-between items-center bg-black/60 border-b border-white/10">
          <Text className="text-white text-sm font-bold">Enroll Face: {enrollingUser?.fullName}</Text>
          <TouchableOpacity
            onPress={() => { setShowEnrollCamera(false); setEnrollingUser(null); setCapturedImages([]); }}
            className="px-3 py-1.5 rounded-lg bg-white/10"
          >
            <Text className="text-white text-xs font-semibold">Cancel</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-1 items-center justify-center relative">
          <CameraView
            ref={enrollCameraRef}
            facing="front"
            style={{ width: '100%', height: '100%', position: 'absolute' }}
          />
          {/* Oval Guide Overlay */}
          <View className="absolute inset-0 items-center justify-center bg-black/30">
            <View
              style={{
                width: 240,
                height: 320,
                borderRadius: 160,
                borderWidth: 2,
                borderColor: '#D4AF37',
                borderStyle: 'dashed',
                backgroundColor: 'transparent'
              }}
            />
            <Text className="text-white/80 text-xs font-bold mt-4 text-center px-6">
              Take 3 photos from different angles ({capturedImages.length}/3 captured)
            </Text>
          </View>

          {isEnrollingFace && (
            <View className="absolute inset-0 bg-black/70 items-center justify-center">
              <ActivityIndicator size="large" color="#D4AF37" />
              <Text className="text-white text-xs font-semibold mt-4">Processing image...</Text>
            </View>
          )}
        </View>

        <View className="p-6 bg-black border-t border-white/10 items-center">
          <TouchableOpacity
            disabled={isEnrollingFace}
            onPress={handleEnrollFaceCapture}
            className="w-16 h-16 rounded-full border-4 border-white bg-[#D4AF37] items-center justify-center"
          >
            <View className="w-10 h-10 rounded-full bg-white/30" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 px-4 py-3" style={{ backgroundColor: colors.bg }}>
      
      {/* Title & Tabs */}
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-xl font-extrabold" style={{ color: colors.text }}>Shift Attendance</Text>
        
        <View className="flex-row bg-themeBg/10 rounded-lg p-1">
          <TouchableOpacity
            onPress={() => setActiveTab('me')}
            className={`px-3 py-1.5 rounded-md ${activeTab === 'me' ? 'bg-[#D4AF37]' : ''}`}
          >
            <Text className={`text-xs font-bold ${activeTab === 'me' ? 'text-black' : 'text-white/60'}`}>My Stats</Text>
          </TouchableOpacity>
          {canManageTeam && (
            <TouchableOpacity
              onPress={() => setActiveTab('team')}
              className={`px-3 py-1.5 rounded-md ${activeTab === 'team' ? 'bg-[#D4AF37]' : ''}`}
            >
              <Text className={`text-xs font-bold ${activeTab === 'team' ? 'text-black' : 'text-white/60'}`}>Team logs</Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity
              onPress={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-md ${activeTab === 'settings' ? 'bg-[#D4AF37]' : ''}`}
            >
              <Text className={`text-xs font-bold ${activeTab === 'settings' ? 'text-black' : 'text-white/60'}`}>Rules</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 1. PERSONAL VIEW */}
      {activeTab === 'me' && (
        <View>
          {isLoadingPersonal ? (
            <ActivityIndicator size="large" color="#D4AF37" className="my-10" />
          ) : (
            <View>
              {/* Stats Panel */}
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

              {/* History list */}
              <Text className="text-sm font-extrabold uppercase tracking-wider mb-2" style={{ color: colors.muted }}>My Shift History</Text>
              {personalHistory.length === 0 ? (
                <Text className="text-white/40 text-xs italic py-6">No shift attendance logs found.</Text>
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
      )}

      {/* 2. TEAM VIEW (Admin/Manager) */}
      {activeTab === 'team' && canManageTeam && (
        <View>
          {/* Quick stats */}
          <View className="flex-row justify-between mb-4">
            <View className="flex-1 p-3 rounded-xl border mr-2 items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <Text className="text-[8px] font-bold uppercase tracking-wider text-white/50">Present Today</Text>
              <Text className="text-base font-extrabold text-[#22c55e] mt-0.5">{adminSummary?.presentToday || 0}</Text>
            </View>
            <View className="flex-1 p-3 rounded-xl border mr-2 items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <Text className="text-[8px] font-bold uppercase tracking-wider text-white/50">Lates Today</Text>
              <Text className="text-base font-extrabold text-[#a855f7] mt-0.5">{adminSummary?.lateToday || 0}</Text>
            </View>
            <View className="flex-1 p-3 rounded-xl border items-center" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <Text className="text-[8px] font-bold uppercase tracking-wider text-white/50">Company %</Text>
              <Text className="text-base font-extrabold text-[#D4AF37] mt-0.5">{adminSummary?.companyAttendancePercentage || 0}%</Text>
            </View>
          </View>

          {/* Search/Filters */}
          <View className="mb-4">
            <TextInput
              placeholder="Search employee name..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{ backgroundColor: colors.surface, color: 'white', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, fontSize: 13 }}
            />
          </View>

          {/* Add Manual Log (Admin only) */}
          {isAdmin && !isCreatingManual && (
            <TouchableOpacity
              onPress={() => setIsCreatingManual(true)}
              className="py-2.5 bg-[#D4AF37] rounded-xl items-center mb-4 min-h-[44px] justify-center"
            >
              <Text className="text-black font-bold text-xs">Create Manual Shift Entry</Text>
            </TouchableOpacity>
          )}

          {/* Manual Entry Editor Panel */}
          {isCreatingManual && (
            <View className="p-4 border rounded-xl mb-4 gap-3" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <Text className="text-white text-xs font-bold uppercase tracking-wider">New Manual Log</Text>
              
              <TextInput
                placeholder="Target User UUID"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={manualUserId}
                onChangeText={setManualUserId}
                style={{ backgroundColor: colors.input, color: 'white', padding: 8, borderRadius: 8, fontSize: 12 }}
              />

              <TextInput
                placeholder="Check-In ISO (e.g. 2026-07-16T09:00:00Z)"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={manualCheckIn}
                onChangeText={setManualCheckIn}
                style={{ backgroundColor: colors.input, color: 'white', padding: 8, borderRadius: 8, fontSize: 12 }}
              />

              <TextInput
                placeholder="Check-Out ISO (optional)"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={manualCheckOut}
                onChangeText={setManualCheckOut}
                style={{ backgroundColor: colors.input, color: 'white', padding: 8, borderRadius: 8, fontSize: 12 }}
              />

              <View className="flex-row gap-2 mt-1">
                <TouchableOpacity onPress={handleCreateManualLog} className="flex-1 py-2 bg-emerald-600 rounded-lg items-center">
                  <Text className="text-white text-xs font-bold">Save</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsCreatingManual(false)} className="flex-1 py-2 bg-white/10 rounded-lg items-center">
                  <Text className="text-white text-xs font-bold">Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Logs table */}
          {isLoadingTeam ? (
            <ActivityIndicator size="large" color="#D4AF37" className="my-10" />
          ) : (
            <View>
              {teamLogs.map((log, index) => (
                <View key={index} className="p-3 border rounded-xl mb-3 gap-2" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                  <View className="flex-row justify-between items-center">
                    <View>
                      <Text className="text-sm font-bold text-white">{log.user?.fullName}</Text>
                      <Text className="text-[10px] text-white/50 capitalize">{log.role}</Text>
                    </View>
                    
                    {/* Face Enrollment Button */}
                    <TouchableOpacity
                      onPress={() => triggerFaceEnrollment(log.user)}
                      className="px-2.5 py-1.5 border border-dashed rounded-lg"
                      style={{ borderColor: colors.gold }}
                    >
                      <Text className="text-[9px] font-bold uppercase tracking-wider" style={{ color: colors.gold }}>Enroll Face</Text>
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row justify-between items-center border-t border-white/5 pt-2">
                    <View>
                      <Text className="text-[10px] text-white/60">In: {formatTime(log.checkInTime)}</Text>
                      <Text className="text-[10px] text-white/60 mt-0.5">Out: {formatTime(log.checkOutTime)}</Text>
                    </View>
                    
                    <TouchableOpacity
                      onPress={() => {
                        setEditingLog(log);
                        setEditCheckIn(log.checkInTime);
                        setEditCheckOut(log.checkOutTime || '');
                        setEditReason('');
                      }}
                      className="px-3 py-1 bg-white/10 rounded-lg"
                    >
                      <Text className="text-[10px] font-semibold text-white">Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* 3. SETTINGS VIEW (Admin only) */}
      {activeTab === 'settings' && isAdmin && (
        <View className="gap-4 pb-10">
          <Text className="text-sm font-extrabold uppercase tracking-wider" style={{ color: colors.muted }}>Shift Threshold Configuration</Text>
          
          <View>
            <Text className="text-xs text-white/60 mb-1">Shift Start Time (HH:MM)</Text>
            <TextInput
              value={settings.shiftStart}
              onChangeText={(text) => setSettings({ ...settings, shiftStart: text })}
              style={{ backgroundColor: colors.surface, color: 'white', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, fontSize: 13 }}
            />
          </View>

          <View>
            <Text className="text-xs text-white/60 mb-1">Late Arrival Buffer (HH:MM)</Text>
            <TextInput
              value={settings.lateThreshold}
              onChangeText={(text) => setSettings({ ...settings, lateThreshold: text })}
              style={{ backgroundColor: colors.surface, color: 'white', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, fontSize: 13 }}
            />
          </View>

          <View>
            <Text className="text-xs text-white/60 mb-1">Shift End Time (HH:MM)</Text>
            <TextInput
              value={settings.shiftEnd}
              onChangeText={(text) => setSettings({ ...settings, shiftEnd: text })}
              style={{ backgroundColor: colors.surface, color: 'white', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, fontSize: 13 }}
            />
          </View>

          {/* Toggle Face Attendance */}
          <TouchableOpacity
            onPress={() => setSettings({ ...settings, faceMandatory: !settings.faceMandatory })}
            className="flex-row justify-between items-center py-2.5"
          >
            <Text className="text-xs font-bold text-white">Face Attendance Mandatory</Text>
            <View className={`w-10 h-6 rounded-full p-1 ${settings.faceMandatory ? 'bg-[#D4AF37]' : 'bg-white/20'}`}>
              <View className={`w-4 h-4 rounded-full bg-black ${settings.faceMandatory ? 'translate-x-4' : ''}`} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={isSavingSettings}
            onPress={handleSaveSettings}
            className="py-3 bg-[#D4AF37] rounded-xl items-center mt-2 min-h-[48px] justify-center"
          >
            {isSavingSettings ? <ActivityIndicator size="small" color="black" /> : <Text className="text-black font-extrabold text-sm uppercase tracking-wider">Save Rules</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Editing Log Overlay Sheet */}
      {editingLog && (
        <AlertModal
          visible={!!editingLog}
          title="Edit Attendance Log"
          onClose={() => setEditingLog(null)}
        >
          <View className="gap-3">
            <Text className="text-xs text-white/60">Check-In Time</Text>
            <TextInput
              value={editCheckIn}
              onChangeText={setEditCheckIn}
              style={{ backgroundColor: colors.input, color: 'white', padding: 10, borderRadius: 10, fontSize: 12 }}
            />

            <Text className="text-xs text-white/60">Check-Out Time</Text>
            <TextInput
              value={editCheckOut}
              onChangeText={setEditCheckOut}
              placeholder="Check-out ISO date"
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={{ backgroundColor: colors.input, color: 'white', padding: 10, borderRadius: 10, fontSize: 12 }}
            />

            <Text className="text-xs text-white/60">Correction Reason (Required)</Text>
            <TextInput
              value={editReason}
              onChangeText={setEditReason}
              placeholder="e.g. forgot to checkout"
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={{ backgroundColor: colors.input, color: 'white', padding: 10, borderRadius: 10, fontSize: 12 }}
            />

            <View className="flex-row gap-2 mt-4">
              <TouchableOpacity
                disabled={isSavingEdit || !editReason}
                onPress={handleUpdateLog}
                className="flex-1 py-3 bg-emerald-600 rounded-xl items-center min-h-[48px] justify-center"
              >
                {isSavingEdit ? <ActivityIndicator size="small" color="white" /> : <Text className="text-white font-bold text-xs">Save Changes</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditingLog(null)}
                className="flex-1 py-3 bg-white/10 rounded-xl items-center min-h-[48px] justify-center"
              >
                <Text className="text-white font-bold text-xs">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </AlertModal>
      )}

    </ScrollView>
  );
};

