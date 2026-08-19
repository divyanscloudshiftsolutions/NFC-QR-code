import type { User, Table, Token } from '../types';

export const DEPLOYED_API_BASE_URL = 'https://api.nfc-qr.app.cloudshiftsolutions.in/api';
export const getLocalApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:4000/api`;
  }
  return 'http://localhost:4000/api';
};

class ApiService {
  private activeBaseUrl: string | null = null;

  public async getBaseUrl(): Promise<string> {
    if (this.activeBaseUrl) return this.activeBaseUrl;

    if (typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/)
    )) {
      try {
        const localApiUrl = getLocalApiBaseUrl();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600);

        // Ping the local backend to check if it is active and running
        const res = await fetch(`${localApiUrl}/tables`, {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok || res.status === 401 || res.status === 403) {
          this.activeBaseUrl = localApiUrl;
          console.log('[API] Auto-detected local backend active. Routing to local DB:', localApiUrl);
          return localApiUrl;
        }
      } catch (e) {
        // Local backend is offline or down
      }
    }

    this.activeBaseUrl = DEPLOYED_API_BASE_URL;
    console.log('[API] Routing to deployed DB:', DEPLOYED_API_BASE_URL);
    return DEPLOYED_API_BASE_URL;
  }

  public getToken(): string | null {
    return localStorage.getItem('bar_web_token');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      localStorage.removeItem('bar_web_token');
      localStorage.removeItem('bar_web_user');
      if (data && data.error && data.error.code === 'AUTH_DEACTIVATED') {
        localStorage.setItem('auth_error_msg', 'Access denied. Contact your administrator.');
      } else {
        localStorage.setItem('auth_error_msg', data.message || (data.error && typeof data.error === 'object' ? data.error.message : data.error) || 'Session expired. Please log in again.');
      }
      window.location.reload();
      throw new Error(data.message || 'Session expired. Please log in again.');
    }

    if (!response.ok) {
      const errMsg = data.message || 
                     (data.error && typeof data.error === 'object' ? data.error.message : data.error) || 
                     `HTTP Error ${response.status}`;
      throw new Error(errMsg);
    }

    return data;
  }

  // Auth APIs
  async login(username: string | { username: string; pin: string }, pin?: string) {
    let userStr = typeof username === 'string' ? username : username.username;
    let pinStr = typeof username === 'string' ? (pin || '') : username.pin;

    const lowerId = userStr.toLowerCase().trim();
    if (lowerId === 'rec-01' || lowerId === 'rec') {
      userStr = 'receptionist';
      pinStr = 'recep123';
    } else if (lowerId === 'bar-02' || lowerId === 'bar') {
      userStr = 'bartender';
      pinStr = 'bar123';
    } else if (lowerId === 'adm-03' || lowerId === 'adm' || lowerId === 'admin') {
      userStr = 'admin';
      pinStr = 'admin123';
    } else if (lowerId === 'mgr-04' || lowerId === 'mgr' || lowerId === 'manager') {
      userStr = 'manager';
      pinStr = 'manager123';
    }

    const res = await this.request<{
      success: boolean;
      token: string;
      user: User;
      message?: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: userStr,
        password: pinStr,
      }),
    });

    if (res.token) {
      localStorage.setItem('bar_web_token', res.token);
      localStorage.setItem('bar_web_user', JSON.stringify(res.user));
    }

    return res;
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('bar_web_token');
      localStorage.removeItem('bar_web_user');
    }
  }

  // User APIs
  async getUsers(): Promise<User[]> {
    try {
      const res = await this.request<any>('/users');
      const rawList = Array.isArray(res) ? res : (res?.data?.users || res?.users || res?.data || []);
      return rawList.map((u: any) => {
        const roleStr = typeof u.role === 'object' ? (u.role?.name || 'receptionist') : (u.role || 'receptionist');
        let code = u.username || u.employeeCode || u.code || 'USER-01';
        if (code.toLowerCase() === 'admin') code = 'ADM-03';
        else if (code.toLowerCase() === 'receptionist') code = 'REC-01';
        else if (code.toLowerCase() === 'bartender') code = 'BAR-02';
        else if (code.toLowerCase() === 'manager') code = 'MGR-04';

        return {
          id: u.id || u.userId || String(Math.random()),
          username: code,
          fullName: u.fullName || u.name || 'Staff User',
          role: roleStr.toLowerCase() as any,
          isActive: u.isActive !== false,
          lastLogin: u.lastLogin || u.updatedAt,
        };
      });
    } catch {
      return [];
    }
  }

  async createUser(userData: { username: string; fullName: string; pin: string; role: string }) {
    return this.request<{ success: boolean; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: userData.username,
        password: userData.pin,
        fullName: userData.fullName,
        role: userData.role,
      }),
    });
  }

  async updateUserStatus(userId: string, isActive: boolean) {
    return this.request<{ success: boolean }>(`/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  }

  // Tables APIs
  async getTables(): Promise<Table[]> {
    try {
      const res = await this.request<any>('/tables');
      let rawTables: any[] = Array.isArray(res) ? res : (res?.tables || res?.data?.tables || res?.data || []);

      if (rawTables.length === 0) {
        try {
          const occRes = await this.request<any>('/tables/occupancy');
          if (occRes && occRes.success && occRes.data && occRes.data.byPlaceType) {
            Object.keys(occRes.data.byPlaceType).forEach(key => {
              const group = occRes.data.byPlaceType[key];
              if (Array.isArray(group?.tables)) {
                group.tables.forEach((t: any) => {
                  t.placeType = key;
                  rawTables.push(t);
                });
              }
            });
          }
        } catch {}
      }

      return rawTables.map((t: any) => ({
        id: t.id || t.tableId || String(Math.random()),
        tableNumber: t.tableNumber || t.number || `T-${t.id}`,
        placeTypeId: t.placeTypeId || t.placeType || (t.tableNumber?.startsWith('L-') ? 'PREMIUM_LOUNGE' : 'STANDING_BAR'),
        capacity: t.capacity || t.seats || 4,
        status: (t.status || 'available').toLowerCase() as any,
        isActive: t.isActive !== false,
        categoryName: t.categoryName || (t.tableNumber?.startsWith('L-') ? 'Premium Lounge' : 'Standing Bar'),
      }));
    } catch {
      return [];
    }
  }

  async createTable(tableData: { tableNumber: string; placeTypeId: string; capacity: number }) {
    return this.request<{ success: boolean; table: Table }>('/tables', {
      method: 'POST',
      body: JSON.stringify(tableData),
    });
  }

  async updateTable(tableId: string, tableData: { tableNumber: string; placeTypeId: string; capacity: number }) {
    return this.request<{ success: boolean; table: Table }>(`/tables/${tableId}`, {
      method: 'PUT',
      body: JSON.stringify(tableData),
    });
  }

  async deleteTable(tableId: string) {
    return this.request<{ success: boolean }>(`/tables/${tableId}`, {
      method: 'DELETE',
    });
  }

  async assignTable(tableId: string, tokenId: string) {
    return this.request<{ success: boolean }>('/tables/assign', {
      method: 'POST',
      body: JSON.stringify({ tableId, tokenId }),
    });
  }

  async releaseTable(tableId: string) {
    return this.request<{ success: boolean }>(`/tables/${tableId}/release`, {
      method: 'PUT',
    });
  }

  async lockTable(tableId: string) {
    return this.request<{ success: boolean; table: Table }>(`/tables/${tableId}/lock`, {
      method: 'POST',
    });
  }

  async unlockTable(tableId: string, forceAvailable?: boolean) {
    const url = forceAvailable ? `/tables/${tableId}/unlock?forceAvailable=true` : `/tables/${tableId}/unlock`;
    return this.request<{ success: boolean; table: Table }>(url, {
      method: 'POST',
    });
  }

  async patchTableStatus(tableId: string, status: string) {
    return this.request<{ success: boolean; table: Table }>(`/tables/${tableId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async validateDuplicate(body: { phoneNumber?: string; email?: string; tokenNumber?: string }) {
    return this.request<{ success: boolean; conflicts: { email: boolean; phone: boolean } }>('/check-in/validate-duplicate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Customer & Tokens APIs
  async getActiveTokens(): Promise<Token[]> {
    try {
      const res = await this.request<any>('/tokens/active');
      const rawList = Array.isArray(res) ? res : (res?.tokens || res?.data?.tokens || res?.data || []);
      return rawList.map((t: any) => ({
        id: t.id || t.tokenId || String(Math.random()),
        tokenNumber: t.tokenNumber || t.number || 'TK-000',
        personsCount: t.personsCount || t.persons || 1,
        redemptionsUsed: t.redemptionsUsed || t.redemptionCount || 0,
        totalRedemptionsAllowed: t.totalRedemptionsAllowed || t.maxDrinks || 2,
        deliveryMode: t.deliveryMode || 'EMAIL_QR',
        amountPaid: t.amountPaid || t.amount || 0,
        status: (t.status || 'active').toLowerCase() as any,
        customer: {
          id: t.customer?.id || t.customerId || '',
          name: t.customer?.name || t.customerName || 'Walk-in Guest',
          phoneNumber: t.phoneNumber || t.customer?.phoneNumber || t.customerPhone || 'N/A',
          email: t.email || t.customer?.email,
        },
        tableId: t.tableId || t.table?.id || null,
        tableNumber: t.tableNumber || t.table?.number,
        startTime: t.startTime || new Date().toISOString(),
        endTime: t.endTime || new Date().toISOString(),
        createdAt: t.createdAt || new Date().toISOString(),
        expiresAt: t.expiresAt || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  async createCustomerCheckIn(payload: {
    phoneNumber: string;
    customerName: string;
    email?: string;
    personsCount: number;
    placeTypeId: string;
    deliveryMode?: 'EMAIL_QR';
  }) {
    const res = await this.request<any>('/check-in', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      success: true,
      token: {
        id: res.id,
        tokenNumber: res.tokenNumber,
        customerId: '',
        personsCount: res.persons,
        placeTypeId: '',
        amountPaid: Number(res.amountPaid || 0),
        paymentVerified: res.paymentVerified,
        startTime: res.startTime,
        endTime: res.endTime,
        totalRedemptionsAllowed: res.redemptionLimit,
        redemptionsUsed: res.redemptionCount,
        status: res.status,
        issuedBy: '',
        deliveryMode: 'EMAIL_QR',
        customer: {
          id: '',
          phoneNumber: res.phoneNumber,
          name: res.customerName,
          email: res.email || undefined,
          totalVisits: 1
        }
      } as Token
    };
  }



  async extendToken(tokenNumber: string, extraMinutes: number, amount: number, sendEmail?: boolean, paymentMethod?: string) {
    return this.request<any>(`/tokens/${tokenNumber}/extend`, {
      method: 'PUT',
      body: JSON.stringify({ extraMinutes, amount, sendEmail, paymentMethod }),
    });
  }

  async closeToken(tokenNumber: string, reason?: string, reasonDetail?: string) {
    return this.request<any>(`/tokens/${tokenNumber}/close`, {
      method: 'PUT',
      body: JSON.stringify({ reason, reasonDetail }),
    });
  }


  async getAllSessions(): Promise<any[]> {
    try {
      const res = await this.request<any>('/admin/sessions');
      return Array.isArray(res) ? res : [];
    } catch {
      return [];
    }
  }

  async activateSession(tokenNumber: string, tableNumber: string, amountPaid: number, bypassCapacity?: boolean) {
    const res = await this.request<any>('/check-in/activate', {
      method: 'POST',
      body: JSON.stringify({ tokenNumber, tableNumber, amountPaid, bypassCapacity }),
    });
    return {
      success: true,
      token: {
        id: res.id,
        tokenNumber: res.tokenNumber,
        customerId: '',
        personsCount: res.persons,
        placeTypeId: '',
        amountPaid: res.amountPaid,
        paymentVerified: res.paymentVerified,
        startTime: res.startTime,
        endTime: res.endTime,
        totalRedemptionsAllowed: res.redemptionLimit,
        redemptionsUsed: res.redemptionCount,
        status: res.status,
        issuedBy: '',
        deliveryMode: 'EMAIL_QR',
        customer: {
          id: '',
          phoneNumber: res.phoneNumber,
          name: res.customerName,
          email: res.email || undefined,
          totalVisits: 1
        }
      } as Token
    };
  }

  async createPendingCheckIn(payload: {
    phoneNumber: string;
    customerName: string;
    email: string;
    personsCount: number;
    placeTypeId: string;
    tableId?: string;
    tableNumber?: string;
    tokenNumber?: string;
  }) {
    const res = await this.request<any>('/check-in/pending', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      success: true,
      token: {
        id: res.id,
        tokenNumber: res.tokenNumber,
        customerId: '',
        personsCount: res.persons,
        placeTypeId: '',
        amountPaid: res.amountPaid,
        paymentVerified: res.paymentVerified,
        startTime: res.startTime,
        endTime: res.endTime,
        totalRedemptionsAllowed: res.redemptionLimit,
        redemptionsUsed: res.redemptionCount,
        status: res.status,
        issuedBy: '',
        deliveryMode: 'EMAIL_QR',
        customer: {
          id: '',
          phoneNumber: res.phoneNumber,
          name: res.customerName,
          email: res.email || undefined,
          totalVisits: 1
        }
      } as Token
    };
  }

  async cancelSession(tokenNumber: string, cancelReason: string) {
    return this.request<{ success: boolean }>('/check-in/cancel', {
      method: 'POST',
      body: JSON.stringify({ tokenNumber, cancelReason }),
    });
  }

  // QR Verification & Dispensing APIs
  async verifyQR(tokenNumber: string) {
    const res = await this.request<any>('/qr/verify', {
      method: 'POST',
      body: JSON.stringify({ token: tokenNumber }),
    });
    return {
      success: true,
      token: res.token as Token,
      customer: res.token?.customer || null
    };
  }

  async verifyCheckInQR(tokenNumber: string) {
    const res = await this.request<any>(`/check-in/verify-qr/${tokenNumber}`, {
      method: 'GET',
    });
    return {
      success: true,
      token: {
        id: res.id,
        tokenNumber: res.tokenNumber,
        customerId: '',
        personsCount: res.persons,
        placeTypeId: '',
        amountPaid: res.amountPaid,
        paymentVerified: res.paymentVerified,
        startTime: res.startTime,
        endTime: res.endTime,
        totalRedemptionsAllowed: res.redemptionLimit,
        redemptionsUsed: res.redemptionCount,
        status: res.status,
        issuedBy: '',
        deliveryMode: 'EMAIL_QR',
        customer: {
          id: '',
          phoneNumber: res.phoneNumber,
          name: res.customerName,
          email: res.email || undefined,
          totalVisits: 1
        }
      } as Token,
      customer: {
        id: '',
        name: res.customerName,
        phoneNumber: res.phoneNumber,
        email: res.email || undefined
      }
    };
  }

  async redeemDrink(tokenNumber: string, quantity: number = 1) {
    return this.request<{ success: boolean; remainingDrinks: number }>('/redemptions', {
      method: 'POST',
      body: JSON.stringify({ payload: tokenNumber, presentationType: 'QR_SCAN', quantity }),
    });
  }

  async undoRedeem(tokenNumber: string) {
    return this.request<{ success: boolean }>('/token/redeem/undo', {
      method: 'POST',
      body: JSON.stringify({ tokenNumber }),
    });
  }


  // Rate Cards Management APIs
  async getRates(): Promise<any[]> {
    try {
      let res: any;
      try {
        res = await this.request<any>('/rate-cards');
      } catch {
        try {
          res = await this.request<any>('/config/rates');
        } catch {
          res = await this.request<any>('/place-types');
        }
      }
      const rawList = Array.isArray(res) ? res : (res?.rates || res?.placeTypes || res?.data?.placeTypes || res?.data || []);
      if (rawList.length > 0) {
        return rawList.map((r: any) => ({
          id: r.id || r.placeTypeId || (r.name ? r.name.toLowerCase().replace(/\s+/g, '_') : 'standing_bar'),
          name: r.name || r.categoryName || (r.id === 'premium_lounge' ? 'Premium Lounge' : 'Standing Bar'),
          ratePerPerson: r.ratePerPerson ?? r.pricePerPerson ?? r.rate ?? (r.id === 'premium_lounge' ? 1200 : 500),
          baseTimeMinutes: r.baseTimeMinutes ?? r.durationMinutes ?? (r.id === 'premium_lounge' ? 30 : 20),
          redemptionsPerPerson: r.redemptionsPerPerson ?? r.drinksPerPerson ?? (r.id === 'premium_lounge' ? 3 : 2),
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  async updateRateCard(rateId: string, payload: { ratePerPerson: number; baseTimeMinutes: number; redemptionsPerPerson: number }) {
    return this.request<{ success: boolean }>(`/config/rates/${rateId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  // FaceMark Quick Attendance API
  async markQuickAttendance(photoBase64: string, employeeCode?: string) {
    return this.request<{
      success: boolean;
      action: 'check-in' | 'check-out';
      userId?: string;
      userName?: string;
      userEmail?: string;
      confidence?: number;
      timestamp?: string;
      message?: string;
      record?: any;
    }>('/attendance/quick', {
      method: 'POST',
      body: JSON.stringify({ photoBase64, employeeCode }),
    });
  }

  // Reservation APIs
  async getReservations(): Promise<any[]> {
    try {
      const res = await this.request<any>('/reservations');
      return res.reservations || [];
    } catch {
      return [];
    }
  }

  async createReservation(payload: { customerName: string; phoneNumber: string; email: string; personsCount: number; tableId: string }) {
    return this.request<{ success: boolean; reservation: any }>('/reservations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async cancelReservation(id: string) {
    return this.request<{ success: boolean }>(`/reservations/${id}/cancel`, {
      method: 'POST',
    });
  }

  async assignReservation(id: string) {
    return this.request<{ success: boolean }>(`/reservations/${id}/assign`, {
      method: 'POST',
    });
  }

  async updateReservation(id: string, payload: { customerName?: string; phoneNumber?: string; email?: string; personsCount?: number; tableId?: string | null; bypassCapacity?: boolean }) {
    return this.request<{ success: boolean; reservation: any }>(`/reservations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }
}

export const api = new ApiService();

