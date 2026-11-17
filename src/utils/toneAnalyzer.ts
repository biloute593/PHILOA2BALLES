import type { MasteringSettings } from '../types/podcast';
import { calculateEqFrequencyResponse, semitonesToRate } from './audioDsp';

export interface SpectrumBandInfo {
  freqHz: number;
  label: string;
  zone: string;
  precepteurTargetDb: number;
}

/**
 * Courbe spectrale de référence inspirée du timbre posé, chaleureux et feutré du Précepteur
 * (exprimée en dB relatifs par rapport au pivot médium 1 kHz = 0 dB).
 */
export const PRECEPTEUR_SPECTRUM_BANDS: SpectrumBandInfo[] = [
  { freqHz: 60, label: '60 Hz', zone: 'Infra-grave', precepteurTargetDb: -10.0 },
  { freqHz: 120, label: '120 Hz', zone: 'Assise vocale', precepteurTargetDb: 1.5 },
  { freqHz: 210, label: '210 Hz', zone: 'Chaleur narrative', precepteurTargetDb: 4.0 },
  { freqHz: 450, label: '450 Hz', zone: 'Corps médium', precepteurTargetDb: 0.5 },
  { freqHz: 1000, label: '1 kHz', zone: 'Pivot central', precepteurTargetDb: 0.0 },
  { freqHz: 2800, label: '2.8 kHz', zone: 'Diction claire', precepteurTargetDb: 1.0 },
  { freqHz: 5800, label: '5.8 kHz', zone: 'Sifflantes adoucies', precepteurTargetDb: -6.5 },
  { freqHz: 10000, label: '10 kHz', zone: 'Velouté aigus', precepteurTargetDb: -5.5 },
];

export interface VoiceBufferMetrics {
  sampleRate: number;
  durationSec: number;
  activeFrameCount: number;
  rmsDb: number;
  peakDb: number;
  crestFactorDb: number;
  rawBandDb: number[];
}

export interface ToneAdjustmentRecommendation {
  id: string;
  section: 'eq' | 'compressor' | 'tonalite';
  parameterLabel: string;
  currentValueLabel: string;
  suggestedValueLabel: string;
  deltaLabel: string;
  reason: string;
}

export interface ToneAnalysisResult {
  clipLabel: string;
  metrics: VoiceBufferMetrics;
  frequencies: number[];
  rawBandDb: number[];
  currentBandDb: number[];
  targetBandDb: number[];
  bandDeltasDb: number[];
  conformityScore: number;
  spectralDistanceDb: number;
  tonalSummary: string;
  dynamicsSummary: string;
  suggestedEqPatch: Partial<MasteringSettings>;
  suggestedCompressorPatch: Partial<MasteringSettings>;
  suggestedSettings: MasteringSettings;
  recommendations: ToneAdjustmentRecommendation[];
}

