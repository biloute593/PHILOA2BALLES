export interface KaraokeWordTiming {
  index: number;
  word: string;
  charStart: number;
  charEnd: number;
  startRatio: number;
  endRatio: number;
}

export interface KaraokeActiveMatch {
  wordIndex: number;
  charStart: number;
  charEnd: number;
  word: string;
}

/**
 * Tokenizes a spoken chunk into words with natural speaking-weight ratios
 * (accounting for word length + punctuation pauses) so word-by-word karaoke
 * tracks steady audio playback accurately without drifting.
 */
export function buildChunkKaraokeTimings(text: string): KaraokeWordTiming[] {
  if (!text) return [];

  const matches: { word: string; charStart: number; charEnd: number; weight: number }[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const token = match[0];
    const cleanAlphaLen = token.replace(/[.,;:!?…—–«»"()[\]]/g, '').length;
    let weight = Math.max(1.2, cleanAlphaLen * 0.9 + 1.1);

    if (/[.!?…]$/.test(token)) {
      weight += 3.6;
    } else if (/[,;:—]$/.test(token)) {
      weight += 1.9;
    }

    matches.push({
      word: token,
      charStart: match.index,
      charEnd: match.index + token.length,
      weight,
    });
  }

  if (matches.length === 0) return [];

  const totalWeight = matches.reduce((sum, item) => sum + item.weight, 0);
  let cursor = 0;

  return matches.map((item, idx) => {
    const startRatio = cursor / totalWeight;
    cursor += item.weight;
    const endRatio = idx === matches.length - 1 ? 1 : cursor / totalWeight;
    return {
      index: idx,
      word: item.word,
      charStart: item.charStart,
      charEnd: item.charEnd,
      startRatio,
      endRatio,
    };
  });
}

/**
 * Resolves the active spoken word for a playback ratio in [0, 1].
 */
export function resolveActiveKaraokeWord(
  timings: readonly KaraokeWordTiming[],
  progress01: number
): KaraokeActiveMatch | null {
  if (timings.length === 0) return null;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress01) ? progress01 : 0));

  for (let i = 0; i < timings.length; i++) {
    const item = timings[i];
    if (clamped <= item.endRatio || i === timings.length - 1) {
      return {
        wordIndex: item.index,
        charStart: item.charStart,
        charEnd: item.charEnd,
        word: item.word,
      };
    }
  }

  const last = timings[timings.length - 1];
  return {
    wordIndex: last.index,
    charStart: last.charStart,
    charEnd: last.charEnd,
    word: last.word,
  };
}

/**
 * Maps a character index from SpeechSynthesis `onboundary` onto the nearest
 * word in the karaoke timing array.
 */
export function resolveKaraokeWordAtCharIndex(
  timings: readonly KaraokeWordTiming[],
  charIndex: number
): KaraokeActiveMatch | null {
  if (timings.length === 0) return null;
  const clampedIdx = Math.max(0, charIndex);

  for (let i = 0; i < timings.length; i++) {
    const item = timings[i];
    if (clampedIdx <= item.charEnd) {
      return {
        wordIndex: item.index,
        charStart: item.charStart,
        charEnd: item.charEnd,
        word: item.word,
      };
    }
  }

  const last = timings[timings.length - 1];
  return {
    wordIndex: last.index,
    charStart: last.charStart,
    charEnd: last.charEnd,
    word: last.word,
  };
}

export interface KaraokeTextSlice {
  kind: 'spoken' | 'active' | 'upcoming';
  text: string;
}

/**
 * Splits a run of text (spanning [runStartInChunk, runEndInChunk)) into
 * spoken / active-word / upcoming slices for karaoke rendering.
 */
export function sliceTextForKaraoke(
  runText: string,
  runStartInChunk: number,
  activeWord: KaraokeActiveMatch | null
): KaraokeTextSlice[] {
  if (!runText) return [];
  if (!activeWord) {
    return [{ kind: 'upcoming', text: runText }];
  }

  const runEnd = runStartInChunk + runText.length;

  // Entire run already finished before active word
  if (runEnd <= activeWord.charStart) {
    return [{ kind: 'spoken', text: runText }];
  }

  // Entire run starts after active word
  if (runStartInChunk >= activeWord.charEnd) {
    return [{ kind: 'upcoming', text: runText }];
  }

  // Overlap with active word
  const localActiveStart = Math.max(0, activeWord.charStart - runStartInChunk);
  const localActiveEnd = Math.min(runText.length, activeWord.charEnd - runStartInChunk);
  const slices: KaraokeTextSlice[] = [];

  if (localActiveStart > 0) {
    slices.push({
      kind: 'spoken',
      text: runText.slice(0, localActiveStart),
    });
  }
  if (localActiveEnd > localActiveStart) {
    slices.push({
      kind: 'active',
      text: runText.slice(localActiveStart, localActiveEnd),
    });
  }
  if (localActiveEnd < runText.length) {
    slices.push({
      kind: 'upcoming',
      text: runText.slice(localActiveEnd),
    });
  }

  return slices;
}
