import type { Episode } from '../types/podcast';
import { estimateSpeechDurationSeconds, formatTimecode } from './audioDsp';
import { calculateEpisodeDurationSeconds, calculateEpisodeTargetSeconds } from './episodeStore';

export interface EpisodeSeoPack {
  optimizedTitle: string;
  shortCoverTitle: string;
  youtubeDescription: string;
  keywords: string[];
  keywordsCsv: string;
  hashtags: string[];
  estimatedMinutesLabel: string;
}

function cleanWorkTitle(workTitle: string): string {
  return workTitle.replace(/\([^)]*\)/g, '').trim();
}

function extractCreatorName(workTitle: string): string | null {
  const inside = workTitle.match(/\(([^)]+)\)/)?.[1];
  if (!inside) return null;
  const cleaned = inside
    .replace(/\d{4}(?:[–-]\d{4})?/g, '')
    .replace(/souvent prononcé.*$/i, '')
    .replace(/avec.*$/i, '')
    .replace(/,/g, '')
    .trim();
  return cleaned.length >= 3 ? cleaned : null;
}

function extractThemeKeywords(theme: string): string[] {
  return theme
    .replace(/\([^)]*\)/g, '')
    .split(/,|et|&/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
}

function toHashtag(raw: string): string {
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
  if (!normalized) return '';
  const pascal = normalized
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
  return pascal ? `#${pascal}` : '';
}

export function generateEpisodeSeoPack(episode: Episode): EpisodeSeoPack {
  const isSong = (episode.category ?? 'cinema_serie') === 'chanson';
  const workClean = cleanWorkTitle(episode.workTitle);
  const creator = extractCreatorName(episode.workTitle);
  const themeParts = extractThemeKeywords(episode.philosophicalTheme);
  const mainTheme = themeParts[0] || episode.philosophicalTheme;

  const targetSec = calculateEpisodeTargetSeconds(episode);
  const writtenSec = calculateEpisodeDurationSeconds(episode);
  const effectiveSec = Math.max(targetSec, writtenSec);
  const targetMin = Math.max(episode.targetMinutes ?? 30, Math.round(effectiveSec / 60));
  const estimatedMinutesLabel = `${targetMin} min`;

  const optimizedTitle = isSong
    ? `${workClean} : La philosophie cachée derrière les paroles | PHILOA2BALLES Ep.${episode.number}`
    : `${workClean} : ${mainTheme} expliqué simplement | PHILOA2BALLES Ep.${episode.number}`;

  const shortCoverTitle = episode.title.includes(':')
    ? episode.title.split(':').slice(1).join(':').trim()
    : episode.title;

  // Build algorithmic chapters (uses written durations if drafted, or target durations for 30+ min plan)
  let cursor = 0;
  const chapterLines = episode.segments.map((seg, idx) => {
    const stamp = formatTimecode(cursor);
    const written = estimateSpeechDurationSeconds(seg.scriptText, seg.estimatedWpm);
    const step = written >= 60 ? written : seg.targetDurationSec ?? written;
    cursor += step;
    return `${stamp} — ${String(idx + 1).padStart(2, '0')}. ${seg.title}`;
  });

  const authorTokens = episode.sources
    .map((s) => s.authorOrDirector.split('(')[0].trim())
    .filter((name) => name.length >= 3);

  const rawKeywords = [
    'PHILOA2BALLES',
    'philosophie accessible',
    'vulgarisation philosophique',
    'style Le Précepteur',
    workClean,
    ...(creator ? [creator] : []),
    ...themeParts,
    ...(isSong
      ? ['philosophie chanson', 'analyse paroles', 'explication chanson', 'histoire chanson']
      : ['philosophie cinéma', 'analyse film', 'analyse série', 'exemples concrets']),
    ...authorTokens.slice(0, 4),
    'podcast philosophie français',
  ];

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const kw of rawKeywords) {
    const clean = kw.trim();
    const key = clean.toLowerCase();
    if (clean.length >= 2 && !seen.has(key)) {
      seen.add(key);
      keywords.push(clean);
    }
  }

  const hashtagCandidates = [
    '#Philoa2balles',
    '#Philosophie',
    isSong ? '#AnalyseChanson' : '#AnalyseFilm',
    toHashtag(workClean),
    toHashtag(mainTheme),
    '#Vulgarisation',
    '#PodcastFrancais',
  ].filter(Boolean);

  const hashtags = Array.from(new Set(hashtagCandidates));

  const sourceLines = episode.sources.map(
    (s) => `• ${s.authorOrDirector} (${s.year}) — ${s.title}`
  );

  const youtubeDescription = [
    `${episode.logline}`,
    '',
    `Dans cet épisode ${episode.number} de PHILOA2BALLES (${estimatedMinutesLabel}), on décrypte « ${workClean} » avec des mots simples et des situations concrètes de la vie de tous les jours : ${episode.philosophicalTheme.toLowerCase()}.`,
    '',
    '⏱️ CHAPITRES DE L’ÉPISODE',
    ...chapterLines,
    '',
    '📚 SOURCES & RÉFÉRENCES CITÉES',
    ...(sourceLines.length > 0 ? sourceLines : ['• Notes personnelles PHILOA2BALLES']),
    '',
    '🔎 MOTS-CLÉS',
    keywords.join(', '),
    '',
    hashtags.join(' '),
  ].join('\n');

  return {
    optimizedTitle,
    shortCoverTitle,
    youtubeDescription,
    keywords,
    keywordsCsv: keywords.join(', '),
    hashtags,
    estimatedMinutesLabel,
  };
}
