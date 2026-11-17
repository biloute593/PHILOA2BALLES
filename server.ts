import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

type SegmentRole =
  | 'accroche'
  | 'exemple'
  | 'concept'
  | 'bascule'
  | 'nuance'
  | 'conclusion';
type PrecepteurPace = 'pose' | 'precepteur' | 'fluide';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRIMARY_TTS_MODEL = 'gemini-3.8-flash-tts';
const FALLBACK_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const PRECEPTEUR_VOICE_NAME = 'Charon';

const VALID_ROLES = new Set<SegmentRole>([
  'accroche',
  'exemple',
  'concept',
  'bascule',
  'nuance',
  'conclusion',
]);
const VALID_PACES = new Set<PrecepteurPace>(['pose', 'precepteur', 'fluide']);

function buildSpeechStyleDirection(
  role: SegmentRole,
  pace: PrecepteurPace,
  withSoutenances: boolean
): string {
  const paceDirective =
    pace === 'pose'
      ? 'very unhurried, meditative tempo with long reflective rests'
      : pace === 'fluide'
        ? 'natural conversational podcast tempo, clear and warm'
        : 'calm, measured French philosophical storytelling cadence like Le Précepteur';

  const soutenanceDirective = withSoutenances
    ? 'Use expressive vocal weight on key contrasts, gentle rhetorical pauses before crucial questions, and warm rhythmic echoes on repeated ideas without rushing.'
    : 'Read smoothly and clearly with neutral conversational pauses.';

  const roleColor: Record<SegmentRole, string> = {
    accroche: 'Intimate and intriguing opening tone that gently pulls the listener in.',
    exemple: 'Vivid, narrative storytelling tone as if painting a scene over coffee.',
    concept: 'Deep, pedagogical, thoughtful tone explaining philosophy with clarity and warmth.',
    bascule: 'Grave, revelatory pivot tone highlighting an unexpected truth.',
    nuance: 'Balanced, lucid, measured tone weighing shades of gray carefully.',
    conclusion: 'Warm, resonant closing tone leaving space for quiet reflection.',
  };

  return `Warm, deep, intimate French male podcast narrator ("Le Précepteur" style): soft velvet timbre, zero harsh sibilance, ${paceDirective}. ${soutenanceDirective} ${roleColor[role]}`;
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '128kb' }));

  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
  const ai = apiKey
    ? new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      })
    : null;

  app.get('/api/tts/status', (_req: Request, res: Response) => {
    res.json({
      available: Boolean(ai),
      model: PRIMARY_TTS_MODEL,
      voice: PRECEPTEUR_VOICE_NAME,
    });
  });

  app.post('/api/tts/precepteur', async (req: Request, res: Response) => {
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_TTS_UNAVAILABLE',
        fallbackRecommended: true,
      });
      return;
    }

    const body = (req.body ?? {}) as {
      text?: unknown;
      role?: unknown;
      pace?: unknown;
      withSoutenances?: unknown;
    };

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      res.status(400).json({ error: 'Texte manquant pour la lecture vocale.' });
      return;
    }

    if (text.length > 2600) {
      res.status(400).json({ error: 'Segment vocal trop long (max 2600 caractères).' });
      return;
    }

    const role: SegmentRole =
      typeof body.role === 'string' && VALID_ROLES.has(body.role as SegmentRole)
        ? (body.role as SegmentRole)
        : 'concept';
    const pace: PrecepteurPace =
      typeof body.pace === 'string' && VALID_PACES.has(body.pace as PrecepteurPace)
        ? (body.pace as PrecepteurPace)
        : 'precepteur';
    const withSoutenances = body.withSoutenances !== false;

    const style = buildSpeechStyleDirection(role, pace, withSoutenances);
    const modelsToTry = [PRIMARY_TTS_MODEL, FALLBACK_TTS_MODEL];

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text,
                  speechMetadata: { style },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: PRECEPTEUR_VOICE_NAME,
                },
              },
            },
          },
        });

        const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inlineData?.data) {
          res.json({
            audioBase64: inlineData.data,
            mimeType: inlineData.mimeType || 'audio/wav',
            model,
          });
          return;
        }
      } catch {
        // Try fallback model or fall through cleanly
      }
    }

    res.status(502).json({
      error: 'GEMINI_TTS_SYNTHESIS_FAILED',
      fallbackRecommended: true,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`PHILOA2BALLES server listening on http://0.0.0.0:${port}`);
  });
}

void createApp();
