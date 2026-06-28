import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NfcBarProvider } from './src/context/NfcBarContext';
import MainAppShell from './src/app/navigation/MainAppShell';
import './global.css';

export default function App() {
  return (
    <SafeAreaProvider>
      <NfcBarProvider>
        <MainAppShell />
      </NfcBarProvider>
    </SafeAreaProvider>
  );
}
