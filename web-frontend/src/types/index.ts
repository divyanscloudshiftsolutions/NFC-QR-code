export type UserRole = 'admin' | 'receptionist' | 'bartender' | 'manager';

export const UserRole = {
  ADMIN: 'admin' as UserRole,
  RECEPTIONIST: 'receptionist' as UserRole,
  BARTENDER: 'bartender' as UserRole,
  MANAGER: 'manager' as UserRole,
};

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  phoneNumber: string;
  name: string;
  email?: string;
  totalVisits: number;
  lastVisit?: string;
}

export interface PlaceTypeConfig {
  id: string;
  name: string;
  ratePerPerson: number;
  baseTimeMinutes: number;
  redemptionsPerPerson: number;
  isActive: boolean;
}

export interface Table {
  id: string;
  tableNumber: string;
  placeTypeId: string;
  placeType?: any;
  categoryName?: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'maintenance' | 'in_checkin';
  currentTokenId?: string;
  occupiedSince?: string;
  lastAssignedAt?: string;
  isActive: boolean;
}

export interface Token {
  id: string;
  tokenNumber: string;
  customerId: string;
  customer?: Customer;
  personsCount: number;
  placeTypeId: string;
  placeType?: PlaceTypeConfig;
  tableId?: string;
  table?: Table;
  amountPaid: number;
  paymentVerified: boolean;
  startTime: string;
  endTime: string;
  totalRedemptionsAllowed: number;
  redemptionsUsed: number;
  status: 'PENDING_PAYMENT' | 'ACTIVE' | 'CLOSED' | 'CANCELLED' | 'EXPIRED' | 'EXTENDED';
  issuedBy: string;
  deliveryMode: 'NFC_CARD' | 'EMAIL_QR';
  emailSent?: boolean;
  emailDeliveryStatus?: string;
  tableNumber?: string;
  createdAt?: string;
  expiresAt?: string;
}

export interface Redemption {
  id: string;
  tokenId: string;
  redemptionSequence: number;
  redeemedAt: string;
  bartenderId: string;
  notes?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}
