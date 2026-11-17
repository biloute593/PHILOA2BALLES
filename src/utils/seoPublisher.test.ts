import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEpisodeSeoPack } from './seoPublisher';
import { INITIAL_EPISODES } from '../data/seedData';

test('generateEpisodeSeoPack generates algorithmic title, keywords, hashtags, and chapters for film episodes', () => {
  const ep = INITIAL_EPISODES[0]; // Free Guy
  const pack = generateEpisodeSeoPack(ep);

  assert.ok(pack.optimizedTitle.includes('Free Guy'));
  assert.ok(pack.optimizedTitle.includes('PHILOA2BALLES'));
  assert.ok(pack.keywords.includes('PHILOA2BALLES'));
  assert.ok(pack.keywords.includes('Free Guy'));
  assert.ok(pack.keywords.some((k) => k.toLowerCase().includes('philosophie')));
  assert.ok(pack.keywords.length >= 10);
  assert.ok(pack.hashtags.includes('#Philoa2balles'));
  assert.ok(pack.youtubeDescription.includes('CHAPITRES DE L’ÉPISODE'));
  assert.ok(pack.youtubeDescription.includes('00:00 — 01.'));
});

test('generateEpisodeSeoPack adapts keywords and description for song episodes like Amel Bent Ma philosophie', () => {
  const amel = INITIAL_EPISODES.find((e) => e.id === 'ep-17-ma-philosophie');
  assert.ok(amel, 'Expected Amel Bent Ma philosophie episode in INITIAL_EPISODES');

  const pack = generateEpisodeSeoPack(amel);
  assert.ok(pack.optimizedTitle.includes('Ma philosophie'));
  assert.ok(pack.keywords.includes('analyse paroles'));
  assert.ok(pack.hashtags.includes('#AnalyseChanson'));
  assert.ok(pack.youtubeDescription.includes('Amel Bent'));
});
