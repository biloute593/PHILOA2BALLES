import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  FileEdit,
  FolderInput,
  GitBranch,
  Menu,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import type { Episode, MemoryNote } from '../types/podcast';
import {
  detectDraftConceptMatches,
  planSmartDraftPlacement,
} from '../utils/frenchPolisher';

interface MobileGeminiHomeProps {
  episodes: Episode[];
  activeEpisode: Episode;
  memoryNotes: MemoryNote[];
  isCloudSignedIn: boolean;
  focusPromptSignal: number;
  onAddMemoryNote: (content: string) => void;
  onUpdateMemoryNote: (noteId: string, content: string) => void;
  onDeleteMemoryNote: (noteId: string) => void;
  onAssignNoteToEpisode: (
    noteId: string,
    episodeId: string,
    forcedSegmentId?: string
  ) => { segmentId: string; segmentTitle: string } | null;
  onOpenSegmentToRework: (episodeId: string, segmentId: string) => void;
  onOpenPrompter: (episodeId?: string) => void;
  onOpenDrawer: () => void;
}

function formatNoteTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
    }) +
      ' · ' +
      d.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
  } catch {
    return '';
  }
}

export function MobileGeminiHome({
  episodes,
  activeEpisode,
  memoryNotes,
  isCloudSignedIn,
  focusPromptSignal,
  onAddMemoryNote,
  onUpdateMemoryNote,
  onDeleteMemoryNote,
  onAssignNoteToEpisode,
  onOpenSegmentToRework,
  onOpenPrompter,
  onOpenDrawer,
}: MobileGeminiHomeProps) {
  const [draftInput, setDraftInput] = useState('');
  const [assigningNoteId, setAssigningNoteId] = useState<string | null>(null);
  const [targetEpisodeId, setTargetEpisodeId] = useState<string>(activeEpisode.id);
  const [targetSegmentId, setTargetSegmentId] = useState<string>('auto');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [statusFeedback, setStatusFeedback] = useState('');

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const editingNoteIdRef = useRef<string | null>(null);
  const assigningNoteIdRef = useRef<string | null>(null);
  const prevNotesLenRef = useRef<number>(memoryNotes.length);

  editingNoteIdRef.current = editingNoteId;
  assigningNoteIdRef.current = assigningNoteId;

  // Auto-focus the prompt input on initial mobile launch or explicit return-to-home signal, never stealing focus while editing a note
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (editingNoteIdRef.current !== null || assigningNoteIdRef.current !== null) return;
    const mql = window.matchMedia('(max-width: 767px)');
    if (mql.matches) {
      const timer = window.setTimeout(() => {
        if (editingNoteIdRef.current === null && assigningNoteIdRef.current === null) {
          inputRef.current?.focus();
        }
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [focusPromptSignal]);

  // Auto-resize composer textarea cleanly up to 5 lines without collapsing when empty or hidden
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!draftInput) {
      el.style.height = '';
      return;
    }
    el.style.height = 'auto';
    if (el.scrollHeight > 0) {
      el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
    }
  }, [draftInput]);

  useEffect(() => {
    const prevLen = prevNotesLenRef.current;
    prevNotesLenRef.current = memoryNotes.length;
    if (
      memoryNotes.length > prevLen &&
      editingNoteIdRef.current === null &&
      assigningNoteIdRef.current === null
    ) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [memoryNotes.length]);

  const selectedAssignEpisode = useMemo(
    () => episodes.find((e) => e.id === targetEpisodeId) ?? activeEpisode,
    [episodes, targetEpisodeId, activeEpisode]
  );

  const assigningNote = useMemo(
    () => memoryNotes.find((n) => n.id === assigningNoteId) ?? null,
    [memoryNotes, assigningNoteId]
  );

  const assignConceptDetection = useMemo(() => {
    if (!assigningNote) return null;
    return detectDraftConceptMatches(selectedAssignEpisode, assigningNote.content);
  }, [selectedAssignEpisode, assigningNote]);

  const assignSmartPlan = useMemo(() => {
    if (!assigningNote) return null;
    return planSmartDraftPlacement(
      selectedAssignEpisode,
      assigningNote.content,
      targetSegmentId === 'auto' ? undefined : targetSegmentId
    );
  }, [selectedAssignEpisode, assigningNote, targetSegmentId]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = draftInput.trim();
    if (!cleaned) return;
    onAddMemoryNote(cleaned);
    setDraftInput('');
    setStatusFeedback('');
    window.setTimeout(() => inputRef.current?.focus(), 20);
  };

  const openAssignPanel = (note: MemoryNote) => {
    if (assigningNoteId === note.id) {
      setAssigningNoteId(null);
      return;
    }
    setAssigningNoteId(note.id);
    setTargetEpisodeId(note.assignedEpisodeId || activeEpisode.id);
    setTargetSegmentId('auto');
  };

  return (
    <section
      data-testid="mobile-gemini-home"
      aria-label="Accueil capture rapide et notes de mémoire"
      className="md:hidden flex flex-col min-h-[calc(100dvh-3.5rem)] pb-32 bg-[#F6F5F0]"
    >
      {/* Compact Header Metadata Row */}
      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2">
        <div className="text-xs text-[#52525B] flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-[#18181B]">Notes mémoire</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{memoryNotes.length}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">
            {isCloudSignedIn ? 'Synchro cloud active' : 'Sauvé sur l’appareil'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onOpenPrompter(activeEpisode.id)}
          className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-white border border-[#E5E2D9] text-xs font-medium text-[#18181B] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
          Prompteur
        </button>
      </div>

      {statusFeedback && (
        <p
          role="status"
          className="mx-4 mb-2 px-3 py-2 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-xs font-medium text-[#065F46]"
        >
          {statusFeedback}
        </p>
      )}

      {/* Gemini-Style Capture Canvas / Feed */}
      {memoryNotes.length === 0 ? (
        <div className="flex-1 flex flex-col justify-center px-5 py-8 space-y-5">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[#18181B]">
              Écrivez votre idée directement.
            </h1>
            <p className="text-sm text-[#52525B] leading-relaxed">
              Chaque pensée saisie ci-dessous reste enregistrée en note de mémoire. Vous
              pourrez ensuite la ranger dans n’importe quel épisode ou déplier les segments
              depuis le menu.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <button
              type="button"
              onClick={onOpenDrawer}
              className="min-h-[48px] px-4 py-3 rounded-2xl bg-white border border-[#E5E2D9] text-left flex items-center justify-between gap-3 cursor-pointer"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Menu className="w-4 h-4 text-[#C2410C] shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium text-[#18181B] truncate">
                  Ouvrir le menu &amp; déplier un épisode
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-[#71717A] shrink-0" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onOpenPrompter(activeEpisode.id)}
              className="min-h-[48px] px-4 py-3 rounded-2xl bg-white border border-[#E5E2D9] text-left flex items-center justify-between gap-3 cursor-pointer"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <BookOpen className="w-4 h-4 text-[#C2410C] shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium text-[#18181B] truncate">
                  Prompteur · Ép. {activeEpisode.number} ({activeEpisode.workTitle.split('(')[0].trim()})
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-[#71717A] shrink-0" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 px-4 py-2 space-y-3" data-testid="memory-notes-list">
          {memoryNotes.map((note) => {
            const isEditing = editingNoteId === note.id;
            const isAssigning = assigningNoteId === note.id;
            const timeLabel = formatNoteTimestamp(note.createdAt);

            return (
              <article
                key={note.id}
                data-testid={`memory-note-card-${note.id}`}
                className="bg-white border border-[#E5E2D9] rounded-2xl p-3.5 shadow-2xs space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-[#71717A] truncate">
                    <span>{timeLabel || 'Note'}</span>
                    <span aria-hidden="true"> · </span>
                    <span
                      className={
                        note.assignedEpisodeLabel
                          ? 'text-[#15803D] font-medium'
                          : 'text-[#C2410C] font-medium'
                      }
                    >
                      {note.assignedEpisodeLabel
                        ? `Rangée dans ${note.assignedEpisodeLabel}`
                        : 'En mémoire'}
                    </span>
                  </p>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      aria-label="Modifier cette note de mémoire"
                      onClick={() => {
                        setEditingNoteId(note.id);
                        setEditingText(note.content);
                      }}
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-[#F6F5F0] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Supprimer cette note de mémoire"
                      onClick={() => onDeleteMemoryNote(note.id)}
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-[#71717A] hover:text-[#B91C1C] hover:bg-[#FEF2F2] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      aria-label="Modifier le contenu de la note"
                      rows={3}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full px-3 py-2 text-sm text-[#18181B] bg-[#FAF9F5] border border-[#D6D2C4] rounded-xl focus:outline-none focus:border-[#C2410C]"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingNoteId(null)}
                        className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-[#52525B] bg-[#F6F5F0] rounded-lg cursor-pointer"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editingText.trim()) {
                            onUpdateMemoryNote(note.id, editingText.trim());
                          }
                          setEditingNoteId(null);
                        }}
                        className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-white bg-[#18181B] rounded-lg cursor-pointer inline-flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        Enregistrer
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[#18181B] leading-relaxed whitespace-pre-wrap">
                    {note.content}
                  </p>
                )}

                {/* Note Routing Actions */}
                <div className="pt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openAssignPanel(note)}
                    aria-expanded={isAssigning}
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      isAssigning
                        ? 'bg-[#18181B] text-white'
                        : 'bg-[#F6F5F0] text-[#18181B] hover:bg-[#ECEAE2]'
                    }`}
                  >
                    <FolderInput className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
                    {note.assignedEpisodeId ? 'Changer d’épisode' : 'Mettre dans un épisode'}
                  </button>

                  {note.assignedEpisodeId && note.assignedSegmentId && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenSegmentToRework(note.assignedEpisodeId!, note.assignedSegmentId!)
                      }
                      className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium bg-[#FFF7ED] text-[#9A3412] border border-[#FDBA74]/50 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileEdit className="w-3.5 h-3.5" aria-hidden="true" />
                      Retravailler le segment
                    </button>
                  )}

                  {note.assignedEpisodeId && (
                    <button
                      type="button"
                      onClick={() => onOpenPrompter(note.assignedEpisodeId!)}
                      className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium bg-white border border-[#E5E2D9] text-[#18181B] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                      Prompteur
                    </button>
                  )}
                </div>

                {/* Inline Episode & Segment Assignment Drawer */}
                {isAssigning && (
                  <div className="mt-2 p-3 rounded-xl bg-[#FAF9F5] border border-[#E5E2D9] space-y-3">
                    <div className="space-y-1">
                      <label
                        htmlFor={`assign-ep-${note.id}`}
                        className="block text-[11px] font-medium text-[#52525B]"
                      >
                        Choisir l’épisode de destination
                      </label>
                      <select
                        id={`assign-ep-${note.id}`}
                        aria-label="Épisode cible"
                        value={selectedAssignEpisode.id}
                        onChange={(e) => {
                          setTargetEpisodeId(e.target.value);
                          setTargetSegmentId('auto');
                        }}
                        className="w-full min-h-[44px] px-3 py-2 text-xs font-medium text-[#18181B] bg-white border border-[#D6D2C4] rounded-xl focus:outline-none focus:border-[#C2410C]"
                      >
                        {episodes.map((ep) => (
                          <option key={ep.id} value={ep.id}>
                            Ép. {ep.number} — {ep.workTitle.split('(')[0].trim()}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor={`assign-seg-${note.id}`}
                        className="block text-[11px] font-medium text-[#52525B]"
                      >
                        Segment cible
                      </label>
                      <select
                        id={`assign-seg-${note.id}`}
                        aria-label="Segment cible"
                        value={targetSegmentId}
                        onChange={(e) => setTargetSegmentId(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 text-xs text-[#18181B] bg-white border border-[#D6D2C4] rounded-xl focus:outline-none focus:border-[#C2410C]"
                      >
                        <option value="auto">
                          Auto : placer dans le passage le plus cohérent
                        </option>
                        {selectedAssignEpisode.segments.map((seg, i) => (
                          <option key={seg.id} value={seg.id}>
                            {String(i + 1).padStart(2, '0')}. {seg.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    {assignConceptDetection && assignConceptDetection.repeatedThoughts.length > 0 && (
                      <div className="px-2.5 py-2 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#78350F] space-y-1">
                        <p className="font-medium flex items-center gap-1 text-[#92400E]">
                          <GitBranch className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span>
                            Idée déjà abordée dans{' '}
                            {String(assignConceptDetection.repeatedThoughts[0].segmentIndex).padStart(
                              2,
                              '0'
                            )}
                            . {assignConceptDetection.repeatedThoughts[0].segmentTitle}
                          </span>
                        </p>
                      </div>
                    )}

                    {assignSmartPlan && (
                      <p className="text-[11px] text-[#52525B]">
                        Cible prévue :{' '}
                        <span className="font-semibold text-[#C2410C]">
                          {String(assignSmartPlan.targetSegmentIndex).padStart(2, '0')}.{' '}
                          {assignSmartPlan.targetSegmentTitle}
                        </span>
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAssigningNoteId(null)}
                        className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium text-[#52525B] bg-white border border-[#E5E2D9] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const res = onAssignNoteToEpisode(
                            note.id,
                            selectedAssignEpisode.id,
                            targetSegmentId === 'auto' ? undefined : targetSegmentId
                          );
                          if (res) {
                            setAssigningNoteId(null);
                            setStatusFeedback(
                              `Note intégrée dans Ép. ${selectedAssignEpisode.number} · « ${res.segmentTitle} ».`
                            );
                          }
                        }}
                        className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#C2410C] hover:bg-[#9A3412] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        Placer dans l’épisode
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          <div ref={listEndRef} />
        </div>
      )}

      {/* Fixed Bottom Gemini Prompt Bar */}
      <form
        onSubmit={handleSubmit}
        className="fixed bottom-0 left-0 right-0 z-30 bg-[#F6F5F0]/95 backdrop-blur-md border-t border-[#E5E2D9] px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-end gap-2 bg-white border border-[#D6D2C4] focus-within:border-[#C2410C] rounded-2xl px-3 py-1.5 shadow-sm">
          <textarea
            ref={inputRef}
            id="mobile-gemini-prompt-input"
            aria-label="Écrire une note de mémoire"
            rows={1}
            value={draftInput}
            onChange={(e) => setDraftInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Notez une idée à la volée…"
            className="flex-1 min-h-[44px] resize-none bg-transparent text-sm text-[#18181B] placeholder:text-[#71717A] focus:outline-none py-2.5 leading-snug max-h-32"
          />
          <button
            type="submit"
            disabled={!draftInput.trim()}
            aria-label="Enregistrer la note en mémoire"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[#18181B] hover:bg-[#27272A] disabled:opacity-35 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          >
            <ArrowUp className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </section>
  );
}
