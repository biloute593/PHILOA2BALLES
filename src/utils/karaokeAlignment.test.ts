import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChunkKaraokeTimings,
  resolveActiveKaraokeWord,
  resolveKaraokeWordAtCharIndex,
  sliceTextForKaraoke,
} from './karaokeAlignment';

test('buildChunkKaraokeTimings produces monotonic [0, 1] ratios with punctuation breathing weight', () => {
  const text = 'Pourquoi ? Parce que ton ennemi te pousse.';
  const timings = buildChunkKaraokeTimings(text);
  assert.equal(timings.length, 8);
  assert.equal(timings[0].startRatio, 0);
  assert.equal(timings[timings.length - 1].endRatio, 1);

  for (let i = 0; i < timings.length; i++) {
    assert.ok(timings[i].endRatio > timings[i].startRatio);
    if (i > 0) {
      assert.equal(timings[i].startRatio, timings[i - 1].endRatio);
    }
  }
});

test('resolveActiveKaraokeWord and resolveKaraokeWordAtCharIndex track progression accurately', () => {
  const text = 'Regarde ce miroir silencieux.';
  const timings = buildChunkKaraokeTimings(text);

  const first = resolveActiveKaraokeWord(timings, 0.01);
  assert.equal(first?.word, 'Regarde');

  const last = resolveActiveKaraokeWord(timings, 0.99);
  assert.equal(last?.word, 'silencieux.');

  const atChar = resolveKaraokeWordAtCharIndex(timings, text.indexOf('miroir'));
  assert.equal(atChar?.word, 'miroir');
});

test('sliceTextForKaraoke partitions spoken, active word, and upcoming slices losslessly', () => {
  const text = 'Penser contre soi est courageux.';
  const timings = buildChunkKaraokeTimings(text);
  const active = timings.find((t) => t.word === 'contre');
  assert.ok(active);

  const slices = sliceTextForKaraoke(text, 0, {
    wordIndex: active.index,
    charStart: active.charStart,
    charEnd: active.charEnd,
    word: active.word,
  });

  assert.equal(slices.map((s) => s.text).join(''), text);
  assert.deepEqual(
    slices.map((s) => s.kind),
    ['spoken', 'active', 'upcoming']
  );
  assert.equal(slices[1].text, 'contre');
});
