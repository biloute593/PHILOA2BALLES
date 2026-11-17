import type { MasteringSettings, TimelineClip } from '../types/podcast';
import { applyPitchShiftBuffer, encodeWavPcm16 } from './audioDsp';

export interface MasteringChainNodes {
  input: GainNode;
  output: GainNode;
  highPass: BiquadFilterNode;
  lowMid: BiquadFilterNode;
  presence: BiquadFilterNode;
  deEsser: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  fmDelay: DelayNode;
  fmFilter: BiquadFilterNode;
  fmOsc: OscillatorNode;
  fmDelayDepth: GainNode;
  fmFilterDepth: GainNode;
  compressor: DynamicsCompressorNode;
  makeup: GainNode;
  bypassGain: GainNode;
  wetGain: GainNode;
  dispose: () => void;
}

export function buildMasteringChain(
  ctx: BaseAudioContext,
  settings: MasteringSettings
): MasteringChainNodes {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const bypassGain = ctx.createGain();
  const wetGain = ctx.createGain();

  const highPass = ctx.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.Q.value = 0.707;

  const lowMid = ctx.createBiquadFilter();
  lowMid.type = 'peaking';
  lowMid.frequency.value = 210;
  lowMid.Q.value = 1.1;

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 2800;
  presence.Q.value = 1.2;

  const deEsser = ctx.createBiquadFilter();
  deEsser.type = 'peaking';
  deEsser.frequency.value = 5800;
  deEsser.Q.value = 2.4;

  const highShelf = ctx.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 7500;

  // FM Warmth Shaper (subtle frequency & micro-delay modulation to round sharp vocal transients)
  const fmDelay = ctx.createDelay(0.05);
  fmDelay.delayTime.value = 0.004;

  const fmFilter = ctx.createBiquadFilter();
  fmFilter.type = 'lowpass';
  fmFilter.frequency.value = 11500;
  fmFilter.Q.value = 0.5;

  const fmOsc = ctx.createOscillator();
  fmOsc.type = 'sine';
  const fmDelayDepth = ctx.createGain();
  const fmFilterDepth = ctx.createGain();

  fmOsc.connect(fmDelayDepth);
  fmDelayDepth.connect(fmDelay.delayTime);
  fmOsc.connect(fmFilterDepth);
  fmFilterDepth.connect(fmFilter.frequency);
  fmOsc.start(0);

  const compressor = ctx.createDynamicsCompressor();
  compressor.knee.value = 12;

  const makeup = ctx.createGain();

  // Dry path (A/B bypass)
  input.connect(bypassGain);
  bypassGain.connect(output);

  // Wet mastered path
  input.connect(highPass);
  highPass.connect(lowMid);
  lowMid.connect(presence);
  presence.connect(deEsser);
  deEsser.connect(highShelf);
  highShelf.connect(fmDelay);
  fmDelay.connect(fmFilter);
  fmFilter.connect(compressor);
  compressor.connect(makeup);
  makeup.connect(wetGain);
  wetGain.connect(output);

  const nodes: MasteringChainNodes = {
    input,
    output,
    highPass,
    lowMid,
    presence,
    deEsser,
    highShelf,
    fmDelay,
    fmFilter,
    fmOsc,
    fmDelayDepth,
    fmFilterDepth,
    compressor,
    makeup,
    bypassGain,
    wetGain,
    dispose: () => {
      try {
        fmOsc.stop();
        fmOsc.disconnect();
      } catch {
        // Ignore already stopped
      }
    },
  };

  updateMasteringChainParams(nodes, settings, ctx.currentTime);
  return nodes;
}

export function updateMasteringChainParams(
  nodes: MasteringChainNodes,
  settings: MasteringSettings,
  now = 0
): void {
  const wet = settings.bypass ? 0 : 1;
  const dry = settings.bypass ? 1 : 0;
  nodes.wetGain.gain.setTargetAtTime(wet, now, 0.015);
  nodes.bypassGain.gain.setTargetAtTime(dry, now, 0.015);

  nodes.highPass.frequency.setTargetAtTime(settings.highPassHz, now, 0.02);
  nodes.lowMid.gain.setTargetAtTime(settings.lowMidWarmthDb, now, 0.02);
  nodes.presence.gain.setTargetAtTime(settings.presenceDb, now, 0.02);
  nodes.deEsser.gain.setTargetAtTime(settings.deEsserDb, now, 0.02);
  nodes.highShelf.gain.setTargetAtTime(settings.highShelfDb, now, 0.02);

  const depthRatio = Math.max(0, Math.min(1, settings.fmWarmthDepth / 100));
  nodes.fmOsc.frequency.setTargetAtTime(settings.fmWarmthRateHz, now, 0.02);
  nodes.fmDelayDepth.gain.setTargetAtTime(depthRatio * 0.00055, now, 0.02);
  nodes.fmFilterDepth.gain.setTargetAtTime(depthRatio * 1200, now, 0.02);
  nodes.fmFilter.frequency.setTargetAtTime(12500 - depthRatio * 3200, now, 0.02);

  nodes.compressor.threshold.setTargetAtTime(settings.compThresholdDb, now, 0.02);
  nodes.compressor.ratio.setTargetAtTime(settings.compRatio, now, 0.02);
  nodes.compressor.attack.setTargetAtTime(settings.compAttackMs / 1000, now, 0.02);
  nodes.compressor.release.setTargetAtTime(settings.compReleaseMs / 1000, now, 0.02);

  const makeupLinear = Math.pow(10, settings.makeupGainDb / 20);
  nodes.makeup.gain.setTargetAtTime(makeupLinear, now, 0.02);
}

