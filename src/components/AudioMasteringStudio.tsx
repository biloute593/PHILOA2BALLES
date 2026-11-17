import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  EyeOff,
  Headphones,
  Mic,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from 'lucide-react';
import type {
  CueKind,
  Episode,
  MasteringSettings,
  TimelineClip,
} from '../types/podcast';
import { MASTERING_PRESETS, SOUND_EXTRACTS } from '../data/seedData';
import { formatTimecode } from '../utils/audioDsp';
import {
  analyzeVoiceSamplesMetrics,
  compareVoiceWithPrecepteur,
  PRECEPTEUR_SPECTRUM_BANDS,
  type VoiceBufferMetrics,
} from '../utils/toneAnalyzer';
import {
  applyPitchShiftToAudioBuffer,
  buildMasteringChain,
  extractWaveformPeaks,
  renderTimelineToWavBlob,
  updateMasteringChainParams,
  type MasteringChainNodes,
} from '../utils/webAudioEngine';
import { EqCurveCanvas } from './EqCurveCanvas';
import { useAdaptiveTrigger } from '../hooks/useAdaptiveTrigger';
import { splitTextWithAnnotations } from '../utils/wordAnnotations';
import {
  createClipClipboardCopy,
  cutClipFromTimeline,
  moveClipStartTime,
  pasteClipAtPlayhead,
  splitClipAtTime,
} from '../utils/timelineEditing';

interface AudioMasteringStudioProps {
  episode: Episode;
  activeSegmentId: string;
  onSelectSegment?: (segmentId: string) => void;
  mastering: MasteringSettings;
  onChangeMastering: (next: MasteringSettings) => void;
  clips: TimelineClip[];
  onChangeClips: (next: TimelineClip[]) => void;
  audioBuffers: Record<string, AudioBuffer>;
  onRegisterAudioBuffer: (key: string, buffer: AudioBuffer, blob?: Blob) => void;
  onPreviewSoundCue: (cueId: string) => void;
  getAudioContext: () => AudioContext;
}

const STUDIO_CUE_DOT: Record<CueKind, string> = {
  intonation: 'border-b-2 border-[#C2410C]/70',
  pause: 'border-b-2 border-dashed border-[#0F766E]/70',
  exemple: 'border-b-2 border-[#B45309]/70 bg-[#FEF3C7]/45 px-0.5 rounded',
  rappel: 'border-b-2 border-[#52525B]/60',
};

