import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCatalogEpisodeScenarioUpgrade,
  applyMemoryNoteAssignment,
  applyMemoryNoteContentUpdate,
  computeEpisodeContentHash,
  computeMemoryNoteHash,
  episodeDocToEpisode,
  MAX_NOTES_PER_EPISODE,
  MAX_SEGMENTS_PER_EPISODE,
  MAX_SKETCH_DATA_URL_LEN,
  memoryNoteDocToNote,
  mergeEpisodesOnInitialSync,
  mergeMemoryNotesOnInitialSync,
  prepareEpisodePayload,
  prepareMemoryNotePayload,
  prepareStudioSettingsPayload,
  sanitizeDocId,
  sortEpisodesDeterministically,
} from './cloudSyncLogic';
import type { Episode, MemoryNote } from '../types/podcast';
import { DEFAULT_APPEARANCE, DEFAULT_MASTERING_SETTINGS } from '../data/seedData';

function assertNoUndefinedDeep(value: unknown, path = 'root'): void {
  assert.notEqual(value, undefined, `Unexpected undefined at ${path}`);
  if (Array.isArray(value)) {
    value.forEach((item, idx) => assertNoUndefinedDeep(item, `${path}[${idx}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertNoUndefinedDeep(v, `${path}.${k}`);
    }
  }
}

function makeSampleEpisode(id = 'ep-01-freeguy', number = '01'): Episode {
  return {
    id,
    number,
    category: 'cinema_serie',
    title: 'Free Guy : Sommes-nous des PNJ ?',
    workTitle: 'Free Guy',
    philosophicalTheme: 'Le libre arbitre',
    logline: 'Accroche du quotidien',
    targetMinutes: 30,
    draftThoughts: undefined,
    status: 'en_preparation',
    updatedAt: '2026-11-14',
    segments: [
      {
        id: 'seg-1',
        title: 'Accroche',
        role: 'accroche',
        status: 'brouillon',
        scriptText: 'Bonjour',
        concreteExample: 'Le café',
        soundCueId: undefined,
        soundCueNote: undefined,
        targetDurationSec: undefined,
        linkedTakeId: undefined,
        estimatedWpm: 140,
        linkedSourceIds: [],
        comments: undefined,
        sketchDataUrl: undefined,
      },
    ],
    sources: [],
    notes: [
      {
        id: 'note-1',
        title: 'Note',
        content: 'Contenu',
        segmentId: undefined,
        createdAt: '2026-11-14',
      },
    ],
  };
}

test('sanitizeDocId enforces safe Firestore ID characters and length', () => {
  assert.equal(sanitizeDocId('ep-01-freeguy'), 'ep-01-freeguy');
  assert.equal(sanitizeDocId('bad/id with spaces!'), 'bad-id-with-spaces');
  assert.equal(sanitizeDocId('   ', 'fallback'), 'fallback');
  assert.ok(sanitizeDocId('a'.repeat(200)).length <= 128);
});

test('prepareEpisodePayload strips all undefined values and bounds volumetric limits', () => {
  const ep = makeSampleEpisode();
  ep.draftThoughts = 'x'.repeat(25000);
  ep.segments[0].sketchDataUrl = 'data:image/png;base64,' + 'A'.repeat(MAX_SKETCH_DATA_URL_LEN + 100);
  for (let i = 1; i < 45; i++) {
    ep.segments.push({ ...ep.segments[0], id: `seg-${i + 1}` });
  }
  for (let i = 1; i < 70; i++) {
    ep.notes.push({ ...ep.notes[0], id: `note-${i + 1}` });
  }

  const payload = prepareEpisodePayload(ep, 'user-123', '2026-11-14T12:00:00.000Z');
  assertNoUndefinedDeep(payload);
  assert.equal(payload.ownerId, 'user-123');
  assert.equal(payload.draftThoughts.length, 20000);
  assert.equal(payload.segments.length, MAX_SEGMENTS_PER_EPISODE);
  assert.equal(payload.notes.length, MAX_NOTES_PER_EPISODE);
  assert.equal('sketchDataUrl' in payload.segments[0], false);
  assert.equal(payload.clientUpdatedAt, '2026-11-14T12:00:00.000Z');
});

test('prepareStudioSettingsPayload enforces exact schema keys and strips undefined segmentId', () => {
  const payload = prepareStudioSettingsPayload({
    uid: 'user-123',
    activeEpisodeId: 'ep-01-freeguy',
    appearance: DEFAULT_APPEARANCE,
    mastering: DEFAULT_MASTERING_SETTINGS,
    clips: [
      {
        id: 'clip-1',
        label: 'Voix',
        track: 'voix',
        sourceType: 'take',
        audioKey: 'demo_voice_take',
        startOnTimelineSec: 0,
        trimStartSec: 0,
        trimEndSec: 5,
        sourceDurationSec: 5,
        volume: 1,
        fadeInSec: 0.1,
        fadeOutSec: 0.1,
        segmentId: undefined,
      },
    ],
  });

  assertNoUndefinedDeep(payload);
  assert.equal(payload.ownerId, 'user-123');
  assert.equal(payload.clips.length, 1);
  assert.equal('segmentId' in payload.clips[0], false);
});

test('mergeEpisodesOnInitialSync seeds local episodes when cloud is empty', () => {
  const local = [makeSampleEpisode('ep-02-matrix', '02'), makeSampleEpisode('ep-01-freeguy', '01')];
  const res = mergeEpisodesOnInitialSync(local, []);
  assert.equal(res.toUploadToCloud.length, 2);
  assert.deepEqual(
    res.merged.map((e) => e.id),
    ['ep-01-freeguy', 'ep-02-matrix']
  );
});

test('mergeEpisodesOnInitialSync keeps cloud truth while preserving offline custom episodes', () => {
  const cloudEp = makeSampleEpisode('ep-01-freeguy', '01');
  cloudEp.draftThoughts = 'Note prise sur téléphone';

  const localSeedOutdated = makeSampleEpisode('ep-01-freeguy', '01');
  localSeedOutdated.draftThoughts = 'Ancien brouillon';
  const offlineCustom = makeSampleEpisode('ep-1763123456789', '18');

  const res = mergeEpisodesOnInitialSync([localSeedOutdated, offlineCustom], [cloudEp]);
  assert.equal(res.toUploadToCloud.length, 1);
  assert.equal(res.toUploadToCloud[0].id, 'ep-1763123456789');
  assert.equal(res.merged.length, 2);
  assert.equal(res.merged[0].draftThoughts, 'Note prise sur téléphone');
});

test('mergeEpisodesOnInitialSync seeds newly added catalog episodes when specified without resurrecting deleted defaults', () => {
  const cloudEp = makeSampleEpisode('ep-01-freeguy', '01');
  const deletedDefault = makeSampleEpisode('ep-02-resident-alien', '02');
  const newCatalogEp = makeSampleEpisode('ep-18-good-place', '18');

  const res = mergeEpisodesOnInitialSync(
    [cloudEp, deletedDefault, newCatalogEp],
    [cloudEp],
    new Set(['ep-18-good-place'])
  );

  assert.deepEqual(
    res.toUploadToCloud.map((e) => e.id),
    ['ep-18-good-place']
  );
  assert.deepEqual(
    res.merged.map((e) => e.id),
    ['ep-01-freeguy', 'ep-18-good-place']
  );
});

test('episodeDocToEpisode & computeEpisodeContentHash remain consistent across roundtrip', () => {
  const original = makeSampleEpisode('ep-01-freeguy', '01');
  original.draftThoughts = 'Idée du métro';
  const payload = prepareEpisodePayload(original, 'uid-1', '2026-11-14T10:00:00.000Z');
  const roundtripped = episodeDocToEpisode(payload as unknown as Record<string, unknown>);
  assert.equal(roundtripped.id, original.id);
  assert.equal(roundtripped.draftThoughts, 'Idée du métro');
  assert.equal(roundtripped.updatedAt, '2026-11-14');
  assert.equal(
    computeEpisodeContentHash(roundtripped),
    computeEpisodeContentHash({
      ...original,
      segments: payload.segments,
      notes: payload.notes,
      sources: payload.sources,
    })
  );
});

test('sortEpisodesDeterministically orders numerically by episode number', () => {
  const sorted = sortEpisodesDeterministically([
    makeSampleEpisode('ep-10', '10'),
    makeSampleEpisode('ep-02', '02'),
    makeSampleEpisode('ep-01', '01'),
  ]);
  assert.deepEqual(
    sorted.map((e) => e.number),
    ['01', '02', '10']
  );
});

test('prepareMemoryNotePayload & memoryNoteDocToNote roundtrip cleanly without undefined', () => {
  const note: MemoryNote = {
    id: 'mnote-1763200000',
    content: 'Dans See, la cécité reconfigure notre rapport à la reconnaissance sociale.',
    createdAt: '2026-11-15T08:30:00.000Z',
    updatedAt: '2026-11-15T08:31:00.000Z',
  };
  const payload = prepareMemoryNotePayload(note, 'uid-abc');
  assertNoUndefinedDeep(payload);
  assert.equal(payload.assignedEpisodeId, '');
  assert.equal(payload.assignedSegmentId, '');

  const parsed = memoryNoteDocToNote(payload as unknown as Record<string, unknown>);
  assert.equal(parsed.id, note.id);
  assert.equal(parsed.content, note.content);
  assert.equal(parsed.assignedEpisodeId, undefined);
  assert.equal(computeMemoryNoteHash(parsed), computeMemoryNoteHash(note));
});

test('mergeMemoryNotesOnInitialSync preserves both cloud and offline notes ordered chronologically', () => {
  const cloudNote: MemoryNote = {
    id: 'mnote-1',
    content: 'Note depuis téléphone',
    createdAt: '2026-11-15T08:00:00.000Z',
    updatedAt: '2026-11-15T08:00:00.000Z',
  };
  const offlineNote: MemoryNote = {
    id: 'mnote-2',
    content: 'Idée hors ligne ajoutée dans le métro',
    createdAt: '2026-11-15T09:00:00.000Z',
    updatedAt: '2026-11-15T09:00:00.000Z',
  };
  const { merged, toUploadToCloud } = mergeMemoryNotesOnInitialSync([offlineNote], [cloudNote]);
  assert.deepEqual(
    merged.map((n) => n.id),
    ['mnote-1', 'mnote-2']
  );
  assert.deepEqual(
    toUploadToCloud.map((n) => n.id),
    ['mnote-2']
  );
});

test('applyMemoryNoteContentUpdate & applyMemoryNoteAssignment synchronously return updated note for cloud sync', () => {
  const notes: MemoryNote[] = [
    {
      id: 'mnote-10',
      content: 'Première idée',
      createdAt: '2026-11-16T08:00:00.000Z',
      updatedAt: '2026-11-16T08:00:00.000Z',
    },
  ];

  const edited = applyMemoryNoteContentUpdate(
    notes,
    'mnote-10',
    'Idée retravaillée sur See',
    '2026-11-16T08:05:00.000Z'
  );
  assert.ok(edited.updatedNote);
  assert.equal(edited.updatedNote.content, 'Idée retravaillée sur See');
  assert.equal(edited.updatedNote.updatedAt, '2026-11-16T08:05:00.000Z');
  assert.equal(edited.nextNotes[0].content, 'Idée retravaillée sur See');

  const assigned = applyMemoryNoteAssignment(
    edited.nextNotes,
    'mnote-10',
    {
      episodeId: 'ep-19-see',
      segmentId: 'seg-2',
      episodeLabel: 'Ép. 19 · Seg. 02',
    },
    '2026-11-16T08:06:00.000Z'
  );
  assert.ok(assigned.updatedNote);
  assert.equal(assigned.updatedNote.assignedEpisodeId, 'ep-19-see');
  assert.equal(assigned.updatedNote.assignedSegmentId, 'seg-2');
  assert.equal(assigned.nextNotes[0].assignedEpisodeLabel, 'Ép. 19 · Seg. 02');
});

test('computeEpisodeContentHash stays identical before and after Firestore payload roundtrip even with undefined optional segment fields', () => {
  const original = makeSampleEpisode('ep-01-freeguy', '01');
  const payload = prepareEpisodePayload(original, 'uid-1', '2026-11-16T09:00:00.000Z');
  const roundtripped = episodeDocToEpisode(payload as unknown as Record<string, unknown>);
  assert.equal(computeEpisodeContentHash(original), computeEpisodeContentHash(roundtripped));
});

test('applyCatalogEpisodeScenarioUpgrade updates catalog episode while preserving user custom segments, notes, and status', () => {
  const oldEp = makeSampleEpisode('ep-22-ennemi-ame-soeur', '22');
  oldEp.status = 'en_enregistrement';
  oldEp.segments = [
    { ...oldEp.segments[0], id: 'ea-seg-1', status: 'pret', linkedTakeId: 'take-user-1' },
    { ...oldEp.segments[0], id: 'seg-custom-user', title: 'Ajout perso', scriptText: 'Idée ajoutée sur mobile' },
  ];
  oldEp.notes = [
    ...oldEp.notes,
    { id: 'note-user-1', title: 'Ma note', content: 'Garder ce passage', createdAt: '2026-11-16' },
  ];

  const catalogEp = makeSampleEpisode('ep-22-ennemi-ame-soeur', '22');
  catalogEp.title = 'Nouveau titre unifié';
  catalogEp.segments = [
    { ...catalogEp.segments[0], id: 'ea-seg-1', scriptText: 'Nouveau scénario harmonisé sans répétition.' },
    { ...catalogEp.segments[0], id: 'ea-seg-2', title: 'Hegel & Nietzsche', scriptText: 'Deuxième partie.' },
  ];

  const upgraded = applyCatalogEpisodeScenarioUpgrade([oldEp], catalogEp);
  assert.ok(upgraded.upgradedEpisode);
  assert.equal(upgraded.episodes[0].title, 'Nouveau titre unifié');
  assert.equal(upgraded.episodes[0].status, 'en_enregistrement');
  assert.equal(upgraded.episodes[0].segments.length, 3);
  assert.equal(upgraded.episodes[0].segments[0].status, 'pret');
  assert.equal(upgraded.episodes[0].segments[0].linkedTakeId, 'take-user-1');
  assert.equal(upgraded.episodes[0].segments[2].id, 'seg-custom-user');
  assert.ok(upgraded.episodes[0].notes.some((n) => n.id === 'note-user-1'));

  const secondPass = applyCatalogEpisodeScenarioUpgrade(upgraded.episodes, catalogEp);
  assert.equal(secondPass.upgradedEpisode, null);
});

test('mergeEpisodesOnInitialSync preserves locally dirty episode edits over stale cloud state', () => {
  const cloudEp = makeSampleEpisode('ep-01-freeguy', '01');
  cloudEp.title = 'Ancien titre cloud';

  const localEditedEp = makeSampleEpisode('ep-01-freeguy', '01');
  localEditedEp.title = 'Titre modifié hors-ligne par utilisateur';

  const res = mergeEpisodesOnInitialSync(
    [localEditedEp],
    [cloudEp],
    new Set(),
    new Set(['ep-01-freeguy'])
  );

  assert.equal(res.merged.length, 1);
  assert.equal(res.merged[0].title, 'Titre modifié hors-ligne par utilisateur');
  assert.deepEqual(
    res.toUploadToCloud.map((e) => e.id),
    ['ep-01-freeguy']
  );
});


