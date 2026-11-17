import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeVoiceSamplesMetrics,
  compareVoiceWithPrecepteur,
  PRECEPTEUR_SPECTRUM_BANDS,
} from './toneAnalyzer';
import { DEFAULT_MASTERING_SETTINGS, MASTERING_PRESETS } from '../data/seedData';

function makeSyntheticVoiceBuffer(options: {
  sr?: number;
  brightSibilants?: boolean;
  highDynamicSpikes?: boolean;
}): Float32Array {
  const sr = options.sr ?? 44100;
  const durationSec = 2.0;
  const len = Math.floor(sr * durationSec);
  const out = new Float32Array(len);

  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f0 = 200;
    const base =
      0.35 * Math.sin(2 * Math.PI * f0 * t) +
      0.22 * Math.sin(2 * Math.PI * 1000 * t) +
      0.16 * Math.sin(2 * Math.PI * 2800 * t);

    const sibilant = options.brightSibilants
      ? 0.48 * Math.sin(2 * Math.PI * 5800 * t) + 0.35 * Math.sin(2 * Math.PI * 10000 * t)
      : 0.05 * Math.sin(2 * Math.PI * 5800 * t);

    const env = options.highDynamicSpikes ? (t % 0.5 < 0.06 ? 1.0 : 0.14) : 0.55;
    out[i] = (base + sibilant) * env * 0.6;
  }
  return out;
}

test('analyzeVoiceSamplesMetrics detects harsh sibilance and dynamic crest factor accurately', () => {
  const harshVoice = makeSyntheticVoiceBuffer({ brightSibilants: true, highDynamicSpikes: true });
  const metrics = analyzeVoiceSamplesMetrics(harshVoice, 44100);

  assert.equal(metrics.rawBandDb.length, PRECEPTEUR_SPECTRUM_BANDS.length);
  assert.ok(metrics.activeFrameCount >= 4, 'Expected active speech frames detected');
  // 5.8kHz (idx 6) should be noticeably higher than 210Hz (idx 2) when brightSibilants is enabled
  assert.ok(
    metrics.rawBandDb[6] > metrics.rawBandDb[2],
    `Expected harsh 5.8kHz (${metrics.rawBandDb[6]}) > 210Hz (${metrics.rawBandDb[2]})`
  );
  assert.ok(
    metrics.crestFactorDb > 12,
    `Expected high crest factor for spiky signal, got ${metrics.crestFactorDb}`
  );
});

test('compareVoiceWithPrecepteur raises conformity score when applying suggested EQ & compressor settings', () => {
  const harshVoice = makeSyntheticVoiceBuffer({ brightSibilants: true, highDynamicSpikes: true });
  const metrics = analyzeVoiceSamplesMetrics(harshVoice, 44100);

  const neutralPreset = MASTERING_PRESETS.find((p) => p.id === 'neutre_brut')!;
  const neutralSettings = {
    presetId: neutralPreset.id,
    bypass: false,
    ...neutralPreset.settings,
  };

  const before = compareVoiceWithPrecepteur(metrics, neutralSettings, 'Prise test brute');
  assert.ok(before.recommendations.length >= 2, 'Expected actionable EQ and compressor suggestions');
  assert.ok(before.suggestedEqPatch.deEsserDb !== undefined && before.suggestedEqPatch.deEsserDb <= -4);
  assert.ok(
    before.suggestedCompressorPatch.compRatio !== undefined &&
      before.suggestedCompressorPatch.compRatio >= 3.5
  );

  const after = compareVoiceWithPrecepteur(metrics, before.suggestedSettings, 'Prise test brute');
  assert.ok(
    after.conformityScore > before.conformityScore,
    `Expected conformity score to improve (${before.conformityScore}% -> ${after.conformityScore}%)`
  );
  assert.ok(
    after.spectralDistanceDb <= before.spectralDistanceDb,
    `Expected spectral distance to shrink (${before.spectralDistanceDb} -> ${after.spectralDistanceDb})`
  );
});

test('compareVoiceWithPrecepteur detects bypass mode and preserves calm default curve proximity', () => {
  const balancedVoice = makeSyntheticVoiceBuffer({ brightSibilants: false, highDynamicSpikes: false });
  const metrics = analyzeVoiceSamplesMetrics(balancedVoice, 44100);

  const bypassResult = compareVoiceWithPrecepteur(
    metrics,
    { ...DEFAULT_MASTERING_SETTINGS, bypass: true },
    'Voix Démo'
  );
  assert.ok(bypassResult.tonalSummary.toLowerCase().includes('bypass'));

  const masteredResult = compareVoiceWithPrecepteur(
    metrics,
    { ...DEFAULT_MASTERING_SETTINGS, bypass: false },
    'Voix Démo'
  );
  assert.ok(masteredResult.conformityScore >= bypassResult.conformityScore);
});
