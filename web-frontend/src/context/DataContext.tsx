import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { Token, Table } from '../types';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

export interface SessionAlert {
  id: string;
  tableId: string;
  title: string;
  message: string;
  timestamp: string;
  tokenNumber: string;
  customerName: string;
  tableNumber: string;
  remainingTimeStr: string;
  expiresAt: string;
  soundPlayed: boolean;
  dismissed: boolean;
}

interface DataContextType {
 tokens: Token[];
 allSessions: any[];
 tables: Table[];
 reservations: any[];
 rates: any[];
 users: any[];
 isLoading: boolean;
 sessionAlerts: SessionAlert[];
 dismissAlert: (id: string) => void;
 refreshTokens: () => Promise<void>;
 refreshAllSessions: () => Promise<void>;
 refreshTables: () => Promise<void>;
 refreshReservations: () => Promise<void>;
 refreshRates: () => Promise<void>;
 refreshUsers: () => Promise<void>;
 refreshAll: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
 const { user } = useAuth();
 const [tokens, setTokens] = useState<Token[]>([]);
 const [allSessions, setAllSessions] = useState<any[]>([]);
 const [tables, setTables] = useState<Table[]>([]);
 const [reservations, setReservations] = useState<any[]>([]);
 const [rates, setRates] = useState<any[]>([]);
 const [users, setUsers] = useState<any[]>([]);
 const [isLoading, setIsLoading] = useState<boolean>(false);
 const [sessionAlerts, setSessionAlerts] = useState<SessionAlert[]>([]);

 const dismissAlert = (id: string) => {
   setSessionAlerts(prev => prev.map(a => a.id === id ? { ...a, dismissed: true } : a));
 };

 // In-flight request deduplication map
 const inFlightRef = useRef<{ [key: string]: Promise<any> | null }>({});

 const deduplicate = async <T,>(key: string, fetchFn: () => Promise<T>): Promise<T> => {
 if (inFlightRef.current[key]) {
 return inFlightRef.current[key] as Promise<T>;
 }
 const promise = fetchFn().finally(() => {
 inFlightRef.current[key] = null;
 });
 inFlightRef.current[key] = promise;
 return promise;
 };

 const refreshTokens = async () => {
 try {
 const data = await deduplicate('tokens', () => api.getActiveTokens());
 setTokens(data);
 } catch (err) {
 console.warn('Failed to background refresh tokens cache:', err);
 }
 };

 const refreshAllSessions = async () => {
 try {
 const data = await deduplicate('allSessions', () => api.getAllSessions());
 setAllSessions(data);
 } catch (err) {
 console.warn('Failed to background refresh all sessions cache:', err);
 }
 };

 const refreshTables = async () => {
 try {
 const data = await deduplicate('tables', () => api.getTables());
 setTables(data);
 } catch (err) {
 console.warn('Failed to background refresh tables cache:', err);
 }
 };

 const refreshRates = async () => {
 try {
 const data = await deduplicate('rates', () => api.getRates());
 setRates(data);
 } catch (err) {
 console.warn('Failed to background refresh rates cache:', err);
 }
 };

 const refreshReservations = async () => {
 try {
 const data = await deduplicate('reservations', () => api.getReservations());
 setReservations(data);
 } catch (err) {
 console.warn('Failed to background refresh reservations cache:', err);
 }
 };

 const refreshUsers = async () => {
 if (user?.role?.toLowerCase() !== 'admin') return;
 try {
 const res = await deduplicate('users', () => api.getUsers()) as any;
 // Handle response structure { success: true, data: [...] } or array
 const rawList = Array.isArray(res) ? res : (res?.data || res?.users || []);
 setUsers(rawList);
 } catch (err) {
 console.warn('Failed to background refresh users cache:', err);
 }
 };

 const refreshAll = async () => {
 setIsLoading(true);
 // Execute all background fetches in parallel. Handle failures gracefully so they don't block each other.
 await Promise.allSettled([
 refreshTokens(),
 refreshAllSessions(),
 refreshTables(),
 refreshReservations(),
 refreshRates(),
 refreshUsers(),
 ]);
 setIsLoading(false);
 };

