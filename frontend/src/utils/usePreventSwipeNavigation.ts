import { useCallback, useRef, useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * A hook that prevents horizontal swipe gestures in specific horizontal ScrollViews
 * from triggering the browser/app level back/forward swipe history navigation.
 * It detects when horizontal scrolling reaches the left/right boundaries and cancels
 * the touchmove event to block browser scroll propagation.
 */
export const usePreventSwipeNavigation = () => {
  const elementRef = useRef<HTMLElement | null>(null);

  const setRef = useCallback((node: any) => {
    if (!node) {
      elementRef.current = null;
      return;
    }
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
    } else {
      elementRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const el = elementRef.current;
    if (!el) return;

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
        const scrollLeft = el.scrollLeft;
        const maxScroll = el.scrollWidth - el.clientWidth;

        // At left boundary swiping right (back swipe navigation gesture)
        if (scrollLeft <= 0 && deltaX > 0) {
          if (e.cancelable) {
            e.preventDefault();
          }
        }
        // At right boundary swiping left (forward swipe navigation gesture)
        else if (scrollLeft >= maxScroll - 1 && deltaX < 0) {
          if (e.cancelable) {
            e.preventDefault();
          }
        }
      }
    };

    // Apply CSS behavior as double safety layer
    el.style.overscrollBehaviorX = 'none';

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
    };
  }); // Run on every render to ensure binding when DOM ref changes dynamically (e.g. inside tab view shifts)

  return setRef;
};