/**
 * Generates a realistic spoken-cadence harmonic vocal test take (with bright sibilants & formants)
 * so the creator can immediately audition pitch lowering, FM warmth, de-essing, EQ, and compression.
 */
export function createDemoVoiceBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 6.2;
  const length = Math.floor(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // Simulate 5 spoken phrases with natural pauses, bright timbre (~195Hz fundamental + crisp upper harmonics)
  const phrases = [
    { start: 0.15, end: 1.35, baseF0: 198 },
    { start: 1.55, end: 2.75, baseF0: 212 },
    { start: 2.95, end: 4.15, baseF0: 192 },
    { start: 4.35, end: 5.95, baseF0: 205 },
  ];

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const phrase = phrases.find((p) => t >= p.start && t <= p.end);
    if (!phrase) {
      data[i] = 0;
      continue;
    }

    const rel = t - phrase.start;
    const dur = phrase.end - phrase.start;
    const fadeIn = Math.min(1, rel / 0.04);
    const fadeOut = Math.min(1, (dur - rel) / 0.06);
    // Syllabic modulation (~4.5 syllables/sec)
    const syllable = 0.45 + 0.55 * Math.pow(Math.abs(Math.sin(Math.PI * 4.5 * rel)), 0.7);

    // Subtle intonation contour
    const f0 = phrase.baseF0 * (1 + 0.08 * Math.sin(2 * Math.PI * 0.9 * rel) - 0.06 * (rel / dur));

    // Vocal harmonics + bright upper formants around 2.8kHz & 5.5kHz (to clearly demonstrate anti-aigu & warmth)
    const harmonic =
      0.42 * Math.sin(2 * Math.PI * f0 * t) +
      0.26 * Math.sin(2 * Math.PI * f0 * 2 * t) +
      0.16 * Math.sin(2 * Math.PI * f0 * 3 * t) +
      0.12 * Math.sin(2 * Math.PI * f0 * 7 * t) +
      0.14 * Math.sin(2 * Math.PI * f0 * 14 * t) +
      0.1 * Math.sin(2 * Math.PI * 5600 * t) * Math.max(0, Math.sin(Math.PI * 6 * rel));

    data[i] = harmonic * syllable * fadeIn * fadeOut * 0.55;
  }

  return buffer;
}

/**
 * Generates clean synthesized sound cues for concrete social situations & philosophical transitions.
 */
export function createSoundExtractBuffer(ctx: BaseAudioContext, cueId: string): AudioBuffer {
  const sr = ctx.sampleRate;
  const durMap: Record<string, number> = {
    cue_reveil_routine: 4.0,
    cue_declic_lunettes: 3.5,
    cue_cafe_social: 4.5,
    cue_glitch_matrice: 2.8,
    cue_nappe_precepteur: 6.0,
    cue_cloche_conclusion: 4.0,
  };
  const duration = durMap[cueId] ?? 3.5;
  const length = Math.floor(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.04) * Math.min(1, (duration - t) / 0.25);

    if (cueId === 'cue_reveil_routine') {
      // Digital morning alarm pulse + metro low hum
      const cycle = t % 0.85;
      const beep = cycle < 0.14 || (cycle > 0.22 && cycle < 0.36) ? Math.sin(2 * Math.PI * 1046 * t) * 0.28 : 0;
      const metroHum = 0.14 * Math.sin(2 * Math.PI * 82 * t) + 0.08 * Math.sin(2 * Math.PI * 164 * t);
      data[i] = (beep + metroHum) * env;
    } else if (cueId === 'cue_declic_lunettes') {
      // Warm ascending major-9th crystal swell
      const swell = Math.pow(Math.sin(Math.PI * (t / duration)), 0.7);
      const chord =
        0.3 * Math.sin(2 * Math.PI * 220 * t) +
        0.24 * Math.sin(2 * Math.PI * 329.63 * t) +
        0.2 * Math.sin(2 * Math.PI * 440 * t) +
        0.16 * Math.sin(2 * Math.PI * 554.37 * t);
      data[i] = chord * swell * 0.65;
    } else if (cueId === 'cue_cafe_social') {
      // Filtered warm room murmur + soft cup clink at 1.2s
      const noise = Math.sin(t * 1433) * Math.cos(t * 971) * 0.14;
      const hum = 0.12 * Math.sin(2 * Math.PI * 130 * t);
      const clink =
        t > 1.1 && t < 1.8
          ? Math.exp(-(t - 1.1) * 9) * 0.32 * Math.sin(2 * Math.PI * 2420 * t)
          : 0;
      data[i] = (noise + hum + clink) * env;
    } else if (cueId === 'cue_glitch_matrice') {
      // Frequency drop sweep
      const freq = 640 * Math.exp(-t * 1.1) + 75;
      const stutter = Math.sin(2 * Math.PI * 12 * t) > -0.2 ? 1 : 0.2;
      data[i] = Math.sin(2 * Math.PI * freq * t) * 0.35 * stutter * env;
    } else if (cueId === 'cue_nappe_precepteur') {
      // Deep contemplative Am7 analog pad
      const chord =
        0.34 * Math.sin(2 * Math.PI * 110 * t) +
        0.24 * Math.sin(2 * Math.PI * 164.81 * t) +
        0.18 * Math.sin(2 * Math.PI * 196 * t) +
        0.14 * Math.sin(2 * Math.PI * 261.63 * t);
      const breath = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.35 * t);
      data[i] = chord * breath * env * 0.65;
    } else {
      // Felt piano suspended bell
      const decay = Math.exp(-t * 0.85);
      const bell =
        0.38 * Math.sin(2 * Math.PI * 261.63 * t) +
        0.24 * Math.sin(2 * Math.PI * 392.0 * t) +
        0.16 * Math.sin(2 * Math.PI * 523.25 * t);
      data[i] = bell * decay * env * 0.75;
    }
  }
  return buffer;
}

