import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, NotificationItem } from '../types';
import { api } from '../services/api';

interface ToastMessage {
 id: string;
 type: 'success' | 'danger' | 'warning' | 'info';
 message: string;
}

interface PreselectedTable {
 id: string;
 number: string;
 capacity: number;
 placeTypeId: string;
}

interface AuthContextType {
 user: User | null;
 token: string | null;
 isLoading: boolean;
 isDark: boolean;
 systemMode: 'online' | 'offline' | 'syncing';
 toasts: ToastMessage[];
 notifications: NotificationItem[];
 preselectedTable: PreselectedTable | null;
 setPreselectedTable: (table: PreselectedTable | null) => void;
 toggleTheme: () => void;
 login: (username: string, pin: string) => Promise<boolean>;
 logout: () => Promise<void>;
 showToast: (message: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
 dismissToast: (id: string) => void;
 addNotification: (title: string, message: string) => void;
 markNotificationsAsRead: () => void;
 clearNotifications: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
 const [user, setUser] = useState<User | null>(null);
 const [token, setToken] = useState<string | null>(api.getToken());
 const [isLoading, setIsLoading] = useState<boolean>(true);
 const [isDark, setIsDark] = useState<boolean>(() => {
 const savedTheme = localStorage.getItem('bar_web_theme');
 return savedTheme === 'dark'; // Default to false (light theme)
 });
 const [systemMode] = useState<'online' | 'offline' | 'syncing'>('online');
 const [preselectedTable, setPreselectedTable] = useState<PreselectedTable | null>(null);
 const [toasts, setToasts] = useState<ToastMessage[]>([]);

 // Notifications state loaded from localStorage
 const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
 const saved = localStorage.getItem('bar_web_notifications');
 if (saved) {
 try {
 return JSON.parse(saved);
 } catch {
 // Fallback below
 }
 }
 return [
 {
 id: '1',
 title: 'System Online',
 message: 'System active and ready for venue operations.',
 timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
 read: false,
 },
 ];
 });

 // Apply DOM Theme classes
 useEffect(() => {
 if (isDark) {
 document.documentElement.classList.add('dark');
 document.documentElement.setAttribute('data-theme', 'dark');
 } else {
 document.documentElement.classList.remove('dark');
 document.documentElement.setAttribute('data-theme', 'light');
 }
 }, [isDark]);

 // Sync notifications to localStorage
 useEffect(() => {
 localStorage.setItem('bar_web_notifications', JSON.stringify(notifications));
 }, [notifications]);

 useEffect(() => {
 const savedUser = localStorage.getItem('bar_web_user');
 if (savedUser && token) {
 try {
 setUser(JSON.parse(savedUser));
 } catch {
 localStorage.removeItem('bar_web_user');
 }
 }
 setIsLoading(false);
 }, [token]);

 const toggleTheme = () => {
 setIsDark(prev => {
 const next = !prev;
 localStorage.setItem('bar_web_theme', next ? 'dark' : 'light');
 return next;
 });
 };

 const showToast = (message: string, type: 'success' | 'danger' | 'warning' | 'info' = 'info') => {
 const id = Date.now().toString();
 setToasts(prev => [...prev, { id, type, message }]);
 setTimeout(() => {
 dismissToast(id);
 }, 4000);
 };

 const dismissToast = (id: string) => {
 setToasts(prev => prev.filter(t => t.id !== id));
 };

 const login = async (username: string, pin: string): Promise<boolean> => {
 try {
 const res = await api.login(username, pin);
 if (res.user && res.token) {
 setUser(res.user);
 setToken(res.token);
 localStorage.setItem('bar_web_user', JSON.stringify(res.user));
 showToast(`Welcome back, ${res.user.fullName}!`, 'success');
 
 // Log receptionist/admin login notification
 const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
 const newNotif: NotificationItem = {
 id: Date.now().toString(),
 title: 'Staff Access Granted',
 message: `${res.user.fullName} logged into administrative portal successfully.`,
 timestamp: timeStr,
 read: false,
 };
 setNotifications(prev => [newNotif, ...prev]);

 return true;
 }
 return false;
 } catch (err: any) {
 showToast(err.message || 'Login failed. Incorrect ID or PIN.', 'danger');
 return false;
 }
 };

 const logout = async () => {
 await api.logout();
 setUser(null);
 setToken(null);
 localStorage.removeItem('bar_web_user');
 showToast('Logged out successfully.', 'info');
 };

 // Helper actions for notifications
 const addNotification = (title: string, message: string) => {
 const newNotif: NotificationItem = {
 id: Date.now().toString(),
 title,
 message,
 timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
 read: false,
 };
 setNotifications(prev => [newNotif, ...prev]);
 };

 const markNotificationsAsRead = () => {
 setNotifications(prev => prev.map(n => ({ ...n, read: true })));
 };

 const clearNotifications = () => {
 setNotifications([]);
 };

 return (
 <AuthContext.Provider
 value={{
 user,
 token,
 isLoading,
 isDark,
 systemMode,
 toasts,
 notifications,
 preselectedTable,
 setPreselectedTable,
 toggleTheme,
 login,
 logout,
 showToast,
 dismissToast,
 addNotification,
 markNotificationsAsRead,
 clearNotifications,
 }}
 >
 {children}
 </AuthContext.Provider>
 );
};

export const useAuth = () => {
 const context = useContext(AuthContext);
 if (!context) {
 throw new Error('useAuth must be used within an AuthProvider');
 }
 return context;
};