export function AudioMasteringStudio({
  episode,
  activeSegmentId,
  onSelectSegment,
  mastering,
  onChangeMastering,
  clips,
  onChangeClips,
  audioBuffers,
  onRegisterAudioBuffer,
  onPreviewSoundCue,
  getAudioContext,
}: AudioMasteringStudioProps) {
  const [selectedClipId, setSelectedClipId] = useState<string>(clips[0]?.id ?? '');
  const [playheadSec, setPlayheadSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [micError, setMicError] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [gainReductionDb, setGainReductionDb] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState('');
  const [pxPerSec, setPxPerSec] = useState(38);
  const [showPrecepteurOverlay, setShowPrecepteurOverlay] = useState(true);
  const [toneFeedback, setToneFeedback] = useState('');
  const [manualAnalysisNonce, setManualAnalysisNonce] = useState(0);

  // Live Studio Script Reader state (scroll & switch segments freely while recording)
  const [readingSegmentId, setReadingSegmentId] = useState<string>(
    activeSegmentId || episode.segments[0]?.id || ''
  );
  const [showLiveScript, setShowLiveScript] = useState(true);
  const [isScriptAutoScrolling, setIsScriptAutoScrolling] = useState(false);
  const [scriptWpm, setScriptWpm] = useState(130);
  const [scriptFontSize, setScriptFontSize] = useState(19);
  const [showScriptOptions, setShowScriptOptions] = useState(false);
  const [isBackgroundPlaying, setIsBackgroundPlaying] = useState(false);

  // Timeline Cut/Copy/Paste montage state
  const [clipboardClip, setClipboardClip] = useState<TimelineClip | null>(null);
  const [timelineStatusMsg, setTimelineStatusMsg] = useState('');

  // Adaptive progressive disclosure drawers (PC double-click / mobile long-press)
  const [showFmDetails, setShowFmDetails] = useState(false);
  const [showEqDetails, setShowEqDetails] = useState(false);
  const [showCompDetails, setShowCompDetails] = useState(false);
  const [showToneDetails, setShowToneDetails] = useState(false);
  const [showClipTrimDetails, setShowClipTrimDetails] = useState(false);

  const scriptOptionsTrigger = useAdaptiveTrigger({
    onTrigger: () => setShowScriptOptions((v) => !v),
  });
  const fmTrigger = useAdaptiveTrigger({
    onTrigger: () => setShowFmDetails((v) => !v),
  });
  const eqTrigger = useAdaptiveTrigger({
    onTrigger: () => setShowEqDetails((v) => !v),
  });
  const compTrigger = useAdaptiveTrigger({
    onTrigger: () => setShowCompDetails((v) => !v),
  });
  const toneTrigger = useAdaptiveTrigger({
    onTrigger: () => setShowToneDetails((v) => !v),
  });
  const clipInspectorTrigger = useAdaptiveTrigger({
    onTrigger: () => setShowClipTrimDetails((v) => !v),
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const studioScriptScrollRef = useRef<HTMLDivElement | null>(null);
  const scriptScrollLastTickRef = useRef<number | null>(null);
  const readingSegmentIdRef = useRef<string>(readingSegmentId);
  readingSegmentIdRef.current = readingSegmentId;

  const activePlaybackNodesRef = useRef<{
    sources: AudioBufferSourceNode[];
    chain: MasteringChainNodes | null;
    startedAtCtx: number;
    startedOffsetSec: number;
    rafId: number;
  }>({
    sources: [],
    chain: null,
    startedAtCtx: 0,
    startedOffsetSec: 0,
    rafId: 0,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recRafRef = useRef<number>(0);
  const recTimerRef = useRef<number>(0);
  const recordingSecRef = useRef(0);
  const recordingMarkersRef = useRef<Array<{ segmentId: string; atSec: number }>>([]);
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const backgroundUrlRef = useRef<string | null>(null);
  const pitchCacheRef = useRef<Record<string, AudioBuffer>>({});

  const selectedClip = useMemo(
    () => clips.find((c) => c.id === selectedClipId) ?? clips[0] ?? null,
    [clips, selectedClipId]
  );

  // Scroll the live script reader to the chosen segment cleanly without ever interrupting recording
  const scrollToStudioSegment = (segId: string, behavior: ScrollBehavior = 'smooth') => {
    if (isRecording && recordingMarkersRef.current.at(-1)?.segmentId !== segId) {
      recordingMarkersRef.current.push({ segmentId: segId, atSec: recordingSecRef.current });
    }
    setReadingSegmentId(segId);
    onSelectSegment?.(segId);
    const container = studioScriptScrollRef.current;
    const target = container?.querySelector<HTMLElement>(
      `[data-studio-segment-id="${segId}"]`
    );
    if (container && target) {
      const top = Math.max(0, target.offsetTop - container.offsetTop - 8);
      container.scrollTo({ top, behavior });
    }
  };

  // Sync reader position when opening Studio or changing activeSegmentId externally
  useEffect(() => {
    if (!activeSegmentId) return;
    setReadingSegmentId(activeSegmentId);
    if (!showLiveScript) return;
    const timer = window.setTimeout(() => {
      const container = studioScriptScrollRef.current;
      const target = container?.querySelector<HTMLElement>(
        `[data-studio-segment-id="${activeSegmentId}"]`
      );
      if (container && target) {
        const top = Math.max(0, target.offsetTop - container.offsetTop - 8);
        container.scrollTo({ top, behavior: 'auto' });
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [activeSegmentId, episode.id, showLiveScript]);

  // Smooth optional auto-scroll while recording / reading in Studio
  useEffect(() => {
    if (!isScriptAutoScrolling || !showLiveScript) {
      scriptScrollLastTickRef.current = null;
      return;
    }
    let rafId = 0;
    const pxPerSecScroll = (scriptWpm / 130) * 28;
    const step = (now: number) => {
      const el = studioScriptScrollRef.current;
      if (el) {
        if (scriptScrollLastTickRef.current !== null) {
          const dt = (now - scriptScrollLastTickRef.current) / 1000;
          el.scrollTop += pxPerSecScroll * dt;
        }
        scriptScrollLastTickRef.current = now;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
      scriptScrollLastTickRef.current = null;
    };
  }, [isScriptAutoScrolling, scriptWpm, showLiveScript]);

  const activeVoiceClip = useMemo(() => {
    if (selectedClip && selectedClip.track === 'voix' && audioBuffers[selectedClip.audioKey]) {
      return selectedClip;
    }
    return clips.find((c) => c.track === 'voix' && audioBuffers[c.audioKey]) ?? null;
  }, [selectedClip, clips, audioBuffers]);

  const rawVoiceMetrics = useMemo<{ label: string; metrics: VoiceBufferMetrics } | null>(() => {
    void manualAnalysisNonce;
    const key = activeVoiceClip?.audioKey ?? (audioBuffers.demo_voice_take ? 'demo_voice_take' : '');
    const buf = key ? audioBuffers[key] : undefined;
    if (!buf) return null;
    const channelData = buf.getChannelData(0);
    const startSample = activeVoiceClip
      ? Math.max(0, Math.floor(activeVoiceClip.trimStartSec * buf.sampleRate))
      : 0;
    const endSample = activeVoiceClip
      ? Math.min(channelData.length, Math.floor(activeVoiceClip.trimEndSec * buf.sampleRate))
      : channelData.length;
    const slice =
      endSample - startSample > 512 ? channelData.subarray(startSample, endSample) : channelData;
    return {
      label: activeVoiceClip?.label ?? 'Voix Démo (référence)',
      metrics: analyzeVoiceSamplesMetrics(slice, buf.sampleRate),
    };
  }, [activeVoiceClip, audioBuffers, manualAnalysisNonce]);

  const toneAnalysis = useMemo(() => {
    if (!rawVoiceMetrics) return null;
    return compareVoiceWithPrecepteur(rawVoiceMetrics.metrics, mastering, rawVoiceMetrics.label);
  }, [rawVoiceMetrics, mastering]);

  const totalTimelineSec = useMemo(() => {
    return Math.max(
      12,
      clips.reduce(
        (max, c) => Math.max(max, c.startOnTimelineSec + (c.trimEndSec - c.trimStartSec)),
        0
      ) + 2
    );
  }, [clips]);

  // Keep live mastering parameters synchronized during playback
  useEffect(() => {
    const chain = activePlaybackNodesRef.current.chain;
    if (chain && isPlaying) {
      const ctx = getAudioContext();
      updateMasteringChainParams(chain, mastering, ctx.currentTime);
    }
  }, [mastering, isPlaying, getAudioContext]);

  const stopPlayback = () => {
    const state = activePlaybackNodesRef.current;
    cancelAnimationFrame(state.rafId);
    for (const s of state.sources) {
      try {
        s.stop();
        s.disconnect();
      } catch {
        // Ignore already stopped
      }
    }
    state.sources = [];
    if (state.chain) {
      state.chain.dispose();
      state.chain = null;
    }
    setIsPlaying(false);
    setGainReductionDb(0);
  };

  useEffect(() => {
    return () => {
      stopPlayback();
      backgroundAudioRef.current?.pause();
      backgroundAudioRef.current?.removeAttribute('src');
      if (backgroundUrlRef.current) URL.revokeObjectURL(backgroundUrlRef.current);
      cancelAnimationFrame(recRafRef.current);
      window.clearInterval(recTimerRef.current);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPlayback = async (fromSec = playheadSec) => {
    stopPlayback();
    if (clips.length === 0) return;

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const chain = buildMasteringChain(ctx, mastering);
    chain.output.connect(ctx.destination);
    activePlaybackNodesRef.current.chain = chain;
    activePlaybackNodesRef.current.startedAtCtx = ctx.currentTime;
    activePlaybackNodesRef.current.startedOffsetSec = fromSec;

    const sources: AudioBufferSourceNode[] = [];
    const startWall = ctx.currentTime + 0.03;

    for (const clip of clips) {
      const rawBuf = audioBuffers[clip.audioKey];
      if (!rawBuf) continue;

      const clipLen = Math.max(0.05, clip.trimEndSec - clip.trimStartSec);
      const clipEndOnTimeline = clip.startOnTimelineSec + clipLen;
      if (clipEndOnTimeline <= fromSec) continue;

      let playBuf = rawBuf;
      if (
        clip.track === 'voix' &&
        !mastering.bypass &&
        Math.abs(mastering.pitchSemitones) >= 0.05
      ) {
        const cacheKey = `${clip.audioKey}_${mastering.pitchSemitones.toFixed(2)}`;
        if (!pitchCacheRef.current[cacheKey]) {
          pitchCacheRef.current[cacheKey] = applyPitchShiftToAudioBuffer(
            ctx,
            rawBuf,
            mastering.pitchSemitones
          );
        }
        playBuf = pitchCacheRef.current[cacheKey];
      }

      const src = ctx.createBufferSource();
      src.buffer = playBuf;

      const gain = ctx.createGain();
      const relSkip = Math.max(0, fromSec - clip.startOnTimelineSec);
      const when = startWall + Math.max(0, clip.startOnTimelineSec - fromSec);
      const offset = Math.min(rawBuf.duration - 0.02, clip.trimStartSec + relSkip);
      const duration = Math.max(0.02, clipLen - relSkip);

      gain.gain.setValueAtTime(clip.volume, when);
      src.connect(gain);
      if (clip.track === 'voix') {
        gain.connect(chain.input);
      } else {
        gain.connect(ctx.destination);
      }

      src.start(when, offset, duration);
      sources.push(src);
    }

    activePlaybackNodesRef.current.sources = sources;
    setIsPlaying(true);

    const tick = () => {
      const elapsed = ctx.currentTime - startWall;
      const currentPos = fromSec + Math.max(0, elapsed);
      setPlayheadSec(currentPos);

      if (activePlaybackNodesRef.current.chain) {
        setGainReductionDb(
          Math.abs(Math.round(activePlaybackNodesRef.current.chain.compressor.reduction * 10) / 10)
        );
      }

      if (currentPos >= totalTimelineSec - 0.5) {
        stopPlayback();
        setPlayheadSec(0);
        return;
      }
      activePlaybackNodesRef.current.rafId = requestAnimationFrame(tick);
    };
    activePlaybackNodesRef.current.rafId = requestAnimationFrame(tick);
  };

  const handleStartRecording = async () => {
    setMicError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError(
        'Votre navigateur ne permet pas la capture micro ici. Utilisez la prise démo ou importez un fichier audio.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;

      const ctx = getAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const meterData = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        analyser.getByteTimeDomainData(meterData);
        let peak = 0;
        for (let i = 0; i < meterData.length; i++) {
          peak = Math.max(peak, Math.abs((meterData[i] - 128) / 128));
        }
        setMicLevel(peak);
        recRafRef.current = requestAnimationFrame(updateMeter);
      };
      recRafRef.current = requestAnimationFrame(updateMeter);

      const preferredMime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) =>
        typeof MediaRecorder.isTypeSupported === 'function' ? MediaRecorder.isTypeSupported(type) : false
      );
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = async () => {
        cancelAnimationFrame(recRafRef.current);
        window.clearInterval(recTimerRef.current);
        setMicLevel(0);
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        try {
          const arr = await blob.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arr);
          const key = `take_${Date.now()}`;
          onRegisterAudioBuffer(key, decoded, blob);

          const markers = recordingMarkersRef.current.length > 0
            ? recordingMarkersRef.current
            : [{ segmentId: readingSegmentIdRef.current || activeSegmentId, atSec: 0 }];
          const finalDuration = decoded.duration;
          const nextStart = clips.reduce(
            (m, c) =>
              c.track === 'voix'
                ? Math.max(m, c.startOnTimelineSec + (c.trimEndSec - c.trimStartSec))
                : m,
            0
          );
          const newClips = markers.map((marker, index) => {
            const startSec = Math.max(0, Math.min(finalDuration - 0.05, marker.atSec));
            const endSec = Math.max(
              startSec + 0.05,
              Math.min(finalDuration, markers[index + 1]?.atSec ?? finalDuration)
            );
            const segment = episode.segments.find((s) => s.id === marker.segmentId);
            return {
              id: `clip-${Date.now()}-${index}`,
              label: segment ? `Voix — ${segment.title.slice(0, 26)}` : 'Nouvelle prise voix',
              track: 'voix' as const,
              sourceType: 'take' as const,
              audioKey: key,
              startOnTimelineSec: Number((nextStart + startSec).toFixed(2)),
              trimStartSec: Number(startSec.toFixed(2)),
              trimEndSec: Number(endSec.toFixed(2)),
              sourceDurationSec: Number(decoded.duration.toFixed(2)),
              volume: 1.0,
              fadeInSec: 0.08,
              fadeOutSec: 0.12,
              segmentId: marker.segmentId,
            };
          });
          onChangeClips([...clips, ...newClips]);
          setSelectedClipId(newClips[0]?.id ?? '');
          recordingMarkersRef.current = [];
        } catch {
          setMicError('Impossible de décoder la prise micro enregistrée.');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingSec(0);
      recordingSecRef.current = 0;
      recordingMarkersRef.current = [{
        segmentId: readingSegmentIdRef.current || activeSegmentId,
        atSec: 0,
      }];
      setIsRecordingPaused(false);
      setIsRecording(true);
      recTimerRef.current = window.setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          recordingSecRef.current += 1;
          setRecordingSec(recordingSecRef.current);
        }
      }, 1000);
    } catch {
      setMicError(
        'Microphone indisponible ou permission refusée. Vous pouvez utiliser la prise démo ci-dessous pour tester le mastering.'
      );
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsRecordingPaused(false);
  };

  const handleToggleRecordingPause = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause();
      setIsRecordingPaused(true);
    } else if (recorder.state === 'paused') {
      recorder.resume();
      setIsRecordingPaused(false);
    }
  };

  const handleBackgroundPlayback = async () => {
    const audio = backgroundAudioRef.current;
    if (!audio || clips.length === 0) return;
    if (isBackgroundPlaying) {
      audio.pause();
      setIsBackgroundPlaying(false);
      return;
    }

    setExportSuccessMsg('Préparation du mix pour la lecture écran verrouillé…');
    const blob = await renderTimelineToWavBlob(clips, audioBuffers, mastering);
    if (backgroundUrlRef.current) URL.revokeObjectURL(backgroundUrlRef.current);
    backgroundUrlRef.current = URL.createObjectURL(blob);
    audio.src = backgroundUrlRef.current;
    audio.onended = () => setIsBackgroundPlaying(false);
    await audio.play();
    setIsBackgroundPlaying(true);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `Épisode ${episode.number} — ${episode.title}`,
        artist: 'PHILOA2BALLES',
        album: 'Mix masterisé',
      });
      navigator.mediaSession.playbackState = 'playing';
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ctx = getAudioContext();
      const arr = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arr);
      const key = `import_${Date.now()}`;
      onRegisterAudioBuffer(key, decoded, file);

      const newClip: TimelineClip = {
        id: `clip-${Date.now()}`,
        label: file.name.replace(/\.[^.]+$/, '').slice(0, 30),
        track: 'voix',
        sourceType: 'imported',
        audioKey: key,
        startOnTimelineSec: Number(playheadSec.toFixed(2)),
        trimStartSec: 0,
        trimEndSec: Number(decoded.duration.toFixed(2)),
        sourceDurationSec: Number(decoded.duration.toFixed(2)),
        volume: 1.0,
        fadeInSec: 0.05,
        fadeOutSec: 0.1,
      };
      onChangeClips([...clips, newClip]);
      setSelectedClipId(newClip.id);
      setMicError('');
    } catch {
      setMicError('Format audio non supporté par le navigateur.');
    }
    e.target.value = '';
  };

  const handleAddSoundCueToTimeline = (cueId: string) => {
    const cue = SOUND_EXTRACTS.find((c) => c.id === cueId);
    const buf = audioBuffers[cueId];
    if (!cue || !buf) return;

    const newClip: TimelineClip = {
      id: `clip-cue-${Date.now()}`,
      label: cue.title,
      track: 'extrait',
      sourceType: 'sound_cue',
      audioKey: cueId,
      startOnTimelineSec: Number(playheadSec.toFixed(2)),
      trimStartSec: 0,
      trimEndSec: Number(buf.duration.toFixed(2)),
      sourceDurationSec: Number(buf.duration.toFixed(2)),
      volume: 0.55,
      fadeInSec: 0.15,
      fadeOutSec: 0.35,
    };
    onChangeClips([...clips, newClip]);
    setSelectedClipId(newClip.id);
  };

  const handleSplitSelectedClip = () => {
    if (!selectedClip) return;
    const res = splitClipAtTime(clips, selectedClip.id, playheadSec);
    setTimelineStatusMsg(res.message);
    if (!res.ok || !res.newClipId) return;
    onChangeClips(res.clips);
    setSelectedClipId(res.newClipId);
  };

  const handleCopySelectedClip = () => {
    if (!selectedClip) return;
    setClipboardClip(createClipClipboardCopy(selectedClip));
    setTimelineStatusMsg(
      `Bande « ${selectedClip.label} » copiée — placez le curseur et cliquez sur Coller.`
    );
  };

  const handleCutSelectedClip = () => {
    if (!selectedClip) return;
    const res = cutClipFromTimeline(clips, selectedClip.id);
    setTimelineStatusMsg(res.message);
    if (!res.ok || !res.clipboardClip) return;
    setClipboardClip(res.clipboardClip);
    onChangeClips(res.nextClips);
    setSelectedClipId(res.nextSelectedId);
  };

  const handlePasteClipAtPlayhead = () => {
    const res = pasteClipAtPlayhead(clips, clipboardClip, playheadSec);
    setTimelineStatusMsg(res.message);
    if (!res.ok || !res.pastedClip) return;
    onChangeClips(res.nextClips);
    setSelectedClipId(res.pastedClip.id);
  };

  const handleMoveClip = (clipId: string, nextStartSec: number) => {
    onChangeClips(moveClipStartTime(clips, clipId, nextStartSec));
  };

  const updateSelectedClip = (patch: Partial<TimelineClip>) => {
    if (!selectedClip) return;
    onChangeClips(clips.map((c) => (c.id === selectedClip.id ? { ...c, ...patch } : c)));
  };

  const handleTrimClip = (clipId: string, edge: 'start' | 'end', nextValue: number) => {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return;
    const patch = edge === 'start'
      ? { trimStartSec: Math.max(0, Math.min(clip.trimEndSec - 0.2, nextValue)) }
      : { trimEndSec: Math.min(clip.sourceDurationSec, Math.max(clip.trimStartSec + 0.2, nextValue)) };
    onChangeClips(clips.map((item) => (item.id === clipId ? { ...item, ...patch } : item)));
  };

  const handleDeleteClip = (clipId: string) => {
    const remaining = clips.filter((c) => c.id !== clipId);
    onChangeClips(remaining);
    if (selectedClipId === clipId) {
      setSelectedClipId(remaining[0]?.id ?? '');
    }
    setTimelineStatusMsg('Bande retirée de la timeline.');
  };

  const applyPreset = (presetId: string) => {
    const preset = MASTERING_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onChangeMastering({
      presetId: preset.id,
      bypass: false,
      ...preset.settings,
    });
  };

  const handleApplyToneSuggestion = (scope: 'all' | 'eq' | 'compressor') => {
    if (!toneAnalysis) return;
    if (scope === 'all') {
      onChangeMastering(toneAnalysis.suggestedSettings);
      setToneFeedback(
        'Réglages suggérés (Égaliseur + Compresseur) appliqués pour se rapprocher du timbre du Précepteur.'
      );
    } else if (scope === 'eq') {
      onChangeMastering({
        ...mastering,
        presetId: 'custom',
        ...toneAnalysis.suggestedEqPatch,
      });
      setToneFeedback('Ajustements automatiques de l’égaliseur appliqués.');
    } else {
      onChangeMastering({
        ...mastering,
        presetId: 'custom',
        ...toneAnalysis.suggestedCompressorPatch,
      });
      setToneFeedback('Ajustements automatiques du compresseur appliqués.');
    }
  };

  const handleExportWav = async () => {
    if (clips.length === 0) return;
    setIsExporting(true);
    setExportSuccessMsg('');
    try {
      const wavBlob = await renderTimelineToWavBlob(clips, audioBuffers, mastering);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `philoa2balles-ep${episode.number}-master.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportSuccessMsg(
        `Master WAV généré (${(wavBlob.size / 1024).toFixed(0)} Ko) avec mastering vocal appliqué.`
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-6">
      {/* Studio Capture & Live Multi-Segment Script Reader */}
      <section className="bg-white border border-[#E5E2D9] rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-[#71717A]">
              <span>Épisode {episode.number}</span>
              <span aria-hidden="true">·</span>
              <span>{episode.workTitle}</span>
            </div>
            <h1 className="font-display text-xl font-semibold text-[#18181B]">
              Studio d’Enregistrement & Mastering Vocal
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isRecording ? (
              <button
                type="button"
                data-testid="studio-record-start-btn"
                onClick={handleStartRecording}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#C2410C] hover:bg-[#9A3412] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Mic className="w-4 h-4" aria-hidden="true" />
                Enregistrer ma voix
              </button>
            ) : (
              <>
                <button
                  type="button"
                  data-testid="studio-record-pause-btn"
                  onClick={handleToggleRecordingPause}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#18181B] bg-[#FEF3C7] hover:bg-[#FDE68A] border border-[#F59E0B]/40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isRecordingPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  {isRecordingPaused ? 'Reprendre' : 'Pause'}
                </button>
                <button
                  type="button"
                  data-testid="studio-record-stop-btn"
                  onClick={handleStopRecording}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  Arrêter ({formatTimecode(recordingSec)})
                </button>
              </>
            )}

            {isRecording && (
              <div className="flex items-center gap-2 px-3 py-2 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg">
                <span className="text-xs font-medium text-[#DC2626]">{isRecordingPaused ? 'Micro en pause' : 'Micro actif'}</span>
                <div className="w-24 h-2 bg-[#E5E2D9] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#C2410C] transition-all duration-75"
                    style={{ width: `${Math.min(100, Math.round(micLevel * 180))}%` }}
                  />
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] border border-[#E5E2D9] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              Importer audio
            </button>

            <button
              type="button"
              onClick={() => void handleBackgroundPlayback()}
              disabled={clips.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#0F766E] bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#99F6E4] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Headphones className="w-4 h-4" aria-hidden="true" />
              {isBackgroundPlaying ? 'Arrêter lecture verrouillée' : 'Lire écran verrouillé'}
            </button>
            <audio ref={backgroundAudioRef} className="hidden" preload="auto" />

            <button
              type="button"
              data-testid="studio-toggle-script-btn"
              onClick={() => setShowLiveScript((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#52525B] bg-[#FAF9F5] hover:bg-[#F2F0E8] border border-[#E5E2D9] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showLiveScript ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                  Masquer texte
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  Afficher texte
                </>
              )}
            </button>
          </div>
        </div>

        {/* Integrated Live Script Reader while recording across all segments */}
        {showLiveScript && episode.segments.length > 0 && (
          <div
            data-testid="studio-live-script-panel"
            className="border-t border-[#ECEAE2] bg-[#FAF9F5]"
          >
            {/* Script Panel Header + Progressive Options */}
            <div className="px-4 sm:px-5 py-2.5 border-b border-[#ECEAE2] flex flex-wrap items-center justify-between gap-2 bg-[#F6F5F0]/80">
              <div
                data-testid="studio-script-options-trigger"
                {...scriptOptionsTrigger.triggerProps}
                title="Double-clic (PC) ou appui long (mobile) pour régler taille et vitesse du texte"
                className="flex flex-wrap items-center gap-2 cursor-pointer select-none"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-[#C2410C]">
                  Texte en direct
                </span>
                <span className="text-xs text-[#71717A]">
                  <span className="hidden sm:inline" aria-hidden="true">· </span>
                  Défilez ou changez de segment sans couper le micro
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="studio-script-autoscroll-btn"
                  aria-pressed={isScriptAutoScrolling}
                  onClick={() => setIsScriptAutoScrolling((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                    isScriptAutoScrolling
                      ? 'bg-[#C2410C] text-white border-[#C2410C]'
                      : 'bg-white text-[#18181B] border-[#E5E2D9] hover:bg-[#ECEAE2]'
                  }`}
                >
                  {isScriptAutoScrolling ? (
                    <>
                      <Pause className="w-3 h-3" aria-hidden="true" />
                      Défilement actif
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" aria-hidden="true" />
                      Défilement auto
                    </>
                  )}
                </button>
              </div>
            </div>

            {showScriptOptions && (
              <div
                data-testid="studio-script-options-drawer"
                className="px-4 sm:px-5 py-3 bg-[#F2F0E8] border-b border-[#E5E2D9] flex flex-wrap items-center gap-6"
              >
                <div className="flex items-center gap-2 text-xs text-[#18181B]">
                  <label htmlFor="studio-script-size" className="font-medium">
                    Taille ({scriptFontSize}px)
                  </label>
                  <input
                    id="studio-script-size"
                    type="range"
                    min={15}
                    max={30}
                    step={1}
                    value={scriptFontSize}
                    onChange={(e) => setScriptFontSize(Number(e.target.value))}
                    className="w-28 accent-[#C2410C]"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-[#18181B]">
                  <label htmlFor="studio-script-wpm" className="font-medium">
                    Rythme ({scriptWpm} mots/min)
                  </label>
                  <input
                    id="studio-script-wpm"
                    type="range"
                    min={90}
                    max={175}
                    step={5}
                    value={scriptWpm}
                    onChange={(e) => setScriptWpm(Number(e.target.value))}
                    className="w-28 accent-[#C2410C]"
                  />
                </div>
              </div>
            )}

            {/* Quick Segment Jump Pills */}
            <div
              role="navigation"
              aria-label="Segments de l’épisode"
              className="px-4 sm:px-5 py-2 border-b border-[#ECEAE2] flex items-center gap-1.5 overflow-x-auto bg-white/70"
            >
              {episode.segments.map((seg, idx) => {
                const isActive = seg.id === readingSegmentId;
                return (
                  <button
                    key={seg.id}
                    type="button"
                    data-testid={`studio-seg-chip-${seg.id}`}
                    onClick={() => scrollToStudioSegment(seg.id, 'smooth')}
                    className={`px-2.5 py-1 text-xs rounded-md border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#18181B] text-white border-[#18181B] font-semibold'
                        : 'bg-white text-[#52525B] border-[#E5E2D9] hover:border-[#71717A]'
                    }`}
                  >
                    {String(idx + 1).padStart(2, '0')}. {seg.title}
                  </button>
                );
              })}
            </div>

            {/* Scrollable All-Segments Reader */}
            <div
              ref={studioScriptScrollRef}
              data-testid="studio-script-scroll"
              onScroll={(e) => {
                const container = e.currentTarget;
                const cards = container.querySelectorAll<HTMLElement>('[data-studio-segment-id]');
                let closestId = '';
                let bestDist = Infinity;
                const refTop = container.scrollTop + 48;
                cards.forEach((card) => {
                  const top = card.offsetTop - container.offsetTop;
                  const dist = Math.abs(top - refTop);
                  if (dist < bestDist) {
                    bestDist = dist;
                    closestId = card.dataset.studioSegmentId || '';
                  }
                });
                if (closestId && closestId !== readingSegmentIdRef.current) {
                  setReadingSegmentId(closestId);
                }
              }}
              className="max-h-[340px] sm:max-h-[390px] overflow-y-auto px-4 sm:px-6 py-4 space-y-5 scroll-smooth"
            >
              {episode.segments.map((seg, idx) => {
                const isActive = seg.id === readingSegmentId;
                const runs = splitTextWithAnnotations(seg.scriptText, seg.comments ?? []);
                return (
                  <article
                    key={seg.id}
                    id={`studio-script-seg-${seg.id}`}
                    data-studio-segment-id={seg.id}
                    data-testid={`studio-script-segment-${seg.id}`}
                    className={`rounded-lg border p-4 sm:p-5 transition-colors ${
                      isActive
                        ? 'bg-white border-[#C2410C]/40 border-l-4 border-l-[#C2410C] shadow-sm'
                        : 'bg-white/75 border-[#E5E2D9]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-[#F0EFEA]">
                      <h2 className="font-display text-sm sm:text-base font-semibold text-[#18181B]">
                        <span className="font-mono text-[#C2410C] mr-1.5">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        {seg.title}
                      </h2>
                      <span className="text-[11px] font-mono text-[#71717A] uppercase">
                        {seg.role}
                      </span>
                    </div>

                    <p
                      className="font-serif text-[#18181B] leading-relaxed whitespace-pre-wrap"
                      style={{ fontSize: `${scriptFontSize}px` }}
                    >
                      {runs.map((run, rIdx) =>
                        run.comment ? (
                          <span
                            key={rIdx}
                            title={run.comment.comment}
                            className={STUDIO_CUE_DOT[run.comment.cueKind]}
                          >
                            {run.text}
                          </span>
                        ) : (
                          <span key={rIdx}>{run.text}</span>
                        )
                      )}
                    </p>

                    {seg.concreteExample && (
                      <div className="mt-3 px-3 py-2 rounded bg-[#FAF9F5] border border-[#ECEAE2] text-xs text-[#52525B]">
                        <strong className="text-[#C2410C] font-semibold">Exemple : </strong>
                        {seg.concreteExample}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {micError && (
        <div
          role="status"
          className="px-4 py-3 bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E] rounded-lg"
        >
          {micError}
        </div>
      )}

      {/* Analog Precision Mastering Rack */}
      <section
        aria-label="Rack de mixage et mastering vocal"
        className="bg-[#18181B] text-[#F4F4F5] rounded-xl border border-[#27272A] p-6 space-y-5"
      >
        {/* Rack Header: Presets + A/B Comparator */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#27272A]">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#F59E0B]" aria-hidden="true" />
              <h2 className="text-base font-semibold tracking-wide text-white">
                Mastering & Adoucisseur de Tonalité Vocale
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="preset-select" className="sr-only">
              Préréglage de mastering
            </label>
            <select
              id="preset-select"
              value={mastering.presetId}
              onChange={(e) => applyPreset(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-[#27272A] text-white border border-[#3F3F46] rounded-lg focus:outline-none focus:border-[#F59E0B]"
            >
              {MASTERING_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  Preset : {preset.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              aria-pressed={mastering.bypass}
              onClick={() => onChangeMastering({ ...mastering, bypass: !mastering.bypass })}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mastering.bypass
                  ? 'bg-[#27272A] text-[#A1A1AA] border-[#3F3F46]'
                  : 'bg-[#F59E0B] text-[#18181B] border-[#F59E0B]'
              }`}
            >
              {mastering.bypass ? 'A/B : Voix Brute (Bypass)' : 'A/B : Voix Masterisée'}
            </button>

            <button
              type="button"
              onClick={() => (isPlaying ? stopPlayback() : startPlayback(playheadSec))}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#C2410C] hover:bg-[#EA580C] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                  Pause écoute
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  Écouter le mix
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3 DSP Hardware Modules separated by hairline dividers */}
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[#27272A]">
          {/* Module 1: Pitch & Frequency Modulation Softener */}
          <div className="py-2 lg:pr-6 space-y-3">
            <div
              data-testid="module-fm-trigger"
              {...fmTrigger.triggerProps}
              title="Double-clic (PC) ou appui long (mobile) pour régler les curseurs FM & hauteur"
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <h3
                className={`text-sm font-semibold transition-colors ${
                  showFmDetails ? 'text-[#F59E0B]' : 'text-[#F4F4F5]'
                }`}
              >
                01. Tonalité & modulation FM
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  applyPreset('precepteur_doux');
                }}
                className="text-xs text-[#A1A1AA] hover:text-white inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                Défaut
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-[#A1A1AA]">
              <span>
                Hauteur{' '}
                <strong className="text-[#F59E0B]">
                  {mastering.pitchSemitones > 0 ? '+' : ''}
                  {mastering.pitchSemitones.toFixed(1)} st
                </strong>
              </span>
              <span>·</span>
              <span>
                FM <strong className="text-[#E4E4E7]">{mastering.fmWarmthDepth}%</strong>
              </span>
              <span>·</span>
              <span>
                De-Esser <strong className="text-[#E4E4E7]">{mastering.deEsserDb.toFixed(1)} dB</strong>
              </span>
            </div>

            {showFmDetails && (
              <div data-testid="module-fm-controls" className="space-y-3 pt-1">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="dsp-pitch" className="text-[#D4D4D8]">
                      Hauteur (grave / aigu)
                    </label>
                    <span className="font-mono tabular-nums text-[#F59E0B]">
                      {mastering.pitchSemitones > 0 ? '+' : ''}
                      {mastering.pitchSemitones.toFixed(1)} st
                    </span>
                  </div>
                  <input
                    id="dsp-pitch"
                    type="range"
                    min={-6}
                    max={4}
                    step={0.5}
                    value={mastering.pitchSemitones}
                    onChange={(e) =>
                      onChangeMastering({
                        ...mastering,
                        presetId: 'custom',
                        pitchSemitones: Number(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="dsp-fm-depth" className="text-[#D4D4D8]">
                      Modulation FM (Adoucisseur)
                    </label>
                    <span className="font-mono tabular-nums text-[#F59E0B]">
                      {mastering.fmWarmthDepth}%
                    </span>
                  </div>
                  <input
                    id="dsp-fm-depth"
                    type="range"
                    min={0}
                    max={100}
                    step={2}
                    value={mastering.fmWarmthDepth}
                    onChange={(e) =>
                      onChangeMastering({
                        ...mastering,
                        presetId: 'custom',
                        fmWarmthDepth: Number(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="dsp-fm-rate" className="text-[#D4D4D8]">
                      Vitesse modulation FM
                    </label>
                    <span className="font-mono tabular-nums text-[#D4D4D8]">
                      {mastering.fmWarmthRateHz.toFixed(1)} Hz
                    </span>
                  </div>
                  <input
                    id="dsp-fm-rate"
                    type="range"
                    min={1.2}
                    max={6.5}
                    step={0.1}
                    value={mastering.fmWarmthRateHz}
                    onChange={(e) =>
                      onChangeMastering({
                        ...mastering,
                        presetId: 'custom',
                        fmWarmthRateHz: Number(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="dsp-deesser" className="text-[#D4D4D8]">
                      Anti-Aigu / De-Esser (5.8 kHz)
                    </label>
                    <span className="font-mono tabular-nums text-[#F59E0B]">
                      {mastering.deEsserDb.toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    id="dsp-deesser"
                    type="range"
                    min={-16}
                    max={0}
                    step={0.5}
                    value={mastering.deEsserDb}
                    onChange={(e) =>
                      onChangeMastering({
                        ...mastering,
                        presetId: 'custom',
                        deEsserDb: Number(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Module 2: Parametric 4-Band EQ + Live Curve */}
          <div className="py-4 lg:py-2 lg:px-6 space-y-3">
            <div
              data-testid="module-eq-trigger"
              {...eqTrigger.triggerProps}
              title="Double-clic (PC) ou appui long (mobile) pour ajuster les 4 bandes d’égalisation"
              className="flex items-center justify-between gap-2 cursor-pointer select-none"
            >
              <h3
                className={`text-sm font-semibold transition-colors ${
                  showEqDetails ? 'text-[#F59E0B]' : 'text-[#F4F4F5]'
                }`}
              >
                02. Égaliseur 4 bandes
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPrecepteurOverlay((v) => !v);
                }}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  showPrecepteurOverlay
                    ? 'border-[#2DD4BF]/50 text-[#2DD4BF] bg-[#2DD4BF]/10'
                    : 'border-[#3F3F46] text-[#A1A1AA]'
                }`}
              >
                {showPrecepteurOverlay ? 'Cible Précepteur : ON' : 'Cible Précepteur : OFF'}
              </button>
            </div>

            <EqCurveCanvas
              settings={mastering}
              toneComparison={showPrecepteurOverlay ? toneAnalysis : null}
            />

            {showPrecepteurOverlay && toneAnalysis && (
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#A1A1AA]">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-[#F59E0B] inline-block" /> Courbe EQ
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-[#38BDF8] inline-block" /> Voix actuelle
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-0.5 border-t border-dashed border-[#2DD4BF] inline-block" /> Style Le Précepteur
                </span>
              </div>
            )}

            {showEqDetails && (
              <div data-testid="module-eq-controls" className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-1">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="eq-hp" className="text-[#D4D4D8]">
                      Coupe-bas
                    </label>
                    <span className="font-mono tabular-nums text-[#D4D4D8]">
                      {mastering.highPassHz} Hz
                    </span>
                  </div>
                  <input
                    id="eq-hp"
                    type="range"
                    min={50}
                    max={160}
                    step={5}
                    value={mastering.highPassHz}
                    onChange={(e) =>
                      onChangeMastering({
                        ...mastering,
                        presetId: 'custom',
                        highPassHz: Number(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="eq-warmth" className="text-[#D4D4D8]">
                      Chaleur 210Hz
                    </label>
                    <span className="font-mono tabular-nums text-[#F59E0B]">
                      {mastering.lowMidWarmthDb > 0 ? '+' : ''}
                      {mastering.lowMidWarmthDb.toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    id="eq-warmth"
                    type="range"
                    min={-6}
                    max={10}
                    step={0.5}
                    value={mastering.lowMidWarmthDb}
                    onChange={(e) =>
                      onChangeMastering({
                        ...mastering,
                        presetId: 'custom',
                        lowMidWarmthDb: Number(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="eq-pres" className="text-[#D4D4D8]">
                      Présence 2.8k
                    </label>
                    <span className="font-mono tabular-nums text-[#D4D4D8]">
                      {mastering.presenceDb > 0 ? '+' : ''}
                      {mastering.presenceDb.toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    id="eq-pres"
                    type="range"
                    min={-8}
                    max={8}
                    step={0.5}
                    value={mastering.presenceDb}
                    onChange={(e) =>
                      onChangeMastering({
                        ...mastering,
                        presetId: 'custom',
                        presenceDb: Number(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="eq-air" className="text-[#D4D4D8]">
                      Aigus 7.5k
                    </label>
                    <span className="font-mono tabular-nums text-[#F59E0B]">
                      {mastering.highShelfDb > 0 ? '+' : ''}
                      {mastering.highShelfDb.toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    id="eq-air"
                    type="range"
                    min={-14}
                    max={6}
                    step={0.5}
                    value={mastering.highShelfDb}
                    onChange={(e) =>
                      onChangeMastering({
                        ...mastering,
                        presetId: 'custom',
                        highShelfDb: Number(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Module 3: Broadcast Compressor */}
          <div className="py-4 lg:py-2 lg:pl-6 space-y-3">
            <div
              data-testid="module-comp-trigger"
              {...compTrigger.triggerProps}
              title="Double-clic (PC) ou appui long (mobile) pour régler seuil, ratio et gain"
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <h3
                className={`text-sm font-semibold transition-colors ${
                  showCompDetails ? 'text-[#F59E0B]' : 'text-[#F4F4F5]'
                }`}
              >
                03. Compresseur broadcast
              </h3>
              <span className="font-mono text-xs tabular-nums text-[#F59E0B]">
                GR -{gainReductionDb.toFixed(1)} dB
              </span>
            </div>

            {/* Gain Reduction Meter */}
            <div className="h-2 bg-[#141417] rounded-full overflow-hidden border border-[#2E2E35]">
              <div
                className="h-full bg-[#F59E0B] transition-all duration-75"
                style={{ width: `${Math.min(100, gainReductionDb * 8)}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-[#A1A1AA]">
              <span>
                Seuil <strong className="text-[#E4E4E7]">{mastering.compThresholdDb} dB</strong>
              </span>
              <span>·</span>
              <span>
                Ratio <strong className="text-[#E4E4E7]">{mastering.compRatio.toFixed(1)}:1</strong>
              </span>
              <span>·</span>
              <span>
                Gain <strong className="text-[#F59E0B]">+{mastering.makeupGainDb.toFixed(1)} dB</strong>
              </span>
            </div>

            {showCompDetails && (
              <div data-testid="module-comp-controls" className="space-y-2.5 pt-1">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="comp-thresh" className="text-[#D4D4D8]">
                      Seuil (Threshold)
                    </label>
                    <span className="font-mono tabular-nums text-[#D4D4D8]">
                      {mastering.compThresholdDb} dB
                    </span>
                  </div>
                  <input
                    id="comp-thresh"
                    type="range"
                    min={-40}
                    max={-4}
                    step={1}
                    value={mastering.compThresholdDb}
                    onChange={(e) =>
                      onChangeMastering({
                        ...mastering,
                        presetId: 'custom',
                        compThresholdDb: Number(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <label htmlFor="comp-ratio" className="text-[#D4D4D8]">
                        Ratio
                      </label>
                      <span className="font-mono tabular-nums text-[#D4D4D8]">
                        {mastering.compRatio.toFixed(1)}:1
                      </span>
                    </div>
                    <input
                      id="comp-ratio"
                      type="range"
                      min={1}
                      max={12}
                      step={0.5}
                      value={mastering.compRatio}
                      onChange={(e) =>
                        onChangeMastering({
                          ...mastering,
                          presetId: 'custom',
                          compRatio: Number(e.target.value),
                        })
                      }
                      className="w-full studio-slider"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <label htmlFor="comp-makeup" className="text-[#D4D4D8]">
                        Makeup Gain
                      </label>
                      <span className="font-mono tabular-nums text-[#F59E0B]">
                        +{mastering.makeupGainDb.toFixed(1)} dB
                      </span>
                    </div>
                    <input
                      id="comp-makeup"
                      type="range"
                      min={-6}
                      max={12}
                      step={0.5}
                      value={mastering.makeupGainDb}
                      onChange={(e) =>
                        onChangeMastering({
                          ...mastering,
                          presetId: 'custom',
                          makeupGainDb: Number(e.target.value),
                        })
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <label htmlFor="comp-att" className="text-[#D4D4D8]">
                        Attaque
                      </label>
                      <span className="font-mono tabular-nums text-[#D4D4D8]">
                        {mastering.compAttackMs} ms
                      </span>
                    </div>
                    <input
                      id="comp-att"
                      type="range"
                      min={2}
                      max={50}
                      step={1}
                      value={mastering.compAttackMs}
                      onChange={(e) =>
                        onChangeMastering({
                          ...mastering,
                          presetId: 'custom',
                          compAttackMs: Number(e.target.value),
                        })
                      }
                      className="w-full studio-slider"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <label htmlFor="comp-rel" className="text-[#D4D4D8]">
                        Relâchement
                      </label>
                      <span className="font-mono tabular-nums text-[#D4D4D8]">
                        {mastering.compReleaseMs} ms
                      </span>
                    </div>
                    <input
                      id="comp-rel"
                      type="range"
                      min={40}
                      max={400}
                      step={10}
                      value={mastering.compReleaseMs}
                      onChange={(e) =>
                        onChangeMastering({
                          ...mastering,
                          presetId: 'custom',
                          compReleaseMs: Number(e.target.value),
                        })
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 04. Analyse de ton & Comparateur « Le Précepteur » */}
        {toneAnalysis && (
          <div
            data-testid="precepteur-tone-analyzer"
            className="pt-5 border-t border-[#27272A] space-y-4"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div
                data-testid="tone-details-trigger"
                {...toneTrigger.triggerProps}
                title="Double-clic (PC) ou appui long (mobile) pour voir le spectre 8 bandes et les recommandations détaillées"
                className="space-y-1 cursor-pointer select-none"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <Activity className="w-4 h-4 text-[#2DD4BF]" aria-hidden="true" />
                  <h3
                    className={`text-sm font-semibold transition-colors ${
                      showToneDetails ? 'text-[#2DD4BF]' : 'text-white'
                    }`}
                  >
                    04. Analyse de ton · Style Le Précepteur
                  </h3>
                  <span
                    data-testid="tone-conformity-score"
                    className={`font-mono text-xs font-semibold px-2 py-0.5 rounded border tabular-nums ${
                      toneAnalysis.conformityScore >= 82
                        ? 'bg-[#064E3B]/60 text-[#34D399] border-[#059669]/50'
                        : toneAnalysis.conformityScore >= 62
                          ? 'bg-[#451A03]/60 text-[#FBBF24] border-[#D97706]/50'
                          : 'bg-[#450A0A]/60 text-[#FCA5A5] border-[#DC2626]/50'
                    }`}
                  >
                    Conformité : {toneAnalysis.conformityScore}%
                  </span>
                </div>
                <p className="text-xs text-[#A1A1AA]">
                  <strong className="text-[#E4E4E7]">{toneAnalysis.clipLabel}</strong> · RMS{' '}
                  {toneAnalysis.metrics.rmsDb} dBFS · Écart {toneAnalysis.spectralDistanceDb} dB
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setManualAnalysisNonce((n) => n + 1);
                    setToneFeedback(`Analyse actualisée sur « ${toneAnalysis.clipLabel} ».`);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#E4E4E7] bg-[#27272A] hover:bg-[#3F3F46] border border-[#3F3F46] rounded-lg transition-colors cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5 text-[#38BDF8]" aria-hidden="true" />
                  Analyser la voix
                </button>
                <button
                  type="button"
                  data-testid="apply-all-tone-suggestions"
                  onClick={() => handleApplyToneSuggestion('all')}
                  disabled={toneAnalysis.recommendations.length === 0 && !mastering.bypass}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#18181B] bg-[#2DD4BF] hover:bg-[#14B8A6] disabled:opacity-45 rounded-lg transition-colors cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Appliquer tout (Égaliseur + Compresseur)
                </button>
              </div>
            </div>

            {toneFeedback && (
              <p role="status" className="text-xs text-[#2DD4BF] flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{toneFeedback}</span>
              </p>
            )}

            {showToneDetails && (
              <div data-testid="tone-details-drawer" className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: 8-band Spectral Balance Bars (Current Voice vs Précepteur) */}
              <div className="lg:col-span-6 p-4 bg-[#141417] border border-[#27272A] rounded-lg space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#E4E4E7]">
                    Spectre voix actuelle vs signature Le Précepteur
                  </span>
                  <span className="text-[11px] text-[#71717A] font-mono">dB rel. 1 kHz</span>
                </div>

                <div className="grid grid-cols-8 gap-2 pt-1">
                  {PRECEPTEUR_SPECTRUM_BANDS.map((band, idx) => {
                    const currentVal = toneAnalysis.currentBandDb[idx] ?? 0;
                    const targetVal = toneAnalysis.targetBandDb[idx] ?? 0;
                    const delta = toneAnalysis.bandDeltasDb[idx] ?? 0;
                    const normHeight = (db: number) =>
                      Math.max(8, Math.min(100, Math.round(((db + 16) / 26) * 100)));

                    return (
                      <div key={band.freqHz} className="flex flex-col items-center gap-1">
                        <div className="relative w-full h-24 bg-[#1F1F23] rounded border border-[#2E2E35] flex items-end justify-center overflow-hidden">
                          {/* Current voice bar */}
                          <div
                            className="w-4 bg-[#38BDF8]/80 rounded-t transition-all duration-150"
                            style={{ height: `${normHeight(currentVal)}%` }}
                            title={`Voix actuelle ${band.label}: ${currentVal > 0 ? '+' : ''}${currentVal.toFixed(1)} dB`}
                          />
                          {/* Target reference tick line */}
                          <div
                            aria-hidden="true"
                            className="absolute left-0 right-0 h-0.5 bg-[#2DD4BF] shadow-[0_0_6px_rgba(45,212,191,0.75)]"
                            style={{ bottom: `${normHeight(targetVal)}%` }}
                            title={`Cible Précepteur ${band.label}: ${targetVal > 0 ? '+' : ''}${targetVal.toFixed(1)} dB`}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-[#D4D4D8]">{band.label}</span>
                        <span
                          className={`font-mono text-[10px] tabular-nums ${
                            Math.abs(delta) <= 1.5
                              ? 'text-[#34D399]'
                              : delta > 0
                                ? 'text-[#FBBF24]'
                                : 'text-[#38BDF8]'
                          }`}
                        >
                          {delta >= 0 ? '+' : ''}
                          {delta.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1 pt-1 text-xs text-[#A1A1AA] border-t border-[#27272A]">
                  <p className="text-[#E4E4E7]">{toneAnalysis.tonalSummary}</p>
                  <p>{toneAnalysis.dynamicsSummary}</p>
                </div>
              </div>

              {/* Right: Actionable EQ & Compressor Auto-Suggestions */}
              <div className="lg:col-span-6 p-4 bg-[#141417] border border-[#27272A] rounded-lg flex flex-col justify-between gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#E4E4E7]">
                    <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" aria-hidden="true" />
                    <span>Ajustements recommandés (Égaliseur & Compresseur)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleApplyToneSuggestion('eq')}
                      className="px-2.5 py-1 text-[11px] font-medium text-[#F59E0B] bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 border border-[#F59E0B]/30 rounded cursor-pointer"
                    >
                      Ajuster Égaliseur
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyToneSuggestion('compressor')}
                      className="px-2.5 py-1 text-[11px] font-medium text-[#38BDF8] bg-[#38BDF8]/10 hover:bg-[#38BDF8]/20 border border-[#38BDF8]/30 rounded cursor-pointer"
                    >
                      Ajuster Compresseur
                    </button>
                  </div>
                </div>

                {toneAnalysis.recommendations.length === 0 && !mastering.bypass ? (
                  <div className="p-3 rounded bg-[#064E3B]/25 border border-[#059669]/40 text-xs text-[#6EE7B7]">
                    Vos réglages d’égalisation et de compression sont déjà alignés sur la courbe du Précepteur pour cette prise vocale.
                  </div>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {toneAnalysis.recommendations.map((rec) => (
                      <li
                        key={rec.id}
                        className="p-2.5 rounded bg-[#1C1C21] border border-[#27272A] flex flex-col gap-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-white">{rec.parameterLabel}</span>
                          <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
                            <span className="text-[#A1A1AA]">{rec.currentValueLabel}</span>
                            <span aria-hidden="true" className="text-[#71717A]">→</span>
                            <span className="text-[#2DD4BF] font-semibold">{rec.suggestedValueLabel}</span>
                            <span className="px-1.5 py-0.5 rounded bg-[#27272A] text-[#F59E0B] text-[10px]">
                              {rec.deltaLabel}
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-[#A1A1AA]">{rec.reason}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            )}
          </div>
        )}
      </section>

      {/* Multi-Track Montage Timeline + Clip Inspector */}
      <section className="bg-white border border-[#E5E2D9] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#F0EFEA]">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-base font-semibold text-[#18181B]">
              Éditeur & Montage Audio
            </h2>
            <span className="font-mono text-xs tabular-nums px-2.5 py-1 bg-[#F6F5F0] border border-[#E5E2D9] rounded text-[#18181B]">
              {formatTimecode(playheadSec, true)} / {formatTimecode(totalTimelineSec)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                stopPlayback();
                setPlayheadSec(0);
              }}
              className="px-3 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] rounded-md cursor-pointer"
            >
              Début
            </button>
            <button
              type="button"
              onClick={() => (isPlaying ? stopPlayback() : startPlayback(playheadSec))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#18181B] hover:bg-[#27272A] rounded-md cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? 'Pause' : 'Lire'}
            </button>
            <button
              type="button"
              data-testid="timeline-split-btn"
              onClick={handleSplitSelectedClip}
              disabled={!selectedClip}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] disabled:opacity-40 rounded-md cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5" aria-hidden="true" />
              Scinder
            </button>
            <button
              type="button"
              data-testid="timeline-copy-btn"
              onClick={handleCopySelectedClip}
              disabled={!selectedClip}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] disabled:opacity-40 rounded-md cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              Copier
            </button>
            <button
              type="button"
              data-testid="timeline-cut-btn"
              onClick={handleCutSelectedClip}
              disabled={!selectedClip}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] disabled:opacity-40 rounded-md cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5" aria-hidden="true" />
              Couper
            </button>
            <button
              type="button"
              data-testid="timeline-paste-btn"
              onClick={handlePasteClipAtPlayhead}
              disabled={!clipboardClip}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#18181B] bg-[#FEF3C7] hover:bg-[#FDE68A] border border-[#F59E0B]/40 disabled:opacity-40 rounded-md cursor-pointer"
            >
              <ClipboardPaste className="w-3.5 h-3.5" aria-hidden="true" />
              Coller au curseur
            </button>
            <div className="flex items-center gap-1.5 px-2 text-xs text-[#71717A]">
              <label htmlFor="zoom-timeline">Zoom</label>
              <input
                id="zoom-timeline"
                type="range"
                min={20}
                max={90}
                value={pxPerSec}
                onChange={(e) => setPxPerSec(Number(e.target.value))}
                className="w-20 accent-[#C2410C]"
              />
            </div>
            <button
              type="button"
              onClick={handleExportWav}
              disabled={isExporting || clips.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-40 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              {isExporting ? 'Rendu WAV...' : 'Exporter Master (.WAV)'}
            </button>
          </div>
        </div>

        {(exportSuccessMsg || timelineStatusMsg) && (
          <p role="status" className="text-xs text-[#15803D] font-medium">
            {timelineStatusMsg || exportSuccessMsg}
          </p>
        )}

        {/* Interactive Scrub Ruler & Tracks with dedicated left track headers */}
        <div className="flex border border-[#E5E2D9] rounded-lg bg-[#FAF9F5] overflow-hidden">
          {/* Fixed Track Header Column */}
          <div className="w-32 sm:w-44 shrink-0 border-r border-[#E5E2D9] bg-[#F2F0E8] flex flex-col">
            <div className="h-7 border-b border-[#E5E2D9] px-3 flex items-center text-[11px] font-mono text-[#71717A]">
              Pistes
            </div>
            <div className="h-24 border-b border-[#E5E2D9] px-3 flex flex-col justify-center">
              <span className="text-xs font-semibold text-[#18181B]">Voix masterisée</span>
              <span className="text-[11px] text-[#71717A] hidden sm:inline">
                Glisser pour déplacer
              </span>
            </div>
            <div className="h-20 px-3 flex flex-col justify-center">
              <span className="text-xs font-semibold text-[#18181B]">Extraits sonores</span>
              <span className="text-[11px] text-[#71717A] hidden sm:inline">
                Illustrations & nappes
              </span>
            </div>
          </div>

          {/* Scrollable Timeline Canvas Area */}
          <div className="flex-1 overflow-x-auto">
            <div
              className="relative select-none min-w-full"
              style={{
                width: `max(100%, ${Math.ceil(totalTimelineSec * pxPerSec)}px)`,
              }}
            >
              {/* Scrub Ruler */}
              <div
                role="slider"
                aria-label="Position de lecture sur la timeline"
                aria-valuemin={0}
                aria-valuemax={Math.round(totalTimelineSec)}
                aria-valuenow={Math.round(playheadSec)}
                tabIndex={0}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const sec = Math.max(0, (e.clientX - rect.left) / pxPerSec);
                  setPlayheadSec(sec);
                  if (isPlaying) startPlayback(sec);
                }}
                className="h-7 border-b border-[#E5E2D9] bg-[#F2F0E8] relative cursor-pointer"
              >
                {Array.from({ length: Math.ceil(totalTimelineSec) + 1 }).map((_, sec) => (
                  <div
                    key={sec}
                    style={{ left: `${sec * pxPerSec}px` }}
                    className="absolute top-0 bottom-0 border-l border-[#D6D3C9] pl-1 text-[10px] font-mono text-[#71717A] flex items-center"
                  >
                    {sec % 2 === 0 ? formatTimecode(sec) : ''}
                  </div>
                ))}
              </div>

              {/* Playhead */}
              <div
                aria-hidden="true"
                style={{ left: `${playheadSec * pxPerSec}px` }}
                className="absolute top-0 bottom-0 w-0.5 bg-[#C2410C] z-20 pointer-events-none"
              />

              {/* Track 1: Voix Masterisée */}
              <div
                data-testid="timeline-track-voix"
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setPlayheadSec(Math.max(0, (e.clientX - rect.left) / pxPerSec));
                }}
                className="h-24 border-b border-[#E5E2D9] relative flex items-center cursor-crosshair"
              >
                {clips
                  .filter((c) => c.track === 'voix')
                  .map((clip) => (
                    <ClipBlock
                      key={clip.id}
                      clip={clip}
                      buffer={audioBuffers[clip.audioKey]}
                      pxPerSec={pxPerSec}
                      isSelected={clip.id === selectedClip?.id}
                      accent="#C2410C"
                      onSelect={() => setSelectedClipId(clip.id)}
                      onMoveClip={handleMoveClip}
                      onTrimClip={handleTrimClip}
                    />
                  ))}
              </div>

              {/* Track 2: Extraits & Ambiances */}
              <div
                data-testid="timeline-track-extrait"
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setPlayheadSec(Math.max(0, (e.clientX - rect.left) / pxPerSec));
                }}
                className="h-20 relative flex items-center cursor-crosshair"
              >
                {clips
                  .filter((c) => c.track === 'extrait')
                  .map((clip) => (
                    <ClipBlock
                      key={clip.id}
                      clip={clip}
                      buffer={audioBuffers[clip.audioKey]}
                      pxPerSec={pxPerSec}
                      isSelected={clip.id === selectedClip?.id}
                      accent="#0F766E"
                      onSelect={() => setSelectedClipId(clip.id)}
                      onMoveClip={handleMoveClip}
                      onTrimClip={handleTrimClip}
                    />
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Selected Clip Inspector */}
        {selectedClip && (
          <div className="p-4 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                data-testid="clip-inspector-trigger"
                {...clipInspectorTrigger.triggerProps}
                title="Double-clic (PC) ou appui long (mobile) pour régler position et rognage précis"
                className="space-y-0.5 cursor-pointer select-none"
              >
                <p className="text-xs text-[#71717A]">
                  Clip sélectionné · {(selectedClip.trimEndSec - selectedClip.trimStartSec).toFixed(1)}s
                </p>
                <p className="text-sm font-semibold text-[#18181B]">{selectedClip.label}</p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 min-w-[160px]">
                  <label htmlFor="clip-vol" className="text-[11px] text-[#52525B] whitespace-nowrap">
                    Volume ({Math.round(selectedClip.volume * 100)}%)
                  </label>
                  <input
                    id="clip-vol"
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={selectedClip.volume}
                    onChange={(e) => updateSelectedClip({ volume: Number(e.target.value) })}
                    className="w-24 accent-[#C2410C]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteClip(selectedClip.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#DC2626] hover:bg-[#FEE2E2] rounded cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Retirer
                </button>
              </div>
            </div>

            {showClipTrimDetails && (
              <div
                data-testid="clip-trim-controls"
                className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#E5E2D9]"
              >
                <div>
                  <label htmlFor="clip-start" className="block text-[11px] text-[#52525B] mb-1">
                    Position (s)
                  </label>
                  <input
                    id="clip-start"
                    type="number"
                    min={0}
                    step={0.1}
                    value={selectedClip.startOnTimelineSec}
                    onChange={(e) =>
                      updateSelectedClip({
                        startOnTimelineSec: Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="w-full px-2 py-1 text-xs font-mono bg-white border border-[#E5E2D9] rounded"
                  />
                </div>
                <div>
                  <label htmlFor="clip-trim-in" className="block text-[11px] text-[#52525B] mb-1">
                    Rognage début (s)
                  </label>
                  <input
                    id="clip-trim-in"
                    type="number"
                    min={0}
                    max={Math.max(0, selectedClip.trimEndSec - 0.2)}
                    step={0.1}
                    value={selectedClip.trimStartSec}
                    onChange={(e) =>
                      updateSelectedClip({
                        trimStartSec: Math.max(
                          0,
                          Math.min(selectedClip.trimEndSec - 0.2, Number(e.target.value))
                        ),
                      })
                    }
                    className="w-full px-2 py-1 text-xs font-mono bg-white border border-[#E5E2D9] rounded"
                  />
                </div>
                <div>
                  <label htmlFor="clip-trim-out" className="block text-[11px] text-[#52525B] mb-1">
                    Rognage fin (s)
                  </label>
                  <input
                    id="clip-trim-out"
                    type="number"
                    min={selectedClip.trimStartSec + 0.2}
                    max={selectedClip.sourceDurationSec}
                    step={0.1}
                    value={selectedClip.trimEndSec}
                    onChange={(e) =>
                      updateSelectedClip({
                        trimEndSec: Math.min(
                          selectedClip.sourceDurationSec,
                          Math.max(selectedClip.trimStartSec + 0.2, Number(e.target.value))
                        ),
                      })
                    }
                    className="w-full px-2 py-1 text-xs font-mono bg-white border border-[#E5E2D9] rounded"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Sound Extracts & Concrete Illustrations Library */}
      <section className="bg-white border border-[#E5E2D9] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-[#18181B]">
              Extraits Sonores & Situations Sociales
            </h2>
            <p className="text-xs text-[#71717A]">
              Illustrez chaque concept philosophique avec des sons concrets placés directement au curseur du montage.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SOUND_EXTRACTS.map((cue) => (
            <div
              key={cue.id}
              className="p-4 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg flex flex-col justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-[#71717A]">
                  <span>
                    {cue.category === 'situation_sociale'
                      ? 'Vie sociale'
                      : cue.category === 'cinema_declic'
                        ? 'Cinéma / Déclic'
                        : 'Transition'}
                  </span>
                  <span className="font-mono tabular-nums">{cue.durationSec.toFixed(1)}s</span>
                </div>
                <p className="text-sm font-semibold text-[#18181B]">{cue.title}</p>
                <p className="text-xs text-[#52525B] leading-relaxed">{cue.description}</p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#ECEAE2]">
                <button
                  type="button"
                  onClick={() => onPreviewSoundCue(cue.id)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#18181B] bg-white border border-[#E5E2D9] hover:bg-[#ECEAE2] rounded cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Écouter
                </button>
                <button
                  type="button"
                  onClick={() => handleAddSoundCueToTimeline(cue.id)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  Ajouter au montage
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

interface ClipBlockProps {
  clip: TimelineClip;
  buffer?: AudioBuffer;
  pxPerSec: number;
  isSelected: boolean;
  accent: string;
  onSelect: () => void;
  onMoveClip: (clipId: string, nextStartSec: number) => void;
  onTrimClip: (clipId: string, edge: 'start' | 'end', nextValue: number) => void;
}

function ClipBlock({
  clip,
  buffer,
  pxPerSec,
  isSelected,
  accent,
  onSelect,
  onMoveClip,
  onTrimClip,
}: ClipBlockProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipDur = Math.max(0.2, clip.trimEndSec - clip.trimStartSec);
  const widthPx = Math.max(48, Math.round(clipDur * pxPerSec));
  const leftPx = Math.round(clip.startOnTimelineSec * pxPerSec);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const peaks = extractWaveformPeaks(buffer, Math.max(24, Math.min(180, Math.floor(widthPx / 3))));
    const w = widthPx;
    const h = 44;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    const startRatio = clip.trimStartSec / Math.max(0.01, buffer.duration);
    const endRatio = clip.trimEndSec / Math.max(0.01, buffer.duration);
    const startIdx = Math.floor(startRatio * peaks.length);
    const endIdx = Math.max(startIdx + 1, Math.ceil(endRatio * peaks.length));
    const slice = peaks.slice(startIdx, endIdx);

    ctx.fillStyle = accent;
    const barW = Math.max(1.5, w / Math.max(1, slice.length));
    for (let i = 0; i < slice.length; i++) {
      const amp = Math.min(1, slice[i] * clip.volume);
      const barH = Math.max(2, amp * (h - 6));
      ctx.fillRect(i * barW, (h - barH) / 2, Math.max(1, barW - 1), barH);
    }
  }, [buffer, clip.trimStartSec, clip.trimEndSec, clip.volume, widthPx, accent]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const initialStartSec = clip.startOnTimelineSec;
    let moved = false;
    onSelect();

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 4) {
        moved = true;
      }
      if (moved) {
        onMoveClip(clip.id, initialStartSec + dx / pxPerSec);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleTrimPointerDown = (e: React.PointerEvent<HTMLSpanElement>, edge: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    const startX = e.clientX;
    const initial = edge === 'start' ? clip.trimStartSec : clip.trimEndSec;
    const onMove = (ev: PointerEvent) => {
      onTrimClip(clip.id, edge, initial + (ev.clientX - startX) / pxPerSec);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <button
      type="button"
      data-testid={`timeline-clip-${clip.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerDown={handlePointerDown}
      style={{ left: `${leftPx}px`, width: `${widthPx}px`, touchAction: 'pan-y' }}
      title={`${clip.label} — glissez horizontalement pour déplacer`}
      className={`absolute top-2 bottom-2 rounded-md border text-left overflow-hidden transition-shadow cursor-grab active:cursor-grabbing ${
        isSelected
          ? 'bg-white border-[#18181B] ring-2 ring-[#C2410C]/35 z-10'
          : 'bg-white/95 border-[#D6D3C9] hover:border-[#71717A]'
      }`}
    >
      <div className="px-2 py-0.5 text-[11px] font-medium text-[#18181B] truncate border-b border-[#F0EFEA]">
        {clip.label}
      </div>
      <canvas ref={canvasRef} className="w-full h-[44px] block pointer-events-none" />
      <span
        role="slider"
        aria-label="Rogner le début du clip"
        onPointerDown={(e) => handleTrimPointerDown(e, 'start')}
        className="absolute left-0 top-0 bottom-0 w-3 bg-white/70 border-r-2 border-[#18181B]/70 cursor-ew-resize z-20"
      />
      <span
        role="slider"
        aria-label="Rogner la fin du clip"
        onPointerDown={(e) => handleTrimPointerDown(e, 'end')}
        className="absolute right-0 top-0 bottom-0 w-3 bg-white/70 border-l-2 border-[#18181B]/70 cursor-ew-resize z-20"
      />
    </button>
  );
}
