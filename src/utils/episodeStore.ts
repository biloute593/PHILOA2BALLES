import type { Episode, NarrativeSegment, ResearchNote, SegmentRole, SourceReference, SourceStatus } from '../types/podcast';
import { estimateSpeechDurationSeconds, formatTimecode } from './audioDsp';
import {
  detectEpisodeRepetitions,
  planSmartDraftPlacement,
  polishFrenchThought,
  type DraftPlacementPlan,
} from './frenchPolisher';

export function moveSegmentInList(
  segments: NarrativeSegment[],
  segmentId: string,
  direction: 'up' | 'down'
): NarrativeSegment[] {
  const index = segments.findIndex((s) => s.id === segmentId);
  if (index === -1) return segments;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= segments.length) return segments;

  const copy = [...segments];
  const [item] = copy.splice(index, 1);
  copy.splice(targetIndex, 0, item);
  return copy;
}

export function calculateEpisodeDurationSeconds(episode: Episode): number {
  return episode.segments.reduce(
    (sum, seg) => sum + estimateSpeechDurationSeconds(seg.scriptText, seg.estimatedWpm),
    0
  );
}

export function calculateEpisodeTargetSeconds(episode: Episode): number {
  return episode.segments.reduce(
    (sum, seg) =>
      sum +
      (seg.targetDurationSec ??
        estimateSpeechDurationSeconds(seg.scriptText, seg.estimatedWpm)),
    0
  );
}

export function filterSources(
  sources: SourceReference[],
  statusFilter: SourceStatus | 'toutes',
  searchQuery: string
): SourceReference[] {
  const q = searchQuery.trim().toLowerCase();
  return sources.filter((src) => {
    const matchesStatus = statusFilter === 'toutes' || src.status === statusFilter;
    if (!matchesStatus) return false;
    if (!q) return true;
    return (
      src.title.toLowerCase().includes(q) ||
      src.authorOrDirector.toLowerCase().includes(q) ||
      src.keyTakeaway.toLowerCase().includes(q) ||
      src.referenceLocation.toLowerCase().includes(q)
    );
  });
}

export function compileShowNotes(episode: Episode): string {
  let cursorSec = 0;
  const chapters = episode.segments.map((seg, idx) => {
    const stamp = formatTimecode(cursorSec);
    cursorSec += estimateSpeechDurationSeconds(seg.scriptText, seg.estimatedWpm);
    return `${stamp} — ${String(idx + 1).padStart(2, '0')}. ${seg.title}`;
  });

  const verifiedSources = episode.sources.filter((s) => s.status === 'verifiee');
  const otherSources = episode.sources.filter((s) => s.status !== 'verifiee');
  const listedSources = verifiedSources.length > 0 ? verifiedSources : otherSources;

  const sourceLines = listedSources.map(
    (s) => `- ${s.authorOrDirector} (${s.year}), *${s.title}* — ${s.referenceLocation}`
  );

  return [
    `PHILOA2BALLES — Épisode ${episode.number} : ${episode.title}`,
    `Œuvre analysée : ${episode.workTitle} · Thème : ${episode.philosophicalTheme}`,
    '',
    episode.logline,
    '',
    'CHAPITRES',
    ...chapters,
    '',
    'SOURCES & RÉFÉRENCES',
    ...(sourceLines.length > 0 ? sourceLines : ['- Aucune source ajoutée pour le moment.']),
  ].join('\n');
}

