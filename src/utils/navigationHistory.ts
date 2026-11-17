import type { WorkspaceTab } from '../types/podcast';

export interface NavRouteSnapshot {
  mobileHome: boolean;
  tab: WorkspaceTab;
}

export const MAX_NAV_HISTORY = 24;

export function areNavRoutesEqual(a: NavRouteSnapshot, b: NavRouteSnapshot): boolean {
  return a.mobileHome === b.mobileHome && a.tab === b.tab;
}

/**
 * Pushes `previous` onto the navigation history stack when navigating to `next`,
 * avoiding duplicate top frames and resetting to a clean cap.
 */
export function pushNavRoute(
  stack: readonly NavRouteSnapshot[],
  previous: NavRouteSnapshot,
  next: NavRouteSnapshot
): NavRouteSnapshot[] {
  if (areNavRoutesEqual(previous, next)) {
    return [...stack];
  }
  const top = stack[stack.length - 1];
  const updated = top && areNavRoutesEqual(top, previous) ? [...stack] : [...stack, previous];
  if (updated.length > MAX_NAV_HISTORY) {
    return updated.slice(updated.length - MAX_NAV_HISTORY);
  }
  return updated;
}

/**
 * Pops the most recent route snapshot from history without mutating input.
 */
export function popNavRoute(stack: readonly NavRouteSnapshot[]): {
  target: NavRouteSnapshot | null;
  nextStack: NavRouteSnapshot[];
} {
  if (stack.length === 0) {
    return { target: null, nextStack: [] };
  }
  const target = stack[stack.length - 1];
  return {
    target,
    nextStack: stack.slice(0, -1),
  };
}

export interface SwipeBackEvaluationParams {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs: number;
  viewportWidth: number;
}

/**
 * Recognizes an intentional left-to-right swipe anywhere on screen
 * (with even lighter threshold when starting near the left edge) while
 * rejecting vertical scrolls or accidental diagonal taps.
 */
export function isSwipeBackGesture(params: SwipeBackEvaluationParams): boolean {
  const { startX, startY, endX, endY, durationMs, viewportWidth } = params;
  const dx = endX - startX;
  const dy = Math.abs(endY - startY);

  if (dx <= 0 || durationMs > 750 || durationMs < 20) {
    return false;
  }

  const startedNearLeftEdge = startX <= Math.max(56, viewportWidth * 0.18);
  const minDistancePx = startedNearLeftEdge ? 48 : 74;
  if (dx < minDistancePx) {
    return false;
  }

  // Must be clearly horizontal
  if (dx < dy * 1.65) {
    return false;
  }

  return true;
}
