import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeEpisodeTexts,
  appendThoughtToSegment,
  calculateEpisodeDurationSeconds,
  calculateEpisodeTargetSeconds,
  compileShowNotes,
  filterEpisodesByCategory,
  filterSources,
  insertThoughtIntelligently,
  moveSegmentInList,
  reorganizeEpisodeTexts,
} from './episodeStore';
import { planSmartDraftPlacement } from './frenchPolisher';
import { INITIAL_EPISODES } from '../data/seedData';

test('moveSegmentInList reorders segments cleanly and respects boundaries', () => {
  const segs = INITIAL_EPISODES[0].segments;
  const movedDown = moveSegmentInList(segs, segs[0].id, 'down');
  assert.equal(movedDown[1].id, segs[0].id);
  assert.equal(movedDown[0].id, segs[1].id);

  // Moving first element up is a no-op
  const noopUp = moveSegmentInList(segs, segs[0].id, 'up');
  assert.equal(noopUp[0].id, segs[0].id);
});

test('calculateEpisodeDurationSeconds computes non-zero duration for seeded episode', () => {
  const totalSec = calculateEpisodeDurationSeconds(INITIAL_EPISODES[0]);
  assert.ok(totalSec > 120, `Expected >120s for Free Guy script, got ${totalSec}`);
});

test('all 24 elaborated episodes (19 films/series + 5 songs) meet the 30-minute minimum target duration', () => {
  assert.equal(INITIAL_EPISODES.length, 24);

  const expectedTitles = [
    'Free Guy',
    'Resident Alien',
    'Monstre',
    'Ninho',
    'Adolescence',
    'Black Doves',
    'Sense8',
    'Cent ans de solitude',
    'Moi, capitaine',
    'Mercredi',
    'Black Beauty',
    'The Polygamist',
    'Fils de joie',
    'Halo',
    'Adele',
    'All of Me',
    'Ma philosophie',
    'The Good Place',
    'See',
    'Lupin',
    'Morale de trottoir',
    'ennemi juré',
    'Amour ou âme sœur',
    'SEE : Perception sensorielle',
  ];

  for (const keyword of expectedTitles) {
    assert.ok(
      INITIAL_EPISODES.some((ep) =>
        `${ep.title} ${ep.workTitle}`.toLowerCase().includes(keyword.toLowerCase())
      ),
      `Missing requested episode covering "${keyword}"`
    );
  }

  for (const ep of INITIAL_EPISODES) {
    const targetSec = calculateEpisodeTargetSeconds(ep);
    const writtenSec = calculateEpisodeDurationSeconds(ep);
    assert.ok(
      targetSec >= 1800,
      `Episode ${ep.number} (${ep.workTitle}) target duration ${targetSec}s is below 30:00 (1800s)`
    );
    assert.ok(
      writtenSec >= 1800,
      `Episode ${ep.number} (${ep.workTitle}) written spoken duration ${writtenSec}s (${(writtenSec / 60).toFixed(1)} min) is below 30:00 (1800s)`
    );
    const report = analyzeEpisodeTexts(ep);
    assert.equal(
      report.isHealthy,
      true,
      `Episode ${ep.number} (${ep.workTitle}) should be clean & healthy, got: ${JSON.stringify(report.issues)}`
    );
    assert.ok(ep.segments.length >= 5, `Episode ${ep.number} should have at least 5 segments`);
    assert.ok(ep.sources.length >= 2, `Episode ${ep.number} should have at least 2 sources`);
  }

  const epSee = INITIAL_EPISODES.find((ep) => ep.id === 'ep-19-see');
  assert.ok(epSee);
  const seeAllText = `${epSee.logline} ${epSee.draftThoughts ?? ''} ${epSee.segments.map((s) => s.scriptText).join(' ')}`;
  assert.ok(seeAllText.includes('Mike'));
  assert.ok(seeAllText.includes('Resident Alien'));
  assert.ok(seeAllText.includes('arrêt'));

  const epLupin = INITIAL_EPISODES.find((ep) => ep.id === 'ep-20-lupin');
  assert.ok(epLupin);
  const lupinAllText = `${epLupin.logline} ${epLupin.draftThoughts ?? ''} ${epLupin.segments.map((s) => s.scriptText).join(' ')}`;
  assert.ok(lupinAllText.includes('Claire'));
  assert.ok(lupinAllText.includes('Benjamin'));
  assert.ok(lupinAllText.toLowerCase().includes('fait semblant'));
  assert.ok(lupinAllText.toLowerCase().includes('ego'));

  const epMorale = INITIAL_EPISODES.find((ep) => ep.id === 'ep-21-morale-trottoir');
  assert.ok(epMorale);
  const moraleAllText = `${epMorale.logline} ${epMorale.draftThoughts ?? ''} ${epMorale.segments.map((s) => s.scriptText).join(' ')}`;
  assert.ok(moraleAllText.includes('forêt'));
  assert.ok(moraleAllText.includes('trottoir'));
  assert.ok(moraleAllText.includes('Harry'));
  assert.ok(moraleAllText.includes('Hobbes'));
  assert.ok(moraleAllText.includes('Rousseau'));
  assert.ok(moraleAllText.toLowerCase().includes('extraterrestres socialisés'));
  assert.ok(moraleAllText.includes('par quoi tu commencerais'));

  const ep22 = INITIAL_EPISODES.find((ep) => ep.id === 'ep-22-ennemi-ame-soeur');
  assert.ok(ep22);
  const ep22Text = ep22.segments.map((s) => s.scriptText).join(' ');
  assert.ok(ep22Text.includes('Hegel'));
  assert.ok(ep22Text.includes('Prost'));
  assert.ok(ep22Text.includes('Senna'));
  assert.ok(ep22Text.includes('C’était PHILOA2BALLES.'));

  const ep23 = INITIAL_EPISODES.find((ep) => ep.id === 'ep-23-amour-ame-soeur');
  assert.ok(ep23);
  const ep23Text = ep23.segments.map((s) => s.scriptText).join(' ');
  assert.ok(ep23Text.includes('Nell'));
  assert.ok(ep23Text.includes('Jeff'));
  assert.ok(ep23Text.toLowerCase().includes('transparence'));
  assert.ok(ep23Text.includes('C’était PHILOA2BALLES.'));

  const ep24 = INITIAL_EPISODES.find((ep) => ep.id === 'ep-24-see-identite');
  assert.ok(ep24);
  const ep24Text = ep24.segments.map((s) => s.scriptText).join(' ');
  assert.ok(ep24Text.includes('Baba Voss'));
  assert.ok(ep24Text.includes('Merleau-Ponty'));
  assert.ok(ep24Text.includes('Diderot'));
  assert.ok(ep24Text.includes('Ricœur'));
  assert.ok(ep24Text.includes('C’était PHILOA2BALLES.'));
});