export function appendThoughtToSegment(
  episode: Episode,
  segmentId: string,
  rawThought: string,
  clearDraft = true
): Episode {
  const trimmed = rawThought.trim();
  if (!trimmed) return episode;

  const targetId = episode.segments.some((s) => s.id === segmentId)
    ? segmentId
    : episode.segments[0]?.id;
  if (!targetId) return episode;

  const segments = episode.segments.map((seg) => {
    if (seg.id !== targetId) return seg;
    const base = seg.scriptText.trimEnd();
    const nextScript = base.length > 0 ? `${base}\n\n${trimmed}` : trimmed;
    return {
      ...seg,
      scriptText: nextScript,
    };
  });

  return {
    ...episode,
    segments,
    draftThoughts: clearDraft ? '' : episode.draftThoughts,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

export function insertThoughtIntelligently(
  episode: Episode,
  rawThought: string,
  options?: { forcedSegmentId?: string; clearDraft?: boolean }
): { episode: Episode; plan: DraftPlacementPlan | null } {
  const plan = planSmartDraftPlacement(episode, rawThought, options?.forcedSegmentId);
  if (!plan) return { episode, plan: null };

  const clearDraft = options?.clearDraft ?? true;

  const segments = episode.segments.map((seg) => {
    if (seg.id !== plan.targetSegmentId) return seg;

    const oldScript = seg.scriptText;
    const offset = Math.max(0, Math.min(plan.insertOffset, oldScript.length));
    const beforeTrimmed = oldScript.slice(0, offset).trimEnd();
    const afterRaw = oldScript.slice(offset);
    const afterLeadingWsLen = afterRaw.search(/\S/);
    const afterTrimmed = afterLeadingWsLen >= 0 ? afterRaw.slice(afterLeadingWsLen) : '';

    let nextScript = '';
    let insertedPrefixLen = 0;

    if (beforeTrimmed.length === 0) {
      const sepAfter = afterTrimmed.length > 0 ? '\n\n' : '';
      nextScript = `${plan.polishedThought}${sepAfter}${afterTrimmed}`;
      insertedPrefixLen = plan.polishedThought.length + sepAfter.length;
    } else {
      const sepBefore = plan.insertionMode === 'after_sentence' ? ' ' : '\n\n';
      let sepAfter = '';
      if (afterTrimmed.length > 0) {
        if (/^\s*\n\s*\n/.test(afterRaw)) {
          sepAfter = '\n\n';
        } else if (/^\s*\n/.test(afterRaw)) {
          sepAfter = '\n';
        } else {
          sepAfter = ' ';
        }
      }
      const head = `${beforeTrimmed}${sepBefore}${plan.polishedThought}${sepAfter}`;
      nextScript = `${head}${afterTrimmed}`;
      insertedPrefixLen = head.length;
    }

    const afterOriginalStart = afterLeadingWsLen >= 0 ? offset + afterLeadingWsLen : oldScript.length;
    const delta = insertedPrefixLen - afterOriginalStart;

    const updatedComments = seg.comments?.map((c) => {
      const wasExact = oldScript.slice(c.startOffset, c.endOffset) === c.selectedText;
      if (wasExact) {
        if (c.startOffset >= afterOriginalStart) {
          return {
            ...c,
            startOffset: Math.max(0, c.startOffset + delta),
            endOffset: Math.max(0, c.endOffset + delta),
          };
        }
        return c;
      }
      const healedIdx = c.selectedText ? nextScript.indexOf(c.selectedText) : -1;
      if (healedIdx !== -1) {
        return {
          ...c,
          startOffset: healedIdx,
          endOffset: healedIdx + c.selectedText.length,
        };
      }
      return c;
    });

    return {
      ...seg,
      scriptText: nextScript,
      comments: updatedComments,
    };
  });

  return {
    episode: {
      ...episode,
      segments,
      draftThoughts: clearDraft ? '' : episode.draftThoughts,
      updatedAt: new Date().toISOString().slice(0, 10),
    },
    plan,
  };
}

export function filterEpisodesByCategory(
  episodes: Episode[],
  categoryFilter: 'tous' | 'cinema_serie' | 'chanson'
): Episode[] {
  if (categoryFilter === 'tous') return episodes;
  return episodes.filter((ep) => (ep.category ?? 'cinema_serie') === categoryFilter);
}

export interface EpisodeDiagnosticItem {
  id: string;
  kind: 'repetition' | 'placeholder' | 'offset' | 'order' | 'thin_segment' | 'notes' | 'pacing';
  title: string;
  detail: string;
  segmentId?: string;
  canAutoFix: boolean;
}

export interface EpisodeAnalysisReport {
  totalWords: number;
  scriptedDurationSec: number;
  targetDurationSec: number;
  meetsTargetMinutes: boolean;
  meetsWritten30Min: boolean;
  repetitionCount: number;
  brokenOffsetCount: number;
  emptyPlaceholderCount: number;
  unlinkedNoteCount: number;
  orderNeedsTidy: boolean;
  thinSegments: { id: string; index: number; title: string; words: number }[];
  issues: EpisodeDiagnosticItem[];
  isHealthy: boolean;
}

const ROLE_ORDER_PRIORITY: Record<SegmentRole, number> = {
  accroche: 0,
  exemple: 1,
  concept: 2,
  bascule: 3,
  nuance: 4,
  conclusion: 5,
};

function countSpokenWords(scriptText: string): number {
  const cleaned = scriptText.replace(/\[[^\]]*\]/g, ' ').trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

function checkOrderNeedsTidy(segments: NarrativeSegment[]): boolean {
  if (segments.length <= 1) return false;
  const hasAccrocheNotFirst =
    segments.some((s) => s.role === 'accroche') && segments[0]?.role !== 'accroche';
  const hasConclusionNotLast =
    segments.some((s) => s.role === 'conclusion') &&
    segments[segments.length - 1]?.role !== 'conclusion';
  return hasAccrocheNotFirst || hasConclusionNotLast;
}

export function analyzeEpisodeTexts(episode: Episode): EpisodeAnalysisReport {
  const issues: EpisodeDiagnosticItem[] = [];
  let totalWords = 0;
  let brokenOffsetCount = 0;
  let emptyPlaceholderCount = 0;
  const thinSegments: { id: string; index: number; title: string; words: number }[] = [];

  const scriptedDurationSec = calculateEpisodeDurationSeconds(episode);
  const targetDurationSec = calculateEpisodeTargetSeconds(episode);
  const minTargetSec = (episode.targetMinutes ?? 30) * 60;
  const meetsTargetMinutes = targetDurationSec >= minTargetSec;
  const meetsWritten30Min = scriptedDurationSec >= 1800;

  if (!meetsTargetMinutes) {
    issues.push({
      id: 'diag-pacing',
      kind: 'pacing',
      title: 'Durée cible sous les 30 minutes',
      detail: `Le plan actuel totalise ${formatTimecode(targetDurationSec)} sur ${episode.targetMinutes ?? 30}:00 min visées.`,
      canAutoFix: false,
    });
  }

  if (!meetsWritten30Min) {
    issues.push({
      id: 'diag-written-pacing',
      kind: 'pacing',
      title: `Script parlé sous les 30 minutes (${formatTimecode(scriptedDurationSec)})`,
      detail: `Le texte actuellement rédigé dure ${formatTimecode(scriptedDurationSec)} à l’oral (minimum visé : 30:00).`,
      canAutoFix: false,
    });
  }

  const orderNeedsTidy = checkOrderNeedsTidy(episode.segments);
  if (orderNeedsTidy) {
    issues.push({
      id: 'diag-order',
      kind: 'order',
      title: 'Ordre narratif à réaligner',
      detail: 'L’accroche doit ouvrir l’épisode et la conclusion doit le fermer.',
      canAutoFix: true,
    });
  }

  // Per-segment inspection
  episode.segments.forEach((seg, idx) => {
    const segNum = String(idx + 1).padStart(2, '0');
    const words = countSpokenWords(seg.scriptText);
    totalWords += words;

    if (words < 90) {
      thinSegments.push({ id: seg.id, index: idx + 1, title: seg.title, words });
      issues.push({
        id: `diag-thin-${seg.id}`,
        kind: 'thin_segment',
        title: `Segment ${segNum} court (${words} mots)`,
        detail: `« ${seg.title} » mérite plus de matière orale pour tenir son objectif (${formatTimecode(seg.targetDurationSec ?? 180)}).`,
        segmentId: seg.id,
        canAutoFix: false,
      });
    }

    if (/(?:^|\n)\[EXEMPLE CONCRET\]\s*(?:\n|$)/i.test(seg.scriptText)) {
      emptyPlaceholderCount += 1;
      issues.push({
        id: `diag-placeholder-${seg.id}`,
        kind: 'placeholder',
        title: `Balise vide dans le segment ${segNum}`,
        detail: `« [EXEMPLE CONCRET] » apparaît sans récit concret développé juste en dessous.`,
        segmentId: seg.id,
        canAutoFix: false,
      });
    }

    for (const comment of seg.comments ?? []) {
      const slice = seg.scriptText.slice(comment.startOffset, comment.endOffset);
      if (slice !== comment.selectedText) {
        brokenOffsetCount += 1;
        issues.push({
          id: `diag-offset-${comment.id}`,
          kind: 'offset',
          title: `Annotation décalée dans le segment ${segNum}`,
          detail: `L’annotation sur « ${comment.selectedText} » ne pointe plus sur le bon emplacement.`,
          segmentId: seg.id,
          canAutoFix: true,
        });
      }
    }
  });

  // Pairwise repetition check (compare each segment only with EARLIER segments so pairs aren't double-counted)
  let repetitionCount = 0;
  const seenPairs = new Set<string>();
  episode.segments.forEach((seg, idx) => {
    const matches = detectEpisodeRepetitions(episode, seg.id, seg.scriptText);
    for (const m of matches) {
      if (!m.segmentId) continue;
      const otherIdx = episode.segments.findIndex((s) => s.id === m.segmentId);
      if (otherIdx === -1) continue;
      const pairKey = idx < otherIdx ? `${seg.id}:${m.segmentId}` : `${m.segmentId}:${seg.id}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      repetitionCount += 1;
      const aNum = String(Math.min(idx, otherIdx) + 1).padStart(2, '0');
      const bNum = String(Math.max(idx, otherIdx) + 1).padStart(2, '0');
      issues.push({
        id: `diag-rep-${pairKey}`,
        kind: 'repetition',
        title: `Écho repéré entre les segments ${aNum} et ${bNum}`,
        detail: `Idée proche autour de (${m.sharedKeywords.join(', ')}) : « ${m.matchedExcerpt} »`,
        segmentId: otherIdx > idx ? m.segmentId : seg.id,
        canAutoFix: false,
      });
    }
  });

  // Unlinked notes check
  const validSegIds = new Set(episode.segments.map((s) => s.id));
  const unlinkedNotes = episode.notes.filter(
    (n) => !n.segmentId || !validSegIds.has(n.segmentId)
  );
  if (unlinkedNotes.length > 0) {
    issues.push({
      id: 'diag-notes-unlinked',
      kind: 'notes',
      title: `${unlinkedNotes.length} note(s) à rattacher`,
      detail: `Des notes de recherche ne sont pas encore reliées à un segment précis du fil.`,
      canAutoFix: true,
    });
  }

  return {
    totalWords,
    scriptedDurationSec,
    targetDurationSec,
    meetsTargetMinutes,
    meetsWritten30Min,
    repetitionCount,
    brokenOffsetCount,
    emptyPlaceholderCount,
    unlinkedNoteCount: unlinkedNotes.length,
    orderNeedsTidy,
    thinSegments,
    issues,
    isHealthy: issues.length === 0,
  };
}

export function reorganizeEpisodeTexts(episode: Episode): {
  episode: Episode;
  appliedChanges: string[];
} {
  const appliedChanges: string[] = [];

  // 1. Align accroche first & conclusion last if out of order
  let orderedSegments = [...episode.segments];
  if (checkOrderNeedsTidy(orderedSegments)) {
    const accroches = orderedSegments.filter((s) => s.role === 'accroche');
    const conclusions = orderedSegments.filter((s) => s.role === 'conclusion');
    const middle = orderedSegments.filter(
      (s) => s.role !== 'accroche' && s.role !== 'conclusion'
    );
    middle.sort((a, b) => {
      const idxA = episode.segments.findIndex((s) => s.id === a.id);
      const idxB = episode.segments.findIndex((s) => s.id === b.id);
      return idxA - idxB || ROLE_ORDER_PRIORITY[a.role] - ROLE_ORDER_PRIORITY[b.role];
    });
    orderedSegments = [...accroches, ...middle, ...conclusions];
    appliedChanges.push('Segments réordonnés selon l’arc narratif (Accroche → Développement → Conclusion)');
  }

  // 2. Polish orthography/punctuation cleanly & heal WordComment offsets
  let healedOffsets = 0;
  let polishedSegmentsCount = 0;
  const tidiedSegments = orderedSegments.map((seg) => {
    const normalizedText = seg.scriptText.replace(/\n{3,}/g, '\n\n').trim();
    const polishRes = polishFrenchThought(normalizedText);
    const nextScript = polishRes.polished;
    if (nextScript !== seg.scriptText) {
      polishedSegmentsCount += 1;
    }

    const updatedComments = seg.comments?.map((comment) => {
      const currentSlice = nextScript.slice(comment.startOffset, comment.endOffset);
      if (currentSlice === comment.selectedText) return comment;
      const foundIdx = comment.selectedText ? nextScript.indexOf(comment.selectedText) : -1;
      if (foundIdx !== -1) {
        healedOffsets += 1;
        return {
          ...comment,
          startOffset: foundIdx,
          endOffset: foundIdx + comment.selectedText.length,
        };
      }
      return comment;
    });

    return {
      ...seg,
      scriptText: nextScript,
      comments: updatedComments,
    };
  });

  if (polishedSegmentsCount > 0) {
    appliedChanges.push(
      `Mise en forme et orthographe vérifiées sur ${polishedSegmentsCount} segment(s)`
    );
  }
  if (healedOffsets > 0) {
    appliedChanges.push(`${healedOffsets} annotation(s) de mots recalée(s) avec exactitude`);
  }

  // 3. Link unattached notes to the best-matching segment
  const validSegIds = new Set(tidiedSegments.map((s) => s.id));
  const candidateEpisode: Episode = { ...episode, segments: tidiedSegments };
  let linkedNotesCount = 0;
  const updatedNotes: ResearchNote[] = episode.notes.map((note) => {
    if (note.segmentId && validSegIds.has(note.segmentId)) return note;
    const plan = planSmartDraftPlacement(candidateEpisode, `${note.title}. ${note.content}`);
    if (plan) {
      linkedNotesCount += 1;
      return { ...note, segmentId: plan.targetSegmentId };
    }
    return note;
  });

  if (linkedNotesCount > 0) {
    appliedChanges.push(`${linkedNotesCount} note(s) de recherche rattachée(s) au bon segment`);
  }

  return {
    episode: {
      ...episode,
      segments: tidiedSegments,
      notes: updatedNotes,
      updatedAt: new Date().toISOString().slice(0, 10),
    },
    appliedChanges,
  };
}

