import type {
  AudioTrackKind,
  CueKind,
  Episode,
  EpisodeCategory,
  InkColor,
  MasteringSettings,
  MemoryNote,
  NarrativeSegment,
  NotebookAppearance,
  PaperTheme,
  ResearchNote,
  SegmentRole,
  SegmentStatus,
  SourceKind,
  SourceReference,
  SourceStatus,
  TimelineClip,
  WordComment,
  WritingFont,
} from '../types/podcast';

export const MAX_SEGMENTS_PER_EPISODE = 40;
export const MAX_SOURCES_PER_EPISODE = 40;
export const MAX_NOTES_PER_EPISODE = 60;
export const MAX_CLIPS_IN_SETTINGS = 80;
export const MAX_SKETCH_DATA_URL_LEN = 150000;

const VALID_CATEGORIES: readonly EpisodeCategory[] = ['cinema_serie', 'chanson'];
const VALID_EPISODE_STATUSES: readonly Episode['status'][] = [
  'en_preparation',
  'en_enregistrement',
  'en_montage',
  'pret_a_publier',
];
const VALID_SEGMENT_ROLES: readonly SegmentRole[] = [
  'accroche',
  'concept',
  'exemple',
  'bascule',
  'nuance',
  'conclusion',
];
const VALID_SEGMENT_STATUSES: readonly SegmentStatus[] = [
  'brouillon',
  'pret',
  'enregistre',
  'monte',
];
const VALID_SOURCE_KINDS: readonly SourceKind[] = [
  'philosophie',
  'film_serie',
  'chanson',
  'sociologie',
  'article',
];
const VALID_SOURCE_STATUSES: readonly SourceStatus[] = ['verifiee', 'a_relire', 'a_citer'];
const VALID_CUE_KINDS: readonly CueKind[] = ['intonation', 'pause', 'exemple', 'rappel'];
const VALID_PAPER_THEMES: readonly PaperTheme[] = [
  'cahier_ivoire',
  'carnet_seyes',
  'encre_nuit',
  'studio_epure',
];
const VALID_INK_COLORS: readonly InkColor[] = [
  'encre_noire',
  'stylo_bleu',
  'plume_cuivre',
  'encre_sepia',
];
const VALID_WRITING_FONTS: readonly WritingFont[] = ['calligraphie', 'classique'];
const VALID_TRACK_KINDS: readonly AudioTrackKind[] = ['voix', 'extrait'];
const VALID_CLIP_SOURCE_TYPES: readonly TimelineClip['sourceType'][] = [
  'take',
  'sound_cue',
  'imported',
];

export function sanitizeDocId(raw: unknown, fallback = 'doc'): string {
  const str = typeof raw === 'string' ? raw : '';
  const cleaned = str.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 128);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function clampString(raw: unknown, maxLen: number, fallback = ''): string {
  if (typeof raw !== 'string') return fallback.slice(0, maxLen);
  return raw.length > maxLen ? raw.slice(0, maxLen) : raw;
}