  const tokensRef = useRef(tokens);
  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  const playChime = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(587.33, now); // D5
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      
      osc.start(now);
      osc.stop(now + 0.3);
      
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      
      osc2.frequency.setValueAtTime(880.00, now + 0.12); // A5
      gain2.gain.setValueAtTime(0, now + 0.12);
      gain2.gain.linearRampToValueAtTime(0.2, now + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      
      osc2.start(now + 0.12);
      osc2.stop(now + 0.45);
    } catch (e) {
      console.warn('Audio Context blocked or failed:', e);
    }
  };

  const formatRemaining = (diffMs: number) => {
    const totalSecs = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Automatically trigger parallel background load once user logs in
  useEffect(() => {
    if (user) {
      refreshAll();

      // 1-second interval to update remaining time, trigger expiry alerts, play sound, and handle cleanup
      const countdownInterval = setInterval(() => {
        const now = Date.now();
        setSessionAlerts(prevAlerts => {
          let changed = false;
          const activeTokenIds = new Set(tokensRef.current.map(tk => tk.id));
          
          // Invalidate alerts for tokens that are no longer active/present
          let updated = prevAlerts.filter(a => activeTokenIds.has(a.id));
          if (updated.length !== prevAlerts.length) changed = true;

          tokensRef.current.forEach(tk => {
            const tkStatus = String(tk.status).toUpperCase();
            if (tkStatus !== 'ACTIVE' && tkStatus !== 'EXTENDED') return;
            const end = new Date(tk.endTime).getTime();
            const diffMs = end - now;

            if (diffMs > 0 && diffMs <= 10 * 60 * 1000) {
              const existingIdx = updated.findIndex(a => a.id === tk.id);
              const remainingTimeStr = formatRemaining(diffMs);

              if (existingIdx !== -1) {
                const alert = updated[existingIdx];
                if (alert.expiresAt !== tk.endTime) {
                  // Session was extended/modified but still within 10-min window
                  updated[existingIdx] = {
                    ...alert,
                    expiresAt: tk.endTime,
                    soundPlayed: false,
                    dismissed: false,
                    remainingTimeStr,
                    message: `Table ${tk.tableNumber || 'N/A'} — ${tk.customer?.name || 'Guest'} expires in ${remainingTimeStr}.`
                  };
                  changed = true;
                } else {
                  // Regular countdown update
                  if (alert.remainingTimeStr !== remainingTimeStr) {
                    updated[existingIdx] = {
                      ...alert,
                      remainingTimeStr,
                      message: `Table ${tk.tableNumber || 'N/A'} — ${tk.customer?.name || 'Guest'} expires in ${remainingTimeStr}.`
                    };
                    changed = true;
                  }
                }
              } else {
                // Generate a brand new expiry alert
                updated.push({
                  id: tk.id,
                  tableId: tk.tableId || tk.table?.id || '',
                  title: 'Session Expiring Soon',
                  message: `Table ${tk.tableNumber || 'N/A'} — ${tk.customer?.name || 'Guest'} expires in ${remainingTimeStr}.`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  tokenNumber: tk.tokenNumber,
                  customerName: tk.customer?.name || 'Guest',
                  tableNumber: tk.tableNumber || 'N/A',
                  remainingTimeStr,
                  expiresAt: tk.endTime,
                  soundPlayed: false,
                  dismissed: false
                });
                changed = true;
              }
            } else {
              // Outside of 10-minute warning scope (e.g. extended > 10m or fully expired)
              const existingIdx = updated.findIndex(a => a.id === tk.id);
              if (existingIdx !== -1) {
                updated = updated.filter(a => a.id !== tk.id);
                changed = true;
              }
            }
          });

          // Play notification chime once per warning event
          updated.forEach(a => {
            if (!a.soundPlayed && !a.dismissed) {
              playChime();
              a.soundPlayed = true;
              changed = true;
            }
          });

          return changed ? updated : prevAlerts;
        });
      }, 1000);

      // 10-second sync interval for background fetches (multi-user updates)
      const syncInterval = setInterval(() => {
        refreshTokens();
        refreshTables();
        refreshReservations();
      }, 10000);

      return () => {
        clearInterval(countdownInterval);
        clearInterval(syncInterval);
      };
    } else {
      // Clear cache on logout
      setTokens([]);
      setAllSessions([]);
      setTables([]);
      setReservations([]);
      setRates([]);
      setUsers([]);
      setSessionAlerts([]);
    }
  }, [user]);

  return (
    <DataContext.Provider
      value={{
        tokens,
        allSessions,
        tables,
        reservations,
        rates,
        users,
        isLoading,
        sessionAlerts,
        dismissAlert,
        refreshTokens,
        refreshAllSessions,
        refreshTables,
        refreshReservations,
        refreshRates,
        refreshUsers,
        refreshAll,
      }}
    >
 {children}
 </DataContext.Provider>
 );
};

export const useData = () => {
 const context = useContext(DataContext);
 if (context === undefined) {
 throw new Error('useData must be used within a DataProvider');
 }
 return context;
};
