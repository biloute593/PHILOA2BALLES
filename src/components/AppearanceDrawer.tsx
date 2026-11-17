import { X } from 'lucide-react';
import type {
  InkColor,
  NotebookAppearance,
  PaperTheme,
  WritingFont,
} from '../types/podcast';
import { DEFAULT_APPEARANCE } from '../data/seedData';

interface AppearanceDrawerProps {
  isOpen: boolean;
  appearance: NotebookAppearance;
  onChange: (next: NotebookAppearance) => void;
  onClose: () => void;
}

const PAPER_OPTIONS: { id: PaperTheme; label: string; swatch: string }[] = [
  { id: 'cahier_ivoire', label: 'Cahier Ivoire', swatch: 'bg-[#FDFBF4] border-[#D6D3C9]' },
  { id: 'carnet_seyes', label: 'Carnet Séyès', swatch: 'bg-[#FAFBFD] border-[#93C5FD]' },
  { id: 'encre_nuit', label: 'Cahier Nocturne', swatch: 'bg-[#19191E] border-[#3F3F46]' },
  { id: 'studio_epure', label: 'Studio Épuré', swatch: 'bg-white border-[#E5E2D9]' },
];

const INK_OPTIONS: { id: InkColor; label: string; dot: string }[] = [
  { id: 'encre_noire', label: 'Encre Noire', dot: 'bg-[#18181B]' },
  { id: 'stylo_bleu', label: 'Stylo Bleu', dot: 'bg-[#1D4ED8]' },
  { id: 'plume_cuivre', label: 'Plume Cuivre', dot: 'bg-[#9A3412]' },
  { id: 'encre_sepia', label: 'Encre Sépia', dot: 'bg-[#574232]' },
];

export function AppearanceDrawer({
  isOpen,
  appearance,
  onChange,
  onClose,
}: AppearanceDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="appearance-title"
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
    >
      <div className="bg-white border border-[#E5E2D9] rounded-xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#F0EFEA]">
          <h2 id="appearance-title" className="font-display text-lg font-semibold text-[#18181B]">
            Personnaliser l’affiche & le cahier
          </h2>
          <button
            type="button"
            aria-label="Fermer la personnalisation"
            onClick={onClose}
            className="p-1 text-[#71717A] hover:text-[#18181B] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Custom Cover / Banner */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[#52525B]">Affiche de votre carnet</h3>
            <div>
              <label htmlFor="custom-banner-title" className="block text-xs text-[#52525B] mb-1">
                Titre sur l’affiche
              </label>
              <input
                id="custom-banner-title"
                type="text"
                value={appearance.customBannerTitle}
                onChange={(e) =>
                  onChange({ ...appearance, customBannerTitle: e.target.value })
                }
                className="w-full px-3 py-2 text-sm bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
              />
            </div>
            <div>
              <label htmlFor="custom-motto" className="block text-xs text-[#52525B] mb-1">
                Devise / Sous-titre personnel
              </label>
              <input
                id="custom-motto"
                type="text"
                value={appearance.customMotto}
                onChange={(e) => onChange({ ...appearance, customMotto: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
              />
            </div>
          </div>

          {/* Paper Theme */}
          <div className="space-y-2 pt-3 border-t border-[#F0EFEA]">
            <h3 className="text-xs font-semibold text-[#52525B]">Papier du cahier</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {PAPER_OPTIONS.map((opt) => {
                const active = appearance.paperTheme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange({ ...appearance, paperTheme: opt.id })}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left text-xs font-medium cursor-pointer transition-colors ${
                      active
                        ? 'border-[#C2410C] bg-[#FAF9F5] text-[#18181B]'
                        : 'border-[#E5E2D9] hover:border-[#A1A1AA] text-[#52525B]'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded border shrink-0 ${opt.swatch}`} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ink Color */}
          <div className="space-y-2 pt-3 border-t border-[#F0EFEA]">
            <h3 className="text-xs font-semibold text-[#52525B]">Couleur d’encre du stylo</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {INK_OPTIONS.map((opt) => {
                const active = appearance.inkColor === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange({ ...appearance, inkColor: opt.id })}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left text-xs font-medium cursor-pointer transition-colors ${
                      active
                        ? 'border-[#C2410C] bg-[#FAF9F5] text-[#18181B]'
                        : 'border-[#E5E2D9] hover:border-[#A1A1AA] text-[#52525B]'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${opt.dot}`} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Writing Font */}
          <div className="space-y-2 pt-3 border-t border-[#F0EFEA]">
            <h3 className="text-xs font-semibold text-[#52525B]">Style d’écriture</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  { id: 'calligraphie', label: 'Calligraphie stylo', sample: 'Ma pensée…' },
                  { id: 'classique', label: 'Écriture nette', sample: 'Ma pensée…' },
                ] as { id: WritingFont; label: string; sample: string }[]
              ).map((opt) => {
                const active = appearance.writingFont === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange({ ...appearance, writingFont: opt.id })}
                    className={`p-3 rounded-lg border text-left cursor-pointer ${
                      active
                        ? 'border-[#C2410C] bg-[#FAF9F5]'
                        : 'border-[#E5E2D9] hover:border-[#A1A1AA]'
                    }`}
                  >
                    <p
                      className={`text-lg text-[#18181B] ${
                        opt.id === 'calligraphie' ? 'font-hand' : 'font-sans'
                      }`}
                    >
                      {opt.sample}
                    </p>
                    <p className="text-xs text-[#71717A] mt-0.5">{opt.label}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notebook Lines Toggles */}
          <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-[#F0EFEA]">
            <label className="inline-flex items-center gap-2 text-xs text-[#18181B] cursor-pointer">
              <input
                type="checkbox"
                checked={appearance.showRuledLines}
                onChange={(e) =>
                  onChange({ ...appearance, showRuledLines: e.target.checked })
                }
                className="accent-[#C2410C]"
              />
              Lignes de cahier
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-[#18181B] cursor-pointer">
              <input
                type="checkbox"
                checked={appearance.showMarginLine}
                onChange={(e) =>
                  onChange({ ...appearance, showMarginLine: e.target.checked })
                }
                className="accent-[#C2410C]"
              />
              Marge rouge à gauche
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[#F0EFEA]">
          <button
            type="button"
            onClick={() => onChange(DEFAULT_APPEARANCE)}
            className="text-xs text-[#71717A] hover:text-[#18181B] cursor-pointer"
          >
            Réinitialiser par défaut
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-[#18181B] hover:bg-[#27272A] rounded-lg cursor-pointer"
          >
            Valider l’affiche
          </button>
        </div>
      </div>
    </div>
  );
}
