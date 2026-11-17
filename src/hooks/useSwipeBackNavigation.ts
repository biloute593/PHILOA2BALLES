import { useEffect, useRef, useState } from 'react';
import { isSwipeBackGesture } from '../utils/navigationHistory';

interface SwipeTrackState {
  startX: number;
  startY: number;
  startTime: number;
  lockedAxis: 'none' | 'horizontal' | 'vertical';
}

function isTargetExcludedFromSwipeBack(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  if (
    target.closest(
      'input, textarea, select, canvas, [contenteditable="true"], [data-no-swipe-back="true"]'
    )
  ) {
    return true;
  }

  let current: Element | null = target;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowX = style.overflowX;
    if (
      (overflowX === 'auto' || overflowX === 'scroll') &&
      current.scrollWidth > current.clientWidth + 8 &&
      current.scrollLeft > 4
    ) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

export interface UseSwipeBackOptions {
  enabled: boolean;
  canGoBack: boolean;
  onSwipeBack: () => void;
}

/**
 * Global touch swipe-back detector (left-to-right across the screen) with visual
 * feedback indicator, ignoring text inputs, sliders, canvases, and horizontal scrollers.
 */
export function useSwipeBackNavigation({
  enabled,
  canGoBack,
  onSwipeBack,
}: UseSwipeBackOptions): { swipePreviewPx: number } {
  const [swipePreviewPx, setSwipePreviewPx] = useState(0);
  const trackRef = useRef<SwipeTrackState | null>(null);
  const onSwipeBackRef = useRef(onSwipeBack);
  onSwipeBackRef.current = onSwipeBack;

  useEffect(() => {
    if (!enabled || !canGoBack) {
      setSwipePreviewPx(0);
      trackRef.current = null;
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isTargetExcludedFromSwipeBack(e.target)) {
        trackRef.current = null;
        return;
      }
      const touch = e.touches[0];
      trackRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        lockedAxis: 'none',
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      const state = trackRef.current;
      if (!state || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - state.startX;
      const dy = Math.abs(touch.clientY - state.startY);

      if (state.lockedAxis === 'none' && (Math.abs(dx) > 12 || dy > 12)) {
        state.lockedAxis = dx > 0 && dx > dy * 1.45 ? 'horizontal' : 'vertical';
      }

      if (state.lockedAxis === 'horizontal' && dx > 0) {
        setSwipePreviewPx(Math.min(72, Math.round(dx * 0.35)));
      } else if (state.lockedAxis === 'vertical') {
        setSwipePreviewPx(0);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const state = trackRef.current;
      trackRef.current = null;
      setSwipePreviewPx(0);
      if (!state || e.changedTouches.length === 0) return;

      const touch = e.changedTouches[0];
      const triggered = isSwipeBackGesture({
        startX: state.startX,
        startY: state.startY,
        endX: touch.clientX,
        endY: touch.clientY,
        durationMs: Date.now() - state.startTime,
        viewportWidth: window.innerWidth || 390,
      });

      if (triggered) {
        onSwipeBackRef.current();
      }
    };

    const handleTouchCancel = () => {
      trackRef.current = null;
      setSwipePreviewPx(0);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [enabled, canGoBack]);

  return { swipePreviewPx };
}
