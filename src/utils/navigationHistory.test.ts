import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areNavRoutesEqual,
  isSwipeBackGesture,
  popNavRoute,
  pushNavRoute,
  type NavRouteSnapshot,
} from './navigationHistory';

test('pushNavRoute and popNavRoute maintain clean non-duplicate back stack without resetting prior views', () => {
  let stack: NavRouteSnapshot[] = [];
  const home: NavRouteSnapshot = { mobileHome: true, tab: 'script' };
  const script: NavRouteSnapshot = { mobileHome: false, tab: 'script' };
  const prompter: NavRouteSnapshot = { mobileHome: false, tab: 'prompter' };

  stack = pushNavRoute(stack, home, script);
  stack = pushNavRoute(stack, script, script); // ignored duplicate
  stack = pushNavRoute(stack, script, prompter);

  assert.equal(stack.length, 2);

  const firstBack = popNavRoute(stack);
  assert.ok(firstBack.target);
  assert.equal(areNavRoutesEqual(firstBack.target, script), true);

  const secondBack = popNavRoute(firstBack.nextStack);
  assert.ok(secondBack.target);
  assert.equal(areNavRoutesEqual(secondBack.target, home), true);
  assert.equal(secondBack.nextStack.length, 0);
});

test('isSwipeBackGesture recognizes horizontal left-to-right swipe and rejects vertical scrolls or right-to-left swipes', () => {
  // Valid left-edge swipe back
  assert.equal(
    isSwipeBackGesture({
      startX: 20,
      startY: 320,
      endX: 90,
      endY: 332,
      durationMs: 220,
      viewportWidth: 390,
    }),
    true
  );

  // Valid mid-screen left-to-right swipe back
  assert.equal(
    isSwipeBackGesture({
      startX: 110,
      startY: 300,
      endX: 210,
      endY: 315,
      durationMs: 280,
      viewportWidth: 390,
    }),
    true
  );

  // Reject right-to-left swipe
  assert.equal(
    isSwipeBackGesture({
      startX: 260,
      startY: 300,
      endX: 140,
      endY: 305,
      durationMs: 240,
      viewportWidth: 390,
    }),
    false
  );

  // Reject predominantly vertical scroll
  assert.equal(
    isSwipeBackGesture({
      startX: 20,
      startY: 450,
      endX: 75,
      endY: 320,
      durationMs: 200,
      viewportWidth: 390,
    }),
    false
  );
});
