import { useEffect, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  Send,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import type { Episode, WorkspaceTab } from '../types/podcast';
import { filterEpisodesByCategory } from '../utils/episodeStore';
import { PhiloA2BalleLogo } from './PhiloA2BalleLogo';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  brandTitle: string;
  activeTab: WorkspaceTab;
  isMobileCaptureHome: boolean;
  episodes: Episode[];
  activeEpisodeId: string;
  activeSegmentId: string;
  memoryNotesCount: number;
  onOpenCaptureHome: () => void;
  onSelectTab: (tab: WorkspaceTab) => void;
  onSelectEpisodeSegment: (episodeId: string, segmentId: string) => void;
  onOpenEpisodePrompter: (episodeId: string) => void;
  onCreateEpisode: () => void;
}

const WORKSPACE_LINKS: {
  id: WorkspaceTab;
  label: string;
  hint: string;
  icon: typeof FileText;
}[] = [
  { id: 'script', label: 'Script & Sources', hint: 'Écrire et retravailler un segment', icon: FileText },
  { id: 'studio', label: 'Studio & Mixage', hint: 'Voix, ton Précepteur & montage', icon: Sliders },
  { id: 'prompter', label: 'Prompteur', hint: 'Lire mon texte au complet', icon: BookOpen },
  { id: 'publish', label: 'Publication', hint: 'Affiche, SEO & export audio', icon: Send },
];

