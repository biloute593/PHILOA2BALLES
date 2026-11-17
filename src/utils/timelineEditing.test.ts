import test from 'node:test';
import assert from 'node:assert/strict';
import type { TimelineClip } from '../types/podcast';
import {
  createClipClipboardCopy,
  cutClipFromTimeline,
  moveClipStartTime,
  normalizeCopyLabel,
  pasteClipAtPlayhead,
  splitClipAtTime,
} from './timelineEditing';

const sampleClip: TimelineClip = {
  id: 'clip-1',
  label: 'Voix — Accroche',
  track: 'voix',
  sourceType: 'take',
  audioKey: 'demo_voice_take',
  startOnTimelineSec: 2,
  trimStartSec: 0,
  trimEndSec: 8,
  sourceDurationSec: 8,
  volume: 1,
  fadeInSec: 0.08,
  fadeOutSec: 0.12,
  segmentId: 'seg-1',
};

test('splitClipAtTime splits a clip inside its bounds into two contiguous pieces', () => {
  const res = splitClipAtTime([sampleClip], 'clip-1', 5.5, 'clip-2');
  assert.equal(res.ok, true);
  assert.equal(res.clips.length, 2);
  assert.equal(res.clips[0].trimStartSec, 0);
  assert.equal(res.clips[0].trimEndSec, 3.5);
  assert.equal(res.clips[1].id, 'clip-2');
  assert.equal(res.clips[1].startOnTimelineSec, 5.5);
  assert.equal(res.clips[1].trimStartSec, 3.5);
  assert.equal(res.clips[1].trimEndSec, 8);
});

test('splitClipAtTime refuses cursor outside clip bounds', () => {
  const res = splitClipAtTime([sampleClip], 'clip-1', 0.5, 'clip-2');
  assert.equal(res.ok, false);
  assert.equal(res.clips.length, 1);
});

test('cutClipFromTimeline removes original and places snapshot in clipboard', () => {
  const res = cutClipFromTimeline([sampleClip], 'clip-1');
  assert.equal(res.ok, true);
  assert.equal(res.nextClips.length, 0);
  assert.ok(res.clipboardClip);
  assert.equal(res.clipboardClip.audioKey, 'demo_voice_take');
});

test('pasteClipAtPlayhead clones clip at cursor without stacking (copie) labels', () => {
  const copied = createClipClipboardCopy({ ...sampleClip, label: 'Voix — Accroche (copie)' });
  const pasted = pasteClipAtPlayhead([sampleClip], copied, 12.25, 'clip-pasted');
  assert.equal(pasted.ok, true);
  assert.equal(pasted.nextClips.length, 2);
  assert.equal(pasted.pastedClip?.id, 'clip-pasted');
  assert.equal(pasted.pastedClip?.startOnTimelineSec, 12.25);
  assert.equal(pasted.pastedClip?.label, 'Voix — Accroche (copie)');
  assert.equal(normalizeCopyLabel('Intro (copie) (copie)'), 'Intro (copie)');
});

test('moveClipStartTime clamps negative values to 0 and snaps to 0.05s increments', () => {
  const movedNeg = moveClipStartTime([sampleClip], 'clip-1', -3.4);
  assert.equal(movedNeg[0].startOnTimelineSec, 0);

  const movedValid = moveClipStartTime([sampleClip], 'clip-1', 7.37);
  assert.equal(movedValid[0].startOnTimelineSec, 7.35);
});
