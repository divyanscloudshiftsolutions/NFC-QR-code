import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/context/ThemeContext';
import { NfcBarProvider } from './src/context/NfcBarContext';
import MainAppShell from './src/app/navigation/MainAppShell';
import { ScrollView, DeviceEventEmitter } from 'react-native';
import './global.css';

// Monkey-patch React Native's ScrollView component globally.
// Any horizontal scrollable component will automatically emit 'lockSwipe' events
// on touch interactions to prevent main module horizontal pager swipes.
const OriginalScrollView = ScrollView;
const PagedGestureScrollView = React.forwardRef((props: any, ref: any) => {
  const { horizontal, onTouchStart, onTouchEnd, onTouchCancel, ...rest } = props;

  if (horizontal) {
    const handleTouchStart = (e: any) => {
      DeviceEventEmitter.emit('lockSwipe', true);
      if (onTouchStart) onTouchStart(e);
    };

    const handleTouchEnd = (e: any) => {
      DeviceEventEmitter.emit('lockSwipe', false);
      if (onTouchEnd) onTouchEnd(e);
    };

    const handleTouchCancel = (e: any) => {
      DeviceEventEmitter.emit('lockSwipe', false);
      if (onTouchCancel) onTouchCancel(e);
    };

    return (
      <OriginalScrollView
        ref={ref}
        horizontal={true}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        {...rest}
      />
    );
  }

  return <OriginalScrollView ref={ref} {...props} />;
});

// Copy all static properties and functions of the original ScrollView
Object.keys(OriginalScrollView).forEach((key) => {
  (PagedGestureScrollView as any)[key] = (OriginalScrollView as any)[key];
});

const RN = require('react-native');
RN.ScrollView = PagedGestureScrollView;


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
