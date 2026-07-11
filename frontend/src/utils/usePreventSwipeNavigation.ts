import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * A hook that prevents horizontal swipe gestures in specific horizontal ScrollViews
 * from triggering the browser/app level back/forward swipe history navigation.
 * It binds listeners directly inside the callback ref to ensure immediate active
 * event interception on the very first touch/swipe, avoiding React lifecycle lags.
 */
export const usePreventSwipeNavigation = () => {
  const elementRef = useRef<HTMLElement | null>(null);
  const listenersRef = useRef<{
    el: HTMLElement;
    touchStart: (e: TouchEvent) => void;
    touchMove: (e: TouchEvent) => void;
  } | null>(null);

  const setRef = useCallback((node: any) => {
    // 1. Clean up existing listeners on element change or unmount
    if (listenersRef.current) {
      try {
        const { el, touchStart, touchMove } = listenersRef.current;
        el.removeEventListener('touchstart', touchStart);
        el.removeEventListener('touchmove', touchMove);
      } catch (e) {
        // ignore
      }
      listenersRef.current = null;
    }

    if (!node) {
      elementRef.current = null;
      return;
    }

    if (Platform.OS !== 'web') return;

    // Helper to get the underlying DOM node on React Native Web
    const getDomElement = (refCurrent: any) => {
      if (!refCurrent) return null;
      if (typeof refCurrent.getScrollableNode === 'function') {
        return refCurrent.getScrollableNode();
      }
      if (typeof refCurrent.getInnerViewNode === 'function') {
        return refCurrent.getInnerViewNode();
      }
      return refCurrent;
    };

    const domEl = getDomElement(node);
    if (domEl instanceof HTMLElement) {
      elementRef.current = domEl;

      let touchStartX = 0;
      let touchStartY = 0;

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length > 0) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 0) return;
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        const deltaX = touchX - touchStartX;
        const deltaY = touchY - touchStartY;

        // Check if the gesture is primarily horizontal
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          const scrollLeft = domEl.scrollLeft;
          const maxScroll = domEl.scrollWidth - domEl.clientWidth;

          // Check if container is not scrollable (or has negligible scroll width)
          if (maxScroll <= 2) {
            if (e.cancelable) {
              e.preventDefault();
            }
          } else {
            // At left boundary swiping right (back swipe navigation gesture)
            // Use 2px tolerance for high-DPI decimal scroll boundaries
            if (scrollLeft <= 2 && deltaX > 0) {
              if (e.cancelable) {
                e.preventDefault();
              }
            }
            // At right boundary swiping left (forward swipe navigation gesture)
            else if (scrollLeft >= maxScroll - 2 && deltaX < 0) {
              if (e.cancelable) {
                e.preventDefault();
              }
            }
          }
        }
      };

      // Set CSS style for overscroll
      domEl.style.overscrollBehaviorX = 'none';

      // Bind listeners (non-passive for touchmove to allow preventDefault)
      domEl.addEventListener('touchstart', handleTouchStart, { passive: true });
      domEl.addEventListener('touchmove', handleTouchMove, { passive: false });

      // Save references for clean removal
      listenersRef.current = {
        el: domEl,
        touchStart: handleTouchStart,
        touchMove: handleTouchMove
      };
    } else {
      elementRef.current = null;
    }
  }, []);

  return setRef;
};


