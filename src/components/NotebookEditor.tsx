import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Compass,
  Eraser,
  GitBranch,
  MessageSquarePlus,
  PenLine,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  CueKind,
  Episode,
  NarrativeSegment,
  NotebookAppearance,
  WordComment,
} from '../types/podcast';
import {
  adjustThoughtToEpisodeThread,
  analyzeSegmentThought,
  detectEpisodeRepetitions,
  rewriteRepeatedSentenceAsCallback,
  type EpisodeThreadMatch,
} from '../utils/frenchPolisher';
import { createWordComment, splitTextWithAnnotations } from '../utils/wordAnnotations';

type NotebookMode = 'write' | 'read' | 'sketch';

interface NotebookEditorProps {
  episode: Episode;
  segment: NarrativeSegment;
  appearance: NotebookAppearance;
  onUpdateSegment: (patch: Partial<NarrativeSegment>) => void;
  onSelectSegment?: (segmentId: string) => void;
}

const CUE_KIND_LABELS: Record<CueKind, string> = {
  intonation: 'Intonation voix',
  pause: 'Pause / Respiration',
  exemple: 'Exemple à appuyer',
  rappel: 'Note d’enregistrement',
};

const INK_HEX: Record<NotebookAppearance['inkColor'], string> = {
  encre_noire: '#18181B',
  stylo_bleu: '#1D4ED8',
  plume_cuivre: '#9A3412',
  encre_sepia: '#4A3728',
};

