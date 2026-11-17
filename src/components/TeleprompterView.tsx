import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  GitBranch,
  Headphones,
  Mic,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  StickyNote,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import type { Episode, NotebookAppearance } from '../types/podcast';
import { useAdaptiveTrigger } from '../hooks/useAdaptiveTrigger';
import { formatTimecode } from '../utils/audioDsp';
import { insertThoughtIntelligently } from '../utils/episodeStore';
import {
  adjustThoughtToEpisodeThread,
  detectDraftConceptMatches,
  planSmartDraftPlacement,
} from '../utils/frenchPolisher';
import {
  buildChunkKaraokeTimings,
  resolveActiveKaraokeWord,
  resolveKaraokeWordAtCharIndex,
  sliceTextForKaraoke,
  type KaraokeActiveMatch,
  type KaraokeWordTiming,
} from '../utils/karaokeAlignment';
import { splitTextWithAnnotations } from '../utils/wordAnnotations';
import {
  buildEpisodeNarrationQueue,
  findChunkSpanInScript,
  PRECEPTEUR_PACE_CONFIG,
  selectBestFrenchVoice,
  type NarrationChunk,
  type PrecepteurPace,
  type PrecepteurVoiceEngineMode,
} from '../utils/precepteurNarration';
import { createSilentWavBlob, renderWarmPrecepteurWavBlob } from '../utils/wavAudioEncoder';

interface TeleprompterViewProps {
  episode: Episode;
  appearance: NotebookAppearance;
  onUpdateEpisode: (updated: Episode) => void;
  onPreviewSoundCue: (cueId: string) => void;
  onSaveRecordedBlob: (blob: Blob, label: string) => Promise<void>;
}

type VoicePlaybackState = 'idle' | 'loading' | 'playing' | 'paused';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

interface CachedWavEntry {
  url: string;
  speechDurationSec: number;
  totalDurationSec: number;
}

