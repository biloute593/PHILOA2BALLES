import test from 'node:test';
import assert from 'node:assert/strict';
import { createWordComment, splitTextWithAnnotations } from './wordAnnotations';

test('splitTextWithAnnotations highlights selected words and falls back cleanly after light edits', () => {
  const text = 'Dans Free Guy, il met sa chemise bleue chaque matin.';
  const c1 = createWordComment({
    segmentId: 'seg-1',
    selectedText: 'chemise bleue',
    startOffset: 25,
    endOffset: 38,
    comment: 'Insister sur le mot « bleue » avec le sourire',
    cueKind: 'intonation',
  });

  const runs = splitTextWithAnnotations(text, [c1]);
  assert.equal(runs.length, 3);
  assert.equal(runs[1].text, 'chemise bleue');
  assert.equal(runs[1].comment?.comment, 'Insister sur le mot « bleue » avec le sourire');

  // Lightly edited prefix shifts offset, fallback still finds exact phrase
  const editedText = 'Dans le film Free Guy, il met sa chemise bleue chaque matin.';
  const fallbackRuns = splitTextWithAnnotations(editedText, [c1]);
  assert.equal(fallbackRuns.some((r) => r.text === 'chemise bleue' && r.comment?.id === c1.id), true);
});