export function NotebookEditor({
  episode,
  segment,
  appearance,
  onUpdateSegment,
  onSelectSegment,
}: NotebookEditorProps) {
  const [mode, setMode] = useState<NotebookMode>('write');
  const [polishSuggestion, setPolishSuggestion] = useState<{
    polished: string;
    changes: string[];
    threadStatus: string;
    hasChanges: boolean;
  } | null>(null);
  const [dismissedText, setDismissedText] = useState<string>('');
  const [cursorPos, setCursorPos] = useState<number | undefined>(undefined);
  const [liveRepetitions, setLiveRepetitions] = useState<EpisodeThreadMatch[]>([]);
  const [dismissedRepKeys, setDismissedRepKeys] = useState<Record<string, boolean>>({});

  // Word selection & comment state
  const [pendingSelection, setPendingSelection] = useState<{
    text: string;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentKind, setCommentKind] = useState<CueKind>('intonation');
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  const readContainerRef = useRef<HTMLDivElement | null>(null);
  const sketchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  const isDarkPaper = appearance.paperTheme === 'encre_nuit';

  const paperSurfaceClass = useMemo(() => {
    if (!appearance.showRuledLines) {
      if (appearance.paperTheme === 'encre_nuit') return 'bg-[#19191E]';
      if (appearance.paperTheme === 'carnet_seyes') return 'bg-[#FAFBFD]';
      if (appearance.paperTheme === 'cahier_ivoire') return 'bg-[#FDFBF4]';
      return 'bg-white';
    }
    if (appearance.paperTheme === 'encre_nuit') return 'cahier-ruled-nocturne';
    if (appearance.paperTheme === 'carnet_seyes') return 'cahier-ruled-seyes';
    if (appearance.paperTheme === 'cahier_ivoire') return 'cahier-ruled-ivoire';
    return 'bg-white';
  }, [appearance.paperTheme, appearance.showRuledLines]);

  const inkColorStyle = isDarkPaper
    ? appearance.inkColor === 'stylo_bleu'
      ? '#93C5FD'
      : appearance.inkColor === 'plume_cuivre'
        ? '#FDBA74'
        : '#F4F4F5'
    : INK_HEX[appearance.inkColor];

  const textFontClass =
    appearance.writingFont === 'calligraphie'
      ? 'font-hand text-[24px] leading-[32px]'
      : 'font-sans text-[16px] leading-[32px]';

  const episodeRef = useRef(episode);
  episodeRef.current = episode;
  const cursorPosRef = useRef(cursorPos);
  cursorPosRef.current = cursorPos;

  // Reset suggestion panels when switching episode or segment
  useEffect(() => {
    setPolishSuggestion(null);
    setDismissedText('');
    setLiveRepetitions([]);
    setCursorPos(undefined);
  }, [episode.id, segment.id]);

  // Live keyboard repetition detection across all other segments & notes in the episode (550ms)
  useEffect(() => {
    if (mode !== 'write') return;
    const raw = segment.scriptText;
    if (raw.trim().length < 18) {
      setLiveRepetitions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const matches = detectEpisodeRepetitions(
        episodeRef.current,
        segment.id,
        raw,
        cursorPosRef.current
      );
      setLiveRepetitions(matches);
    }, 550);
    return () => window.clearTimeout(timer);
  }, [segment.scriptText, segment.id, episode.id, mode]);

  // Auto-detect end of thought when user finishes writing a sentence (1.3s pause)
  useEffect(() => {
    if (mode !== 'write') return;
    const raw = segment.scriptText;
    if (!raw.trim() || raw === dismissedText) {
      return;
    }
    const timer = window.setTimeout(() => {
      const res = adjustThoughtToEpisodeThread(raw, episodeRef.current, segment.id);
      if (res.hasChanges) {
        setPolishSuggestion({
          polished: res.adjusted,
          changes: res.changes,
          threadStatus: res.threadStatus,
          hasChanges: true,
        });
      } else {
        setPolishSuggestion(null);
      }
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [segment.scriptText, segment.id, episode.id, mode, dismissedText]);

  const handleManualPolishCheck = () => {
    const res = adjustThoughtToEpisodeThread(segment.scriptText, episode, segment.id);
    if (res.hasChanges) {
      setPolishSuggestion({
        polished: res.adjusted,
        changes: res.changes,
        threadStatus: res.threadStatus,
        hasChanges: true,
      });
    } else {
      setPolishSuggestion({
        polished: segment.scriptText,
        changes: [
          'Aucune redite ni faute détectée : le fil de ce passage est déjà fluide et cohérent avec le reste de l’épisode.',
        ],
        threadStatus: res.threadStatus,
        hasChanges: false,
      });
    }
  };

  const applyPolishSuggestion = () => {
    if (!polishSuggestion) return;
    onUpdateSegment({ scriptText: polishSuggestion.polished });
    setDismissedText(polishSuggestion.polished);
    setPolishSuggestion(null);
  };

  const visibleRepetition = useMemo(() => {
    return liveRepetitions.find((m) => {
      const key = `${segment.id}:${m.segmentId ?? m.segmentTitle}:${m.currentSentence}`;
      return !dismissedRepKeys[key];
    });
  }, [liveRepetitions, dismissedRepKeys, segment.id]);

  const handleConvertRepetitionToCallback = (match: EpisodeThreadMatch) => {
    const nextText = rewriteRepeatedSentenceAsCallback(segment.scriptText, match);
    onUpdateSegment({ scriptText: nextText });
    setDismissedText(nextText);
    const key = `${segment.id}:${match.segmentId ?? match.segmentTitle}:${match.currentSentence}`;
    setDismissedRepKeys((prev) => ({ ...prev, [key]: true }));
  };

  const handleDismissRepetition = (match: EpisodeThreadMatch) => {
    const key = `${segment.id}:${match.segmentId ?? match.segmentTitle}:${match.currentSentence}`;
    setDismissedRepKeys((prev) => ({ ...prev, [key]: true }));
  };

  const guidance = useMemo(() => analyzeSegmentThought(segment), [segment]);

  const comments = segment.comments ?? [];
  const textRuns = useMemo(
    () => (mode === 'read' ? splitTextWithAnnotations(segment.scriptText, comments) : []),
    [mode, segment.scriptText, comments]
  );

  // Capture browser selection inside Mode Lecture & Annoter
  const handleSelectionCapture = () => {
    const container = readContainerRef.current;
    const sel = window.getSelection();
    if (!container || !sel || sel.rangeCount === 0) return;

    const selectedStr = sel.toString().trim();
    if (!selectedStr) return;

    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    // Compute plain-text character offset inside container
    const preRange = range.cloneRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preRange.toString().length;
    const endOffset = startOffset + sel.toString().length;

    setPendingSelection({
      text: selectedStr,
      startOffset,
      endOffset,
    });
    setActiveCommentId(null);
  };

  // One-tap fallback for mobile phone: tap a word directly to select it for comment
  const handleQuickWordTap = (word: string, approxOffset: number) => {
    const clean = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!clean) return;
    const foundAt = segment.scriptText.indexOf(clean, Math.max(0, approxOffset - 4));
    const startOffset = foundAt !== -1 ? foundAt : approxOffset;
    setPendingSelection({
      text: clean,
      startOffset,
      endOffset: startOffset + clean.length,
    });
    setActiveCommentId(null);
  };

  const handleSaveComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingSelection || !commentDraft.trim()) return;
    const created = createWordComment({
      segmentId: segment.id,
      selectedText: pendingSelection.text,
      startOffset: pendingSelection.startOffset,
      endOffset: pendingSelection.endOffset,
      comment: commentDraft,
      cueKind: commentKind,
    });
    onUpdateSegment({ comments: [...comments, created] });
    setPendingSelection(null);
    setCommentDraft('');
    setActiveCommentId(created.id);
    window.getSelection()?.removeAllRanges();
  };

  const handleDeleteComment = (commentId: string) => {
    onUpdateSegment({ comments: comments.filter((c) => c.id !== commentId) });
    if (activeCommentId === commentId) setActiveCommentId(null);
  };

  // Freehand Pen Sketch Canvas initialization
  useEffect(() => {
    if (mode !== 'sketch') return;
    const canvas = sketchCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.clientWidth || 520;
    const h = 320;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    if (segment.sketchDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
      };
      img.src = segment.sketchDataUrl;
    }
  }, [mode, segment.id, segment.sketchDataUrl]);

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleSketchDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sketchCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const { x, y } = getPointerPos(e);
    ctx.strokeStyle = inkColorStyle;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleSketchMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const ctx = sketchCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleSketchUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const canvas = sketchCanvasRef.current;
    if (canvas) {
      onUpdateSegment({ sketchDataUrl: canvas.toDataURL('image/png') });
    }
  };

  const clearSketch = () => {
    const canvas = sketchCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    onUpdateSegment({ sketchDataUrl: undefined });
  };

  const activeComment: WordComment | undefined = comments.find((c) => c.id === activeCommentId);

  return (
    <div className="space-y-4">
      {/* Mode Switcher: Écrire (Cahier) | Lire & Annoter | Croquis stylo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F6F5F0] rounded-lg">
          <button
            type="button"
            onClick={() => setMode('write')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              mode === 'write'
                ? 'bg-white text-[#18181B] shadow-xs'
                : 'text-[#52525B] hover:text-[#18181B]'
            }`}
          >
            <PenLine className="w-3.5 h-3.5" aria-hidden="true" />
            Écrire (Cahier)
          </button>
          <button
            type="button"
            onClick={() => setMode('read')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              mode === 'read'
                ? 'bg-white text-[#18181B] shadow-xs'
                : 'text-[#52525B] hover:text-[#18181B]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
            Lire & Annoter ({comments.length})
          </button>
          <button
            type="button"
            onClick={() => setMode('sketch')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              mode === 'sketch'
                ? 'bg-white text-[#18181B] shadow-xs'
                : 'text-[#52525B] hover:text-[#18181B]'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
            Stylo libre
          </button>
        </div>

        {mode === 'write' && (
          <button
            type="button"
            onClick={handleManualPolishCheck}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#C2410C] hover:bg-[#FAF9F5] border border-[#E5E2D9] rounded-md cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            Réajuster au fil de l’épisode
          </button>
        )}
      </div>

      {/* Mode 1: Ruled Calligraphy Notebook Surface */}
      {mode === 'write' && (
        <div
          className={`rounded-xl border border-[#D6D3C9] overflow-hidden transition-colors ${paperSurfaceClass} ${
            appearance.showMarginLine && !isDarkPaper ? 'cahier-margin-line' : ''
          }`}
        >
          <textarea
            id="seg-script"
            aria-label="Page de cahier du segment"
            rows={12}
            value={segment.scriptText}
            onChange={(e) => {
              setDismissedText('');
              setCursorPos(e.target.selectionStart ?? undefined);
              onUpdateSegment({ scriptText: e.target.value });
            }}
            onKeyUp={(e) => setCursorPos(e.currentTarget.selectionStart ?? undefined)}
            onClick={(e) => setCursorPos(e.currentTarget.selectionStart ?? undefined)}
            style={{ color: inkColorStyle }}
            placeholder="Posez vos idées comme sur un vrai cahier... L’assistant suit le fil complet de l’épisode et signale les redites dès la frappe."
            className={`w-full bg-transparent pt-[12px] pb-6 pr-5 ${
              appearance.showMarginLine ? 'pl-14' : 'pl-5'
            } focus:outline-none resize-y ${textFontClass}`}
          />
        </div>
      )}

      {/* Discreet Live Keyboard Repetition Suggestion Strip */}
      {mode === 'write' && visibleRepetition && (
        <div
          role="status"
          aria-live="polite"
          data-testid="live-repetition-hint"
          className="px-3.5 py-2.5 bg-[#FFFBEB]/90 border border-[#FDE68A] rounded-lg space-y-1.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-[#92400E] flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                Fil déjà exposé dans{' '}
                <strong className="font-semibold">
                  {visibleRepetition.segmentIndex
                    ? `${String(visibleRepetition.segmentIndex).padStart(2, '0')}. `
                    : ''}
                  {visibleRepetition.segmentTitle}
                </strong>
                {visibleRepetition.sharedKeywords.length > 0 && (
                  <span className="text-[#B45309]">
                    {' '}
                    ({visibleRepetition.sharedKeywords.join(', ')})
                  </span>
                )}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {visibleRepetition.segmentId && onSelectSegment && (
                <button
                  type="button"
                  onClick={() => onSelectSegment(visibleRepetition.segmentId!)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#92400E] hover:text-[#78350F] underline underline-offset-2 cursor-pointer"
                >
                  <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                  Voir le segment {String(visibleRepetition.segmentIndex ?? '').padStart(2, '0')}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleConvertRepetitionToCallback(visibleRepetition)}
                className="px-2 py-0.5 text-xs font-medium text-[#92400E] bg-[#FEF3C7] hover:bg-[#FDE68A] rounded cursor-pointer"
              >
                Transformer en rappel
              </button>
              <button
                type="button"
                onClick={() => handleDismissRepetition(visibleRepetition)}
                className="text-xs text-[#78716C] hover:text-[#18181B] cursor-pointer"
              >
                Ignorer
              </button>
            </div>
          </div>
          <p className="text-xs text-[#78350F]/90 italic line-clamp-2">
            « {visibleRepetition.matchedExcerpt} »
          </p>
        </div>
      )}

      {/* Episode-Thread Thought Readjustment Bar */}
      {mode === 'write' && polishSuggestion && (
        <div
          role="region"
          aria-label="Réajustement au fil de l’épisode"
          data-testid="episode-adjustment-panel"
          className="p-4 bg-[#FAF9F5] border border-[#E5E2D9] rounded-xl space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-[#18181B] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
                Assistant de fil éditorial (épisode complet)
              </p>
              <p className="text-xs text-[#71717A]">{polishSuggestion.threadStatus}</p>
            </div>
            <div className="flex items-center gap-2">
              {polishSuggestion.hasChanges && (
                <button
                  type="button"
                  onClick={applyPolishSuggestion}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-[#15803D] hover:bg-[#166534] rounded-md cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  Appliquer l’édition
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDismissedText(segment.scriptText);
                  setPolishSuggestion(null);
                }}
                className="px-2.5 py-1 text-xs text-[#52525B] hover:text-[#18181B] cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>

          <ul className="text-xs text-[#52525B] list-disc pl-5 space-y-0.5">
            {polishSuggestion.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>

          {polishSuggestion.hasChanges && (
            <p
              data-testid="adjusted-preview-text"
              className="p-3 bg-white border border-[#ECEAE2] rounded-lg text-xs text-[#18181B] leading-relaxed whitespace-pre-wrap"
            >
              {polishSuggestion.polished}
            </p>
          )}
        </div>
      )}

      {/* Mode 2: Reading & Word-Level Comment Annotation */}
      {mode === 'read' && (
        <div className="space-y-4">
          <p className="text-xs text-[#71717A]">
            Surlignez un passage à la souris ou touchez directement un mot pour y accrocher une note d’enregistrement.
          </p>

          <div
            ref={readContainerRef}
            onMouseUp={handleSelectionCapture}
            onTouchEnd={handleSelectionCapture}
            data-testid="readable-script-surface"
            style={{ color: inkColorStyle }}
            className={`rounded-xl border border-[#D6D3C9] py-4 pr-5 ${
              appearance.showMarginLine ? 'pl-14' : 'pl-5'
            } ${paperSurfaceClass} ${
              appearance.showMarginLine && !isDarkPaper ? 'cahier-margin-line' : ''
            } ${textFontClass} whitespace-pre-wrap select-text`}
          >
            {textRuns.length === 0 ? (
              <span className="opacity-60">Aucun texte rédigé pour ce segment.</span>
            ) : (
              textRuns.map((run, idx) => {
                if (run.comment) {
                  const c = run.comment;
                  const isActive = c.id === activeCommentId;
                  return (
                    <button
                      key={`${c.id}-${idx}`}
                      type="button"
                      onClick={() => {
                        setActiveCommentId(c.id);
                        setPendingSelection(null);
                      }}
                      title={c.comment}
                      className={`inline underline decoration-2 underline-offset-4 cursor-pointer rounded px-0.5 ${
                        isActive
                          ? 'bg-[#F59E0B]/30 decoration-[#C2410C]'
                          : 'bg-[#F59E0B]/15 decoration-[#D97706]'
                      }`}
                    >
                      {run.text}
                    </button>
                  );
                }

                // Make individual words tappable on mobile phones while preserving text selection
                let runningPos = 0;
                for (let k = 0; k < idx; k++) runningPos += textRuns[k].text.length;

                return run.text.split(/(\s+)/).map((token, tIdx) => {
                  const tokenOffset = runningPos;
                  runningPos += token.length;
                  if (/^\s+$/.test(token) || token.length === 0) {
                    return <span key={`${idx}-${tIdx}`}>{token}</span>;
                  }
                  return (
                    <span
                      key={`${idx}-${tIdx}`}
                      onDoubleClick={() => handleQuickWordTap(token, tokenOffset)}
                      onClick={() => {
                        const sel = window.getSelection();
                        if (!sel || sel.toString().trim().length === 0) {
                          handleQuickWordTap(token, tokenOffset);
                        }
                      }}
                      className="hover:bg-[#F59E0B]/10 rounded cursor-pointer"
                    >
                      {token}
                    </span>
                  );
                });
              })
            )}
          </div>

          {/* Pending Selection Comment Composer */}
          {pendingSelection && (
            <form
              onSubmit={handleSaveComment}
              className="p-4 bg-[#FAF9F5] border border-[#C2410C]/40 rounded-xl space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#18181B] flex items-center gap-1.5">
                  <MessageSquarePlus className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
                  Commenter « {pendingSelection.text} »
                </p>
                <button
                  type="button"
                  onClick={() => setPendingSelection(null)}
                  className="text-xs text-[#71717A] hover:text-[#18181B] cursor-pointer"
                >
                  Annuler
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <select
                  aria-label="Type d’indication d’enregistrement"
                  value={commentKind}
                  onChange={(e) => setCommentKind(e.target.value as CueKind)}
                  className="px-2.5 py-2 text-xs bg-white border border-[#E5E2D9] rounded-lg"
                >
                  {Object.entries(CUE_KIND_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ex : Ralentir ici et poser la voix..."
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  className="sm:col-span-2 px-3 py-2 text-xs bg-white border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#C2410C] hover:bg-[#9A3412] rounded-lg cursor-pointer"
                >
                  Enregistrer la note vocale
                </button>
              </div>
            </form>
          )}

          {/* Active Comment Inspector + All Segment Comments */}
          {activeComment && (
            <div className="p-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#92400E]">
                  {CUE_KIND_LABELS[activeComment.cueKind]} · sur « {activeComment.selectedText} »
                </p>
                <p className="text-sm text-[#18181B]">{activeComment.comment}</p>
              </div>
              <button
                type="button"
                aria-label={`Supprimer la note sur ${activeComment.selectedText}`}
                onClick={() => handleDeleteComment(activeComment.id)}
                className="p-1 text-[#92400E] hover:text-[#DC2626] cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {comments.length > 0 && (
            <div className="divide-y divide-[#F0EFEA] border-t border-[#F0EFEA]">
              {comments.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveCommentId(c.id)}
                    className="text-left flex-1 min-w-0 cursor-pointer"
                  >
                    <p className="text-xs font-medium text-[#18181B] truncate">
                      « {c.selectedText} » · {CUE_KIND_LABELS[c.cueKind]}
                    </p>
                    <p className="text-xs text-[#52525B] truncate">{c.comment}</p>
                  </button>
                  <button
                    type="button"
                    aria-label={`Retirer le commentaire sur ${c.selectedText}`}
                    onClick={() => handleDeleteComment(c.id)}
                    className="p-1 text-[#71717A] hover:text-[#DC2626] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mode 3: Freehand Pen Sketch Pad */}
      {mode === 'sketch' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#71717A]">
              Écrivez ou dessinez librement au doigt, au stylet ou à la souris sur votre page.
            </p>
            <button
              type="button"
              onClick={clearSketch}
              className="px-2.5 py-1 text-xs font-medium text-[#52525B] hover:text-[#DC2626] bg-[#F6F5F0] rounded cursor-pointer"
            >
              Effacer la page
            </button>
          </div>
          <div
            className={`rounded-xl border border-[#D6D3C9] overflow-hidden ${paperSurfaceClass} ${
              appearance.showMarginLine && !isDarkPaper ? 'cahier-margin-line' : ''
            }`}
          >
            <canvas
              ref={sketchCanvasRef}
              onPointerDown={handleSketchDown}
              onPointerMove={handleSketchMove}
              onPointerUp={handleSketchUp}
              onPointerLeave={handleSketchUp}
              className="w-full h-[320px] touch-none cursor-crosshair block"
            />
          </div>
        </div>
      )}

      {/* Thought Companion / Guide Le Précepteur */}
      <div className="p-4 bg-[#FAF9F5] border border-[#E5E2D9] rounded-xl space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[#18181B] flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-[#0F766E]" aria-hidden="true" />
            Guide de réflexion · {guidance.readinessLabel}
          </p>
        </div>
        {guidance.missingHint && (
          <p className="text-xs text-[#B45309]">{guidance.missingHint}</p>
        )}
        <ul className="text-xs text-[#52525B] space-y-1 list-disc pl-4">
          {guidance.guidingQuestions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