function roundToHalfDb(val: number): number {
  return Math.round(val * 2) / 2;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function goertzelPower(frame: Float32Array, sampleRate: number, targetFreq: number): number {
  if (targetFreq <= 0 || targetFreq >= sampleRate * 0.48) return 1e-12;
  const n = frame.length;
  const k = (n * targetFreq) / sampleRate;
  const omega = (2 * Math.PI * k) / n;
  const coeff = 2 * Math.cos(omega);

  let q0 = 0;
  let q1 = 0;
  let q2 = 0;
  for (let i = 0; i < n; i++) {
    q0 = coeff * q1 - q2 + frame[i];
    q2 = q1;
    q1 = q0;
  }
  const real = q1 - q2 * Math.cos(omega);
  const imag = q2 * Math.sin(omega);
  return Math.max(1e-12, real * real + imag * imag);
}

/**
 * Mesure le spectre fréquentiel réel et la dynamique (RMS, Peak, facteur de crête)
 * d'un signal vocal mono en Float32Array.
 */
export function analyzeVoiceSamplesMetrics(
  samples: Float32Array,
  sampleRate: number
): VoiceBufferMetrics {
  const safeSr = Math.max(8000, sampleRate || 44100);
  const length = samples.length;
  const durationSec = length / safeSr;

  if (length === 0) {
    return {
      sampleRate: safeSr,
      durationSec: 0,
      activeFrameCount: 0,
      rmsDb: -60,
      peakDb: -60,
      crestFactorDb: 0,
      rawBandDb: PRECEPTEUR_SPECTRUM_BANDS.map(() => 0),
    };
  }

  let sumSqAll = 0;
  let peakAbs = 0;
  for (let i = 0; i < length; i++) {
    const v = samples[i];
    sumSqAll += v * v;
    const av = Math.abs(v);
    if (av > peakAbs) peakAbs = av;
  }

  const frameSize = Math.min(2048, Math.max(512, length));
  const totalPossibleFrames = Math.max(1, Math.floor(length / frameSize));
  const stepFrames = Math.max(1, Math.floor(totalPossibleFrames / 28));

  const hann = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
  }

  const bandPowers = new Float64Array(PRECEPTEUR_SPECTRUM_BANDS.length);
  let activeFrames = 0;
  let activeSumSq = 0;
  let activeSampleCount = 0;

  const windowed = new Float32Array(frameSize);

  for (let fIdx = 0; fIdx < totalPossibleFrames; fIdx += stepFrames) {
    const start = fIdx * frameSize;
    if (start + frameSize > length && fIdx > 0) break;
    const avail = Math.min(frameSize, length - start);

    let frameSq = 0;
    for (let i = 0; i < avail; i++) {
      const s = samples[start + i];
      frameSq += s * s;
    }
    const frameRms = Math.sqrt(frameSq / Math.max(1, avail));
    // Skip pure silence frames unless whole clip is quiet
    if (frameRms < 0.008) continue;

    activeFrames += 1;
    activeSumSq += frameSq;
    activeSampleCount += avail;

    for (let i = 0; i < frameSize; i++) {
      const s = i < avail ? samples[start + i] : 0;
      windowed[i] = s * hann[i];
    }

    for (let b = 0; b < PRECEPTEUR_SPECTRUM_BANDS.length; b++) {
      const center = PRECEPTEUR_SPECTRUM_BANDS[b].freqHz;
      // Average across 3 close frequency probes to smooth harmonic comb peaks
      const pLow = goertzelPower(windowed, safeSr, center * 0.91);
      const pMid = goertzelPower(windowed, safeSr, center);
      const pHigh = goertzelPower(windowed, safeSr, center * 1.09);
      bandPowers[b] += (pLow + pMid + pHigh) / 3;
    }
  }

  // Fallback if clip was very quiet (< 0.008 RMS)
  if (activeFrames === 0) {
    activeFrames = 1;
    activeSumSq = sumSqAll;
    activeSampleCount = length;
    const avail = Math.min(frameSize, length);
    for (let i = 0; i < frameSize; i++) {
      windowed[i] = (i < avail ? samples[i] : 0) * hann[i];
    }
    for (let b = 0; b < PRECEPTEUR_SPECTRUM_BANDS.length; b++) {
      const center = PRECEPTEUR_SPECTRUM_BANDS[b].freqHz;
      bandPowers[b] = goertzelPower(windowed, safeSr, center);
    }
  }

  const rms = Math.sqrt(activeSumSq / Math.max(1, activeSampleCount));
  const rmsDb = Number((20 * Math.log10(Math.max(1e-5, rms))).toFixed(1));
  const peakDb = Number((20 * Math.log10(Math.max(1e-5, peakAbs))).toFixed(1));
  const crestFactorDb = Number(Math.max(0, peakDb - rmsDb).toFixed(1));

  // Normalize spectral curve relative to midrange linear power anchor so gain or single-band notches don't skew EQ shape
  const rawDbAbs = Array.from(bandPowers, (p) => 10 * Math.log10(Math.max(1e-12, p / activeFrames)));
  const pivotPower = (bandPowers[3] + bandPowers[4]) / (2 * activeFrames);
  const pivotDb = 10 * Math.log10(Math.max(1e-12, pivotPower));
  const rawBandDb = rawDbAbs.map((db) => Number(clamp(db - pivotDb, -28, 24).toFixed(2)));

  return {
    sampleRate: safeSr,
    durationSec: Number(durationSec.toFixed(2)),
    activeFrameCount: activeFrames,
    rmsDb,
    peakDb,
    crestFactorDb,
    rawBandDb,
  };
}

/**
 * Estime la courbe fréquentielle actuelle après application des réglages de mastering actifs
 * (Hauteur, Égaliseur 4 bandes, De-Esser, Modulation FM) et la compare au style du Précepteur.
 */
