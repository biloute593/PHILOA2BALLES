import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { ChevronLeft } from 'lucide-react';
import type {
  Episode,
  MasteringSettings,
  MemoryNote,
  NotebookAppearance,
  TimelineClip,
  WorkspaceTab,
} from './types/podcast';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_MASTERING_SETTINGS,
  INITIAL_EPISODES,
  SOUND_EXTRACTS,
} from './data/seedData';
import {
  createDemoVoiceBuffer,
  createSoundExtractBuffer,
} from './utils/webAudioEngine';
import { loadAudioBlob, saveAudioBlob } from './utils/audioStorage';
import { insertThoughtIntelligently } from './utils/episodeStore';
import { auth, authPersistenceReady, googleProvider } from './firebase';
import { useSwipeBackNavigation } from './hooks/useSwipeBackNavigation';
import {
  popNavRoute,
  pushNavRoute,
  type NavRouteSnapshot,
} from './utils/navigationHistory';
import {
  applyCatalogEpisodeScenarioUpgrade,
  applyMemoryNoteAssignment,
  applyMemoryNoteContentUpdate,
  computeEpisodeContentHash,
  computeMemoryNoteHash,
  mergeEpisodesOnInitialSync,
  mergeMemoryNotesOnInitialSync,
  sanitizeDocId,
  sortMemoryNotesChronologically,
} from './utils/cloudSyncLogic';
import {
  deleteMemoryNoteFromCloud,
  ensureUserProfile,
  fetchInitialCloudState,
  saveEpisodeToCloud,
  saveMemoryNoteToCloud,
  saveStudioSettingsToCloud,
  subscribeToUserCloudData,
  uploadEpisodesBatchToCloud,
  uploadMemoryNotesBatchToCloud,
} from './utils/cloudSync';
import { TopBar, type CloudSyncState } from './components/TopBar';
import { ScriptWorkspace } from './components/ScriptWorkspace';
import { AudioMasteringStudio } from './components/AudioMasteringStudio';
import { TeleprompterView } from './components/TeleprompterView';
import { PublishView } from './components/PublishView';
import { NewEpisodeModal } from './components/NewEpisodeModal';
import { AppearanceDrawer } from './components/AppearanceDrawer';
import { MobileGeminiHome } from './components/MobileGeminiHome';
import { MobileNavDrawer } from './components/MobileNavDrawer';

const STORAGE_EPISODES_KEY = 'philoa2balle_episodes_v11';
const PREV_STORAGE_EPISODES_KEYS = [
  'philoa2balle_episodes_v10',
  'philoa2balle_episodes_v9',
  'philoa2balle_episodes_v8',
  'philoa2balle_episodes_v7',
  'philoa2balle_episodes_v6',
  'philoa2balle_episodes_v5',
  'philoa2balle_episodes_v4',
  'philoa2balle_episodes_v3',
  'philoa2balle_episodes_v2',
];
const STORAGE_AUTOSEED_EP18_20_KEY = 'philoa2balle_autoseed_ep18_20_v1';
const STORAGE_AUTOSEED_EP21_KEY = 'philoa2balle_autoseed_ep21_v1';
const STORAGE_AUTOSEED_EP22_24_KEY = 'philoa2balle_autoseed_ep22_24_v1';
const STORAGE_EP22_SCENARIO_MERGE_KEY = 'philoa2balle_ep22_scenario_v2';
const NEW_CATALOG_EPISODE_IDS = ['ep-18-good-place', 'ep-19-see', 'ep-20-lupin'] as const;
const NEW_EP22_24_IDS = ['ep-22-ennemi-ame-soeur', 'ep-23-amour-ame-soeur', 'ep-24-see-identite'] as const;
const CATALOG_EP22 = INITIAL_EPISODES.find((ep) => ep.id === 'ep-22-ennemi-ame-soeur');
const STORAGE_MASTERING_KEY = 'philoa2balle_mastering_v1';
const STORAGE_CLIPS_KEY = 'philoa2balle_clips_v1';
const STORAGE_APPEARANCE_KEY = 'philoa2balle_appearance_v1';
const STORAGE_MEMORY_NOTES_KEY = 'philoa2balle_memory_notes_v1';
const STORAGE_DIRTY_EPISODES_KEY = 'philoa2balle_dirty_episodes_v1';
const STORAGE_ACTIVE_EPISODE_KEY = 'philoa2balle_active_episode_v1';
const STORAGE_ACTIVE_TAB_KEY = 'philoa2balle_active_tab_v1';
const STORAGE_CLOUD_LINKED_ONCE_KEY = 'philoa2balle_cloud_linked_once_v1';

const INITIAL_CLIPS: TimelineClip[] = [
  {
    id: 'clip-demo-cue-intro',
    label: 'Réveil 7h00 & Routine métro',
    track: 'extrait',
    sourceType: 'sound_cue',
    audioKey: 'cue_reveil_routine',
    startOnTimelineSec: 0,
    trimStartSec: 0,
    trimEndSec: 4.0,
    sourceDurationSec: 4.0,
    volume: 0.45,
    fadeInSec: 0.1,
    fadeOutSec: 0.8,
  },
  {
    id: 'clip-demo-voice-1',
    label: 'Voix Démo — Accroche Free Guy',
    track: 'voix',
    sourceType: 'take',
    audioKey: 'demo_voice_take',
    startOnTimelineSec: 1.8,
    trimStartSec: 0,
    trimEndSec: 6.2,
    sourceDurationSec: 6.2,
    volume: 1.0,
    fadeInSec: 0.05,
    fadeOutSec: 0.12,
    segmentId: 'seg-1',
  },
  {
    id: 'clip-demo-cue-declic',
    label: 'Déclic prise de conscience',
    track: 'extrait',
    sourceType: 'sound_cue',
    audioKey: 'cue_declic_lunettes',
    startOnTimelineSec: 8.2,
    trimStartSec: 0,
    trimEndSec: 3.5,
    sourceDurationSec: 3.5,
    volume: 0.55,
    fadeInSec: 0.15,
    fadeOutSec: 0.4,
  },
];

function loadSavedJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadInitialEpisodes(): Episode[] {
  try {
    const rawCurrent = localStorage.getItem(STORAGE_EPISODES_KEY);
    if (rawCurrent) {
      const parsed = JSON.parse(rawCurrent) as Episode[];
      const alreadyMergedEp22 = localStorage.getItem(STORAGE_EP22_SCENARIO_MERGE_KEY) === '1';
      if (!alreadyMergedEp22 && CATALOG_EP22) {
        return applyCatalogEpisodeScenarioUpgrade(parsed, CATALOG_EP22).episodes;
      }
      return parsed;
    }

    const seedById = new Map(INITIAL_EPISODES.map((ep) => [ep.id, ep]));

    for (const prevKey of PREV_STORAGE_EPISODES_KEYS) {
      const rawPrev = localStorage.getItem(prevKey);
      if (rawPrev) {
        const parsed = JSON.parse(rawPrev) as Episode[];
        const migrated = parsed.map((ep) => {
          const seedEp = seedById.get(ep.id);
          if (!seedEp) return ep;

          const totalWords = ep.segments.reduce(
            (acc, s) => acc + s.scriptText.replace(/\[[^\]]*\]/g, ' ').trim().split(/\s+/).filter(Boolean).length,
            0
          );
          // If an unmodified or short (< 4050 words) seeded episode exists from earlier builds, upgrade to the full 30+ min Le Précepteur script
          if (totalWords < 4050) {
            const extraSegments = ep.segments.filter(
              (s) => !seedEp.segments.some((seedSeg) => seedSeg.id === s.id)
            );
            return {
              ...seedEp,
              draftThoughts: ep.draftThoughts ?? seedEp.draftThoughts,
              status: ep.status,
              segments: [...seedEp.segments, ...extraSegments],
            };
          }
          return ep;
        });
        const existingIds = new Set(migrated.map((e) => e.id));
        const missing = INITIAL_EPISODES.filter((e) => !existingIds.has(e.id));
        return [...migrated, ...missing];
      }
    }
  } catch {
    // Fallback to seed data
  }
  return INITIAL_EPISODES;
}

function loadSavedActiveTab(): WorkspaceTab {
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE_TAB_KEY);
    if (raw === 'script' || raw === 'studio' || raw === 'prompter' || raw === 'publish') {
      return raw;
    }
  } catch {
    // Ignore storage read errors
  }
  return 'script';
}

function loadSavedActiveEpisodeId(episodes: Episode[]): string {
  try {
    const saved = localStorage.getItem(STORAGE_ACTIVE_EPISODE_KEY);
    if (saved && episodes.some((ep) => ep.id === saved)) {
      return saved;
    }
  } catch {
    // Ignore storage read errors
  }
  return episodes[0]?.id ?? INITIAL_EPISODES[0].id;
}

