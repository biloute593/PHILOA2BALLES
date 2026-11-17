export type WorkspaceTab = 'script' | 'studio' | 'prompter' | 'publish';

export type SegmentRole = 'accroche' | 'concept' | 'exemple' | 'bascule' | 'nuance' | 'conclusion';

export type SegmentStatus = 'brouillon' | 'pret' | 'enregistre' | 'monte';

export type SourceStatus = 'verifiee' | 'a_relire' | 'a_citer';

export type EpisodeCategory = 'cinema_serie' | 'chanson';

export type SourceKind = 'philosophie' | 'film_serie' | 'chanson' | 'sociologie' | 'article';

export type CueKind = 'intonation' | 'pause' | 'exemple' | 'rappel';

export interface WordComment {
  id: string;
  segmentId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  comment: string;
  cueKind: CueKind;
  createdAt: string;
}

export type PaperTheme = 'cahier_ivoire' | 'carnet_seyes' | 'encre_nuit' | 'studio_epure';
export type InkColor = 'encre_noire' | 'stylo_bleu' | 'plume_cuivre' | 'encre_sepia';
export type WritingFont = 'calligraphie' | 'classique';

export interface NotebookAppearance {
  paperTheme: PaperTheme;
  inkColor: InkColor;
  writingFont: WritingFont;
  showMarginLine: boolean;
  showRuledLines: boolean;
  customBannerTitle: string;
  customMotto: string;
}

export interface NarrativeSegment {
  id: string;
  title: string;
  role: SegmentRole;
  status: SegmentStatus;
  scriptText: string;
  concreteExample: string;
  soundCueId?: string;
  soundCueNote?: string;
  estimatedWpm: number;
  targetDurationSec?: number;
  linkedSourceIds: string[];
  linkedTakeId?: string;
  comments?: WordComment[];
  sketchDataUrl?: string;
}

export interface SourceReference {
  id: string;
  title: string;
  authorOrDirector: string;
  year: string;
  kind: SourceKind;
  referenceLocation: string;
  keyTakeaway: string;
  status: SourceStatus;
}

export interface ResearchNote {
  id: string;
  title: string;
  content: string;
  segmentId?: string;
  createdAt: string;
}

export interface MemoryNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  assignedEpisodeId?: string;
  assignedSegmentId?: string;
  assignedEpisodeLabel?: string;
  assignedAt?: string;
}

export interface Episode {
  id: string;
  number: string;
  category?: EpisodeCategory;
  title: string;
  workTitle: string;
  philosophicalTheme: string;
  logline: string;
  targetMinutes?: number;
  draftThoughts?: string;
  status: 'en_preparation' | 'en_enregistrement' | 'en_montage' | 'pret_a_publier';
  segments: NarrativeSegment[];
  sources: SourceReference[];
  notes: ResearchNote[];
  updatedAt: string;
}

export interface MasteringSettings {
  presetId: string;
  bypass: boolean;
  pitchSemitones: number;
  fmWarmthDepth: number;
  fmWarmthRateHz: number;
  deEsserDb: number;
  highPassHz: number;
  lowMidWarmthDb: number;
  presenceDb: number;
  highShelfDb: number;
  compThresholdDb: number;
  compRatio: number;
  compAttackMs: number;
  compReleaseMs: number;
  makeupGainDb: number;
}

export interface MasteringPreset {
  id: string;
  name: string;
  description: string;
  settings: Omit<MasteringSettings, 'presetId' | 'bypass'>;
}

export type AudioTrackKind = 'voix' | 'extrait';

export interface TimelineClip {
  id: string;
  label: string;
  track: AudioTrackKind;
  sourceType: 'take' | 'sound_cue' | 'imported';
  audioKey: string;
  startOnTimelineSec: number;
  trimStartSec: number;
  trimEndSec: number;
  sourceDurationSec: number;
  volume: number;
  fadeInSec: number;
  fadeOutSec: number;
  segmentId?: string;
}

export interface SoundExtractDefinition {
  id: string;
  title: string;
  category: 'situation_sociale' | 'cinema_declic' | 'transition';
  durationSec: number;
  description: string;
  usageTip: string;
}
