import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { Token, Table } from '../types';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

interface DataContextType {
 tokens: Token[];
 tables: Table[];
 rates: any[];
 users: any[];
 isLoading: boolean;
 refreshTokens: () => Promise<void>;
 refreshTables: () => Promise<void>;
 refreshRates: () => Promise<void>;
 refreshUsers: () => Promise<void>;
 refreshAll: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
 const { user } = useAuth();
 const [tokens, setTokens] = useState<Token[]>([]);
 const [tables, setTables] = useState<Table[]>([]);
 const [rates, setRates] = useState<any[]>([]);
 const [users, setUsers] = useState<any[]>([]);
 const [isLoading, setIsLoading] = useState<boolean>(false);

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
 refreshTables(),
 refreshRates(),
 refreshUsers(),
 ]);
 setIsLoading(false);
 };

 // Automatically trigger parallel background load once user logs in
 useEffect(() => {
 if (user) {
 refreshAll();
 } else {
 // Clear cache on logout
 setTokens([]);
 setTables([]);
 setRates([]);
 setUsers([]);
 }
 }, [user]);

 return (
 <DataContext.Provider
 value={{
 tokens,
 tables,
 rates,
 users,
 isLoading,
 refreshTokens,
 refreshTables,
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
