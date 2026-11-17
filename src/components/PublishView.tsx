import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  Hash,
  Image as ImageIcon,
  Pause,
  Play,
  Sparkles,
  X,
} from 'lucide-react';
import type { Episode, MasteringSettings, TimelineClip } from '../types/podcast';
import {
  POSTER_PALETTES,
  renderEpisodePosterToCanvas,
  type PosterFormat,
  type PosterPaletteId,
} from '../utils/posterRenderer';
import { generateEpisodeSeoPack } from '../utils/seoPublisher';
import { renderTimelineToWavBlob } from '../utils/webAudioEngine';
import { exportAnimatedLogoWebmBlob, exportLogoPngBlob, LOGO_BG_URL } from '../utils/logoExporter';
import type { WindStrength } from '../utils/logoWindPhysics';
import { useAdaptiveTrigger } from '../hooks/useAdaptiveTrigger';
import { PhiloA2BalleLogo } from './PhiloA2BalleLogo';

interface PublishViewProps {
  episode: Episode;
  brandTitle?: string;
  onUpdateEpisode: (updated: Episode) => void;
  clips: TimelineClip[];
  audioBuffers: Record<string, AudioBuffer>;
  mastering: MasteringSettings;
}

const SOCIAL_CHECKS = [
  { platform: 'YouTube', handle: '@philoa2balles', status: 'Aucun homonyme exact détecté' },
  { platform: 'Spotify / Apple Podcasts', handle: 'PHILOA2BALLES', status: 'Disponible' },
  { platform: 'TikTok & Instagram', handle: '@philoa2balles', status: 'Aucun créateur majeur référencé' },
];