export function applyPitchShiftToAudioBuffer(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  semitones: number
): AudioBuffer {
  if (Math.abs(semitones) < 0.05) return source;
  const out = ctx.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const shifted = applyPitchShiftBuffer(source.getChannelData(ch), source.sampleRate, semitones);
    out.getChannelData(ch).set(shifted);
  }
  return out;
}

export function extractWaveformPeaks(buffer: AudioBuffer, buckets = 160): number[] {
  const ch = buffer.getChannelData(0);
  if (ch.length === 0) return Array(buckets).fill(0);
  const step = Math.max(1, Math.floor(ch.length / buckets));
  const peaks: number[] = [];
  for (let b = 0; b < buckets; b++) {
    const start = b * step;
    const end = Math.min(ch.length, start + step);
    let maxVal = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(ch[i]);
      if (v > maxVal) maxVal = v;
    }
    peaks.push(maxVal);
  }
  return peaks;
}

export async function renderTimelineToWavBlob(
  clips: TimelineClip[],
  buffers: Record<string, AudioBuffer>,
  mastering: MasteringSettings
): Promise<Blob> {
  const sampleRate = 44100;
  const maxEndSec = clips.reduce((max, c) => {
    const clipLen = Math.max(0.1, c.trimEndSec - c.trimStartSec);
    return Math.max(max, c.startOnTimelineSec + clipLen);
  }, 1.0);

  const totalSamples = Math.ceil((maxEndSec + 0.25) * sampleRate);
  const offline = new OfflineAudioContext(2, totalSamples, sampleRate);

  const masteringNodes = buildMasteringChain(offline, mastering);
  masteringNodes.output.connect(offline.destination);

  for (const clip of clips) {
    const rawBuf = buffers[clip.audioKey];
    if (!rawBuf) continue;

    const shouldPitch =
      clip.track === 'voix' && !mastering.bypass && Math.abs(mastering.pitchSemitones) >= 0.05;
    const activeBuf = shouldPitch
      ? applyPitchShiftToAudioBuffer(offline, rawBuf, mastering.pitchSemitones)
      : rawBuf;

    const src = offline.createBufferSource();
    src.buffer = activeBuf;

    const clipGain = offline.createGain();
    const start = Math.max(0, clip.startOnTimelineSec);
    const offset = Math.max(0, clip.trimStartSec);
    const dur = Math.max(0.05, Math.min(rawBuf.duration - offset, clip.trimEndSec - clip.trimStartSec));

    // Envelope: volume + fadeIn + fadeOut
    const targetVol = Math.max(0, clip.volume);
    const fadeIn = Math.min(dur * 0.45, Math.max(0, clip.fadeInSec));
    const fadeOut = Math.min(dur * 0.45, Math.max(0, clip.fadeOutSec));

    if (fadeIn > 0.01) {
      clipGain.gain.setValueAtTime(0.0001, start);
      clipGain.gain.linearRampToValueAtTime(targetVol, start + fadeIn);
    } else {
      clipGain.gain.setValueAtTime(targetVol, start);
    }

    if (fadeOut > 0.01) {
      clipGain.gain.setValueAtTime(targetVol, start + dur - fadeOut);
      clipGain.gain.linearRampToValueAtTime(0.0001, start + dur);
    }

    src.connect(clipGain);
    if (clip.track === 'voix') {
      clipGain.connect(masteringNodes.input);
    } else {
      clipGain.connect(offline.destination);
    }

    src.start(start, offset, dur);
  }

  const rendered = await offline.startRendering();
  const ch0 = rendered.getChannelData(0);
  const ch1 = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : ch0;
  const wavBytes = encodeWavPcm16([ch0, ch1], rendered.sampleRate);
  const copy = new Uint8Array(wavBytes.byteLength);
  copy.set(wavBytes);
  return new Blob([copy.buffer], { type: 'audio/wav' });
}
