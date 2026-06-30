import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/context/ThemeContext';
import { NfcBarProvider } from './src/context/NfcBarContext';
import MainAppShell from './src/app/navigation/MainAppShell';
import './global.css';

export default function App() {
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
