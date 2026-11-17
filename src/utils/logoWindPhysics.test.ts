import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWindSwayAngles, LOGO_CROSSBAR_ANCHOR } from './logoWindPhysics';

test('LOGO_CROSSBAR_ANCHOR sits cleanly on the horizontal crossbar of A', () => {
  assert.equal(LOGO_CROSSBAR_ANCHOR.x, 510);
  assert.equal(LOGO_CROSSBAR_ANCHOR.y, 536);
  assert.ok(LOGO_CROSSBAR_ANCHOR.leftShoePivotY > LOGO_CROSSBAR_ANCHOR.y);
  assert.ok(LOGO_CROSSBAR_ANCHOR.rightShoePivotY > LOGO_CROSSBAR_ANCHOR.y);
});

test('computeWindSwayAngles produces subtle bounded oscillation and stays zero when paused', () => {
  const paused = computeWindSwayAngles(3.5, 'brise', true);
  assert.equal(paused.mainPivotDeg, 0);
  assert.equal(paused.leftShoeDeg, 0);
  assert.equal(paused.rightShoeDeg, 0);

  let maxBrise = 0;
  let maxCalme = 0;
  let maxRafale = 0;
  for (let t = 0; t <= 12; t += 0.25) {
    const b = computeWindSwayAngles(t, 'brise');
    const c = computeWindSwayAngles(t, 'calme');
    const r = computeWindSwayAngles(t, 'rafale');
    maxBrise = Math.max(maxBrise, Math.abs(b.mainPivotDeg));
    maxCalme = Math.max(maxCalme, Math.abs(c.mainPivotDeg));
    maxRafale = Math.max(maxRafale, Math.abs(r.mainPivotDeg));
    // Subtle natural sway — never wildly spinning
    assert.ok(Math.abs(b.mainPivotDeg) <= 5, `Brise angle too large: ${b.mainPivotDeg}`);
  }
  assert.ok(maxCalme < maxBrise && maxBrise < maxRafale);
  assert.ok(maxBrise > 1.5);
});
