import type { CueKind, WordComment } from '../types/podcast';

export interface TextRun {
  text: string;
  comment?: WordComment;
}

export function createWordComment(params: {
  segmentId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  comment: string;
  cueKind: CueKind;
}): WordComment {
  return {
    id: `wcom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    segmentId: params.segmentId,
    selectedText: params.selectedText.trim(),
    startOffset: Math.max(0, params.startOffset),
    endOffset: Math.max(params.startOffset, params.endOffset),
    comment: params.comment.trim(),
    cueKind: params.cueKind,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Splits segment text into ordered plain and annotated runs using stored character offsets.
 * Falls back to matching selectedText if text was lightly edited and offsets shifted.
 */
export function splitTextWithAnnotations(
  text: string,
  comments: WordComment[]
): TextRun[] {
  if (!text) return [];
  if (!comments || comments.length === 0) return [{ text }];

  const resolved = comments
    .map((c) => {
      const sliceMatches = text.slice(c.startOffset, c.endOffset) === c.selectedText;
      if (sliceMatches && c.endOffset > c.startOffset) {
        return { start: c.startOffset, end: c.endOffset, comment: c };
      }
      const fallbackIdx = c.selectedText ? text.indexOf(c.selectedText) : -1;
      if (fallbackIdx !== -1) {
        return {
          start: fallbackIdx,
          end: fallbackIdx + c.selectedText.length,
          comment: c,
        };
      }
      return null;
    })
    .filter((item): item is { start: number; end: number; comment: WordComment } => item !== null)
    .sort((a, b) => a.start - b.start);

  const runs: TextRun[] = [];
  let cursor = 0;

  for (const span of resolved) {
    if (span.start < cursor) {
      // Skip overlapping annotation cleanly
      continue;
    }
    if (span.start > cursor) {
      runs.push({ text: text.slice(cursor, span.start) });
    }
    runs.push({
      text: text.slice(span.start, span.end),
      comment: span.comment,
    });
    cursor = span.end;
  }

  if (cursor < text.length) {
    runs.push({ text: text.slice(cursor) });
  }

  return runs;
}
