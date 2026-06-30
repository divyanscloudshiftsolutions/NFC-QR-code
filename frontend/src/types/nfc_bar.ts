export enum UserRole {
  ADMIN = 'admin',
  RECEPTIONIST = 'receptionist',
  BARTENDER = 'bartender',
  MANAGER = 'manager',
}

export enum CardStatus {
  AVAILABLE = 'available',
  ASSIGNED = 'assigned',
  LOST = 'lost',
  DAMAGED = 'damaged',
  INACTIVE = 'inactive',
}

export interface InventoryCard {
  id: string;
  cardUid: string;
  status: string;
  writeCycles: number;
  lastWrittenAt?: string;
  assignedAt?: string;
}

export enum TableStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  RESERVED = 'reserved',
  MAINTENANCE = 'maintenance',
}

export enum TokenStatus {
  ACTIVE = 'active',
  EXTENDED = 'extended',
  EXPIRED = 'expired',
  CLOSED = 'closed',
}

export type PlaceType = string;

export interface User {
  id: string;
  name: string;
  pin: string;
  role: UserRole;
  avatar: string;
}

export interface StaffMember {
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
  roleId: string;
  role: {
    id: string;
    name: string;
    permissions: any;
  };
  createdAt?: string;
  lastLogin?: string;
}

export interface Table {
  id: string;
  number: string;
  placeType: PlaceType;
  status: TableStatus;
  seats: number;
  totalCapacity: number;
  occupiedSeats: number;
  availableSeats: number;
  allowSharedSeating: boolean;
}

export interface SessionToken {
  id: string;
  tokenNumber: string;
  customerName: string;
  phoneNumber: string;
  email?: string;
  persons: number;
  placeType: PlaceType;
  tableNumber: string;
  amountPaid: number;
  startTime: string;
  endTime: string;
  redemptionLimit: number;
  redemptionCount: number;
  status: TokenStatus;
  cardUid: string;
  deliveryMode?: 'NFC_CARD' | 'EMAIL_QR';
  paymentVerified?: boolean;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: 'expiring' | 'card_low' | 'nfc_fail' | 'sync_complete' | 'general';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface SalesRecord {
  hour: string;
  revenue: number;
  isPeak?: boolean;
}

export interface RateCard {
  id?: string;
  placeType: string;
  ratePerPerson: number;
  durationHours: number;
  maxDrinks: number;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'danger' | 'info';
}