test('song episodes open with everyday worker narratives and dissect lyrics', () => {
  const songs = filterEpisodesByCategory(INITIAL_EPISODES, 'chanson');
  assert.equal(songs.length, 5);

  const expectedWorkers = ['boulanger', 'fermier', 'postier', 'menuisier', 'cordonnier'];
  songs.forEach((song, idx) => {
    const seg1Text = song.segments[0].scriptText.toLowerCase();
    assert.ok(
      seg1Text.includes(expectedWorkers[idx]),
      `Song episode ${song.number} should open with "${expectedWorkers[idx]}" narrative`
    );
    assert.ok(
      song.segments.some((s) => s.title.toLowerCase().includes('décorticage')),
      `Song episode ${song.number} should include a lyrics dissection segment`
    );
  });

  const amel = songs.find((s) => s.id === 'ep-17-ma-philosophie');
  assert.ok(amel);
  assert.ok(amel.segments[1].scriptText.includes('La Courneuve'));
  assert.ok(amel.segments[1].scriptText.includes('Nouvelle Star'));
  assert.ok(amel.segments[1].scriptText.includes('Diam’s'));
});

test('appendThoughtToSegment appends draft thought into target segment and clears draft', () => {
  const ep = INITIAL_EPISODES[12]; // Stromae Fils de joie
  const segId = ep.segments[1].id;
  const updated = appendThoughtToSegment(ep, segId, 'Nouvelle pensée ajoutée pour le prompteur.', true);
  assert.ok(updated.segments[1].scriptText.endsWith('Nouvelle pensée ajoutée pour le prompteur.'));
  assert.equal(updated.draftThoughts, '');
});