export function TeleprompterView({
  episode,
  appearance,
  onUpdateEpisode,
  onPreviewSoundCue,
  onSaveRecordedBlob,
}: TeleprompterViewProps) {
  const [isScrolling, setIsScrolling] = useState(false);
  const [speedWpm, setSpeedWpm] = useState(140);
  const [fontSizePx, setFontSizePx] = useState(28);
  const [darkMode, setDarkMode] = useState(true);
  const [showRecordingNotes, setShowRecordingNotes] = useState(true);
  const [showDraftSidebar, setShowDraftSidebar] = useState(true);
  const [targetSegmentId, setTargetSegmentId] = useState<string>('auto');
  const [clearDraftAfterAdd, setClearDraftAfterAdd] = useState(true);
  const [draftStatusMsg, setDraftStatusMsg] = useState('');
  const [dismissedDraftHintFor, setDismissedDraftHintFor] = useState<string>('');
  const [highlightedSegId, setHighlightedSegId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  // Decluttered adaptive popovers (double-click on PC / long-press on mobile)
  const [showScrollOptions, setShowScrollOptions] = useState(false);
  const [showVoiceOptions, setShowVoiceOptions] = useState(false);

  // Inline editable episode title inside prompter
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(episode.title);

  // Le Précepteur Voice Narration State
  const [voiceState, setVoiceState] = useState<VoicePlaybackState>('idle');
  const [voicePace, setVoicePace] = useState<PrecepteurPace>('precepteur');
  const [withSoutenances, setWithSoutenances] = useState(true);
  const [includeSoundCues, setIncludeSoundCues] = useState(true);
  const [engineMode, setEngineMode] = useState<PrecepteurVoiceEngineMode>('auto');
  const [serverTtsAvailable, setServerTtsAvailable] = useState<boolean>(false);
  const [activeEngineLabel, setActiveEngineLabel] = useState<string>('Voix du Précepteur prête');
  const [activeChunkIndex, setActiveChunkIndex] = useState<number>(0);
  const [narrationQueue, setNarrationQueue] = useState<NarrationChunk[]>([]);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [activeKaraokeWordIdx, setActiveKaraokeWordIdx] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number>(0);

  // Persistent HTMLAudioElement refs for background & lock-screen playback (WhatsApp / screen off)
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const keepaliveAudioRef = useRef<HTMLAudioElement | null>(null);
  const keepaliveUrlRef = useRef<string | null>(null);

  // Voice playback refs for reliable pause/resume/cancel, retry & parallel prefetching
  const voiceRunIdRef = useRef<number>(0);
  const voicePausedRef = useRef<boolean>(false);
  const voiceStateRef = useRef<VoicePlaybackState>('idle');
  const activeChunkIdxRef = useRef<number>(0);
  const voiceQueueRef = useRef<NarrationChunk[]>([]);
  const voiceCtxRef = useRef<AudioContext | null>(null);
  const abortControllersRef = useRef<Set<AbortController>>(new Set());
  const audioCleanupRef = useRef<(() => void) | null>(null);
  const speechCleanupRef = useRef<(() => void) | null>(null);
  const wavBlobCacheRef = useRef<Map<string, CachedWavEntry>>(new Map());
  const ttsInFlightRef = useRef<Map<string, Promise<CachedWavEntry | null>>>(new Map());
  const transientBlobUrlsRef = useRef<Set<string>>(new Set());
  const mediaActionRefs = useRef<{
    play: () => void;
    pause: () => void;
    stop: () => void;
    prev: () => void;
    next: () => void;
  }>({
    play: () => {},
    pause: () => {},
    stop: () => {},
    prev: () => {},
    next: () => {},
  });

  voiceStateRef.current = voiceState;

  useEffect(() => {
    setIsEditingTitle(false);
    setTitleDraft(episode.title);
  }, [episode.id, episode.title]);

  const titleEditTrigger = useAdaptiveTrigger({
    onTrigger: () => {
      setTitleDraft(episode.title);
      setIsEditingTitle(true);
    },
  });

  const scrollClickTimerRef = useRef<number | null>(null);
  const voiceClickTimerRef = useRef<number | null>(null);

  const clearClickDisambiguation = useCallback(() => {
    if (scrollClickTimerRef.current !== null) {
      window.clearTimeout(scrollClickTimerRef.current);
      scrollClickTimerRef.current = null;
    }
    if (voiceClickTimerRef.current !== null) {
      window.clearTimeout(voiceClickTimerRef.current);
      voiceClickTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearClickDisambiguation, [clearClickDisambiguation]);

  const scrollOptionsTrigger = useAdaptiveTrigger({
    onTrigger: () => {
      clearClickDisambiguation();
      setShowVoiceOptions(false);
      setShowScrollOptions((v) => !v);
    },
  });

  const voiceOptionsTrigger = useAdaptiveTrigger({
    onTrigger: () => {
      clearClickDisambiguation();
      setShowScrollOptions(false);
      setShowVoiceOptions((v) => !v);
    },
  });

  const handleSavePrompterTitle = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = titleDraft.trim().slice(0, 300);
    if (!cleaned) return;
    onUpdateEpisode({
      ...episode,
      title: cleaned,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    setIsEditingTitle(false);
  };

  // Check if server-side Gemini TTS is configured + enumerate browser French voices
  useEffect(() => {
    let cancelled = false;

    fetch('/api/tts/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { available?: boolean } | null) => {
        if (!cancelled && data && typeof data.available === 'boolean') {
          setServerTtsAvailable(data.available);
        }
      })
      .catch(() => {
        if (!cancelled) setServerTtsAvailable(false);
      });

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const refreshVoices = () => {
        const list = window.speechSynthesis.getVoices();
        if (!cancelled && list.length > 0) {
          setAvailableVoices(list);
        }
      };
      refreshVoices();
      window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
      return () => {
        cancelled = true;
        window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices);
      };
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const stopKeepaliveAudio = useCallback(() => {
    const ka = keepaliveAudioRef.current;
    if (ka) {
      try {
        ka.pause();
        ka.removeAttribute('src');
        ka.load();
      } catch {
        // Ignore
      }
    }
    if (keepaliveUrlRef.current) {
      URL.revokeObjectURL(keepaliveUrlRef.current);
      keepaliveUrlRef.current = null;
    }
  }, []);

  const startKeepaliveAudio = useCallback(() => {
    const ka = keepaliveAudioRef.current;
    if (!ka) return;
    try {
      if (!keepaliveUrlRef.current) {
        keepaliveUrlRef.current = URL.createObjectURL(createSilentWavBlob(2, 8000));
      }
      if (ka.src !== keepaliveUrlRef.current) {
        ka.src = keepaliveUrlRef.current;
      }
      ka.loop = true;
      ka.volume = 0.01;
      void ka.play().catch(() => {});
    } catch {
      // Ignore autoplay blocks
    }
  }, []);

  const clearMediaSession = useCallback(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    } catch {
      // Ignore
    }
  }, []);

  const syncMediaSession = useCallback(
    (
      chunk: NarrationChunk | null,
      playbackState: 'playing' | 'paused' | 'none',
      durationSec?: number,
      positionSec?: number
    ) => {
      if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
      try {
        navigator.mediaSession.playbackState = playbackState;
        if (chunk) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: `Ep. ${episode.number} — ${chunk.segmentTitle}`,
            artist: 'PHILOA2BALLES · Voix du Précepteur',
            album: episode.workTitle,
            artwork: [
              {
                src: '/assets/philoa2balle-logo-bg.png',
                sizes: '512x512',
                type: 'image/png',
              },
            ],
          });
        }
        if (
          playbackState !== 'none' &&
          typeof durationSec === 'number' &&
          Number.isFinite(durationSec) &&
          durationSec > 0 &&
          typeof navigator.mediaSession.setPositionState === 'function'
        ) {
          navigator.mediaSession.setPositionState({
            duration: durationSec,
            playbackRate: 1,
            position: Math.min(durationSec, Math.max(0, positionSec ?? 0)),
          });
        }
      } catch {
        // Ignore unsupported browser metadata
      }
    },
    [episode.number, episode.workTitle]
  );

  // Register persistent OS / Lock-screen MediaSession handlers
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const safeHandle = (action: MediaSessionAction, handler: (() => void) | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Action unsupported in this browser
      }
    };

    safeHandle('play', () => mediaActionRefs.current.play());
    safeHandle('pause', () => mediaActionRefs.current.pause());
    safeHandle('stop', () => mediaActionRefs.current.stop());
    safeHandle('previoustrack', () => mediaActionRefs.current.prev());
    safeHandle('nexttrack', () => mediaActionRefs.current.next());
    safeHandle('seekbackward', () => mediaActionRefs.current.prev());
    safeHandle('seekforward', () => mediaActionRefs.current.next());

    return () => {
      safeHandle('play', null);
      safeHandle('pause', null);
      safeHandle('stop', null);
      safeHandle('previoustrack', null);
      safeHandle('nexttrack', null);
      safeHandle('seekbackward', null);
      safeHandle('seekforward', null);
    };
  }, []);

  const abortAllInFlightTts = useCallback(() => {
    abortControllersRef.current.forEach((ctrl) => {
      try {
        ctrl.abort();
      } catch {
        // Ignore
      }
    });
    abortControllersRef.current.clear();
  }, []);

  const cleanupActivePlayback = useCallback(() => {
    if (audioCleanupRef.current) {
      audioCleanupRef.current();
      audioCleanupRef.current = null;
    }
    if (speechCleanupRef.current) {
      speechCleanupRef.current();
      speechCleanupRef.current = null;
    }
    const audio = voiceAudioRef.current;
    if (audio) {
      try {
        audio.pause();
      } catch {
        // Ignore
      }
    }
    stopKeepaliveAudio();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [stopKeepaliveAudio]);

  const clearWavCaches = useCallback(() => {
    wavBlobCacheRef.current.forEach((entry) => {
      URL.revokeObjectURL(entry.url);
    });
    wavBlobCacheRef.current.clear();
    ttsInFlightRef.current.clear();
    transientBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    transientBlobUrlsRef.current.clear();
  }, []);

  const stopVoiceNarration = useCallback(() => {
    voiceRunIdRef.current += 1;
    voicePausedRef.current = false;
    activeChunkIdxRef.current = 0;

    abortAllInFlightTts();
    cleanupActivePlayback();
    clearMediaSession();

    setVoiceState('idle');
    setActiveChunkIndex(0);
    setActiveKaraokeWordIdx(null);
  }, [abortAllInFlightTts, cleanupActivePlayback, clearMediaSession]);

  // Stop voice & release blob URLs cleanly when switching episode or unmounting
  useEffect(() => {
    stopVoiceNarration();
    clearWavCaches();
  }, [episode.id, stopVoiceNarration, clearWavCaches]);

  useEffect(() => {
    return () => {
      stopVoiceNarration();
      clearWavCaches();
      window.clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (voiceCtxRef.current && voiceCtxRef.current.state !== 'closed') {
        void voiceCtxRef.current.close();
      }
    };
  }, [stopVoiceNarration, clearWavCaches]);

  const getVoiceAudioContext = useCallback(async () => {
    if (!voiceCtxRef.current || voiceCtxRef.current.state === 'closed') {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      voiceCtxRef.current = new Ctx();
    }
    if (voiceCtxRef.current.state === 'suspended') {
      await voiceCtxRef.current.resume();
    }
    return voiceCtxRef.current;
  }, []);

  const fetchPrecepteurWavEntry = useCallback(
    async (
      chunk: NarrationChunk,
      pace: PrecepteurPace,
      soutenances: boolean
    ): Promise<CachedWavEntry | null> => {
      const cacheKey = `${chunk.id}|${pace}|${soutenances ? '1' : '0'}`;
      const cached = wavBlobCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const existingFlight = ttsInFlightRef.current.get(cacheKey);
      if (existingFlight) return existingFlight;

      const promise = (async (): Promise<CachedWavEntry | null> => {
        const controller = new AbortController();
        abortControllersRef.current.add(controller);

        try {
          let payload: { audioBase64?: string } | null = null;

          // Retry up to 2 attempts on transient network / 5xx errors
          for (let attempt = 0; attempt < 2; attempt++) {
            if (controller.signal.aborted) return null;
            try {
              const res = await fetch('/api/tts/precepteur', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text: chunk.ttsPromptText,
                  role: chunk.role,
                  pace,
                  withSoutenances: soutenances,
                }),
                signal: controller.signal,
              });
              if (res.status >= 400 && res.status < 500) {
                return null;
              }
              if (res.ok) {
                payload = (await res.json()) as { audioBase64?: string };
                break;
              }
            } catch (err) {
              if ((err as { name?: string })?.name === 'AbortError') return null;
            }
            if (attempt === 0) {
              await new Promise((r) => window.setTimeout(r, 450));
            }
          }

          if (!payload?.audioBase64 || controller.signal.aborted) return null;

          const ctx = await getVoiceAudioContext();
          const rawBuf = base64ToArrayBuffer(payload.audioBase64);
          const decoded = await ctx.decodeAudioData(rawBuf);
          const playbackRate = pace === 'pose' ? 0.93 : pace === 'fluide' ? 1.04 : 0.98;
          const trailingSilenceSec = soutenances ? (pace === 'pose' ? 0.38 : 0.22) : 0.08;

          const rendered = await renderWarmPrecepteurWavBlob(decoded, {
            playbackRate,
            trailingSilenceSec,
          });
          if (controller.signal.aborted) return null;

          const url = URL.createObjectURL(rendered.blob);

          // Cap cache around 20 WAV Blob entries and revoke evicted URLs
          while (wavBlobCacheRef.current.size >= 20) {
            const firstKey = wavBlobCacheRef.current.keys().next().value;
            if (!firstKey) break;
            const evicted = wavBlobCacheRef.current.get(firstKey);
            if (evicted) URL.revokeObjectURL(evicted.url);
            wavBlobCacheRef.current.delete(firstKey);
          }

          const entry: CachedWavEntry = {
            url,
            speechDurationSec: rendered.speechDurationSec,
            totalDurationSec: rendered.totalDurationSec,
          };
          wavBlobCacheRef.current.set(cacheKey, entry);
          return entry;
        } catch {
          return null;
        } finally {
          abortControllersRef.current.delete(controller);
          ttsInFlightRef.current.delete(cacheKey);
        }
      })();

      ttsInFlightRef.current.set(cacheKey, promise);
      return promise;
    },
    [getVoiceAudioContext]
  );

  /**
   * Plays any pre-rendered WAV Blob URL through the persistent HTMLAudioElement
   * so OS background/lock-screen audio focus holds seamlessly even when the user
   * opens WhatsApp or locks their phone screen, while updating live karaoke progress.
   */
  const playWavEntryOnAudioElement = useCallback(
    async (
      chunk: NarrationChunk,
      entry: CachedWavEntry,
      timings: KaraokeWordTiming[],
      runId: number
    ): Promise<boolean> => {
      const audio = voiceAudioRef.current;
      if (!audio || voiceRunIdRef.current !== runId || voicePausedRef.current) {
        return false;
      }

      return new Promise<boolean>((resolve) => {
        let settled = false;
        let rafId = 0;
        let lastWordIdx = -1;

        const updateWordFromTime = () => {
          if (settled || voiceRunIdRef.current !== runId) return;
          if (timings.length > 0 && entry.speechDurationSec > 0.05) {
            const ratio = Math.min(1, audio.currentTime / entry.speechDurationSec);
            const match = resolveActiveKaraokeWord(timings, ratio);
            if (match && match.wordIndex !== lastWordIdx) {
              lastWordIdx = match.wordIndex;
              setActiveKaraokeWordIdx(match.wordIndex);
            }
          }
        };

        const rafTick = () => {
          updateWordFromTime();
          if (!settled && !audio.paused && voiceRunIdRef.current === runId) {
            rafId = requestAnimationFrame(rafTick);
          }
        };

        const cleanup = () => {
          cancelAnimationFrame(rafId);
          audio.removeEventListener('timeupdate', onTimeUpdate);
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          if (audioCleanupRef.current === cancelCurrent) {
            audioCleanupRef.current = null;
          }
        };

        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(ok);
        };

        const cancelCurrent = () => {
          try {
            audio.pause();
          } catch {
            // Ignore
          }
          finish(false);
        };

        const onTimeUpdate = () => {
          updateWordFromTime();
          syncMediaSession(
            chunk,
            'playing',
            audio.duration || entry.totalDurationSec,
            audio.currentTime
          );
        };

        const onEnded = () => {
          finish(voiceRunIdRef.current === runId && !voicePausedRef.current);
        };

        const onError = () => {
          finish(false);
        };

        audioCleanupRef.current = cancelCurrent;
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        audio.src = entry.url;
        audio.currentTime = 0;
        syncMediaSession(chunk, 'playing', entry.totalDurationSec, 0);

        audio
          .play()
          .then(() => {
            if (settled || voiceRunIdRef.current !== runId) {
              finish(false);
              return;
            }
            if (timings.length > 0) {
              setActiveKaraokeWordIdx(0);
              lastWordIdx = 0;
            }
            rafId = requestAnimationFrame(rafTick);
          })
          .catch(() => {
            finish(false);
          });
      });
    },
    [syncMediaSession]
  );

  /**
   * Plays a silent pause or sound-cue duration through the persistent <audio>
   * pipeline so OS background lock-screen timelines never stall on throttled JS timers.
   */
  const playTimedPauseViaAudio = useCallback(
    async (chunk: NarrationChunk, durationMs: number, runId: number): Promise<boolean> => {
      const pauseSec = Math.max(0.25, durationMs / 1000);
      const blob = createSilentWavBlob(pauseSec, 8000);
      const url = URL.createObjectURL(blob);
      transientBlobUrlsRef.current.add(url);

      try {
        const audio = voiceAudioRef.current;
        if (audio) {
          const ok = await playWavEntryOnAudioElement(
            chunk,
            { url, speechDurationSec: pauseSec, totalDurationSec: pauseSec },
            [],
            runId
          );
          if (ok || voiceRunIdRef.current !== runId || voicePausedRef.current) {
            return ok;
          }
        }
        // Minimal timer fallback if HTMLAudioElement is not yet playable
        return await new Promise<boolean>((resolve) => {
          const id = window.setTimeout(() => {
            resolve(voiceRunIdRef.current === runId && !voicePausedRef.current);
          }, durationMs);
          audioCleanupRef.current = () => {
            window.clearTimeout(id);
            resolve(false);
          };
        });
      } finally {
        URL.revokeObjectURL(url);
        transientBlobUrlsRef.current.delete(url);
      }
    },
    [playWavEntryOnAudioElement]
  );

  const speakChunkWithBrowserVoice = useCallback(
    (
      chunk: NarrationChunk,
      timings: KaraokeWordTiming[],
      pace: PrecepteurPace,
      runId: number
    ): Promise<boolean> => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return Promise.resolve(false);
      }

      return new Promise<boolean>((resolve) => {
        window.speechSynthesis.cancel();
        startKeepaliveAudio();

        const speechText = chunk.browserSpeechText || chunk.text;
        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.lang = 'fr-FR';
        const chosenVoice = selectBestFrenchVoice(
          availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices()
        );
        if (chosenVoice) {
          utterance.voice = chosenVoice;
        }
        const paceRate = PRECEPTEUR_PACE_CONFIG[pace].rate;
        utterance.rate = paceRate;
        utterance.pitch = 0.87;
        utterance.volume = 1.0;

        const browserTimings = buildChunkKaraokeTimings(speechText);
        const estDurationMs = Math.max(
          2500,
          Math.round((Math.max(1, chunk.wordCount) / (135 * paceRate)) * 60000)
        );
        const startedAt = Date.now();
        let boundaryActive = false;
        let settled = false;
        let lastWordIdx = -1;

        syncMediaSession(chunk, 'playing', estDurationMs / 1000, 0);

        // Chromium anti-freeze watchdog (every 10s keeps Chrome from muting long utterances)
        const resumeWatchdogId = window.setInterval(() => {
          if (settled || voiceRunIdRef.current !== runId) return;
          if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        }, 10000);

        // Smooth elapsed-time fallback in case Android/iOS doesn't emit onboundary events
        const progressFallbackId = window.setInterval(() => {
          if (settled || boundaryActive || timings.length === 0) return;
          const elapsed = Date.now() - startedAt;
          const ratio = Math.min(0.98, elapsed / Math.max(800, estDurationMs));
          const match = resolveActiveKaraokeWord(timings, ratio);
          if (match && match.wordIndex !== lastWordIdx) {
            lastWordIdx = match.wordIndex;
            setActiveKaraokeWordIdx(match.wordIndex);
          }
        }, 140);

        // Hard safety timeout so SpeechSynthesis can never hang indefinitely
        const maxDurationMs = Math.max(12000, Math.max(1, chunk.wordCount) * 950 + 4500);
        const safetyTimeoutId = window.setTimeout(() => {
          finish(voiceRunIdRef.current === runId && !voicePausedRef.current);
        }, maxDurationMs);

        const cleanup = () => {
          window.clearInterval(resumeWatchdogId);
          window.clearInterval(progressFallbackId);
          window.clearTimeout(safetyTimeoutId);
          if (speechCleanupRef.current === cancelSpeech) {
            speechCleanupRef.current = null;
          }
        };

        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(ok);
        };

        const cancelSpeech = () => {
          window.speechSynthesis.cancel();
          finish(false);
        };

        speechCleanupRef.current = cancelSpeech;

        utterance.onboundary = (ev) => {
          if (settled || voiceRunIdRef.current !== runId) return;
          if (typeof ev.charIndex === 'number' && ev.charIndex >= 0 && browserTimings.length > 0) {
            boundaryActive = true;
            const bMatch = resolveKaraokeWordAtCharIndex(browserTimings, ev.charIndex);
            if (bMatch) {
              const mappedIdx =
                timings.length > 0
                  ? Math.min(timings.length - 1, bMatch.wordIndex)
                  : bMatch.wordIndex;
              if (mappedIdx !== lastWordIdx) {
                lastWordIdx = mappedIdx;
                setActiveKaraokeWordIdx(mappedIdx);
              }
            }
          }
        };

        utterance.onend = () => {
          finish(voiceRunIdRef.current === runId && !voicePausedRef.current);
        };
        utterance.onerror = () => {
          finish(false);
        };

        if (timings.length > 0) {
          setActiveKaraokeWordIdx(0);
          lastWordIdx = 0;
        }
        window.speechSynthesis.speak(utterance);
      });
    },
    [availableVoices, startKeepaliveAudio, syncMediaSession]
  );

  const scrollToPrompterSegment = useCallback((segId: string, highlight = true) => {
    if (highlight) {
      setHighlightedSegId(segId);
    }
    const container = scrollContainerRef.current;
    const el = document.getElementById(`prompter-seg-${segId}`);
    if (container && el) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetTop = container.scrollTop + (elRect.top - containerRect.top) - 20;
      container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    }
    if (highlight) {
      window.setTimeout(() => {
        setHighlightedSegId((prev) => (prev === segId ? null : prev));
      }, 2400);
    }
  }, []);

  // Gentle auto-scroll keeping the active karaoke word comfortably centered in view
  useEffect(() => {
    if (activeKaraokeWordIdx === null || voiceState !== 'playing') return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const activeEl = container.querySelector('[data-karaoke-active="true"]') as HTMLElement | null;
    if (!activeEl) return;

    const cRect = container.getBoundingClientRect();
    const wRect = activeEl.getBoundingClientRect();
    const relTop = wRect.top - cRect.top;
    const thresholdHigh = cRect.height * 0.62;
    const thresholdLow = cRect.height * 0.14;

    if (relTop > thresholdHigh || relTop < thresholdLow) {
      const nextTop = container.scrollTop + relTop - cRect.height * 0.34;
      container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
    }
  }, [activeKaraokeWordIdx, activeChunkIndex, voiceState]);

  const runQueueFromIndex = useCallback(
    async (
      queue: NarrationChunk[],
      startIdx: number,
      pace: PrecepteurPace,
      soutenances: boolean,
      preferredEngine: PrecepteurVoiceEngineMode
    ) => {
      const runId = ++voiceRunIdRef.current;
      voicePausedRef.current = false;
      voiceQueueRef.current = queue;
      setNarrationQueue(queue);

      let lastScrolledSegId = '';

      for (let i = startIdx; i < queue.length; i++) {
        if (voiceRunIdRef.current !== runId || voicePausedRef.current) return;

        const chunk = queue[i];
        activeChunkIdxRef.current = i;
        setActiveChunkIndex(i);
        setActiveKaraokeWordIdx(null);

        if (chunk.segmentId !== lastScrolledSegId) {
          lastScrolledSegId = chunk.segmentId;
          scrollToPrompterSegment(chunk.segmentId, false);
        }

        if (chunk.kind === 'sound_cue') {
          setVoiceState('playing');
          if (chunk.soundCueId) {
            onPreviewSoundCue(chunk.soundCueId);
          }
          const ok = await playTimedPauseViaAudio(
            chunk,
            Math.round(chunk.pauseMs * PRECEPTEUR_PACE_CONFIG[pace].pauseScale),
            runId
          );
          if (!ok) return;
          continue;
        }

        if (chunk.kind === 'pause') {
          setVoiceState('playing');
          const ok = await playTimedPauseViaAudio(
            chunk,
            Math.round(chunk.pauseMs * PRECEPTEUR_PACE_CONFIG[pace].pauseScale),
            runId
          );
          if (!ok) return;
          continue;
        }

        const timings = buildChunkKaraokeTimings(chunk.text);
        const canTryStudio = preferredEngine === 'auto' && serverTtsAvailable;

        if (canTryStudio) {
          setVoiceState('loading');

          // Prefetch current + next 3 speech chunks in parallel so background playback never stalls
          const upcomingSpeech = queue
            .slice(i + 1)
            .filter((c) => c.kind === 'speech')
            .slice(0, 3);
          for (const nextChunk of upcomingSpeech) {
            void fetchPrecepteurWavEntry(nextChunk, pace, soutenances);
          }

          const wavEntry = await fetchPrecepteurWavEntry(chunk, pace, soutenances);
          if (voiceRunIdRef.current !== runId || voicePausedRef.current) return;

          if (wavEntry) {
            stopKeepaliveAudio();
            setActiveEngineLabel('Voix Studio IA — Timbre Le Précepteur');
            setVoiceState('playing');
            const ok = await playWavEntryOnAudioElement(chunk, wavEntry, timings, runId);
            if (ok) continue;
            if (voiceRunIdRef.current !== runId || voicePausedRef.current) return;
          }
        }

        // Autonomous browser SpeechSynthesis fallback (with silent <audio> lock-screen keepalive + 10s Chrome watchdog)
        setActiveEngineLabel('Voix appareil autonome (cadence Le Précepteur)');
        setVoiceState('playing');
        const spokeOk = await speakChunkWithBrowserVoice(chunk, timings, pace, runId);
        if (!spokeOk) {
          if (voiceRunIdRef.current === runId && !voicePausedRef.current) {
            setStatusMessage(
              'Synthèse vocale indisponible sur ce navigateur. Vérifiez le volume ou les voix françaises.'
            );
            stopVoiceNarration();
          }
          return;
        }

        if (soutenances) {
          const restOk = await playTimedPauseViaAudio(chunk, pace === 'pose' ? 380 : 220, runId);
          if (!restOk) return;
        }
      }

      if (voiceRunIdRef.current === runId) {
        stopVoiceNarration();
      }
    },
    [
      fetchPrecepteurWavEntry,
      onPreviewSoundCue,
      playTimedPauseViaAudio,
      playWavEntryOnAudioElement,
      scrollToPrompterSegment,
      serverTtsAvailable,
      speakChunkWithBrowserVoice,
      stopKeepaliveAudio,
      stopVoiceNarration,
    ]
  );

  const startVoiceFromSegment = useCallback(
    (startSegmentId?: string) => {
      setStatusMessage('');
      setIsScrolling(false);
      abortAllInFlightTts();
      cleanupActivePlayback();

      const queue = buildEpisodeNarrationQueue(episode, {
        startSegmentId,
        includeSoundCues,
        withSoutenances,
      });
      if (queue.length === 0) {
        setStatusMessage('Aucun texte rédigé à lire dans cet épisode.');
        return;
      }
      void runQueueFromIndex(queue, 0, voicePace, withSoutenances, engineMode);
    },
    [
      abortAllInFlightTts,
      cleanupActivePlayback,
      engineMode,
      episode,
      includeSoundCues,
      runQueueFromIndex,
      voicePace,
      withSoutenances,
    ]
  );

  const toggleVoicePauseResume = useCallback(() => {
    if (voiceStateRef.current === 'playing' || voiceStateRef.current === 'loading') {
      voicePausedRef.current = true;
      voiceRunIdRef.current += 1;
      abortAllInFlightTts();
      cleanupActivePlayback();
      const currentChunk = voiceQueueRef.current[activeChunkIdxRef.current] ?? null;
      syncMediaSession(currentChunk, 'paused');
      setVoiceState('paused');
      return;
    }

    if (voiceStateRef.current === 'paused') {
      const queue =
        voiceQueueRef.current.length > 0
          ? voiceQueueRef.current
          : buildEpisodeNarrationQueue(episode, {
              includeSoundCues,
              withSoutenances,
            });
      void runQueueFromIndex(
        queue,
        activeChunkIdxRef.current,
        voicePace,
        withSoutenances,
        engineMode
      );
      return;
    }

    startVoiceFromSegment();
  }, [
    abortAllInFlightTts,
    cleanupActivePlayback,
    engineMode,
    episode,
    includeSoundCues,
    runQueueFromIndex,
    startVoiceFromSegment,
    syncMediaSession,
    voicePace,
    withSoutenances,
  ]);

  const jumpQueueStep = useCallback(
    (direction: -1 | 1) => {
      const queue = voiceQueueRef.current;
      if (queue.length === 0) return;
      let targetIdx = activeChunkIdxRef.current + direction;
      while (targetIdx >= 0 && targetIdx < queue.length && queue[targetIdx].kind !== 'speech') {
        targetIdx += direction;
      }
      const clampedIdx = Math.max(0, Math.min(queue.length - 1, targetIdx));
      cleanupActivePlayback();
      void runQueueFromIndex(queue, clampedIdx, voicePace, withSoutenances, engineMode);
    },
    [cleanupActivePlayback, engineMode, runQueueFromIndex, voicePace, withSoutenances]
  );

  mediaActionRefs.current = {
    play: () => {
      if (voiceStateRef.current === 'paused' || voiceStateRef.current === 'idle') {
        toggleVoicePauseResume();
      }
    },
    pause: () => {
      if (voiceStateRef.current === 'playing' || voiceStateRef.current === 'loading') {
        toggleVoicePauseResume();
      }
    },
    stop: () => stopVoiceNarration(),
    prev: () => jumpQueueStep(-1),
    next: () => jumpQueueStep(1),
  };

  const activeVoiceChunk =
    voiceState !== 'idle' && narrationQueue[activeChunkIndex]
      ? narrationQueue[activeChunkIndex]
      : null;

  // Map activeKaraokeWordIdx onto exact character bounds inside the active segment's scriptText
  const activeSegmentKaraokeMatch = useMemo<{
    segmentId: string;
    match: KaraokeActiveMatch;
  } | null>(() => {
    if (!activeVoiceChunk || activeVoiceChunk.kind !== 'speech' || activeKaraokeWordIdx === null) {
      return null;
    }
    const seg = episode.segments.find((s) => s.id === activeVoiceChunk.segmentId);
    if (!seg) return null;

    let startOffset = activeVoiceChunk.scriptStartOffset;
    let endOffset = activeVoiceChunk.scriptEndOffset;
    if (startOffset === undefined || endOffset === undefined) {
      const found = findChunkSpanInScript(seg.scriptText, activeVoiceChunk.text, 0);
      if (!found) return null;
      startOffset = found.start;
      endOffset = found.end;
    }

    const slice = seg.scriptText.slice(startOffset, endOffset);
    const segTimings = buildChunkKaraokeTimings(slice);
    if (segTimings.length === 0) return null;

    const clampedWordIdx = Math.max(0, Math.min(segTimings.length - 1, activeKaraokeWordIdx));
    const timing = segTimings[clampedWordIdx];

    return {
      segmentId: seg.id,
      match: {
        wordIndex: clampedWordIdx,
        charStart: startOffset + timing.charStart,
        charEnd: startOffset + timing.charEnd,
        word: timing.word,
      },
    };
  }, [activeVoiceChunk, activeKaraokeWordIdx, episode.segments]);

  useEffect(() => {
    if (!isScrolling) return;
    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      const el = scrollContainerRef.current;
      if (el) {
        const pxPerSec = (speedWpm / 140) * (fontSizePx * 1.15);
        el.scrollTop += pxPerSec * dt;
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isScrolling, speedWpm, fontSizePx]);

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      setIsScrolling(false);
      return;
    }

    setStatusMessage('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatusMessage('Capture micro indisponible dans cet environnement.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = async () => {
        window.clearInterval(timerRef.current);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        await onSaveRecordedBlob(blob, `Prise prompteur Ep.${episode.number}`);
        setStatusMessage('Prise enregistrée et envoyée directement dans le Studio & Mixage.');
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingSec(0);
      setIsRecording(true);
      setIsScrolling(true);
      timerRef.current = window.setInterval(() => setRecordingSec((s) => s + 1), 1000);
    } catch {
      setStatusMessage('Permission microphone refusée ou micro absent.');
    }
  };

  const resetScroll = () => {
    setIsScrolling(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  const effectiveTargetId =
    targetSegmentId === 'auto'
      ? 'auto'
      : episode.segments.some((s) => s.id === targetSegmentId)
        ? targetSegmentId
        : 'auto';

  const episodeRef = useRef(episode);
  episodeRef.current = episode;

  const [draftDetection, setDraftDetection] = useState<
    ReturnType<typeof detectDraftConceptMatches>
  >(() => ({ detectedConcepts: [], repeatedThoughts: [] }));
  const [smartDraftPlan, setSmartDraftPlan] = useState<ReturnType<
    typeof planSmartDraftPlacement
  > | null>(null);

  useEffect(() => {
    const raw = episode.draftThoughts ?? '';
    if (!raw.trim()) {
      setDraftDetection({ detectedConcepts: [], repeatedThoughts: [] });
      setSmartDraftPlan(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const ep = episodeRef.current;
      const latestRaw = ep.draftThoughts ?? '';
      if (!latestRaw.trim()) {
        setDraftDetection({ detectedConcepts: [], repeatedThoughts: [] });
        setSmartDraftPlan(null);
        return;
      }
      setDraftDetection(detectDraftConceptMatches(ep, latestRaw));
      setSmartDraftPlan(
        planSmartDraftPlacement(
          ep,
          latestRaw,
          effectiveTargetId === 'auto' ? undefined : effectiveTargetId
        )
      );
    }, 280);
    return () => window.clearTimeout(timer);
  }, [episode.id, episode.draftThoughts, episode.segments.length, effectiveTargetId]);

  const handlePolishDraft = () => {
    const raw = episode.draftThoughts ?? '';
    if (!raw.trim()) return;
    const res = adjustThoughtToEpisodeThread(
      raw,
      episode,
      smartDraftPlan?.targetSegmentId ?? episode.segments[0]?.id ?? ''
    );
    onUpdateEpisode({ ...episode, draftThoughts: res.adjusted });
    setDraftStatusMsg(
      res.hasChanges
        ? `${res.changes.length} réajustement(s) appliqué(s) au brouillon.`
        : 'Le brouillon est déjà bien tourné.'
    );
  };

  const handleAppendToPrompter = () => {
    const raw = episode.draftThoughts ?? '';
    if (!raw.trim()) return;
    const { episode: updated, plan } = insertThoughtIntelligently(episode, raw, {
      forcedSegmentId: effectiveTargetId === 'auto' ? undefined : effectiveTargetId,
      clearDraft: clearDraftAfterAdd,
    });
    if (!plan) return;
    onUpdateEpisode(updated);
    setDraftStatusMsg(
      `Placé dans ${String(plan.targetSegmentIndex).padStart(2, '0')}. « ${plan.targetSegmentTitle} » (${
        plan.insertionMode === 'after_sentence' ? 'juste après la phrase liée' : 'dans le passage adapté'
      }) sur le prompteur.`
    );
  };

  return (
    <main className="max-w-[1440px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
      {/* Persistent hidden HTMLAudioElements holding OS MediaSession & background playback */}
      <audio ref={voiceAudioRef} playsInline preload="auto" className="hidden" />
      <audio ref={keepaliveAudioRef} playsInline loop className="hidden" />

      {/* Compact Smart Teleprompter Toolbar */}
      <section className="relative bg-white border border-[#E5E2D9] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <form
              onSubmit={handleSavePrompterTitle}
              data-testid="prompter-title-editor"
              className="flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                aria-label="Modifier le titre de l’épisode"
                maxLength={300}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                autoFocus
                className="flex-1 min-w-[200px] px-2.5 py-1.5 text-sm font-semibold text-[#18181B] bg-[#FAF9F5] border border-[#C2410C] rounded-lg focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Valider le titre"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#C2410C] rounded-lg cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                OK
              </button>
              <button
                type="button"
                aria-label="Annuler la modification du titre"
                onClick={() => setIsEditingTitle(false)}
                className="p-1.5 text-[#71717A] hover:text-[#18181B] cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </form>
          ) : (
            <div className="space-y-0.5">
              <p className="text-[11px] text-[#71717A] truncate">
                Épisode {episode.number} · {episode.workTitle}
              </p>
              <div
                data-testid="prompter-title-trigger"
                {...titleEditTrigger.triggerProps}
                title="Double-clic (PC) ou appui long (mobile) pour modifier le titre"
                className="group inline-flex items-center gap-1.5 max-w-full cursor-text select-none"
              >
                <h1 className="font-display text-base sm:text-lg font-semibold text-[#18181B] truncate">
                  {episode.title}
                </h1>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTitleDraft(episode.title);
                    setIsEditingTitle(true);
                  }}
                  aria-label="Modifier le titre de l’épisode"
                  className="p-1 text-[#A1A1AA] hover:text-[#C2410C] opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity rounded cursor-pointer shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Défiler + Double-click/Long-press Scroll Options */}
          <div className="relative">
            <button
              type="button"
              data-testid="prompter-scroll-trigger"
              onClick={(e) => {
                if (e.detail >= 2) {
                  clearClickDisambiguation();
                  return;
                }
                if (scrollClickTimerRef.current !== null) {
                  window.clearTimeout(scrollClickTimerRef.current);
                }
                scrollClickTimerRef.current = window.setTimeout(() => {
                  scrollClickTimerRef.current = null;
                  setIsScrolling((s) => !s);
                }, 180);
              }}
              {...scrollOptionsTrigger.triggerProps}
              title="Clic : défiler · Double-clic (PC) / appui long (mobile) : vitesse, taille, thème"
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap select-none ${
                isScrolling
                  ? 'bg-[#C2410C] text-white'
                  : 'bg-[#F6F5F0] text-[#18181B] hover:bg-[#ECEAE2] border border-[#E5E2D9]'
              }`}
            >
              {isScrolling ? (
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {isScrolling ? 'Pause' : 'Défiler'}
            </button>

            {showScrollOptions && (
              <div
                data-testid="prompter-scroll-options"
                className="absolute right-0 mt-2 w-72 bg-white border border-[#E5E2D9] rounded-xl shadow-lg p-3.5 space-y-3 z-30"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-[#18181B]">
                  <span>Réglages du défilement</span>
                  <button
                    type="button"
                    aria-label="Fermer les réglages du défilement"
                    onClick={() => setShowScrollOptions(false)}
                    className="p-0.5 text-[#71717A] hover:text-[#18181B] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-[#52525B]">
                    <label htmlFor="prompter-speed">Vitesse</label>
                    <span className="font-mono">{speedWpm} mots/min</span>
                  </div>
                  <input
                    id="prompter-speed"
                    type="range"
                    min={95}
                    max={190}
                    value={speedWpm}
                    onChange={(e) => setSpeedWpm(Number(e.target.value))}
                    className="w-full accent-[#C2410C]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-[#52525B]">
                    <label htmlFor="prompter-size">Taille texte</label>
                    <span className="font-mono">{fontSizePx} px</span>
                  </div>
                  <input
                    id="prompter-size"
                    type="range"
                    min={20}
                    max={42}
                    value={fontSizePx}
                    onChange={(e) => setFontSizePx(Number(e.target.value))}
                    className="w-full accent-[#C2410C]"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-[#18181B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRecordingNotes}
                    onChange={(e) => setShowRecordingNotes(e.target.checked)}
                    className="accent-[#C2410C]"
                  />
                  Afficher les notes sur mots
                </label>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#F0EFEA]">
                  <button
                    type="button"
                    onClick={() => setDarkMode((d) => !d)}
                    className="flex-1 px-2.5 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] rounded-md cursor-pointer"
                  >
                    {darkMode ? 'Fond cahier' : 'Fond sombre'}
                  </button>
                  <button
                    type="button"
                    onClick={resetScroll}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] rounded-md cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    Haut
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Écouter + Double-click/Long-press Voice Options */}
          <div className="relative">
            <button
              type="button"
              data-testid="prompter-voice-toggle"
              onClick={(e) => {
                if (e.detail >= 2) {
                  clearClickDisambiguation();
                  return;
                }
                if (voiceClickTimerRef.current !== null) {
                  window.clearTimeout(voiceClickTimerRef.current);
                }
                voiceClickTimerRef.current = window.setTimeout(() => {
                  voiceClickTimerRef.current = null;
                  toggleVoicePauseResume();
                }, 180);
              }}
              {...voiceOptionsTrigger.triggerProps}
              title="Clic : écouter · Double-clic (PC) / appui long (mobile) : cadence, soutenances et moteur voix"
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg cursor-pointer transition-colors whitespace-nowrap select-none ${
                voiceState === 'playing' || voiceState === 'loading'
                  ? 'bg-[#B45309] hover:bg-[#92400E]'
                  : 'bg-[#18181B] hover:bg-[#27272A]'
              }`}
            >
              {voiceState === 'playing' || voiceState === 'loading' ? (
                <>
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                  {voiceState === 'loading' ? 'Préparation…' : 'Pause'}
                </>
              ) : voiceState === 'paused' ? (
                <>
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  Reprendre
                </>
              ) : (
                <>
                  <Headphones className="w-3.5 h-3.5" aria-hidden="true" />
                  Écouter
                </>
              )}
            </button>

            {showVoiceOptions && (
              <div
                data-testid="prompter-voice-options"
                className="absolute right-0 mt-2 w-80 bg-white border border-[#E5E2D9] rounded-xl shadow-lg p-3.5 space-y-3 z-30"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-[#18181B]">
                  <span>Voix du Précepteur</span>
                  <button
                    type="button"
                    aria-label="Fermer les réglages de la voix"
                    onClick={() => setShowVoiceOptions(false)}
                    className="p-0.5 text-[#71717A] hover:text-[#18181B] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div>
                  <label
                    htmlFor="precepteur-pace"
                    className="block text-[11px] font-medium text-[#52525B] mb-1"
                  >
                    Cadence
                  </label>
                  <select
                    id="precepteur-pace"
                    value={voicePace}
                    onChange={(e) => setVoicePace(e.target.value as PrecepteurPace)}
                    className="w-full px-2.5 py-1.5 text-xs text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                  >
                    {Object.entries(PRECEPTEUR_PACE_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key}>
                        {cfg.label}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs text-[#18181B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={withSoutenances}
                    onChange={(e) => setWithSoutenances(e.target.checked)}
                    className="accent-[#C2410C]"
                  />
                  Soutenances, appuis & redondances posées
                </label>

                <label className="flex items-center gap-2 text-xs text-[#18181B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSoundCues}
                    onChange={(e) => setIncludeSoundCues(e.target.checked)}
                    className="accent-[#C2410C]"
                  />
                  Extraits sonores automatiques
                </label>

                {serverTtsAvailable && (
                  <div>
                    <label
                      htmlFor="precepteur-engine"
                      className="block text-[11px] font-medium text-[#52525B] mb-1"
                    >
                      Moteur audio
                    </label>
                    <select
                      id="precepteur-engine"
                      value={engineMode}
                      onChange={(e) =>
                        setEngineMode(e.target.value as PrecepteurVoiceEngineMode)
                      }
                      className="w-full px-2.5 py-1.5 text-xs text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                    >
                      <option value="auto">Studio IA (Le Précepteur) + secours appareil</option>
                      <option value="browser">Voix appareil directe (hors-ligne)</option>
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {voiceState !== 'idle' && (
            <button
              type="button"
              data-testid="prompter-voice-stop"
              onClick={stopVoiceNarration}
              aria-label="Arrêter la lecture vocale"
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] rounded-lg cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              Stop
            </button>
          )}

          <button
            type="button"
            onClick={toggleRecording}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg cursor-pointer whitespace-nowrap ${
              isRecording
                ? 'bg-[#DC2626] hover:bg-[#B91C1C]'
                : 'bg-[#C2410C] hover:bg-[#9A3412]'
            }`}
          >
            {isRecording ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                Stop ({formatTimecode(recordingSec)})
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                Enregistrer
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowDraftSidebar((v) => !v)}
            aria-pressed={showDraftSidebar}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
              showDraftSidebar
                ? 'bg-[#18181B] text-white'
                : 'bg-[#F6F5F0] text-[#18181B] hover:bg-[#ECEAE2] border border-[#E5E2D9]'
            }`}
          >
            <StickyNote className="w-3.5 h-3.5" aria-hidden="true" />
            Brouillon
          </button>
        </div>
      </section>

      {/* Active Voice Karaoke Status Strip (appears cleanly during playback) */}
      {activeVoiceChunk && (
        <div
          role="status"
          aria-live="polite"
          data-testid="prompter-voice-now-playing"
          className="px-4 py-2.5 bg-[#FFFDF8] border border-[#E5E2D9] rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="inline-flex items-center gap-1 font-semibold text-[#C2410C]">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              {activeEngineLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#18181B]">
              {String(activeVoiceChunk.segmentIndex + 1).padStart(2, '0')}.{' '}
              {activeVoiceChunk.segmentTitle}
            </span>
            <span className="text-[#71717A] font-mono">
              ({activeChunkIndex + 1}/{narrationQueue.length})
            </span>
          </div>
          <span className="text-[11px] text-[#71717A]">
            Continue même écran verrouillé ou hors de l’app
          </span>
        </div>
      )}

      {statusMessage && (
        <p role="status" className="text-xs font-medium text-[#92400E] px-2">
          {statusMessage}
        </p>
      )}

      {/* Teleprompter Reading Surface (Live Karaoke) + Side-by-Side Brouillon */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div
          ref={scrollContainerRef}
          className={`${
            showDraftSidebar ? 'lg:col-span-8' : 'lg:col-span-12'
          } h-[68vh] overflow-y-auto rounded-xl border p-6 lg:px-14 lg:py-10 transition-colors ${
            darkMode
              ? 'bg-[#141417] text-[#F4F4F5] border-[#27272A]'
              : 'bg-[#FDFBF4] text-[#18181B] border-[#D6D3C9]'
          }`}
        >
          <div className="max-w-3xl mx-auto space-y-12 pb-32">
            {episode.segments.map((seg, idx) => {
              const runs = splitTextWithAnnotations(seg.scriptText, seg.comments ?? []);
              const isVoiceActiveSeg = activeVoiceChunk?.segmentId === seg.id;
              const segKaraokeMatch =
                activeSegmentKaraokeMatch?.segmentId === seg.id
                  ? activeSegmentKaraokeMatch.match
                  : null;
              let runOffsetCursor = 0;

              return (
                <article
                  key={seg.id}
                  id={`prompter-seg-${seg.id}`}
                  className={`space-y-4 rounded-xl transition-colors ${
                    highlightedSegId === seg.id || isVoiceActiveSeg
                      ? 'ring-2 ring-[#F59E0B]/70 p-3 -mx-3 bg-[#F59E0B]/10'
                      : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-current/15">
                    <span className="text-xs font-mono uppercase tracking-wider text-[#F59E0B]">
                      {String(idx + 1).padStart(2, '0')}. {seg.title}
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => startVoiceFromSegment(seg.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#F59E0B] hover:underline cursor-pointer"
                      >
                        <Headphones className="w-3.5 h-3.5" aria-hidden="true" />
                        Écouter dès ici
                      </button>
                      {seg.soundCueId && (
                        <button
                          type="button"
                          onClick={() => onPreviewSoundCue(seg.soundCueId!)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#F59E0B] hover:underline cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Extrait sonore
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    style={{ fontSize: `${fontSizePx}px` }}
                    className={`leading-[1.6] font-medium whitespace-pre-wrap ${
                      !darkMode && appearance.writingFont === 'calligraphie'
                        ? 'font-hand'
                        : 'font-sans'
                    }`}
                  >
                    {runs.length === 0 ? (
                      <span className="opacity-50">(Segment sans texte pour le moment)</span>
                    ) : (
                      runs.map((run, rIdx) => {
                        const runStart = runOffsetCursor;
                        runOffsetCursor += run.text.length;
                        const slices = segKaraokeMatch
                          ? sliceTextForKaraoke(run.text, runStart, segKaraokeMatch)
                          : [{ kind: 'upcoming' as const, text: run.text }];

                        const renderedSlices = slices.map((slice, sIdx) => {
                          if (slice.kind === 'active') {
                            return (
                              <mark
                                key={sIdx}
                                data-karaoke-active="true"
                                className="bg-[#F59E0B] text-[#18181B] px-1 rounded font-bold shadow-xs"
                              >
                                {slice.text}
                              </mark>
                            );
                          }
                          if (slice.kind === 'spoken') {
                            return (
                              <span key={sIdx} className="opacity-65">
                                {slice.text}
                              </span>
                            );
                          }
                          return <span key={sIdx}>{slice.text}</span>;
                        });

                        if (!run.comment) {
                          return <span key={rIdx}>{renderedSlices}</span>;
                        }
                        return (
                          <span key={`${run.comment.id}-${rIdx}`} className="inline">
                            <span className="underline decoration-[#F59E0B] decoration-2 underline-offset-4 bg-[#F59E0B]/20 px-1 rounded">
                              {renderedSlices}
                            </span>
                            {showRecordingNotes && (
                              <span className="mx-1.5 text-sm font-sans font-normal text-[#F59E0B]">
                                [{run.comment.comment}]
                              </span>
                            )}
                          </span>
                        );
                      })
                    )}
                  </div>

                  {seg.concreteExample && (
                    <p className="text-sm opacity-75 italic">
                      Rappel exemple social : {seg.concreteExample}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {showDraftSidebar && (
          <aside
            aria-label="Panneau brouillon à côté du prompteur"
            className="lg:col-span-4 bg-white border border-[#E5E2D9] rounded-xl p-5 space-y-4"
          >
            <div className="space-y-1">
              <h2 className="font-display text-base font-semibold text-[#18181B] flex items-center gap-1.5">
                <StickyNote className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
                Brouillon à côté
              </h2>
              <p className="text-xs text-[#52525B] leading-relaxed">
                Notez vos pensées spontanées pendant la répétition, puis injectez-les au bon
                endroit dans le texte du prompteur.
              </p>
            </div>

            <div>
              <label
                htmlFor="prompter-target-segment"
                className="block text-xs font-medium text-[#52525B] mb-1.5"
              >
                Segment où ajouter la pensée
              </label>
              <select
                id="prompter-target-segment"
                aria-label="Segment cible du prompteur"
                value={effectiveTargetId}
                onChange={(e) => setTargetSegmentId(e.target.value)}
                className="w-full px-3 py-2 text-xs text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
              >
                <option value="auto">Auto : segment & endroit adéquat selon le sujet</option>
                {episode.segments.map((seg, i) => (
                  <option key={seg.id} value={seg.id}>
                    {String(i + 1).padStart(2, '0')}. {seg.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="prompter-draft-thoughts"
                className="block text-xs font-medium text-[#52525B] mb-1.5"
              >
                Vos pensées à ajouter
              </label>
              <textarea
                id="prompter-draft-thoughts"
                aria-label="Brouillon de pensées à côté du prompteur"
                rows={7}
                value={episode.draftThoughts ?? ''}
                onChange={(e) => {
                  setDraftStatusMsg('');
                  onUpdateEpisode({ ...episode, draftThoughts: e.target.value });
                }}
                placeholder="Écrivez ici une idée, une anecdote ou une précision (ex. sur les lunettes) : elle sera insérée exactement au bon endroit du prompteur..."
                className="w-full px-3 py-2.5 text-sm text-[#18181B] bg-[#FFFDF5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C] leading-relaxed"
              />
            </div>

            {draftDetection.detectedConcepts.length > 0 && (
              <p
                data-testid="prompter-detected-concepts"
                className="text-xs text-[#71717A] leading-relaxed"
              >
                <span className="font-medium text-[#52525B]">Concepts clés détectés :</span>{' '}
                {draftDetection.detectedConcepts.join(' · ')}
              </p>
            )}

            {draftDetection.repeatedThoughts.length > 0 &&
              dismissedDraftHintFor !== (episode.draftThoughts ?? '') && (
                <div
                  role="status"
                  aria-live="polite"
                  data-testid="prompter-concept-suggestion"
                  className="px-3 py-2 bg-[#FFFBEB]/85 border border-[#FDE68A] rounded-lg space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <p className="text-xs font-medium text-[#92400E] flex items-center gap-1">
                      <GitBranch className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>
                        Idée déjà exposée dans{' '}
                        <strong>
                          {String(draftDetection.repeatedThoughts[0].segmentIndex).padStart(2, '0')}
                          . {draftDetection.repeatedThoughts[0].segmentTitle}
                        </strong>
                      </span>
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          scrollToPrompterSegment(draftDetection.repeatedThoughts[0].segmentId)
                        }
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-[#92400E] underline underline-offset-2 cursor-pointer"
                      >
                        <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                        Aller au segment{' '}
                        {String(draftDetection.repeatedThoughts[0].segmentIndex).padStart(2, '0')}
                      </button>
                      <button
                        type="button"
                        aria-label="Masquer la suggestion du prompteur"
                        onClick={() => setDismissedDraftHintFor(episode.draftThoughts ?? '')}
                        className="text-xs text-[#92400E]/70 hover:text-[#92400E] cursor-pointer"
                      >
                        Ignorer
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-[#78350F]">
                    Concepts en commun :{' '}
                    <span className="font-medium">
                      {draftDetection.repeatedThoughts[0].matchedConcepts.join(', ')}
                    </span>
                  </p>
                  <p className="text-xs text-[#78350F]/90 italic line-clamp-2">
                    « {draftDetection.repeatedThoughts[0].matchedExcerpt} »
                  </p>
                </div>
              )}

            {smartDraftPlan && (
              <div className="px-3 py-2 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg space-y-1">
                <p className="text-xs font-semibold text-[#18181B]">
                  Cible :{' '}
                  <span className="text-[#C2410C]">
                    {String(smartDraftPlan.targetSegmentIndex).padStart(2, '0')}.{' '}
                    {smartDraftPlan.targetSegmentTitle}
                  </span>
                </p>
                <p className="text-xs text-[#71717A] italic line-clamp-2">
                  {smartDraftPlan.insertionMode === 'after_sentence' ? 'Après : ' : 'Passage : '}«{' '}
                  {smartDraftPlan.anchorExcerpt} »
                </p>
              </div>
            )}

            <label className="inline-flex items-center gap-2 text-xs text-[#52525B] cursor-pointer">
              <input
                type="checkbox"
                checked={clearDraftAfterAdd}
                onChange={(e) => setClearDraftAfterAdd(e.target.checked)}
                className="accent-[#C2410C]"
              />
              Vider le brouillon après l’ajout au prompteur
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handlePolishDraft}
                disabled={!(episode.draftThoughts ?? '').trim()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
                Corriger
              </button>

              <button
                type="button"
                onClick={handleAppendToPrompter}
                disabled={!(episode.draftThoughts ?? '').trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                Ajouter dans le texte du prompteur
              </button>
            </div>

            {draftStatusMsg && (
              <p role="status" className="text-xs font-medium text-[#15803D]">
                {draftStatusMsg}
              </p>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
