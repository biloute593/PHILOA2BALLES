import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEpisodeNarrationQueue,
  buildPrecepteurSpeechStyle,
  formatTextForPrecepteurVoice,
  selectBestFrenchVoice,
} from './precepteurNarration';
import { INITIAL_EPISODES } from '../data/seedData';

test('formatTextForPrecepteurVoice preserves meaning while adding natural soutenances and breaths', () => {
  const input = 'Pourquoi ? Regarde bien : la morale change — mais attention : écoute.';
  const withSoutenances = formatTextForPrecepteurVoice(input, true);
  assert.ok(withSoutenances.geminiText.includes('<breath>'));
  assert.ok(withSoutenances.geminiText.includes('...'));
  assert.ok(withSoutenances.browserText.includes('...'));
  assert.ok(withSoutenances.browserText.includes('la morale change'));

  const plain = formatTextForPrecepteurVoice(input, false);
  assert.equal(plain.geminiText, input);
  assert.equal(plain.browserText, input);
});

test('buildEpisodeNarrationQueue splits script into speech, pause, and sound_cue chunks cleanly', () => {
  const ep = INITIAL_EPISODES[0];
  const queue = buildEpisodeNarrationQueue(ep, {
    includeSoundCues: true,
    withSoutenances: true,
  });

  assert.ok(queue.length > 20, `Expected >20 chunks, got ${queue.length}`);
  assert.ok(queue.some((c) => c.kind === 'speech'));
  assert.ok(queue.some((c) => c.kind === 'sound_cue' && Boolean(c.soundCueId)));
  assert.ok(queue.some((c) => c.kind === 'pause' && c.pauseMs >= 600));

  for (const chunk of queue) {
    if (chunk.kind === 'speech') {
      assert.ok(chunk.text.length <= 420, `Speech chunk too long (${chunk.text.length} chars)`);
      assert.ok(chunk.ttsPromptText.length > 0);
      assert.ok(chunk.browserSpeechText.length > 0);
    }
  }
});

test('buildEpisodeNarrationQueue supports starting from a specific segment and skipping sound cues', () => {
  const ep = INITIAL_EPISODES[0];
  const targetSeg = ep.segments[3];
  const queue = buildEpisodeNarrationQueue(ep, {
    startSegmentId: targetSeg.id,
    includeSoundCues: false,
  });

  assert.ok(queue.length > 0);
  assert.equal(queue[0].segmentId, targetSeg.id);
  assert.equal(queue[0].segmentIndex, 3);
  assert.equal(
    queue.some((c) => c.kind === 'sound_cue'),
    false
  );
});

test('selectBestFrenchVoice prefers deep natural fr-FR voices over generic or compact voices', () => {
  const chosen = selectBestFrenchVoice([
    { lang: 'en-US', name: 'Samantha' },
    { lang: 'fr-CA', name: 'Amélie Compact' },
    { lang: 'fr-FR', name: 'Thomas' },
    { lang: 'fr-FR', name: 'Julie' },
  ]);
  assert.ok(chosen);
  assert.equal(chosen.name, 'Thomas');

  const fallbackNull = selectBestFrenchVoice([{ lang: 'en-GB', name: 'Daniel' }]);
  assert.equal(fallbackNull, null);
});

test('buildPrecepteurSpeechStyle tailors style direction to role and pace', () => {
  const style = buildPrecepteurSpeechStyle('bascule', 'pose', true);
  assert.ok(style.includes('Le Précepteur'));
  assert.ok(style.includes('unhurried'));
  assert.ok(style.includes('pivot'));
});

test('buildEpisodeNarrationQueue computes exact scriptStartOffset and scriptEndOffset spans for karaoke tracking', () => {
  const ep = INITIAL_EPISODES[0];
  const queue = buildEpisodeNarrationQueue(ep, {
    includeSoundCues: true,
    withSoutenances: true,
  });

  const speechChunks = queue.filter((c) => c.kind === 'speech');
  assert.ok(speechChunks.length > 0);
  for (const chunk of speechChunks) {
    assert.equal(typeof chunk.scriptStartOffset, 'number');
    assert.equal(typeof chunk.scriptEndOffset, 'number');
    const seg = ep.segments.find((s) => s.id === chunk.segmentId);
    assert.ok(seg);
    const sliced = seg.scriptText.slice(chunk.scriptStartOffset!, chunk.scriptEndOffset!);
    const firstWord = chunk.text.split(/\s+/)[0];
    assert.ok(sliced.includes(firstWord), `Expected "${sliced}" to include "${firstWord}"`);
  }
});