test('insertThoughtIntelligently routes a "lunettes bleues" brouillon into Free Guy segment 04 right after the glasses sentence (not top or bottom)', () => {
  const freeGuy = INITIAL_EPISODES[0];
  const draft = 'En mettant ces lunettes bleues, il découvre enfin la vérité cachée derrière son écran.';
  const plan = planSmartDraftPlacement(freeGuy, draft);
  assert.ok(plan);
  assert.equal(plan.targetSegmentId, 'seg-4');
  assert.equal(plan.targetSegmentIndex, 4);
  assert.equal(plan.insertionMode, 'after_sentence');
  assert.ok(plan.anchorExcerpt.toLowerCase().includes('lunettes bleues'));

  const { episode: updated } = insertThoughtIntelligently(freeGuy, draft, { clearDraft: true });
  assert.equal(updated.draftThoughts, '');
  const seg4 = updated.segments[3];
  // Inserted inline right after "...lunettes bleues." and BEFORE "[EXTRAIT SONORE : Déclic prise de conscience]"
  const glassesIdx = seg4.scriptText.indexOf('paire de lunettes bleues.');
  const insertedIdx = seg4.scriptText.indexOf('En mettant ces lunettes bleues');
  const cueIdx = seg4.scriptText.indexOf('[EXTRAIT SONORE : Déclic prise de conscience]');
  assert.ok(glassesIdx !== -1 && insertedIdx > glassesIdx && insertedIdx < cueIdx);
  // Word comment offsets shifted cleanly after insertion
  for (const comment of seg4.comments ?? []) {
    assert.equal(
      seg4.scriptText.slice(comment.startOffset, comment.endOffset),
      comment.selectedText
    );
  }
});

test('insertThoughtIntelligently routes a Spinoza / pierre qui roule thought directly to segment 05', () => {
  const freeGuy = INITIAL_EPISODES[0];
  const draft = 'Spinoza montre avec sa pierre qui roule que nos désirs ont des causes cachées.';
  const { episode: updated, plan } = insertThoughtIntelligently(freeGuy, draft);
  assert.ok(plan);
  assert.equal(plan.targetSegmentId, 'seg-5');
  assert.ok(updated.segments[4].scriptText.includes('Spinoza montre avec sa pierre'));
});

test('filterSources filters by status and search query', () => {
  const sources = INITIAL_EPISODES[0].sources;
  const verified = filterSources(sources, 'verifiee', '');
  assert.ok(verified.every((s) => s.status === 'verifiee'));

  const sartre = filterSources(sources, 'toutes', 'Sartre');
  assert.equal(sartre.length, 1);
  assert.equal(sartre[0].authorOrDirector, 'Jean-Paul Sartre');
});

test('compileShowNotes outputs chapter timestamps and verified sources', () => {
  const notes = compileShowNotes(INITIAL_EPISODES[0]);
  assert.ok(notes.includes('PHILOA2BALLES — Épisode 01'));
  assert.ok(notes.includes('00:00 — 01.'));
  assert.ok(notes.includes('Jean-Paul Sartre'));
});

test('Free Guy segment 1 integrates colleague greeting norm thought with exact comment offsets', () => {
  const seg1 = INITIAL_EPISODES[0].segments[0];
  assert.ok(seg1.scriptText.includes('sa QUESTION'));
  assert.ok(seg1.scriptText.includes('Ah bon, qu’est-ce qui ne va pas ?'));
  assert.ok(seg1.scriptText.includes('ta femme ou ton véritable ami'));
  for (const comment of seg1.comments ?? []) {
    assert.equal(
      seg1.scriptText.slice(comment.startOffset, comment.endOffset),
      comment.selectedText,
      `Offset mismatch for comment ${comment.id}`
    );
  }
});

test('Episode 1 (Free Guy) is cleanly organized: zero repetitions, zero empty placeholders, notes integrated, and exact comment offsets', () => {
  const ep1 = INITIAL_EPISODES[0];
  const report = analyzeEpisodeTexts(ep1);

  assert.equal(report.repetitionCount, 0, `Unexpected repetitions: ${JSON.stringify(report.issues)}`);
  assert.equal(report.brokenOffsetCount, 0, 'Expected exact word comment offsets in Episode 1');
  assert.equal(report.emptyPlaceholderCount, 0, 'Expected no empty [EXEMPLE CONCRET] tags');
  assert.equal(report.unlinkedNoteCount, 0, 'Expected all research notes linked');
  assert.equal(report.orderNeedsTidy, false, 'Expected narrative arc order to be clean');
  assert.equal(report.isHealthy, true, `Expected Episode 1 healthy, got ${JSON.stringify(report.issues)}`);

  // Verify integrated research notes & exact seg-4 offset
  assert.ok(ep1.segments[1].scriptText.toLowerCase().includes('métro du matin'));
  assert.ok(ep1.segments[2].scriptText.toLowerCase().includes('orientation scolaire'));
  assert.ok(ep1.segments[3].scriptText.includes('Millie'));
  const seg4 = ep1.segments[3];
  for (const comment of seg4.comments ?? []) {
    assert.equal(
      seg4.scriptText.slice(comment.startOffset, comment.endOffset),
      comment.selectedText,
      `Offset mismatch in seg-4 for comment ${comment.id}`
    );
  }
});

