import React, { useState } from 'react';
import { Sun, Moon, User, KeyRound, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
 const { login, isDark, toggleTheme } = useAuth();
 const [selectedRole, setSelectedRole] = useState<'REC' | 'BAR' | 'ADM' | 'MGR'>('ADM');
 const [username, setUsername] = useState('ADM-03');
 const [pin, setPin] = useState('1234');
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [errorMsg, setErrorMsg] = useState('');

 const handleRoleSelect = (role: 'REC' | 'BAR' | 'ADM' | 'MGR') => {
 setSelectedRole(role);
 setErrorMsg('');
 const defaults = {
 REC: { user: 'REC-01', pin: '1234' },
 BAR: { user: 'BAR-02', pin: '1234' },
 ADM: { user: 'ADM-03', pin: '1234' },
 MGR: { user: 'MGR-04', pin: '1234' },
 };
 setUsername(defaults[role].user);
 setPin(defaults[role].pin);
 };

 const toggleThemeWithWave = (e: React.MouseEvent<HTMLButtonElement>) => {
 if (
 !(document as any).startViewTransition ||
 window.matchMedia('(prefers-reduced-motion: reduce)').matches
 ) {
 toggleTheme();
 return;
 }

 const x = e.clientX;
 const y = e.clientY;

 const right = window.innerWidth - x;
 const bottom = window.innerHeight - y;
 const maxRadius = Math.hypot(Math.max(x, right), Math.max(y, bottom));

 const transition = (document as any).startViewTransition(() => {
 toggleTheme();
 });

 transition.ready.then(() => {
 document.documentElement.animate(
 {
 clipPath: [
 `circle(0px at ${x}px ${y}px)`,
 `circle(${maxRadius}px at ${x}px ${y}px)`
 ]
 },
 {
 duration: 800,
 easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
 pseudoElement: '::view-transition-new(root)'
 }
 );
 });
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!username || !pin) {
 setErrorMsg('Please enter a valid Employee Code and Security PIN.');
 return;
 }
 setErrorMsg('');
 setIsSubmitting(true);
 try {
 await login(username.trim(), pin.trim());
 } catch (err: any) {
 setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
 } finally {
 setIsSubmitting(false);
 }
 };

 return (
 <div style={{ fontFamily: "'Manrope', sans-serif" }} className="min-h-[100dvh] dark:bg-gradient-to-br dark:from-[#141225] dark:via-[#1A1333] dark:to-[#080612] bg-gradient-to-br from-[#F5F3FA] via-[#FAF9FF] to-[#EDE9FE] flex flex-col items-center p-4 lg:p-12 relative overflow-y-auto overflow-x-hidden text-text-main">

 {/* Ambient background layers matching App.tsx */}
 <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0 fixed">
 {/* Background Lounge Image */}
 <div 
 className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-700 opacity-50 dark:opacity-30 mix-blend-normal"
 style={{ backgroundImage: isDark ? "url('/login_bg_dark.png')" : "url('/login_bg_light.png')" }}
 />
 {/* Orb 1: Warm Amber Top-Left/behind Sidebar */}
 <div className="absolute -top-[15%] -left-[10%] w-[45%] h-[55%] dark:bg-[radial-gradient(circle,rgba(241,147,7,0.06)_0%,transparent_70%)] bg-[radial-gradient(circle,rgba(241,147,7,0.04)_0%,transparent_70%)] rounded-full blur-[130px] animate-ambient-slow-1" />

 {/* Orb 2: Primary Brand Purple Header Glow */}
 <div className="absolute -top-[20%] right-[15%] w-[50%] h-[60%] dark:bg-[radial-gradient(circle,rgba(212,175,55,0.16)_0%,transparent_70%)] bg-[radial-gradient(circle,rgba(212,175,55,0.12)_0%,transparent_70%)] rounded-full blur-[140px] animate-ambient-slow-2" />

 {/* Orb 3: Deep Indigo Center-Right Depth */}
 <div className="absolute top-[25%] right-[5%] w-[40%] h-[50%] dark:bg-[radial-gradient(circle,rgba(99,102,241,0.10)_0%,transparent_70%)] bg-[radial-gradient(circle,rgba(99,102,241,0.06)_0%,transparent_70%)] rounded-full blur-[150px] animate-ambient-slow-1" />

 {/* Orb 4: Deep Indigo Bottom-Right Accent */}
 <div className="absolute -bottom-[15%] right-[10%] w-[40%] h-[50%] dark:bg-[radial-gradient(circle,rgba(99,102,241,0.08)_0%,transparent_70%)] bg-[radial-gradient(circle,rgba(99,102,241,0.06)_0%,transparent_70%)] rounded-full blur-[140px] animate-ambient-slow-2" />

 {/* Orb 5: Emerald Bottom-Left Accent */}
 <div className="absolute -bottom-[10%] left-[10%] w-[35%] h-[45%] dark:bg-[radial-gradient(circle,rgba(16,185,129,0.08)_0%,transparent_70%)] bg-[radial-gradient(circle,rgba(16,185,129,0.06)_0%,transparent_70%)] rounded-full blur-[130px] animate-ambient-slow-1" />

 {/* Ambient Vignette Overlay for edge depth */}
 <div className="absolute inset-0 ambient-vignette-overlay" />
 </div>

 {/* Split Screen Container styled as Premium Glass card */}
 <div className="w-full max-w-5xl my-auto glass-panel border border-border-main rounded-3xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 relative z-10 shrink-0">
 
 {/* Left Panel: Venue Branding Showcase (Responsive) */}
 <div className="flex flex-col justify-between p-6 lg:p-10 bg-gradient-to-br from-primary/10 to-primary/5 border-b lg:border-b-0 lg:border-r border-border-main relative">
 {/* Theme Toggle inside Card */}
 <div className="absolute top-4 right-4 lg:top-6 lg:right-6 z-20">
 <button
 onClick={toggleThemeWithWave}
 className="p-2 transition-all premium-btn-secondary "
 title="Toggle Color Theme"
 >
 {isDark ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} />}
 </button>
 </div>

 <div>
 <div className="flex items-center gap-3 lg:gap-4 mb-2 lg:mb-6 pr-10">
 {/* Glowing Brand Logo element */}
 <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl premium-logo-glow flex items-center justify-center text-text-inverse text-xl lg:text-2xl font-bold shrink-0">
 🍸
 </div>
 <div>
 <h1 className="text-lg lg:text-[27px] font-bold text-text-main tracking-wider uppercase leading-tight">OPEN THE BOTTLE</h1>
 <p className="text-[10px] lg:text-xs text-primary font-semibold mt-0.5 lg:mt-1 uppercase tracking-widest">Enterprise Terminal Gateway</p>
 </div>
 </div>
 
 <p className="hidden lg:block text-xs text-text-muted mt-6 leading-relaxed font-semibold">
 A unified workstation for guest check-in, table management, drink redemption, and operations.
 </p>
 </div>

 <div className="hidden lg:block space-y-3">
 <div className="p-4 rounded-2xl bg-bg-secondary-surface border border-border-main flex items-center gap-3">
 <ShieldCheck className="text-emerald-400" size={20} />
 <div>
 <p className="text-xs font-bold text-text-main">Secure Terminal Access</p>
 <p className="text-[10px] text-text-muted font-semibold">Authorized Shift Staff Terminal Only</p>
 </div>
 </div>
 </div>
 </div>

 {/* Right Panel: Authentication Form */}
 <div className="p-6 md:p-10 flex flex-col justify-center space-y-6">
 
 {/* Header */}
 <div>
 <h2 className="text-xl font-bold text-text-main tracking-wide">Staff Workstation Login</h2>
 <p className="text-xs text-text-muted mt-1 font-semibold">Select your station role and enter your credentials to continue.</p>
 </div>

 {/* Error Banner */}
 {errorMsg && (
 <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 dark:text-red-400 text-red-700 text-xs font-bold flex items-center gap-2">
 <span>⚠️</span>
 <span>{errorMsg}</span>
 </div>
 )}

 {/* Role Selection Tabs styled as standardized premium segmented controls */}
 <div>
 <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">1. Select Station Role</label>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-[#F8F7FC] dark:bg-black/10 border border-border-main">
 {(['REC', 'BAR', 'ADM', 'MGR'] as const).map(r => {
 const isSel = selectedRole === r;
 const labels = { REC: 'Reception', BAR: 'Bartender', ADM: 'Admin', MGR: 'Manager' };
 return (
 <button
 key={r}
 type="button"
 onClick={() => handleRoleSelect(r)}
 className={`py-2 sm:py-1.5 text-[11px] sm:text-[10px] md:text-xs font-bold uppercase transition-all duration-200 active:scale-95 premium-tab-secondary ${
 isSel ? 'active' : ''
 }`}
 >
 {labels[r]}
 </button>
 );
 })}
 </div>
 </div>

 {/* Credentials Form */}
 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1.5">Employee Access Code</label>
 <div className="relative">
 <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
 <input
 type="text"
 value={username}
 onChange={e => {
 setUsername(e.target.value.toUpperCase());
 setErrorMsg('');
 }}
 placeholder="e.g. ADM-03"
 className="w-full bg-bg-secondary-surface border border-border-main rounded-xl pl-10 pr-4 py-2.5 text-base md:text-sm text-text-main font-mono font-semibold placeholder-gray-500 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
 required
 />
 </div>
 </div>

 <div>
 <label className="block text-xs font-semibold text-text-muted mb-1.5">Security PIN</label>
 <div className="relative">
 <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
 <input
 type="password"
 value={pin}
 onChange={e => {
 setPin(e.target.value);
 setErrorMsg('');
 }}
 placeholder="••••"
 className="w-full bg-bg-secondary-surface border border-border-main rounded-xl pl-10 pr-4 py-2.5 text-base md:text-sm text-text-main font-mono font-semibold placeholder-gray-500 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
 required
 />
 </div>
 </div>

 {/* Submit Action */}
 <button
 type="submit"
 disabled={isSubmitting}
 title={isSubmitting ? "Authenticating..." : undefined}
 className="w-full py-3 rounded-xl primary-btn text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all mt-4"
 >
 {isSubmitting ? (
 <span>Opening Workstation...</span>
 ) : (
 <>
 <span>Open Workstation</span>
 <ArrowRight size={16} />
 </>
 )}
 </button>
 </form>
 </div>
 </div>
 </div>
 );
};
