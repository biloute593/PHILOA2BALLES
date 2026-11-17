import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_LONG_PRESS_MS,
  shouldCancelLongPress,
  shouldSuppressTrailingClick,
  type TouchPoint,
} from '../utils/adaptiveInteractions';

export interface UseAdaptiveTriggerOptions {
  onTrigger: () => void;
  longPressMs?: number;
  disabled?: boolean;
}

/**
 * Unifies PC double-click + Mobile long-press (~450ms) on a single control or title,
 * with movement tolerance, subtle haptic feedback, and synthetic click suppression
 * so long-pressing a primary action doesn't trigger a stray tap.
 */
export function useAdaptiveTrigger({
  onTrigger,
  longPressMs = DEFAULT_LONG_PRESS_MS,
  disabled = false,
}: UseAdaptiveTriggerOptions) {
  const [pressActive, setPressActive] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startPointRef = useRef<TouchPoint | null>(null);
  const lastLongPressAtRef = useRef<number>(0);
  const touchInFlightRef = useRef<boolean>(false);
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPressActive(false);
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      onTriggerRef.current();
    },
    [disabled]
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || e.touches.length !== 1) return;
      const touch = e.touches[0];
      startPointRef.current = { x: touch.clientX, y: touch.clientY };
      touchInFlightRef.current = true;
      setPressActive(true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setPressActive(false);
        lastLongPressAtRef.current = Date.now();
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(14);
          }
        } catch {
          // Ignore unsupported vibrate
        }
        onTriggerRef.current();
      }, longPressMs);
    },
    [disabled, longPressMs]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPointRef.current || e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (
        shouldCancelLongPress(startPointRef.current, {
          x: touch.clientX,
          y: touch.clientY,
        })
      ) {
        clearTimer();
      }
    },
    [clearTimer]
  );

  const onTouchEnd = useCallback(() => {
    touchInFlightRef.current = false;
    startPointRef.current = null;
    clearTimer();
  }, [clearTimer]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (shouldSuppressTrailingClick(lastLongPressAtRef.current, Date.now())) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (
      touchInFlightRef.current ||
      shouldSuppressTrailingClick(lastLongPressAtRef.current, Date.now(), 600)
    ) {
      e.preventDefault();
    }
  }, []);

  return {
    pressActive,
    triggerProps: {
      onDoubleClick,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
      onClickCapture,
      onContextMenu,
    },
  };
}
