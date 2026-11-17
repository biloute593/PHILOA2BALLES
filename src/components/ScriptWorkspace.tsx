import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Film,
  GitBranch,
  Layers,
  ListChecks,
  Mic,
  Music,
  Palette,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  StickyNote,
  Trash2,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import type {
  Episode,
  NarrativeSegment,
  NotebookAppearance,
  ResearchNote,
  SegmentRole,
  SegmentStatus,
  SourceKind,
  SourceReference,
  SourceStatus,
} from '../types/podcast';
import { SOUND_EXTRACTS } from '../data/seedData';
import { estimateSpeechDurationSeconds, formatTimecode } from '../utils/audioDsp';
import {
  analyzeEpisodeTexts,
  calculateEpisodeDurationSeconds,
  calculateEpisodeTargetSeconds,
  filterEpisodesByCategory,
  filterSources,
  insertThoughtIntelligently,
  moveSegmentInList,
  reorganizeEpisodeTexts,
} from '../utils/episodeStore';
import {
  adjustThoughtToEpisodeThread,
  detectDraftConceptMatches,
  planSmartDraftPlacement,
} from '../utils/frenchPolisher';
import { NotebookEditor } from './NotebookEditor';
import { useAdaptiveTrigger } from '../hooks/useAdaptiveTrigger';
import type { EpisodeCategory } from '../types/podcast';

interface ScriptWorkspaceProps {
  episodes: Episode[];
  activeEpisode: Episode;
  activeSegmentId: string;
  appearance: NotebookAppearance;
  onOpenAppearance: () => void;
  onOpenLogoStudio?: () => void;
  onSelectEpisode: (episodeId: string) => void;
  onSelectSegment: (segmentId: string) => void;
  onUpdateEpisode: (updated: Episode) => void;
  onPreviewSoundCue: (cueId: string) => void;
  onRecordSegment: (segmentId: string) => void;
  onOpenPrompter?: () => void;
  segmentFocusSignal?: number;
}

const ROLE_LABELS: Record<SegmentRole, string> = {
  accroche: 'Accroche',
  concept: 'Concept philo',
  exemple: 'Exemple concret',
  bascule: 'Bascule film',
  nuance: 'Nuance critique',
  conclusion: 'Conclusion',
};

const STATUS_LABELS: Record<SegmentStatus, string> = {
  brouillon: 'Brouillon',
  pret: 'Prêt à enregistrer',
  enregistre: 'Voix enregistrée',
  monte: 'Monté',
};

const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  verifiee: 'Vérifiée',
  a_relire: 'À relire',
  a_citer: 'À citer',
};

const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  philosophie: 'Philosophie',
  film_serie: 'Film / Série',
  chanson: 'Chanson / Paroles',
  sociologie: 'Sociologie',
  article: 'Article',
};

