import { SOUND_EXTRACTS } from '../data/seedData';
import type { Episode, SegmentRole } from '../types/podcast';

export type PrecepteurPace = 'pose' | 'precepteur' | 'fluide';

export type PrecepteurVoiceEngineMode = 'auto' | 'browser';

export interface NarrationChunk {
  id: string;
  kind: 'speech' | 'pause' | 'sound_cue';
  segmentId: string;
  segmentIndex: number;
  segmentTitle: string;
  role: SegmentRole;
  /** Original visible excerpt for highlighting in the teleprompter */
  text: string;
  /** Prosody-shaped text for Gemini TTS (with subtle breathing cues) */
  ttsPromptText: string;
  /** Clean readable text for Web Speech API fallback */
  browserSpeechText: string;
  pauseMs: number;
  soundCueId?: string;
  wordCount: number;
  /** Inclusive start character offset inside NarrativeSegment.scriptText */
  scriptStartOffset?: number;
  /** Exclusive end character offset inside NarrativeSegment.scriptText */
  scriptEndOffset?: number;
}

export interface BuildNarrationQueueOptions {
  startSegmentId?: string;
  includeSoundCues?: boolean;
  withSoutenances?: boolean;
}

export const PRECEPTEUR_PACE_CONFIG: Record<
  PrecepteurPace,
  { label: string; rate: number; pauseScale: number; description: string }
> = {
  pose: {
    label: '0.85× Très posé',
    rate: 0.85,
    pauseScale: 1.25,
    description: 'Cadence méditative avec longues respirations pour vérifier chaque nuance.',
  },
  precepteur: {
    label: '0.95× Le Précepteur',
    rate: 0.95,
    pauseScale: 1.0,
    description: 'Rythme signature calme, appuis rhétoriques et soutenances naturelles.',
  },
  fluide: {
    label: '1.05× Fluide',
    rate: 1.05,
    pauseScale: 0.85,
    description: 'Écoute plus vive pour relire rapidement l’enchaînement complet.',
  },
};

const TAG_SPLIT_REGEX = /(\[(?:EXTRAIT SONORE\s*:\s*[^\]]+|PAUSE\s+\d+(?:[.,]\d+)?s?)\])/gi;
const EXTRAIT_REGEX = /^\[EXTRAIT SONORE\s*:\s*([^\]]+)\]$/i;
const PAUSE_REGEX = /^\[PAUSE\s+(\d+(?:[.,]\d+)?)s?\]$/i;

function resolveSoundCueId(label: string, fallbackCueId?: string): string | undefined {
  const norm = label.trim().toLowerCase();
  const matched = SOUND_EXTRACTS.find(
    (cue) =>
      cue.title.toLowerCase() === norm ||
      cue.title.toLowerCase().includes(norm) ||
      norm.includes(cue.title.toLowerCase())
  );
  if (matched) return matched.id;
  if (norm.includes('réveil') || norm.includes('reveil') || norm.includes('routine')) {
    return 'cue_reveil_routine';
  }
  if (norm.includes('déclic') || norm.includes('declic') || norm.includes('lunettes')) {
    return 'cue_declic_lunettes';
  }
  if (norm.includes('café') || norm.includes('cafe') || norm.includes('brouhaha')) {
    return 'cue_cafe_social';
  }
  if (norm.includes('glitch') || norm.includes('rupture')) {
    return 'cue_glitch_matrice';
  }
  if (norm.includes('nappe') || norm.includes('contemplative')) {
    return 'cue_nappe_precepteur';
  }
  if (norm.includes('cloche') || norm.includes('finale') || norm.includes('conclusion')) {
    return 'cue_cloche_conclusion';
  }
  return fallbackCueId;
}

/**
 * Shapes raw teleprompter prose into natural Le Précepteur oral cadence:
 * preserves exact wording while inserting soft breathing points and rhetorical pauses
 * on pivots ("Pourquoi ?", "Mais attention", em-dashes, contrasts).
 */