test('analyzeEpisodeTexts detects disordered arcs, drifted offsets, and unlinked notes and reorganizeEpisodeTexts repairs them', () => {
  const messy = {
    ...INITIAL_EPISODES[0],
    segments: [
      INITIAL_EPISODES[0].segments[5], // conclusion first!
      {
        ...INITIAL_EPISODES[0].segments[3],
        comments: [
          {
            id: 'c-drifted',
            segmentId: 'seg-4',
            selectedText: 'c’est moral',
            startOffset: 0,
            endOffset: 5,
            comment: 'Pause',
            cueKind: 'pause' as const,
            createdAt: '2026-11-13',
          },
        ],
      },
      INITIAL_EPISODES[0].segments[0], // accroche last!
    ],
    notes: [
      {
        id: 'n-orphan',
        title: 'Spinoza',
        content: 'La pierre qui roule montre les causes cachées.',
        createdAt: '2026-11-13',
      },
    ],
  };

  const before = analyzeEpisodeTexts(messy);
  assert.equal(before.orderNeedsTidy, true);
  assert.equal(before.brokenOffsetCount, 1);
  assert.equal(before.unlinkedNoteCount, 1);

  const { episode: fixed, appliedChanges } = reorganizeEpisodeTexts(messy);
  assert.ok(appliedChanges.length >= 2);
  assert.equal(fixed.segments[0].role, 'accroche');
  assert.equal(fixed.segments[fixed.segments.length - 1].role, 'conclusion');

  const healedSeg4 = fixed.segments.find((s) => s.id === 'seg-4');
  assert.ok(healedSeg4?.comments?.[0]);
  assert.equal(
    healedSeg4.scriptText.slice(
      healedSeg4.comments[0].startOffset,
      healedSeg4.comments[0].endOffset
    ),
    'c’est moral'
  );
  assert.ok(fixed.notes[0].segmentId);
});

test('Episode 22 unified scenario preserves exact logical order, key references, >30 min duration, and zero repetitions', () => {
  const ep22 = INITIAL_EPISODES.find((e) => e.id === 'ep-22-ennemi-ame-soeur');
  assert.ok(ep22);
  assert.equal(ep22.segments.length, 6);

  const combined = ep22.segments.map((s) => s.scriptText).join('\n');
  assert.ok(ep22.segments[0].scriptText.includes('Tu voudrais danser avec moi'));
  assert.ok(ep22.segments[0].scriptText.includes('beaux-parents'));
  assert.ok(ep22.segments[1].scriptText.includes('Hegel'));
  assert.ok(ep22.segments[1].scriptText.includes('Nietzsche'));
  assert.ok(ep22.segments[2].scriptText.includes('René Girard'));
  assert.ok(ep22.segments[2].scriptText.includes('Intelligence Artificielle'));
  assert.ok(ep22.segments[2].scriptText.includes('Donald Trump'));
  assert.ok(ep22.segments[2].scriptText.includes('Clásico'));
  assert.ok(ep22.segments[3].scriptText.includes('jogging élimé'));
  assert.ok(ep22.segments[3].scriptText.includes('Erving Goffman'));
  assert.ok(ep22.segments[4].scriptText.includes('traumas transgénérationnels'));
  assert.ok(ep22.segments[4].scriptText.includes('Dadju'));
  assert.ok(ep22.segments[4].scriptText.includes('Nell et Jeff'));
  assert.ok(ep22.segments[5].scriptText.includes('symbiose avec son âme'));
  assert.ok(ep22.segments[5].scriptText.includes('J’en courrai le risque'));
  assert.ok(combined.includes('Ayrton Senna'));

  const dur = calculateEpisodeDurationSeconds(ep22);
  assert.ok(dur >= 1800, `Expected Episode 22 duration >= 1800s, got ${dur}s`);

  const report = analyzeEpisodeTexts(ep22);
  assert.equal(report.repetitionCount, 0, `Unexpected repetitions: ${JSON.stringify(report.issues)}`);
  assert.equal(report.isHealthy, true, `Expected Episode 22 healthy, got ${JSON.stringify(report.issues)}`);
});

