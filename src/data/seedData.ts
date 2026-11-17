import type {
  MasteringPreset,
  MasteringSettings,
  NotebookAppearance,
  SoundExtractDefinition,
} from '../types/podcast';
import { SEASON_1_EPISODES } from './episodesBatch';
import { SONG_EPISODES } from './songEpisodes';
import { EPISODES_18_20 } from './episodes/ep18_20';
import { EPISODE_21_MORALE_TROTTOIR } from './episodes/ep21_morale_trottoir';
import { EPISODES_22_24 } from './episodes/ep22_24';

export const INITIAL_EPISODES = [
  ...SEASON_1_EPISODES,
  ...SONG_EPISODES,
  ...EPISODES_18_20,
  EPISODE_21_MORALE_TROTTOIR,
  ...EPISODES_22_24,
];

export const DEFAULT_APPEARANCE: NotebookAppearance = {
  paperTheme: 'cahier_ivoire',
  inkColor: 'encre_noire',
  writingFont: 'calligraphie',
  showMarginLine: true,
  showRuledLines: true,
  customBannerTitle: 'PHILOA2BALLES',
  customMotto: 'Carnet de philosophie pop & voix posée',
};

export const MASTERING_PRESETS: MasteringPreset[] = [
  {
    id: 'precepteur_doux',
    name: 'Voix Douce — Le Précepteur',
    description:
      'Abaisse légèrement la tonalité (-1.5 st), calme les aigus perçants et réchauffe le bas-médium pour une narration posée.',
    settings: {
      pitchSemitones: -1.5,
      fmWarmthDepth: 28,
      fmWarmthRateHz: 2.4,
      deEsserDb: -7.5,
      highPassHz: 85,
      lowMidWarmthDb: 4.5,
      presenceDb: 1.5,
      highShelfDb: -4.5,
      compThresholdDb: -22,
      compRatio: 3.5,
      compAttackMs: 14,
      compReleaseMs: 160,
      makeupGainDb: 4.0,
    },
  },
  {
    id: 'anti_aigu_broadcast',
    name: 'Anti-Aigu Broadcast',
    description:
      'Cible fortement les sifflantes et la brillance excessive (-2.0 st + De-Esser fort) tout en gardant une diction nette.',
    settings: {
      pitchSemitones: -2.0,
      fmWarmthDepth: 36,
      fmWarmthRateHz: 2.1,
      deEsserDb: -11.0,
      highPassHz: 95,
      lowMidWarmthDb: 5.5,
      presenceDb: 0.5,
      highShelfDb: -7.0,
      compThresholdDb: -20,
      compRatio: 4.2,
      compAttackMs: 10,
      compReleaseMs: 140,
      makeupGainDb: 4.5,
    },
  },
  {
    id: 'narration_cinema',
    name: 'Narration Cinéma',
    description:
      'Compression souple et ampleur grave (-1.0 st) idéale pour raconter des scènes de films et séries.',
    settings: {
      pitchSemitones: -1.0,
      fmWarmthDepth: 20,
      fmWarmthRateHz: 1.8,
      deEsserDb: -5.0,
      highPassHz: 75,
      lowMidWarmthDb: 3.5,
      presenceDb: 2.5,
      highShelfDb: -2.5,
      compThresholdDb: -24,
      compRatio: 3.0,
      compAttackMs: 18,
      compReleaseMs: 210,
      makeupGainDb: 3.5,
    },
  },
  {
    id: 'neutre_brut',
    name: 'Voix Naturelle (Neutre)',
    description:
      'Aucun abaissement de hauteur ni coloration, coupe-bas léger uniquement pour nettoyer les bruits de micro.',
    settings: {
      pitchSemitones: 0,
      fmWarmthDepth: 0,
      fmWarmthRateHz: 2.0,
      deEsserDb: 0,
      highPassHz: 70,
      lowMidWarmthDb: 0,
      presenceDb: 0,
      highShelfDb: 0,
      compThresholdDb: -16,
      compRatio: 1.5,
      compAttackMs: 20,
      compReleaseMs: 180,
      makeupGainDb: 0,
    },
  },
];

export const DEFAULT_MASTERING_SETTINGS: MasteringSettings = {
  presetId: MASTERING_PRESETS[0].id,
  bypass: false,
  ...MASTERING_PRESETS[0].settings,
};

export const SOUND_EXTRACTS: SoundExtractDefinition[] = [
  {
    id: 'cue_reveil_routine',
    title: 'Réveil 7h00 & Routine métro',
    category: 'situation_sociale',
    durationSec: 4.0,
    description: 'Bip de réveil matinal suivi d’un bourdonnement rythmé évoquant la répétition mécanique.',
    usageTip: 'À placer sur l’accroche pour illustrer la vie en mode pilote automatique.',
  },
  {
    id: 'cue_declic_lunettes',
    title: 'Déclic prise de conscience',
    category: 'cinema_declic',
    durationSec: 3.5,
    description: 'Accord cristallin ascendant avec résonance douce : le moment où Guy met les lunettes bleues.',
    usageTip: 'Idéal juste avant la bascule philosophique ou une révélation.',
  },
  {
    id: 'cue_cafe_social',
    title: 'Brouhaha café & Small Talk',
    category: 'situation_sociale',
    durationSec: 4.5,
    description: 'Ambiance feutrée de machine à café et murmure social pour illustrer les scripts quotidiens.',
    usageTip: 'Parfait sous un exemple concret de conversation imposée au travail.',
  },
  {
    id: 'cue_glitch_matrice',
    title: 'Rupture de boucle (Glitch doux)',
    category: 'cinema_declic',
    durationSec: 2.8,
    description: 'Micro-coupure fréquentielle qui symbolise un personnage qui sort de sa programmation.',
    usageTip: 'Transition rapide entre un exemple ciné et la question philosophique.',
  },
  {
    id: 'cue_nappe_precepteur',
    title: 'Nappe contemplative grave',
    category: 'transition',
    durationSec: 6.0,
    description: 'Pad analogique chaud et lent (La mineur) inspiré des interludes narratifs posés.',
    usageTip: 'Pour respirer 3 secondes après une citation dense.',
  },
  {
    id: 'cue_cloche_conclusion',
    title: 'Note finale suspendue',
    category: 'transition',
    durationSec: 4.0,
    description: 'Harmonie de piano feutré qui clôt l’épisode en laissant l’auditeur réfléchir.',
    usageTip: 'À glisser en fondu à la fin de la conclusion.',
  },
];