export function formatTextForPrecepteurVoice(
  rawText: string,
  withSoutenances: boolean
): { geminiText: string; browserText: string } {
  const cleaned = rawText
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.…])/g, '$1')
    .trim();

  if (!cleaned) {
    return { geminiText: '', browserText: '' };
  }

  if (!withSoutenances) {
    return { geminiText: cleaned, browserText: cleaned };
  }

  // Browser SpeechSynthesis responds best to clean ellipses and comma pauses
  const browserText = cleaned
    .replace(/\s—\s/g, ' — ... ')
    .replace(/\b(Pourquoi\s*\?|Mais attention\s*:|Et pourtant\s*,|Regarde bien\s*:|Pose-toi cette question\s*:)/gi, '$1 ...')
    .replace(/:\s+/g, ' : ... ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Gemini TTS responds expressively to natural ellipses, commas, and subtle breath markers
  const geminiText = cleaned
    .replace(/\s—\s/g, ', ... ')
    .replace(/:\s+/g, ' : ... ')
    .replace(/([?!])\s+(?=[A-ZÀÂÉÈÊËÎÏÔÖÙÛÜÇ])/g, '$1 <breath> ')
    .replace(/\b(Mais attention|Et pourtant|Pourtant|En vérité|Or regarde|Souviens-toi)\b/g, '... $1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { geminiText, browserText };
}

/**
 * Splits a continuous speech block into balanced chunks (~180–340 chars) at sentence
 * and clause boundaries so both Gemini TTS prefetching and browser SpeechSynthesis
 * play smoothly without pauses, cutoffs, or awkward mid-clause splits.
 */
function splitSpeechBlockIntoChunks(text: string, maxChars = 320): string[] {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  const pushBalanced = (segment: string) => {
    if (segment.length <= maxChars) {
      chunks.push(segment);
      return;
    }
    const clauses = segment.match(/[^;:—]+(?:[;:—]+\s*|$)/g) ?? [segment];
    let buf = '';
    for (const rawClause of clauses) {
      const clause = rawClause.trim();
      if (!clause) continue;
      if (!buf) {
        buf = clause;
      } else if (buf.length + 1 + clause.length <= maxChars) {
        buf = `${buf} ${clause}`;
      } else {
        chunks.push(buf);
        buf = clause;
      }
    }
    if (buf) {
      if (buf.length <= maxChars) {
        chunks.push(buf);
      } else {
        // Fallback split on comma if a single clause is still very long
        const subParts = buf.split(/,\s+/);
        let acc = '';
        for (const sp of subParts) {
          const piece = acc ? `${acc}, ${sp}` : sp;
          if (piece.length <= maxChars) {
            acc = piece;
          } else {
            if (acc) chunks.push(`${acc},`);
            acc = sp;
          }
        }
        if (acc) chunks.push(acc);
      }
    }
  };

  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      chunks.push(para);
      continue;
    }

    // Split on sentence endings while keeping punctuation attached
    const sentences = para.match(/[^.!?…]+(?:[.!?…]+["»)]*|\s*$)/g) ?? [para];
    let current = '';

    for (const rawSentence of sentences) {
      const sentence = rawSentence.trim();
      if (!sentence) continue;

      if (!current) {
        if (sentence.length > maxChars) {
          pushBalanced(sentence);
        } else {
          current = sentence;
        }
      } else if (current.length + 1 + sentence.length <= maxChars) {
        current = `${current} ${sentence}`;
      } else {
        pushBalanced(current);
        if (sentence.length > maxChars) {
          pushBalanced(sentence);
          current = '';
        } else {
          current = sentence;
        }
      }
    }
    if (current) {
      pushBalanced(current);
    }
  }

  return chunks;
}

function escapeRegexLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findChunkSpanInScript(
  scriptText: string,
  chunkText: string,
  fromOffset = 0
): { start: number; end: number } | null {
  if (!scriptText || !chunkText) return null;
  const startSearch = Math.max(0, fromOffset);
  const exactIdx = scriptText.indexOf(chunkText, startSearch);
  if (exactIdx !== -1) {
    return { start: exactIdx, end: exactIdx + chunkText.length };
  }

  const tokens = chunkText.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const tail = scriptText.slice(startSearch);
  try {
    const pattern = tokens.map(escapeRegexLiteral).join('\\s+');
    const flexRegex = new RegExp(pattern);
    const match = flexRegex.exec(tail);
    if (match) {
      const start = startSearch + match.index;
      return { start, end: start + match[0].length };
    }
  } catch {
    // Fallback below
  }

  const firstIdx = scriptText.indexOf(tokens[0], startSearch);
  if (firstIdx !== -1) {
    const lastToken = tokens[tokens.length - 1];
    const lastIdx = scriptText.indexOf(lastToken, firstIdx);
    const approxEnd =
      lastIdx !== -1 && lastIdx - firstIdx <= chunkText.length + 80
        ? lastIdx + lastToken.length
        : Math.min(scriptText.length, firstIdx + chunkText.length);
    return { start: firstIdx, end: approxEnd };
  }

  return null;
}

export function buildEpisodeNarrationQueue(
  episode: Episode,
  options: BuildNarrationQueueOptions = {}
): NarrationChunk[] {
  const {
    startSegmentId,
    includeSoundCues = true,
    withSoutenances = true,
  } = options;

  const startIdx = startSegmentId
    ? Math.max(
        0,
        episode.segments.findIndex((s) => s.id === startSegmentId)
      )
    : 0;

  const selectedSegments = episode.segments.slice(startIdx);
  const queue: NarrationChunk[] = [];
  let seq = 0;

  selectedSegments.forEach((seg, localIdx) => {
    const segIdx = startIdx + localIdx;
    let scriptCursor = 0;

    if (localIdx > 0) {
      queue.push({
        id: `chunk-${seg.id}-${seq++}`,
        kind: 'pause',
        segmentId: seg.id,
        segmentIndex: segIdx,
        segmentTitle: seg.title,
        role: seg.role,
        text: `Transition — ${seg.title}`,
        ttsPromptText: '',
        browserSpeechText: '',
        pauseMs: 850,
        wordCount: 0,
      });
    }

    const parts = seg.scriptText.split(TAG_SPLIT_REGEX);

    for (const rawPart of parts) {
      const part = rawPart.trim();
      if (!part) continue;

      const partIdx = seg.scriptText.indexOf(part, scriptCursor);
      if (partIdx !== -1) {
        scriptCursor = partIdx;
      }

      const extraitMatch = part.match(EXTRAIT_REGEX);
      if (extraitMatch) {
        if (partIdx !== -1) {
          scriptCursor = partIdx + part.length;
        }
        if (includeSoundCues) {
          const cueId = resolveSoundCueId(extraitMatch[1], seg.soundCueId);
          queue.push({
            id: `chunk-${seg.id}-${seq++}`,
            kind: 'sound_cue',
            segmentId: seg.id,
            segmentIndex: segIdx,
            segmentTitle: seg.title,
            role: seg.role,
            text: part,
            ttsPromptText: '',
            browserSpeechText: '',
            pauseMs: 2600,
            soundCueId: cueId,
            wordCount: 0,
          });
        }
        continue;
      }

      const pauseMatch = part.match(PAUSE_REGEX);
      if (pauseMatch) {
        if (partIdx !== -1) {
          scriptCursor = partIdx + part.length;
        }
        const sec = Number.parseFloat(pauseMatch[1].replace(',', '.'));
        const pauseMs = Number.isFinite(sec) ? Math.min(6000, Math.max(600, Math.round(sec * 1000))) : 2000;
        queue.push({
          id: `chunk-${seg.id}-${seq++}`,
          kind: 'pause',
          segmentId: seg.id,
          segmentIndex: segIdx,
          segmentTitle: seg.title,
          role: seg.role,
          text: part,
          ttsPromptText: '',
          browserSpeechText: '',
          pauseMs,
          wordCount: 0,
        });
        continue;
      }

      const speechSubChunks = splitSpeechBlockIntoChunks(part);
      for (const sub of speechSubChunks) {
        const { geminiText, browserText } = formatTextForPrecepteurVoice(sub, withSoutenances);
        if (!browserText) continue;
        const wordCount = sub.split(/\s+/).filter(Boolean).length;
        const span = findChunkSpanInScript(seg.scriptText, sub, scriptCursor);
        if (span) {
          scriptCursor = span.end;
        }

        queue.push({
          id: `chunk-${seg.id}-${seq++}`,
          kind: 'speech',
          segmentId: seg.id,
          segmentIndex: segIdx,
          segmentTitle: seg.title,
          role: seg.role,
          text: sub,
          ttsPromptText: geminiText,
          browserSpeechText: browserText,
          pauseMs: 0,
          wordCount,
          scriptStartOffset: span?.start,
          scriptEndOffset: span?.end,
        });
      }
    }
  });

  return queue;
}

export function buildPrecepteurSpeechStyle(
  role: SegmentRole,
  pace: PrecepteurPace,
  withSoutenances: boolean
): string {
  const paceDirective =
    pace === 'pose'
      ? 'very unhurried, meditative tempo with long reflective rests'
      : pace === 'fluide'
        ? 'natural conversational podcast tempo, clear and warm'
        : 'calm, measured French philosophical storytelling cadence like Le Précepteur';

  const soutenanceDirective = withSoutenances
    ? 'Use expressive vocal weight on key contrasts, gentle rhetorical pauses before crucial questions, and warm rhythmic echoes on repeated ideas without rushing.'
    : 'Read smoothly and clearly with neutral conversational pauses.';

  const roleColor: Record<SegmentRole, string> = {
    accroche: 'Intimate and intriguing opening tone that gently pulls the listener in.',
    exemple: 'Vivid, narrative storytelling tone as if painting a scene over coffee.',
    concept: 'Deep, pedagogical, thoughtful tone explaining philosophy with clarity and warmth.',
    bascule: 'Grave, revelatory pivot tone highlighting an unexpected truth.',
    nuance: 'Balanced, lucid, measured tone weighing shades of gray carefully.',
    conclusion: 'Warm, resonant closing tone leaving space for quiet reflection.',
  };

  return `Warm, deep, intimate French male podcast narrator ("Le Précepteur" style): soft velvet timbre, zero harsh sibilance, ${paceDirective}. ${soutenanceDirective} ${roleColor[role]}`;
}

export interface MinimalSpeechVoice {
  lang: string;
  name: string;
  localService?: boolean;
}

export function selectBestFrenchVoice<T extends MinimalSpeechVoice>(voices: T[]): T | null {
  if (!voices || voices.length === 0) return null;

  const frenchVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('fr'));
  if (frenchVoices.length === 0) return null;

  const preferredKeywords = [
    'thomas',
    'henri',
    'paul',
    'daniel',
    'remi',
    'rémi',
    'nicolas',
    'alain',
    'antoine',
    'denis',
    'google français',
    'microsoft henri',
    'microsoft paul',
    'natural',
    'enhanced',
    'premium',
  ];

  let bestVoice = frenchVoices[0];
  let bestScore = -1;

  for (const voice of frenchVoices) {
    const nameLower = voice.name.toLowerCase();
    const langLower = voice.lang.toLowerCase();
    let score = 0;

    if (langLower === 'fr-fr' || langLower === 'fr_fr') score += 20;
    else score += 10;

    for (let i = 0; i < preferredKeywords.length; i++) {
      if (nameLower.includes(preferredKeywords[i])) {
        score += 40 - i;
      }
    }

    if (nameLower.includes('online') || nameLower.includes('neural')) {
      score += 15;
    }
    if (nameLower.includes('compact') || nameLower.includes('espeak')) {
      score -= 15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestVoice = voice;
    }
  }

  return bestVoice;
}
