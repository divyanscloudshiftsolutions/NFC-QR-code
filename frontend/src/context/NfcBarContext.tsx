import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  User, Table, SessionToken, NotificationItem, SalesRecord, RateCard, ToastItem,
  UserRole, TableStatus, TokenStatus, PlaceType, StaffMember, InventoryCard
} from '../types/nfc_bar';
import { isTableExpiring } from './nfc_bar_utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';

interface NfcBarContextType {
  // Authentication & Screen States
  user: User | null;
  currentScreen: 'splash' | 'login' | 'app';
  activeTab: 'checkin' | 'bartender' | 'tables' | 'admin';
  notifications: NotificationItem[];
  toasts: ToastItem[];
  
  // App Operational States
  tables: Table[];
  sessions: SessionToken[];
  users: StaffMember[];
  systemMode: 'online' | 'syncing' | 'offline';
  pendingSyncCount: number;
  lastSyncTime: string;
  tokenType: 'nfc' | 'email';
  nfcEnabled: boolean;
  emailQrEnabled: boolean;

  // NFC & Return Card workflows
  activeReturnCardStep: 'idle' | 'scanning' | 'summary' | 'success';
  activeReturnCardUid: string | null;

  // Global overlay visibility tracking to prevent button overlap
  isOverlayActive: boolean;
  setOverlayActive: (active: boolean) => void;

  preselectedTableNumber: string | null;
  setPreselectedTableNumber: (tableNumber: string | null) => void;

  // Actions
  login: (id: string, pin: string) => Promise<boolean>;
  logout: () => void;
  setTab: (tab: 'checkin' | 'bartender' | 'tables' | 'admin') => void;
  showToast: (message: string, type?: ToastItem['type']) => void;
  triggerNotification: (title: string, message: string, type?: NotificationItem['type']) => void;
  markNotificationsAsRead: () => void;
  setMode: (mode: 'online' | 'syncing' | 'offline') => void;
  updateDeliveryAvailability: (nfcEnabled: boolean, emailQrEnabled: boolean) => Promise<boolean>;
  simulateSync: () => void;
  fetchLatestState: (token?: string) => Promise<void>;
  
  // Business logic mutations
  checkInGuest: (guestData: Omit<SessionToken, 'id' | 'tokenNumber' | 'startTime' | 'endTime' | 'status' | 'redemptionCount' | 'createdAt'>) => SessionToken | null;
  createPendingSession: (guestData: {
    customerName: string;
    phoneNumber: string;
    email: string;
    personsCount: number;
    placeType: string;
  }) => Promise<SessionToken | null>;
  verifyQrCode: (tokenNumber: string) => Promise<SessionToken | null>;
  activatePendingSession: (
    tokenNumber: string,
    tableNumber: string,
    amountPaid: number
  ) => Promise<SessionToken | null>;
  redeemDrinkForCard: (cardUid: string) => { success: boolean; remaining?: number; error?: string };
  undoDrinkRedemption: (cardUid: string) => { success: boolean; remaining?: number; error?: string };
  extendSessionTime: (tokenNumber: string, extraHours: number) => boolean;
  closeGuestSession: (tokenNumber: string) => boolean;

  // Table management
  addTable: (tableNumber: string, placeType: string, capacity: number) => Promise<boolean>;
  editTable: (tableId: string, tableNumber: string, placeType: string, capacity: number) => Promise<boolean>;
  updateTableStatus: (tableId: string, status: string) => Promise<boolean>;
  deleteTable: (tableId: string) => Promise<boolean>;

  // Staff management
  fetchUsers: () => Promise<boolean>;
  registerStaff: (username: string, password: string, fullName: string, role: string) => Promise<boolean>;
  updateStaff: (id: string, username: string, fullName: string, role: string, isActive: boolean, password?: string) => Promise<boolean>;
  updateStaffStatus: (id: string, isActive: boolean) => Promise<boolean>;

  // Card inventory management
  cards: InventoryCard[];
  fetchCards: () => Promise<boolean>;
  updateCardStatus: (cardUid: string, status: string) => Promise<boolean>;

  // Rate card management
  rates: RateCard[];
  fetchRates: () => Promise<boolean>;
  updateRateCard: (id: string, ratePerPerson: number, durationHours: number, maxDrinks: number, placeType?: string) => Promise<boolean>;

  // Reports management
  salesSummary: any;
  tableUtilization: any;
  hourlyBreakdown: any;
  fetchReports: (filter: string, startDate?: string, endDate?: string) => Promise<boolean>;
  
  // Return Card flow state managers
  startReturnCardFlow: () => void;
  setReturnCardStep: (step: 'idle' | 'scanning' | 'summary' | 'success') => void;
  setReturnCardUid: (uid: string | null) => void;
  cancelReturnCardFlow: () => void;
}

const NfcBarContext = createContext<NfcBarContextType | undefined>(undefined);

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

import { NativeModules } from 'react-native';

const getBackendUrl = () => {
  const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envApiUrl && envApiUrl.trim().length > 0) {
    return envApiUrl.trim();
  }

  // Production Railway fallback (localhost/local IP network fallbacks removed)
  return 'https://nfc-qr-code-production.up.railway.app/api';
};

const BACKEND_URL = getBackendUrl();