function clampNumber(raw: unknown, min: number, max: number, fallback: number): number {
  const num = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

function sanitizeComment(c: WordComment, fallbackSegId: string): WordComment {
  return {
    id: sanitizeDocId(c.id, 'cmt'),
    segmentId: sanitizeDocId(c.segmentId, fallbackSegId),
    selectedText: clampString(c.selectedText, 300),
    startOffset: clampNumber(c.startOffset, 0, 25000, 0),
    endOffset: clampNumber(c.endOffset, 0, 25000, 0),
    comment: clampString(c.comment, 1000),
    cueKind: sanitizeEnum(c.cueKind, VALID_CUE_KINDS, 'rappel'),
    createdAt: clampString(c.createdAt, 64, new Date().toISOString()),
  };
}

function sanitizeSegment(seg: NarrativeSegment, index: number): NarrativeSegment {
  const segId = sanitizeDocId(seg.id, `seg-${index + 1}`);
  const out: NarrativeSegment = {
    id: segId,
    title: clampString(seg.title, 300, `Segment ${index + 1}`),
    role: sanitizeEnum(seg.role, VALID_SEGMENT_ROLES, 'concept'),
    status: sanitizeEnum(seg.status, VALID_SEGMENT_STATUSES, 'brouillon'),
    scriptText: clampString(seg.scriptText, 25000),
    concreteExample: clampString(seg.concreteExample, 2000),
    estimatedWpm: clampNumber(seg.estimatedWpm, 60, 260, 140),
    linkedSourceIds: Array.isArray(seg.linkedSourceIds)
      ? seg.linkedSourceIds.slice(0, 40).map((s) => sanitizeDocId(s, 'src'))
      : [],
  };

  if (typeof seg.soundCueId === 'string' && seg.soundCueId.trim()) {
    out.soundCueId = clampString(seg.soundCueId, 128);
  }
  if (typeof seg.soundCueNote === 'string' && seg.soundCueNote.trim()) {
    out.soundCueNote = clampString(seg.soundCueNote, 500);
  }
  if (typeof seg.targetDurationSec === 'number' && Number.isFinite(seg.targetDurationSec)) {
    out.targetDurationSec = clampNumber(seg.targetDurationSec, 5, 7200, 180);
  }
  if (typeof seg.linkedTakeId === 'string' && seg.linkedTakeId.trim()) {
    out.linkedTakeId = clampString(seg.linkedTakeId, 128);
  }
  if (Array.isArray(seg.comments) && seg.comments.length > 0) {
    out.comments = seg.comments.slice(0, 80).map((c) => sanitizeComment(c, segId));
  }
  if (typeof seg.sketchDataUrl === 'string' && seg.sketchDataUrl.length > 0 && seg.sketchDataUrl.length <= MAX_SKETCH_DATA_URL_LEN) {
    out.sketchDataUrl = seg.sketchDataUrl;
  }

  return out;
}

function sanitizeSource(src: SourceReference, index: number): SourceReference {
  return {
    id: sanitizeDocId(src.id, `src-${index + 1}`),
    title: clampString(src.title, 300),
    authorOrDirector: clampString(src.authorOrDirector, 200),
    year: clampString(src.year, 32),
    kind: sanitizeEnum(src.kind, VALID_SOURCE_KINDS, 'philosophie'),
    referenceLocation: clampString(src.referenceLocation, 300),
    keyTakeaway: clampString(src.keyTakeaway, 2000),
    status: sanitizeEnum(src.status, VALID_SOURCE_STATUSES, 'a_relire'),
  };
}

function sanitizeNote(note: ResearchNote, index: number): ResearchNote {
  const out: ResearchNote = {
    id: sanitizeDocId(note.id, `note-${index + 1}`),
    title: clampString(note.title, 300),
    content: clampString(note.content, 10000),
    createdAt: clampString(note.createdAt, 64, new Date().toISOString().slice(0, 10)),
  };
  if (typeof note.segmentId === 'string' && note.segmentId.trim()) {
    out.segmentId = sanitizeDocId(note.segmentId, 'seg');
  }
  return out;
}

export interface PreparedEpisodePayload {
  id: string;
  ownerId: string;
  number: string;
  category: EpisodeCategory;
  title: string;
  workTitle: string;
  philosophicalTheme: string;
  logline: string;
  targetMinutes: number;
  draftThoughts: string;
  status: Episode['status'];
  segments: NarrativeSegment[];
  sources: SourceReference[];
  notes: ResearchNote[];
  clientUpdatedAt: string;
}

export function prepareEpisodePayload(
  episode: Episode,
  uid: string,
  clientUpdatedAtIso = new Date().toISOString()
): PreparedEpisodePayload {
  const epId = sanitizeDocId(episode.id, 'ep');
  const ownerId = sanitizeDocId(uid, 'user');
  const rawNumber = clampString(episode.number, 16, '01').trim() || '01';

  return {
    id: epId,
    ownerId,
    number: rawNumber,
    category: sanitizeEnum(episode.category, VALID_CATEGORIES, 'cinema_serie'),
    title: clampString(episode.title, 300),
    workTitle: clampString(episode.workTitle, 300),
    philosophicalTheme: clampString(episode.philosophicalTheme, 400),
    logline: clampString(episode.logline, 1200),
    targetMinutes: clampNumber(episode.targetMinutes, 1, 240, 30),
    draftThoughts: clampString(episode.draftThoughts ?? '', 20000),
    status: sanitizeEnum(episode.status, VALID_EPISODE_STATUSES, 'en_preparation'),
    segments: (Array.isArray(episode.segments) ? episode.segments : [])
      .slice(0, MAX_SEGMENTS_PER_EPISODE)
      .map(sanitizeSegment),
    sources: (Array.isArray(episode.sources) ? episode.sources : [])
      .slice(0, MAX_SOURCES_PER_EPISODE)
      .map(sanitizeSource),
    notes: (Array.isArray(episode.notes) ? episode.notes : [])
      .slice(0, MAX_NOTES_PER_EPISODE)
      .map(sanitizeNote),
    clientUpdatedAt: clampString(clientUpdatedAtIso || episode.updatedAt, 64, new Date().toISOString()),
  };
}

export function episodeDocToEpisode(raw: Record<string, unknown>): Episode {
  const updatedDate =
    typeof raw.clientUpdatedAt === 'string' && raw.clientUpdatedAt.length >= 10
      ? raw.clientUpdatedAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  return {
    id: sanitizeDocId(raw.id, 'ep'),
    number: clampString(raw.number, 16, '01'),
    category: sanitizeEnum(raw.category, VALID_CATEGORIES, 'cinema_serie'),
    title: clampString(raw.title, 300),
    workTitle: clampString(raw.workTitle, 300),
    philosophicalTheme: clampString(raw.philosophicalTheme, 400),
    logline: clampString(raw.logline, 1200),
    targetMinutes: clampNumber(raw.targetMinutes, 1, 240, 30),
    draftThoughts: clampString(raw.draftThoughts, 20000),
    status: sanitizeEnum(raw.status, VALID_EPISODE_STATUSES, 'en_preparation'),
    segments: Array.isArray(raw.segments) ? (raw.segments as NarrativeSegment[]) : [],
    sources: Array.isArray(raw.sources) ? (raw.sources as SourceReference[]) : [],
    notes: Array.isArray(raw.notes) ? (raw.notes as ResearchNote[]) : [],
    updatedAt: updatedDate,
  };
}

export interface PreparedStudioSettingsPayload {
  ownerId: string;
  activeEpisodeId: string;
  appearance: NotebookAppearance;
  mastering: MasteringSettings;
  clips: TimelineClip[];
}

function sanitizeClip(clip: TimelineClip, index: number): TimelineClip {
  const out: TimelineClip = {
    id: sanitizeDocId(clip.id, `clip-${index + 1}`),
    label: clampString(clip.label, 200, 'Extrait'),
    track: sanitizeEnum(clip.track, VALID_TRACK_KINDS, 'voix'),
    sourceType: sanitizeEnum(clip.sourceType, VALID_CLIP_SOURCE_TYPES, 'take'),
    audioKey: clampString(clip.audioKey, 128, 'demo_voice_take'),
    startOnTimelineSec: clampNumber(clip.startOnTimelineSec, 0, 86400, 0),
    trimStartSec: clampNumber(clip.trimStartSec, 0, 86400, 0),
    trimEndSec: clampNumber(clip.trimEndSec, 0, 86400, 1),
    sourceDurationSec: clampNumber(clip.sourceDurationSec, 0, 86400, 1),
    volume: clampNumber(clip.volume, 0, 2, 1),
    fadeInSec: clampNumber(clip.fadeInSec, 0, 30, 0.05),
    fadeOutSec: clampNumber(clip.fadeOutSec, 0, 30, 0.1),
  };
  if (typeof clip.segmentId === 'string' && clip.segmentId.trim()) {
    out.segmentId = sanitizeDocId(clip.segmentId, 'seg');
  }
  return out;
}

export function prepareStudioSettingsPayload(params: {
  uid: string;
  activeEpisodeId: string;
  appearance: NotebookAppearance;
  mastering: MasteringSettings;
  clips: TimelineClip[];
}): PreparedStudioSettingsPayload {
  const { uid, activeEpisodeId, appearance, mastering, clips } = params;
  return {
    ownerId: sanitizeDocId(uid, 'user'),
    activeEpisodeId: sanitizeDocId(activeEpisodeId, 'ep-01-freeguy'),
    appearance: {
      paperTheme: sanitizeEnum(appearance.paperTheme, VALID_PAPER_THEMES, 'cahier_ivoire'),
      inkColor: sanitizeEnum(appearance.inkColor, VALID_INK_COLORS, 'encre_noire'),
      writingFont: sanitizeEnum(appearance.writingFont, VALID_WRITING_FONTS, 'calligraphie'),
      showMarginLine: Boolean(appearance.showMarginLine),
      showRuledLines: Boolean(appearance.showRuledLines),
      customBannerTitle: clampString(appearance.customBannerTitle, 80, 'PHILOA2BALLES'),
      customMotto: clampString(
        appearance.customMotto,
        160,
        'Carnet de philosophie pop & voix posée'
      ),
    },
    mastering: {
      presetId: clampString(mastering.presetId, 80, 'precepteur_doux'),
      bypass: Boolean(mastering.bypass),
      pitchSemitones: clampNumber(mastering.pitchSemitones, -12, 12, -1.5),
      fmWarmthDepth: clampNumber(mastering.fmWarmthDepth, 0, 100, 28),
      fmWarmthRateHz: clampNumber(mastering.fmWarmthRateHz, 0.1, 20, 2.4),
      deEsserDb: clampNumber(mastering.deEsserDb, -24, 0, -7.5),
      highPassHz: clampNumber(mastering.highPassHz, 20, 300, 85),
      lowMidWarmthDb: clampNumber(mastering.lowMidWarmthDb, -12, 12, 4.5),
      presenceDb: clampNumber(mastering.presenceDb, -12, 12, 1.5),
      highShelfDb: clampNumber(mastering.highShelfDb, -18, 12, -4.5),
      compThresholdDb: clampNumber(mastering.compThresholdDb, -48, 0, -22),
      compRatio: clampNumber(mastering.compRatio, 1, 20, 3.5),
      compAttackMs: clampNumber(mastering.compAttackMs, 1, 200, 14),
      compReleaseMs: clampNumber(mastering.compReleaseMs, 20, 1000, 160),
      makeupGainDb: clampNumber(mastering.makeupGainDb, -12, 24, 4.0),
    },
    clips: (Array.isArray(clips) ? clips : []).slice(0, MAX_CLIPS_IN_SETTINGS).map(sanitizeClip),
  };
}

export function sortEpisodesDeterministically(episodes: Episode[]): Episode[] {
  return [...episodes].sort((a, b) => {
    const numA = Number.parseInt(a.number, 10);
    const numB = Number.parseInt(b.number, 10);
    if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
      return numA - numB;
    }
    return a.id.localeCompare(b.id);
  });
}

