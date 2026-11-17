export interface TouchPoint {
  x: number;
  y: number;
}

export const DEFAULT_LONG_PRESS_MS = 450;
export const DEFAULT_LONG_PRESS_MOVE_THRESHOLD_PX = 12;
export const DEFAULT_CLICK_SUPPRESS_WINDOW_MS = 380;

/**
 * Returns true if the finger moved far enough during a touch hold
 * that it should be treated as a scroll or swipe rather than a long-press.
 */
export function shouldCancelLongPress(
  start: TouchPoint,
  current: TouchPoint,
  thresholdPx = DEFAULT_LONG_PRESS_MOVE_THRESHOLD_PX
): boolean {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  return Math.hypot(dx, dy) > thresholdPx;
}

/**
 * Prevents the trailing synthetic click event fired after a touch long-press
 * from immediately toggling or closing the newly opened options menu.
 */
export function shouldSuppressTrailingClick(
  lastLongPressAt: number,
  nowMs: number,
  suppressWindowMs = DEFAULT_CLICK_SUPPRESS_WINDOW_MS
): boolean {
  if (lastLongPressAt <= 0) return false;
  const elapsed = nowMs - lastLongPressAt;
  return elapsed >= 0 && elapsed <= suppressWindowMs;
}
