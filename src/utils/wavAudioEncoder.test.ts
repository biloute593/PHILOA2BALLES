import test from 'node:test';
import assert from 'node:assert/strict';
import { createSilentWavBlob, encodeMonoFloat32ToWavBytes } from './wavAudioEncoder';

test('encodeMonoFloat32ToWavBytes produces valid RIFF/WAVE PCM16 header and clamped sample payload', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1.5, -1.5]);
  const bytes = encodeMonoFloat32ToWavBytes(samples, 24000);

  assert.equal(bytes.length, 44 + samples.length * 2);
  const ascii = (offset: number, len: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + len));

  assert.equal(ascii(0, 4), 'RIFF');
  assert.equal(ascii(8, 4), 'WAVE');
  assert.equal(ascii(12, 4), 'fmt ');
  assert.equal(ascii(36, 4), 'data');

  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint16(34, true), 16);
  // Clamped max positive & negative 16-bit PCM
  assert.equal(view.getInt16(44 + 6, true), 0x7fff);
  assert.equal(view.getInt16(44 + 8, true), -0x8000);
});

test('createSilentWavBlob returns audio/wav blob of expected RIFF size', () => {
  const blob = createSilentWavBlob(0.5, 8000);
  assert.equal(blob.type, 'audio/wav');
  assert.equal(blob.size, 44 + 4000 * 2);
});
