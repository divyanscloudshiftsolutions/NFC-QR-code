import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * A hook that prevents horizontal swipe gestures in specific horizontal ScrollViews
 * from triggering the browser/app level back/forward swipe history navigation.
 * It intercepts horizontal moves, calls preventDefault to block page-level swipe navigation,
 * and manually scrolls the DOM container with momentum physics for smooth responsiveness.
 */
export const usePreventSwipeNavigation = () => {
  const elementRef = useRef<HTMLElement | null>(null);
  const listenersRef = useRef<{
    el: HTMLElement;
    touchStart: (e: TouchEvent) => void;
    touchMove: (e: TouchEvent) => void;
    touchEnd: () => void;
  } | null>(null);

  const setRef = useCallback((node: any) => {
    // 1. Clean up existing listeners on element change or unmount
    if (listenersRef.current) {
      try {
        const { el, touchStart, touchMove, touchEnd } = listenersRef.current;
        el.removeEventListener('touchstart', touchStart);
        el.removeEventListener('touchmove', touchMove);
        el.removeEventListener('touchend', touchEnd);
        el.removeEventListener('touchcancel', touchEnd);
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

      let lastTouchX = 0;
      let lastTouchY = 0;
      let lastTouchTime = 0;
      let velocityX = 0;
      let isScrollingHorizontal = false;
      let animationFrameId: number | null = null;

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length > 0) {
          lastTouchX = e.touches[0].clientX;
          lastTouchY = e.touches[0].clientY;
          lastTouchTime = Date.now();
          velocityX = 0;
          isScrollingHorizontal = false;
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          }
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 0) return;
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        const deltaX = touchX - lastTouchX;
        const deltaY = touchY - lastTouchY;
        const now = Date.now();
        const timeDelta = now - lastTouchTime;

        if (!isScrollingHorizontal) {
          // On first movement, determine if swipe is horizontal
          if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 2) {
            isScrollingHorizontal = true;
          }
        }

        if (isScrollingHorizontal) {
          // Cancel browser-level page navigation (peel transition)
          if (e.cancelable) {
            e.preventDefault();
          }
          // Perform manual horizontal scroll
          domEl.scrollLeft -= deltaX;
          if (timeDelta > 0) {
            velocityX = deltaX / timeDelta; // velocity in px/ms
          }
        }

        lastTouchX = touchX;
        lastTouchY = touchY;
        lastTouchTime = now;
      };

      const handleTouchEnd = () => {
        if (!isScrollingHorizontal || Math.abs(velocityX) < 0.1) return;

        let speed = velocityX;
        const friction = 0.95; // smooth friction coefficient

        const step = () => {
          if (Math.abs(speed) < 0.05) {
            animationFrameId = null;
            return;
          }
          domEl.scrollLeft -= speed * 16; // approximate distance per frame
          speed *= friction;
          animationFrameId = requestAnimationFrame(step);
        };
        animationFrameId = requestAnimationFrame(step);
      };

      // Set CSS style for overscroll as fallback safety
      domEl.style.overscrollBehaviorX = 'none';

      // Bind listeners (non-passive touchmove is mandatory to call preventDefault)
      domEl.addEventListener('touchstart', handleTouchStart, { passive: true });
      domEl.addEventListener('touchmove', handleTouchMove, { passive: false });
      domEl.addEventListener('touchend', handleTouchEnd, { passive: true });
      domEl.addEventListener('touchcancel', handleTouchEnd, { passive: true });

      // Save references for clean removal
      listenersRef.current = {
        el: domEl,
        touchStart: handleTouchStart,
        touchMove: handleTouchMove,
        touchEnd: handleTouchEnd
      };
    } else {
      elementRef.current = null;
    }
  }, []);

  return setRef;
};