export function MobileNavDrawer({
  isOpen,
  onClose,
  brandTitle,
  activeTab,
  isMobileCaptureHome,
  episodes,
  activeEpisodeId,
  activeSegmentId,
  memoryNotesCount,
  onOpenCaptureHome,
  onSelectTab,
  onSelectEpisodeSegment,
  onOpenEpisodePrompter,
  onCreateEpisode,
}: MobileNavDrawerProps) {
  const [expandedEpisodeId, setExpandedEpisodeId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'tous' | 'cinema_serie' | 'chanson'>('tous');

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const visibleEpisodes = filterEpisodesByCategory(episodes, categoryFilter);

  const toggleEpisodeAccordion = (epId: string) => {
    setExpandedEpisodeId((prev) => {
      const next = prev === epId ? null : epId;
      if (next) {
        window.requestAnimationFrame(() => {
          document
            .querySelector(`[data-testid="drawer-episode-segments-${next}"]`)
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      }
      return next;
    });
  };

  return (
    <div
      className="md:hidden fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Menu de navigation mobile"
      data-testid="mobile-nav-drawer"
    >
      <button
        type="button"
        aria-label="Fermer le menu"
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px] cursor-pointer"
      />

      <aside className="relative z-10 w-[86vw] max-w-[348px] h-full bg-[#F6F5F0] border-r border-[#E5E2D9] shadow-2xl flex flex-col">
        {/* Drawer Header */}
        <div className="h-14 px-3.5 border-b border-[#E5E2D9] flex items-center justify-between gap-2 shrink-0 bg-[#FAF9F5]">
          <div className="flex items-center gap-2.5 min-w-0">
            <PhiloA2BalleLogo
              windStrength="brise"
              showFrame={false}
              className="w-9 rounded-md shrink-0"
            />
            <span className="font-display text-base font-bold tracking-tight text-[#18181B] truncate">
              {brandTitle}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu latéral"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#52525B] hover:text-[#18181B] hover:bg-[#ECEAE2] cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          {/* Primary Gemini Quick-Capture Entry */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                onOpenCaptureHome();
                onClose();
              }}
              aria-current={isMobileCaptureHome ? 'page' : undefined}
              className={`w-full min-h-[46px] px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                isMobileCaptureHome
                  ? 'bg-[#18181B] text-white'
                  : 'bg-white border border-[#E5E2D9] text-[#18181B] hover:bg-[#FAF9F5]'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Sparkles
                  className={`w-4 h-4 shrink-0 ${
                    isMobileCaptureHome ? 'text-[#F59E0B]' : 'text-[#C2410C]'
                  }`}
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold truncate">Notes mémoire</span>
              </span>
              <span
                className={`text-xs font-mono tabular-nums shrink-0 ${
                  isMobileCaptureHome ? 'text-white/75' : 'text-[#71717A]'
                }`}
              >
                {memoryNotesCount}
              </span>
            </button>
          </div>

          {/* Workspace Sections List (Script -> Publish) */}
          <nav aria-label="Espaces de travail" className="space-y-1">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
              Atelier · de l’écriture à la sortie
            </p>
            {WORKSPACE_LINKS.map((item) => {
              const Icon = item.icon;
              const isCurrent = !isMobileCaptureHome && activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    onClose();
                  }}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`w-full min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-3 text-left transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-[#ECEAE2] text-[#18181B] font-semibold'
                      : 'text-[#27272A] hover:bg-[#ECEAE2]/60'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isCurrent ? 'text-[#C2410C]' : 'text-[#52525B]'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-tight truncate">{item.label}</span>
                    <span className="block text-[11px] text-[#71717A] leading-tight truncate mt-0.5">
                      {item.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Episodes with Inline Segment Unfolding */}
          <section aria-label="Épisodes et segments" className="space-y-2.5 pt-2 border-t border-[#E5E2D9]">
            <div className="flex items-center justify-between gap-2 px-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                Épisodes ({visibleEpisodes.length})
              </p>
              <span className="text-[11px] text-[#71717A]">Déplier pour choisir</span>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-[#ECEAE2] rounded-lg">
              {(
                [
                  { id: 'tous', label: 'Tous' },
                  { id: 'cinema_serie', label: 'Séries' },
                  { id: 'chanson', label: 'Chansons' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`min-h-[34px] text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    categoryFilter === cat.id
                      ? 'bg-white text-[#18181B] shadow-2xs'
                      : 'text-[#52525B] hover:text-[#18181B]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              {visibleEpisodes.map((ep) => {
                const isExpanded = expandedEpisodeId === ep.id;
                const isActiveEp = ep.id === activeEpisodeId;
                const cleanWork = ep.workTitle.split('(')[0].trim();

                return (
                  <div
                    key={ep.id}
                    className={`rounded-xl border transition-colors ${
                      isExpanded
                        ? 'bg-white border-[#D6D2C4]'
                        : 'bg-[#FAF9F5]/80 border-[#E5E2D9]/80'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleEpisodeAccordion(ep.id)}
                      aria-expanded={isExpanded}
                      data-testid={`drawer-episode-${ep.id}`}
                      className="w-full min-h-[46px] px-3 py-2 flex items-center justify-between gap-2 text-left cursor-pointer"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[11px] font-mono text-[#C2410C] font-semibold">
                          <span>Ép. {ep.number}</span>
                          {isActiveEp && <span className="text-[#71717A]">· Actif</span>}
                        </span>
                        <span className="block text-sm font-medium text-[#18181B] truncate">
                          {cleanWork}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-[#71717A] shrink-0">
                        <span className="tabular-nums">{ep.segments.length} seg.</span>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-[#52525B]" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-[#52525B]" aria-hidden="true" />
                        )}
                      </span>
                    </button>

                    {isExpanded && (
                      <div
                        data-testid={`drawer-episode-segments-${ep.id}`}
                        className="px-2 pb-2.5 pt-1 border-t border-[#ECEAE2] space-y-1"
                      >
                        {ep.segments.map((seg, idx) => {
                          const isSelectedSeg = isActiveEp && seg.id === activeSegmentId;
                          return (
                            <button
                              key={seg.id}
                              type="button"
                              onClick={() => {
                                onSelectEpisodeSegment(ep.id, seg.id);
                                onClose();
                              }}
                              className={`w-full min-h-[44px] px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                                isSelectedSeg
                                  ? 'bg-[#FFF7ED] text-[#9A3412] font-semibold'
                                  : 'text-[#27272A] hover:bg-[#F6F5F0]'
                              }`}
                            >
                              <span className="text-xs leading-snug line-clamp-2">
                                <span className="font-mono text-[#71717A] mr-1.5">
                                  {String(idx + 1).padStart(2, '0')}.
                                </span>
                                {seg.title}
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#A1A1AA]" aria-hidden="true" />
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => {
                            onOpenEpisodePrompter(ep.id);
                            onClose();
                          }}
                          className="w-full min-h-[44px] mt-1 px-2.5 py-2 rounded-lg bg-[#18181B] text-white text-xs font-medium flex items-center justify-center gap-2 hover:bg-[#27272A] cursor-pointer"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-[#F59E0B]" aria-hidden="true" />
                          Lire tout le texte au Prompteur
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-[#E5E2D9] bg-[#FAF9F5] shrink-0">
          <button
            type="button"
            onClick={() => {
              onCreateEpisode();
              onClose();
            }}
            className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white border border-[#D6D2C4] hover:bg-[#ECEAE2]/50 text-xs font-semibold text-[#18181B] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
            Nouvel épisode
          </button>
        </div>
      </aside>
    </div>
  );
}
