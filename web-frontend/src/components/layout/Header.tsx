import React, { useState, useEffect, useRef } from 'react';
import { Bell, Moon, Sun, RefreshCw, Trash2, LogOut, CheckSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
 title: string;
 onSidebarToggle?: () => void;
 isSidebarCollapsed?: boolean;
 onRefresh?: () => void;
 isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ title, onSidebarToggle, onRefresh, isRefreshing }) => {
 const { 
 isDark, 
 toggleTheme, 
 notifications, 
 markNotificationsAsRead, 
 clearNotifications,
 logout,
 user
 } = useAuth();
 
 const [isOpen, setIsOpen] = useState(false);
 const unreadNotifications = notifications.filter(n => !n.read).length;
 const popoverRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
 const handleClickOutside = (event: MouseEvent) => {
 if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
 setIsOpen(false);
 }
 };
 if (isOpen) {
 document.addEventListener('mousedown', handleClickOutside);
 }
 return () => {
 document.removeEventListener('mousedown', handleClickOutside);
 };
 }, [isOpen]);

 const handleTogglePanel = () => {
 setIsOpen(!isOpen);
 if (!isOpen) {
 markNotificationsAsRead();
 }
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

 const handleClearAll = (e: React.MouseEvent) => {
 e.stopPropagation();
 clearNotifications();
 };

 return (
 <header className="sticky top-0 z-20 bg-transparent border-b border-border-sidebar px-4 md:px-6 py-3.5 flex items-center justify-between text-text-primary shrink-0 min-w-0">
 {/* Title & Page Header */}
 <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
 {/* Hamburger Menu (Mobile Only) */}
 {onSidebarToggle && (
 <button 
 onClick={onSidebarToggle}
 className="lg:hidden p-2 -ml-2 rounded-xl premium-btn-secondary shrink-0 flex items-center justify-center cursor-pointer"
 title="Toggle Sidebar"
 >
 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
 </button>
 )}
 <div className="min-w-0">
 <h2 className="text-xl md:text-2xl font-black text-text-primary dark:text-white tracking-wider uppercase leading-none truncate">{title}</h2>
 <p className="text-[10px] text-text-muted/90 font-bold mt-1.5 uppercase tracking-widest truncate">Bar Management System</p>
 </div>
 </div>

 {/* System Status & Actions */}
 <div className="flex items-center gap-3 relative shrink-0">
 {/* System Status Capsule */}
 <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-status-success-bg border border-status-success-border text-status-success text-xs font-semibold shrink-0">
 <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
 <span>System Active</span>
 </div>

 {/* Refresh Action Button */}
 {onRefresh && (
 <button
 onClick={onRefresh}
 disabled={isRefreshing}
 className="w-9 h-9 rounded-full transition-all disabled:opacity-50 premium-btn-secondary flex items-center justify-center cursor-pointer"
 title={isRefreshing ? "Refresh in progress" : "Refresh Data"}
 >
 <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
 </button>
 )}

 {/* Notifications Icon with Dropdown */}
 <div ref={popoverRef} className="relative">
 <button 
 onClick={handleTogglePanel}
 className="w-9 h-9 rounded-full transition-all relative premium-btn-secondary flex items-center justify-center cursor-pointer"
 title="Notifications"
 >
 <Bell size={18} />
 {unreadNotifications > 0 && (
 <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-bg-surface" />
 )}
 </button>

 {/* Notifications Dropdown Panel Overlay */}
 {isOpen && (
 <div className="fixed inset-x-4 top-[64px] sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2.5 sm:w-80 rounded-3xl border border-border glass-panel overflow-hidden z-50 text-text-primary animate-fadeIn flex flex-col max-h-[85vh]">
 
 {/* Popover Header */}
 <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
 <span className="font-bold text-xs uppercase tracking-wider text-text-primary">Notifications Log</span>
 {notifications.length > 0 && (
 <button 
 onClick={handleClearAll}
 className="px-2.5 py-1 text-[10px] font-bold flex items-center gap-1 transition-all premium-btn-secondary cancellation-btn dark:text-red-400 text-red-700 dark:border-red-500/30 border-red-500/30 dark:bg-red-500/5 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-800 active:bg-red-500/25 active:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 active:scale-95 cursor-pointer"
 >
 <Trash2 size={11} /> Clear All
 </button>
 )}
 </div>

 {/* Popover Body List */}
 <div className="flex-1 overflow-y-auto divide-y divide-border max-h-[60vh] sm:max-h-72">
 {notifications.length === 0 ? (
 <div className="px-5 py-8 text-center space-y-2">
 <CheckSquare className="mx-auto text-text-muted" size={24} />
 <p className="text-xs font-semibold text-text-primary">No Operational Alerts</p>
 <p className="text-[10px] text-text-muted">Your session activity log is currently clear.</p>
 </div>
 ) : (
 notifications.map(notif => (
 <div key={notif.id} className="p-4 bg-bg-secondary-surface dark:bg-black/10 hover:bg-bg-hover transition-all text-xs space-y-1 border-b border-border/30 last:border-b-0">
 <div className="flex justify-between items-start gap-2">
 <p className="font-bold text-text-primary text-[11px]">{notif.title}</p>
 <span className="text-[9px] text-text-muted font-mono">{notif.timestamp}</span>
 </div>
 <p className="text-[10px] text-text-muted leading-relaxed">{notif.message}</p>
 </div>
 ))
 )}
 </div>

 {/* Popover Action Footer (Sign Out matching native shell overlay) */}
 <div className="p-3 bg-bg-primary border-t border-border">
 {user && (
 <div className="flex items-center justify-between px-2 pb-2">
 <span className="text-[10px] text-text-muted truncate max-w-[120px]">👤 {user.fullName}</span>
 <span className="text-[8px] text-primary border border-primary/30 px-2 py-0.5 rounded-full font-bold uppercase">{user.role}</span>
 </div>
 )}
 <button
 onClick={() => {
 setIsOpen(false);
 logout();
 }}
 className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-primary border border-primary-hover text-white 0_0_20px_rgba(212,175,55,0.55)] hover:bg-[#7B59DD] 0_0_24px_rgba(212,175,55,0.75)] transition-all duration-200 cursor-pointer active:scale-95 flex items-center justify-center gap-2"
 >
 <LogOut size={14} />
 <span>Sign Out Shift Account</span>
 </button>
 </div>

 </div>
 )}
 </div>

 {/* Theme Toggle Button */}
 <button
 onClick={toggleThemeWithWave}
 className="p-2 transition-all premium-btn-secondary"
 title="Toggle Color Theme"
 >
 {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} />}
 </button>
 </div>
 </header>
 );
};