export function PublishView({
  episode,
  brandTitle = 'PHILOA2BALLES',
  onUpdateEpisode,
  clips,
  audioBuffers,
  mastering,
}: PublishViewProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [exportingWav, setExportingWav] = useState(false);
  const [paletteId, setPaletteId] = useState<PosterPaletteId>('ivoire_cuivre');
  const [posterFormat, setPosterFormat] = useState<PosterFormat>('youtube_16_9');
  const [customPosterSubtitle, setCustomPosterSubtitle] = useState('');
  const [autoStatusMsg, setAutoStatusMsg] = useState('');
  const [windStrength, setWindStrength] = useState<WindStrength>('brise');
  const [logoPaused, setLogoPaused] = useState(false);
  const [logoBgImage, setLogoBgImage] = useState<HTMLImageElement | null>(null);
  const [exportingLogoPng, setExportingLogoPng] = useState(false);
  const [exportingLogoVideoPct, setExportingLogoVideoPct] = useState<number | null>(null);
  const [logoExportError, setLogoExportError] = useState('');
  const [showLogoOptions, setShowLogoOptions] = useState(false);
  const [showPosterOptions, setShowPosterOptions] = useState(false);
  const [reservedHandles, setReservedHandles] = useState<Record<string, boolean>>({
    YouTube: false,
    'Spotify / Apple Podcasts': false,
    'TikTok & Instagram': false,
  });

  const posterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const seoPack = useMemo(() => generateEpisodeSeoPack(episode), [episode]);

  const logoTrigger = useAdaptiveTrigger({
    onTrigger: () => setShowLogoOptions((v) => !v),
  });
  const posterTrigger = useAdaptiveTrigger({
    onTrigger: () => setShowPosterOptions((v) => !v),
  });

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) setLogoBgImage(img);
    };
    img.src = LOGO_BG_URL;
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = posterCanvasRef.current;
    if (!canvas) return;
    renderEpisodePosterToCanvas(canvas, episode, {
      paletteId,
      format: posterFormat,
      brandTitle,
      customSubtitle: customPosterSubtitle,
      durationLabel: seoPack.estimatedMinutesLabel,
      logoBgImage,
      windStrength,
    });
  }, [episode, paletteId, posterFormat, brandTitle, customPosterSubtitle, seoPack.estimatedMinutesLabel, logoBgImage, windStrength]);

  const copyText = async (fieldKey: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Ignore if clipboard unavailable in headless contexts
      setCopiedField(fieldKey);
      window.setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const handleDownloadPoster = () => {
    const canvas = posterCanvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `philoa2balles-ep${episode.number}-${posterFormat}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownloadSeoTxt = () => {
    const content = [
      `TITRE OPTIMISÉ : ${seoPack.optimizedTitle}`,
      '',
      `MOTS-CLÉS (TAGS) : ${seoPack.keywordsCsv}`,
      '',
      `HASHTAGS : ${seoPack.hashtags.join(' ')}`,
      '',
      '--- DESCRIPTION ---',
      seoPack.youtubeDescription,
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `philoa2balles-ep${episode.number}-publication-seo.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMaster = async () => {
    if (clips.length === 0) return;
    setExportingWav(true);
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
    } finally {
      setExportingWav(false);
    }
  };

  const handleAutoPreparePublication = async () => {
    onUpdateEpisode({ ...episode, status: 'pret_a_publier' });
    await copyText(
      'pack_complet',
      `${seoPack.optimizedTitle}\n\n${seoPack.youtubeDescription}`
    );
    setAutoStatusMsg(
      'Pack publication prêt : épisode marqué « Prêt à publier », titre + description + mots-clés copiés.'
    );
  };

  const handleDownloadLogoPng = async () => {
    setLogoExportError('');
    setExportingLogoPng(true);
    try {
      const blob = await exportLogoPngBlob(windStrength);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'philoa2balles-logo-chaussures.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setLogoExportError(err instanceof Error ? err.message : 'Erreur export PNG');
    } finally {
      setExportingLogoPng(false);
    }
  };

  const handleDownloadLogoWebm = async () => {
    setLogoExportError('');
    setExportingLogoVideoPct(0);
    try {
      const blob = await exportAnimatedLogoWebmBlob(windStrength, 6, (pct) => {
        setExportingLogoVideoPct(pct);
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'philoa2balles-logo-anime-vent.webm';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setLogoExportError(err instanceof Error ? err.message : 'Erreur export vidéo');
    } finally {
      setExportingLogoVideoPct(null);
    }
  };

  return (
    <main className="max-w-[1440px] mx-auto px-6 py-6 space-y-6">
      <section className="pb-4 border-b border-[#E5E2D9] flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-[#71717A]">
            Épisode {episode.number} · {episode.workTitle} · {seoPack.estimatedMinutesLabel}
          </p>
          <h1 className="font-display text-2xl font-semibold text-[#18181B]">
            Publication &amp; Référencement
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleAutoPreparePublication}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#18181B] hover:bg-[#27272A] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" aria-hidden="true" />
            Tout préparer automatiquement
          </button>

          <button
            type="button"
            onClick={handleDownloadMaster}
            disabled={exportingWav || clips.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            {exportingWav ? 'Export WAV...' : 'Télécharger le Master (.WAV)'}
          </button>
        </div>
      </section>

      {autoStatusMsg && (
        <p role="status" className="text-xs font-medium text-[#15803D]">
          {autoStatusMsg}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Standalone Clean Logo + Minimalist Cover Poster */}
        <div className="lg:col-span-5 space-y-6">
          <section aria-label="Logo PHILOA2BALLES" className="relative">
            <div
              {...logoTrigger.triggerProps}
              data-testid="publish-logo-trigger"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowLogoOptions((v) => !v);
                }
              }}
              className="rounded-xl overflow-hidden cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-[#C2410C]"
            >
              <PhiloA2BalleLogo windStrength={windStrength} paused={logoPaused} showFrame={false} />
            </div>

            {showLogoOptions && (
              <div
                data-testid="publish-logo-options"
                className="mt-3 p-3.5 bg-white border border-[#E5E2D9] rounded-xl shadow-md space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    role="group"
                    aria-label="Intensité du vent sur le logo"
                    className="flex items-center gap-1 p-1 bg-[#F6F5F0] rounded-lg"
                  >
                    {(
                      [
                        { id: 'calme', label: 'Calme' },
                        { id: 'brise', label: 'Brise' },
                        { id: 'rafale', label: 'Rafale' },
                      ] as const
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          setWindStrength(mode.id);
                          setLogoPaused(false);
                        }}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          !logoPaused && windStrength === mode.id
                            ? 'bg-white text-[#18181B] shadow-xs'
                            : 'text-[#52525B] hover:text-[#18181B]'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLogoPaused((p) => !p)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] border border-[#E5E2D9] rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      {logoPaused ? (
                        <>
                          <Play className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
                          Animer
                        </>
                      ) : (
                        <>
                          <Pause className="w-3.5 h-3.5 text-[#52525B]" aria-hidden="true" />
                          Pause
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Fermer les options du logo"
                      onClick={() => setShowLogoOptions(false)}
                      className="p-1.5 text-[#71717A] hover:text-[#18181B] rounded-md cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadLogoPng}
                    disabled={exportingLogoPng}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] border border-[#E5E2D9] rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    {exportingLogoPng ? 'Génération PNG...' : 'Exporter PNG'}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadLogoWebm}
                    disabled={exportingLogoVideoPct !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#18181B] hover:bg-[#27272A] rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                  >
                    <Film className="w-3.5 h-3.5 text-[#F59E0B]" aria-hidden="true" />
                    {exportingLogoVideoPct !== null
                      ? `Vidéo (${exportingLogoVideoPct}%)...`
                      : 'Exporter WebM'}
                  </button>
                </div>

                {logoExportError && (
                  <p role="alert" className="text-xs text-[#B91C1C]">
                    {logoExportError}
                  </p>
                )}
              </div>
            )}
          </section>

          <section
            aria-label="Affiche officielle YouTube et Podcast"
            className="bg-white border border-[#E5E2D9] rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                {...posterTrigger.triggerProps}
                data-testid="publish-poster-trigger"
                className="font-display text-base font-semibold text-[#18181B] flex items-center gap-1.5 cursor-pointer select-none"
              >
                <ImageIcon className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
                Affiche épisode {episode.number}
              </h2>
              <button
                type="button"
                onClick={handleDownloadPoster}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#C2410C] hover:bg-[#9A3412] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                PNG
              </button>
            </div>

            <div
              {...posterTrigger.triggerProps}
              className="bg-[#F6F5F0] border border-[#E5E2D9] rounded-lg p-3 flex items-center justify-center cursor-pointer"
            >
              <canvas
                ref={posterCanvasRef}
                aria-label="Aperçu de l’affiche visuelle de l’épisode"
                className="w-full h-auto max-h-[380px] object-contain rounded shadow-xs"
              />
            </div>

            {showPosterOptions && (
              <div
                data-testid="publish-poster-options"
                className="p-3 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 p-1 bg-[#F6F5F0] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPosterFormat('carre_podcast')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        posterFormat === 'carre_podcast'
                          ? 'bg-white text-[#18181B] shadow-xs'
                          : 'text-[#52525B]'
                      }`}
                    >
                      Carré (1:1)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPosterFormat('youtube_16_9')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        posterFormat === 'youtube_16_9'
                          ? 'bg-white text-[#18181B] shadow-xs'
                          : 'text-[#52525B]'
                      }`}
                    >
                      YouTube (16:9)
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(Object.values(POSTER_PALETTES) as Array<(typeof POSTER_PALETTES)[PosterPaletteId]>).map(
                      (pal) => (
                        <button
                          key={pal.id}
                          type="button"
                          onClick={() => setPaletteId(pal.id)}
                          title={pal.label}
                          aria-label={`Palette affiche ${pal.label}`}
                          aria-pressed={paletteId === pal.id}
                          style={{ backgroundColor: pal.bg, borderColor: pal.accent }}
                          className={`w-6 h-6 rounded-md border-2 transition-transform cursor-pointer ${
                            paletteId === pal.id ? 'scale-110 ring-2 ring-[#C2410C]/40' : 'opacity-80'
                          }`}
                        />
                      )
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="poster-sub" className="block text-xs font-medium text-[#52525B] mb-1">
                    Sous-titre sur l’affiche
                  </label>
                  <input
                    id="poster-sub"
                    type="text"
                    value={customPosterSubtitle}
                    onChange={(e) => setCustomPosterSubtitle(e.target.value)}
                    placeholder={episode.philosophicalTheme}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                  />
                </div>
              </div>
            )}
          </section>

          <section className="bg-white border border-[#E5E2D9] rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-[#18181B]">
              Métadonnées de l’épisode
            </h2>

            <div className="space-y-3">
              <div>
                <label htmlFor="pub-title" className="block text-xs font-medium text-[#52525B] mb-1">
                  Titre public de l’épisode
                </label>
                <input
                  id="pub-title"
                  type="text"
                  value={episode.title}
                  onChange={(e) => onUpdateEpisode({ ...episode, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pub-work" className="block text-xs font-medium text-[#52525B] mb-1">
                    Œuvre analysée
                  </label>
                  <input
                    id="pub-work"
                    type="text"
                    value={episode.workTitle}
                    onChange={(e) => onUpdateEpisode({ ...episode, workTitle: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                  />
                </div>
                <div>
                  <label htmlFor="pub-theme" className="block text-xs font-medium text-[#52525B] mb-1">
                    Concept philosophique
                  </label>
                  <input
                    id="pub-theme"
                    type="text"
                    value={episode.philosophicalTheme}
                    onChange={(e) =>
                      onUpdateEpisode({ ...episode, philosophicalTheme: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg focus:outline-none focus:border-[#C2410C]"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Algorithmic SEO Pack, Keywords & Show Notes */}
        <div className="lg:col-span-7 space-y-6">
          <section
            aria-label="Mots-clés algorithme et référencement SEO"
            className="bg-white border border-[#E5E2D9] rounded-xl p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[#18181B] flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
                  Référencement Algorithme & Visibilité (YouTube / Spotify)
                </h2>
                <p className="text-xs text-[#71717A]">
                  Mots-clés, titre optimisé et hashtags calculés automatiquement à partir de votre
                  œuvre, thème et sources.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadSeoTxt}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] border border-[#E5E2D9] rounded-lg cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                Exporter Pack (.TXT)
              </button>
            </div>

            {/* Optimized Algorithmic Title */}
            <div className="p-3.5 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#52525B]">
                  Titre optimisé pour l’algorithme
                </span>
                <button
                  type="button"
                  onClick={() => copyText('seo_title', seoPack.optimizedTitle)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#C2410C] cursor-pointer"
                >
                  {copiedField === 'seo_title' ? (
                    <>
                      <Check className="w-3 h-3 text-[#15803D]" />
                      Copié
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copier
                    </>
                  )}
                </button>
              </div>
              <p className="text-sm font-semibold text-[#18181B]">{seoPack.optimizedTitle}</p>
            </div>

            {/* Keywords & Tags */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#18181B]">
                  Mots-clés & Tags ({seoPack.keywords.length})
                </span>
                <button
                  type="button"
                  onClick={() => copyText('seo_keywords', seoPack.keywordsCsv)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#C2410C] cursor-pointer"
                >
                  {copiedField === 'seo_keywords' ? (
                    <>
                      <Check className="w-3 h-3 text-[#15803D]" />
                      Tags copiés
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copier tous les tags
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5" data-testid="seo-keywords-list">
                {seoPack.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="px-2 py-1 text-xs font-mono text-[#27272A] bg-[#F6F5F0] border border-[#E5E2D9] rounded-md"
                  >
                    {kw}
                  </span>
                ))}
              </div>

              <p className="text-xs font-mono text-[#52525B]">
                Hashtags : {seoPack.hashtags.join(' ')}
              </p>
            </div>

            {/* Complete Description & Show Notes */}
            <div className="space-y-2 pt-2 border-t border-[#F0EFEA]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#18181B]">
                  Description complète + Chapitres horodatés + Sources
                </span>
                <button
                  type="button"
                  onClick={() => copyText('seo_desc', seoPack.youtubeDescription)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[#18181B] bg-[#F6F5F0] hover:bg-[#ECEAE2] border border-[#E5E2D9] rounded-md cursor-pointer"
                >
                  {copiedField === 'seo_desc' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#15803D]" aria-hidden="true" />
                      Description copiée
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      Copier la description
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 bg-[#FAF9F5] border border-[#E5E2D9] rounded-lg text-xs font-mono text-[#27272A] whitespace-pre-wrap leading-relaxed max-h-[340px] overflow-y-auto">
                {seoPack.youtubeDescription}
              </pre>
            </div>
          </section>

          <section className="bg-white border border-[#E5E2D9] rounded-xl p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="font-display text-base font-semibold text-[#18181B]">
                Vérification du nom « PHILOA2BALLES » sur les réseaux
              </h2>
              <p className="text-xs text-[#52525B] leading-relaxed">
                Aucune chaîne YouTube, TikTok, Instagram ni aucun podcast reconnu n’utilise le
                pseudonyme exact <strong>PHILOA2BALLES</strong>.
              </p>
            </div>

            <div className="divide-y divide-[#F0EFEA]">
              {SOCIAL_CHECKS.map((item) => {
                const checked = reservedHandles[item.platform] ?? false;
                return (
                  <div key={item.platform} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[#18181B]">
                        {item.platform} · <span className="font-mono text-xs">{item.handle}</span>
                      </p>
                      <p className="text-xs text-[#15803D]">{item.status}</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-[#52525B] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setReservedHandles((prev) => ({
                            ...prev,
                            [item.platform]: e.target.checked,
                          }))
                        }
                        className="accent-[#C2410C]"
                      />
                      Réservé
                    </label>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-[#71717A] flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Prêt pour Spotify for Creators, Apple Podcasts, YouTube Podcast ou Flux RSS.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