export function mergeEpisodesOnInitialSync(
  localEpisodes: Episode[],
  cloudEpisodes: Episode[],
  autoSeedMissingIds: ReadonlySet<string> = new Set(),
  dirtyLocalIds: ReadonlySet<string> = new Set()
): {
  merged: Episode[];
  toUploadToCloud: Episode[];
} {
  if (cloudEpisodes.length === 0) {
    return {
      merged: sortEpisodesDeterministically(localEpisodes),
      toUploadToCloud: localEpisodes,
    };
  }

  const mergedById = new Map<string, Episode>();
  for (const cep of cloudEpisodes) {
    mergedById.set(sanitizeDocId(cep.id, 'ep'), cep);
  }

  const toUploadToCloud: Episode[] = [];
  for (const ep of localEpisodes) {
    const safeId = sanitizeDocId(ep.id, 'ep');
    const isDirty = dirtyLocalIds.has(ep.id) || dirtyLocalIds.has(safeId);

    if (mergedById.has(safeId)) {
      if (isDirty) {
        mergedById.set(safeId, ep);
        toUploadToCloud.push(ep);
      }
      continue;
    }

    if (/^ep-\d{10,}/.test(ep.id) || autoSeedMissingIds.has(ep.id) || isDirty) {
      mergedById.set(safeId, ep);
      toUploadToCloud.push(ep);
    }
  }

  return {
    merged: sortEpisodesDeterministically(Array.from(mergedById.values())),
    toUploadToCloud,
  };
}

