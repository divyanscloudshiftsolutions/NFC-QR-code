import React, { createContext, useContext, useState, useEffect } from 'react';
import { StatusBar, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  bg: string;
  themeBg: string;
  header: string;
  surface: string;
  secondarySurface: string;
  gold: string; // compatibility
  primary: string;
  teal: string; // compatibility
  success: string;
  red: string;
  text: string;
  themeText: string;
  muted: string;
  placeholder: string;
  input: string;
  themeInput: string;
  border: string;
  inputBorder: string;
  divider: string;
  goldButtonText: string;

  // New Tokens
  card: string;
  section: string;
  modal: string;
  primaryButtonBg: string;
  primaryButtonText: string;
  secondaryButtonBg: string;
  secondaryButtonText: string;
  navBg: string;
  navActive: string;
  navInactive: string;
  navBorder: string;
  overlay: string;
  chartPrimary: string;
  chartSecondary: string;
  chartGrid: string;
}

export const darkColors: ThemeColors = {
  bg: '#08090D',
  themeBg: '#08090D',
  header: '#08090D',
  surface: '#111318',
  secondarySurface: '#171A22',
  gold: '#F5A623',
  primary: '#F5A623',
  teal: '#22C55E',
  success: '#22C55E',
  red: '#EF4444',
  text: '#FFFFFF',
  themeText: '#FFFFFF',
  muted: '#8E8E93',
  placeholder: '#8E8E93',
  input: '#1A1D26',
  themeInput: '#1A1D26',
  border: '#374151',
  inputBorder: '#374151',
  divider: '#262629',
  goldButtonText: '#08090D',

  // New Tokens
  card: '#111318',
  section: '#111318',
  modal: '#111318',
  primaryButtonBg: '#F5A623',
  primaryButtonText: '#08090D',
  secondaryButtonBg: '#1A1D26',
  secondaryButtonText: '#FFFFFF',
  navBg: '#08090D',
  navActive: '#F5A623',
  navInactive: '#FFFFFF',
  navBorder: '#374151',
  overlay: 'rgba(0, 0, 0, 0.6)',
  chartPrimary: '#F5A623',
  chartSecondary: 'rgba(245, 166, 35, 0.1)',
  chartGrid: '#262629',
};

export const lightColors: ThemeColors = {
  bg: '#F9FAFB',
  themeBg: '#F9FAFB',
  header: '#FFFFFF',
  surface: '#FFFFFF',
  secondarySurface: '#F1F5F9',
  gold: '#D4AF37',
  primary: '#D4AF37',
  teal: '#22C55E',
  success: '#22C55E',
  red: '#EF4444',
  text: '#000000',
  themeText: '#000000',
  muted: '#4B5563',
  placeholder: '#8E8E93',
  input: '#FFFFFF',
  themeInput: '#F1F5F9',
  border: '#CBD5E1',
  inputBorder: '#CBD5E1',
  divider: '#E2E8F0',
  goldButtonText: '#FFFFFF',

  // New Tokens
  card: '#FFFFFF',
  section: '#FFFFFF',
  modal: '#FFFFFF',
  primaryButtonBg: '#D4AF37',
  primaryButtonText: '#FFFFFF',
  secondaryButtonBg: '#FFFFFF',
  secondaryButtonText: '#000000',
  navBg: '#FFFFFF',
  navActive: '#D4AF37',
  navInactive: '#000000',
  navBorder: '#CBD5E1',
  overlay: 'rgba(0, 0, 0, 0.4)',
  chartPrimary: '#D4AF37',
  chartSecondary: 'rgba(212, 175, 55, 0.1)',
  chartGrid: '#E2E8F0',
};

interface ThemeContextType {
  themeMode: ThemeMode;
  theme: ThemeMode; // compatibility
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setTheme: (mode: ThemeMode) => void; // compatibility
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@nfc_bar_theme_mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeState] = useState<ThemeMode>('dark');

  // Load saved theme from storage on mount
  useEffect(() => {
    const loadSavedTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') {
          setThemeState(saved);
        }
      } catch (e) {
        console.warn('Failed to load theme mode from AsyncStorage', e);
      }
    };
    loadSavedTheme();
  }, []);

  // Update system status bars whenever themeMode changes
  useEffect(() => {
    const isDark = themeMode === 'dark';
    const activeColors = isDark ? darkColors : lightColors;
    
    // Style: light-content for dark theme, dark-content for light theme
    StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
    
    // Background color (Android only)
    if (Platform.OS === 'android') {
      StatusBar.setBackgroundColor(activeColors.bg, true);
    }
  }, [themeMode]);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeState(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (e) {
      console.warn('Failed to save theme mode to AsyncStorage', e);
    }
  };

  const toggleTheme = () => {
    setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
  };

  const isDark = themeMode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ 
      themeMode, 
      theme: themeMode, 
      isDark, 
      colors, 
      toggleTheme, 
      setThemeMode, 
      setTheme: setThemeMode 
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const useAppTheme = useTheme;
