import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CLICK_SUPPRESS_WINDOW_MS,
  DEFAULT_LONG_PRESS_MOVE_THRESHOLD_PX,
  shouldCancelLongPress,
  shouldSuppressTrailingClick,
} from './adaptiveInteractions';

test('shouldCancelLongPress detects finger drag beyond threshold while forgiving micro-jitter', () => {
  const start = { x: 100, y: 200 };
  assert.equal(shouldCancelLongPress(start, { x: 104, y: 205 }), false);
  assert.equal(
    shouldCancelLongPress(start, {
      x: 100 + DEFAULT_LONG_PRESS_MOVE_THRESHOLD_PX + 2,
      y: 200,
    }),
    true
  );
});

test('shouldSuppressTrailingClick blocks immediate click after long-press trigger only within window', () => {
  const triggerAt = 10_000;
  assert.equal(shouldSuppressTrailingClick(0, triggerAt), false);
  assert.equal(shouldSuppressTrailingClick(triggerAt, triggerAt + 120), true);
  assert.equal(
    shouldSuppressTrailingClick(triggerAt, triggerAt + DEFAULT_CLICK_SUPPRESS_WINDOW_MS + 50),
    false
  );
});