function persistDirtyIdsSet(dirtySet: ReadonlySet<string>): void {
  try {
    localStorage.setItem(STORAGE_DIRTY_EPISODES_KEY, JSON.stringify(Array.from(dirtySet)));
  } catch {
    // Ignore quota errors
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(loadSavedActiveTab);
  const [episodes, setEpisodes] = useState<Episode[]>(loadInitialEpisodes);
  const [activeEpisodeId, setActiveEpisodeId] = useState<string>(() =>
    loadSavedActiveEpisodeId(loadInitialEpisodes())
  );
  const [activeSegmentId, setActiveSegmentId] = useState<string>(() => {
    const list = loadInitialEpisodes();
    const initialEpId = loadSavedActiveEpisodeId(list);
    return (list.find((e) => e.id === initialEpId) ?? list[0])?.segments[0]?.id ?? INITIAL_EPISODES[0].segments[0].id;
  });
  const [mastering, setMastering] = useState<MasteringSettings>(() =>
    loadSavedJson(STORAGE_MASTERING_KEY, DEFAULT_MASTERING_SETTINGS)
  );
  const [clips, setClips] = useState<TimelineClip[]>(() =>
    loadSavedJson(STORAGE_CLIPS_KEY, INITIAL_CLIPS)
  );
  const [appearance, setAppearance] = useState<NotebookAppearance>(() => {
    const loaded = loadSavedJson(STORAGE_APPEARANCE_KEY, DEFAULT_APPEARANCE);
    if (loaded.customBannerTitle === 'PHILOA2BALLE') {
      return { ...loaded, customBannerTitle: 'PHILOA2BALLES' };
    }
    return loaded;
  });
  const [audioBuffers, setAudioBuffers] = useState<Record<string, AudioBuffer>>({});
  const [isNewEpisodeOpen, setIsNewEpisodeOpen] = useState(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [memoryNotes, setMemoryNotes] = useState<MemoryNote[]>(() =>
    sortMemoryNotesChronologically(loadSavedJson<MemoryNote[]>(STORAGE_MEMORY_NOTES_KEY, []))
  );
  const [mobileCaptureHome, setMobileCaptureHome] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [focusPromptSignal, setFocusPromptSignal] = useState(0);
  const [segmentFocusSignal, setSegmentFocusSignal] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);

  // Cloud sync state (Firebase Auth + Firestore)
  const [cloudUser, setCloudUser] = useState<User | null>(() => auth.currentUser);
  const [cloudSyncState, setCloudSyncState] = useState<CloudSyncState>(() =>
    auth.currentUser ? 'connecting' : 'connecting'
  );
  const [cloudError, setCloudError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Sync refs to coordinate optimistic local edits with Firestore real-time snapshots
  const cloudUserRef = useRef<User | null>(auth.currentUser);
  const episodesRef = useRef<Episode[]>(episodes);
  const memoryNotesRef = useRef<MemoryNote[]>(memoryNotes);
  const activeEpisodeIdRef = useRef<string>(activeEpisodeId);
  const activeTabRef = useRef<WorkspaceTab>(activeTab);
  const mobileCaptureHomeRef = useRef<boolean>(mobileCaptureHome);
  const navHistoryRef = useRef<NavRouteSnapshot[]>([]);
  const appearanceRef = useRef<NotebookAppearance>(appearance);
  const masteringRef = useRef<MasteringSettings>(mastering);
  const clipsRef = useRef<TimelineClip[]>(clips);

  episodesRef.current = episodes;
  memoryNotesRef.current = memoryNotes;
  activeEpisodeIdRef.current = activeEpisodeId;
  activeTabRef.current = activeTab;
  mobileCaptureHomeRef.current = mobileCaptureHome;
  appearanceRef.current = appearance;
  masteringRef.current = mastering;
  clipsRef.current = clips;

  const knownCloudEpisodeIdsRef = useRef<Set<string>>(new Set());
  const knownCloudNoteIdsRef = useRef<Set<string>>(new Set());
  const hasSettingsDocRef = useRef<boolean>(false);
  const lastCloudHashByIdRef = useRef<Map<string, string>>(new Map());
  const lastCloudNoteHashByIdRef = useRef<Map<string, string>>(new Map());
  const dirtyEpisodeIdsRef = useRef<Set<string>>(
    new Set(loadSavedJson<string[]>(STORAGE_DIRTY_EPISODES_KEY, []))
  );
  const inFlightEpisodeIdsRef = useRef<Set<string>>(new Set());
  const lastLocalEpisodeEditAtRef = useRef<Map<string, number>>(new Map());
  const dirtyNoteIdsRef = useRef<Set<string>>(new Set());
  const deletedNoteIdsRef = useRef<Set<string>>(new Set());
  const episodeLocalSaveTimerRef = useRef<number | null>(null);
  const episodeFlushTimerRef = useRef<number | null>(null);
  const settingsFlushTimerRef = useRef<number | null>(null);
  const applyingCloudSettingsRef = useRef<boolean>(false);
  const settingsSyncReadyRef = useRef<boolean>(false);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  }, []);

  // Build built-in demo voice & 6 concrete sound cues on mount + restore user audio blobs from IndexedDB
  useEffect(() => {
    let cancelled = false;
    const initBuffers = async () => {
      try {
        const offlineFactory = new OfflineAudioContext(1, 1, 44100);
        const builtIn: Record<string, AudioBuffer> = {
          demo_voice_take: createDemoVoiceBuffer(offlineFactory),
        };
        for (const cue of SOUND_EXTRACTS) {
          builtIn[cue.id] = createSoundExtractBuffer(offlineFactory, cue.id);
        }

        // Restore any custom recorded/imported blobs referenced in saved clips
        for (const clip of clips) {
          if (!builtIn[clip.audioKey]) {
            const blob = await loadAudioBlob(clip.audioKey);
            if (blob) {
              const arr = await blob.arrayBuffer();
              const decoded = await offlineFactory.decodeAudioData(arr);
              builtIn[clip.audioKey] = decoded;
            }
          }
        }

        if (!cancelled) {
          setAudioBuffers(builtIn);
        }
      } catch {
        // Ignore if Web Audio unavailable in headless SSR
      }
    };

    initBuffers();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flushEpisodesToLocalStorage = useCallback(() => {
    if (episodeLocalSaveTimerRef.current !== null) {
      window.clearTimeout(episodeLocalSaveTimerRef.current);
      episodeLocalSaveTimerRef.current = null;
    }
    try {
      localStorage.setItem(STORAGE_EPISODES_KEY, JSON.stringify(episodesRef.current));
    } catch {
      // Ignore quota errors
    }
  }, []);

  // Persist episodes to localStorage debounced so rapid typing never stalls the main thread
  useEffect(() => {
    if (episodeLocalSaveTimerRef.current !== null) {
      window.clearTimeout(episodeLocalSaveTimerRef.current);
    }
    episodeLocalSaveTimerRef.current = window.setTimeout(() => {
      episodeLocalSaveTimerRef.current = null;
      try {
        localStorage.setItem(STORAGE_EPISODES_KEY, JSON.stringify(episodesRef.current));
      } catch {
        // Ignore quota errors
      }
    }, 600);
    return () => {
      if (episodeLocalSaveTimerRef.current !== null) {
        window.clearTimeout(episodeLocalSaveTimerRef.current);
        episodeLocalSaveTimerRef.current = null;
      }
    };
  }, [episodes]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MASTERING_KEY, JSON.stringify(mastering));
    } catch {
      // Ignore quota errors
    }
  }, [mastering]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CLIPS_KEY, JSON.stringify(clips));
    } catch {
      // Ignore quota errors
    }
  }, [clips]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_APPEARANCE_KEY, JSON.stringify(appearance));
    } catch {
      // Ignore quota errors
    }
  }, [appearance]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MEMORY_NOTES_KEY, JSON.stringify(memoryNotes));
    } catch {
      // Ignore quota errors
    }
  }, [memoryNotes]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACTIVE_EPISODE_KEY, activeEpisodeId);
    } catch {
      // Ignore quota errors
    }
  }, [activeEpisodeId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACTIVE_TAB_KEY, activeTab);
    } catch {
      // Ignore quota errors
    }
  }, [activeTab]);

  const formatCloudError = useCallback((error: unknown): string => {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Quota exceeded')) {
      return 'Quota Firestore quotidien atteint — vos données restent sauvegardées localement et reprendront demain.';
    }
    if (msg.includes('offline') || msg.includes('network-request-failed')) {
      return 'Connexion réseau indisponible. Vos modifications sont conservées localement et seront synchronisées dès le retour du réseau.';
    }
    return 'Erreur de synchronisation cloud. Vos modifications restent sauvegardées sur cet appareil.';
  }, []);

  const flushDirtyEpisodes = useCallback(async () => {
    const user = cloudUserRef.current;
    if (!user || dirtyEpisodeIdsRef.current.size === 0) return;

    const idsToFlush = Array.from(dirtyEpisodeIdsRef.current);
    dirtyEpisodeIdsRef.current.clear();
    persistDirtyIdsSet(dirtyEpisodeIdsRef.current);
    idsToFlush.forEach((id) => inFlightEpisodeIdsRef.current.add(id));
    setCloudSyncState('syncing');

    try {
      for (const epId of idsToFlush) {
        const ep = episodesRef.current.find((item) => item.id === epId);
        if (!ep) continue;
        const safeId = sanitizeDocId(ep.id, 'ep');
        const exists = knownCloudEpisodeIdsRef.current.has(safeId);
        const savedId = await saveEpisodeToCloud(user.uid, ep, exists);
        knownCloudEpisodeIdsRef.current.add(savedId);
        lastCloudHashByIdRef.current.set(ep.id, computeEpisodeContentHash(ep));
      }
      setCloudSyncState('synced');
      setCloudError(null);
    } catch (error) {
      for (const epId of idsToFlush) {
        dirtyEpisodeIdsRef.current.add(epId);
      }
      persistDirtyIdsSet(dirtyEpisodeIdsRef.current);
      setCloudSyncState('error');
      setCloudError(formatCloudError(error));
    } finally {
      idsToFlush.forEach((id) => inFlightEpisodeIdsRef.current.delete(id));
    }
  }, [formatCloudError]);

  const scheduleEpisodeCloudFlush = useCallback(
    (episodeId: string) => {
      lastLocalEpisodeEditAtRef.current.set(episodeId, Date.now());
      dirtyEpisodeIdsRef.current.add(episodeId);
      persistDirtyIdsSet(dirtyEpisodeIdsRef.current);
      if (!cloudUserRef.current) return;
      if (episodeFlushTimerRef.current !== null) {
        window.clearTimeout(episodeFlushTimerRef.current);
      }
      episodeFlushTimerRef.current = window.setTimeout(() => {
        episodeFlushTimerRef.current = null;
        void flushDirtyEpisodes();
      }, 900);
    },
    [flushDirtyEpisodes]
  );

  // Flush pending localStorage + cloud episode writes when user backgrounds mobile browser or closes tab
  useEffect(() => {
    const handleVisibilityOrHide = () => {
      if (document.visibilityState === 'hidden') {
        flushEpisodesToLocalStorage();
        if (dirtyEpisodeIdsRef.current.size > 0) {
          if (episodeFlushTimerRef.current !== null) {
            window.clearTimeout(episodeFlushTimerRef.current);
            episodeFlushTimerRef.current = null;
          }
          void flushDirtyEpisodes();
        }
      }
    };
    const handlePageHideOrUnload = () => {
      flushEpisodesToLocalStorage();
      if (dirtyEpisodeIdsRef.current.size > 0) {
        if (episodeFlushTimerRef.current !== null) {
          window.clearTimeout(episodeFlushTimerRef.current);
          episodeFlushTimerRef.current = null;
        }
        void flushDirtyEpisodes();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrHide);
    window.addEventListener('pagehide', handlePageHideOrUnload);
    window.addEventListener('beforeunload', handlePageHideOrUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrHide);
      window.removeEventListener('pagehide', handlePageHideOrUnload);
      window.removeEventListener('beforeunload', handlePageHideOrUnload);
    };
  }, [flushDirtyEpisodes, flushEpisodesToLocalStorage]);

  // Listen to Firebase Auth state (awaiting persistent IndexedDB hydration) & sync Firestore cleanly
  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;
    let unsubAuth: (() => void) | null = null;
    let cancelled = false;

    const setupAuthAndSync = async () => {
      await authPersistenceReady;
      if (typeof auth.authStateReady === 'function') {
        await auth.authStateReady().catch(() => undefined);
      }
      await getRedirectResult(auth).catch(() => null);
      if (cancelled) return;

      unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
        if (unsubFirestore) {
          unsubFirestore();
          unsubFirestore = null;
        }

        cloudUserRef.current = firebaseUser;
        setCloudUser(firebaseUser);
        settingsSyncReadyRef.current = false;

        if (!firebaseUser) {
          knownCloudEpisodeIdsRef.current = new Set();
          knownCloudNoteIdsRef.current = new Set();
          hasSettingsDocRef.current = false;
          lastCloudHashByIdRef.current = new Map();
          lastCloudNoteHashByIdRef.current = new Map();
          setCloudSyncState('signed_out');
          return;
        }

        try {
          localStorage.setItem(STORAGE_CLOUD_LINKED_ONCE_KEY, '1');
        } catch {
          // Ignore quota errors
        }

        setCloudSyncState('connecting');
        setCloudError(null);

        try {
          await ensureUserProfile(firebaseUser);
          if (cancelled) return;

          const initial = await fetchInitialCloudState(firebaseUser.uid);
          if (cancelled) return;

          knownCloudEpisodeIdsRef.current = initial.existingEpisodeIds;
          knownCloudNoteIdsRef.current = initial.existingMemoryNoteIds;
          hasSettingsDocRef.current = initial.hasSettingsDoc;

          let alreadySeeded18to20 = false;
          let alreadySeeded21 = false;
          let alreadySeeded22to24 = false;
          let alreadyMergedEp22Scenario = false;
          try {
            alreadySeeded18to20 = localStorage.getItem(STORAGE_AUTOSEED_EP18_20_KEY) === '1';
            alreadySeeded21 = localStorage.getItem(STORAGE_AUTOSEED_EP21_KEY) === '1';
            alreadySeeded22to24 = localStorage.getItem(STORAGE_AUTOSEED_EP22_24_KEY) === '1';
            alreadyMergedEp22Scenario = localStorage.getItem(STORAGE_EP22_SCENARIO_MERGE_KEY) === '1';
          } catch {
            alreadySeeded18to20 = false;
            alreadySeeded21 = false;
            alreadySeeded22to24 = false;
            alreadyMergedEp22Scenario = false;
          }
          const autoSeedIds = new Set<string>();
          if (!alreadySeeded18to20) {
            for (const id of NEW_CATALOG_EPISODE_IDS) autoSeedIds.add(id);
          }
          if (!alreadySeeded21) {
            autoSeedIds.add('ep-21-morale-trottoir');
          }
          if (!alreadySeeded22to24) {
            for (const id of NEW_EP22_24_IDS) autoSeedIds.add(id);
          }

          const initialMerge = mergeEpisodesOnInitialSync(
            episodesRef.current,
            initial.episodes,
            autoSeedIds,
            dirtyEpisodeIdsRef.current
          );

          let merged = initialMerge.merged;
          const toUploadToCloud = [...initialMerge.toUploadToCloud];

          if (!alreadyMergedEp22Scenario && CATALOG_EP22) {
            const ep22Upgrade = applyCatalogEpisodeScenarioUpgrade(merged, CATALOG_EP22);
            merged = ep22Upgrade.episodes;
            if (
              ep22Upgrade.upgradedEpisode &&
              !toUploadToCloud.some((ep) => ep.id === ep22Upgrade.upgradedEpisode?.id)
            ) {
              toUploadToCloud.push(ep22Upgrade.upgradedEpisode);
            }
          }

          if (toUploadToCloud.length > 0) {
            setCloudSyncState('syncing');
            await uploadEpisodesBatchToCloud(
              firebaseUser.uid,
              toUploadToCloud,
              knownCloudEpisodeIdsRef.current
            );
            for (const uploaded of toUploadToCloud) {
              dirtyEpisodeIdsRef.current.delete(uploaded.id);
              dirtyEpisodeIdsRef.current.delete(sanitizeDocId(uploaded.id, 'ep'));
            }
            persistDirtyIdsSet(dirtyEpisodeIdsRef.current);
          }

        try {
          if (!alreadySeeded18to20) {
            localStorage.setItem(STORAGE_AUTOSEED_EP18_20_KEY, '1');
          }
          if (!alreadySeeded21) {
            localStorage.setItem(STORAGE_AUTOSEED_EP21_KEY, '1');
          }
          if (!alreadySeeded22to24) {
            localStorage.setItem(STORAGE_AUTOSEED_EP22_24_KEY, '1');
          }
          if (!alreadyMergedEp22Scenario) {
            localStorage.setItem(STORAGE_EP22_SCENARIO_MERGE_KEY, '1');
          }
        } catch {
          // Ignore quota errors
        }

        if (cancelled) return;

        const hashMap = new Map<string, string>();
        for (const ep of merged) {
          hashMap.set(ep.id, computeEpisodeContentHash(ep));
        }
        lastCloudHashByIdRef.current = hashMap;
        setEpisodes(merged);

        const noteMerge = mergeMemoryNotesOnInitialSync(
          memoryNotesRef.current,
          initial.memoryNotes
        );
        if (noteMerge.toUploadToCloud.length > 0) {
          setCloudSyncState('syncing');
          await uploadMemoryNotesBatchToCloud(
            firebaseUser.uid,
            noteMerge.toUploadToCloud,
            knownCloudNoteIdsRef.current
          );
        }
        if (cancelled) return;
        const noteHashMap = new Map<string, string>();
        for (const mn of noteMerge.merged) {
          noteHashMap.set(mn.id, computeMemoryNoteHash(mn));
        }
        lastCloudNoteHashByIdRef.current = noteHashMap;
        setMemoryNotes(noteMerge.merged);

        if (initial.settings) {
          applyingCloudSettingsRef.current = true;
          if (initial.settings.appearance) setAppearance(initial.settings.appearance);
          if (initial.settings.mastering) setMastering(initial.settings.mastering);
          if (initial.settings.clips.length > 0) setClips(initial.settings.clips);
          if (
            initial.settings.activeEpisodeId &&
            merged.some((ep) => ep.id === initial.settings?.activeEpisodeId)
          ) {
            setActiveEpisodeId(initial.settings.activeEpisodeId);
          }
          window.setTimeout(() => {
            applyingCloudSettingsRef.current = false;
          }, 50);
        } else {
          await saveStudioSettingsToCloud(
            firebaseUser.uid,
            {
              activeEpisodeId: merged[0]?.id ?? activeEpisodeIdRef.current,
              appearance: appearanceRef.current,
              mastering: masteringRef.current,
              clips: clipsRef.current,
            },
            false
          );
          hasSettingsDocRef.current = true;
        }

        if (cancelled) return;
        settingsSyncReadyRef.current = true;

        unsubFirestore = subscribeToUserCloudData(firebaseUser.uid, {
          onEpisodesSnapshot: (cloudEps, ids, hasPendingWrites) => {
            knownCloudEpisodeIdsRef.current = ids;
            if (hasPendingWrites || cloudEps.length === 0) return;

            setEpisodes((prevLocal) => {
              const localById = new Map(prevLocal.map((e) => [e.id, e]));
              let changed = false;

              const nextList = cloudEps.map((cloudEp) => {
                // Keep unsaved, in-flight, or recently edited local episodes intact while typing
                const lastLocalEditAt = lastLocalEpisodeEditAtRef.current.get(cloudEp.id) ?? 0;
                const recentlyEditedLocally = Date.now() - lastLocalEditAt < 4000;
                if (
                  dirtyEpisodeIdsRef.current.has(cloudEp.id) ||
                  inFlightEpisodeIdsRef.current.has(cloudEp.id) ||
                  recentlyEditedLocally
                ) {
                  return localById.get(cloudEp.id) ?? cloudEp;
                }
                const cloudHash = computeEpisodeContentHash(cloudEp);
                const prevHash = lastCloudHashByIdRef.current.get(cloudEp.id);
                const localEp = localById.get(cloudEp.id);
                if (!localEp || prevHash !== cloudHash) {
                  lastCloudHashByIdRef.current.set(cloudEp.id, cloudHash);
                  if (!localEp || computeEpisodeContentHash(localEp) !== cloudHash) {
                    changed = true;
                    return cloudEp;
                  }
                }
                return localEp;
              });

              if (nextList.length !== prevLocal.length) {
                changed = true;
              }
              return changed ? nextList : prevLocal;
            });
            setCloudSyncState('synced');
          },
          onMemoryNotesSnapshot: (cloudNotes, ids, hasPendingWrites) => {
            knownCloudNoteIdsRef.current = ids;
            if (hasPendingWrites) return;
            setMemoryNotes((prevLocal) => {
              const localById = new Map(prevLocal.map((n) => [n.id, n]));
              const mergedMap = new Map<string, MemoryNote>();

              for (const cn of cloudNotes) {
                if (deletedNoteIdsRef.current.has(cn.id)) continue;
                if (dirtyNoteIdsRef.current.has(cn.id) && localById.has(cn.id)) {
                  mergedMap.set(cn.id, localById.get(cn.id)!);
                } else {
                  lastCloudNoteHashByIdRef.current.set(cn.id, computeMemoryNoteHash(cn));
                  mergedMap.set(cn.id, cn);
                }
              }

              for (const ln of prevLocal) {
                if (dirtyNoteIdsRef.current.has(ln.id) && !mergedMap.has(ln.id)) {
                  mergedMap.set(ln.id, ln);
                }
              }

              const nextList = sortMemoryNotesChronologically(Array.from(mergedMap.values()));
              if (
                nextList.length === prevLocal.length &&
                nextList.every((n, i) => computeMemoryNoteHash(n) === computeMemoryNoteHash(prevLocal[i]))
              ) {
                return prevLocal;
              }
              return nextList;
            });
            setCloudSyncState('synced');
          },
          onSettingsSnapshot: (cloudSettings, hasPendingWrites) => {
            hasSettingsDocRef.current = true;
            if (hasPendingWrites) return;
            applyingCloudSettingsRef.current = true;
            if (cloudSettings.appearance) setAppearance(cloudSettings.appearance);
            if (cloudSettings.mastering) setMastering(cloudSettings.mastering);
            if (cloudSettings.clips.length > 0) setClips(cloudSettings.clips);
            window.setTimeout(() => {
              applyingCloudSettingsRef.current = false;
            }, 50);
          },
          onError: (err) => {
            setCloudSyncState('error');
            setCloudError(formatCloudError(err));
          },
        });

        setCloudSyncState('synced');
      } catch (error) {
        if (!cancelled) {
          setCloudSyncState('error');
          setCloudError(formatCloudError(error));
        }
      }
      });
    };

    void setupAuthAndSync();

    return () => {
      cancelled = true;
      if (unsubAuth) unsubAuth();
      if (unsubFirestore) unsubFirestore();
      if (episodeFlushTimerRef.current !== null) {
        window.clearTimeout(episodeFlushTimerRef.current);
      }
      if (settingsFlushTimerRef.current !== null) {
        window.clearTimeout(settingsFlushTimerRef.current);
      }
    };
  }, [formatCloudError]);

  // Sync appearance, mastering, clips, and activeEpisodeId to cloud when signed in
  useEffect(() => {
    const user = cloudUserRef.current;
    if (!user || !settingsSyncReadyRef.current || applyingCloudSettingsRef.current) return;

    if (settingsFlushTimerRef.current !== null) {
      window.clearTimeout(settingsFlushTimerRef.current);
    }
    settingsFlushTimerRef.current = window.setTimeout(() => {
      settingsFlushTimerRef.current = null;
      const currentUser = cloudUserRef.current;
      if (!currentUser) return;
      void saveStudioSettingsToCloud(
        currentUser.uid,
        {
          activeEpisodeId,
          appearance,
          mastering,
          clips,
        },
        hasSettingsDocRef.current
      )
        .then(() => {
          hasSettingsDocRef.current = true;
        })
        .catch((err) => {
          setCloudSyncState('error');
          setCloudError(formatCloudError(err));
        });
    }, 650);
  }, [activeEpisodeId, appearance, mastering, clips, formatCloudError]);

  const handleSignInWithGoogle = async () => {
    setCloudError(null);
    setCloudSyncState('connecting');
    flushEpisodesToLocalStorage();
    try {
      await authPersistenceReady;
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = (error as { code?: string })?.code ?? '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          setCloudSyncState('signed_out');
          setCloudError(formatCloudError(redirectError));
          return;
        }
      }
      setCloudSyncState('signed_out');
      if (code === 'auth/popup-closed-by-user') {
        setCloudError('Connexion annulée.');
      } else {
        setCloudError(formatCloudError(error));
      }
    }
  };

  const handleSignOut = async () => {
    flushEpisodesToLocalStorage();
    if (dirtyEpisodeIdsRef.current.size > 0) {
      await flushDirtyEpisodes();
    }
    try {
      await signOut(auth);
      setCloudError(null);
      setCloudSyncState('signed_out');
    } catch (error) {
      setCloudError(formatCloudError(error));
    }
  };

  const activeEpisode =
    episodes.find((ep) => ep.id === activeEpisodeId) ?? episodes[0];

  const handleSelectEpisode = (epId: string) => {
    flushEpisodesToLocalStorage();
    if (dirtyEpisodeIdsRef.current.size > 0) {
      void flushDirtyEpisodes();
    }
    setActiveEpisodeId(epId);
    const found = episodesRef.current.find((e) => e.id === epId);
    if (found?.segments[0]) {
      setActiveSegmentId(found.segments[0].id);
    }
  };

  const handleUpdateEpisode = useCallback(
    (updated: Episode) => {
      lastLocalEpisodeEditAtRef.current.set(updated.id, Date.now());
      setEpisodes((prev) => prev.map((ep) => (ep.id === updated.id ? updated : ep)));
      scheduleEpisodeCloudFlush(updated.id);
    },
    [scheduleEpisodeCloudFlush]
  );

  const handleCreateEpisode = (created: Episode) => {
    setEpisodes((prev) => [created, ...prev]);
    setActiveEpisodeId(created.id);
    if (created.segments[0]) {
      setActiveSegmentId(created.segments[0].id);
    }
    navigateTo({ mobileHome: false, tab: 'script' });
    scheduleEpisodeCloudFlush(created.id);
  };

  const persistMemoryNoteToCloud = useCallback(
    async (note: MemoryNote) => {
      const user = cloudUserRef.current;
      if (!user) return;
      dirtyNoteIdsRef.current.add(note.id);
      setCloudSyncState('syncing');
      try {
        const safeId = sanitizeDocId(note.id, 'mnote');
        const exists = knownCloudNoteIdsRef.current.has(safeId);
        const savedId = await saveMemoryNoteToCloud(user.uid, note, exists);
        knownCloudNoteIdsRef.current.add(savedId);
        lastCloudNoteHashByIdRef.current.set(note.id, computeMemoryNoteHash(note));
        setCloudSyncState('synced');
        setCloudError(null);
      } catch (error) {
        setCloudSyncState('error');
        setCloudError(formatCloudError(error));
      } finally {
        dirtyNoteIdsRef.current.delete(note.id);
      }
    },
    [formatCloudError]
  );

  const handleAddMemoryNote = useCallback(
    (content: string) => {
      const now = new Date().toISOString();
      const note: MemoryNote = {
        id: `mnote-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        content,
        createdAt: now,
        updatedAt: now,
      };
      setMemoryNotes((prev) => sortMemoryNotesChronologically([...prev, note]));
      void persistMemoryNoteToCloud(note);
    },
    [persistMemoryNoteToCloud]
  );

  const handleUpdateMemoryNote = useCallback(
    (noteId: string, content: string) => {
      const now = new Date().toISOString();
      const { updatedNote } = applyMemoryNoteContentUpdate(
        memoryNotesRef.current,
        noteId,
        content,
        now
      );
      setMemoryNotes((prev) =>
        applyMemoryNoteContentUpdate(prev, noteId, content, now).nextNotes
      );
      if (updatedNote) {
        void persistMemoryNoteToCloud(updatedNote);
      }
    },
    [persistMemoryNoteToCloud]
  );

  const handleDeleteMemoryNote = useCallback(
    (noteId: string) => {
      setMemoryNotes((prev) => prev.filter((n) => n.id !== noteId));
      const user = cloudUserRef.current;
      if (!user) return;
      deletedNoteIdsRef.current.add(noteId);
      setCloudSyncState('syncing');
      void deleteMemoryNoteFromCloud(user.uid, noteId)
        .then(() => {
          knownCloudNoteIdsRef.current.delete(sanitizeDocId(noteId, 'mnote'));
          setCloudSyncState('synced');
        })
        .catch((error) => {
          deletedNoteIdsRef.current.delete(noteId);
          setCloudSyncState('error');
          setCloudError(formatCloudError(error));
        });
    },
    [formatCloudError]
  );

  const handleAssignNoteToEpisode = useCallback(
    (
      noteId: string,
      episodeId: string,
      forcedSegmentId?: string
    ): { segmentId: string; segmentTitle: string } | null => {
      const note = memoryNotesRef.current.find((n) => n.id === noteId);
      const targetEp = episodesRef.current.find((ep) => ep.id === episodeId);
      if (!note || !targetEp) return null;

      const { episode: updatedEp, plan } = insertThoughtIntelligently(targetEp, note.content, {
        forcedSegmentId,
        clearDraft: false,
      });
      if (!plan) return null;

      lastLocalEpisodeEditAtRef.current.set(updatedEp.id, Date.now());
      setEpisodes((prev) => prev.map((ep) => (ep.id === updatedEp.id ? updatedEp : ep)));
      scheduleEpisodeCloudFlush(updatedEp.id);

      const now = new Date().toISOString();
      const label = `Ép. ${targetEp.number} · Seg. ${String(plan.targetSegmentIndex).padStart(2, '0')}`;
      const assignment = {
        episodeId: targetEp.id,
        segmentId: plan.targetSegmentId,
        episodeLabel: label,
      };
      const { updatedNote } = applyMemoryNoteAssignment(
        memoryNotesRef.current,
        noteId,
        assignment,
        now
      );
      setMemoryNotes((prev) =>
        applyMemoryNoteAssignment(prev, noteId, assignment, now).nextNotes
      );
      if (updatedNote) {
        void persistMemoryNoteToCloud(updatedNote);
      }

      return {
        segmentId: plan.targetSegmentId,
        segmentTitle: plan.targetSegmentTitle,
      };
    },
    [persistMemoryNoteToCloud, scheduleEpisodeCloudFlush]
  );

  const navigateTo = useCallback((next: NavRouteSnapshot) => {
    const current: NavRouteSnapshot = {
      mobileHome: mobileCaptureHomeRef.current,
      tab: activeTabRef.current,
    };
    const nextStack = pushNavRoute(navHistoryRef.current, current, next);
    if (nextStack !== navHistoryRef.current) {
      navHistoryRef.current = nextStack;
      setCanGoBack(nextStack.length > 0);
      try {
        window.history.pushState({ philoNav: next }, '');
      } catch {
        // Ignore history restrictions in sandboxed frames
      }
    }
    setActiveTab(next.tab);
    setMobileCaptureHome(next.mobileHome);
  }, []);

  const handleStepBack = useCallback(() => {
    const popped = popNavRoute(navHistoryRef.current);
    if (popped.target) {
      navHistoryRef.current = popped.nextStack;
      setCanGoBack(popped.nextStack.length > 0);
      setActiveTab(popped.target.tab);
      setMobileCaptureHome(popped.target.mobileHome);
      return;
    }

    const isNarrowViewport = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isNarrowViewport && !mobileCaptureHomeRef.current) {
      setMobileCaptureHome(true);
      setCanGoBack(false);
      return;
    }
    if (activeTabRef.current !== 'script') {
      setActiveTab('script');
      setCanGoBack(false);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      handleStepBack();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [handleStepBack]);

  const canSwipeBackHere = canGoBack || !mobileCaptureHome || activeTab !== 'script';
  const { swipePreviewPx } = useSwipeBackNavigation({
    enabled: !isMobileDrawerOpen && !isNewEpisodeOpen && !isAppearanceOpen,
    canGoBack: canSwipeBackHere,
    onSwipeBack: handleStepBack,
  });

  const handleSelectEpisodeSegmentFromMobile = useCallback(
    (epId: string, segId: string) => {
      setActiveEpisodeId(epId);
      setActiveSegmentId(segId);
      navigateTo({ mobileHome: false, tab: 'script' });
      setSegmentFocusSignal((s) => s + 1);
    },
    [navigateTo]
  );

  const handleOpenEpisodePrompter = useCallback(
    (epId?: string) => {
      if (epId) {
        setActiveEpisodeId(epId);
        const found = episodesRef.current.find((e) => e.id === epId);
        if (found?.segments[0]) {
          setActiveSegmentId(found.segments[0].id);
        }
      }
      navigateTo({ mobileHome: false, tab: 'prompter' });
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [navigateTo]
  );

  const handleRegisterAudioBuffer = useCallback(
    (key: string, buffer: AudioBuffer, blob?: Blob) => {
      setAudioBuffers((prev) => ({ ...prev, [key]: buffer }));
      if (blob) {
        void saveAudioBlob(key, blob);
      }
    },
    []
  );

  const handlePreviewSoundCue = useCallback(
    async (cueId: string) => {
      const buf = audioBuffers[cueId];
      if (!buf) return;
      try {
        if (previewSourceRef.current) {
          previewSourceRef.current.stop();
          previewSourceRef.current.disconnect();
        }
      } catch {
        // Ignore
      }
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = 0.7;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      previewSourceRef.current = src;
    },
    [audioBuffers, getAudioContext]
  );

  const handleSaveRecordedBlob = async (blob: Blob, label: string) => {
    const ctx = getAudioContext();
    const arr = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arr);
    const key = `take_${Date.now()}`;
    handleRegisterAudioBuffer(key, decoded, blob);

    const nextStart = clips.reduce(
      (m, c) =>
        c.track === 'voix'
          ? Math.max(m, c.startOnTimelineSec + (c.trimEndSec - c.trimStartSec))
          : m,
      0
    );
    const newClip: TimelineClip = {
      id: `clip-${Date.now()}`,
      label,
      track: 'voix',
      sourceType: 'take',
      audioKey: key,
      startOnTimelineSec: Number(nextStart.toFixed(2)),
      trimStartSec: 0,
      trimEndSec: Number(decoded.duration.toFixed(2)),
      sourceDurationSec: Number(decoded.duration.toFixed(2)),
      volume: 1.0,
      fadeInSec: 0.08,
      fadeOutSec: 0.12,
      segmentId: activeSegmentId,
    };
    setClips((prev) => [...prev, newClip]);
  };

  const nextEpisodeNumber = String(episodes.length + 1).padStart(2, '0');

  return (
    <div className="min-h-screen bg-[#F6F5F0] text-[#18181B]">
      {swipePreviewPx > 6 && (
        <div
          aria-hidden="true"
          style={{
            transform: `translate3d(${Math.min(28, swipePreviewPx - 8)}px, -50%, 0)`,
            opacity: Math.min(1, swipePreviewPx / 38),
          }}
          className="fixed left-1 top-1/2 z-50 w-10 h-10 rounded-full bg-[#18181B]/90 text-white shadow-lg flex items-center justify-center pointer-events-none transition-opacity"
        >
          <ChevronLeft className="w-5 h-5 text-[#F59E0B]" />
        </div>
      )}

      <TopBar
        brandTitle={appearance.customBannerTitle || 'PHILOA2BALLES'}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          navigateTo({ mobileHome: false, tab });
          window.scrollTo({ top: 0, behavior: 'auto' });
        }}
        onCreateEpisode={() => setIsNewEpisodeOpen(true)}
        onOpenMobileMenu={() => setIsMobileDrawerOpen(true)}
        onReturnMobileHome={() => {
          navigateTo({ mobileHome: true, tab: activeTab });
          setFocusPromptSignal((s) => s + 1);
          window.scrollTo({ top: 0, behavior: 'auto' });
        }}
        cloudUser={
          cloudUser
            ? {
                uid: cloudUser.uid,
                displayName: cloudUser.displayName,
                email: cloudUser.email,
                photoURL: cloudUser.photoURL,
              }
            : null
        }
        cloudSyncState={cloudSyncState}
        cloudError={cloudError}
        onDismissCloudError={() => setCloudError(null)}
        onSignIn={handleSignInWithGoogle}
        onSignOut={handleSignOut}
      />

      {mobileCaptureHome && activeEpisode && (
        <MobileGeminiHome
          episodes={episodes}
          activeEpisode={activeEpisode}
          memoryNotes={memoryNotes}
          isCloudSignedIn={Boolean(cloudUser)}
          focusPromptSignal={focusPromptSignal}
          onAddMemoryNote={handleAddMemoryNote}
          onUpdateMemoryNote={handleUpdateMemoryNote}
          onDeleteMemoryNote={handleDeleteMemoryNote}
          onAssignNoteToEpisode={handleAssignNoteToEpisode}
          onOpenSegmentToRework={handleSelectEpisodeSegmentFromMobile}
          onOpenPrompter={handleOpenEpisodePrompter}
          onOpenDrawer={() => setIsMobileDrawerOpen(true)}
        />
      )}

      <div className={mobileCaptureHome ? 'hidden md:block flex-1' : 'flex-1'}>
        {activeTab === 'script' && activeEpisode && (
          <ScriptWorkspace
            episodes={episodes}
            activeEpisode={activeEpisode}
            activeSegmentId={activeSegmentId}
            appearance={appearance}
            onOpenAppearance={() => setIsAppearanceOpen(true)}
            onOpenLogoStudio={() => {
              navigateTo({ mobileHome: false, tab: 'publish' });
            }}
            onSelectEpisode={handleSelectEpisode}
            onSelectSegment={setActiveSegmentId}
            onUpdateEpisode={handleUpdateEpisode}
            onPreviewSoundCue={handlePreviewSoundCue}
            onRecordSegment={(segId) => {
              setActiveSegmentId(segId);
              navigateTo({ mobileHome: false, tab: 'studio' });
              window.scrollTo({ top: 0, behavior: 'auto' });
            }}
            onOpenPrompter={() => {
              navigateTo({ mobileHome: false, tab: 'prompter' });
              window.scrollTo({ top: 0, behavior: 'auto' });
            }}
            segmentFocusSignal={segmentFocusSignal}
          />
        )}

        {activeTab === 'studio' && activeEpisode && (
          <AudioMasteringStudio
            episode={activeEpisode}
            activeSegmentId={activeSegmentId}
            onSelectSegment={setActiveSegmentId}
            mastering={mastering}
            onChangeMastering={setMastering}
            clips={clips}
            onChangeClips={setClips}
            audioBuffers={audioBuffers}
            onRegisterAudioBuffer={handleRegisterAudioBuffer}
            onPreviewSoundCue={handlePreviewSoundCue}
            getAudioContext={getAudioContext}
          />
        )}

        {activeTab === 'prompter' && activeEpisode && (
          <TeleprompterView
            episode={activeEpisode}
            appearance={appearance}
            onUpdateEpisode={handleUpdateEpisode}
            onPreviewSoundCue={handlePreviewSoundCue}
            onSaveRecordedBlob={handleSaveRecordedBlob}
          />
        )}

        {activeTab === 'publish' && activeEpisode && (
          <PublishView
            episode={activeEpisode}
            brandTitle={appearance.customBannerTitle || 'PHILOA2BALLES'}
            onUpdateEpisode={handleUpdateEpisode}
            clips={clips}
            audioBuffers={audioBuffers}
            mastering={mastering}
          />
        )}
      </div>

      <MobileNavDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        brandTitle={appearance.customBannerTitle || 'PHILOA2BALLES'}
        activeTab={activeTab}
        isMobileCaptureHome={mobileCaptureHome}
        episodes={episodes}
        activeEpisodeId={activeEpisode?.id ?? ''}
        activeSegmentId={activeSegmentId}
        memoryNotesCount={memoryNotes.length}
        onOpenCaptureHome={() => {
          navigateTo({ mobileHome: true, tab: activeTab });
          setFocusPromptSignal((s) => s + 1);
        }}
        onSelectTab={(tab) => {
          navigateTo({ mobileHome: false, tab });
          window.scrollTo({ top: 0, behavior: 'auto' });
        }}
        onSelectEpisodeSegment={handleSelectEpisodeSegmentFromMobile}
        onOpenEpisodePrompter={(epId) => handleOpenEpisodePrompter(epId)}
        onCreateEpisode={() => setIsNewEpisodeOpen(true)}
      />

      <NewEpisodeModal
        isOpen={isNewEpisodeOpen}
        nextNumber={nextEpisodeNumber}
        onClose={() => setIsNewEpisodeOpen(false)}
        onCreate={handleCreateEpisode}
      />

      <AppearanceDrawer
        isOpen={isAppearanceOpen}
        appearance={appearance}
        onChange={setAppearance}
        onClose={() => setIsAppearanceOpen(false)}
      />
    </div>
  );
}
