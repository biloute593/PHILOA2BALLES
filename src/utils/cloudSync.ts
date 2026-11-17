import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  Episode,
  MasteringSettings,
  MemoryNote,
  NotebookAppearance,
  TimelineClip,
} from '../types/podcast';
import {
  clampString,
  episodeDocToEpisode,
  memoryNoteDocToNote,
  prepareEpisodePayload,
  prepareMemoryNotePayload,
  prepareStudioSettingsPayload,
  sanitizeDocId,
  sortEpisodesDeterministically,
  sortMemoryNotesChronologically,
} from './cloudSyncLogic';

export interface CloudStudioSettings {
  activeEpisodeId: string;
  appearance: NotebookAppearance;
  mastering: MasteringSettings;
  clips: TimelineClip[];
}

export async function ensureUserProfile(user: User): Promise<void> {
  const uid = sanitizeDocId(user.uid, 'user');
  const path = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const profileFields = {
    email: clampString(user.email ?? '', 320),
    displayName: clampString(user.displayName ?? 'Créateur', 120),
    photoURL: clampString(user.photoURL ?? '', 500),
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    try {
      await setDoc(userRef, {
        uid,
        ...profileFields,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  } else {
    try {
      await updateDoc(userRef, profileFields);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
}

export async function fetchInitialCloudState(uid: string): Promise<{
  episodes: Episode[];
  existingEpisodeIds: Set<string>;
  memoryNotes: MemoryNote[];
  existingMemoryNoteIds: Set<string>;
  settings: CloudStudioSettings | null;
  hasSettingsDoc: boolean;
}> {
  const safeUid = sanitizeDocId(uid, 'user');
  const episodesPath = `users/${safeUid}/episodes`;
  const notesPath = `users/${safeUid}/memoryNotes`;
  const settingsPath = `users/${safeUid}/settings/studio`;

  let epSnap;
  try {
    const q = query(
      collection(db, 'users', safeUid, 'episodes'),
      where('ownerId', '==', safeUid)
    );
    epSnap = await getDocs(q);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, episodesPath);
  }

  const episodes: Episode[] = [];
  const existingEpisodeIds = new Set<string>();
  epSnap.forEach((docSnap) => {
    existingEpisodeIds.add(docSnap.id);
    episodes.push(episodeDocToEpisode(docSnap.data() as Record<string, unknown>));
  });

  let notesSnap;
  try {
    const qNotes = query(
      collection(db, 'users', safeUid, 'memoryNotes'),
      where('ownerId', '==', safeUid)
    );
    notesSnap = await getDocs(qNotes);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, notesPath);
  }

  const memoryNotes: MemoryNote[] = [];
  const existingMemoryNoteIds = new Set<string>();
  notesSnap.forEach((docSnap) => {
    existingMemoryNoteIds.add(docSnap.id);
    memoryNotes.push(memoryNoteDocToNote(docSnap.data() as Record<string, unknown>));
  });

  let settingsSnap;
  try {
    settingsSnap = await getDoc(doc(db, 'users', safeUid, 'settings', 'studio'));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, settingsPath);
  }

  let settings: CloudStudioSettings | null = null;
  if (settingsSnap.exists()) {
    const raw = settingsSnap.data() as Record<string, unknown>;
    settings = {
      activeEpisodeId: clampString(raw.activeEpisodeId, 128, 'ep-01-freeguy'),
      appearance: raw.appearance as NotebookAppearance,
      mastering: raw.mastering as MasteringSettings,
      clips: Array.isArray(raw.clips) ? (raw.clips as TimelineClip[]) : [],
    };
  }

  return {
    episodes: sortEpisodesDeterministically(episodes),
    existingEpisodeIds,
    memoryNotes: sortMemoryNotesChronologically(memoryNotes),
    existingMemoryNoteIds,
    settings,
    hasSettingsDoc: settingsSnap.exists(),
  };
}

export async function uploadEpisodesBatchToCloud(
  uid: string,
  episodes: Episode[],
  existingEpisodeIds: Set<string>
): Promise<void> {
  if (episodes.length === 0) return;
  const safeUid = sanitizeDocId(uid, 'user');
  const basePath = `users/${safeUid}/episodes`;

  // Firestore batches support up to 500 writes; chunk safely by 20
  const CHUNK_SIZE = 20;
  for (let i = 0; i < episodes.length; i += CHUNK_SIZE) {
    const chunk = episodes.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const ep of chunk) {
      const payload = prepareEpisodePayload(ep, safeUid);
      const ref = doc(db, 'users', safeUid, 'episodes', payload.id);
      if (existingEpisodeIds.has(payload.id)) {
        const { id: _id, ownerId: _ownerId, ...mutableFields } = payload;
        batch.update(ref, {
          ...mutableFields,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(ref, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingEpisodeIds.add(payload.id);
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, basePath);
    }
  }
}

export async function saveEpisodeToCloud(
  uid: string,
  episode: Episode,
  knownExists: boolean
): Promise<string> {
  const safeUid = sanitizeDocId(uid, 'user');
  const payload = prepareEpisodePayload(episode, safeUid);
  const path = `users/${safeUid}/episodes/${payload.id}`;
  const ref = doc(db, 'users', safeUid, 'episodes', payload.id);

  if (knownExists) {
    const { id: _id, ownerId: _ownerId, ...mutableFields } = payload;
    try {
      await updateDoc(ref, {
        ...mutableFields,
        updatedAt: serverTimestamp(),
      });
      return payload.id;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'not-found') {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  try {
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return payload.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteEpisodeFromCloud(uid: string, episodeId: string): Promise<void> {
  const safeUid = sanitizeDocId(uid, 'user');
  const safeEpId = sanitizeDocId(episodeId, 'ep');
  const path = `users/${safeUid}/episodes/${safeEpId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'episodes', safeEpId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveStudioSettingsToCloud(
  uid: string,
  params: CloudStudioSettings,
  knownExists: boolean
): Promise<void> {
  const safeUid = sanitizeDocId(uid, 'user');
  const payload = prepareStudioSettingsPayload({ uid: safeUid, ...params });
  const path = `users/${safeUid}/settings/studio`;
  const ref = doc(db, 'users', safeUid, 'settings', 'studio');

  if (knownExists) {
    const { ownerId: _ownerId, ...mutableFields } = payload;
    try {
      await updateDoc(ref, {
        ...mutableFields,
        updatedAt: serverTimestamp(),
      });
      return;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'not-found') {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  try {
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function uploadMemoryNotesBatchToCloud(
  uid: string,
  notes: MemoryNote[],
  existingNoteIds: Set<string>
): Promise<void> {
  if (notes.length === 0) return;
  const safeUid = sanitizeDocId(uid, 'user');
  const basePath = `users/${safeUid}/memoryNotes`;
  const CHUNK_SIZE = 20;
  for (let i = 0; i < notes.length; i += CHUNK_SIZE) {
    const chunk = notes.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const note of chunk) {
      const payload = prepareMemoryNotePayload(note, safeUid);
      const ref = doc(db, 'users', safeUid, 'memoryNotes', payload.id);
      if (existingNoteIds.has(payload.id)) {
        const { id: _id, ownerId: _ownerId, clientCreatedAt: _createdAt, ...mutableFields } = payload;
        batch.update(ref, {
          ...mutableFields,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(ref, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        existingNoteIds.add(payload.id);
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, basePath);
    }
  }
}

export async function saveMemoryNoteToCloud(
  uid: string,
  note: MemoryNote,
  knownExists: boolean
): Promise<string> {
  const safeUid = sanitizeDocId(uid, 'user');
  const payload = prepareMemoryNotePayload(note, safeUid);
  const path = `users/${safeUid}/memoryNotes/${payload.id}`;
  const ref = doc(db, 'users', safeUid, 'memoryNotes', payload.id);

  if (knownExists) {
    const { id: _id, ownerId: _ownerId, clientCreatedAt: _createdAt, ...mutableFields } = payload;
    try {
      await updateDoc(ref, {
        ...mutableFields,
        updatedAt: serverTimestamp(),
      });
      return payload.id;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'not-found') {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  try {
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return payload.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteMemoryNoteFromCloud(uid: string, noteId: string): Promise<void> {
  const safeUid = sanitizeDocId(uid, 'user');
  const safeNoteId = sanitizeDocId(noteId, 'mnote');
  const path = `users/${safeUid}/memoryNotes/${safeNoteId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'memoryNotes', safeNoteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToUserCloudData(
  uid: string,
  callbacks: {
    onEpisodesSnapshot: (episodes: Episode[], ids: Set<string>, hasPendingWrites: boolean) => void;
    onMemoryNotesSnapshot: (notes: MemoryNote[], ids: Set<string>, hasPendingWrites: boolean) => void;
    onSettingsSnapshot: (settings: CloudStudioSettings, hasPendingWrites: boolean) => void;
    onError: (error: unknown) => void;
  }
): Unsubscribe {
  const safeUid = sanitizeDocId(uid, 'user');
  const episodesPath = `users/${safeUid}/episodes`;
  const notesPath = `users/${safeUid}/memoryNotes`;
  const settingsPath = `users/${safeUid}/settings/studio`;

  const episodesQuery = query(
    collection(db, 'users', safeUid, 'episodes'),
    where('ownerId', '==', safeUid)
  );

  const reportSnapshotError = (error: unknown, operation: OperationType, path: string) => {
    callbacks.onError(error);
    const code = (error as { code?: string })?.code ?? '';
    const message = error instanceof Error ? error.message : String(error);
    if (code === 'permission-denied' || message.toLowerCase().includes('permission')) {
      handleFirestoreError(error, operation, path);
    } else {
      console.error('Firestore snapshot warning:', { operation, path, message });
    }
  };

  const unsubEpisodes = onSnapshot(
    episodesQuery,
    (snapshot) => {
      const episodes: Episode[] = [];
      const ids = new Set<string>();
      snapshot.forEach((docSnap) => {
        ids.add(docSnap.id);
        episodes.push(episodeDocToEpisode(docSnap.data() as Record<string, unknown>));
      });
      callbacks.onEpisodesSnapshot(
        sortEpisodesDeterministically(episodes),
        ids,
        snapshot.metadata.hasPendingWrites
      );
    },
    (error) => reportSnapshotError(error, OperationType.LIST, episodesPath)
  );

  const notesQuery = query(
    collection(db, 'users', safeUid, 'memoryNotes'),
    where('ownerId', '==', safeUid)
  );

  const unsubNotes = onSnapshot(
    notesQuery,
    (snapshot) => {
      const notes: MemoryNote[] = [];
      const ids = new Set<string>();
      snapshot.forEach((docSnap) => {
        ids.add(docSnap.id);
        notes.push(memoryNoteDocToNote(docSnap.data() as Record<string, unknown>));
      });
      callbacks.onMemoryNotesSnapshot(
        sortMemoryNotesChronologically(notes),
        ids,
        snapshot.metadata.hasPendingWrites
      );
    },
    (error) => reportSnapshotError(error, OperationType.LIST, notesPath)
  );

  const unsubSettings = onSnapshot(
    doc(db, 'users', safeUid, 'settings', 'studio'),
    (snapshot) => {
      if (!snapshot.exists()) return;
      const raw = snapshot.data() as Record<string, unknown>;
      callbacks.onSettingsSnapshot(
        {
          activeEpisodeId: clampString(raw.activeEpisodeId, 128, 'ep-01-freeguy'),
          appearance: raw.appearance as NotebookAppearance,
          mastering: raw.mastering as MasteringSettings,
          clips: Array.isArray(raw.clips) ? (raw.clips as TimelineClip[]) : [],
        },
        snapshot.metadata.hasPendingWrites
      );
    },
    (error) => reportSnapshotError(error, OperationType.GET, settingsPath)
  );

  return () => {
    unsubEpisodes();
    unsubNotes();
    unsubSettings();
  };
}