export function computeEpisodeContentHash(ep: Episode): string {
  return JSON.stringify({
    id: ep.id,
    number: ep.number,
    category: ep.category ?? 'cinema_serie',
    title: ep.title,
    workTitle: ep.workTitle,
    philosophicalTheme: ep.philosophicalTheme,
    logline: ep.logline,
    targetMinutes: ep.targetMinutes ?? 30,
    draftThoughts: ep.draftThoughts ?? '',
    status: ep.status,
    segments: ep.segments.map((s) => ({
      id: s.id,
      title: s.title,
      role: s.role,
      status: s.status,
      scriptText: s.scriptText,
      concreteExample: s.concreteExample,
      soundCueId: s.soundCueId ?? '',
      soundCueNote: s.soundCueNote ?? '',
      targetDurationSec: s.targetDurationSec ?? null,
      linkedTakeId: s.linkedTakeId ?? '',
      estimatedWpm: s.estimatedWpm,
      linkedSourceIds: s.linkedSourceIds,
      comments: s.comments ?? [],
      sketchDataUrl: s.sketchDataUrl ?? '',
    })),
    sources: ep.sources,
    notes: ep.notes.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      segmentId: n.segmentId ?? '',
      createdAt: n.createdAt,
    })),
  });
}

export interface PreparedMemoryNotePayload {
  id: string;
  ownerId: string;
  content: string;
  assignedEpisodeId: string;
  assignedSegmentId: string;
  assignedEpisodeLabel: string;
  assignedAt: string;
  clientCreatedAt: string;
  clientUpdatedAt: string;
}

