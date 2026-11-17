import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustThoughtToEpisodeThread,
  analyzeSegmentThought,
  detectDraftConceptMatches,
  detectEpisodeRepetitions,
  polishFrenchThought,
  rewriteRepeatedSentenceAsCallback,
} from './frenchPolisher';
import { INITIAL_EPISODES } from '../data/seedData';

test('polishFrenchThought fixes common French elisions, spelling, and punctuation without altering meaning', () => {
  const raw = 'jai envie de dire parceque cest important dans la vraie vie et meme tres simple';
  const res = polishFrenchThought(raw);
  assert.equal(res.hasChanges, true);
  assert.ok(res.polished.startsWith("J'ai"));
  assert.ok(res.polished.includes('parce que'));
  assert.ok(res.polished.includes("c'est"));
  assert.ok(res.polished.includes('même'));
  assert.ok(res.polished.includes('très'));
  assert.ok(res.polished.endsWith('.'));
  assert.ok(res.changes.length >= 4);
});

test('polishFrenchThought preserves [EXTRAIT SONORE] and [PAUSE] cues and does not corrupt "quelle scène"', () => {
  const raw = '[EXTRAIT SONORE : Réveil] Quelle scène incroyable. jai compris quil faut ralentir. [PAUSE 2s]';
  const res = polishFrenchThought(raw);
  assert.ok(res.polished.includes('[EXTRAIT SONORE : Réveil]'));
  assert.ok(res.polished.includes('Quelle scène incroyable'));
  assert.ok(res.polished.includes('[PAUSE 2s]'));
  assert.ok(res.polished.includes("J'ai compris qu'il"));
});

test('adjustThoughtToEpisodeThread edits real oral raw French, splits long run-on blocks, and tracks the episode thread', () => {
  const freeGuy = INITIAL_EPISODES[0];
  const targetSegment = freeGuy.segments[2];
  const raw =
    'et tu dis non et la ton collegue naturrement vas surement te regarder bizzarement parceque ta pas suivie la regle du bonjour au milieu de lemploi et inscienment il sattend a un bonjour ca vas mais vu que on a pas le temps de discuter il reste juste un collegue';

  const res = adjustThoughtToEpisodeThread(raw, freeGuy, targetSegment.id);
  assert.equal(res.hasChanges, true);
  assert.notEqual(res.adjusted, raw);
  assert.ok(res.adjusted.includes('collègue'));
  assert.ok(res.adjusted.includes('naturellement'));
  assert.ok(res.adjusted.includes('sûrement'));
  assert.ok(res.adjusted.includes('bizarrement'));
  assert.ok(res.adjusted.includes("tu n'as pas suivi la règle"));
  assert.ok(res.adjusted.includes("l'emploi"));
  assert.ok(res.adjusted.includes('inconsciemment'));
  assert.ok(res.adjusted.includes('ça va'));
  assert.ok(res.threadStatus.includes(freeGuy.segments[1].title));
  assert.ok(res.changes.length >= 5);
});

test('detectEpisodeRepetitions flags when user types a reflection already exposed in another segment', () => {
  const freeGuy = INITIAL_EPISODES[0];
  const seg2 = freeGuy.segments[1];
  const typed =
    "Quand un collègue te pose la question bonjour ça va au travail, tu n'as pas le droit de répondre non parce que c'est la règle sociale.";

  const matches = detectEpisodeRepetitions(freeGuy, seg2.id, typed);
  assert.ok(matches.length >= 1);
  assert.equal(matches[0].segmentId, freeGuy.segments[0].id);
  assert.equal(matches[0].segmentIndex, 1);
  assert.ok(matches[0].sharedKeywords.length >= 3);
  assert.ok(matches[0].matchedExcerpt.length > 10);
});

test('adjustThoughtToEpisodeThread turns a repeated opening sentence into a thread callback while preserving new insight', () => {
  const freeGuy = INITIAL_EPISODES[0];
  const seg2 = freeGuy.segments[1];
  const repeatedPlusNew =
    "Quand un collègue te pose la question bonjour ça va au travail, tu n'as pas le droit de répondre non parce que c'est la règle sociale. C'est justement à partir de ce réflexe que Sartre montre comment l'habitude nous transforme en rôle social.";

  const res = adjustThoughtToEpisodeThread(repeatedPlusNew, freeGuy, seg2.id);
  assert.equal(res.hasChanges, true);
  assert.ok(res.adjusted.includes('Comme on l’a déjà posé dans le segment 01'));
  assert.ok(res.adjusted.includes('Sartre montre comment'));
  assert.ok(res.changes.some((c) => c.includes('Répétition évitée')));
});

test('rewriteRepeatedSentenceAsCallback replaces only the repeated sentence cleanly', () => {
  const freeGuy = INITIAL_EPISODES[0];
  const seg2 = freeGuy.segments[1];
  const repeated =
    "Quand un collègue te pose la question bonjour ça va au travail, tu n'as pas le droit de répondre non parce que c'est la règle sociale.";
  const fullText = `${repeated} Passons maintenant à la vraie bascule du héros.`;
  const matches = detectEpisodeRepetitions(freeGuy, seg2.id, fullText);
  assert.ok(matches.length >= 1);

  const next = rewriteRepeatedSentenceAsCallback(fullText, matches[0]);
  assert.ok(next.includes('Comme on l’a déjà posé dans le segment 01'));
  assert.ok(next.includes('Passons maintenant à la vraie bascule du héros.'));
});

test('analyzeSegmentThought returns guiding questions and readiness label', () => {
  const guidance = analyzeSegmentThought(INITIAL_EPISODES[0].segments[0]);
  assert.equal(guidance.readinessLabel, 'Pensée structurée et prête à lire');
  assert.ok(guidance.guidingQuestions.length >= 2);
});

test('detectDraftConceptMatches extracts key concepts during typing and links repeated ideas to the right segment', () => {
  const freeGuy = INITIAL_EPISODES[0];

  // Short key-concept input: "l'habitus de Bourdieu" -> Seg 03
  const bourdieu = detectDraftConceptMatches(freeGuy, "reparler de l'habitus de Bourdieu");
  assert.ok(bourdieu.detectedConcepts.some((c) => c.toLowerCase().includes('habitus')));
  assert.ok(bourdieu.detectedConcepts.some((c) => c.toLowerCase().includes('bourdieu')));
  assert.ok(bourdieu.repeatedThoughts.length >= 1);
  assert.equal(bourdieu.repeatedThoughts[0].segmentId, 'seg-3');
  assert.equal(bourdieu.repeatedThoughts[0].segmentIndex, 3);

  // Signature concept + proper noun: "Spinoza et la pierre qui roule" -> Seg 05
  const spinoza = detectDraftConceptMatches(freeGuy, 'ajouter un mot sur Spinoza et la pierre qui roule');
  assert.ok(spinoza.repeatedThoughts.length >= 1);
  assert.equal(spinoza.repeatedThoughts[0].segmentId, 'seg-5');

  // Lunettes bleues + Millie -> Seg 04
  const millie = detectDraftConceptMatches(freeGuy, 'les lunettes bleues quand il croise Millie');
  assert.ok(millie.repeatedThoughts.length >= 1);
  assert.equal(millie.repeatedThoughts[0].segmentId, 'seg-4');

  // Brand new unrelated concrete idea -> detects concepts without false-positive repetition warning
  const fresh = detectDraftConceptMatches(freeGuy, 'une anecdote de croissant chaud chez mon pâtissier');
  assert.ok(fresh.detectedConcepts.length >= 2);
  assert.equal(fresh.repeatedThoughts.length, 0);
});

