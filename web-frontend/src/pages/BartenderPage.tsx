import React, { useState, useRef, useEffect } from 'react';
import { Wine, Search, RotateCcw, Camera, CheckCircle2, AlertCircle, RefreshCw, VideoOff, Clock, LogOut, Users, Mail, Phone, X, QrCode } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import jsQR from 'jsqr';
import type { Token } from '../types';

interface BartenderPageProps {
 activeTab: string;
 setActiveTab: (tab: string) => void;
}

export const BartenderPage: React.FC<BartenderPageProps> = ({ activeTab, setActiveTab }) => {
 const { showToast } = useAuth();
 const [tokenInput, setTokenInput] = useState('');
 const [scannedToken, setScannedToken] = useState<Token | null>(null);
 const [isVerifying, setIsVerifying] = useState(false);
 const [isRedeeming, setIsRedeeming] = useState(false);

 // Search Active Customer Sessions State
 const [activeTokens, setActiveTokens] = useState<Token[]>([]);
 const [searchQuery, setSearchQuery] = useState('');
 const [isLoadingTokens, setIsLoadingTokens] = useState(false);

 // Modal States
 const [extendingToken, setExtendingToken] = useState<Token | null>(null);
 const [closingToken, setClosingToken] = useState<Token | null>(null);
 const [extraMinutes, setExtraMinutes] = useState(60);
 const [additionalAmount, setAdditionalAmount] = useState(500);
 const [closeReason, setCloseReason] = useState('CHECKOUT');
 const [isSubmittingExtend, setIsSubmittingExtend] = useState(false);
 const [isSubmittingClose, setIsSubmittingClose] = useState(false);

 // Camera State
 const videoRef = useRef<HTMLVideoElement | null>(null);
 const activeStreamRef = useRef<MediaStream | null>(null);
 const cameraRequestIdRef = useRef(0);
 const lastScannedCodeRef = useRef<string | null>(null);
 const [cameraActive, setCameraActive] = useState(false);
 const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
 const [cameraError, setCameraError] = useState<string | null>(null);
 const [stream, setStream] = useState<MediaStream | null>(null);

 const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
 setCameraError(null);
 stopCamera();

 const requestId = ++cameraRequestIdRef.current;

 try {
 let mediaStream: MediaStream;
 try {
 mediaStream = await navigator.mediaDevices.getUserMedia({
 video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
 audio: false,
 });
 } catch {
 // Fallback to default system video input device (laptop webcam)
 mediaStream = await navigator.mediaDevices.getUserMedia({
 video: true,
 audio: false,
 });
 }

 if (requestId !== cameraRequestIdRef.current) {
 mediaStream.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 return;
 }

 activeStreamRef.current = mediaStream;
 setStream(mediaStream);
 setCameraActive(true);
 } catch {
 setCameraError('Camera access unavailable. Please grant browser camera permissions or use manual token verification.');
 setCameraActive(false);
 }
 };

 const stopCamera = () => {
 cameraRequestIdRef.current++;
 if (activeStreamRef.current) {
 activeStreamRef.current.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 activeStreamRef.current = null;
 }
 if (stream) {
 stream.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 setStream(null);
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

 const toggleFacingMode = () => {
 const nextMode = facingMode === 'user' ? 'environment' : 'user';
 setFacingMode(nextMode);
 if (cameraActive) {
 startCamera(nextMode);
 }
 };

 // Bind video stream whenever stream state or videoRef mounts
 useEffect(() => {
 if (cameraActive && stream && videoRef.current) {
 videoRef.current.srcObject = stream;
 videoRef.current.play().catch(() => {});
 }
 }, [cameraActive, stream]);

 // Automatically handle camera state based on activeTab
 useEffect(() => {
 if (activeTab === 'bartender/scan' && !scannedToken) {
 startCamera();
 } else {
 stopCamera();
 }
 return () => {
 stopCamera();
 };
 }, [activeTab, scannedToken]);

 // Frame-by-frame loop for QR code detection using jsQR
 useEffect(() => {
   let animationFrameId: number;
   let scanning = true;

   const scanFrame = () => {
     if (!scanning) return;

     if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
       const video = videoRef.current;
       const canvas = document.createElement('canvas');
       canvas.width = video.videoWidth;
       canvas.height = video.videoHeight;
       const ctx = canvas.getContext('2d');
       if (ctx) {
         ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
         const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
         const code = jsQR(imageData.data, imageData.width, imageData.height, {
           inversionAttempts: 'dontInvert',
         });

         if (code && code.data) {
           const decoded = code.data.trim();
           if (decoded && decoded !== lastScannedCodeRef.current) {
             lastScannedCodeRef.current = decoded;
             console.log("[Bartender QR Scanner] Decoded QR code:", decoded);
             handleVerify(undefined, decoded);

             // Allow scanning the same code again after 3 seconds if it was rejected/failed
             setTimeout(() => {
               if (lastScannedCodeRef.current === decoded) {
                 lastScannedCodeRef.current = null;
               }
             }, 3000);
           }
         }
       }
     }

     animationFrameId = requestAnimationFrame(scanFrame);
   };

   if (cameraActive && activeTab === 'bartender/scan' && !scannedToken) {
     scanning = true;
     animationFrameId = requestAnimationFrame(scanFrame);
   }

   return () => {
     scanning = false;
     cancelAnimationFrame(animationFrameId);
   };
 }, [cameraActive, activeTab, scannedToken]);

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
 stopCamera();
 }
 } else {
 if (shouldResumeRef.current) {
 shouldResumeRef.current = false;
 if (activeTab === 'bartender/scan' && !scannedToken) {
 startCamera();
 }
 }
 }
 };

 const handleWindowBlur = () => {
 if (cameraActiveRef.current) {
 shouldResumeRef.current = true;
 stopCamera();
 }
 };

 const handleWindowFocus = () => {
 if (shouldResumeRef.current) {
 shouldResumeRef.current = false;
 if (activeTab === 'bartender/scan' && !scannedToken) {
 startCamera();
 }
 }
 };

 document.addEventListener('visibilitychange', handleVisibilityChange);
 window.addEventListener('blur', handleWindowBlur);
 window.addEventListener('focus', handleWindowFocus);

 return () => {
 document.removeEventListener('visibilitychange', handleVisibilityChange);
 window.removeEventListener('blur', handleWindowBlur);
 window.removeEventListener('focus', handleWindowFocus);
 };
 }, [activeTab, scannedToken]);

 // Component unmount stream cleanup
 useEffect(() => {
 return () => {
 cameraRequestIdRef.current++;
 if (activeStreamRef.current) {
 activeStreamRef.current.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 activeStreamRef.current = null;
 }
 if (stream) {
 stream.getTracks().forEach(track => {
 try {
 track.enabled = false;
 track.stop();
 } catch {}
 });
 }
 };
 }, []);

 // Fetch active tokens on mount
 const fetchActiveTokens = async () => {
 setIsLoadingTokens(true);
 try {
 const tokensList = await api.getActiveTokens();
 setActiveTokens(tokensList);
 } catch (err) {
 console.error('Failed to fetch active tokens:', err);
 } finally {
 setIsLoadingTokens(false);
 }
 };

 useEffect(() => {
 fetchActiveTokens();
 }, []);

 const handleVerify = async (e?: React.FormEvent, customCode?: string) => {
 if (e) e.preventDefault();
 const query = customCode || tokenInput.trim();
 if (!query) return;

 setIsVerifying(true);
 setScannedToken(null);

 try {
 const res = await api.verifyQR(query);
 if (res.success && res.token) {
 setScannedToken(res.token);
 showToast(`Token #${res.token.tokenNumber} verified successfully!`, 'success');
 stopCamera(); // Stop camera once successfully verified
 } else {
 showToast('Token QR verification failed.', 'danger');
 }
 } catch (err: any) {
 showToast(err.message || 'Token verification failed. Invalid or expired token.', 'danger');
 } finally {
 setIsVerifying(false);
 }
 };

 const handleRedeem = async () => {
 if (!scannedToken) return;

 setIsRedeeming(true);
 try {
 const res = await api.redeemDrink(scannedToken.id);
 if (res.success) {
 showToast('Drink redemption recorded successfully!', 'success');
 setScannedToken(prev => prev ? { 
 ...prev, 
 redemptionsUsed: (prev.redemptionsUsed || 0) + 1 
 } : null);
 fetchActiveTokens(); // Refresh background list
 }
 } catch (err: any) {
 showToast(err.message || 'Redemption failed. All drink quotas used or session closed.', 'danger');
 } finally {
 setIsRedeeming(false);
 }
 };

 const handleRedeemForToken = async (token: Token) => {
 setIsRedeeming(true);
 try {
 const res = await api.redeemDrink(token.id);
 if (res.success) {
 showToast(`Drink redemption recorded for ${token.customer?.name || 'Guest'}.`, 'success');
 fetchActiveTokens(); // Refresh list
 if (scannedToken?.id === token.id) {
 setScannedToken(prev => prev ? { 
 ...prev, 
 redemptionsUsed: (prev.redemptionsUsed || 0) + 1 
 } : null);
 }
 }
 } catch (err: any) {
 showToast(err.message || 'Redemption failed. All drink quotas used or session closed.', 'danger');
 } finally {
 setIsRedeeming(false);
 }
 };

 const handleUndo = async () => {
 if (!scannedToken) return;
 try {
 const res = await api.undoRedeem(scannedToken.id);
 if (res.success) {
 showToast('Drink redemption reverted successfully.', 'info');
 setScannedToken(prev => prev ? { 
 ...prev, 
 redemptionsUsed: Math.max(0, (prev.redemptionsUsed || 0) - 1) 
 } : null);
 fetchActiveTokens(); // Refresh background list
 }
 } catch (err: any) {
 showToast(err.message || 'Failed to revert drink redemption.', 'danger');
 }
 };

 // Close/Checkout modal submit handler
 const handleCloseSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!closingToken) return;
 setIsSubmittingClose(true);
 try {
 await api.closeToken(closingToken.tokenNumber, closeReason);
 showToast(`Session ${closingToken.tokenNumber} checked out successfully.`, 'success');
 setClosingToken(null);
 fetchActiveTokens();
 if (scannedToken?.tokenNumber === closingToken.tokenNumber) {
 setScannedToken(null);
 }
 } catch (err: any) {
 showToast(err.message || 'Checkout failed.', 'danger');
 } finally {
 setIsSubmittingClose(false);
 }
 };

 // Extend modal submit handler
 const handleExtendSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!extendingToken) return;
 setIsSubmittingExtend(true);
 try {
 await api.extendToken(extendingToken.tokenNumber, extraMinutes, additionalAmount);
 showToast(`Session ${extendingToken.tokenNumber} extended by ${extraMinutes} mins.`, 'success');
 setExtendingToken(null);
 fetchActiveTokens();
 if (scannedToken?.tokenNumber === extendingToken.tokenNumber) {
 setScannedToken(prev => prev ? { 
 ...prev, 
 expiresAt: new Date(new Date(prev.expiresAt || prev.endTime).getTime() + extraMinutes * 60000).toISOString(),
 endTime: new Date(new Date(prev.endTime).getTime() + extraMinutes * 60000).toISOString()
 } : null);
 }
 } catch (err: any) {
 showToast(err.message || 'Extension failed.', 'danger');
 } finally {
 setIsSubmittingExtend(false);
 }
 };

 // Filter Tokens list based on search query
 const filteredTokens = searchQuery.trim() === '' 
 ? activeTokens 
 : activeTokens.filter(tk => {
 const name = (tk.customer?.name || '').toLowerCase();
 const phone = (tk.customer?.phoneNumber || '').toLowerCase();
 const email = (tk.customer?.email || '').toLowerCase();
 const tokenNum = (tk.tokenNumber || '').toLowerCase();
 const q = searchQuery.toLowerCase();
 return name.includes(q) || phone.includes(q) || email.includes(q) || tokenNum.includes(q);
 });

 const getSessionDuration = (createdAtStr: string) => {
 const created = new Date(createdAtStr).getTime();
 const now = new Date().getTime();
 const diffMs = now - created;
 if (diffMs < 0) return '0m';
 const diffMins = Math.floor(diffMs / 60000);
 if (diffMins < 60) return `${diffMins}m`;
 const diffHours = Math.floor(diffMins / 60);
 const mins = diffMins % 60;
 return `${diffHours}h ${mins}m`;
 };

 const isScanTab = activeTab !== 'bartender/checkins';

 // Scanned Token redemptions helper
 const redemptionsUsed = scannedToken ? (scannedToken.redemptionsUsed || 0) : 0;
 const totalAllowed = scannedToken ? (scannedToken.totalRedemptionsAllowed || 2) : 2;
 const isQuotaDepleted = redemptionsUsed >= totalAllowed;

 return (
 <div className="max-w-6xl mx-auto space-y-6">
 
 {/* Header Banner */}
 <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-border-main flex flex-wrap items-center justify-between gap-4">
 <div className="flex items-center gap-3">
 <div className="w-12 h-12 rounded-2xl dark:bg-amber-500/15 bg-amber-500/10 dark:text-amber-400 text-amber-700 flex items-center justify-center font-bold text-xl">
 <Wine size={24} />
 </div>
 <div>
 <h2 className="text-xl font-bold text-text-main tracking-wide">Bartender Service Station</h2>
 <p className="text-xs text-text-muted">
 {isScanTab 
 ? "Scan guest QR pass or enter token manually to verify and redeem drink quota" 
 : "Manage and search active guest check-in sessions with quick action tools"}
 </p>
 </div>
 </div>

 {isScanTab && (
 <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
 {cameraActive && (
 <button
 onClick={toggleFacingMode}
 className="flex-1 sm:flex-none justify-center px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all premium-btn-secondary"
 title="Switch Camera Source"
 >
 <div className="nav-icon-badge">
 <RefreshCw size={12} />
 </div>
 <span className="hidden sm:inline">{facingMode === 'user' ? 'Laptop Webcam' : 'External Scanner'}</span>
 <span className="sm:hidden">Switch Cam</span>
 </button>
 )}

 {!cameraActive ? (
 <button
 onClick={() => startCamera(facingMode)}
 className="flex-1 sm:flex-none justify-center px-4 py-2 rounded-xl primary-btn bg-emerald-500 text-xs font-bold transition-all flex items-center gap-1.5"
 >
 <div className="nav-icon-badge">
 <Camera size={14} />
 </div>
 <span>Enable Camera Scanner</span>
 </button>
 ) : (
 <button
 onClick={stopCamera}
 className="flex-1 sm:flex-none justify-center px-4 py-2 rounded-xl premium-btn-secondary cancellation-btn dark:text-red-400 text-red-700 dark:border-red-500/30 border-red-500/30 dark:bg-red-500/5 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-800 active:bg-red-500/25 active:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
 >
 <div className="nav-icon-badge">
 <VideoOff size={14} />
 </div>
 <span className="hidden sm:inline">Stop Camera Scanner</span>
 <span className="sm:hidden">Stop Cam</span>
 </button>
 )}
 </div>
 )}

 {!isScanTab && (
 <button 
 onClick={fetchActiveTokens}
 className="w-full sm:w-auto justify-center px-4 py-2 rounded-xl premium-btn-secondary text-xs font-bold transition-all flex items-center gap-1.5 mt-2 sm:mt-0"
 >
 <RefreshCw size={14} className={isLoadingTokens ? 'animate-spin' : ''} />
 <span>Sync Sessions ({activeTokens.length})</span>
 </button>
 )}
 </div>

 {/* ======================================================== */}
 {/* 1. QR SCAN TAB */}
 {/* ======================================================== */}
 {isScanTab && (
 <div className="max-w-xl mx-auto">
 {!scannedToken ? (
 /* Pass Verification Terminal Panel */
 <div className="glass-panel p-3 sm:p-6 rounded-3xl border border-border-main space-y-4 sm:space-y-6 animate-fadeIn">
 <div className="flex items-center justify-between pb-3 border-b border-border-main">
 <h3 className="text-sm font-bold uppercase text-text-main tracking-wider">Pass Verification Terminal</h3>
 <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider">QR Code Reader</span>
 </div>

 {/* Camera View / Reticle Box */}
 <div className={`relative rounded-2xl overflow-hidden border border-border-main aspect-video flex flex-col items-center justify-center ${
 cameraActive ? 'bg-black' : 'bg-bg-primary'
 }`}>
 {cameraActive ? (
 <>
  <video 
  ref={videoRef} 
  autoPlay 
  playsInline 
  muted 
  className="w-full h-full object-cover" 
  />
  <div className="absolute inset-0 pointer-events-none z-10">
    {/* Ambient Scanning Line across the full view */}
    <div className="absolute left-0 right-0 h-[2px] bg-emerald-500/60 top-1/2 -translate-y-1/2 shadow-[0_0_12px_#10B981] animate-pulse" />
    
    {/* Smart Full-Frame Corner Brackets */}
    <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-emerald-400 rounded-tl-lg" />
    <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-emerald-400 rounded-tr-lg" />
    <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-emerald-400 rounded-bl-lg" />
    <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-emerald-400 rounded-br-lg" />

    {/* Ambient Text Identifier */}
    <div className="absolute top-4 left-12 bg-black/60 px-2 py-0.5 rounded-md border border-white/10">
      <span className="text-[9px] text-emerald-400 font-black uppercase tracking-wider">Full-Frame Auto Scanner</span>
    </div>

    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 w-[90%] sm:w-max px-4 py-1.5 rounded-full border border-border-main flex items-center justify-center">
      <p className="text-[10px] text-text-main font-extrabold uppercase tracking-widest text-center leading-tight">
        Place QR Code anywhere in the camera view
      </p>
    </div>
  </div>
 </>
 ) : (
 <div className="text-center p-6 space-y-3">
 <Camera className="mx-auto text-text-muted" size={40} />
 <p className="text-xs text-text-muted">Click &quot;Enable Camera Scanner&quot; above to activate live QR scanner</p>
 {cameraError && (
 <p className="text-xs dark:text-amber-400 text-amber-700 font-semibold">{cameraError}</p>
 )}
 </div>
 )}
 </div>

 {/* Manual Token Lookup Form */}
 <form onSubmit={handleVerify} className="space-y-2 sm:space-y-3 pt-1 sm:pt-2">
 <label className="block text-[11px] sm:text-xs font-semibold text-text-muted">Or Enter Token Code Manually</label>
 <div className="flex flex-row gap-2 sm:gap-3">
 <div className="relative flex-1 w-full">
 <Search className="absolute left-3.5 top-3 text-text-muted" size={18} />
 <input
 type="text"
 value={tokenInput}
 onChange={e => setTokenInput(e.target.value.toUpperCase())}
 placeholder="e.g. TKB-0104"
 className="w-full bg-bg-primary border border-border-main rounded-xl pl-10 pr-4 py-2.5 text-base md:text-sm text-text-main font-mono placeholder-gray-500 focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
 />
 </div>

 <button
 type="submit"
 disabled={isVerifying || !tokenInput.trim()}
 title={isVerifying ? "Verifying..." : !tokenInput.trim() ? "Enter pass code" : undefined}
 className="px-4 sm:px-6 py-2.5 rounded-xl primary-btn text-[11px] sm:text-xs font-black uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
 >
 {isVerifying ? 'Verifying...' : 'Verify Pass'}
 </button>
 </div>
 </form>
 </div>
 ) : (
 /* Verified Guest Pass Summary Panel */
 <div className="glass-panel p-3 sm:p-6 rounded-3xl border border-border-main space-y-4 sm:space-y-6 animate-fadeIn">
 <div className="flex items-center justify-between pb-3 border-b border-border-main">
 <h3 className="text-sm font-bold uppercase text-text-main tracking-wider">Verified Guest Pass Summary</h3>
 <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider">Redemption Console</span>
 </div>

 {/* Token Number & Status Header */}
 <div className="p-3 sm:p-4 rounded-2xl bg-bg-primary border border-border-main flex flex-row items-center justify-between gap-3 sm:gap-0">
 <div>
 <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">Token Pass</span>
 <span className="font-mono text-2xl font-black text-text-main break-all">{scannedToken.tokenNumber}</span>
 </div>

 <span
 className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
 isQuotaDepleted
 ? 'dark:bg-red-500/20 bg-red-500/10 dark:text-red-300 text-red-700 border dark:border-red-500/40 border-red-500/30'
 : 'dark:bg-emerald-500/20 bg-emerald-500/10 dark:text-emerald-300 text-emerald-700 border dark:border-emerald-500/40 border-emerald-500/30'
 }`}
 >
 {isQuotaDepleted ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
 <span>{isQuotaDepleted ? 'QUOTA DEPLETED' : 'ACTIVE PASS'}</span>
 </span>
 </div>

 {/* Guest Details */}
 <div className="space-y-1.5 sm:space-y-2 text-xs">
 <div className="flex justify-between items-center p-2.5 sm:p-3 rounded-xl bg-bg-primary border border-border-main gap-2">
 <span className="text-text-muted shrink-0">Guest Name:</span>
 <span className="font-bold text-text-main text-sm truncate flex-1 text-right">{scannedToken.customer?.name || 'Walk-in Guest'}</span>
 </div>

 <div className="flex justify-between items-center p-2.5 sm:p-3 rounded-xl bg-bg-primary border border-border-main gap-2">
 <span className="text-text-muted shrink-0">Phone Contact:</span>
 <span className="font-mono text-text-muted truncate flex-1 text-right">{scannedToken.customer?.phoneNumber || '—'}</span>
 </div>

 <div className="flex justify-between items-center p-2.5 sm:p-3 rounded-xl bg-bg-primary border border-border-main gap-2">
 <span className="text-text-muted shrink-0">Email Contact:</span>
 <span className="font-mono text-text-muted truncate flex-1 text-right" title={scannedToken.customer?.email}>{scannedToken.customer?.email || '—'}</span>
 </div>

 <div className="flex justify-between items-center p-2.5 sm:p-3 rounded-xl bg-bg-primary border border-border-main gap-2">
 <span className="text-text-muted shrink-0">Guest Headcount:</span>
 <span className="font-bold text-text-main truncate flex-1 text-right">{scannedToken.personsCount} Guests</span>
 </div>
 </div>

 {/* Drink Quota Usage Progress Bar */}
 <div className="p-4 rounded-2xl bg-bg-primary border border-border-main space-y-2">
 <div className="flex justify-between text-xs font-bold">
 <span className="text-text-muted">Drink Quota Allowance:</span>
 <span className={isQuotaDepleted ? 'dark:text-red-400 text-red-700 font-extrabold' : 'dark:text-emerald-400 text-emerald-700 font-extrabold'}>
 {redemptionsUsed} / {totalAllowed} Drinks Used
 </span>
 </div>

 <div className="w-full h-3 rounded-full bg-bg-card overflow-hidden">
 <div 
 className={`h-full transition-all duration-500 ${
 isQuotaDepleted ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
 }`}
 style={{ width: `${Math.min(100, (redemptionsUsed / totalAllowed) * 100)}%` }}
 />
 </div>
 </div>

 {/* Dispense & Revert Actions */}
 <div className="space-y-2 sm:space-y-3 pt-1 sm:pt-2">
 <button
 onClick={handleRedeem}
 disabled={isRedeeming || isQuotaDepleted}
 title={isRedeeming ? "Dispensing..." : isQuotaDepleted ? "Drink quota limit reached for this session." : undefined}
 className="w-full py-3 sm:py-3.5 rounded-xl primary-btn text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
 >
 <div className="nav-icon-badge">
 <Wine size={14} />
 </div>
 <span>{isRedeeming ? 'Dispensing Drink...' : 'Dispense 1 Drink'}</span>
 </button>

 <div className="flex flex-row gap-2 sm:gap-3">
 {redemptionsUsed > 0 && (
 <button
 onClick={handleUndo}
 className="flex-1 py-2.5 rounded-xl bg-bg-primary hover:bg-bg-card text-[11px] sm:text-xs font-bold text-amber-300 border border-amber-500/30 flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer"
 >
 <RotateCcw size={14} /> <span className="hidden sm:inline">Revert Last Drink</span><span className="sm:hidden">Revert</span>
 </button>
 )}
 <button
 onClick={() => {
 setScannedToken(null);
 setTokenInput('');
 startCamera();
 }}
 className="flex-1 py-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all premium-btn-secondary flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer"
 >
 <Camera size={14} /> Scan Next
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 )}

 {/* ======================================================== */}
 {/* 2. CHECK-INS TAB */}
 {/* ======================================================== */}
 {!isScanTab && (
 <div className="space-y-6">
 
 {/* Global Search Bar */}
 <div className="dark:bg-transparent glass-panel border border-border-main border-x-0 border-t-0 rounded-none p-0 pb-4 mb-6">
 <div className="relative">
 <Search className="absolute left-4 top-3.5 text-text-muted" size={20} />
 <input
 type="text"
 value={searchQuery}
 onChange={e => setSearchQuery(e.target.value)}
 placeholder="Global Session Search (Search by Guest Name, Phone Number, Email, or Token code...)"
 className="w-full bg-bg-primary border border-border-main rounded-2xl pl-12 pr-4 py-3 text-base md:text-sm text-text-main placeholder-gray-500 focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary font-semibold"
 />
 </div>
 {searchQuery.trim() !== '' && (
 <p className="text-[10px] text-text-muted mt-2 pl-2">
 Found {filteredTokens.length} matching guest sessions in database.
 </p>
 )}
 </div>

 {/* Active Checked-in Customers List */}
 {isLoadingTokens ? (
 <div className="glass-panel p-12 text-center text-text-muted text-sm rounded-3xl border border-border-main">
 Loading active check-ins...
 </div>
 ) : filteredTokens.length === 0 ? (
 <div className="glass-panel p-16 text-center text-text-muted text-sm rounded-3xl border border-border-main space-y-2">
 <Users className="mx-auto text-gray-600" size={40} />
 <p className="font-bold text-text-main">No Active Checked-In Guests</p>
 <p className="text-xs">No guest matches the search queries, or no sessions are currently checked in.</p>
 </div>
 ) : (
 <div className="space-y-4">
 {filteredTokens.map(tk => {
 const isTokenQuotaDepleted = tk.redemptionsUsed >= tk.totalRedemptionsAllowed;
 return (
 <div 
 key={tk.id} 
 className="glass-panel dark:bg-[#1C1C1E] p-4 sm:p-6 rounded-3xl dark:rounded-xl border border-border-main dark:border-[rgba(255,255,255,0.1)] flex flex-col lg:flex-row lg:items-center justify-between gap-6 transition-all duration-300 hover:border-border-main/80 relative overflow-hidden"
 >
 {/* Customer Info and Headcount Column */}
 <div className="space-y-2 flex-1 min-w-0">
 <div className="flex flex-wrap items-center gap-2">
 <h4 className="text-base font-black text-text-main truncate w-full sm:w-auto">
 {tk.customer?.name || 'Walk-in Guest'}
 </h4>
 
 {/* Token Code Badge (White text) */}
 <span className="px-2 py-0.5 rounded bg-bg-card border border-border-main/50 text-[10px] font-mono font-bold text-text-main">
 {tk.tokenNumber}
 </span>

 {/* Status Badges */}
 <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider dark:bg-emerald-500/10 bg-emerald-500/10 dark:text-emerald-400 text-emerald-700 dark:border-emerald-500/20 border-emerald-500/30">
 {tk.status}
 </span>

 <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-primary/10 dark:text-[#D4AF37] text-primary border dark:border-[#D4AF37]/20 border-primary/20">
 {tk.deliveryMode || 'EMAIL_QR'}
 </span>
 </div>

 {/* Phone, Email, Table, and headcount grids */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-1 gap-x-4 text-xs text-text-muted">
 <div className="flex items-center gap-1.5 min-w-0">
 <Phone size={12} className="shrink-0 text-text-muted" />
 <span className="font-mono truncate">{tk.customer?.phoneNumber || 'N/A'}</span>
 </div>
 <div className="flex items-center gap-1.5 min-w-0">
 <Mail size={12} className="shrink-0 text-text-muted" />
 <span className="font-mono truncate" title={tk.customer?.email}>{tk.customer?.email || '—'}</span>
 </div>
 <div className="flex items-center gap-1.5">
 <Users size={12} className="shrink-0 text-text-muted" />
 <span>Party Size: <span className="font-bold text-text-main">{tk.personsCount} Guests</span></span>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-1 gap-x-4 text-xs text-text-muted pt-1 border-t border-border-main/20">
 <div>
 Table/Zone: <span className="font-bold text-text-main">{tk.tableNumber || 'Walking / Bar'}</span>
 </div>
 <div>
 Checked In: <span className="font-bold text-text-main">{new Date(tk.createdAt || tk.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
 </div>
 <div>
 Session Duration: <span className="font-bold text-text-main">{getSessionDuration(tk.createdAt || tk.startTime)}</span>
 </div>
 </div>
 </div>

 {/* Pricing, Redemptions progress, and Actions layout */}
 <div className="flex flex-col sm:flex-row items-start sm:items-center lg:justify-end gap-4 sm:gap-6 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-border-main/30 w-full lg:w-auto">
 
 <div className="flex items-center justify-between w-full sm:w-auto sm:justify-end gap-6 border-b sm:border-b-0 border-border-main/20 pb-4 sm:pb-0">
 {/* Drink Quota Status */}
 <div className="text-left sm:text-right space-y-1 flex-1 sm:flex-initial">
 <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">Redemption Progress</span>
 <div className="flex items-center sm:justify-end gap-2">
 <span className={`text-sm font-black font-mono ${isTokenQuotaDepleted ? 'dark:text-red-400 text-red-700' : 'dark:text-emerald-400 text-emerald-700'}`}>
 {tk.redemptionsUsed} / {tk.totalRedemptionsAllowed}
 </span>
 <span className="text-[10px] text-text-muted font-semibold">Drinks Used</span>
 </div>
 <div className="w-full sm:w-24 h-1.5 rounded-full bg-bg-card overflow-hidden ml-0 sm:ml-auto mt-2">
 <div 
 className={`h-full ${isTokenQuotaDepleted ? 'bg-red-500' : 'bg-emerald-500'}`}
 style={{ width: `${Math.min(100, (tk.redemptionsUsed / tk.totalRedemptionsAllowed) * 100)}%` }}
 />
 </div>
 </div>

 {/* Total Amount Paid */}
 <div className="text-right space-y-1 flex-1 sm:flex-initial border-l border-border-main/20 pl-4 sm:border-l-0 sm:pl-0">
 <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">Gate Payment</span>
 <span className="text-sm font-black text-text-main font-mono">₹{tk.amountPaid}</span>
 </div>
 </div>

 {/* Action Buttons */}
 <div className="flex flex-wrap gap-2 w-full sm:w-auto">
 <button
 onClick={() => handleRedeemForToken(tk)}
 disabled={isRedeeming || isTokenQuotaDepleted}
 title={isTokenQuotaDepleted ? "Drink quota limit reached for this session." : "Dispense 1 Drink"}
 className="px-3 py-2.5 sm:py-2 rounded-xl dark:bg-emerald-500/20 bg-emerald-500/10 dark:hover:bg-emerald-600 hover:bg-emerald-600 dark:text-emerald-200 text-emerald-700 dark:hover:text-white hover:text-white text-xs font-bold uppercase tracking-wider border border-emerald-500/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer flex-1 sm:flex-none"
 >
 <Wine size={14} /> Redeem
 </button>

 <button
 onClick={() => setExtendingToken(tk)}
 className="px-3 py-2.5 sm:py-2 rounded-xl dark:bg-amber-500/10 bg-amber-500/5 hover:dark:bg-amber-500/20 hover:bg-amber-500/10 dark:text-amber-300 text-amber-700 text-xs font-bold border border-amber-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer flex-1 sm:flex-none"
 title="Extend Session"
 >
 <Clock size={14} /> Extend
 </button>

 <button
 onClick={() => setClosingToken(tk)}
 className="px-3 py-2.5 sm:py-2 rounded-xl dark:bg-red-500/10 bg-red-500/5 hover:dark:bg-red-500/20 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-800 active:bg-red-500/25 active:text-red-900 dark:text-red-400 text-red-700 text-xs font-bold border border-red-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/20 flex-1 sm:flex-none"
 title="Checkout Session"
 >
 <LogOut size={14} /> Checkout
 </button>

 <button
 onClick={() => {
 setScannedToken(tk);
 setActiveTab('bartender/scan');
 }}
 className="px-3 py-3 sm:py-2 rounded-xl text-xs font-bold transition-all premium-btn-secondary flex items-center justify-center gap-1.5 cursor-pointer"
 title="Enable Focused QR Scan View"
 >
 <QrCode size={14} /> Scan Mode
 </button>
 </div>

 </div>
 </div>
 );
 })}
 </div>
 )}

 </div>
 )}

 {/* ======================================================== */}
 {/* MODALS */}
 {/* ======================================================== */}

 {/* 1. EXTEND SESSION MODAL */}
 {extendingToken && (
 <div className="fixed inset-0 z-50 dark:bg-transparent bg-black/75 flex items-center justify-end p-0 pointer-events-none animate-fadeIn">
 <div className="bg-bg-surface border border-border-main border-y-0 border-r-0 border-l-[1px] dark:border-[rgba(255,255,255,0.1)] dark:bg-[#121212] rounded-none p-5 w-full md:w-[380px] relative text-text-main animate-none h-[100dvh] pointer-events-auto flex flex-col">
 
 <div className="flex items-center justify-between pb-4 dark:pb-5 border-b border-border-main dark:border-[rgba(255,255,255,0.1)] shrink-0">
 <div className="flex items-center gap-2 dark:text-amber-400 text-amber-700 font-bold text-sm">
 <Clock size={18} className="shrink-0" /> Extend Customer Session
 </div>
 <button 
 onClick={() => setExtendingToken(null)}
 className="p-0 rounded-lg dark:bg-transparent bg-bg-surface hover:bg-bg-card text-text-muted hover:text-text-main shrink-0 cursor-pointer"
 >
 <X size={18} />
 </button>
 </div>

 <div className="flex-1 overflow-y-auto py-5 space-y-4 no-scrollbar">
 <p className="text-xs text-text-muted">
 Token Number: <span className="font-mono font-bold text-text-main">{extendingToken.tokenNumber}</span> ({extendingToken.customer?.name})
 </p>

 <form onSubmit={handleExtendSubmit} className="space-y-4">
 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1">Additional Minutes</label>
 <select
 value={extraMinutes}
 onChange={e => setExtraMinutes(Number(e.target.value))}
 className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
 >
 <option value={30}>30 Minutes</option>
 <option value={60}>60 Minutes (1 Hour)</option>
 <option value={120}>120 Minutes (2 Hours)</option>
 <option value={180}>180 Minutes (3 Hours)</option>
 </select>
 </div>

 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1">Additional Extension Fee (₹)</label>
 <input
 type="number"
 value={additionalAmount}
 onChange={e => setAdditionalAmount(Number(e.target.value))}
 className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main font-mono focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
 required
 />
 </div>

 <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-border-main dark:border-[rgba(255,255,255,0.1)] shrink-0">
 <button
 type="button"
 onClick={() => setExtendingToken(null)}
 className="flex-1 py-2.5 rounded-md bg-transparent border border-border-main dark:border-[rgba(255,255,255,0.1)] text-xs font-bold text-text-muted hover:text-text-main cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="submit"
 disabled={isSubmittingExtend}
 title={isSubmittingExtend ? "Request in progress" : undefined}
 className="flex-1 py-2.5 rounded-md primary-btn text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer dark:text-black"
 >
 {isSubmittingExtend ? 'Extending...' : 'Confirm Extension'}
 </button>
 </div>
 </form>
 </div>
 </div>
 </div>
 )}

 {/* 2. CLOSE / CHECKOUT SESSION MODAL */}
 {closingToken && (
 <div className="fixed inset-0 z-50 dark:bg-transparent bg-black/75 flex items-center justify-end p-0 pointer-events-none animate-fadeIn">
 <div className="bg-bg-surface border border-border-main border-y-0 border-r-0 border-l-[1px] dark:border-[rgba(255,255,255,0.1)] dark:bg-[#121212] rounded-none p-5 w-full md:w-[380px] relative text-text-main animate-none h-[100dvh] pointer-events-auto flex flex-col">
 
 <div className="flex items-center justify-between pb-4 dark:pb-5 border-b border-border-main dark:border-[rgba(255,255,255,0.1)] shrink-0">
 <div className="flex items-center gap-2 text-red-500 font-bold text-sm">
 <LogOut size={18} className="shrink-0" /> Checkout / Close Session
 </div>
 <button 
 onClick={() => setClosingToken(null)}
 className="p-0 rounded-lg dark:bg-transparent bg-bg-surface hover:bg-bg-card text-text-muted hover:text-text-main shrink-0 cursor-pointer"
 >
 <X size={18} />
 </button>
 </div>

 <div className="flex-1 overflow-y-auto py-5 space-y-4 no-scrollbar">
 <p className="text-xs text-text-muted">
 Token Number: <span className="font-mono font-bold text-text-main">{closingToken.tokenNumber}</span> ({closingToken.customer?.name})
 </p>

 <form onSubmit={handleCloseSubmit} className="space-y-4">
 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1">Select Close Reason</label>
 <select
 value={closeReason}
 onChange={e => setCloseReason(e.target.value)}
 className="w-full bg-bg-primary border border-border-main rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none dark:focus:border-[#D4AF37] focus:border-primary"
 >
 <option value="CHECKOUT">Standard Guest Checkout</option>
 <option value="EXPIRED">Session Time Expired</option>
 <option value="CANCELLED">Session Cancelled by Reception</option>
 </select>
 </div>

 <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-border-main dark:border-[rgba(255,255,255,0.1)] shrink-0">
 <button
 type="button"
 onClick={() => setClosingToken(null)}
 className="flex-1 py-2.5 rounded-md bg-transparent border border-border-main dark:border-[rgba(255,255,255,0.1)] text-xs font-bold text-text-muted hover:text-text-main cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="submit"
 disabled={isSubmittingClose}
 title={isSubmittingClose ? "Request in progress" : undefined}
 className="flex-1 py-2.5 rounded-md dark:bg-red-500/20 bg-red-500/10 dark:hover:bg-red-600 hover:bg-red-600 dark:text-red-200 text-red-700 dark:hover:text-white hover:text-white text-xs font-bold uppercase tracking-wider border border-red-500/30 transition-all cursor-pointer"
 >
 {isSubmittingClose ? 'Closing...' : 'Close Session'}
 </button>
 </div>
 </form>
 </div>
 </div>
 </div>
 )}

 </div>
 );
};
