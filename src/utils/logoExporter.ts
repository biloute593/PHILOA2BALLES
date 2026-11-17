import {
  CROSSBAR_KNOT_PATH,
  LACE_BOW_PATH,
  LEFT_LACE_PATH,
  LEFT_SHOE_DETAIL_PATH,
  LEFT_SHOE_OUTLINE_PATH,
  RIGHT_LACE_PATH,
  RIGHT_SHOE_DETAIL_PATH,
  RIGHT_SHOE_OUTLINE_PATH,
} from './logoShoePaths';
import {
  computeWindSwayAngles,
  LOGO_CROSSBAR_ANCHOR,
  type WindStrength,
} from './logoWindPhysics';

export const LOGO_BG_URL = '/assets/philoa2balle-logo-bg.png';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

export function drawShoeFrame(
  ctx: CanvasRenderingContext2D,
  bgImage: HTMLImageElement,
  timeSec: number,
  strength: WindStrength,
  paused: boolean
): void {
  const w = LOGO_CROSSBAR_ANCHOR.naturalWidth;
  const h = LOGO_CROSSBAR_ANCHOR.naturalHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bgImage, 0, 0, w, h);

  const angles = computeWindSwayAngles(timeSec, strength, paused);

  // Subtle passing wind wisps
  if (!paused && angles.wispOpacity > 0.01) {
    ctx.save();
    ctx.translate(angles.wispOffsetX, 0);
    ctx.strokeStyle = `rgba(255, 255, 255, ${angles.wispOpacity.toFixed(3)})`;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(310, 792);
    ctx.quadraticCurveTo(485, 772, 690, 796);
    ctx.stroke();

    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(355, 896);
    ctx.quadraticCurveTo(525, 878, 730, 902);
    ctx.stroke();
    ctx.restore();
  }

  // Shared shadow for crisp white line-art integration on rainy glass
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.82)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;

  // Knot anchored on crossbar
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 1.5;
  const knotPath = new Path2D(CROSSBAR_KNOT_PATH);
  ctx.fill(knotPath);
  ctx.stroke(knotPath);

  // Fluttering bow ears
  ctx.save();
  ctx.translate(LOGO_CROSSBAR_ANCHOR.x, LOGO_CROSSBAR_ANCHOR.y);
  ctx.rotate((angles.laceBowDeg * Math.PI) / 180);
  ctx.translate(-LOGO_CROSSBAR_ANCHOR.x, -LOGO_CROSSBAR_ANCHOR.y);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(LACE_BOW_PATH));
  ctx.restore();

  // Main pendulum anchored at (510, 536)
  ctx.save();
  ctx.translate(LOGO_CROSSBAR_ANCHOR.x, LOGO_CROSSBAR_ANCHOR.y);
  ctx.rotate((angles.mainPivotDeg * Math.PI) / 180);
  ctx.translate(-LOGO_CROSSBAR_ANCHOR.x, -LOGO_CROSSBAR_ANCHOR.y);

  // Left lace & sneaker
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D(LEFT_LACE_PATH));

  ctx.save();
  ctx.translate(LOGO_CROSSBAR_ANCHOR.leftShoePivotX, LOGO_CROSSBAR_ANCHOR.leftShoePivotY);
  ctx.rotate((angles.leftShoeDeg * Math.PI) / 180);
  ctx.translate(-LOGO_CROSSBAR_ANCHOR.leftShoePivotX, -LOGO_CROSSBAR_ANCHOR.leftShoePivotY);
  const leftOutline = new Path2D(LEFT_SHOE_OUTLINE_PATH);
  ctx.fillStyle = 'rgba(14, 17, 18, 0.42)';
  ctx.fill(leftOutline);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 5.4;
  ctx.lineJoin = 'round';
  ctx.stroke(leftOutline);
  ctx.strokeStyle = '#F4F4F5';
  ctx.lineWidth = 3.8;
  ctx.stroke(new Path2D(LEFT_SHOE_DETAIL_PATH));
  ctx.restore();

  // Right lace & sneaker
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4.2;
  ctx.stroke(new Path2D(RIGHT_LACE_PATH));

  ctx.save();
  ctx.translate(LOGO_CROSSBAR_ANCHOR.rightShoePivotX, LOGO_CROSSBAR_ANCHOR.rightShoePivotY);
  ctx.rotate((angles.rightShoeDeg * Math.PI) / 180);
  ctx.translate(-LOGO_CROSSBAR_ANCHOR.rightShoePivotX, -LOGO_CROSSBAR_ANCHOR.rightShoePivotY);
  const rightOutline = new Path2D(RIGHT_SHOE_OUTLINE_PATH);
  ctx.fillStyle = 'rgba(14, 17, 18, 0.42)';
  ctx.fill(rightOutline);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 5.4;
  ctx.lineJoin = 'round';
  ctx.stroke(rightOutline);
  ctx.strokeStyle = '#F4F4F5';
  ctx.lineWidth = 3.8;
  ctx.stroke(new Path2D(RIGHT_SHOE_DETAIL_PATH));
  ctx.restore();

  ctx.restore();
  ctx.restore();
}

export async function exportLogoPngBlob(windStrength: WindStrength = 'brise'): Promise<Blob> {
  const bgImage = await loadImage(LOGO_BG_URL);
  const canvas = document.createElement('canvas');
  canvas.width = LOGO_CROSSBAR_ANCHOR.naturalWidth;
  canvas.height = LOGO_CROSSBAR_ANCHOR.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');

  drawShoeFrame(ctx, bgImage, 1.15, windStrength, false);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Échec de génération PNG'));
    }, 'image/png');
  });
}

export async function exportAnimatedLogoWebmBlob(
  windStrength: WindStrength = 'brise',
  durationSec = 6,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Enregistrement vidéo WebM non pris en charge par ce navigateur.');
  }
  const bgImage = await loadImage(LOGO_BG_URL);
  const canvas = document.createElement('canvas');
  canvas.width = LOGO_CROSSBAR_ANCHOR.naturalWidth;
  canvas.height = LOGO_CROSSBAR_ANCHOR.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_500_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = () => {
      reject(new Error('Erreur lors de l’export vidéo WebM.'));
    };

    const start = performance.now();
    const totalMs = durationSec * 1000;
    recorder.start(250);

    const step = (now: number) => {
      const elapsedMs = now - start;
      const tSec = elapsedMs / 1000;
      drawShoeFrame(ctx, bgImage, tSec, windStrength, false);
      onProgress?.(Math.min(100, Math.round((elapsedMs / totalMs) * 100)));

      if (elapsedMs < totalMs) {
        requestAnimationFrame(step);
      } else {
        recorder.stop();
      }
    };
    requestAnimationFrame(step);
  });
}
