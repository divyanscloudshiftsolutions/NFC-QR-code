import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'nativewind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'react-native';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  colors: {
    bg: string;
    surface: string;
    gold: string;
    teal: string;
    red: string;
    text: string;
    muted: string;
    input: string;
    border: string;
  };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const darkColors = {
  bg: '#08090d',
  surface: '#111318',
  gold: '#f5a623',
  teal: '#4ecdc4',
  red: '#e63946',
  text: '#f0ede6',
  muted: '#9ca3af',
  input: '#1a1d26',
  border: '#262629',
};

const lightColors = {
  bg: '#f9f9fb',
  surface: '#ffffff',
  gold: '#d4af37',
  teal: '#1c2e4a',
  red: '#d9383a',
  text: '#1c1c1e',
  muted: '#7e7e82',
  input: '#f2f2f7',
  border: '#e5e5ea',
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [theme, setThemeState] = useState<Theme>('dark'); // Default to dark

  useEffect(() => {
    // Load theme from AsyncStorage on mount
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('user-theme');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setThemeState(savedTheme as Theme);
          setColorScheme(savedTheme as Theme);
        } else {
          // Default is dark
          setThemeState('dark');
          setColorScheme('dark');
        }
      } catch (e) {
        console.error('Failed to load theme:', e);
      }
    };
    loadTheme();
  }, []);

  const setTheme = async (newTheme: Theme) => {
    try {
      setThemeState(newTheme);
      setColorScheme(newTheme);
      await AsyncStorage.setItem('user-theme', newTheme);
    } catch (e) {
      console.error('Failed to save theme:', e);
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  };

  const isDark = theme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setTheme, colors }}>
      {/* Configure StatusBar dynamically for both iOS and Android */}
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return context;
};