export function compareVoiceWithPrecepteur(
  metrics: VoiceBufferMetrics,
  settings: MasteringSettings,
  clipLabel = 'Voix active'
): ToneAnalysisResult {
  const frequencies = PRECEPTEUR_SPECTRUM_BANDS.map((b) => b.freqHz);
  const targetBandDb = PRECEPTEUR_SPECTRUM_BANDS.map((b) => b.precepteurTargetDb);
  const rawBandDb = [...metrics.rawBandDb];

  // Account for pitch shift shifting formants/harmonics slightly downward or upward
  const pitchShiftRate = settings.bypass ? 1 : semitonesToRate(settings.pitchSemitones);
  const shiftedRawBandDb = frequencies.map((f, idx) => {
    if (Math.abs(pitchShiftRate - 1) < 0.01) return rawBandDb[idx];
    // Lower pitch moves upper brightness slightly down and reinforces low-mid body
    const semitoneFactor = settings.pitchSemitones;
    if (f <= 250) return rawBandDb[idx] - semitoneFactor * 0.45;
    if (f >= 4000) return rawBandDb[idx] + semitoneFactor * 0.55;
    return rawBandDb[idx];
  });

  const eqResponse = calculateEqFrequencyResponse(settings, frequencies);
  const fmSoftening = (f: number) => {
    if (settings.bypass || f < 4500) return 0;
    const depthRatio = clamp(settings.fmWarmthDepth / 100, 0, 1);
    return f >= 8000 ? -1.8 * depthRatio : -0.9 * depthRatio;
  };

  const currentUnnormalized = shiftedRawBandDb.map((raw, idx) => raw + eqResponse[idx] + fmSoftening(frequencies[idx]));
  const currentPivot = currentUnnormalized[4]; // keep 1 kHz aligned as 0 dB reference
  const currentBandDb = currentUnnormalized.map((db) => Number(clamp(db - currentPivot, -28, 24).toFixed(2)));

  const bandDeltasDb = currentBandDb.map((cur, idx) => Number((cur - targetBandDb[idx]).toFixed(2)));

  // Weighted spectral error across voice clarity & warmth bands (indices 1..7)
  const weights = [0.6, 1.1, 1.4, 0.9, 0.5, 1.0, 1.3, 1.2];
  let weightedSqErr = 0;
  let totalW = 0;
  for (let i = 0; i < bandDeltasDb.length; i++) {
    weightedSqErr += weights[i] * bandDeltasDb[i] * bandDeltasDb[i];
    totalW += weights[i];
  }
  const spectralDistanceDb = Number(Math.sqrt(weightedSqErr / totalW).toFixed(2));

  // Suggest optimal EQ parameters from the raw voice signature vs Le Précepteur target
  const rawPitchAdjusted210 = shiftedRawBandDb[2] - shiftedRawBandDb[4];
  const rawPitchAdjusted2800 = shiftedRawBandDb[5] - shiftedRawBandDb[4];
  const rawPitchAdjusted5800 = shiftedRawBandDb[6] - shiftedRawBandDb[4];
  const rawPitchAdjusted10000 = shiftedRawBandDb[7] - shiftedRawBandDb[4];
  const rawPitchAdjusted60 = shiftedRawBandDb[0] - shiftedRawBandDb[4];

  const suggestedHighPassHz = rawPitchAdjusted60 > -4 ? 105 : rawPitchAdjusted60 > -9 ? 90 : 80;
  const suggestedLowMidDb = roundToHalfDb(clamp(4.0 - rawPitchAdjusted210, -4, 9.5));
  const suggestedPresenceDb = roundToHalfDb(clamp(1.0 - rawPitchAdjusted2800, -5, 6));
  const rawExcessSibilance = rawPitchAdjusted5800 - -6.5;
  const suggestedDeEsserDb = roundToHalfDb(clamp(-Math.max(2.5, rawExcessSibilance * 0.85), -15, -2));
  const suggestedHighShelfDb = roundToHalfDb(clamp((-5.5 - rawPitchAdjusted10000) * 0.75, -12, 4));

  // Suggest optimal Compressor parameters based on measured dynamic range & RMS
  let suggestedThreshold = -22;
  let suggestedRatio = 3.5;
  let suggestedAttack = 14;
  let suggestedRelease = 160;
  let dynamicsSummary = '';

  if (metrics.crestFactorDb >= 14.5) {
    suggestedThreshold = -24;
    suggestedRatio = 4.5;
    suggestedAttack = 10;
    suggestedRelease = 150;
    dynamicsSummary = `Dynamique très contrastée (crête ${metrics.crestFactorDb} dB) : une compression plus ferme stabilisera les fins de phrases.`;
  } else if (metrics.crestFactorDb <= 8.5) {
    suggestedThreshold = -18;
    suggestedRatio = 2.5;
    suggestedAttack = 22;
    suggestedRelease = 210;
    dynamicsSummary = `Voix déjà dense (crête ${metrics.crestFactorDb} dB) : compression douce recommandée pour garder la respiration du Précepteur.`;
  } else {
    suggestedThreshold = -22;
    suggestedRatio = 3.5;
    suggestedAttack = 14;
    suggestedRelease = 160;
    dynamicsSummary = `Dynamique équilibrée (crête ${metrics.crestFactorDb} dB) : réglage broadcast posé idéal pour l'écoute longue durée.`;
  }

  // Target broadcast RMS around -18.5 dBFS after compression
  const estCompressionLoss = Math.max(0, ((-14 - suggestedThreshold) * (1 - 1 / suggestedRatio)) * 0.35);
  const rawMakeupNeeded = -18.5 - metrics.rmsDb + estCompressionLoss;
  const suggestedMakeupGainDb = roundToHalfDb(clamp(rawMakeupNeeded, -4, 10));

  const suggestedEqPatch: Partial<MasteringSettings> = {
    bypass: false,
    highPassHz: suggestedHighPassHz,
    lowMidWarmthDb: suggestedLowMidDb,
    presenceDb: suggestedPresenceDb,
    deEsserDb: suggestedDeEsserDb,
    highShelfDb: suggestedHighShelfDb,
  };

  const suggestedCompressorPatch: Partial<MasteringSettings> = {
    bypass: false,
    compThresholdDb: suggestedThreshold,
    compRatio: suggestedRatio,
    compAttackMs: suggestedAttack,
    compReleaseMs: suggestedRelease,
    makeupGainDb: suggestedMakeupGainDb,
  };

  const suggestedSettings: MasteringSettings = {
    ...settings,
    presetId: 'custom',
    ...suggestedEqPatch,
    ...suggestedCompressorPatch,
  };

  // Compute conformity score (0..100) combining spectral match and dynamic alignment
  const compDeltaPenalty =
    Math.abs(settings.compThresholdDb - suggestedThreshold) * 0.6 +
    Math.abs(settings.compRatio - suggestedRatio) * 2.5 +
    (settings.bypass ? 12 : 0);
  const rawScore = 100 - spectralDistanceDb * 7.2 - compDeltaPenalty * 0.55;
  const conformityScore = Math.round(clamp(rawScore, 12, 99));

  // Build readable French diagnostic summary
  const warmDelta = bandDeltasDb[2]; // 210 Hz
  const sibDelta = bandDeltasDb[6]; // 5.8 kHz
  const airDelta = bandDeltasDb[7]; // 10 kHz
  const tonalHighlights: string[] = [];

  if (warmDelta < -1.5) {
    tonalHighlights.push(`manque de chaleur dans le bas-médium (${warmDelta.toFixed(1)} dB à 210 Hz)`);
  } else if (warmDelta > 2.2) {
    tonalHighlights.push(`bas-médium légèrement chargé (+${warmDelta.toFixed(1)} dB à 210 Hz)`);
  }
  if (sibDelta > 1.8 || airDelta > 1.8) {
    tonalHighlights.push(
      `aigus/sifflantes trop en avant (+${Math.max(sibDelta, airDelta).toFixed(1)} dB vers 5.8–10 kHz)`
    );
  }
  if (bandDeltasDb[5] < -1.8) {
    tonalHighlights.push(`diction légèrement en retrait (${bandDeltasDb[5].toFixed(1)} dB à 2.8 kHz)`);
  }

  const tonalSummary =
    settings.bypass
      ? 'Bypass actif (voix brute) : activez le mastering pour rapprocher votre timbre du velouté du Précepteur.'
      : tonalHighlights.length === 0
        ? 'Équilibre tonal très proche de la signature vocale du Précepteur : grave posé, médium net et aigus reposants.'
        : `Écart détecté par rapport au Précepteur : ${tonalHighlights.join(' · ')}.`;

  // Build concrete adjustment suggestions where setting differs meaningfully from target
  const recommendations: ToneAdjustmentRecommendation[] = [];

  if (Math.abs(settings.lowMidWarmthDb - suggestedLowMidDb) >= 0.5 || settings.bypass) {
    const diff = suggestedLowMidDb - settings.lowMidWarmthDb;
    recommendations.push({
      id: 'rec-lowmid',
      section: 'eq',
      parameterLabel: 'Égaliseur · Chaleur 210 Hz',
      currentValueLabel: `${settings.lowMidWarmthDb > 0 ? '+' : ''}${settings.lowMidWarmthDb.toFixed(1)} dB`,
      suggestedValueLabel: `${suggestedLowMidDb > 0 ? '+' : ''}${suggestedLowMidDb.toFixed(1)} dB`,
      deltaLabel: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} dB`,
      reason:
        diff > 0
          ? 'Ajoute l’assise grave chaleureuse caractéristique d’une narration posée.'
          : 'Allège le bas-médium pour éviter un effet caverneux.',
    });
  }

  if (Math.abs(settings.deEsserDb - suggestedDeEsserDb) >= 0.5 || settings.bypass) {
    const diff = suggestedDeEsserDb - settings.deEsserDb;
    recommendations.push({
      id: 'rec-deesser',
      section: 'eq',
      parameterLabel: 'Anti-Aigu / De-Esser 5.8 kHz',
      currentValueLabel: `${settings.deEsserDb.toFixed(1)} dB`,
      suggestedValueLabel: `${suggestedDeEsserDb.toFixed(1)} dB`,
      deltaLabel: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} dB`,
      reason: 'Adoucit les « s » et « ch » agressifs pour une écoute confortable au casque pendant 30 min.',
    });
  }

  if (Math.abs(settings.highShelfDb - suggestedHighShelfDb) >= 0.5 || settings.bypass) {
    const diff = suggestedHighShelfDb - settings.highShelfDb;
    recommendations.push({
      id: 'rec-highshelf',
      section: 'eq',
      parameterLabel: 'Égaliseur · Aigus 7.5 kHz',
      currentValueLabel: `${settings.highShelfDb > 0 ? '+' : ''}${settings.highShelfDb.toFixed(1)} dB`,
      suggestedValueLabel: `${suggestedHighShelfDb > 0 ? '+' : ''}${suggestedHighShelfDb.toFixed(1)} dB`,
      deltaLabel: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} dB`,
      reason: 'Arrondit la brillance haute fréquence vers un rendu feutré.',
    });
  }

  if (Math.abs(settings.presenceDb - suggestedPresenceDb) >= 0.5) {
    const diff = suggestedPresenceDb - settings.presenceDb;
    recommendations.push({
      id: 'rec-presence',
      section: 'eq',
      parameterLabel: 'Égaliseur · Présence 2.8 kHz',
      currentValueLabel: `${settings.presenceDb > 0 ? '+' : ''}${settings.presenceDb.toFixed(1)} dB`,
      suggestedValueLabel: `${suggestedPresenceDb > 0 ? '+' : ''}${suggestedPresenceDb.toFixed(1)} dB`,
      deltaLabel: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} dB`,
      reason: 'Maintient l’intelligibilité de l’articulation sans dureté métallique.',
    });
  }

  if (Math.abs(settings.highPassHz - suggestedHighPassHz) >= 5) {
    const diff = suggestedHighPassHz - settings.highPassHz;
    recommendations.push({
      id: 'rec-hp',
      section: 'eq',
      parameterLabel: 'Égaliseur · Coupe-bas',
      currentValueLabel: `${settings.highPassHz} Hz`,
      suggestedValueLabel: `${suggestedHighPassHz} Hz`,
      deltaLabel: `${diff >= 0 ? '+' : ''}${diff} Hz`,
      reason: 'Nettoie les vibrations de table ou souffles graves sous la voix.',
    });
  }

  if (
    Math.abs(settings.compThresholdDb - suggestedThreshold) >= 1 ||
    Math.abs(settings.compRatio - suggestedRatio) >= 0.5 ||
    settings.bypass
  ) {
    recommendations.push({
      id: 'rec-comp-core',
      section: 'compressor',
      parameterLabel: 'Compresseur · Seuil & Ratio',
      currentValueLabel: `${settings.compThresholdDb} dB · ${settings.compRatio.toFixed(1)}:1`,
      suggestedValueLabel: `${suggestedThreshold} dB · ${suggestedRatio.toFixed(1)}:1`,
      deltaLabel: `Att ${suggestedAttack} ms`,
      reason: 'Égalise le volume entre murmures intimes et phrases appuyées sans écraser les silences.',
    });
  }

  if (Math.abs(settings.makeupGainDb - suggestedMakeupGainDb) >= 0.5) {
    const diff = suggestedMakeupGainDb - settings.makeupGainDb;
    recommendations.push({
      id: 'rec-comp-makeup',
      section: 'compressor',
      parameterLabel: 'Compresseur · Makeup Gain',
      currentValueLabel: `+${settings.makeupGainDb.toFixed(1)} dB`,
      suggestedValueLabel: `+${suggestedMakeupGainDb.toFixed(1)} dB`,
      deltaLabel: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} dB`,
      reason: 'Aligne le niveau moyen autour de -18.5 dBFS pour YouTube et plateformes podcast.',
    });
  }

  return {
    clipLabel,
    metrics,
    frequencies,
    rawBandDb,
    currentBandDb,
    targetBandDb,
    bandDeltasDb,
    conformityScore,
    spectralDistanceDb,
    tonalSummary,
    dynamicsSummary,
    suggestedEqPatch,
    suggestedCompressorPatch,
    suggestedSettings,
    recommendations,
  };
}
