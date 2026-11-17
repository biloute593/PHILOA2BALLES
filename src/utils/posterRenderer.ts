import type { Episode } from '../types/podcast';
import { drawShoeFrame } from './logoExporter';
import { LOGO_CROSSBAR_ANCHOR, type WindStrength } from './logoWindPhysics';

export type PosterPaletteId = 'ivoire_cuivre' | 'noir_studio' | 'encre_bleue';
export type PosterFormat = 'carre_podcast' | 'youtube_16_9';

export interface PosterPalette {
  id: PosterPaletteId;
  label: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  rule: string;
}

export const POSTER_PALETTES: Record<PosterPaletteId, PosterPalette> = {
  ivoire_cuivre: {
    id: 'ivoire_cuivre',
    label: 'Pluie & Cuivre (Officiel)',
    bg: '#0E1112',
    surface: '#161B1D',
    ink: '#FAF8F5',
    muted: '#D4D4D8',
    accent: '#EA580C',
    rule: '#32393D',
  },
  noir_studio: {
    id: 'noir_studio',
    label: 'Noir Pluie & Ambre Or',
    bg: '#0A0B0D',
    surface: '#141619',
    ink: '#FFFFFF',
    muted: '#CBD5E1',
    accent: '#F59E0B',
    rule: '#27272A',
  },
  encre_bleue: {
    id: 'encre_bleue',
    label: 'Pluie Nocturne & Bleu Acier',
    bg: '#0B131E',
    surface: '#122031',
    ink: '#F8FAFC',
    muted: '#CBD5E1',
    accent: '#F97316',
    rule: '#263A52',
  },
};

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.length > 0) {
    const joined = lines.join(' ');
    if (joined.length < text.trim().length) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:!?]+$/, '')}…`;
    }
  }
  return lines;
}

function drawScaledOfficialLogo(
  ctx: CanvasRenderingContext2D,
  logoBgImage: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  timeSec: number,
  windStrength: WindStrength
): void {
  const offscreen = document.createElement('canvas');
  offscreen.width = LOGO_CROSSBAR_ANCHOR.naturalWidth;
  offscreen.height = LOGO_CROSSBAR_ANCHOR.naturalHeight;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) return;

  drawShoeFrame(offCtx, logoBgImage, timeSec, windStrength, false);
  ctx.drawImage(offscreen, dx, dy, dw, dh);
}

export function renderEpisodePosterToCanvas(
  canvas: HTMLCanvasElement,
  episode: Episode,
  options: {
    paletteId: PosterPaletteId;
    format: PosterFormat;
    brandTitle: string;
    customSubtitle?: string;
    durationLabel: string;
    logoBgImage?: HTMLImageElement | null;
    windStrength?: WindStrength;
    timeSec?: number;
  }
): void {
  const isSquare = options.format === 'carre_podcast';
  const width = isSquare ? 1200 : 1280;
  const height = isSquare ? 1200 : 720;

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const p = POSTER_PALETTES[options.paletteId];
  const isSong = (episode.category ?? 'cinema_serie') === 'chanson';
  const workClean = episode.workTitle.split('(')[0].trim();
  const mainHeadline = episode.title.includes(':')
    ? episode.title.split(':').slice(1).join(':').trim()
    : episode.title;
  const brandLabel = (options.brandTitle || 'PHILOA2BALLES').toUpperCase();
  const epTag = `ÉPISODE ${episode.number} · ${isSong ? 'CHANSON & PHILO' : 'CINÉMA & PHILO'}`;

  // Base rainy atmospheric backdrop
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, width, height);

  if (isSquare) {
    // Podcast 1:1 Cover — top 67% showcases the complete official shoe logo edge-to-edge
    const logoAspect = LOGO_CROSSBAR_ANCHOR.naturalWidth / LOGO_CROSSBAR_ANCHOR.naturalHeight;
    const logoW = width;
    const logoH = Math.round(logoW / logoAspect); // ~803px

    if (options.logoBgImage) {
      drawScaledOfficialLogo(
        ctx,
        options.logoBgImage,
        0,
        0,
        logoW,
        logoH,
        options.timeSec ?? 1.15,
        options.windStrength ?? 'brise'
      );
    }

    // Smooth atmospheric blend into the editorial lower third
    const fadeGrad = ctx.createLinearGradient(0, logoH - 180, 0, height);
    fadeGrad.addColorStop(0, 'rgba(11, 14, 15, 0)');
    fadeGrad.addColorStop(0.28, p.bg);
    fadeGrad.addColorStop(1, p.bg);
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(0, logoH - 180, width, height - (logoH - 180));

    const pad = 72;
    const textTop = logoH + 18;

    // Accent bar + Episode tag
    ctx.fillStyle = p.accent;
    ctx.fillRect(pad, textTop - 22, 84, 5);

    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillText(epTag, pad, textTop + 14);

    ctx.fillStyle = p.muted;
    const durWidth = ctx.measureText(`${options.durationLabel} · PODCAST`).width;
    ctx.fillText(`${options.durationLabel} · PODCAST`, width - pad - durWidth, textTop + 14);

    // Work title
    ctx.fillStyle = p.muted;
    ctx.font = '600 26px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(workClean.toUpperCase(), pad, textTop + 60);

    // Main episode headline
    ctx.fillStyle = p.ink;
    ctx.font = '700 50px "Fraunces", Georgia, serif';
    const titleLines = wrapLines(ctx, mainHeadline, width - pad * 2, 2);
    let y = textTop + 122;
    for (const line of titleLines) {
      ctx.fillText(line, pad, y);
      y += 60;
    }

    // Subtle theme subtitle + brand signature
    const subtitleText = (options.customSubtitle || episode.philosophicalTheme).trim();
    ctx.fillStyle = p.muted;
    ctx.font = '400 24px "Plus Jakarta Sans", system-ui, sans-serif';
    const subLines = wrapLines(ctx, subtitleText, width - pad * 2, 2);
    y += 10;
    for (const line of subLines) {
      ctx.fillText(line, pad, y);
      y += 34;
    }

    // Subtle outer hairline frame
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, width - 48, height - 48);
    return;
  }

  // YouTube 16:9 Thumbnail / Poster (1280x720)
  // Left hero showcases the full official rainy-glass + sneakers logo; right editorial band carries crisp metadata
  const logoH = height;
  const logoAspect = LOGO_CROSSBAR_ANCHOR.naturalWidth / LOGO_CROSSBAR_ANCHOR.naturalHeight;
  const logoW = Math.round(logoH * logoAspect); // ~1075px

  if (options.logoBgImage) {
    drawScaledOfficialLogo(
      ctx,
      options.logoBgImage,
      -42,
      0,
      logoW,
      logoH,
      options.timeSec ?? 1.15,
      options.windStrength ?? 'brise'
    );
  }

  // Smooth horizontal gradient scrim from x=580 -> x=820 so PHILO A² BALLES + sneakers stay completely sharp on the left
  const sideGrad = ctx.createLinearGradient(540, 0, 860, 0);
  sideGrad.addColorStop(0, 'rgba(11, 14, 15, 0)');
  sideGrad.addColorStop(0.65, 'rgba(11, 14, 15, 0.86)');
  sideGrad.addColorStop(1, p.bg);
  ctx.fillStyle = sideGrad;
  ctx.fillRect(540, 0, width - 540, height);

  // Also subtle vertical contrast scrim along the very bottom for duration line
  const bottomGrad = ctx.createLinearGradient(0, height - 110, 0, height);
  bottomGrad.addColorStop(0, 'rgba(11, 14, 15, 0)');
  bottomGrad.addColorStop(1, 'rgba(11, 14, 15, 0.72)');
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, height - 110, width, 110);

  // Right editorial panel
  const colX = 760;
  const colRightPad = 60;
  const colW = width - colX - colRightPad;
  const topPad = 84;

  ctx.fillStyle = p.accent;
  ctx.fillRect(colX, topPad, 76, 5);

  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText(epTag, colX, topPad + 38);

  // Work kicker
  ctx.fillStyle = p.muted;
  ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
  const workLines = wrapLines(ctx, workClean.toUpperCase(), colW, 2);
  let y = topPad + 110;
  for (const wl of workLines) {
    ctx.fillText(wl, colX, y);
    y += 30;
  }

  // Main headline
  ctx.fillStyle = p.ink;
  ctx.font = '700 44px "Fraunces", Georgia, serif';
  const titleLines = wrapLines(ctx, mainHeadline, colW, 4);
  y += 26;
  for (const line of titleLines) {
    ctx.fillText(line, colX, y);
    y += 54;
  }

  // Theme subtitle
  const subtitleText = (options.customSubtitle || episode.philosophicalTheme).trim();
  ctx.fillStyle = p.muted;
  ctx.font = '400 21px "Plus Jakarta Sans", system-ui, sans-serif';
  const subLines = wrapLines(ctx, subtitleText, colW, 3);
  y += 14;
  for (const line of subLines) {
    ctx.fillText(line, colX, y);
    y += 30;
  }

  // Footer metadata line inside right column
  const footerY = height - 64;
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(colX, footerY - 38);
  ctx.lineTo(width - colRightPad, footerY - 38);
  ctx.stroke();

  ctx.fillStyle = p.ink;
  ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(brandLabel, colX, footerY);

  ctx.fillStyle = p.accent;
  ctx.font = '600 18px "JetBrains Mono", monospace';
  const durStr = `${options.durationLabel} · YOUTUBE`;
  const durW = ctx.measureText(durStr).width;
  ctx.fillText(durStr, width - colRightPad - durW, footerY);

  // Crisp editorial border frame
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, width - 40, height - 40);
}