export function prepareMemoryNotePayload(
  note: MemoryNote,
  uid: string
): PreparedMemoryNotePayload {
  const safeId = sanitizeDocId(note.id, 'mnote');
  const safeOwnerId = sanitizeDocId(uid, 'user');
  const trimmedContent = clampString(note.content, 10000).trim() || 'Note';
  const nowIso = new Date().toISOString();
  const createdAt = clampString(note.createdAt, 64, nowIso) || nowIso;
  const updatedAt = clampString(note.updatedAt, 64, createdAt) || createdAt;

  return {
    id: safeId,
    ownerId: safeOwnerId,
    content: trimmedContent,
    assignedEpisodeId:
      typeof note.assignedEpisodeId === 'string' && note.assignedEpisodeId.trim()
        ? sanitizeDocId(note.assignedEpisodeId, '')
        : '',
    assignedSegmentId:
      typeof note.assignedSegmentId === 'string' && note.assignedSegmentId.trim()
        ? sanitizeDocId(note.assignedSegmentId, '')
        : '',
    assignedEpisodeLabel: clampString(note.assignedEpisodeLabel ?? '', 300),
    assignedAt: clampString(note.assignedAt ?? '', 64),
    clientCreatedAt: createdAt,
    clientUpdatedAt: updatedAt,
  };
}

export function memoryNoteDocToNote(raw: Record<string, unknown>): MemoryNote {
  const nowIso = new Date().toISOString();
  const createdAt = clampString(raw.clientCreatedAt, 64, nowIso) || nowIso;
  const updatedAt = clampString(raw.clientUpdatedAt, 64, createdAt) || createdAt;
  const assignedEpId = clampString(raw.assignedEpisodeId, 128).trim();
  const assignedSegId = clampString(raw.assignedSegmentId, 128).trim();
  const assignedLabel = clampString(raw.assignedEpisodeLabel, 300).trim();
  const assignedAt = clampString(raw.assignedAt, 64).trim();

  const out: MemoryNote = {
    id: sanitizeDocId(raw.id, 'mnote'),
    content: clampString(raw.content, 10000),
    createdAt,
    updatedAt,
  };
  if (assignedEpId) out.assignedEpisodeId = assignedEpId;
  if (assignedSegId) out.assignedSegmentId = assignedSegId;
  if (assignedLabel) out.assignedEpisodeLabel = assignedLabel;
  if (assignedAt) out.assignedAt = assignedAt;
  return out;
}

export function sortMemoryNotesChronologically(notes: MemoryNote[]): MemoryNote[] {
  return [...notes].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt.localeCompare(b.createdAt);
    }
    return a.id.localeCompare(b.id);
  });
}

export function computeMemoryNoteHash(note: MemoryNote): string {
  return JSON.stringify({
    id: note.id,
    content: note.content,
    assignedEpisodeId: note.assignedEpisodeId ?? '',
    assignedSegmentId: note.assignedSegmentId ?? '',
    assignedEpisodeLabel: note.assignedEpisodeLabel ?? '',
    assignedAt: note.assignedAt ?? '',
  });
}

export function mergeMemoryNotesOnInitialSync(
  localNotes: MemoryNote[],
  cloudNotes: MemoryNote[]
): {
  merged: MemoryNote[];
  toUploadToCloud: MemoryNote[];
} {
  const byId = new Map<string, MemoryNote>();
  const cloudById = new Map<string, MemoryNote>();
  for (const cn of cloudNotes) {
    const safeId = sanitizeDocId(cn.id, 'mnote');
    cloudById.set(safeId, cn);
    byId.set(safeId, cn);
  }

  const toUploadToCloud: MemoryNote[] = [];
  for (const ln of localNotes) {
    const safeId = sanitizeDocId(ln.id, 'mnote');
    const existingCloud = cloudById.get(safeId);
    if (!existingCloud) {
      byId.set(safeId, ln);
      toUploadToCloud.push(ln);
    } else if (ln.updatedAt > existingCloud.updatedAt && computeMemoryNoteHash(ln) !== computeMemoryNoteHash(existingCloud)) {
      byId.set(safeId, ln);
      toUploadToCloud.push(ln);
    }
  }

  return {
    merged: sortMemoryNotesChronologically(Array.from(byId.values())),
    toUploadToCloud,
  };
}

