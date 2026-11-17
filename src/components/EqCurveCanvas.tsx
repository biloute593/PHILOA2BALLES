import { useEffect, useRef } from 'react';
import type { MasteringSettings } from '../types/podcast';
import { calculateEqFrequencyResponse } from '../utils/audioDsp';

interface ToneOverlayCurves {
  frequencies: number[];
  currentBandDb: number[];
  targetBandDb: number[];
}

interface EqCurveCanvasProps {
  settings: MasteringSettings;
  toneComparison?: ToneOverlayCurves | null;
}

const GRID_FREQS = [50, 100, 200, 500, 1000, 2800, 5800, 10000, 16000];
const GRID_LABELS: Record<number, string> = {
  50: '50',
  200: '200',
  1000: '1k',
  2800: '2.8k',
  5800: '5.8k',
  16000: '16k',
};

export function EqCurveCanvas({ settings, toneComparison }: EqCurveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const width = canvas.clientWidth || 360;
    const height = canvas.clientHeight || 130;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#141417';
    ctx.fillRect(0, 0, width, height);

    const padLeft = 28;
    const padRight = 10;
    const padTop = 12;
    const padBottom = 22;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const minFreqLog = Math.log10(35);
    const maxFreqLog = Math.log10(18000);
    const freqToX = (f: number) =>
      padLeft + ((Math.log10(f) - minFreqLog) / (maxFreqLog - minFreqLog)) * plotW;

    const dbToY = (db: number) => {
      const clamped = Math.max(-18, Math.min(12, db));
      return padTop + ((12 - clamped) / 30) * plotH;
    };

    // Gridlines (dB)
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const db of [-12, -6, 0, 6]) {
      const y = dbToY(db);
      ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, padLeft - 5, y);
    }

    // Frequency vertical gridlines
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const f of GRID_FREQS) {
      const x = freqToX(f);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();
      if (GRID_LABELS[f]) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillText(GRID_LABELS[f], x, padTop + plotH + 5);
      }
    }

    // Compute response curve across 96 log-spaced points
    const freqs: number[] = [];
    const steps = 96;
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      freqs.push(Math.pow(10, minFreqLog + ratio * (maxFreqLog - minFreqLog)));
    }
    const gains = calculateEqFrequencyResponse(settings, freqs);

    // Fill area under EQ curve relative to 0 dB
    const zeroY = dbToY(0);
    ctx.beginPath();
    ctx.moveTo(freqToX(freqs[0]), zeroY);
    for (let i = 0; i < freqs.length; i++) {
      ctx.lineTo(freqToX(freqs[i]), dbToY(gains[i]));
    }
    ctx.lineTo(freqToX(freqs[freqs.length - 1]), zeroY);
    ctx.closePath();
    ctx.fillStyle = settings.bypass ? 'rgba(161,161,170,0.12)' : 'rgba(245,158,11,0.14)';
    ctx.fill();

    // Optional overlays: Le Précepteur reference target curve + measured current voice spectrum
    if (toneComparison && toneComparison.frequencies.length > 1) {
      // 1. Target curve ("Le Précepteur") in dashed teal
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      toneComparison.frequencies.forEach((f, idx) => {
        const x = freqToX(f);
        const y = dbToY(toneComparison.targetBandDb[idx] ?? 0);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#2DD4BF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();

      // 2. Current voice frequency curve in sky blue with points
      ctx.beginPath();
      toneComparison.frequencies.forEach((f, idx) => {
        const x = freqToX(f);
        const y = dbToY(toneComparison.currentBandDb[idx] ?? 0);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      toneComparison.frequencies.forEach((f, idx) => {
        const x = freqToX(f);
        const y = dbToY(toneComparison.currentBandDb[idx] ?? 0);
        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.arc(x, y, 2.3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Stroke main EQ curve
    ctx.beginPath();
    for (let i = 0; i < freqs.length; i++) {
      const x = freqToX(freqs[i]);
      const y = dbToY(gains[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = settings.bypass ? '#71717A' : '#F59E0B';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [settings, toneComparison]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="eq-curve-canvas"
      aria-label="Courbe de réponse de l'égaliseur et comparaison au style du Précepteur"
      className="w-full h-[132px] rounded-md border border-[#2E2E35] block"
    />
  );
}