export const NfcBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);
  const [currentScreen, setCurrentScreen] = useState<'splash' | 'login' | 'app'>('splash');
  const [activeTab, setActiveTab] = useState<'checkin' | 'bartender' | 'tables' | 'admin'>('checkin');
  
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  
  const [tables, setTables] = useState<Table[]>([]);
  const [sessions, setSessions] = useState<SessionToken[]>([]);
  const [users, setUsers] = useState<StaffMember[]>([]);
  const [cards, setCards] = useState<InventoryCard[]>([]);
  const [rates, setRates] = useState<RateCard[]>([]);

  const [salesSummary, setSalesSummary] = useState<any>(null);
  const [tableUtilization, setTableUtilization] = useState<any>(null);
  const [hourlyBreakdown, setHourlyBreakdown] = useState<any>(null);
  
  const [systemMode, setSystemMode] = useState<'online' | 'syncing' | 'offline'>('online');
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<string>('21:00');
  const [nfcEnabled, setNfcEnabled] = useState<boolean>(true);
  const [emailQrEnabled, setEmailQrEnabled] = useState<boolean>(true);
  const tokenType = emailQrEnabled && !nfcEnabled ? 'email' : 'nfc';
  
  const [activeReturnCardStep, setReturnCardStep] = useState<'idle' | 'scanning' | 'summary' | 'success'>('idle');
  const [activeReturnCardUid, setReturnCardUid] = useState<string | null>(null);
  const [isOverlayActive, setOverlayActive] = useState(false);
  const [preselectedTableNumber, setPreselectedTableNumber] = useState<string | null>(null);

  const forceLogoutForExpiredSession = async () => {
    setUser(null);
    setUserToken(null);
    setCurrentScreen('splash');
    setTimeout(() => {
      setCurrentScreen('login');
    }, 100);
    showToast('Session expired. Please log in again.', 'warning', 4000);
    await AsyncStorage.removeItem('nfc_bar_user');
    await AsyncStorage.removeItem('nfc_bar_user_token');
  };

  // Global HTTP interceptor for 403 AUTH_002 redirection
  useEffect(() => {
    const originalFetch = global.fetch || window.fetch;
    const interceptedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const response = await originalFetch(input, init);
      
      if (response.status === 403) {
        try {
          const clone = response.clone();
          const data = await clone.json();
          if (data && data.error && (data.error.code === 'AUTH_002' || data.error.message?.toLowerCase().includes('token'))) {
            console.warn('API Interceptor: Unauthorized (403 AUTH_002). Redirecting to login.');
            const urlString = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url || '');
            if (!urlString.includes('/auth/login') && !urlString.includes('/auth/logout')) {
              forceLogoutForExpiredSession();
            }
          }
        } catch (e) {
          // ignore parsing error
        }
      }
      return response;
    };
    
    if (typeof global !== 'undefined') {
      global.fetch = interceptedFetch as any;
    } else if (typeof window !== 'undefined') {
      window.fetch = interceptedFetch as any;
    }
    
    return () => {
      if (typeof global !== 'undefined') {
        global.fetch = originalFetch as any;
      } else if (typeof window !== 'undefined') {
        window.fetch = originalFetch as any;
      }
    };
  }, [userToken]);

  const fetchLatestState = async (token?: string) => {
    const activeToken = token || userToken;
    if (!activeToken || systemMode === 'offline') return;

    try {
      const [occupancyRes, tokensRes] = await Promise.all([
        fetch(`${BACKEND_URL}/tables/occupancy`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        }),
        fetch(`${BACKEND_URL}/tokens/active`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        })
      ]);

      if (occupancyRes.ok) {
        const resData = await occupancyRes.json();
        if (resData.success && resData.data && resData.data.byPlaceType) {
          const fetchedTables: Table[] = [];

          Object.keys(resData.data.byPlaceType).forEach(placeTypeKey => {
            const placeTypeData = resData.data.byPlaceType[placeTypeKey];
            const pType = placeTypeKey === 'PREMIUM_LOUNGE' ? 'PREMIUM_LOUNGE' : 'STANDING_BAR';

            placeTypeData.tables.forEach((t: any) => {
              const hasToken = !!t.currentToken;
              const cap = t.capacity || 2;
              const occupiedSeats = hasToken ? t.currentToken.personsCount : 0;

              fetchedTables.push({
                id: t.id,
                number: t.tableNumber,
                placeType: pType,
                status: t.status.toLowerCase() as TableStatus,
                seats: cap,
                totalCapacity: cap,
                occupiedSeats: occupiedSeats,
                availableSeats: t.status.toLowerCase() === 'available' ? cap : 0,
                allowSharedSeating: false
              });
            });
          });

          setTables(fetchedTables);
          await AsyncStorage.setItem('nfc_bar_cached_tables', JSON.stringify(fetchedTables)).catch(() => {});
        }
      }

      if (tokensRes.ok) {
        const tokensData = await tokensRes.json();
        const fetchedSessions: SessionToken[] = tokensData.map((t: any) => ({
          id: t.id,
          tokenNumber: t.tokenNumber,
          customerName: t.customerName,
          phoneNumber: t.phoneNumber,
          email: t.email || undefined,
          persons: t.persons,
          placeType: t.placeType as PlaceType,
          tableNumber: t.tableNumber,
          amountPaid: typeof t.amountPaid === 'string' ? parseFloat(t.amountPaid) : t.amountPaid,
          startTime: t.startTime,
          endTime: t.endTime,
          redemptionLimit: t.redemptionLimit,
          redemptionCount: t.redemptionCount,
          status: t.status.toLowerCase() as TokenStatus,
          cardUid: t.cardUid,
          createdAt: t.createdAt,
          deliveryMode: t.deliveryMode,
          paymentVerified: t.paymentVerified
        }));

        setSessions(fetchedSessions);
        await AsyncStorage.setItem('nfc_bar_cached_sessions', JSON.stringify(fetchedSessions)).catch(() => {});
      }

      // Fetch users if user is admin
      const savedUserStr = await AsyncStorage.getItem('nfc_bar_user');
      const currentUser = savedUserStr ? JSON.parse(savedUserStr) : user;
      if (currentUser && currentUser.role === 'admin') {
        try {
          const usersRes = await fetch(`${BACKEND_URL}/users`, {
            headers: { 'Authorization': `Bearer ${activeToken}` }
          });
          if (usersRes.ok) {
            const usersData = await usersRes.json();
            if (usersData.success && usersData.data) {
              setUsers(usersData.data);
            }
          }
        } catch (usersErr) {
          console.log('Failed to fetch users inside fetchLatestState:', usersErr);
        }

        try {
          const cardsRes = await fetch(`${BACKEND_URL}/cards`, {
            headers: { 'Authorization': `Bearer ${activeToken}` }
          });
          if (cardsRes.ok) {
            const cardsData = await cardsRes.json();
            setCards(cardsData);
          }
        } catch (cardsErr) {
          console.log('Failed to fetch cards inside fetchLatestState:', cardsErr);
        }
      }

      // Fetch rates (for check-in / extensions)
      try {
        const ratesRes = await fetch(`${BACKEND_URL}/rate-cards`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        });
        if (ratesRes.ok) {
          const ratesData = await ratesRes.json();
          if (ratesData && ratesData.success && ratesData.data && ratesData.data.placeTypes) {
            const formattedRates: RateCard[] = ratesData.data.placeTypes.map((r: any) => ({
              id: r.id,
              placeType: r.name,
              ratePerPerson: parseFloat(r.ratePerPerson.toString()),
              durationHours: Math.round(r.baseTimeMinutes / 60),
              maxDrinks: r.redemptionsPerPerson
            }));
            setRates(formattedRates);
            await AsyncStorage.setItem('nfc_bar_cached_rates', JSON.stringify(formattedRates)).catch(() => {});
          }
        }
      } catch (ratesErr) {
        console.log('Failed to fetch rates inside fetchLatestState:', ratesErr);
      }
    } catch (err) {
      console.log('Failed to fetch latest server state:', err);
      if ((systemMode as any) !== 'offline') {
        setSystemMode('offline');
        showToast('Backend server unreachable. Running in Offline Mode.', 'warning');
      }
    }
  };

  const queueOperation = async (type: string, payload: any) => {
    const op = {
      operationId: generateUUID(),
      operationType: type,
      timestamp: new Date().toISOString(),
      payload
    };

    const newQueue = [...offlineQueue, op];
    setOfflineQueue(newQueue);
    setPendingSyncCount(newQueue.length);
    await AsyncStorage.setItem('nfc_bar_offline_queue', JSON.stringify(newQueue));
    
    if (systemMode !== 'offline') {
      await syncQueuedOperations(newQueue);
    } else {
      showToast('Offline Mode: Action queued locally', 'warning');
    }
  };

  const syncQueuedOperations = async (queueToSync?: any[]) => {
    const currentQueue = queueToSync || offlineQueue;
    if (currentQueue.length === 0) return;
    
    const activeToken = userToken || await AsyncStorage.getItem('nfc_bar_user_token');
    if (!activeToken) {
      console.log('Sync postponed: staff user token missing');
      return;
    }

    setSystemMode('syncing');
    showToast(`Syncing ${currentQueue.length} operations...`, 'info');

    try {
      const res = await fetch(`${BACKEND_URL}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          deviceId: 'DEVICE-MOBILE-APP',
          operations: currentQueue
        })
      });

      if (res.ok) {
        const data = await res.json();
        
        // Handle results: check for conflicts
        const conflicts = data.results.filter((r: any) => r.status === 'CONFLICT');
        const errors = data.results.filter((r: any) => r.status === 'ERROR');

        if (conflicts.length > 0) {
          conflicts.forEach((c: any) => {
            showToast(`Conflict: ${c.error.message}`, 'danger');
            triggerNotification('Sync Conflict Resolution', `Operation failed: ${c.error.message}`, 'nfc_fail');
          });
        }
        if (errors.length > 0) {
          errors.forEach((e: any) => {
            showToast(`Error: ${e.error.message}`, 'danger');
          });
        }

        const successCount = data.results.filter((r: any) => r.status === 'SUCCESS').length;
        if (successCount > 0) {
          showToast(`Successfully synced ${successCount} operations`, 'success');
          const now = new Date();
          setLastSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
          triggerNotification('Offline Sync Completed', `All queued actions synchronized successfully.`, 'sync_complete');
        }

        // Clear queue upon completion (or keep failed errors/conflicts for analysis, but since it is conflict resolved, we clear queue)
        setOfflineQueue([]);
        setPendingSyncCount(0);
        await AsyncStorage.removeItem('nfc_bar_offline_queue');
        setSystemMode('online');

        // Fetch latest backend state to override local state
        await fetchLatestState(activeToken);
      } else {
        // Server responded with an error (e.g. 400, 401, 500)
        // We remain ONLINE because the server was reached successfully.
        const errData = await res.json().catch(() => null);
        showToast(errData?.error?.message || `Sync failed: Server returned status ${res.status}`, 'danger');
        setSystemMode('online');
      }
    } catch (e) {
      console.log('Sync failed, network unreachable:', e);
      setSystemMode('offline');
      showToast('Network unreachable. Running in Offline Mode.', 'warning');
    }
  };

  const simulateSync = () => {
    syncQueuedOperations();
  };

  useEffect(() => {
    // Load persisted user and queue
    const initializeApp = async () => {
      try {
        const savedUser = await AsyncStorage.getItem('nfc_bar_user');
        if (savedUser) {
          setUser(JSON.parse(savedUser));
          setCurrentScreen('app');
        }
        const savedToken = await AsyncStorage.getItem('nfc_bar_user_token');
        if (savedToken) {
          setUserToken(savedToken);
          fetchLatestState(savedToken);
        }
        const queueStr = await AsyncStorage.getItem('nfc_bar_offline_queue');
        if (queueStr) {
          const q = JSON.parse(queueStr);
          setOfflineQueue(q);
          setPendingSyncCount(q.length);
        }

        const savedTables = await AsyncStorage.getItem('nfc_bar_cached_tables');
        if (savedTables) {
          setTables(JSON.parse(savedTables));
        }

        const savedSessions = await AsyncStorage.getItem('nfc_bar_cached_sessions');
        if (savedSessions) {
          setSessions(JSON.parse(savedSessions));
        }

        const savedRates = await AsyncStorage.getItem('nfc_bar_cached_rates');
        if (savedRates) {
          setRates(JSON.parse(savedRates));
        }

        const savedNotifications = await AsyncStorage.getItem('nfc_bar_cached_notifications');
        if (savedNotifications) {
          setNotifications(JSON.parse(savedNotifications));
        }
      } catch (err) {
        console.error('Failed to initialize app storage:', err);
      }
      
      // Fetch config from backend
      try {
        const configRes = await fetch(`${BACKEND_URL}/config`).catch(() => null);
        if (configRes && configRes.ok) {
          const configData = await configRes.json();
          if (configData && configData.success) {
            if (typeof configData.nfcEnabled === 'boolean') setNfcEnabled(configData.nfcEnabled);
            if (typeof configData.emailQrEnabled === 'boolean') setEmailQrEnabled(configData.emailQrEnabled);
          }
        }
      } catch (configErr) {
        console.log('Failed to fetch config, defaulting to nfc:', configErr);
      }
    };
    initializeApp();

    let prevOnlineState: boolean | null = null;

    // Subscribe to NetInfo connection updates
    const unsubscribe = NetInfo.addEventListener(state => {
      const isOnline = state.isConnected !== false;
      
      if (prevOnlineState !== null && prevOnlineState !== isOnline) {
        if (isOnline) {
          showToast('Back online: Connection restored successfully.', 'success', 3000);
        } else {
          showToast('Connection lost: Switched to Offline Mode.', 'warning', 3000);
        }
      }
      prevOnlineState = isOnline;

      if (isOnline) {
        setSystemMode('online');
        AsyncStorage.getItem('nfc_bar_user_token').then(tok => {
          if (tok && tok.startsWith('offline-mock-')) {
            forceLogoutForExpiredSession();
            showToast('Connection restored. Please log in to resume online operations.', 'info', 5000);
          } else {
            // trigger auto-sync
            syncQueuedOperations();
          }
        }).catch(() => {
          // fallback auto-sync
          syncQueuedOperations();
        });
      } else {
        setSystemMode('offline');
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Toast manager helper
  const showToast = (message: string, type: ToastItem['type'] = 'info', duration = 2000) => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration); // dynamic duration (default 2s)
  };

  // Notification triggers
  const triggerNotification = (title: string, message: string, type: NotificationItem['type'] = 'general') => {
    const now = new Date();
    const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newNotif: NotificationItem = {
      id: Math.random().toString(),
      type,
      title,
      message,
      timestamp,
      read: false,
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const markNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  // Auth operations
  const login = async (id: string, pin: string): Promise<boolean> => {
    let apiUsername = id;
    let apiPassword = pin;

    const lowerId = id.toLowerCase();
    if (lowerId === 'rec-01') {
      apiUsername = 'receptionist';
      apiPassword = 'recep123';
    } else if (lowerId === 'bar-02') {
      apiUsername = 'bartender';
      apiPassword = 'bar123';
    } else if (lowerId === 'adm-03') {
      apiUsername = 'admin';
      apiPassword = 'admin123';
    } else if (lowerId === 'mgr-04') {
      apiUsername = 'manager';
      apiPassword = 'manager123';
    }

    try {
      const res = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: apiUsername, password: apiPassword })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const loggedUser: User = {
            id: data.user.id,
            name: data.user.name,
            role: data.user.roleDetail.name.toLowerCase() as UserRole,
            pin: pin,
            avatar: data.user.roleDetail.name.toLowerCase() === 'bartender' ? '👨‍🍳' : (data.user.roleDetail.name.toLowerCase() === 'manager' ? '👑' : (data.user.roleDetail.name.toLowerCase() === 'admin' ? '🛡️' : '👩‍💼'))
          };
          setUser(loggedUser);
          setUserToken(data.token || data.accessToken);
          await AsyncStorage.setItem('nfc_bar_user', JSON.stringify(loggedUser));
          await AsyncStorage.setItem('nfc_bar_user_token', data.token || data.accessToken);
          setCurrentScreen('app');
          showToast(`Welcome back, ${loggedUser.name}!`, 'success');
          
          if (loggedUser.role === UserRole.BARTENDER) {
            setActiveTab('bartender');
          } else if (loggedUser.role === UserRole.MANAGER) {
            setActiveTab('tables');
          } else {
            setActiveTab('checkin');
          }

          // Fetch latest state immediately
          fetchLatestState(data.token || data.accessToken);
          return true;
        }
      }
    } catch (err) {
      console.log('Online login failed, trying fallback:', err);
    }
    // Fallback to local cache validation of the last logged-in user
    try {
      const savedUserStr = await AsyncStorage.getItem('nfc_bar_user');
      if (savedUserStr) {
        const savedUser = JSON.parse(savedUserStr);
        if (savedUser && savedUser.id.toLowerCase() === id.toLowerCase() && savedUser.pin === pin) {
          setUser(savedUser);
          const offlineToken = `offline-mock-${savedUser.id}`;
          setUserToken(offlineToken);
          setSystemMode('offline');
          await AsyncStorage.setItem('nfc_bar_user', JSON.stringify(savedUser));
          await AsyncStorage.setItem('nfc_bar_user_token', offlineToken);
          setCurrentScreen('app');
          showToast(`Welcome back, ${savedUser.name} (Offline)!`, 'success');
          
          if (savedUser.role === UserRole.BARTENDER) {
            setActiveTab('bartender');
          } else if (savedUser.role === UserRole.MANAGER) {
            setActiveTab('tables');
          } else {
            setActiveTab('checkin');
          }
          return true;
        }
      }
    } catch (cacheErr) {
      console.log('Failed to validate offline cache:', cacheErr);
    }

    return false;
  };

  const logout = async () => {
    setUser(null);
    setUserToken(null);
    setCurrentScreen('login');
    setReturnCardStep('idle');
    setReturnCardUid(null);
    showToast('Logged out successfully', 'info');
    await AsyncStorage.removeItem('nfc_bar_user');
    await AsyncStorage.removeItem('nfc_bar_user_token');
  };

  const setTab = (tab: 'checkin' | 'bartender' | 'tables' | 'admin') => {
    // Permission checks
    if (!user) return;
    if (user.role === UserRole.BARTENDER && tab !== 'bartender') {
      showToast('Access denied for Bartender', 'danger');
      return;
    }
    if (user.role === UserRole.MANAGER && (tab === 'checkin' || tab === 'bartender')) {
      showToast('Access restricted to Manager', 'danger');
      return;
    }
    setActiveTab(tab);
  };

  // Set system network connection state
  const setMode = (mode: 'online' | 'syncing' | 'offline') => {
    if (mode === 'online' && systemMode === 'offline' && pendingSyncCount > 0) {
      setSystemMode('syncing');
      setTimeout(() => {
        setSystemMode('online');
        setPendingSyncCount(0);
        const now = new Date();
        setLastSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        showToast('Online sync completed!', 'success');
      }, 1500);
    } else {
      setSystemMode(mode);
      if (mode === 'offline') {
        showToast('Offline Mode: Actions queued locally.', 'warning');
      }
    }
  };

  const updateDeliveryAvailability = async (nfc: boolean, emailQr: boolean): Promise<boolean> => {
    if (systemMode === 'offline') {
      showToast('Cannot change settings in Offline Mode.', 'danger');
      return false;
    }
    try {
      const activeToken = userToken || await AsyncStorage.getItem('nfc_bar_user_token');
      const res = await fetch(`${BACKEND_URL}/config/delivery-methods`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ nfcEnabled: nfc, emailQrEnabled: emailQr })
      });
      if (res.ok) {
        const data = await res.json();
        setNfcEnabled(data.nfcEnabled);
        setEmailQrEnabled(data.emailQrEnabled);
        showToast('System configuration saved successfully.', 'success');
        return true;
      } else {
        const data = await res.json().catch(() => null);
        showToast(data?.error?.message || 'Failed to update system config.', 'danger');
      }
    } catch (err: any) {
      showToast('Network error updating configurations.', 'danger');
    }
    return false;
  };

  // CHECK-IN ACTION
  const checkInGuest = (guestData: Omit<SessionToken, 'id' | 'tokenNumber' | 'startTime' | 'endTime' | 'status' | 'redemptionCount' | 'createdAt'>): SessionToken | null => {
    // Validation: Check if table is occupied
    const tableIndex = tables.findIndex(t => t.number === guestData.tableNumber);
    if (tableIndex === -1 || tables[tableIndex].status === TableStatus.OCCUPIED || tables[tableIndex].status === TableStatus.MAINTENANCE) {
      showToast('Table is occupied or in maintenance!', 'danger');
      return null;
    }

    const now = new Date();
    const tokenNumber = `BAR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(10000 + Math.random() * 90000))}`;
    
    // Calculate durations dynamically
    const rateCard = rates.find(r => r.placeType === guestData.placeType);
    const durationHours = rateCard ? rateCard.durationHours : (guestData.placeType === 'PREMIUM_LOUNGE' ? 3 : 2);
    const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

    const newSession: SessionToken = {
      id: Math.random().toString(),
      tokenNumber,
      customerName: guestData.customerName,
      phoneNumber: guestData.phoneNumber,
      email: guestData.email,
      persons: guestData.persons,
      placeType: guestData.placeType,
      tableNumber: guestData.tableNumber,
      amountPaid: guestData.amountPaid,
      startTime: now.toISOString(),
      endTime: endTime.toISOString(),
      redemptionLimit: guestData.redemptionLimit,
      redemptionCount: 0,
      status: TokenStatus.ACTIVE,
      cardUid: guestData.cardUid,
      paymentVerified: true,
      createdAt: now.toISOString(),
    };

    // Update table state (Optimistic UI)
    setTables(prev => prev.map(t => t.number === guestData.tableNumber ? { 
      ...t, 
      status: TableStatus.OCCUPIED,
      occupiedSeats: guestData.persons,
      availableSeats: t.allowSharedSeating ? (t.totalCapacity - guestData.persons) : 0
    } : t));
    setSessions(prev => [newSession, ...prev]);

    // Queue operation
    const tableObj = tables[tableIndex];
    queueOperation('CHECK_IN', {
      phoneNumber: guestData.phoneNumber,
      customerName: guestData.customerName,
      email: guestData.email,
      personsCount: guestData.persons,
      placeType: guestData.placeType,
      tableNumber: guestData.tableNumber,
      tableId: tableObj?.id,
      amountPaid: guestData.amountPaid,
      paymentVerified: true,
      issuedBy: user?.id || 'staff-uuid',
      nfcCardUid: guestData.cardUid,
      deliveryMode: guestData.deliveryMode
    });

    showToast(`Registered check-in for ${guestData.customerName}`, 'success');
    return newSession;
  };

  const createPendingSession = async (guestData: {
    customerName: string;
    phoneNumber: string;
    email: string;
    personsCount: number;
    placeType: string;
  }): Promise<SessionToken | null> => {
    try {
      const activeToken = userToken || await AsyncStorage.getItem('nfc_bar_user_token');
      const res = await fetch(`${BACKEND_URL}/check-in/pending`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify(guestData)
      });

      if (res.ok) {
        const data = await res.json();
        setSessions(prev => [data, ...prev]);
        showToast(`QR check-in pending for ${guestData.customerName}`, 'success');
        return data;
      } else {
        const errData = await res.json().catch(() => null);
        showToast(errData?.error?.message || 'Failed to create pending session.', 'danger');
      }
    } catch (err: any) {
      showToast('Network error creating pending session.', 'danger');
    }
    return null;
  };

  const verifyQrCode = async (tokenNumber: string): Promise<SessionToken | null> => {
    try {
      const activeToken = userToken || await AsyncStorage.getItem('nfc_bar_user_token');
      const res = await fetch(`${BACKEND_URL}/check-in/verify-qr/${tokenNumber}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        return data;
      } else {
        const errData = await res.json().catch(() => null);
        showToast(errData?.error?.message || 'Invalid or expired QR code.', 'danger');
      }
    } catch (err: any) {
      showToast('Network error validating QR code.', 'danger');
    }
    return null;
  };

  const activatePendingSession = async (
    tokenNumber: string,
    tableNumber: string,
    amountPaid: number
  ): Promise<SessionToken | null> => {
    try {
      const activeToken = userToken || await AsyncStorage.getItem('nfc_bar_user_token');
      const res = await fetch(`${BACKEND_URL}/check-in/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ tokenNumber, tableNumber, amountPaid })
      });

      if (res.ok) {
        const data = await res.json();
        setSessions(prev => prev.map(s => s.tokenNumber === tokenNumber ? data : s));
        setTables(prev => prev.map(t => t.number === tableNumber ? {
          ...t,
          status: TableStatus.OCCUPIED,
          occupiedSeats: data.persons,
          availableSeats: t.allowSharedSeating ? (t.totalCapacity - data.persons) : 0
        } : t));
        showToast('Check-in session activated successfully.', 'success');
        return data;
      } else {
        const errData = await res.json().catch(() => null);
        showToast(errData?.error?.message || 'Failed to activate session.', 'danger');
      }
    } catch (err: any) {
      showToast('Network error activating session.', 'danger');
    }
    return null;
  };

  // REDEEM DRINK ACTION
  const redeemDrinkForCard = (cardUidOrToken: string): { success: boolean; remaining?: number; error?: string } => {
    const sessionIndex = sessions.findIndex(s => 
      (s.cardUid === cardUidOrToken || s.tokenNumber === cardUidOrToken) && 
      s.status === TokenStatus.ACTIVE &&
      s.paymentVerified === true
    );
    if (sessionIndex === -1) {
      showToast('No active check-in session found!', 'danger');
      return { success: false, error: 'Invalid card or token' };
    }

    const session = sessions[sessionIndex];
    if (session.redemptionCount >= session.redemptionLimit) {
      showToast('Drink limit fully reached!', 'danger');
      return { success: false, remaining: 0, error: 'Drink limit reached' };
    }

    // Check expiration
    const now = new Date();
    if (now > new Date(session.endTime)) {
      showToast('Session has expired!', 'danger');
      return { success: false, remaining: 0, error: 'Expired session' };
    }

    const newCount = session.redemptionCount + 1;
    
    // Mutate state (Optimistic UI)
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, redemptionCount: newCount } : s));

    // Queue operation
    queueOperation('DRINK_REDEMPTION', {
      tokenNumber: session.tokenNumber,
      cardUid: session.cardUid || null,
      bartenderId: user?.id || 'staff-uuid'
    });

    showToast('Redemption recorded successfully!', 'success');
    return { success: true, remaining: session.redemptionLimit - newCount };
  };

  // UNDO REDEEM DRINK ACTION
  const undoDrinkRedemption = (cardUidOrToken: string): { success: boolean; remaining?: number; error?: string } => {
    const sessionIndex = sessions.findIndex(s => 
      (s.cardUid === cardUidOrToken || s.tokenNumber === cardUidOrToken) && 
      s.status === TokenStatus.ACTIVE
    );
    if (sessionIndex === -1) {
      showToast('No active check-in session found!', 'danger');
      return { success: false, error: 'Invalid card or token' };
    }

    const session = sessions[sessionIndex];
    if (session.redemptionCount <= 0) {
      showToast('No drink redemptions to undo!', 'danger');
      return { success: false, error: 'No redemptions to undo' };
    }

    const newCount = session.redemptionCount - 1;
    
    // Mutate state (Optimistic UI)
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, redemptionCount: newCount } : s));

    // Queue operation
    queueOperation('DRINK_UNDO', {
      tokenNumber: session.tokenNumber,
      cardUid: session.cardUid || null
    });

    showToast('Redemption undone successfully!', 'success');
    return { success: true, remaining: session.redemptionLimit - newCount };
  };

  // EXTEND TIME ACTION
  const extendSessionTime = (tokenNumber: string, extraHours: number): boolean => {
    const sessionIndex = sessions.findIndex(s => s.tokenNumber === tokenNumber && s.status === TokenStatus.ACTIVE);
    if (sessionIndex === -1) return false;

    const session = sessions[sessionIndex];
    const currentEndTime = new Date(session.endTime);
    const newEndTime = new Date(currentEndTime.getTime() + extraHours * 60 * 60 * 1000);

    // Calculate additional charge
    const rateCard = rates.find(r => r.placeType === session.placeType);
    const rate = rateCard ? rateCard.ratePerPerson : (session.placeType === 'PREMIUM_LOUNGE' ? 900 : 500);
    const additionalAmount = rate * session.persons * (extraHours / (rateCard?.durationHours || 2));

    // Mutate state (Optimistic UI)
    setSessions(prev => prev.map(s => s.tokenNumber === tokenNumber ? {
      ...s,
      endTime: newEndTime.toISOString(),
      amountPaid: s.amountPaid + additionalAmount,
      redemptionLimit: s.redemptionLimit + (rateCard ? rateCard.maxDrinks * session.persons * (extraHours / rateCard.durationHours) : 0),
    } : s));

    // Update table status (Optimistic UI)
    setTables(prev => prev.map(t => t.number === session.tableNumber ? { ...t, status: TableStatus.OCCUPIED } : t));

    // Queue operation
    queueOperation('TIME_EXTENSION', {
      tokenNumber: session.tokenNumber,
      extraMinutes: extraHours * 60,
      additionalAmount,
      approvedBy: user?.id || 'staff-uuid',
      additionalPersons: 0
    });

    showToast(`Extended session by ${extraHours} hour(s) for ₹${additionalAmount.toFixed(0)}`, 'success');
    return true;
  };

  // CLOSE SESSION ACTION (RETURN CARD)
  const closeGuestSession = (tokenNumber: string): boolean => {
    const sessionIndex = sessions.findIndex(s => s.tokenNumber === tokenNumber && s.status === TokenStatus.ACTIVE);
    if (sessionIndex === -1) return false;

    const session = sessions[sessionIndex];
    
    // Prevent closing unpaid pending QR sessions
    if (session.deliveryMode === 'EMAIL_QR' && session.paymentVerified !== true) {
      showToast('Cannot close unpaid pending QR session.', 'warning');
      return false;
    }
    
    // Close token (Optimistic UI)
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: TokenStatus.CLOSED } : s));
    
    // Release table (Optimistic UI)
    setTables(prev => prev.map(t => t.number === session.tableNumber ? { 
      ...t, 
      status: TableStatus.AVAILABLE,
      occupiedSeats: 0,
      availableSeats: t.totalCapacity
    } : t));

    // Queue operation
    queueOperation('SESSION_CLOSE', {
      tokenNumber: session.tokenNumber,
      cardUid: session.cardUid,
      closedBy: user?.id || 'staff-uuid',
      eraseCard: true
    });

    showToast(`Released table ${session.tableNumber} and closed session`, 'success');
    return true;
  };

  // Return Card flow state actions
  const startReturnCardFlow = () => {
    setReturnCardStep('idle');
    setReturnCardUid(null);
  };

  const cancelReturnCardFlow = () => {
    setReturnCardStep('idle');
    setReturnCardUid(null);
  };

  const addTable = async (tableNumber: string, placeType: string, capacity: number): Promise<boolean> => {
    if (systemMode !== 'offline') {
      try {
        const res = await fetch(`${BACKEND_URL}/tables`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`
          },
          body: JSON.stringify({ tableNumber, placeType, capacity })
        });
        if (res.ok) {
          showToast(`Table ${tableNumber} added successfully`, 'success');
          await fetchLatestState();
          return true;
        } else {
          const errData = await res.json();
          showToast(`Failed to add table: ${errData.error?.message || 'Error'}`, 'danger');
          return false;
        }
      } catch (err: any) {
        console.log('addTable connection failed, falling back to offline:', err);
        setSystemMode('offline');
        // Offline fallback
        const newTable: Table = {
          id: Math.random().toString(),
          number: tableNumber,
          placeType: placeType as PlaceType,
          status: TableStatus.AVAILABLE,
          seats: capacity,
          totalCapacity: capacity,
          occupiedSeats: 0,
          availableSeats: capacity,
          allowSharedSeating: false
        };
        setTables(prev => [...prev, newTable]);
        showToast(`Table ${tableNumber} created locally (Offline fallback)`, 'success');
        return true;
      }
    } else {
      // Offline fallback
      const newTable: Table = {
        id: Math.random().toString(),
        number: tableNumber,
        placeType: placeType as PlaceType,
        status: TableStatus.AVAILABLE,
        seats: capacity,
        totalCapacity: capacity,
        occupiedSeats: 0,
        availableSeats: capacity,
        allowSharedSeating: false
      };
      setTables(prev => [...prev, newTable]);
      showToast(`Table ${tableNumber} created locally (Offline)`, 'success');
      return true;
    }
  };

  const editTable = async (tableId: string, tableNumber: string, placeType: string, capacity: number): Promise<boolean> => {
    if (systemMode !== 'offline') {
      try {
        const res = await fetch(`${BACKEND_URL}/tables/${tableId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`
          },
          body: JSON.stringify({ tableNumber, placeType, capacity })
        });
        if (res.ok) {
          showToast(`Table ${tableNumber} updated successfully`, 'success');
          await fetchLatestState();
          return true;
        } else {
          const errData = await res.json();
          showToast(`Failed to update table: ${errData.error?.message || 'Error'}`, 'danger');
          return false;
        }
      } catch (err: any) {
        showToast(`Failed to connect to backend: ${err.message}`, 'danger');
        return false;
      }
    } else {
      // Offline fallback
      setTables(prev => prev.map(t => t.id === tableId ? {
        ...t,
        number: tableNumber,
        placeType: placeType as PlaceType,
        seats: capacity,
        totalCapacity: capacity,
        availableSeats: t.status === TableStatus.AVAILABLE ? capacity : t.availableSeats
      } : t));
      showToast(`Table ${tableNumber} updated locally (Offline)`, 'success');
      return true;
    }
  };

  const updateTableStatus = async (tableId: string, status: string): Promise<boolean> => {
    if (systemMode !== 'offline') {
      try {
        const res = await fetch(`${BACKEND_URL}/tables/${tableId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`
          },
          body: JSON.stringify({ status })
        });
        if (res.ok) {
          showToast(`Table status updated to ${status}`, 'success');
          await fetchLatestState();
          return true;
        } else {
          const errData = await res.json();
          showToast(`Failed to update status: ${errData.error?.message || 'Error'}`, 'danger');
          return false;
        }
      } catch (err: any) {
        showToast(`Failed to connect to backend: ${err.message}`, 'danger');
        return false;
      }
    } else {
      // Offline fallback
      setTables(prev => prev.map(t => t.id === tableId ? {
        ...t,
        status: status.toLowerCase() as TableStatus
      } : t));
      showToast(`Table status updated to ${status} locally (Offline)`, 'success');
      return true;
    }
  };

  const deleteTable = async (tableId: string): Promise<boolean> => {
    if (systemMode !== 'offline') {
      try {
        const res = await fetch(`${BACKEND_URL}/tables/${tableId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${userToken}`
          }
        });
        if (res.ok) {
          showToast('Table deleted successfully', 'success');
          await fetchLatestState();
          return true;
        } else {
          const errData = await res.json();
          showToast(`Failed to delete table: ${errData.error?.message || 'Error'}`, 'danger');
          return false;
        }
      } catch (err: any) {
        showToast(`Failed to connect to backend: ${err.message}`, 'danger');
        return false;
      }
    } else {
      // Offline fallback
      setTables(prev => prev.filter(t => t.id !== tableId));
      showToast('Table deleted locally (Offline)', 'success');
      return true;
    }
  };

  const fetchUsers = async (): Promise<boolean> => {
    if (systemMode === 'offline') return false;
    const activeToken = userToken || await AsyncStorage.getItem('nfc_bar_user_token');
    if (!activeToken) return false;

    try {
      const res = await fetch(`${BACKEND_URL}/users`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setUsers(data.data);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.log('Failed to fetch users:', err);
      return false;
    }
  };

  const registerStaff = async (username: string, password: string, fullName: string, role: string): Promise<boolean> => {
    if (systemMode === 'offline') {
      showToast('Cannot register staff while offline', 'danger');
      return false;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ username, password, fullName, roleName: role })
      });

      if (res.ok) {
        showToast(`Staff ${username} registered successfully`, 'success');
        await fetchUsers();
        return true;
      } else {
        const errData = await res.json();
        showToast(`Failed to register staff: ${errData.error?.message || 'Error'}`, 'danger');
        return false;
      }
    } catch (err: any) {
      showToast(`Connection failed: ${err.message}`, 'danger');
      return false;
    }
  };

  const updateStaff = async (id: string, username: string, fullName: string, role: string, isActive: boolean, password?: string): Promise<boolean> => {
    if (systemMode === 'offline') {
      showToast('Cannot edit staff while offline', 'danger');
      return false;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/users/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ username, fullName, roleName: role, isActive, password })
      });

      if (res.ok) {
        showToast(`Staff ${username} updated successfully`, 'success');
        await fetchUsers();
        if (user && user.id === id) {
          const updatedLoggedUser = {
            ...user,
            name: fullName,
            role: role.toLowerCase() as UserRole
          };
          setUser(updatedLoggedUser);
          await AsyncStorage.setItem('nfc_bar_user', JSON.stringify(updatedLoggedUser));
        }
        return true;
      } else {
        const errData = await res.json();
        showToast(`Failed to update staff: ${errData.error?.message || 'Error'}`, 'danger');
        return false;
      }
    } catch (err: any) {
      showToast(`Connection failed: ${err.message}`, 'danger');
      return false;
    }
  };

  const updateStaffStatus = async (id: string, isActive: boolean): Promise<boolean> => {
    if (systemMode === 'offline') {
      showToast('Cannot toggle status while offline', 'danger');
      return false;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/users/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ isActive })
      });

      if (res.ok) {
        showToast(`Staff status updated successfully`, 'success');
        await fetchUsers();
        return true;
      } else {
        const errData = await res.json();
        showToast(`Failed to update status: ${errData.error?.message || 'Error'}`, 'danger');
        return false;
      }
    } catch (err: any) {
      showToast(`Connection failed: ${err.message}`, 'danger');
      return false;
    }
  };

  const fetchCards = async (): Promise<boolean> => {
    if (systemMode === 'offline') return false;
    const activeToken = userToken || await AsyncStorage.getItem('nfc_bar_user_token');
    if (!activeToken) return false;

    try {
      const res = await fetch(`${BACKEND_URL}/cards`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCards(data);
        return true;
      }
      return false;
    } catch (err) {
      console.log('Failed to fetch cards:', err);
      return false;
    }
  };

  const updateCardStatus = async (cardUid: string, status: string): Promise<boolean> => {
    if (systemMode === 'offline') {
      showToast('Cannot update card status while offline', 'danger');
      return false;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/cards/${cardUid}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ status })
      });

      if (res.ok) {
        showToast(`Card ${cardUid} status updated to ${status}`, 'success');
        await fetchCards();
        return true;
      } else {
        const errData = await res.json();
        showToast(`Failed to update card: ${errData.error?.message || 'Error'}`, 'danger');
        return false;
      }
    } catch (err: any) {
      showToast(`Connection failed: ${err.message}`, 'danger');
      return false;
    }
  };

  const fetchRates = async (): Promise<boolean> => {
    if (systemMode === 'offline') return false;
    const activeToken = userToken || await AsyncStorage.getItem('nfc_bar_user_token');
    if (!activeToken) return false;

    try {
      const res = await fetch(`${BACKEND_URL}/rate-cards`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const ratesData = await res.json();
        if (ratesData.success && ratesData.data && ratesData.data.placeTypes) {
          const formattedRates: RateCard[] = ratesData.data.placeTypes.map((r: any) => ({
            id: r.id,
            placeType: r.name,
            ratePerPerson: parseFloat(r.ratePerPerson.toString()),
            durationHours: Math.round(r.baseTimeMinutes / 60),
            maxDrinks: r.redemptionsPerPerson
          }));
          setRates(formattedRates);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.log('Failed to fetch rates:', err);
      return false;
    }
  };

  const updateRateCard = async (id: string, ratePerPerson: number, durationHours: number, maxDrinks: number, placeType?: string): Promise<boolean> => {
    if (systemMode === 'offline') {
      setRates(prev => prev.map(r => r.id === id || r.placeType === placeType ? {
        ...r,
        ratePerPerson,
        durationHours,
        maxDrinks
      } : r));
      queueOperation('UPDATE_RATE_CARD', { id, ratePerPerson, durationHours, maxDrinks, placeType });
      showToast(`Rate card updated locally (Offline)`, 'success');
      return true;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/rate-cards/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          ratePerPerson,
          baseDurationHours: durationHours,
          maxDrinksPerPerson: maxDrinks,
          placeType
        })
      });

      if (res.ok) {
        showToast(`Rate card updated successfully`, 'success');
        await fetchRates();
        return true;
      } else {
        const errData = await res.json();
        showToast(`Failed to update rates: ${errData.error?.message || 'Error'}`, 'danger');
        return false;
      }
    } catch (err: any) {
      console.log('updateRateCard connection failed, falling back to offline:', err);
      setSystemMode('offline');
      setRates(prev => prev.map(r => r.id === id || r.placeType === placeType ? {
        ...r,
        ratePerPerson,
        durationHours,
        maxDrinks
      } : r));
      queueOperation('UPDATE_RATE_CARD', { id, ratePerPerson, durationHours, maxDrinks, placeType });
      showToast(`Rate card updated locally (Offline fallback)`, 'success');
      return true;
    }
  };

  const fetchReports = async (filter: string, startDate?: string, endDate?: string): Promise<boolean> => {
    if (systemMode === 'offline') {
      return false;
    }

    try {
      const activeToken = userToken || await AsyncStorage.getItem('nfc_bar_user_token');
      if (!activeToken) return false;

      const params = new URLSearchParams();
      if (filter) params.append('filter', filter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const queryStr = params.toString() ? `?${params.toString()}` : '';

      const [salesRes, utilRes, hourlyRes] = await Promise.all([
        fetch(`${BACKEND_URL}/reports/sales${queryStr}`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        }),
        fetch(`${BACKEND_URL}/reports/table-utilization${queryStr}`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        }),
        fetch(`${BACKEND_URL}/reports/hourly-breakdown${queryStr}`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        })
      ]);

      if (salesRes.ok && utilRes.ok && hourlyRes.ok) {
        const salesData = await salesRes.json();
        const utilData = await utilRes.json();
        const hourlyData = await hourlyRes.json();

        setSalesSummary(salesData.data || salesData);
        setTableUtilization(utilData.data || utilData);
        setHourlyBreakdown(hourlyData.data || hourlyData);
        return true;
      }
      return false;
    } catch (err) {
      console.log('Failed to fetch reports:', err);
      return false;
    }
  };

  return (
    <NfcBarContext.Provider value={{
      user, currentScreen, activeTab, notifications, toasts,
      tables, sessions, users, cards, rates, systemMode, pendingSyncCount, lastSyncTime, tokenType,
      nfcEnabled, emailQrEnabled,
      activeReturnCardStep, activeReturnCardUid, isOverlayActive, setOverlayActive,
      preselectedTableNumber, setPreselectedTableNumber,
      salesSummary, tableUtilization, hourlyBreakdown,
      login, logout, setTab, showToast, triggerNotification, markNotificationsAsRead,
      setMode, updateDeliveryAvailability, simulateSync, fetchLatestState,
      checkInGuest, createPendingSession, verifyQrCode, activatePendingSession, redeemDrinkForCard, undoDrinkRedemption, extendSessionTime, closeGuestSession,
      addTable, editTable, updateTableStatus, deleteTable,
      fetchUsers, registerStaff, updateStaff, updateStaffStatus,
      fetchCards, updateCardStatus,
      fetchRates, updateRateCard,
      fetchReports,
      startReturnCardFlow, setReturnCardStep, setReturnCardUid, cancelReturnCardFlow
    }}>
      {children}
    </NfcBarContext.Provider>
  );
};

export const useNfcBar = () => {
  const context = useContext(NfcBarContext);
  if (!context) throw new Error('useNfcBar must be used within NfcBarProvider');
  return context;
};
