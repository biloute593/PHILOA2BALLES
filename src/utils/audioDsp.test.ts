import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPitchShiftBuffer,
  calculateEqFrequencyResponse,
  encodeWavPcm16,
  estimateSpeechDurationSeconds,
  formatTimecode,
  semitonesToRate,
} from './audioDsp';
import { DEFAULT_MASTERING_SETTINGS } from '../data/seedData';

test('semitonesToRate converts semitones accurately', () => {
  assert.equal(semitonesToRate(0), 1);
  assert.ok(Math.abs(semitonesToRate(12) - 2) < 1e-9);
  assert.ok(Math.abs(semitonesToRate(-12) - 0.5) < 1e-9);
});

test('formatTimecode formats MM:SS and optional tenths', () => {
  assert.equal(formatTimecode(0), '00:00');
  assert.equal(formatTimecode(75.4), '01:15');
  assert.equal(formatTimecode(75.4, true), '01:15.4');
});

test('estimateSpeechDurationSeconds counts spoken words and cue pauses', () => {
  const text = 'Un deux trois quatre cinq six [PAUSE 2s] sept huit neuf dix.';
  const secs = estimateSpeechDurationSeconds(text, 120); // 2 words/sec -> 5s + 2.5s cue = 7.5 -> 8s
  assert.equal(secs, 8);
  assert.equal(estimateSpeechDurationSeconds(''), 0);
});

test('calculateEqFrequencyResponse attenuates treble and boosts warmth when preset active', () => {
  const freqs = [50, 210, 5800, 10000];
  const resp = calculateEqFrequencyResponse(DEFAULT_MASTERING_SETTINGS, freqs);
  assert.ok(resp[0] < 0, 'High-pass should attenuate 50Hz');
  assert.ok(resp[1] > 2, 'Low-mid warmth should boost 210Hz');
  assert.ok(resp[2] < -4, 'De-esser should attenuate harsh 5.8kHz');
  assert.ok(resp[3] < -2, 'High-shelf should soften 10kHz');

  const bypassed = calculateEqFrequencyResponse(
    { ...DEFAULT_MASTERING_SETTINGS, bypass: true },
    freqs
  );
  assert.deepEqual(bypassed, [0, 0, 0, 0]);
});

test('applyPitchShiftBuffer preserves duration and stays bounded', () => {
  const sr = 22050;
  const len = sr; // 1 second
  const sine = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    sine[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.6;
  }
  const shifted = applyPitchShiftBuffer(sine, sr, -2.0);
  assert.equal(shifted.length, len);
  let maxAbs = 0;
  for (let i = 0; i < shifted.length; i++) {
    maxAbs = Math.max(maxAbs, Math.abs(shifted[i]));
  }
  assert.ok(maxAbs > 0.1 && maxAbs <= 0.8, `Expected bounded output, got maxAbs=${maxAbs}`);
});

test('encodeWavPcm16 produces a valid RIFF/WAVE header and payload length', () => {
  const ch = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const wav = encodeWavPcm16([ch], 44100);
  assert.equal(wav.length, 44 + ch.length * 2);
  const header = String.fromCharCode(wav[0], wav[1], wav[2], wav[3]);
  const format = String.fromCharCode(wav[8], wav[9], wav[10], wav[11]);
  assert.equal(header, 'RIFF');
  assert.equal(format, 'WAVE');
});
