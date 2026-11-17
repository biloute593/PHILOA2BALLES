/**
 * Pure PCM -> WAV encoding helpers + OfflineAudioContext warmth chain
 * so Teleprompter TTS plays via native <audio> HTMLAudioElement (which
 * continues smoothly when switching apps or locking a mobile phone).
 */

export function encodeMonoFloat32ToWavBytes(
  samples: Float32Array,
  sampleRate: number
): Uint8Array {
  const numSamples = samples.length;
  const dataByteLength = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // AudioFormat = PCM
  view.setUint16(22, 1, true); // NumChannels = 1
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeAscii(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Generates a minimal valid silent WAV Blob so a fallback playback session can
 * still register with the browser MediaSession if Studio TTS is offline.
 */
export function createSilentWavBlob(durationSec = 1, sampleRate = 8000): Blob {
  const samples = new Float32Array(Math.max(1, Math.round(durationSec * sampleRate)));
  const wavBytes = encodeMonoFloat32ToWavBytes(samples, sampleRate);
  return new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
}

/**
 * Applies the Le Précepteur analog warmth & anti-sibilance mastering chain
 * offline and appends optional trailing silence (so [PAUSE] rests run inside
 * the native <audio> timeline without waking background JS timers).
 */
export async function renderWarmPrecepteurWavBlob(
  speechBuffer: AudioBuffer,
  options: {
    playbackRate?: number;
    trailingSilenceSec?: number;
  } = {}
): Promise<{ blob: Blob; speechDurationSec: number; totalDurationSec: number }> {
  const playbackRate = Math.max(0.75, Math.min(1.25, options.playbackRate ?? 0.98));
  const trailingSilenceSec = Math.max(0, options.trailingSilenceSec ?? 0);
  const speechDurationSec = speechBuffer.duration / playbackRate;
  const totalDurationSec = speechDurationSec + trailingSilenceSec;
  const sampleRate = Math.min(44100, Math.max(22050, speechBuffer.sampleRate || 24000));
  const totalFrames = Math.max(1, Math.ceil(totalDurationSec * sampleRate));

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  const offline = new OfflineCtx(1, totalFrames, sampleRate);
  const src = offline.createBufferSource();
  src.buffer = speechBuffer;
  src.playbackRate.value = playbackRate;

  const highPass = offline.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = 85;

  const lowMidWarmth = offline.createBiquadFilter();
  lowMidWarmth.type = 'peaking';
  lowMidWarmth.frequency.value = 210;
  lowMidWarmth.Q.value = 1.1;
  lowMidWarmth.gain.value = 3.2;

  const deEsser = offline.createBiquadFilter();
  deEsser.type = 'peaking';
  deEsser.frequency.value = 5800;
  deEsser.Q.value = 2.4;
  deEsser.gain.value = -4.5;

  const highShelf = offline.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 7600;
  highShelf.gain.value = -2.6;

  const compressor = offline.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.ratio.value = 3.0;
  compressor.attack.value = 0.015;
  compressor.release.value = 0.16;

  src.connect(highPass);
  highPass.connect(lowMidWarmth);
  lowMidWarmth.connect(deEsser);
  deEsser.connect(highShelf);
  highShelf.connect(compressor);
  compressor.connect(offline.destination);

  src.start(0);
  const rendered = await offline.startRendering();
  const mono = rendered.getChannelData(0);
  const wavBytes = encodeMonoFloat32ToWavBytes(mono, rendered.sampleRate);

  return {
    blob: new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' }),
    speechDurationSec,
    totalDurationSec,
  };
}
