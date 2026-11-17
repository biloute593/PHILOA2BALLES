# Refonte du studio PHILOA2BALLES

## Objectif
Conserver intégralement les 24 épisodes, leurs textes, segments, sources, notes et données cloud, tout en rendre l’enregistrement et le montage utilisables sur téléphone comme un mini-Audacity.

## Décisions d’implémentation
- Garder React/Vite, Firebase et le modèle de données existants.
- Améliorer `AudioMasteringStudio` sans réécrire les données de contenu.
- Enregistrement MediaRecorder non destructif avec pause/reprise, compteur, niveau micro et marqueurs de segment.
- Prompteur intégré dans le studio : défilement manuel/automatique et navigation segment par segment sans arrêter la prise.
- Découpage horizontal de timeline : déplacement du clip et poignées gauche/droite pour rogner directement la forme d’onde.
- Préécoute du mix rendu en WAV via un élément `<audio>` persistant et Media Session pour la lecture écran verrouillé quand iOS/Safari l’autorise.
- Mastering automatique conservé et rendu plus explicite : analyse, proposition EQ/compresseur, application en un clic, export WAV.

## Structure concernée
- `src/components/AudioMasteringStudio.tsx` : capture, marqueurs, lecture verrouillable, timeline et poignées de rognage.
- `src/components/TeleprompterView.tsx` : conserver la lecture IA et ses commandes Media Session existantes.
- `src/types/podcast.ts` : aucune modification destructive ; les marqueurs restent transitoires et produisent des `TimelineClip` existants.
- `src/utils/webAudioEngine.ts` : réutiliser le rendu WAV/mastering déjà présent.

## Limites explicites
Une page web iPhone ne peut pas garantir l’enregistrement micro écran verrouillé. La lecture audio rendue peut utiliser le verrouillage écran via Media Session, selon les règles de Safari/iOS. Pour enregistrer écran éteint, une application iOS native sera nécessaire.

## Validation
Vérifier TypeScript, build Vite, conservation des seed data et absence de modification des fichiers de contenu.
