import React, { useState, useRef, useEffect } from 'react';
import { Camera, CheckCircle2, AlertTriangle, UserCheck, Shield, Video, VideoOff } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const QuickAttendanceWebPage: React.FC = () => {
 const { showToast, isDark } = useAuth();
 const videoRef = useRef<HTMLVideoElement | null>(null);
 const canvasRef = useRef<HTMLCanvasElement | null>(null);

 const streamRef = useRef<MediaStream | null>(null);
 const cameraRequestIdRef = useRef(0);
 const [employeeCode, setEmployeeCode] = useState('');
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [attendanceResult, setAttendanceResult] = useState<any | null>(null);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [cameraActive, setCameraActive] = useState(false);

 const stopCameraInternal = () => {
 cameraRequestIdRef.current++;
 if (streamRef.current) {
 streamRef.current.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 streamRef.current = null;
 }

 if (videoRef.current && videoRef.current.srcObject) {
 try {
 const srcObj = videoRef.current.srcObject as MediaStream;
 if (srcObj && srcObj.getTracks) {
 srcObj.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 }
 videoRef.current.pause();
 videoRef.current.srcObject = null;
 } catch {}
 }

 setCameraActive(false);
 };

 const startCamera = async () => {
 stopCameraInternal();
 setErrorMessage(null);
 const requestId = ++cameraRequestIdRef.current;
 try {
 const mediaStream = await navigator.mediaDevices.getUserMedia({
 video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
 audio: false,
 });
 if (requestId !== cameraRequestIdRef.current) {
 mediaStream.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 return;
 }
 streamRef.current = mediaStream;
 setCameraActive(true);
 if (videoRef.current) {
 videoRef.current.srcObject = mediaStream;
 videoRef.current.play().catch(() => {});
 }
 showToast('Camera enabled successfully.', 'success');
 } catch (err: any) {
 setErrorMessage('Camera access required for facial attendance. Please check browser permissions.');
 stopCameraInternal();
 showToast('Failed to access camera.', 'danger');
 }
 };

 const stopCamera = () => {
 stopCameraInternal();
 showToast('Camera disabled.', 'info');
 };

 // Page visibility & window focus camera lifecycle management
 const cameraActiveRef = useRef(cameraActive);
 const shouldResumeRef = useRef(false);

 useEffect(() => {
 cameraActiveRef.current = cameraActive;
 }, [cameraActive]);

 useEffect(() => {
 const handleVisibilityChange = () => {
 if (document.hidden) {
 if (cameraActiveRef.current) {
 shouldResumeRef.current = true;
 stopCameraInternal();
 }
 } else {
 if (shouldResumeRef.current) {
 shouldResumeRef.current = false;
 startCamera();
 }
 }
 };

 const handleWindowBlur = () => {
 if (cameraActiveRef.current) {
 shouldResumeRef.current = true;
 stopCameraInternal();
 }
 };

 const handleWindowFocus = () => {
 if (shouldResumeRef.current) {
 shouldResumeRef.current = false;
 startCamera();
 }
 };

 document.addEventListener('visibilitychange', handleVisibilityChange);
 window.addEventListener('blur', handleWindowBlur);
 window.addEventListener('focus', handleWindowFocus);

 return () => {
 document.removeEventListener('visibilitychange', handleVisibilityChange);
 window.removeEventListener('blur', handleWindowBlur);
 window.removeEventListener('focus', handleWindowFocus);
 stopCameraInternal(); // stops on unmount
 };
 }, []);

 useEffect(() => {
 if (cameraActive && streamRef.current && videoRef.current) {
 videoRef.current.srcObject = streamRef.current;
 videoRef.current.play().catch(() => {});
 }
 }, [cameraActive]);

 const handleCaptureAndSubmit = async () => {
 if (isSubmitting || !cameraActive || !videoRef.current) return;

 setIsSubmitting(true);
 setErrorMessage(null);
 setAttendanceResult(null);

 try {
 const canvas = canvasRef.current || document.createElement('canvas');
 canvas.width = videoRef.current.videoWidth || 640;
 canvas.height = videoRef.current.videoHeight || 480;
 const ctx = canvas.getContext('2d');

 if (!ctx) {
 throw new Error('Failed to initialize image capture context.');
 }

 ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
 const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
 const base64Clean = dataUrl.replace(/^data:image\/\w+;base64,/, '');

 const res = await api.markQuickAttendance(base64Clean, employeeCode.trim() || undefined);

 if (res.success) {
 setAttendanceResult(res);
 showToast(res.message || `Attendance marked successfully (${res.action}).`, 'success');
 } else {
 const errorText = res.message || 'Attendance verification failed.';
 setErrorMessage(errorText);
 showToast(errorText, 'danger');
 }
 } catch (err: any) {
 const msg = err?.message || 'Unable to connect to attendance verification service.';
 setErrorMessage(msg);
 showToast(msg, 'danger');
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleReset = () => {
 setAttendanceResult(null);
 setErrorMessage(null);
 if (!cameraActive) {
 startCamera();
 }
 };

 return (
 <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
 <div className="glass-panel p-3 sm:p-5 rounded-3xl border border-border-main relative overflow-hidden">
 
 {/* Header Title & Camera Enable / Disable Controls */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 mb-3 pb-2.5 sm:mb-4 sm:pb-3 border-b border-border-main">
 <div className="flex items-start sm:items-center gap-2.5">
 <div className="w-9 h-9 rounded-xl dark:bg-amber-500/15 bg-amber-500/10 dark:text-amber-400 text-amber-700 flex items-center justify-center font-bold shrink-0">
 <UserCheck size={18} />
 </div>
 <div className="min-w-0">
 <h3 className="text-base font-bold text-text-main leading-tight truncate">FaceMark Quick Facial Attendance Kiosk</h3>
 <p className="text-[10px] text-text-muted truncate">Biometric facial recognition check-in & check-out</p>
 </div>
 </div>

 <div className="flex items-center justify-start sm:justify-end mt-1 sm:mt-0 shrink-0">
 <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-primary border border-border-main text-[10px] font-semibold text-text-muted">
 <Shield size={12} className="dark:text-[#D4AF37] text-primary" />
 <span>FaceMark AI</span>
 </div>
 </div>
 </div>

 {/* Video Camera View Box */}
 <div className={`relative rounded-2xl overflow-hidden aspect-video border border-border-main flex items-center justify-center max-h-[40vh] sm:max-h-[50vh] lg:max-h-none ${
 cameraActive ? 'bg-black' : 'bg-bg-primary'
 }`}>
 {cameraActive ? (
 <video
 ref={videoRef}
 autoPlay
 playsInline
 muted
 className="w-full h-full object-cover transform -scale-x-100"
 />
 ) : (
 <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
 <div className="w-12 h-12 rounded-full bg-bg-surface border border-border-main flex items-center justify-center text-text-muted">
 <VideoOff size={24} />
 </div>
 <p className="text-xs font-bold text-text-main">Camera is currently disabled</p>
 <p className="text-[10px] text-text-muted max-w-xs">Click the "Enable Camera" button below to turn on webcam for biometric attendance.</p>
 </div>
 )}

 {/* Hidden Canvas for Frame Capture */}
 <canvas ref={canvasRef} className="hidden" />

 {/* Scanning Reticle Frame Overlay */}
 {!attendanceResult && !errorMessage && cameraActive && (
 <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
 <div className="w-48 h-48 border-2 border-dashed dark:border-[#D4AF37]/60 border-primary/60 rounded-full animate-pulse flex items-center justify-center">
 <div className="w-40 h-40 border border-white/20 rounded-full" />
 </div>
 </div>
 )}

 {/* Result Card Overlay */}
 {attendanceResult && (
 <div className="absolute inset-0 dark:bg-black/80 bg-slate-900/40 p-5 flex flex-col items-center justify-center text-center space-y-3">
 <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
 attendanceResult.action === 'check-in' ? 'bg-emerald-500/20 dark:text-emerald-400 text-emerald-300 border border-emerald-500' : 'dark:bg-blue-500/20 bg-blue-500/10 dark:text-blue-300 text-blue-700 border dark:border-blue-500/40 border-blue-500/30'
 }`}>
 <CheckCircle2 size={28} />
 </div>

 <div className="w-full max-w-[90%] mx-auto">
 <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest inline-block ${
 attendanceResult.action === 'check-in' ? 'badge-active' : 'dark:bg-blue-500/20 bg-blue-500/10 dark:text-blue-300 text-blue-700 border dark:border-blue-500/40 border-blue-500/30'
 }`}>
 {attendanceResult.action}
 </span>
 <h3 className="text-lg font-black text-text-main mt-1.5 truncate px-2">{attendanceResult.userName || 'Employee Identified'}</h3>
 <p className="text-[10px] text-text-muted font-mono mt-0.5 truncate px-2">{attendanceResult.userEmail}</p>
 </div>

 {attendanceResult.confidence && (
 <div className="text-[10px] font-semibold dark:text-[#D4AF37] text-primary bg-bg-primary px-2.5 py-0.5 rounded-full border border-border-main">
 Confidence Score: {(attendanceResult.confidence * 100).toFixed(1)}%
 </div>
 )}

 <button
 onClick={handleReset}
 className="mt-2 px-6 py-2 rounded-xl primary-btn text-[10px] uppercase font-bold tracking-wider cursor-pointer"
 >
 Scan Next Employee
 </button>
 </div>
 )}

 {/* Error State Overlay */}
 {errorMessage && (
 <div className="absolute inset-0 dark:bg-black/85 bg-slate-900/45 p-5 flex flex-col items-center justify-center text-center space-y-3">
 <div className="w-12 h-12 rounded-full dark:bg-red-500/20 bg-red-500/10 border border-red-500 dark:text-red-400 text-red-700 flex items-center justify-center text-xl">
 <AlertTriangle size={24} />
 </div>

 <h4 className="text-sm font-bold dark:text-red-400 text-red-700">Attendance Verification Failed</h4>
 <p className="text-[10px] text-text-muted max-w-sm">{errorMessage}</p>

 <button
 onClick={handleReset}
 className="mt-2 px-6 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
 >
 Try Again
 </button>
 </div>
 )}
 </div>

 {/* Shutter Controls & Employee Code Option */}
 {!attendanceResult && !errorMessage && (
 <div className="mt-3 sm:mt-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 md:gap-3">
 <div className="w-full md:w-64 shrink-0">
 <label className="block md:hidden text-[10px] font-bold text-text-muted mb-1 uppercase tracking-wider ml-1">Manual Override</label>
 <input
 type="text"
 value={employeeCode}
 onChange={e => setEmployeeCode(e.target.value)}
 placeholder="Optional Employee ID (e.g. EMP-99)"
 className="w-full bg-bg-primary border border-border-main rounded-xl px-4 py-2.5 md:py-2 text-sm md:text-xs text-text-main placeholder-gray-500 focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary font-mono"
 />
 </div>

 <div className="flex flex-row flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-2.5 w-full md:w-auto">
 {!cameraActive ? (
 <button
 type="button"
 onClick={startCamera}
 className={`flex-1 md:w-auto px-4 md:px-6 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[11px] md:text-xs uppercase font-black tracking-wider transition-all cursor-pointer ${
 isDark ? 'primary-btn bg-emerald-500 text-text-main' : 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border border-emerald-500/30'
 }`}
 >
 <div className="nav-icon-badge">
 <Video size={14} />
 </div>
 <span>Enable Camera</span>
 </button>
 ) : (
 <button
 type="button"
 onClick={stopCamera}
 className="flex-1 md:w-auto px-3 sm:px-4 md:px-6 py-2.5 rounded-xl premium-btn-secondary cancellation-btn dark:text-red-400 text-red-700 dark:border-red-500/30 border-red-500/30 dark:bg-red-500/5 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-800 active:bg-red-500/25 active:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 flex items-center justify-center gap-1.5 text-[11px] md:text-xs uppercase font-bold tracking-wider transition-all cursor-pointer"
 >
 <div className="nav-icon-badge hidden sm:block">
 <VideoOff size={14} />
 </div>
 <span>Disable</span>
 </button>
 )}

 <button
 onClick={handleCaptureAndSubmit}
 disabled={isSubmitting || !cameraActive}
 title={isSubmitting ? "Verifying..." : !cameraActive ? "Enable camera first" : undefined}
 className="flex-1 md:w-auto px-3 sm:px-4 md:px-6 py-2.5 rounded-xl primary-btn flex items-center justify-center gap-1.5 text-[11px] md:text-xs uppercase font-black tracking-wider disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
 >
 <div className="nav-icon-badge hidden sm:block">
 <Camera size={14} />
 </div>
 <span>{isSubmitting ? 'Wait...' : 'Verify'}</span>
 <span className="hidden sm:inline"> Face</span>
 </button>
 </div>
 </div>
 )}
 </div>
 </div>
 );
};

