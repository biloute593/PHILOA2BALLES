import { useState } from 'react';
import { X } from 'lucide-react';
import type { Episode, EpisodeCategory } from '../types/podcast';

interface NewEpisodeModalProps {
  isOpen: boolean;
  nextNumber: string;
  onClose: () => void;
  onCreate: (episode: Episode) => void;
}

export function NewEpisodeModal({ isOpen, nextNumber, onClose, onCreate }: NewEpisodeModalProps) {
  const [category, setCategory] = useState<EpisodeCategory>('cinema_serie');
  const [title, setTitle] = useState('');
  const [workTitle, setWorkTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [logline, setLogline] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !workTitle.trim() || !theme.trim()) {
      setError('Veuillez renseigner le titre, l’œuvre analysée et le concept philosophique.');
      return;
    }

    const isSong = category === 'chanson';
    const epId = `ep-${Date.now()}`;
    const newEpisode: Episode = {
      id: epId,
      number: nextNumber,
      category,
      title: title.trim(),
      workTitle: workTitle.trim(),
      philosophicalTheme: theme.trim(),
      logline:
        logline.trim() ||
        `Analyse accessible de ${workTitle.trim()} sous l’angle de : ${theme.trim()}.`,
      targetMinutes: 30,
      draftThoughts: '',
      status: 'en_preparation',
      updatedAt: new Date().toISOString().slice(0, 10),
      sources: [],
      notes: [],
      segments: [
        {
          id: `${epId}-seg-1`,
          title: isSong
            ? 'Accroche — Histoire basique (boulanger, fermier, postier...)'
            : 'Accroche — Une situation du quotidien',
          role: 'accroche',
          status: 'brouillon',
          estimatedWpm: 140,
          targetDurationSec: 300,
          concreteExample: '',
          scriptText: isSong
            ? '[EXTRAIT SONORE]\n\nCommencez par une histoire simple du quotidien (un fermier, un boulanger, un postier...) avant d’entrer dans les paroles.'
            : '[EXTRAIT SONORE]\n\nCommencez par une scène banale de la vie sociale que tout le monde connaît avant d’introduire le film.',
          linkedSourceIds: [],
        },
        {
          id: `${epId}-seg-2`,
          title: isSong
            ? `Décorticage des paroles — ${workTitle.trim()}`
            : `Concept — ${theme.trim()} avec des mots simples`,
          role: isSong ? 'bascule' : 'concept',
          status: 'brouillon',
          estimatedWpm: 138,
          targetDurationSec: 600,
          concreteExample: '',
          scriptText: '',
          linkedSourceIds: [],
        },
        {
          id: `${epId}-seg-3`,
          title: isSong
            ? `Concept — ${theme.trim()} avec des mots simples`
            : `Bascule dans ${workTitle.trim()}`,
          role: isSong ? 'concept' : 'bascule',
          status: 'brouillon',
          estimatedWpm: 140,
          targetDurationSec: 600,
          concreteExample: '',
          scriptText: '',
          linkedSourceIds: [],
        },
        {
          id: `${epId}-seg-4`,
          title: 'Conclusion pratique',
          role: 'conclusion',
          status: 'brouillon',
          estimatedWpm: 135,
          targetDurationSec: 300,
          concreteExample: '',
          scriptText: '',
          linkedSourceIds: [],
        },
      ],
    };

    onCreate(newEpisode);
    setTitle('');
    setWorkTitle('');
    setTheme('');
    setLogline('');
    setError('');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-episode-title"
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
    >
      <div className="bg-white border border-[#E5E2D9] rounded-xl w-full max-w-lg p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#F0EFEA]">
          <h2 id="new-episode-title" className="font-display text-lg font-semibold text-[#18181B]">
            Créer l’épisode {nextNumber}
          </h2>
          <button
            type="button"
            aria-label="Fermer la fenêtre"
            onClick={onClose}
            className="p-1 text-[#71717A] hover:text-[#18181B] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p role="alert" className="text-xs text-[#DC2626]">
              {error}
            </p>
          )}
          <div className="flex items-center gap-1 p-1 bg-[#F6F5F0] rounded-lg">
            <button
              type="button"
              onClick={() => setCategory('cinema_serie')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                category === 'cinema_serie'
                  ? 'bg-white text-[#18181B] shadow-xs'
                  : 'text-[#52525B] hover:text-[#18181B]'
              }`}
            >
              Film / Série
            </button>
            <button
              type="button"
              onClick={() => setCategory('chanson')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                category === 'chanson'
                  ? 'bg-white text-[#18181B] shadow-xs'
                  : 'text-[#52525B] hover:text-[#18181B]'
              }`}
            >
              Chanson / Paroles
            </button>
          </div>

          <div>
            <label htmlFor="new-ep-title" className="block text-xs font-medium text-[#52525B] mb-1">
              Titre de l’épisode
            </label>
            <input
              id="new-ep-title"
              type="text"
              placeholder={
                category === 'chanson'
                  ? 'Ex : Stromae — Formidable : La solitude au milieu de la foule'
                  : 'Ex : The Truman Show : Vivre sous le regard des autres'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-ep-work" className="block text-xs font-medium text-[#52525B] mb-1">
                {category === 'chanson' ? 'Chanson & Artiste' : 'Film ou série analysé(e)'}
              </label>
              <input
                id="new-ep-work"
                type="text"
                placeholder={
                  category === 'chanson' ? 'Ex : Formidable — Stromae (2013)' : 'Ex : The Truman Show (1998)'
                }
                value={workTitle}
                onChange={(e) => setWorkTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
              />
            </div>
            <div>
              <label htmlFor="new-ep-theme" className="block text-xs font-medium text-[#52525B] mb-1">
                Concept philosophique
              </label>
              <input
                id="new-ep-theme"
                type="text"
                placeholder="Ex : L’allégorie de la caverne"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="new-ep-logline" className="block text-xs font-medium text-[#52525B] mb-1">
              Question centrale (facultatif)
            </label>
            <textarea
              id="new-ep-logline"
              rows={2}
              placeholder="Comment expliquer l’idée simplement à quelqu’un dans un café ?"
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#52525B] hover:text-[#18181B] cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-[#C2410C] hover:bg-[#9A3412] rounded-lg cursor-pointer"
            >
              Créer l’épisode
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
