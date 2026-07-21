import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/context/ThemeContext';
import { NfcBarProvider } from './src/context/NfcBarContext';
import MainAppShell from './src/app/navigation/MainAppShell';
import './global.css';

export default function App() {
  useEffect(() => {
    if (Platform.OS !== 'web' && !__DEV__) {
      const checkForUpdates = async () => {
        try {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
          }
        } catch (err) {
          console.warn('OTA update check error:', err);
        }
      };
      checkForUpdates();
    }
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NfcBarProvider>
          <MainAppShell />
        </NfcBarProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
