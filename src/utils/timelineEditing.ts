import type { TimelineClip } from '../types/podcast';

export function normalizeCopyLabel(label: string): string {
  const cleaned = label.replace(/(?:\s*\(copie(?:\s+\d+)?\))+$/i, '').trim();
  return `${cleaned || 'Bande audio'} (copie)`;
}

export interface SplitClipResult {
  ok: boolean;
  clips: TimelineClip[];
  newClipId?: string;
  message: string;
}

export function splitClipAtTime(
  clips: TimelineClip[],
  clipId: string,
  splitTimeSec: number,
  newClipId = `clip-${Date.now()}`
): SplitClipResult {
  const target = clips.find((c) => c.id === clipId);
  if (!target) {
    return {
      ok: false,
      clips,
      message: 'Sélectionnez une bande audio à scinder.',
    };
  }

  const clipLen = target.trimEndSec - target.trimStartSec;
  const splitRel = splitTimeSec - target.startOnTimelineSec;
  if (splitRel <= 0.15 || splitRel >= clipLen - 0.15) {
    return {
      ok: false,
      clips,
      message:
        'Placez le curseur rouge à l’intérieur de la bande sélectionnée pour la scinder.',
    };
  }

  const splitSourceTime = Number((target.trimStartSec + splitRel).toFixed(2));
  const firstPart: TimelineClip = {
    ...target,
    trimEndSec: splitSourceTime,
  };
  const secondPart: TimelineClip = {
    ...target,
    id: newClipId,
    label: target.label.endsWith(' (suite)') ? target.label : `${target.label} (suite)`,
    startOnTimelineSec: Number(splitTimeSec.toFixed(2)),
    trimStartSec: splitSourceTime,
  };

  return {
    ok: true,
    clips: clips.flatMap((c) => (c.id === clipId ? [firstPart, secondPart] : [c])),
    newClipId: secondPart.id,
    message: `Bande « ${target.label} » scindée à ${splitTimeSec.toFixed(1)}s.`,
  };
}

export function createClipClipboardCopy(clip: TimelineClip): TimelineClip {
  return { ...clip };
}

export interface CutClipResult {
  ok: boolean;
  nextClips: TimelineClip[];
  clipboardClip: TimelineClip | null;
  nextSelectedId: string;
  message: string;
}

export function cutClipFromTimeline(
  clips: TimelineClip[],
  clipId: string
): CutClipResult {
  const target = clips.find((c) => c.id === clipId);
  if (!target) {
    return {
      ok: false,
      nextClips: clips,
      clipboardClip: null,
      nextSelectedId: clips[0]?.id ?? '',
      message: 'Sélectionnez une bande audio à couper.',
    };
  }

  const nextClips = clips.filter((c) => c.id !== clipId);
  return {
    ok: true,
    nextClips,
    clipboardClip: createClipClipboardCopy(target),
    nextSelectedId: nextClips[0]?.id ?? '',
    message: `Bande « ${target.label} » coupée — placez le curseur et cliquez sur Coller.`,
  };
}

export interface PasteClipResult {
  ok: boolean;
  nextClips: TimelineClip[];
  pastedClip: TimelineClip | null;
  message: string;
}

export function pasteClipAtPlayhead(
  clips: TimelineClip[],
  clipboardClip: TimelineClip | null,
  playheadSec: number,
  newClipId = `clip-paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
): PasteClipResult {
  if (!clipboardClip) {
    return {
      ok: false,
      nextClips: clips,
      pastedClip: null,
      message: 'Copiez ou coupez d’abord une bande audio.',
    };
  }

  const startOnTimelineSec = Math.max(0, Number(playheadSec.toFixed(2)));
  const pastedClip: TimelineClip = {
    ...clipboardClip,
    id: newClipId,
    label: normalizeCopyLabel(clipboardClip.label),
    startOnTimelineSec,
  };

  return {
    ok: true,
    nextClips: [...clips, pastedClip],
    pastedClip,
    message: `Bande collée à ${startOnTimelineSec.toFixed(1)}s.`,
  };
}

export function moveClipStartTime(
  clips: TimelineClip[],
  clipId: string,
  nextStartSec: number
): TimelineClip[] {
  const clamped = Math.round(Math.max(0, nextStartSec) * 20) / 20;
  return clips.map((c) =>
    c.id === clipId ? { ...c, startOnTimelineSec: Number(clamped.toFixed(2)) } : c
  );
}
