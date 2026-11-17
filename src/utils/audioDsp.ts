import type { MasteringSettings } from '../types/podcast';

export function semitonesToRate(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

export function formatTimecode(seconds: number, showDecimals = false): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe - Math.floor(safe)) * 10);
  const base = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return showDecimals ? `${base}.${tenths}` : base;
}

export function estimateSpeechDurationSeconds(text: string, wpm = 142): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  // Strip stage cue brackets like [PAUSE 2s] or [EXTRAIT SONORE] from spoken word count
  const spokenOnly = cleaned.replace(/\[[^\]]*\]/g, ' ').trim();
  const words = spokenOnly ? spokenOnly.split(/\s+/).filter(Boolean).length : 0;
  const cueMatches = cleaned.match(/\[[^\]]*\]/g) ?? [];
  const cueSeconds = cueMatches.length * 2.5;
  const safeWpm = Math.max(80, Math.min(240, wpm));
  return Math.round((words / safeWpm) * 60 + cueSeconds);
}

function biquadHighPassDb(freq: number, cutoffHz: number, q = 0.707): number {
  const ratio = cutoffHz / Math.max(1, freq);
  const r2 = ratio * ratio;
  const denom = Math.sqrt(Math.pow(1 - r2, 2) + Math.pow(ratio / q, 2));
  const mag = 1 / Math.max(1e-6, denom);
  return 20 * Math.log10(Math.max(1e-5, mag));
}

function biquadPeakingDb(freq: number, centerHz: number, gainDb: number, q: number): number {
  if (Math.abs(gainDb) < 0.01) return 0;
  const x = Math.log2(Math.max(1, freq) / centerHz);
  const bandwidthOct = 1 / Math.max(0.25, q);
  const shape = Math.exp(-0.5 * Math.pow(x / (bandwidthOct * 0.65), 2));
  return gainDb * shape;
}

function biquadHighShelfDb(freq: number, shelfHz: number, gainDb: number): number {
  if (Math.abs(gainDb) < 0.01) return 0;
  const ratio = freq / shelfHz;
  const transition = 1 / (1 + Math.pow(1 / Math.max(0.05, ratio), 2.2));
  return gainDb * transition;
}

export function calculateEqFrequencyResponse(
  settings: MasteringSettings,
  frequencies: number[]
): number[] {
  if (settings.bypass) {
    return frequencies.map(() => 0);
  }
  return frequencies.map((f) => {
    const hp = biquadHighPassDb(f, settings.highPassHz);
    const lowMid = biquadPeakingDb(f, 210, settings.lowMidWarmthDb, 1.1);
    const presence = biquadPeakingDb(f, 2800, settings.presenceDb, 1.2);
    const deEsser = biquadPeakingDb(f, 5800, settings.deEsserDb, 2.4);
    const highShelf = biquadHighShelfDb(f, 7500, settings.highShelfDb);
    const total = hp + lowMid + presence + deEsser + highShelf;
    return Math.max(-24, Math.min(18, Number(total.toFixed(2))));
  });
}

/**
 * Time-preserving Hann-windowed overlap-add pitch shifter.
 * Allows lowering a high-pitched voice by -1 to -4 semitones without slowing down speech tempo.
 */
export function applyPitchShiftBuffer(
  input: Float32Array,
  sampleRate: number,
  semitones: number
): Float32Array {
  const output = new Float32Array(input.length);
  if (input.length === 0) return output;
  if (Math.abs(semitones) < 0.05) {
    output.set(input);
    return output;
  }

  const rate = semitonesToRate(semitones);
  const winSize = Math.max(256, Math.round(sampleRate * 0.044));
  const hop = Math.max(64, Math.floor(winSize / 4));
  const norm = new Float32Array(input.length);

  const hann = new Float32Array(winSize);
  for (let i = 0; i < winSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winSize - 1)));
  }

  for (let outPos = 0; outPos < input.length; outPos += hop) {
    const grainSpan = winSize * rate;
    const centerIn = outPos;
    const readOrigin = centerIn - grainSpan * 0.5;

    for (let i = 0; i < winSize; i++) {
      const outIdx = outPos + i;
      if (outIdx >= input.length) break;

      const srcPos = readOrigin + i * rate;
      if (srcPos >= 0 && srcPos < input.length - 1) {
        const idx0 = Math.floor(srcPos);
        const frac = srcPos - idx0;
        const sample = input[idx0] * (1 - frac) + input[idx0 + 1] * frac;
        const w = hann[i];
        output[outIdx] += sample * w;
        norm[outIdx] += w;
      }
    }
  }

  for (let i = 0; i < output.length; i++) {
    if (norm[i] > 1e-4) {
      output[i] /= norm[i];
    } else {
      output[i] = input[i];
    }
  }

  return output;
}

/**
 * Encodes multi-channel float audio (-1..1) into a standard 16-bit PCM WAV byte array.
 */
export function encodeWavPcm16(channels: Float32Array[], sampleRate: number): Uint8Array {
  const numChannels = Math.max(1, channels.length);
  const numFrames = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const raw = channels[ch]?.[i] ?? 0;
      const clamped = Math.max(-1, Math.min(1, raw));
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      view.setInt16(offset, Math.round(int16), true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}
