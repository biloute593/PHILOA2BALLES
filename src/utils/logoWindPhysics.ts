export type WindStrength = 'calme' | 'brise' | 'rafale';

export interface WindSwayAngles {
  mainPivotDeg: number;
  leftShoeDeg: number;
  rightShoeDeg: number;
  laceBowDeg: number;
  wispOffsetX: number;
  wispOpacity: number;
}

export const LOGO_CROSSBAR_ANCHOR = {
  x: 510,
  y: 536,
  leftShoePivotX: 476,
  leftShoePivotY: 756,
  rightShoePivotX: 554,
  rightShoePivotY: 762,
  naturalWidth: 1597,
  naturalHeight: 1069,
} as const;

const AMPLITUDE_BY_STRENGTH: Record<WindStrength, number> = {
  calme: 0.55,
  brise: 1.0,
  rafale: 1.75,
};

/**
 * Computes subtle organic breeze oscillation angles for the shoes hanging
 * from the horizontal crossbar of the "A" in PHILOA2BALLE.
 * Combines a primary pendulum sway with slight asymmetrical wind gusts and
 * out-of-phase secondary shoe/lace flutter.
 */
export function computeWindSwayAngles(
  timeSec: number,
  strength: WindStrength = 'brise',
  paused = false
): WindSwayAngles {
  if (paused || !Number.isFinite(timeSec)) {
    return {
      mainPivotDeg: 0,
      leftShoeDeg: 0,
      rightShoeDeg: 0,
      laceBowDeg: 0,
      wispOffsetX: 0,
      wispOpacity: 0.12,
    };
  }

  const amp = AMPLITUDE_BY_STRENGTH[strength] ?? 1.0;
  // Asymmetric slight rightward breeze bias + multi-harmonic organic motion
  const gustEnvelope = 0.72 + 0.28 * Math.sin(timeSec * 0.42 + 0.4);
  const mainPendulum =
    Math.sin(timeSec * 1.45) * 2.1 +
    Math.sin(timeSec * 0.72 + 1.1) * 0.85 +
    0.45 * gustEnvelope;

  const leftSecondary =
    Math.sin(timeSec * 1.95 + 0.9) * 1.25 + Math.cos(timeSec * 0.85) * 0.45;
  const rightSecondary =
    Math.sin(timeSec * 2.15 + 2.2) * 1.45 + Math.sin(timeSec * 1.05 + 0.3) * 0.5;
  const bowFlutter = Math.sin(timeSec * 3.4 + 0.5) * 2.6 * gustEnvelope;

  const wispProgress = (timeSec * 0.18) % 1;
  const wispOpacity = Math.sin(wispProgress * Math.PI) * (0.14 * Math.min(1.4, amp));

  return {
    mainPivotDeg: Number((mainPendulum * amp).toFixed(3)),
    leftShoeDeg: Number((leftSecondary * amp).toFixed(3)),
    rightShoeDeg: Number((rightSecondary * amp).toFixed(3)),
    laceBowDeg: Number((bowFlutter * amp).toFixed(3)),
    wispOffsetX: Number(((wispProgress - 0.5) * 260).toFixed(2)),
    wispOpacity: Number(Math.max(0, wispOpacity).toFixed(3)),
  };
}