export function applyMemoryNoteContentUpdate(
  notes: MemoryNote[],
  noteId: string,
  content: string,
  nowIso = new Date().toISOString()
): { nextNotes: MemoryNote[]; updatedNote: MemoryNote | null } {
  let updatedNote: MemoryNote | null = null;
  const nextNotes = notes.map((n) => {
    if (n.id !== noteId) return n;
    updatedNote = { ...n, content, updatedAt: nowIso };
    return updatedNote;
  });
  return { nextNotes, updatedNote };
}

export function applyMemoryNoteAssignment(
  notes: MemoryNote[],
  noteId: string,
  assignment: {
    episodeId: string;
    segmentId: string;
    episodeLabel: string;
  },
  nowIso = new Date().toISOString()
): { nextNotes: MemoryNote[]; updatedNote: MemoryNote | null } {
  let updatedNote: MemoryNote | null = null;
  const nextNotes = notes.map((n) => {
    if (n.id !== noteId) return n;
    updatedNote = {
      ...n,
      assignedEpisodeId: assignment.episodeId,
      assignedSegmentId: assignment.segmentId,
      assignedEpisodeLabel: assignment.episodeLabel,
      assignedAt: nowIso,
      updatedAt: nowIso,
    };
    return updatedNote;
  });
  return { nextNotes, updatedNote };
}

export function applyCatalogEpisodeScenarioUpgrade(
  episodes: Episode[],
  catalogEpisode: Episode
): { episodes: Episode[]; upgradedEpisode: Episode | null } {
  const existingIdx = episodes.findIndex((ep) => ep.id === catalogEpisode.id);
  if (existingIdx === -1) {
    return {
      episodes: sortEpisodesDeterministically([...episodes, catalogEpisode]),
      upgradedEpisode: catalogEpisode,
    };
  }

  const existing = episodes[existingIdx];
  const catalogSegmentIds = new Set(catalogEpisode.segments.map((s) => s.id));
  const catalogSourceIds = new Set(catalogEpisode.sources.map((s) => s.id));
  const catalogNoteIds = new Set(catalogEpisode.notes.map((n) => n.id));

  const extraSegments = existing.segments.filter((s) => !catalogSegmentIds.has(s.id));
  const extraSources = existing.sources.filter((s) => !catalogSourceIds.has(s.id));
  const extraNotes = existing.notes.filter((n) => !catalogNoteIds.has(n.id));

  const existingSegById = new Map(existing.segments.map((s) => [s.id, s]));
  const mergedBaseSegments = catalogEpisode.segments.map((catSeg) => {
    const prevSeg = existingSegById.get(catSeg.id);
    if (!prevSeg) return catSeg;
    return {
      ...catSeg,
      status: prevSeg.status !== 'brouillon' ? prevSeg.status : catSeg.status,
      linkedTakeId: prevSeg.linkedTakeId ?? catSeg.linkedTakeId,
      soundCueNote: prevSeg.soundCueNote ?? catSeg.soundCueNote,
      sketchDataUrl: prevSeg.sketchDataUrl ?? catSeg.sketchDataUrl,
    };
  });

  const upgraded: Episode = {
    ...catalogEpisode,
    status: existing.status !== 'en_preparation' ? existing.status : catalogEpisode.status,
    sources: [...catalogEpisode.sources, ...extraSources],
    notes: [...catalogEpisode.notes, ...extraNotes],
    segments: [...mergedBaseSegments, ...extraSegments],
  };

  if (computeEpisodeContentHash(existing) === computeEpisodeContentHash(upgraded)) {
    return { episodes, upgradedEpisode: null };
  }

  const next = episodes.map((ep, idx) => (idx === existingIdx ? upgraded : ep));
  return {
    episodes: sortEpisodesDeterministically(next),
    upgradedEpisode: upgraded,
  };
}