export function ScriptWorkspace({
  episodes,
  activeEpisode,
  activeSegmentId,
  appearance,
  onOpenAppearance,
  onSelectEpisode,
  onSelectSegment,
  onUpdateEpisode,
  onPreviewSoundCue,
  onRecordSegment,
  onOpenPrompter,
  segmentFocusSignal = 0,
}: ScriptWorkspaceProps) {
  const editorSectionRef = useRef<HTMLElement | null>(null);
  const activeEpisodeRef = useRef(activeEpisode);
  activeEpisodeRef.current = activeEpisode;

  useEffect(() => {
    if (segmentFocusSignal <= 0) return;
    const id = window.setTimeout(() => {
      editorSectionRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 30);
    return () => window.clearTimeout(id);
  }, [segmentFocusSignal]);
  const [categoryFilter, setCategoryFilter] = useState<'tous' | 'cinema_serie' | 'chanson'>('tous');
  const [sourceFilter, setSourceFilter] = useState<SourceStatus | 'toutes'>('toutes');
  const [sourceQuery, setSourceQuery] = useState('');
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSourceTitle, setNewSourceTitle] = useState('');
  const [newSourceAuthor, setNewSourceAuthor] = useState('');
  const [newSourceYear, setNewSourceYear] = useState('2024');
  const [newSourceKind, setNewSourceKind] = useState<SourceKind>('philosophie');
  const [newSourceLocation, setNewSourceLocation] = useState('');
  const [newSourceTakeaway, setNewSourceTakeaway] = useState('');

  const [showCatalog, setShowCatalog] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [sourceValidationError, setSourceValidationError] = useState('');
  const [draftFeedback, setDraftFeedback] = useState('');
  const [draftTargetOverride, setDraftTargetOverride] = useState<string>('auto');
  const [dismissedDraftHintFor, setDismissedDraftHintFor] = useState<string>('');
  const [showEpisodeAnalysis, setShowEpisodeAnalysis] = useState(false);
  const [tidyFeedback, setTidyFeedback] = useState('');

  // Progressive disclosure drawers (PC double-click / mobile long-press)
  const [showPlanTools, setShowPlanTools] = useState(false);
  const [showSegmentDetails, setShowSegmentDetails] = useState(false);
  const [showDraftOptions, setShowDraftOptions] = useState(false);

  // Inline episode title & metadata editor (opened via double-click / long-press / Pencil button)
  const [isEditingEpisodeMeta, setIsEditingEpisodeMeta] = useState(false);
  const [editTitle, setEditTitle] = useState(activeEpisode.title);
  const [editWorkTitle, setEditWorkTitle] = useState(activeEpisode.workTitle);
  const [editNumber, setEditNumber] = useState(activeEpisode.number);
  const [editCategory, setEditCategory] = useState<EpisodeCategory>(
    activeEpisode.category ?? 'cinema_serie'
  );
  const [editStatus, setEditStatus] = useState<Episode['status']>(activeEpisode.status);
  const [editTargetMinutes, setEditTargetMinutes] = useState(
    activeEpisode.targetMinutes ?? 30
  );
  const [editTheme, setEditTheme] = useState(activeEpisode.philosophicalTheme);
  const [editLogline, setEditLogline] = useState(activeEpisode.logline);
  const [editMetaError, setEditMetaError] = useState('');

  useEffect(() => {
    setIsEditingEpisodeMeta(false);
    setEditTitle(activeEpisode.title);
    setEditWorkTitle(activeEpisode.workTitle);
    setEditNumber(activeEpisode.number);
    setEditCategory(activeEpisode.category ?? 'cinema_serie');
    setEditStatus(activeEpisode.status);
    setEditTargetMinutes(activeEpisode.targetMinutes ?? 30);
    setEditTheme(activeEpisode.philosophicalTheme);
    setEditLogline(activeEpisode.logline);
    setEditMetaError('');
  }, [activeEpisode]);

  const openEpisodeMetaEditor = () => {
    setEditTitle(activeEpisode.title);
    setEditWorkTitle(activeEpisode.workTitle);
    setEditNumber(activeEpisode.number);
    setEditCategory(activeEpisode.category ?? 'cinema_serie');
    setEditStatus(activeEpisode.status);
    setEditTargetMinutes(activeEpisode.targetMinutes ?? 30);
    setEditTheme(activeEpisode.philosophicalTheme);
    setEditLogline(activeEpisode.logline);
    setEditMetaError('');
    setIsEditingEpisodeMeta(true);
  };

  const handleSaveEpisodeMeta = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = editTitle.trim().slice(0, 300);
    const cleanWork = editWorkTitle.trim().slice(0, 300);
    const cleanNumber = editNumber.trim().slice(0, 16);
    if (!cleanTitle) {
      setEditMetaError('Le titre de l’épisode ne peut pas être vide.');
      return;
    }
    if (!cleanNumber) {
      setEditMetaError('Le numéro d’épisode est requis.');
      return;
    }
    onUpdateEpisode({
      ...activeEpisode,
      title: cleanTitle,
      workTitle: cleanWork || activeEpisode.workTitle,
      number: cleanNumber,
      category: editCategory,
      status: editStatus,
      targetMinutes: Math.max(1, Math.min(240, Math.round(editTargetMinutes || 30))),
      philosophicalTheme: editTheme.trim().slice(0, 300) || activeEpisode.philosophicalTheme,
      logline: editLogline.trim(),
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    setEditMetaError('');
    setIsEditingEpisodeMeta(false);
  };

  const episodeTitleTrigger = useAdaptiveTrigger({
    onTrigger: openEpisodeMetaEditor,
  });

  const planToolsTrigger = useAdaptiveTrigger({
    onTrigger: () =>
      setShowPlanTools((prev) => {
        const next = !prev;
        if (!next) setShowEpisodeAnalysis(false);
        return next;
      }),
  });

  const segmentDetailsTrigger = useAdaptiveTrigger({
    onTrigger: () => setShowSegmentDetails((v) => !v),
  });

  const draftOptionsTrigger = useAdaptiveTrigger({
    onTrigger: () => setShowDraftOptions((v) => !v),
  });

  const activeSegment =
    activeEpisode.segments.find((s) => s.id === activeSegmentId) ?? activeEpisode.segments[0];

  const filmEpisodes = filterEpisodesByCategory(episodes, 'cinema_serie');
  const songEpisodes = filterEpisodesByCategory(episodes, 'chanson');
  const visibleEpisodes = filterEpisodesByCategory(episodes, categoryFilter);

  const totalDurationSec = calculateEpisodeDurationSeconds(activeEpisode);
  const targetDurationSec = calculateEpisodeTargetSeconds(activeEpisode);
  const minTargetMinutes = activeEpisode.targetMinutes ?? 30;
  const meetsTargetMinutes = targetDurationSec >= minTargetMinutes * 60;
  const meetsWrittenMinutes = totalDurationSec >= 1800;
  const activeEpisodeIndex = visibleEpisodes.findIndex((ep) => ep.id === activeEpisode.id);
  const filteredSources = filterSources(activeEpisode.sources, sourceFilter, sourceQuery);

  const handleChangeCategoryFilter = (nextCat: 'tous' | 'cinema_serie' | 'chanson') => {
    setCategoryFilter(nextCat);
    const matching = filterEpisodesByCategory(episodes, nextCat);
    if (matching.length > 0 && !matching.some((ep) => ep.id === activeEpisode.id)) {
      onSelectEpisode(matching[0].id);
    }
  };

  const [episodeAnalysis, setEpisodeAnalysis] = useState<ReturnType<
    typeof analyzeEpisodeTexts
  > | null>(null);

  useEffect(() => {
    if (!showEpisodeAnalysis) return;
    const timer = window.setTimeout(() => {
      setEpisodeAnalysis(analyzeEpisodeTexts(activeEpisode));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [showEpisodeAnalysis, activeEpisode]);

  const handleReorganizeEpisode = () => {
    const { episode: tidied, appliedChanges } = reorganizeEpisodeTexts(activeEpisode);
    onUpdateEpisode(tidied);
    if (showEpisodeAnalysis) {
      setEpisodeAnalysis(analyzeEpisodeTexts(tidied));
    }
    setTidyFeedback(
      appliedChanges.length > 0
        ? appliedChanges.join(' · ')
        : 'L’épisode est déjà ordonné, propre et calé.'
    );
  };

  const [draftDetection, setDraftDetection] = useState<
    ReturnType<typeof detectDraftConceptMatches>
  >(() => ({ detectedConcepts: [], repeatedThoughts: [] }));
  const [smartDraftPlan, setSmartDraftPlan] = useState<ReturnType<
    typeof planSmartDraftPlacement
  > | null>(null);

  useEffect(() => {
    const raw = activeEpisode.draftThoughts ?? '';
    if (!raw.trim()) {
      setDraftDetection({ detectedConcepts: [], repeatedThoughts: [] });
      setSmartDraftPlan(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const ep = activeEpisodeRef.current;
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
          draftTargetOverride === 'auto' ? undefined : draftTargetOverride
        )
      );
    }, 280);
    return () => window.clearTimeout(timer);
  }, [
    activeEpisode.id,
    activeEpisode.draftThoughts,
    activeEpisode.segments.length,
    draftTargetOverride,
  ]);

  const handlePolishDraft = () => {
    const raw = activeEpisode.draftThoughts ?? '';
    if (!raw.trim()) return;
    const res = adjustThoughtToEpisodeThread(raw, activeEpisode, activeSegment?.id ?? '');
    onUpdateEpisode({ ...activeEpisode, draftThoughts: res.adjusted });
    setDraftFeedback(
      res.hasChanges
        ? `${res.changes.length} réajustement(s) appliqué(s) dans le brouillon.`
        : 'Le brouillon est déjà bien tourné et cohérent avec le fil.'
    );
  };

  const handleSendDraftToSegment = () => {
    const raw = activeEpisode.draftThoughts ?? '';
    if (!raw.trim()) return;
    const { episode: updated, plan } = insertThoughtIntelligently(activeEpisode, raw, {
      forcedSegmentId: draftTargetOverride === 'auto' ? undefined : draftTargetOverride,
      clearDraft: true,
    });
    if (!plan) return;
    onUpdateEpisode(updated);
    onSelectSegment(plan.targetSegmentId);
    setDraftTargetOverride('auto');
    const placementWord =
      plan.insertionMode === 'after_sentence'
        ? 'juste après la phrase sur ce sujet'
        : plan.insertionMode === 'end_of_paragraph'
          ? 'dans le paragraphe correspondant'
          : 'dans le segment';
    setDraftFeedback(
      `Placé dans ${String(plan.targetSegmentIndex).padStart(2, '0')}. « ${plan.targetSegmentTitle} » (${placementWord}) et synchronisé avec le Prompteur.`
    );
  };

  const updateSegment = (patch: Partial<NarrativeSegment>) => {
    if (!activeSegment) return;
    const segments = activeEpisode.segments.map((s) =>
      s.id === activeSegment.id ? { ...s, ...patch } : s
    );
    onUpdateEpisode({
      ...activeEpisode,
      segments,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  };

  const handleMoveSegment = (segmentId: string, dir: 'up' | 'down') => {
    const segments = moveSegmentInList(activeEpisode.segments, segmentId, dir);
    onUpdateEpisode({ ...activeEpisode, segments });
  };

  const handleAddSegment = () => {
    const idx = activeEpisode.segments.length + 1;
    const newSeg: NarrativeSegment = {
      id: `seg-${Date.now()}`,
      title: `Nouveau segment ${idx}`,
      role: 'concept',
      status: 'brouillon',
      estimatedWpm: 140,
      targetDurationSec: 300,
      concreteExample: '',
      scriptText: '',
      linkedSourceIds: [],
    };
    onUpdateEpisode({
      ...activeEpisode,
      segments: [...activeEpisode.segments, newSeg],
    });
    onSelectSegment(newSeg.id);
  };

  const handleDeleteSegment = (segmentId: string) => {
    if (activeEpisode.segments.length <= 1) return;
    const remaining = activeEpisode.segments.filter((s) => s.id !== segmentId);
    onUpdateEpisode({ ...activeEpisode, segments: remaining });
    if (activeSegment?.id === segmentId && remaining[0]) {
      onSelectSegment(remaining[0].id);
    }
  };

  const insertCueIntoScript = (snippet: string) => {
    if (!activeSegment) return;
    const prefix = activeSegment.scriptText.trim().length > 0 ? '\n\n' : '';
    updateSegment({ scriptText: `${activeSegment.scriptText}${prefix}${snippet}` });
  };

  const toggleSourceLink = (sourceId: string) => {
    if (!activeSegment) return;
    const exists = activeSegment.linkedSourceIds.includes(sourceId);
    const linkedSourceIds = exists
      ? activeSegment.linkedSourceIds.filter((id) => id !== sourceId)
      : [...activeSegment.linkedSourceIds, sourceId];
    updateSegment({ linkedSourceIds });
  };

  const handleCreateSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceTitle.trim() || !newSourceAuthor.trim()) {
      setSourceValidationError('Le titre et l’auteur ou réalisateur sont requis.');
      return;
    }
    setSourceValidationError('');
    const created: SourceReference = {
      id: `src-${Date.now()}`,
      title: newSourceTitle.trim(),
      authorOrDirector: newSourceAuthor.trim(),
      year: newSourceYear.trim() || 's.d.',
      kind: newSourceKind,
      referenceLocation: newSourceLocation.trim() || 'Référence générale',
      keyTakeaway: newSourceTakeaway.trim() || 'À synthétiser dans le script.',
      status: 'verifiee',
    };
    const updatedSegments = activeSegment
      ? activeEpisode.segments.map((s) =>
          s.id === activeSegment.id
            ? { ...s, linkedSourceIds: [...s.linkedSourceIds, created.id] }
            : s
        )
      : activeEpisode.segments;

    onUpdateEpisode({
      ...activeEpisode,
      sources: [created, ...activeEpisode.sources],
      segments: updatedSegments,
    });
    setNewSourceTitle('');
    setNewSourceAuthor('');
    setNewSourceLocation('');
    setNewSourceTakeaway('');
    setShowAddSource(false);
  };

  const cycleSourceStatus = (sourceId: string) => {
    const order: SourceStatus[] = ['verifiee', 'a_relire', 'a_citer'];
    const sources = activeEpisode.sources.map((s) => {
      if (s.id !== sourceId) return s;
      const next = order[(order.indexOf(s.status) + 1) % order.length];
      return { ...s, status: next };
    });
    onUpdateEpisode({ ...activeEpisode, sources });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteTitle.trim() || !newNoteContent.trim()) return;
    const note: ResearchNote = {
      id: `note-${Date.now()}`,
      title: newNoteTitle.trim(),
      content: newNoteContent.trim(),
      segmentId: activeSegment?.id,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    onUpdateEpisode({ ...activeEpisode, notes: [note, ...activeEpisode.notes] });
    setNewNoteTitle('');
    setNewNoteContent('');
    setShowAddNote(false);
  };

  return (
    <main className="max-w-[1440px] mx-auto px-6 py-6 space-y-6">
      {/* Episode Context, Custom Cover Banner & 12-Episode Switcher */}
      <section className="space-y-4 pb-5 border-b border-[#E5E2D9]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0 max-w-4xl flex-1">
            {isEditingEpisodeMeta ? (
              <form
                onSubmit={handleSaveEpisodeMeta}
                data-testid="episode-metadata-editor"
                className="p-4 bg-white border border-[#C2410C]/40 rounded-xl space-y-3 shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#C2410C]">
                    Modifier l’épisode {activeEpisode.number}
                  </span>
                  <button
                    type="button"
                    aria-label="Fermer l’édition de l’épisode"
                    onClick={() => setIsEditingEpisodeMeta(false)}
                    className="p-1 text-[#71717A] hover:text-[#18181B] rounded cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {editMetaError && (
                  <p role="alert" className="text-xs text-[#DC2626]">
                    {editMetaError}
                  </p>
                )}

                <div>
                  <label
                    htmlFor="edit-ep-title"
                    className="block text-[11px] font-medium text-[#52525B] mb-1"
                  >
                    Titre de l’épisode
                  </label>
                  <input
                    id="edit-ep-title"
                    type="text"
                    maxLength={300}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                    className="w-full px-3 py-2 text-sm font-semibold text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div>
                    <label
                      htmlFor="edit-ep-number"
                      className="block text-[11px] font-medium text-[#52525B] mb-1"
                    >
                      Numéro
                    </label>
                    <input
                      id="edit-ep-number"
                      type="text"
                      maxLength={16}
                      value={editNumber}
                      onChange={(e) => setEditNumber(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-ep-category"
                      className="block text-[11px] font-medium text-[#52525B] mb-1"
                    >
                      Catégorie
                    </label>
                    <select
                      id="edit-ep-category"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as EpisodeCategory)}
                      className="w-full px-2.5 py-1.5 text-xs text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                    >
                      <option value="cinema_serie">Film / Série</option>
                      <option value="chanson">Chanson</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="edit-ep-status"
                      className="block text-[11px] font-medium text-[#52525B] mb-1"
                    >
                      Statut
                    </label>
                    <select
                      id="edit-ep-status"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as Episode['status'])}
                      className="w-full px-2.5 py-1.5 text-xs text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                    >
                      <option value="en_preparation">En préparation</option>
                      <option value="en_enregistrement">En enregistrement</option>
                      <option value="en_montage">En montage</option>
                      <option value="pret_a_publier">Prêt à publier</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="edit-ep-target"
                      className="block text-[11px] font-medium text-[#52525B] mb-1"
                    >
                      Durée cible (min)
                    </label>
                    <input
                      id="edit-ep-target"
                      type="number"
                      min={1}
                      max={240}
                      value={editTargetMinutes}
                      onChange={(e) => setEditTargetMinutes(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs font-mono text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="edit-ep-work"
                      className="block text-[11px] font-medium text-[#52525B] mb-1"
                    >
                      Œuvre support
                    </label>
                    <input
                      id="edit-ep-work"
                      type="text"
                      maxLength={300}
                      value={editWorkTitle}
                      onChange={(e) => setEditWorkTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-ep-theme"
                      className="block text-[11px] font-medium text-[#52525B] mb-1"
                    >
                      Thème philosophique
                    </label>
                    <input
                      id="edit-ep-theme"
                      type="text"
                      maxLength={300}
                      value={editTheme}
                      onChange={(e) => setEditTheme(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="edit-ep-logline"
                    className="block text-[11px] font-medium text-[#52525B] mb-1"
                  >
                    Accroche / Logline
                  </label>
                  <textarea
                    id="edit-ep-logline"
                    rows={2}
                    value={editLogline}
                    onChange={(e) => setEditLogline(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingEpisodeMeta(false)}
                    className="px-3 py-1.5 text-xs text-[#52525B] hover:text-[#18181B] cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#C2410C] hover:bg-[#9A3412] rounded-lg cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    Enregistrer
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#52525B]">
                  <span className="font-semibold text-[#18181B]">
                    Épisode {activeEpisode.number}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeEpisode.segments.length} segments</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`inline-flex items-center gap-1 font-mono tabular-nums font-medium ${
                      meetsTargetMinutes ? 'text-[#15803D]' : 'text-[#B45309]'
                    }`}
                  >
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    {formatTimecode(targetDurationSec)} / {minTargetMinutes}:00
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`font-mono tabular-nums font-medium ${
                      meetsWrittenMinutes ? 'text-[#15803D]' : 'text-[#B45309]'
                    }`}
                  >
                    Rédigé : {formatTimecode(totalDurationSec)}
                  </span>
                </div>
                <div
                  data-testid="episode-title-edit-trigger"
                  {...episodeTitleTrigger.triggerProps}
                  title="Double-clic (PC) ou appui long (mobile) pour modifier le titre et les informations"
                  className="group inline-flex items-baseline gap-2 max-w-full cursor-text select-none"
                >
                  <h1 className="font-display text-2xl lg:text-3xl font-semibold tracking-tight text-[#18181B] text-balance">
                    {activeEpisode.title}
                  </h1>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEpisodeMetaEditor();
                    }}
                    aria-label="Modifier le titre et les informations de l’épisode"
                    className="p-1 text-[#A1A1AA] hover:text-[#C2410C] opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity rounded cursor-pointer shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
                <p className="text-sm text-[#52525B] leading-relaxed">{activeEpisode.logline}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:items-end gap-2 shrink-0 max-w-full">
            <div
              role="group"
              aria-label="Filtrer par catégorie d’épisode"
              className="flex flex-wrap items-center gap-1 p-1 bg-[#ECEAE2] rounded-lg max-w-full"
            >
              {(
                [
                  { id: 'tous', label: `Tout (${episodes.length})` },
                  { id: 'cinema_serie', label: `Films & Séries (${filmEpisodes.length})` },
                  { id: 'chanson', label: `Chansons (${songEpisodes.length})` },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleChangeCategoryFilter(cat.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    categoryFilter === cat.id
                      ? 'bg-white text-[#18181B] shadow-xs'
                      : 'text-[#52525B] hover:text-[#18181B]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <button
                type="button"
                onClick={onOpenAppearance}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#18181B] bg-white hover:bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Palette className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
                Personnaliser l’affiche
              </button>

              <div className="flex items-center gap-1 bg-[#ECEAE2] p-1 rounded-lg max-w-full min-w-0">
                <button
                  type="button"
                  aria-label="Épisode précédent"
                  disabled={activeEpisodeIndex <= 0}
                  onClick={() => {
                    if (activeEpisodeIndex > 0) {
                      onSelectEpisode(visibleEpisodes[activeEpisodeIndex - 1].id);
                    }
                  }}
                  className="p-1.5 text-[#52525B] hover:text-[#18181B] disabled:opacity-35 rounded-md transition-colors cursor-pointer shrink-0"
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                </button>

                <select
                  aria-label="Choisir un épisode"
                  value={
                    visibleEpisodes.some((ep) => ep.id === activeEpisode.id)
                      ? activeEpisode.id
                      : visibleEpisodes[0]?.id ?? activeEpisode.id
                  }
                  onChange={(e) => onSelectEpisode(e.target.value)}
                  className="min-w-0 max-w-[200px] sm:max-w-[250px] px-2.5 py-1 text-xs font-medium text-[#18181B] bg-white rounded-md shadow-xs focus:outline-none focus:ring-1 focus:ring-[#C2410C] cursor-pointer"
                >
                  {visibleEpisodes.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      Ep. {ep.number} — {ep.workTitle.split('(')[0].trim()}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  aria-label="Épisode suivant"
                  disabled={
                    activeEpisodeIndex === -1 || activeEpisodeIndex >= visibleEpisodes.length - 1
                  }
                  onClick={() => {
                    if (
                      activeEpisodeIndex >= 0 &&
                      activeEpisodeIndex < visibleEpisodes.length - 1
                    ) {
                      onSelectEpisode(visibleEpisodes[activeEpisodeIndex + 1].id);
                    }
                  }}
                  className="p-1.5 text-[#52525B] hover:text-[#18181B] disabled:opacity-35 rounded-md transition-colors cursor-pointer shrink-0"
                >
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowCatalog((v) => !v)}
                aria-expanded={showCatalog}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showCatalog
                    ? 'bg-[#18181B] text-white border-[#18181B]'
                    : 'bg-white text-[#18181B] border-[#E5E2D9] hover:bg-[#FAF9F5]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                Catalogue ({visibleEpisodes.length})
              </button>
            </div>
          </div>
        </div>

        {showCatalog && (
          <div
            aria-label="Catalogue des épisodes préparés"
            className="bg-white border border-[#E5E2D9] rounded-xl p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#18181B]">
                Saison 1 · {visibleEpisodes.length} épisode(s) affiché(s) (format 30 min minimum)
              </p>
              <span className="text-xs text-[#71717A]">
                Cliquez sur un épisode pour ouvrir son plan, ses sources et son brouillon.
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {visibleEpisodes.map((ep) => {
                const isCurrent = ep.id === activeEpisode.id;
                const epTargetSec = calculateEpisodeTargetSeconds(ep);
                const isSong = (ep.category ?? 'cinema_serie') === 'chanson';
                return (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => {
                      onSelectEpisode(ep.id);
                      setShowCatalog(false);
                    }}
                    className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-[#FAF9F5] border-[#C2410C]'
                        : 'bg-white border-[#E5E2D9] hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-[#71717A]">
                      <span className="font-mono font-semibold text-[#C2410C]">
                        Ep. {ep.number} · {isSong ? 'Chanson' : 'Film/Série'}
                      </span>
                      <span className="font-mono tabular-nums">
                        Cible {formatTimecode(epTargetSec)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[#18181B] line-clamp-1">
                      {ep.workTitle.split('(')[0].trim()}
                    </p>
                    <p className="mt-0.5 text-xs text-[#52525B] line-clamp-2">
                      {ep.philosophicalTheme}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 3-Column Studio Script Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Column 1: Narrative Segment Organizer */}
        <section
          aria-label="Segments narratifs"
          className="lg:col-span-3 bg-white border border-[#E5E2D9] rounded-xl p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              data-testid="plan-header-trigger"
              {...planToolsTrigger.triggerProps}
              title="Double-clic (PC) ou appui long (mobile) pour les outils d’analyse et réorganisation"
              className={`font-display text-base font-semibold cursor-pointer select-none transition-colors ${
                showPlanTools ? 'text-[#C2410C]' : 'text-[#18181B]'
              }`}
            >
              Plan narratif
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAddSegment}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Segment
              </button>
            </div>
          </div>

          {showPlanTools && (
            <div
              data-testid="plan-advanced-drawer"
              className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg"
            >
              <button
                type="button"
                onClick={() => {
                  const nextOpen = !showEpisodeAnalysis;
                  setShowEpisodeAnalysis(nextOpen);
                  if (nextOpen) {
                    setEpisodeAnalysis(analyzeEpisodeTexts(activeEpisode));
                  }
                  setTidyFeedback('');
                }}
                aria-expanded={showEpisodeAnalysis}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showEpisodeAnalysis
                    ? 'bg-[#18181B] text-white'
                    : 'text-[#18181B] bg-white border border-[#E5E2D9] hover:bg-[#ECEAE2]'
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
                Analyser l’épisode
              </button>
              <button
                type="button"
                onClick={handleReorganizeEpisode}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#C2410C] hover:bg-[#9A3412] rounded-md transition-colors cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                Ranger
              </button>
            </div>
          )}

          {showEpisodeAnalysis && episodeAnalysis && (
            <div
              data-testid="episode-analysis-panel"
              className="p-3 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#18181B]">
                  {episodeAnalysis.isHealthy
                    ? 'Structure saine et rangée'
                    : `${episodeAnalysis.issues.length} point(s) repéré(s)`}
                </p>
                <span className="text-xs font-mono text-[#71717A]">
                  {episodeAnalysis.totalWords} mots · {episodeAnalysis.repetitionCount} écho(s)
                </span>
              </div>

              {episodeAnalysis.isHealthy ? (
                <p className="text-xs text-[#15803D] leading-relaxed">
                  Arc narratif ordonné, aucune répétition entre segments, notes rattachées et annotations calées.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {episodeAnalysis.issues.map((issue) => (
                    <li
                      key={issue.id}
                      className="p-2 bg-white border border-[#E5E2D9] rounded text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#18181B]">{issue.title}</span>
                        {issue.segmentId && (
                          <button
                            type="button"
                            onClick={() => onSelectSegment(issue.segmentId!)}
                            className="text-[#C2410C] font-medium hover:underline cursor-pointer shrink-0"
                          >
                            Voir
                          </button>
                        )}
                      </div>
                      <p className="text-[#52525B] leading-snug">{issue.detail}</p>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={handleReorganizeEpisode}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#C2410C] hover:bg-[#9A3412] rounded-md transition-colors cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                Ranger & nettoyer l’épisode
              </button>

              {tidyFeedback && (
                <p role="status" className="text-xs text-[#15803D] leading-relaxed">
                  {tidyFeedback}
                </p>
              )}
            </div>
          )}

          <div className="divide-y divide-[#F0EFEA]" data-testid="segment-list">
            {activeEpisode.segments.map((seg, index) => {
              const isSelected = seg.id === activeSegment?.id;
              const segDuration = estimateSpeechDurationSeconds(seg.scriptText, seg.estimatedWpm);
              const segTarget = seg.targetDurationSec ?? segDuration;
              return (
                <div
                  key={seg.id}
                  className={`py-3 first:pt-1 last:pb-1 transition-colors ${
                    isSelected ? 'bg-[#FAF9F5] -mx-3 px-3 rounded-lg' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectSegment(seg.id)}
                      className="text-left flex-1 min-w-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#C2410C]"
                    >
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#71717A]">
                        <span className="font-mono tabular-nums">
                          {String(index + 1).padStart(2, '0')}.
                        </span>
                        <span>{ROLE_LABELS[seg.role]}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-[#C2410C]">
                          Cible {formatTimecode(segTarget)}
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-sm font-medium leading-snug ${
                          isSelected ? 'text-[#C2410C]' : 'text-[#18181B]'
                        }`}
                      >
                        {seg.title}
                      </p>
                      <p className="mt-1 text-xs text-[#71717A]">
                        {STATUS_LABELS[seg.status]} · Rédigé {formatTimecode(segDuration)} ·{' '}
                        {seg.linkedSourceIds.length} source(s)
                      </p>
                    </button>

                    {(showPlanTools || isSelected) && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label={`Monter le segment ${seg.title}`}
                          disabled={index === 0}
                          onClick={() => handleMoveSegment(seg.id, 'up')}
                          className="p-1 text-[#71717A] hover:text-[#18181B] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Descendre le segment ${seg.title}`}
                          disabled={index === activeEpisode.segments.length - 1}
                          onClick={() => handleMoveSegment(seg.id, 'down')}
                          className="p-1 text-[#71717A] hover:text-[#18181B] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Column 2: Interactive Script & Concrete Examples Editor */}
        {activeSegment && (
          <section
            ref={editorSectionRef}
            id="notebook-editor-section"
            aria-label="Éditeur de script interactif"
            className="lg:col-span-5 bg-white border border-[#E5E2D9] rounded-xl p-4 sm:p-6 space-y-5 scroll-mt-16"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#F0EFEA]">
              <div
                data-testid="segment-header-trigger"
                {...segmentDetailsTrigger.triggerProps}
                title="Double-clic (PC) ou appui long (mobile) pour régler fonction, cible, débit et extrait sonore"
                className="flex flex-wrap items-center gap-2 text-xs text-[#71717A] cursor-pointer select-none"
              >
                <span className={`font-medium ${showSegmentDetails ? 'text-[#C2410C]' : 'text-[#18181B]'}`}>
                  {ROLE_LABELS[activeSegment.role]}
                </span>
                <span aria-hidden="true">·</span>
                <span>{STATUS_LABELS[activeSegment.status]}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {formatTimecode(
                    estimateSpeechDurationSeconds(
                      activeSegment.scriptText,
                      activeSegment.estimatedWpm
                    )
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onOpenPrompter && (
                  <button
                    type="button"
                    onClick={onOpenPrompter}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] border border-[#E5E2D9] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
                    Lire au Prompteur
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRecordSegment(activeSegment.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#C2410C] hover:bg-[#9A3412] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                  Enregistrer ce segment
                </button>
                {activeEpisode.segments.length > 1 && showSegmentDetails && (
                  <button
                    type="button"
                    aria-label={`Supprimer le segment ${activeSegment.title}`}
                    onClick={() => handleDeleteSegment(activeSegment.id)}
                    className="p-1.5 text-[#71717A] hover:text-[#DC2626] rounded-md cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div
                {...segmentDetailsTrigger.triggerProps}
                title="Double-clic (PC) ou appui long (mobile) pour afficher les paramètres détaillés du segment"
              >
                <label
                  htmlFor="seg-title"
                  className="block text-xs font-medium text-[#52525B] mb-1.5"
                >
                  Titre du segment narratif
                </label>
                <input
                  id="seg-title"
                  type="text"
                  value={activeSegment.title}
                  onChange={(e) => updateSegment({ title: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-medium text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                />
              </div>

              {showSegmentDetails && (
                <div
                  data-testid="segment-options-drawer"
                  className="p-3.5 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="seg-role"
                        className="block text-xs font-medium text-[#52525B] mb-1.5"
                      >
                        Fonction narrative
                      </label>
                      <select
                        id="seg-role"
                        value={activeSegment.role}
                        onChange={(e) => updateSegment({ role: e.target.value as SegmentRole })}
                        className="w-full px-2.5 py-2 text-xs text-[#18181B] bg-white border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                      >
                        {Object.entries(ROLE_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="seg-status"
                        className="block text-xs font-medium text-[#52525B] mb-1.5"
                      >
                        Avancement
                      </label>
                      <select
                        id="seg-status"
                        value={activeSegment.status}
                        onChange={(e) => updateSegment({ status: e.target.value as SegmentStatus })}
                        className="w-full px-2.5 py-2 text-xs text-[#18181B] bg-white border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                      >
                        {Object.entries(STATUS_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="seg-target-min"
                        className="block text-xs font-medium text-[#52525B] mb-1.5"
                      >
                        Durée cible du segment (min)
                      </label>
                      <input
                        id="seg-target-min"
                        type="number"
                        min={1}
                        max={30}
                        step={0.5}
                        value={Number(((activeSegment.targetDurationSec ?? 300) / 60).toFixed(1))}
                        onChange={(e) => {
                          const mins = Number(e.target.value);
                          if (!Number.isNaN(mins) && mins >= 0.5) {
                            updateSegment({ targetDurationSec: Math.round(mins * 60) });
                          }
                        }}
                        className="w-full px-2.5 py-2 text-xs font-mono text-[#18181B] bg-white border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="seg-wpm"
                        className="block text-xs font-medium text-[#52525B] mb-1.5"
                      >
                        Débit ({activeSegment.estimatedWpm} mots/min)
                      </label>
                      <input
                        id="seg-wpm"
                        type="range"
                        min={110}
                        max={175}
                        value={activeSegment.estimatedWpm}
                        onChange={(e) => updateSegment({ estimatedWpm: Number(e.target.value) })}
                        className="w-full mt-2 accent-[#C2410C]"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="seg-example"
                      className="block text-xs font-medium text-[#52525B] mb-1.5"
                    >
                      Exemple concret de la vie sociale
                    </label>
                    <textarea
                      id="seg-example"
                      rows={2}
                      value={activeSegment.concreteExample}
                      onChange={(e) => updateSegment({ concreteExample: e.target.value })}
                      placeholder="Ex : Prendre le même métro à 7h12 sans réfléchir..."
                      className="w-full px-3 py-2 text-sm text-[#18181B] bg-white border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C] leading-relaxed"
                    />
                  </div>

                  <div className="pt-2 border-t border-[#E5E2D9]">
                    <label
                      htmlFor="seg-sound-cue"
                      className="block text-xs font-medium text-[#52525B] mb-1.5"
                    >
                      Extrait sonore illustratif associé
                    </label>
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                      <select
                        id="seg-sound-cue"
                        value={activeSegment.soundCueId ?? ''}
                        onChange={(e) =>
                          updateSegment({ soundCueId: e.target.value || undefined })
                        }
                        className="flex-1 min-w-0 w-full px-3 py-2 text-xs text-[#18181B] bg-white border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                      >
                        <option value="">Aucun extrait sélectionné</option>
                        {SOUND_EXTRACTS.map((cue) => (
                          <option key={cue.id} value={cue.id}>
                            {cue.title} ({cue.durationSec.toFixed(1)}s)
                          </option>
                        ))}
                      </select>
                      {activeSegment.soundCueId && (
                        <button
                          type="button"
                          onClick={() => onPreviewSoundCue(activeSegment.soundCueId!)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#18181B] bg-[#ECEAE2] hover:bg-[#E2DFD5] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Écouter
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive Script Editor */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="seg-script" className="text-xs font-medium text-[#52525B]">
                    Script parlé (avec balises de mise en scène)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => insertCueIntoScript('[EXEMPLE CONCRET]')}
                      className="px-2 py-1 text-xs font-medium text-[#52525B] hover:text-[#18181B] bg-[#F6F5F0] rounded transition-colors cursor-pointer"
                    >
                      + Exemple
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const cue = SOUND_EXTRACTS.find((c) => c.id === activeSegment.soundCueId);
                        insertCueIntoScript(
                          `[EXTRAIT SONORE : ${cue ? cue.title : 'Illustration'}]`
                        );
                      }}
                      className="px-2 py-1 text-xs font-medium text-[#52525B] hover:text-[#18181B] bg-[#F6F5F0] rounded transition-colors cursor-pointer"
                    >
                      + Extrait sonore
                    </button>
                    <button
                      type="button"
                      onClick={() => insertCueIntoScript('[PAUSE 2s]')}
                      className="px-2 py-1 text-xs font-medium text-[#52525B] hover:text-[#18181B] bg-[#F6F5F0] rounded transition-colors cursor-pointer"
                    >
                      + Pause
                    </button>
                  </div>
                </div>
                <NotebookEditor
                  episode={activeEpisode}
                  segment={activeSegment}
                  appearance={appearance}
                  onUpdateSegment={updateSegment}
                  onSelectSegment={onSelectSegment}
                />
              </div>
            </div>
          </section>
        )}

        {/* Column 3: Brouillon à côté, Sources & Research Notes */}
        <section
          aria-label="Brouillon à côté, sources et notes de recherche"
          className="lg:col-span-4 bg-white border border-[#E5E2D9] rounded-xl p-5 space-y-5"
        >
          {/* Side-by-side Brouillon for raw thoughts -> Prompteur */}
          <div className="pb-4 border-b border-[#E5E2D9] space-y-2.5">
            <div
              data-testid="draft-options-trigger"
              {...draftOptionsTrigger.triggerProps}
              title="Double-clic (PC) ou appui long (mobile) pour choisir manuellement le segment cible"
              className="flex items-center justify-between gap-2 cursor-pointer select-none"
            >
              <h2 className="font-display text-base font-semibold text-[#18181B] flex items-center gap-1.5">
                <StickyNote className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
                Brouillon à côté
              </h2>
              <span className="text-xs text-[#71717A]">
                {draftTargetOverride === 'auto' ? 'Auto' : 'Cible choisie'}
              </span>
            </div>
            <textarea
              aria-label="Brouillon de pensées à côté"
              rows={4}
              value={activeEpisode.draftThoughts ?? ''}
              onChange={(e) => {
                setDraftFeedback('');
                onUpdateEpisode({ ...activeEpisode, draftThoughts: e.target.value });
              }}
              placeholder="Écrivez une idée spontanée, une métaphore (fermier, boulanger, postier...) ou une nuance à ajouter au prompteur..."
              className="w-full px-3 py-2 text-sm text-[#18181B] bg-[#FFFDF5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C] leading-relaxed"
            />
            {draftDetection.detectedConcepts.length > 0 && (
              <p
                data-testid="draft-detected-concepts"
                className="text-xs text-[#71717A] leading-relaxed"
              >
                <span className="font-medium text-[#52525B]">Concepts clés détectés :</span>{' '}
                {draftDetection.detectedConcepts.join(' · ')}
              </p>
            )}
            {draftDetection.repeatedThoughts.length > 0 &&
              dismissedDraftHintFor !== (activeEpisode.draftThoughts ?? '') && (
                <div
                  role="status"
                  aria-live="polite"
                  data-testid="draft-concept-suggestion"
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
                          onSelectSegment(draftDetection.repeatedThoughts[0].segmentId)
                        }
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-[#92400E] underline underline-offset-2 cursor-pointer"
                      >
                        <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                        Voir le segment {String(draftDetection.repeatedThoughts[0].segmentIndex).padStart(2, '0')}
                      </button>
                      <button
                        type="button"
                        aria-label="Masquer la suggestion"
                        onClick={() =>
                          setDismissedDraftHintFor(activeEpisode.draftThoughts ?? '')
                        }
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
                  {draftDetection.repeatedThoughts[1] && (
                    <p className="text-xs text-[#92400E]/90 pt-0.5 border-t border-[#FDE68A]/70">
                      Aussi évoqué dans{' '}
                      <button
                        type="button"
                        onClick={() =>
                          onSelectSegment(draftDetection.repeatedThoughts[1].segmentId)
                        }
                        className="font-medium underline underline-offset-2 cursor-pointer"
                      >
                        {String(draftDetection.repeatedThoughts[1].segmentIndex).padStart(2, '0')}.{' '}
                        {draftDetection.repeatedThoughts[1].segmentTitle}
                      </button>
                    </p>
                  )}
                </div>
              )}
            {smartDraftPlan && (
              <div
                data-testid="smart-draft-route"
                className="px-3 py-2.5 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#18181B]">
                    Segment adéquat :{' '}
                    <span className="text-[#C2410C]">
                      {String(smartDraftPlan.targetSegmentIndex).padStart(2, '0')}.{' '}
                      {smartDraftPlan.targetSegmentTitle}
                    </span>
                  </p>
                  {showDraftOptions && (
                    <select
                      aria-label="Destination du brouillon"
                      value={draftTargetOverride}
                      onChange={(e) => setDraftTargetOverride(e.target.value)}
                      className="max-w-[165px] px-2 py-1 text-xs bg-white border border-[#E5E2D9] rounded focus:outline-none focus:border-[#C2410C] cursor-pointer"
                    >
                      <option value="auto">Auto (selon le sujet)</option>
                      {activeEpisode.segments.map((seg, i) => (
                        <option key={seg.id} value={seg.id}>
                          {String(i + 1).padStart(2, '0')}. {seg.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <p className="text-xs text-[#52525B]">{smartDraftPlan.reasonLabel}</p>
                <p className="text-xs text-[#71717A] italic line-clamp-2">
                  {smartDraftPlan.insertionMode === 'after_sentence'
                    ? 'Insertion juste après : '
                    : 'Insertion dans le passage : '}
                  « {smartDraftPlan.anchorExcerpt} »
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePolishDraft}
                disabled={!(activeEpisode.draftThoughts ?? '').trim()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] disabled:opacity-40 rounded-md transition-colors cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
                Réajuster
              </button>
              <button
                type="button"
                onClick={handleSendDraftToSegment}
                disabled={!(activeEpisode.draftThoughts ?? '').trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-40 rounded-md transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                Placer au bon endroit
              </button>
            </div>
            {draftFeedback && (
              <p role="status" className="text-xs font-medium text-[#15803D]">
                {draftFeedback}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[#18181B]">
                Suivi des sources ({activeEpisode.sources.length})
              </h2>
              <button
                type="button"
                onClick={() => setShowAddSource((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Source
              </button>
            </div>

            {/* Search & Segmented Status Filter */}
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={sourceQuery}
                onChange={(e) => setSourceQuery(e.target.value)}
                placeholder="Filtrer par auteur, film ou idée..."
                aria-label="Filtrer les sources"
                className="w-full pl-8 pr-3 py-1.5 text-xs text-[#18181B] bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#F6F5F0] rounded-lg">
              {(['toutes', 'verifiee', 'a_relire', 'a_citer'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSourceFilter(status)}
                  className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    sourceFilter === status
                      ? 'bg-white text-[#18181B] shadow-xs'
                      : 'text-[#52525B] hover:text-[#18181B]'
                  }`}
                >
                  {status === 'toutes' ? 'Toutes' : SOURCE_STATUS_LABELS[status]}
                </button>
              ))}
            </div>

            {showAddSource && (
              <form
                onSubmit={handleCreateSource}
                className="p-3.5 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg space-y-2.5"
              >
                <p className="text-xs font-semibold text-[#18181B]">Nouvelle référence</p>
                {sourceValidationError && (
                  <p role="alert" className="text-xs text-[#DC2626]">
                    {sourceValidationError}
                  </p>
                )}
                <input
                  type="text"
                  placeholder="Titre de l’œuvre ou du livre"
                  value={newSourceTitle}
                  onChange={(e) => setNewSourceTitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E5E2D9] rounded focus:outline-none focus:border-[#C2410C]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Auteur / Réalisateur"
                    value={newSourceAuthor}
                    onChange={(e) => setNewSourceAuthor(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E5E2D9] rounded focus:outline-none focus:border-[#C2410C]"
                  />
                  <input
                    type="text"
                    placeholder="Année"
                    value={newSourceYear}
                    onChange={(e) => setNewSourceYear(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E5E2D9] rounded focus:outline-none focus:border-[#C2410C]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newSourceKind}
                    onChange={(e) => setNewSourceKind(e.target.value as SourceKind)}
                    aria-label="Type de source"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E5E2D9] rounded focus:outline-none focus:border-[#C2410C]"
                  >
                    {Object.entries(SOURCE_KIND_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Page ou timecode"
                    value={newSourceLocation}
                    onChange={(e) => setNewSourceLocation(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E5E2D9] rounded focus:outline-none focus:border-[#C2410C]"
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="Idée clé à vulgariser..."
                  value={newSourceTakeaway}
                  onChange={(e) => setNewSourceTakeaway(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E5E2D9] rounded focus:outline-none focus:border-[#C2410C]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddSource(false)}
                    className="px-2.5 py-1 text-xs text-[#52525B] cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 text-xs font-medium text-white bg-[#18181B] rounded cursor-pointer"
                  >
                    Enregistrer la source
                  </button>
                </div>
              </form>
            )}

            {/* Source List */}
            <div className="divide-y divide-[#F0EFEA] max-h-[340px] overflow-y-auto pr-1" data-testid="source-list">
              {filteredSources.length === 0 ? (
                <p className="py-4 text-xs text-[#71717A]">
                  Aucune source ne correspond à ce filtre.
                </p>
              ) : (
                filteredSources.map((src) => {
                  const isLinked = activeSegment?.linkedSourceIds.includes(src.id) ?? false;
                  return (
                    <div key={src.id} className="py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs text-[#71717A]">
                            {src.kind === 'film_serie' ? (
                              <Film className="w-3 h-3 shrink-0" aria-hidden="true" />
                            ) : src.kind === 'chanson' ? (
                              <Music className="w-3 h-3 shrink-0" aria-hidden="true" />
                            ) : (
                              <BookOpen className="w-3 h-3 shrink-0" aria-hidden="true" />
                            )}
                            <span>{SOURCE_KIND_LABELS[src.kind]}</span>
                            <span aria-hidden="true">·</span>
                            <span>{src.year}</span>
                          </div>
                          <p className="text-sm font-medium text-[#18181B] mt-0.5">
                            {src.authorOrDirector} — {src.title}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => cycleSourceStatus(src.id)}
                          title="Changer le statut de vérification"
                          className={`text-xs font-medium shrink-0 cursor-pointer ${
                            src.status === 'verifiee'
                              ? 'text-[#15803D]'
                              : src.status === 'a_relire'
                                ? 'text-[#B45309]'
                                : 'text-[#52525B]'
                          }`}
                        >
                          {SOURCE_STATUS_LABELS[src.status]}
                        </button>
                      </div>

                      <p className="text-xs text-[#71717A] font-mono">{src.referenceLocation}</p>
                      <p className="text-xs text-[#3F3F46] leading-relaxed">{src.keyTakeaway}</p>

                      {activeSegment && (
                        <button
                          type="button"
                          onClick={() => toggleSourceLink(src.id)}
                          className={`inline-flex items-center gap-1 text-xs font-medium transition-colors cursor-pointer ${
                            isLinked ? 'text-[#C2410C]' : 'text-[#71717A] hover:text-[#18181B]'
                          }`}
                        >
                          <Check className="w-3 h-3" aria-hidden="true" />
                          {isLinked ? 'Liée à ce segment' : 'Lier au segment actif'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Research Notes Sub-Section */}
          <div className="pt-4 border-t border-[#E5E2D9] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#18181B] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
                Notes de recherche ({activeEpisode.notes.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowAddNote((v) => !v)}
                className="text-xs font-medium text-[#C2410C] hover:text-[#9A3412] cursor-pointer"
              >
                + Note
              </button>
            </div>

            {showAddNote && (
              <form
                onSubmit={handleAddNote}
                className="p-3 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg space-y-2"
              >
                <input
                  type="text"
                  placeholder="Titre de la note..."
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E5E2D9] rounded focus:outline-none focus:border-[#C2410C]"
                />
                <textarea
                  rows={2}
                  placeholder="Idée d’exemple, nuance, remarque d’intonation..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E5E2D9] rounded focus:outline-none focus:border-[#C2410C]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddNote(false)}
                    className="px-2 py-1 text-xs text-[#52525B] cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs font-medium text-white bg-[#18181B] rounded cursor-pointer"
                  >
                    Ajouter
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-[#F0EFEA] max-h-[210px] overflow-y-auto pr-1">
              {activeEpisode.notes.length === 0 ? (
                <p className="py-2 text-xs text-[#71717A]">Aucune note de recherche pour cet épisode.</p>
              ) : (
                activeEpisode.notes.map((note) => (
                  <div key={note.id} className="py-2.5 first:pt-0 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#18181B]">{note.title}</span>
                      <span className="text-[#71717A] font-mono">{note.createdAt}</span>
                    </div>
                    <p className="text-xs text-[#3F3F46] leading-relaxed">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
