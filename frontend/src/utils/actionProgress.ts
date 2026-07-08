import { useState, useRef, useCallback } from 'react';

export function useActionProgress() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(2.0);
  const intervalRef = useRef<any>(null);

  const startAction = useCallback((actionKey: string) => {
    if (loadingAction) return false; // Prevent duplicate execution
    setLoadingAction(actionKey);
    setSecondsLeft(2.0);

    const startTime = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const left = Math.max(0, 2.0 - elapsed);
      setSecondsLeft(parseFloat(left.toFixed(1)));
      if (left <= 0) {
        clearInterval(intervalRef.current);
      }
    }, 100);
    return true;
  }, [loadingAction]);

  const stopAction = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setLoadingAction(null);
  }, []);

  return {
    loadingAction,
    secondsLeft,
    startAction,
    stopAction,
    isProcessing: !!loadingAction
  };
}
