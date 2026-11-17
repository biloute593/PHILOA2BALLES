import type { Episode, NarrativeSegment, SegmentRole } from '../types/podcast';

export interface PolishResult {
  polished: string;
  changes: string[];
  hasChanges: boolean;
}

export interface EpisodeThreadMatch {
  sourceType: 'segment' | 'note';
  segmentId?: string;
  segmentIndex?: number; // 1-based index for display ("01")
  segmentTitle: string;
  matchedExcerpt: string;
  currentSentence: string;
  sharedKeywords: string[];
  matchedRootCount: number;
  overlapRatio: number;
  score: number;
}

export interface EpisodeAdjustmentResult {
  adjusted: string;
  changes: string[];
  hasChanges: boolean;
  repetitions: EpisodeThreadMatch[];
  threadStatus: string;
}

export interface ThoughtGuidance {
  readinessLabel: string;
  guidingQuestions: string[];
  missingHint: string | null;
}

interface Rule {
  pattern: RegExp;
  replacement: string;
  label: string;
}

// Deterministic French spelling, elision, accent, and oral-turn polishing rules.
// Strictly preserves [BALISES] and the author's meaning.
const ORTHO_RULES: Rule[] = [
  // Elisions & apostrophes
  { pattern: /\b(jai|j ai)\b/gi, replacement: "j'ai", label: "Élision « j'ai »" },
  { pattern: /\b(jaimerais|j aimerais)\b/gi, replacement: "j'aimerais", label: "Élision « j'aimerais »" },
  { pattern: /\b(jaime|j aime)\b/gi, replacement: "j'aime", label: "Élision « j'aime »" },
  { pattern: /\b(jen|j en)\b/gi, replacement: "j'en", label: "Élision « j'en »" },
  { pattern: /\b(jinsiste|j insiste)\b/gi, replacement: "j'insiste", label: "Élision « j'insiste »" },
  { pattern: /\b(jsuis|chui|j suis)\b/gi, replacement: 'je suis', label: 'Oral → « je suis »' },
  { pattern: /\b(cest a dire|c'est a dire)\b/gi, replacement: "c'est-à-dire", label: "Trait d'union « c'est-à-dire »" },
  { pattern: /\b(cest|c est)\b/gi, replacement: "c'est", label: "Élision « c'est »" },
  { pattern: /\b(cetait|c était|c etait)\b/gi, replacement: "c'était", label: "Orthographe « c'était »" },
  { pattern: /\b(sil|s il)\b/gi, replacement: "s'il", label: "Élision « s'il »" },
  { pattern: /\b(quil|qu il)\b/gi, replacement: "qu'il", label: "Élision « qu'il »" },
  { pattern: /\bqu elle\b/gi, replacement: "qu'elle", label: "Élision « qu'elle »" },
  {
    pattern: /\bquelle (?=(est|a|etait|était|avait|va|peut|doit|veut|soit|fait|dit|suit|regarde|pense|ressent)\b)/gi,
    replacement: "qu'elle ",
    label: "Élision « qu'elle »",
  },
  { pattern: /\b(quon|qu on)\b/gi, replacement: "qu'on", label: "Élision « qu'on »" },
  { pattern: /\b(quesqui|qu est ce qui|quest ce qui)\b/gi, replacement: "qu'est-ce qui", label: "Orthographe « qu'est-ce qui »" },
  { pattern: /\b(quest ce que|qu est ce que)\b/gi, replacement: "qu'est-ce que", label: "Orthographe « qu'est-ce que »" },
  { pattern: /\b(loutils|l outils|loutil|l outil)\b/gi, replacement: "l'outil", label: "Orthographe « l'outil »" },
  { pattern: /\b(lemploi|l emploi)\b/gi, replacement: "l'emploi", label: "Élision « l'emploi »" },
  { pattern: /\b(lidentite|l identite|l'identite)\b/gi, replacement: "l'identité", label: "Orthographe « l'identité »" },
  { pattern: /\b(lindividu|l individu)\b/gi, replacement: "l'individu", label: "Élision « l'individu »" },
  { pattern: /\b(lentourage|l entourage)\b/gi, replacement: "l'entourage", label: "Élision « l'entourage »" },
  { pattern: /\b(lhistoire|l histoire)\b/gi, replacement: "l'histoire", label: "Élision « l'histoire »" },
  { pattern: /\b(lhomme|l homme)\b/gi, replacement: "l'homme", label: "Élision « l'homme »" },
  { pattern: /\b(lhumain|l humain)\b/gi, replacement: "l'humain", label: "Élision « l'humain »" },
  { pattern: /\b(lautre|l autre)\b/gi, replacement: "l'autre", label: "Élision « l'autre »" },
  { pattern: /\b(lunivers|l univers)\b/gi, replacement: "l'univers", label: "Élision « l'univers »" },
  { pattern: /\b(lhabitude|l habitude)\b/gi, replacement: "l'habitude", label: "Élision « l'habitude »" },
  { pattern: /\b(daccord|d accord)\b/gi, replacement: "d'accord", label: "Élision « d'accord »" },
  { pattern: /\b(quelqun|quelqu un)\b/gi, replacement: "quelqu'un", label: "Apostrophe « quelqu'un »" },
  { pattern: /\b(jusqua|jusqu a)\b/gi, replacement: "jusqu'à", label: "Orthographe « jusqu'à »" },
  { pattern: /\b(puisquil|puisqu il)\b/gi, replacement: "puisqu'il", label: "Élision « puisqu'il »" },
  { pattern: /\b(lorsquil|lorsqu il)\b/gi, replacement: "lorsqu'il", label: "Élision « lorsqu'il »" },
  { pattern: /\b(sattend|s attend)\b/gi, replacement: "s'attend", label: "Élision « s'attend »" },
  { pattern: /\b(sattendent|s attendent)\b/gi, replacement: "s'attendent", label: "Élision « s'attendent »" },
  { pattern: /\b(nattend|n attend)\b/gi, replacement: "n'attend", label: "Élision « n'attend »" },
  { pattern: /\b(quun|qu un)\b/gi, replacement: "qu'un", label: "Élision « qu'un »" },
  { pattern: /\b(quune|qu une)\b/gi, replacement: "qu'une", label: "Élision « qu'une »" },
  { pattern: /\b(nimporte|n importe)\b/gi, replacement: "n'importe", label: "Élision « n'importe »" },
  { pattern: /\baujourdhui\b/gi, replacement: "aujourd'hui", label: "Apostrophe « aujourd'hui »" },

  // Informal oral & SMS shortcuts
  { pattern: /\bta pas\b/gi, replacement: "tu n'as pas", label: "Syntaxe « tu n'as pas »" },
  { pattern: /\bt'as pas\b/gi, replacement: "tu n'as pas", label: "Oral → « tu n'as pas »" },
  { pattern: /\bon a pas\b/gi, replacement: "on n'a pas", label: "Négation « on n'a pas »" },
  { pattern: /\bil a pas\b/gi, replacement: "il n'a pas", label: "Négation « il n'a pas »" },
  { pattern: /\belle a pas\b/gi, replacement: "elle n'a pas", label: "Négation « elle n'a pas »" },
  { pattern: /\bon peut pas\b/gi, replacement: "on ne peut pas", label: "Négation « on ne peut pas »" },
  { pattern: /\btu peux pas\b/gi, replacement: "tu ne peux pas", label: "Négation « tu ne peux pas »" },
  { pattern: /\btas (?=(pas|suivi|suivie|donne|donné|donnée|fait|vu|dit|compris|envie|besoin|raison|tort)\b)/gi, replacement: 'tu as ', label: 'Syntaxe « tu as »' },
  { pattern: /\bta (?=(suivi|suivie|donne|donné|donnée|fait|vu|dit|compris|pris|mis|trouve|trouvé)\b)/gi, replacement: 'tu as ', label: 'Syntaxe « tu as »' },
  { pattern: /\bya\b/gi, replacement: 'il y a', label: 'Oral → « il y a »' },
  { pattern: /(^|[.!?]\s+|\n)y a\b/gi, replacement: '$1il y a', label: 'Oral → « il y a »' },
  { pattern: /\b(parceque|pcq|pck|prcq)\b/gi, replacement: 'parce que', label: "Orthographe « parce que »" },
  { pattern: /\bbcp\b/gi, replacement: 'beaucoup', label: "Abréviation → « beaucoup »" },
  { pattern: /\btjrs\b/gi, replacement: 'toujours', label: "Abréviation → « toujours »" },
  { pattern: /\bqd\b/gi, replacement: 'quand', label: "Abréviation → « quand »" },
  { pattern: /\bpk\b/gi, replacement: 'pourquoi', label: "Abréviation → « pourquoi »" },

  // Common typos, accents & grammar agreement fixes
  { pattern: /\bbiensure?\b/gi, replacement: 'bien sûr', label: "Orthographe « bien sûr »" },
  { pattern: /\bpeut etre\b/gi, replacement: 'peut-être', label: "Trait d'union « peut-être »" },
  { pattern: /\bquelquechose\b/gi, replacement: 'quelque chose', label: "Orthographe « quelque chose »" },
  { pattern: /\bbeaucoups\b/gi, replacement: 'beaucoup', label: "Orthographe « beaucoup »" },
  { pattern: /\btoujour\b/gi, replacement: 'toujours', label: "Orthographe « toujours »" },
  { pattern: /\bmalgres?\b/gi, replacement: 'malgré', label: "Orthographe « malgré »" },
  { pattern: /\bapres\b/gi, replacement: 'après', label: "Accent « après »" },
  { pattern: /\btres\b/gi, replacement: 'très', label: "Accent « très »" },
  { pattern: /\betre\b/gi, replacement: 'être', label: "Accent « être »" },
  { pattern: /\bmeme\b/gi, replacement: 'même', label: "Accent « même »" },
  { pattern: /\bmemes\b/gi, replacement: 'mêmes', label: "Accent « mêmes »" },
  { pattern: /\bidees\b/gi, replacement: 'idées', label: "Accent « idées »" },
  { pattern: /\bpensees\b/gi, replacement: 'pensées', label: "Accent « pensées »" },
  { pattern: /\bpensee\b/gi, replacement: 'pensée', label: "Accent « pensée »" },
  { pattern: /\blanguage\b/gi, replacement: 'langage', label: "Orthographe « langage »" },
  { pattern: /\bpersonnage non joueur\b/gi, replacement: 'personnage non-joueur', label: "Trait d'union « personnage non-joueur »" },
  { pattern: /\bcollegues\b/gi, replacement: 'collègues', label: "Accent « collègues »" },
  { pattern: /\bcollegue\b/gi, replacement: 'collègue', label: "Accent « collègue »" },
  { pattern: /\bregles\b/gi, replacement: 'règles', label: "Accent « règles »" },
  { pattern: /\bregle\b/gi, replacement: 'règle', label: "Accent « règle »" },
  { pattern: /\bsociete\b/gi, replacement: 'société', label: "Accent « société »" },
  { pattern: /\bverite\b/gi, replacement: 'vérité', label: "Accent « vérité »" },
  { pattern: /\brealite\b/gi, replacement: 'réalité', label: "Accent « réalité »" },
  { pattern: /\bliberte\b/gi, replacement: 'liberté', label: "Accent « liberté »" },
  { pattern: /\bidentite\b/gi, replacement: 'identité', label: "Accent « identité »" },
  { pattern: /\bprobleme\b/gi, replacement: 'problème', label: "Accent « problème »" },
  { pattern: /\bproblemes\b/gi, replacement: 'problèmes', label: "Accent « problèmes »" },
  { pattern: /\bsysteme\b/gi, replacement: 'système', label: "Accent « système »" },
  { pattern: /\bsystemes\b/gi, replacement: 'systèmes', label: "Accent « systèmes »" },
  { pattern: /\brepond\b/gi, replacement: 'répond', label: "Accent « répond »" },
  { pattern: /\brepondre\b/gi, replacement: 'répondre', label: "Accent « répondre »" },
  { pattern: /\breponses\b/gi, replacement: 'réponses', label: "Accent « réponses »" },
  { pattern: /\breponse\b/gi, replacement: 'réponse', label: "Accent « réponse »" },
  { pattern: /\breflexion\b/gi, replacement: 'réflexion', label: "Accent « réflexion »" },
  { pattern: /\breflechir\b/gi, replacement: 'réfléchir', label: "Accent « réfléchir »" },
  { pattern: /\bdeja\b/gi, replacement: 'déjà', label: "Accent « déjà »" },
  { pattern: /\bete\b/gi, replacement: 'été', label: "Accent « été »" },
  { pattern: /\bmaniere\b/gi, replacement: 'manière', label: "Accent « manière »" },
  { pattern: /\bpremiere\b/gi, replacement: 'première', label: "Accent « première »" },
  { pattern: /\bderniere\b/gi, replacement: 'dernière', label: "Accent « dernière »" },
  { pattern: /\bbizzarement\b/gi, replacement: 'bizarrement', label: "Orthographe « bizarrement »" },
  { pattern: /\bbizzare\b/gi, replacement: 'bizarre', label: "Orthographe « bizarre »" },
  { pattern: /\b(naturrement|naturelement)\b/gi, replacement: 'naturellement', label: "Orthographe « naturellement »" },
  { pattern: /\bsurement\b/gi, replacement: 'sûrement', label: "Accent « sûrement »" },
  { pattern: /\b(inscienment|insciement|inconscienment)\b/gi, replacement: 'inconsciemment', label: "Orthographe « inconsciemment »" },
  { pattern: /\bevidement\b/gi, replacement: 'évidemment', label: "Orthographe « évidemment »" },
  { pattern: /\bmalheuresement\b/gi, replacement: 'malheureusement', label: "Orthographe « malheureusement »" },
  { pattern: /\bforcement\b/gi, replacement: 'forcément', label: "Accent « forcément »" },
  { pattern: /\blitteralement\b/gi, replacement: 'littéralement', label: "Orthographe « littéralement »" },
  { pattern: /\ba la\b/gi, replacement: 'à la', label: "Accent « à la »" },
  { pattern: /\ba travers\b/gi, replacement: 'à travers', label: "Accent « à travers »" },
  { pattern: /\ba cause\b/gi, replacement: 'à cause', label: "Accent « à cause »" },
  { pattern: /\ba cote\b/gi, replacement: 'à côté', label: "Accents « à côté »" },
  { pattern: /\ba chaque\b/gi, replacement: 'à chaque', label: "Accent « à chaque »" },
  { pattern: /\ba un\b/gi, replacement: 'à un', label: "Accent « à un »" },
  { pattern: /\ba une\b/gi, replacement: 'à une', label: "Accent « à une »" },
  { pattern: /\b(ca vas|ca va|ça vas)\b/gi, replacement: 'ça va', label: "Orthographe « ça va »" },
  { pattern: /\b(vas) (?=(sûrement|probablement|te|me|le|la|nous|vous|se|dire|faire|voir|ouvrir|regarder|penser|poser)\b)/gi, replacement: 'va ', label: 'Conjugaison 3e pers. « va »' },
  { pattern: /\b(n'as pas|as) suivie la\b/gi, replacement: '$1 suivi la', label: 'Accord participe « suivi »' },
  { pattern: /\b(n'as pas|as) donnée la\b/gi, replacement: '$1 donné la', label: 'Accord participe « donné »' },
  { pattern: /\bcomme ca\b/gi, replacement: 'comme ça', label: "Cédille « comme ça »" },
  { pattern: /\bc'est ca\b/gi, replacement: "c'est ça", label: "Cédille « c'est ça »" },
  { pattern: /\bdu coup,\s*du coup\b/gi, replacement: 'du coup', label: 'Suppression répétition « du coup »' },
  { pattern: /\ben fait,\s*en fait\b/gi, replacement: 'en fait', label: 'Suppression répétition « en fait »' },
  { pattern: /\b(et la)\b(?=\s+(?:ton|ta|son|sa|il|elle|on|tu|vous|le|la|les|ce|cette|un|une)\b)/gi, replacement: 'et là,', label: "Accent et virgule « et là, »" },
];

function matchInitialCase(source: string, target: string): string {
  if (!source) return target;
  if (source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()) {
    return target[0].toUpperCase() + target.slice(1);
  }
  return target;
}

export function polishFrenchThought(raw: string): PolishResult {
  if (!raw.trim()) {
    return { polished: raw, changes: [], hasChanges: false };
  }

  // Protect stage cues like [PAUSE 2s] or [EXTRAIT SONORE : ...]
  const cues: string[] = [];
  let working = raw.replace(/\[[^\]]+\]/g, (m) => {
    const token = `__CUE_${cues.length}__`;
    cues.push(m);
    return token;
  });

  const changes: string[] = [];
  const pushChange = (label: string) => {
    if (!changes.includes(label)) changes.push(label);
  };

  // 1. Remove accidental immediate duplicate words (e.g. "le le", "de de", "et et")
  const dedupWords = working.replace(/\b([a-zàâäéèêëïîôöùûüç]{2,})\s+\1\b/gi, (m, w) => {
    pushChange(`Doublon supprimé (« ${w} »)`);
    return w;
  });
  working = dedupWords;

  // 2. Apply orthography, accent, and elision rules
  for (const rule of ORTHO_RULES) {
    working = working.replace(rule.pattern, (matched, ...args) => {
      // Handle backreference templates like $1 cleanly
      const next = rule.replacement.includes('$1')
        ? matched.replace(rule.pattern, rule.replacement)
        : matchInitialCase(matched, rule.replacement);
      if (next !== matched) {
        pushChange(rule.label);
      }
      return next;
    });
  }

  // 3. Clean extra horizontal spaces
  const collapsed = working.replace(/[^\S\r\n]{2,}/g, ' ');
  if (collapsed !== working) {
    working = collapsed;
    pushChange('Espaces multiples nettoyés');
  }

  // 4. French punctuation spacing: no space before , . ; ensure clean space before : ? !
  const punctClean = working
    .replace(/\s+([.,])/g, '$1')
    .replace(/([.,])([^\s\d.,!?»)"'\n])/g, '$1 $2')
    .replace(/([^\s\n])([?!;:])/g, '$1 $2');
  if (punctClean !== working) {
    working = punctClean;
    pushChange('Espacement de ponctuation française');
  }

  // 5. Capitalize start of paragraphs, after . ? !, or after a leading [CUE] marker
  const capitalized = working.replace(
    /(^|(?:^__CUE_\d+__|[.!?])\s+|\n+)([a-zàâäéèêëïîôöùûüç])/g,
    (m, prefix, ch) => {
      const up = ch.toUpperCase();
      if (up !== ch) {
        pushChange('Majuscule en début de phrase');
      }
      return `${prefix}${up}`;
    }
  );
  working = capitalized;

  // 6. Ensure completed non-cue prose ends with punctuation
  const trimmedEnd = working.trimEnd();
  if (
    trimmedEnd.length > 12 &&
    !/[.!?…»)"']$/.test(trimmedEnd) &&
    !/__CUE_\d+__$/.test(trimmedEnd)
  ) {
    working = `${trimmedEnd}.`;
    pushChange('Point final ajouté en fin de pensée');
  }

  // Restore protected cues
  working = working.replace(/__CUE_(\d+)__/g, (_, idx) => cues[Number(idx)] ?? '');

  return {
    polished: working,
    changes,
    hasChanges: working !== raw,
  };
}

// ============================================================================
// Episode-Thread Repetition Detection & Oral Flow Readjustment
// ============================================================================

const FRENCH_STOPWORDS = new Set([
  'alors', 'ainsi', 'apres', 'assez', 'aussi', 'autre', 'autres', 'avant', 'avec', 'avoir',
  'beaucoup', 'bien', 'bon', 'car', 'ceci', 'cela', 'celle', 'celui', 'ces', 'cet', 'cette',
  'ceux', 'chaque', 'chez', 'comme', 'comment', 'dans', 'deja', 'depuis', 'des', 'deux',
  'donc', 'dont', 'du', 'elle', 'elles', 'encore', 'enfin', 'entre', 'est', 'etait', 'etre',
  'fait', 'faire', 'faut', 'fois', 'hors', 'ici', 'ils', 'jamais', 'juste', 'leur', 'leurs',
  'lors', 'mais', 'meme', 'memes', 'mes', 'moi', 'moins', 'mon', 'non', 'nos', 'notre', 'nous',
  'oui', 'par', 'parce', 'pas', 'pendant', 'peu', 'peut', 'plus', 'pour', 'pourquoi', 'quand',
  'que', 'quel', 'quelle', 'quelles', 'quels', 'qui', 'quoi', 'rien', 'sans', 'ses', 'seulement',
  'sont', 'sous', 'suis', 'sur', 'tandis', 'tant', 'tes', 'toi', 'ton', 'toujours', 'tous',
  'tout', 'toute', 'toutes', 'tres', 'trop', 'une', 'unes', 'uns', 'vers', 'voila', 'voir',
  'vos', 'votre', 'vous', 'vrai', 'vraiment', 'cetait', 'cest', 'nest', 'quil', 'quelle',
  'quon', 'jai', 'dun', 'dune', 'sil', 'et', 'ou', 'ni', 'ne', 'se', 'le', 'la', 'les', 'un',
  'de', 'du', 'en', 'au', 'aux', 'ce', 'sa', 'son', 'ma', 'ta', 'te', 'me', 'lui', 'y',
  'dit', 'dis', 'dire', 'etre', 'avoir', 'vais', 'vas', 'va', 'vont', 'sais', 'sait', 'savoir',
  'peux', 'peut', 'veut', 'veux', 'dois', 'doit', 'met', 'mets', 'mis', 'prend', 'prendre',
  'reste', 'donne', 'donner', 'suivi', 'pose', 'poser', 'regarde', 'regarder', 'attend',
  'sattend', 'attendu', 'attendue', 'monde', 'gens', 'chose', 'choses', 'moment', 'temps',
]);

// Light synonym / domain root folding so oral phrasing matches structured episode concepts
const ROOT_SYNONYMS: Record<string, string> = {
  emploi: 'travail',
  boulot: 'travail',
  metier: 'travail',
  bureau: 'travail',
  entreprise: 'travail',
  collegue: 'collegue',
  collegues: 'collegue',
  norme: 'regle',
  normes: 'regle',
  regles: 'regle',
  reglement: 'regle',
  script: 'programme',
  scripts: 'programme',
  code: 'programme',
  programmee: 'programme',
  programmes: 'programme',
  programmation: 'programme',
  automatisme: 'routine',
  automatismes: 'routine',
  habitude: 'routine',
  habitudes: 'routine',
  routines: 'routine',
  saluer: 'bonjour',
  salutation: 'bonjour',
  liberte: 'libre',
  libres: 'libre',
  arbitre: 'libre',
  choisir: 'choix',
  decider: 'choix',
  decision: 'choix',
  societe: 'social',
  sociale: 'social',
  sociaux: 'social',
  humain: 'humain',
  humaine: 'humain',
  ami: 'proche',
  femme: 'proche',
  famille: 'proche',
  fermier: 'fermier',
  paysan: 'fermier',
  boulanger: 'boulanger',
  postier: 'postier',
  facteur: 'postier',
  cordonnier: 'artisan',
  menuisier: 'artisan',
  pauvrete: 'classe',
  richesse: 'classe',
  injustice: 'justice',
  bavardage: 'discussion',
  parler: 'discussion',
  question: 'question',
  questions: 'question',
  reponse: 'reponse',
  reponses: 'reponse',
  repondre: 'reponse',
};

function normalizeToken(raw: string): string {
  const ascii = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^['’]+|['’]+$/g, '');
  if (!ascii || ascii.length < 3 || FRENCH_STOPWORDS.has(ascii)) {
    return '';
  }
  if (ROOT_SYNONYMS[ascii]) {
    return ROOT_SYNONYMS[ascii];
  }
  // Strip common plural / feminine / basic inflection suffix for fuzzy root matching
  let stem = ascii;
  if (stem.length > 5 && /(ement|ation|ments)$/.test(stem)) {
    stem = stem.slice(0, -4);
  } else if (stem.length > 4 && /(es|er|ir|ee|ie|is|it|nt|ux|ls)$/.test(stem)) {
    stem = stem.slice(0, -1);
  } else if (stem.length > 4 && stem.endsWith('s')) {
    stem = stem.slice(0, -1);
  }
  return ROOT_SYNONYMS[stem] ?? stem;
}

function extractSemanticTokens(text: string): { root: string; display: string }[] {
  const cleaned = text.replace(/\[[^\]]*\]/g, ' ');
  // Split French contractions like l', d', qu', n', c', s', t' so "l'emploi" -> "emploi"
  const rawWords = cleaned
    .replace(/\b(?:l|d|qu|n|c|s|t|j|m)['’]/gi, ' ')
    .split(/[^a-zàâäéèêëïîôöùûüç0-9]+/i);
  const seen = new Set<string>();
  const tokens: { root: string; display: string }[] = [];
  for (const w of rawWords) {
    const root = normalizeToken(w);
    if (!root || seen.has(root)) continue;
    seen.add(root);
    tokens.push({ root, display: w.toLowerCase() });
  }
  return tokens;
}

function splitIntoSentences(text: string): string[] {
  const cleaned = text.replace(/\[[^\]]*\]/g, ' ').trim();
  if (!cleaned) return [];
  return cleaned
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

function getActiveSentenceAtCursor(text: string, cursorPos?: number): string {
  const cleaned = text.trim();
  if (!cleaned) return '';
  if (typeof cursorPos === 'number' && cursorPos >= 0 && cursorPos <= text.length) {
    const before = text.slice(0, cursorPos);
    const after = text.slice(cursorPos);
    const startIdx = Math.max(
      before.lastIndexOf('.'),
      before.lastIndexOf('!'),
      before.lastIndexOf('?'),
      before.lastIndexOf('\n')
    );
    const endCandidates = [
      after.indexOf('.'),
      after.indexOf('!'),
      after.indexOf('?'),
      after.indexOf('\n'),
    ].filter((i) => i !== -1);
    const endOffset = endCandidates.length > 0 ? Math.min(...endCandidates) + 1 : after.length;
    const candidate = `${before.slice(startIdx + 1)}${after.slice(0, endOffset)}`
      .replace(/\[[^\]]*\]/g, ' ')
      .trim();
    if (candidate.length >= 10) return candidate;
  }
  const sentences = splitIntoSentences(text);
  return sentences[sentences.length - 1] ?? cleaned.replace(/\[[^\]]*\]/g, ' ').trim();
}

/**
 * Live keystroke repetition detector against all OTHER segments & notes in the same episode.
 * Returns discreet matches sorted by strongest conceptual overlap.
 */
export function detectEpisodeRepetitions(
  episode: Episode,
  activeSegmentId: string,
  draftText: string,
  cursorPos?: number
): EpisodeThreadMatch[] {
  const trimmed = draftText.trim();
  if (trimmed.length < 18) return [];

  // Build candidate sentences to test (prioritize cursor sentence first, then others)
  const activeSentence = getActiveSentenceAtCursor(draftText, cursorPos);
  const allSentences = splitIntoSentences(draftText);
  const candidates = activeSentence
    ? [activeSentence, ...allSentences.filter((s) => s !== activeSentence)]
    : allSentences;

  if (candidates.length === 0) return [];

  const matches: EpisodeThreadMatch[] = [];
  const seenSources = new Set<string>();

  for (const candidate of candidates) {
    // Lightly normalize candidate first so fast typing typos (lemploi, regle, collegue) still match cleanly
    const normalizedCandidate = polishFrenchThought(candidate).polished;
    const candTokens = extractSemanticTokens(normalizedCandidate);
    if (candTokens.length < 3) continue;
    const candRoots = new Set(candTokens.map((t) => t.root));

    // Check against every OTHER segment in the episode
    episode.segments.forEach((seg, idx) => {
      if (seg.id === activeSegmentId) return;
      const targetSentences = [
        ...splitIntoSentences(seg.scriptText),
        ...(seg.concreteExample.trim() ? [seg.concreteExample.trim()] : []),
      ];

      let bestSegScore = 0;
      let bestExcerpt = '';
      let bestShared: string[] = [];
      let bestRootCount = 0;
      let bestRatio = 0;

      for (const targetSent of targetSentences) {
        const targetTokens = extractSemanticTokens(targetSent);
        if (targetTokens.length < 3) continue;

        const sharedDisplays: string[] = [];
        const matchedRoots = new Set<string>();
        for (const tok of targetTokens) {
          if (candRoots.has(tok.root) && !matchedRoots.has(tok.root)) {
            matchedRoots.add(tok.root);
            sharedDisplays.push(tok.display);
          }
        }

        if (matchedRoots.size < 3) continue;

        const minLen = Math.min(candRoots.size, targetTokens.length);
        const ratio = matchedRoots.size / Math.max(1, minLen);
        const score = matchedRoots.size * 0.2 + ratio;

        if ((ratio >= 0.32 || matchedRoots.size >= 4) && score > bestSegScore) {
          bestSegScore = score;
          bestExcerpt = targetSent;
          bestShared = sharedDisplays.slice(0, 5);
          bestRootCount = matchedRoots.size;
          bestRatio = ratio;
        }
      }

      if (bestSegScore > 0 && !seenSources.has(`seg:${seg.id}`)) {
        seenSources.add(`seg:${seg.id}`);
        matches.push({
          sourceType: 'segment',
          segmentId: seg.id,
          segmentIndex: idx + 1,
          segmentTitle: seg.title,
          matchedExcerpt:
            bestExcerpt.length > 155 ? `${bestExcerpt.slice(0, 152).trim()}…` : bestExcerpt,
          currentSentence: candidate,
          sharedKeywords: bestShared,
          matchedRootCount: bestRootCount,
          overlapRatio: bestRatio,
          score: bestSegScore,
        });
      }
    });

    // Check against episode research notes
    for (const note of episode.notes) {
      if (note.segmentId === activeSegmentId) continue;
      const noteTokens = extractSemanticTokens(`${note.title} ${note.content}`);
      if (noteTokens.length < 3) continue;
      const shared: string[] = [];
      const matchedRoots = new Set<string>();
      for (const tok of noteTokens) {
        if (candRoots.has(tok.root) && !matchedRoots.has(tok.root)) {
          matchedRoots.add(tok.root);
          shared.push(tok.display);
        }
      }
      if (matchedRoots.size >= 4 && !seenSources.has(`note:${note.id}`)) {
        seenSources.add(`note:${note.id}`);
        const ratio = matchedRoots.size / Math.max(1, Math.min(candRoots.size, noteTokens.length));
        matches.push({
          sourceType: 'note',
          segmentTitle: `Note : ${note.title}`,
          matchedExcerpt:
            note.content.length > 155 ? `${note.content.slice(0, 152).trim()}…` : note.content,
          currentSentence: candidate,
          sharedKeywords: shared.slice(0, 5),
          matchedRootCount: matchedRoots.size,
          overlapRatio: ratio,
          score: matchedRoots.size * 0.22,
        });
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 3);
}

/**
 * Rewrites a repeated sentence into a crisp podcast thread callback so the host
 * refers back to the earlier exposition instead of repeating the full thought.
 */
export function rewriteRepeatedSentenceAsCallback(
  fullText: string,
  match: EpisodeThreadMatch
): string {
  const numLabel = match.segmentIndex
    ? `le segment ${String(match.segmentIndex).padStart(2, '0')} (« ${match.segmentTitle} »)`
    : `« ${match.segmentTitle} »`;
  const keywords = match.sharedKeywords.slice(0, 3).join(', ');
  const callbackSentence = keywords
    ? `Comme on l’a déjà posé dans ${numLabel} autour de ${keywords}, avançons d’un cran ici sans tout redire :`
    : `En écho direct à ${numLabel}, prolongeons l’idée d’un cran :`;

  const idx = fullText.indexOf(match.currentSentence);
  if (idx === -1) {
    return `${callbackSentence} ${fullText}`.trim();
  }
  const before = fullText.slice(0, idx).trimEnd();
  const after = fullText.slice(idx + match.currentSentence.length).trimStart();
  return [before, callbackSentence, after].filter(Boolean).join(' ');
}

export interface DraftConceptMatch {
  segmentId: string;
  segmentIndex: number; // 1-based display index
  segmentTitle: string;
  matchedConcepts: string[];
  matchedExcerpt: string;
  score: number;
}

export interface DraftConceptDetectionResult {
  detectedConcepts: string[];
  repeatedThoughts: DraftConceptMatch[];
}

const SIGNATURE_CONCEPT_PHRASES: { needle: string; label: string; rootHint?: string }[] = [
  { needle: 'coupe-papier', label: 'coupe-papier' },
  { needle: 'coupe papier', label: 'coupe-papier' },
  { needle: 'existence precede l essence', label: 'existence précède l’essence' },
  { needle: 'habitus', label: 'habitus' },
  { needle: 'pierre qui roule', label: 'pierre qui roule' },
  { needle: 'lunettes bleues', label: 'lunettes bleues' },
  { needle: 'regard de l autre', label: 'regard de l’autre' },
  { needle: 'metro du matin', label: 'métro du matin' },
  { needle: 'orientation scolaire', label: 'orientation scolaire' },
  { needle: 'personnage non-joueur', label: 'personnage non-joueur' },
  { needle: 'personnage non joueur', label: 'personnage non-joueur' },
  { needle: 'pnj', label: 'PNJ' },
  { needle: 'pilote automatique', label: 'pilote automatique' },
  { needle: 'bonjour ca va', label: 'bonjour, ça va ?' },
  { needle: 'libre arbitre', label: 'libre arbitre' },
  { needle: 'regle sociale', label: 'règle sociale' },
  { needle: 'regles sociales', label: 'règles sociales' },
  { needle: 'norme sociale', label: 'norme sociale' },
  { needle: 'normes sociales', label: 'normes sociales' },
  { needle: 'zone de confort', label: 'zone de confort' },
  { needle: 'prise de conscience', label: 'prise de conscience' },
  { needle: 'mode d emploi', label: 'mode d’emploi' },
  { needle: 'determinisme', label: 'déterminisme' },
  { needle: 'existentialisme', label: 'existentialisme' },
  { needle: 'stoicisme', label: 'stoïcisme' },
  { needle: 'mauvaise foi', label: 'mauvaise foi' },
  { needle: 'algorithme', label: 'algorithme' },
  { needle: 'lucidite', label: 'lucidité' },
];

const IGNORED_PROPER_NOUNS = new Set([
  'dans', 'pour', 'mais', 'quand', 'alors', 'cette', 'tout', 'tous', 'toute', 'toutes',
  'entre', 'comme', 'sauf', 'parce', 'meme', 'donc', 'mais', 'avec', 'sans', 'avant',
  'apres', 'pendant', 'depuis', 'voila', 'regarde', 'ferme', 'imagine', 'maintenant',
  'attention', 'extrait', 'sonore', 'pause', 'exemple', 'concret', 'philoa2balle',
  'bonjour', 'nickel', 'non', 'oui', 'naturellement', 'inconsciemment', 'concretement',
  'premier', 'premiere', 'deuxieme', 'segment', 'episode', 'chapitre', 'edition',
]);

function normalizeForPhraseSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectEpisodeProperAnchors(episode: Episode): { key: string; label: string }[] {
  const map = new Map<string, string>();
  const addCandidate = (raw: string) => {
    const clean = raw.trim().replace(/^[^\p{L}0-9]+|[^\p{L}0-9]+$/gu, '');
    if (clean.length < 3) return;
    const ascii = clean
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (ascii.length < 3 || IGNORED_PROPER_NOUNS.has(ascii) || FRENCH_STOPWORDS.has(ascii)) {
      return;
    }
    if (!map.has(ascii)) {
      map.set(ascii, clean);
    }
  };

  for (const src of episode.sources) {
    src.authorOrDirector.split(/[\s,/&()]+/).forEach(addCandidate);
  }
  const combinedSegments = episode.segments
    .map((s) => `${s.title} ${s.scriptText.replace(/\[[^\]]*\]/g, ' ')}`)
    .join(' ');
  const capMatches = combinedSegments.match(/\b[A-ZÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ][a-zàâäéèêëïîôöùûüç0-9-]{2,}\b/g) ?? [];
  for (const m of capMatches) {
    addCandidate(m);
  }

  return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
}

/**
 * Live key-concept detector for "Brouillon à côté" (both Script & Prompteur).
 * Extracts philosophical/narrative key concepts as the user types and surfaces
 * discreet links to segments where the idea or concept has already been exposed.
 */
export function detectDraftConceptMatches(
  episode: Episode,
  draftText: string
): DraftConceptDetectionResult {
  const trimmed = draftText.trim();
  if (trimmed.length < 4) {
    return { detectedConcepts: [], repeatedThoughts: [] };
  }

  const normalizedDraft = polishFrenchThought(trimmed).polished;
  const draftPhraseNorm = ` ${normalizeForPhraseSearch(normalizedDraft)} `;
  const draftTokens = extractSemanticTokens(normalizedDraft);
  const properAnchors = collectEpisodeProperAnchors(episode);

  // 1. Identify key concepts present in the user's draft
  const detectedConceptMap = new Map<string, string>();
  const addDetectedConcept = (label: string) => {
    const key = normalizeForPhraseSearch(label);
    if (key && !detectedConceptMap.has(key)) {
      detectedConceptMap.set(key, label);
    }
  };

  const DRAFT_META_WORDS = new Set([
    'reparler', 'ajouter', 'mentionner', 'evoquer', 'noter', 'ecrire', 'voudrais',
    'penser', 'mettre', 'modifier', 'reprendre', 'parler', 'montrer', 'expliquer',
    'raconter', 'illustrer', 'developper', 'preciser', 'souligner', 'rapprocher',
  ]);

  const matchedPhraseWordParts = new Set<string>();
  const matchedSignaturePhrases: { needle: string; label: string }[] = [];
  for (const sig of SIGNATURE_CONCEPT_PHRASES) {
    if (draftPhraseNorm.includes(` ${sig.needle} `)) {
      matchedSignaturePhrases.push(sig);
      addDetectedConcept(sig.label);
      for (const part of sig.needle.split(/[\s-]+/)) {
        if (part.length >= 3) matchedPhraseWordParts.add(part);
      }
    }
  }

  const matchedProperAnchors: { key: string; label: string }[] = [];
  for (const anchor of properAnchors) {
    if (draftPhraseNorm.includes(` ${anchor.key} `)) {
      matchedProperAnchors.push(anchor);
      addDetectedConcept(anchor.label);
    }
  }

  for (const tok of draftTokens) {
    if (detectedConceptMap.size >= 6) break;
    const asciiDisp = normalizeForPhraseSearch(tok.display);
    if (
      tok.display.length >= 4 &&
      !DRAFT_META_WORDS.has(asciiDisp) &&
      !matchedPhraseWordParts.has(asciiDisp)
    ) {
      addDetectedConcept(tok.display);
    }
  }

  // 2. Gather sentence-level repetition matches via existing detector
  const sentenceRepMap = new Map<string, EpisodeThreadMatch>();
  if (trimmed.length >= 18) {
    const repMatches = detectEpisodeRepetitions(episode, '', normalizedDraft);
    for (const m of repMatches) {
      if (m.segmentId && !sentenceRepMap.has(m.segmentId)) {
        sentenceRepMap.set(m.segmentId, m);
      }
    }
  }

  // 3. Score every segment for shared key concepts & repeated ideas
  const segmentMatches: DraftConceptMatch[] = [];

  episode.segments.forEach((seg, idx) => {
    const linkedSourcesText = episode.sources
      .filter((src) => seg.linkedSourceIds.includes(src.id))
      .map((src) => `${src.authorOrDirector} ${src.title} ${src.keyTakeaway}`)
      .join(' ');
    const segFullText = `${seg.title} ${seg.concreteExample} ${linkedSourcesText} ${seg.scriptText}`;
    const segPhraseNorm = ` ${normalizeForPhraseSearch(segFullText)} `;
    const segTokens = extractSemanticTokens(segFullText);
    const segRoots = new Set(segTokens.map((t) => t.root));

    const sharedConceptLabels: string[] = [];
    const pushConcept = (label: string, skipIfSubPart = false) => {
      const k = normalizeForPhraseSearch(label);
      if (!k || DRAFT_META_WORDS.has(k)) return;
      if (skipIfSubPart && matchedPhraseWordParts.has(k)) return;
      if (!sharedConceptLabels.some((existing) => normalizeForPhraseSearch(existing) === k)) {
        sharedConceptLabels.push(label);
      }
    };

    let sigHits = 0;
    for (const sig of matchedSignaturePhrases) {
      if (segPhraseNorm.includes(` ${sig.needle} `)) {
        sigHits += 1;
        pushConcept(sig.label);
      }
    }

    let anchorHits = 0;
    for (const anchor of matchedProperAnchors) {
      if (segPhraseNorm.includes(` ${anchor.key} `)) {
        anchorHits += 1;
        pushConcept(anchor.label);
      }
    }

    let rootHits = 0;
    for (const tok of draftTokens) {
      if (segRoots.has(tok.root)) {
        rootHits += 1;
        pushConcept(tok.display, true);
      }
    }

    const sentenceRep = sentenceRepMap.get(seg.id);
    if (sentenceRep) {
      for (const kw of sentenceRep.sharedKeywords) {
        pushConcept(kw, true);
      }
    }

    const totalConceptsMatched = sigHits + anchorHits + rootHits;
    const isRepeatedIdea =
      Boolean(sentenceRep) ||
      sigHits >= 1 ||
      (anchorHits >= 1 && rootHits >= 2) ||
      (draftTokens.length >= 2 && rootHits >= 2 && (anchorHits >= 1 || rootHits >= 3));

    if (!isRepeatedIdea || sharedConceptLabels.length === 0) return;

    // Pick the most illustrative excerpt from this segment
    let bestExcerpt = sentenceRep?.matchedExcerpt ?? '';
    if (!bestExcerpt) {
      const segSentences = splitIntoSentences(seg.scriptText);
      let bestSentScore = -1;
      for (const sent of segSentences) {
        const sNorm = ` ${normalizeForPhraseSearch(sent)} `;
        const sTokens = extractSemanticTokens(sent);
        const sRoots = new Set(sTokens.map((t) => t.root));
        let sScore = 0;
        for (const sig of matchedSignaturePhrases) {
          if (sNorm.includes(` ${sig.needle} `)) sScore += 3;
        }
        for (const anchor of matchedProperAnchors) {
          if (sNorm.includes(` ${anchor.key} `)) sScore += 2;
        }
        for (const tok of draftTokens) {
          if (sRoots.has(tok.root)) sScore += 1;
        }
        if (sScore > bestSentScore) {
          bestSentScore = sScore;
          bestExcerpt = sent;
        }
      }
      if (!bestExcerpt) {
        bestExcerpt = seg.concreteExample || seg.title;
      }
    }

    const score =
      sigHits * 3.5 +
      anchorHits * 2.2 +
      rootHits * 1.1 +
      (sentenceRep ? sentenceRep.score * 2 : 0) +
      totalConceptsMatched * 0.1;

    segmentMatches.push({
      segmentId: seg.id,
      segmentIndex: idx + 1,
      segmentTitle: seg.title,
      matchedConcepts: sharedConceptLabels.slice(0, 4),
      matchedExcerpt:
        bestExcerpt.length > 145 ? `${bestExcerpt.slice(0, 142).trim()}…` : bestExcerpt,
      score,
    });
  });

  segmentMatches.sort((a, b) => b.score - a.score);

  return {
    detectedConcepts: Array.from(detectedConceptMap.values()).slice(0, 6),
    repeatedThoughts: segmentMatches.slice(0, 3),
  };
}

function splitLongOralSentence(sentence: string): { parts: string[]; didSplit: boolean } {
  const trimmed = sentence.trim();
  if (!trimmed || trimmed.startsWith('[')) {
    return { parts: [trimmed], didSplit: false };
  }
  const words = trimmed.split(/\s+/);
  if (words.length < 22) {
    return { parts: [trimmed], didSplit: false };
  }

  // Natural French oral pivot connectors where breathing improves teleprompter delivery
  const pivots: { regex: RegExp; replacementPrefix: string }[] = [
    { regex: /\s*,?\s+mais\s+(?=comme|vu que|quand|si|dans|pour|tu|il|on|nous|le|la|un|une|ce|cette|ton|mon)/i, replacementPrefix: 'Mais ' },
    { regex: /\s*,?\s+et là,?\s+/i, replacementPrefix: 'Et là, ' },
    { regex: /\s*,?\s+et puis\s+/i, replacementPrefix: 'Et puis, ' },
    { regex: /\s*,?\s+parce que\s+(?=oui|dans|en|si|tu|il|on|nous|c'est|le|la)/i, replacementPrefix: 'Parce que ' },
    { regex: /\s*,?\s+donc\s+(?=je|tu|il|on|nous|c'est|le|la|si)/i, replacementPrefix: 'Donc ' },
    { regex: /\s*,?\s+alors que\s+/i, replacementPrefix: 'Alors que ' },
  ];

  for (const pivot of pivots) {
    const match = pivot.regex.exec(trimmed);
    if (!match || match.index === undefined) continue;
    const left = trimmed.slice(0, match.index).replace(/[,;\s]+$/, '').trim();
    const rightRaw = trimmed.slice(match.index + match[0].length).trim();
    const leftWords = left.split(/\s+/).length;
    const rightWords = rightRaw.split(/\s+/).length;
    if (leftWords >= 7 && rightWords >= 6) {
      const firstSentence = /[.!?…]$/.test(left) ? left : `${left}.`;
      const secondBody =
        rightRaw.length > 0
          ? `${pivot.replacementPrefix}${rightRaw[0].toLowerCase()}${rightRaw.slice(1)}`
          : '';
      // Recursively split if the second half is also very long
      const nested = splitLongOralSentence(secondBody);
      return { parts: [firstSentence, ...nested.parts], didSplit: true };
    }
  }

  return { parts: [trimmed], didSplit: false };
}

function tightenOralTransitions(text: string): { text: string; changes: string[] } {
  let working = text;
  const changes: string[] = [];
  const push = (label: string) => {
    if (!changes.includes(label)) changes.push(label);
  };

  // Refine heavy spoken filler chains while keeping authentic Le Précepteur tone
  const replacements: Rule[] = [
    {
      pattern: /\bmais vu que\b/gi,
      replacement: 'mais comme',
      label: 'Tournure orale affinée (« mais vu que » → « mais comme »)',
    },
    {
      pattern: /\bparce que oui,?\s*/gi,
      replacement: 'car oui, ',
      label: 'Enchaînement fluidifié (« parce que oui » → « car oui, »)',
    },
    {
      pattern: /(^|[.!?]\s+)et\s+(?=(?:tu|il|elle|on|là|nous|vous)\b)/gi,
      replacement: '$1',
      label: 'Suppression de « Et » redondant en ouverture de phrase',
    },
    {
      pattern: /\bdu coup,\s*/gi,
      replacement: 'Concrètement, ',
      label: 'Connecteur oral précisé (« du coup » → « Concrètement, »)',
    },
    {
      pattern: /\ben fait,\s*/gi,
      replacement: 'En réalité, ',
      label: 'Connecteur oral précisé (« en fait » → « En réalité, »)',
    },
    {
      pattern: /\bdes fois\b/gi,
      replacement: 'parfois',
      label: 'Tournure affinée (« des fois » → « parfois »)',
    },
  ];

  for (const r of replacements) {
    const next = working.replace(r.pattern, (m, ...args) => {
      if (r.replacement.includes('$1')) {
        return m.replace(r.pattern, r.replacement);
      }
      return matchInitialCase(m, r.replacement);
    });
    if (next !== working) {
      working = next;
      push(r.label);
    }
  }

  return { text: working, changes };
}

/**
 * Full episode-thread assistant:
 * 1. Corrects French spelling, accents, elisions, and oral contractions.
 * 2. Smooths oral connectors and splits overly long run-on blocks for teleprompter cadence.
 * 3. Detects and de-duplicates/re-frames ideas already exposed in other segments of the episode.
 */
export function adjustThoughtToEpisodeThread(
  rawText: string,
  episode: Episode,
  activeSegmentId: string
): EpisodeAdjustmentResult {
  const activeIdx = episode.segments.findIndex((s) => s.id === activeSegmentId);
  const prevSegment = activeIdx > 0 ? episode.segments[activeIdx - 1] : undefined;
  const nextSegment =
    activeIdx >= 0 && activeIdx < episode.segments.length - 1
      ? episode.segments[activeIdx + 1]
      : undefined;

  const threadStatus = prevSegment
    ? `Fil narratif : suite de « ${prevSegment.title} »${
        nextSegment ? ` → prépare « ${nextSegment.title} »` : ''
      }`
    : `Ouverture de l’épisode sur « ${episode.workTitle.split('(')[0].trim()} »`;

  if (!rawText.trim()) {
    return {
      adjusted: rawText,
      changes: [],
      hasChanges: false,
      repetitions: [],
      threadStatus,
    };
  }

  // Step 1: Orthography & basic punctuation
  const basePolish = polishFrenchThought(rawText);
  const allChanges = [...basePolish.changes];
  const pushChange = (label: string) => {
    if (!allChanges.includes(label)) allChanges.push(label);
  };

  // Step 2: Tighten oral connectors while preserving [CUES]
  const cues: string[] = [];
  let working = basePolish.polished.replace(/\[[^\]]+\]/g, (m) => {
    const token = `__CUE_${cues.length}__`;
    cues.push(m);
    return token;
  });

  const tightened = tightenOralTransitions(working);
  working = tightened.text;
  tightened.changes.forEach(pushChange);

  // Step 3: Split long run-on sentences into crisp spoken sentences per paragraph
  const paragraphs = working.split(/\n{2,}/);
  let didSplitAny = false;
  const restructuredParagraphs = paragraphs.map((para) => {
    const trimmedPara = para.trim();
    if (!trimmedPara) return trimmedPara;
    // Split sentences first
    const rawSentences = trimmedPara.split(/(?<=[.!?…])\s+/);
    const rebuilt: string[] = [];
    for (const s of rawSentences) {
      const { parts, didSplit } = splitLongOralSentence(s);
      if (didSplit) didSplitAny = true;
      rebuilt.push(...parts);
    }
    return rebuilt.join(' ');
  });

  if (didSplitAny) {
    working = restructuredParagraphs.join('\n\n');
    pushChange('Phrases longues découpées pour le souffle et le Prompteur');
  }

  // Restore cues
  working = working.replace(/__CUE_(\d+)__/g, (_, idx) => cues[Number(idx)] ?? '');

  // Re-run capitalization and final punctuation after splits/transitions
  const recapped = polishFrenchThought(working);
  working = recapped.polished;

  // Step 4: Cross-episode repetition check & smart thread callback rewriting
  const repetitions = detectEpisodeRepetitions(episode, activeSegmentId, working);
  if (repetitions.length > 0) {
    const topRep = repetitions[0];
    const currentSentences = splitIntoSentences(working);
    const isStrongExpositionRepeat =
      topRep.matchedRootCount >= 5 && topRep.overlapRatio >= 0.55 && currentSentences.length >= 2;
    if (
      topRep.segmentId &&
      topRep.currentSentence &&
      !topRep.currentSentence.toLowerCase().startsWith('comme on l') &&
      !topRep.currentSentence.toLowerCase().startsWith('en écho') &&
      isStrongExpositionRepeat
    ) {
      const rewritten = rewriteRepeatedSentenceAsCallback(working, topRep);
      if (rewritten !== working) {
        working = rewritten;
        const num = topRep.segmentIndex
          ? String(topRep.segmentIndex).padStart(2, '0')
          : 'précédent';
        pushChange(
          `Répétition évitée avec le segment ${num} (« ${topRep.segmentTitle} ») : passage transformé en rappel du fil`
        );
      }
    } else if (topRep.segmentId) {
      const num = topRep.segmentIndex
        ? String(topRep.segmentIndex).padStart(2, '0')
        : 'précédent';
      pushChange(
        `Écho détecté avec le segment ${num} (« ${topRep.segmentTitle} ») : pensez à relier ou alléger ce passage`
      );
    }
  }

  return {
    adjusted: working,
    changes: allChanges,
    hasChanges: working !== rawText,
    repetitions,
    threadStatus,
  };
}

export interface DraftPlacementPlan {
  targetSegmentId: string;
  targetSegmentIndex: number; // 1-based display index
  targetSegmentTitle: string;
  insertionMode: 'after_sentence' | 'end_of_paragraph' | 'append_segment';
  insertOffset: number;
  anchorExcerpt: string;
  matchedKeywords: string[];
  reasonLabel: string;
  polishedThought: string;
  confidence: number;
}

const ROLE_INTENT_HINTS: Record<SegmentRole, string[]> = {
  accroche: ['bonjour', 'matin', 'intro', 'ouverture', 'imagine', 'accroche', 'debut', 'reveil'],
  exemple: ['exemple', 'quotidien', 'travail', 'metro', 'boulanger', 'fermier', 'postier', 'menuisier', 'cordonnier', 'concret', 'situation', 'decor', 'routine'],
  concept: ['concept', 'philosophie', 'philosophe', 'definition', 'theorie', 'signifie', 'principe', 'these', 'essence', 'existence', 'habitus'],
  bascule: ['bascule', 'declic', 'rupture', 'lunettes', 'lunette', 'refrain', 'couplet', 'paroles', 'revelation', 'briser', 'entourage', 'reaction'],
  nuance: ['nuance', 'limite', 'paradoxe', 'pourtant', 'cependant', 'objection', 'critique', 'attention', 'piege', 'determinisme'],
  conclusion: ['conclusion', 'finir', 'retenir', 'defi', 'enfin', 'dernier', 'synthese', 'message'],
};

interface AnchoredSpan {
  text: string;
  startOffset: number;
  endOffset: number;
}

function locateAnchoredParagraphs(scriptText: string): {
  paragraphs: (AnchoredSpan & { isCueOnly: boolean; sentences: AnchoredSpan[] })[];
} {
  const paragraphs: (AnchoredSpan & { isCueOnly: boolean; sentences: AnchoredSpan[] })[] = [];
  const blockRegex = /[^\n]+(?:\n(?!\n)[^\n]+)*/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(scriptText)) !== null) {
    const rawBlock = blockMatch[0];
    const blockStart = blockMatch.index;
    const trimmed = rawBlock.trim();
    if (!trimmed) continue;

    const leadingWs = rawBlock.search(/\S/);
    const startOffset = blockStart + (leadingWs >= 0 ? leadingWs : 0);
    const endOffset = startOffset + trimmed.length;
    const isCueOnly = /^\[[^\]]+\]$/.test(trimmed);

    const sentences: AnchoredSpan[] = [];
    if (!isCueOnly) {
      const sentRegex = /[^.!?…\n]+[.!?…]+(?:»|["')]+)?|[^.!?…\n]+$/g;
      let sMatch: RegExpExecArray | null;
      while ((sMatch = sentRegex.exec(trimmed)) !== null) {
        const sRaw = sMatch[0];
        const sTrim = sRaw.trim();
        if (sTrim.length < 4 || /^\[[^\]]+\]$/.test(sTrim)) continue;
        const sLead = sRaw.search(/\S/);
        const sStart = startOffset + sMatch.index + (sLead >= 0 ? sLead : 0);
        const sEnd = sStart + sTrim.length;
        sentences.push({ text: sTrim, startOffset: sStart, endOffset: sEnd });
      }
    }

    paragraphs.push({
      text: trimmed,
      startOffset,
      endOffset,
      isCueOnly,
      sentences,
    });
  }

  return { paragraphs };
}

/**
 * Analyzes a spontaneous thought from "Brouillon à côté" and determines:
 * 1. Which segment of the episode handles that exact subject/theme/source/role.
 * 2. Where INSIDE that segment's script text it belongs (right after the matching sentence or paragraph,
 *    rather than blindly dumping at the top or bottom).
 */
export function planSmartDraftPlacement(
  episode: Episode,
  rawThought: string,
  forcedSegmentId?: string
): DraftPlacementPlan | null {
  const trimmed = rawThought.trim();
  if (!trimmed || episode.segments.length === 0) return null;

  const polishedThought = polishFrenchThought(trimmed).polished;
  const thoughtTokens = extractSemanticTokens(polishedThought);
  const thoughtRoots = new Set(thoughtTokens.map((t) => t.root));
  const rawAsciiLower = polishedThought
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const candidateSegments = forcedSegmentId
    ? episode.segments.filter((s) => s.id === forcedSegmentId)
    : episode.segments;
  const pool = candidateSegments.length > 0 ? candidateSegments : episode.segments;

  let bestSeg = pool[0];
  let bestSegIndex = episode.segments.findIndex((s) => s.id === pool[0].id);
  let bestScore = -1;
  let bestMatchedKeywords: string[] = [];
  let bestReason = '';

  for (const seg of pool) {
    const segIdx = episode.segments.findIndex((s) => s.id === seg.id);
    let segScore = 0;
    const matchedKeywords: string[] = [];
    const pushKw = (kw: string) => {
      if (kw && !matchedKeywords.includes(kw)) matchedKeywords.push(kw);
    };

    // 1. Segment title + concrete example overlap (strongest subject signal)
    const headerTokens = extractSemanticTokens(`${seg.title} ${seg.concreteExample}`);
    let headerHits = 0;
    for (const tok of headerTokens) {
      if (thoughtRoots.has(tok.root)) {
        headerHits += 1;
        segScore += 3.2;
        pushKw(tok.display);
      }
    }

    // 2. Linked sources overlap (e.g., Sartre, Bourdieu, Spinoza, Diam's...)
    const linkedSources = episode.sources.filter((src) => seg.linkedSourceIds.includes(src.id));
    let sourceHits = 0;
    for (const src of linkedSources) {
      const srcTokens = extractSemanticTokens(
        `${src.authorOrDirector} ${src.title} ${src.keyTakeaway}`
      );
      for (const tok of srcTokens) {
        if (thoughtRoots.has(tok.root)) {
          sourceHits += 1;
          segScore += 2.4;
          pushKw(tok.display);
        }
      }
    }

    // 3. Script body overlap (best sentence inside the segment)
    const { paragraphs } = locateAnchoredParagraphs(seg.scriptText);
    let bestInternalHits = 0;
    for (const para of paragraphs) {
      if (para.isCueOnly) continue;
      for (const sent of para.sentences) {
        const sTokens = extractSemanticTokens(sent.text);
        let hits = 0;
        for (const tok of sTokens) {
          if (thoughtRoots.has(tok.root)) {
            hits += 1;
            pushKw(tok.display);
          }
        }
        if (hits > bestInternalHits) bestInternalHits = hits;
      }
    }
    segScore += bestInternalHits * 2.2;

    // 4. Role intent bonus (e.g., "en conclusion", "nuance", "exemple", "lunettes", "déclic")
    const roleHints = ROLE_INTENT_HINTS[seg.role] ?? [];
    let roleHits = 0;
    for (const hint of roleHints) {
      if (rawAsciiLower.includes(hint)) {
        roleHits += 1;
        segScore += 1.5;
      }
    }

    // Slight tie-breaker preferring middle development segments over dumping blindly in Seg 01 when score === 0
    const tieBreaker = segIdx === 1 || segIdx === 2 ? 0.05 : 0;
    const totalScore = segScore + tieBreaker;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestSeg = seg;
      bestSegIndex = segIdx;
      bestMatchedKeywords = matchedKeywords.slice(0, 5);
      if (headerHits > 0 || bestInternalHits > 0) {
        bestReason = `Sujet relié au segment ${String(segIdx + 1).padStart(2, '0')} (${bestMatchedKeywords.join(', ')})`;
      } else if (sourceHits > 0) {
        bestReason = `Référence liée dans le segment ${String(segIdx + 1).padStart(2, '0')} (${bestMatchedKeywords.join(', ')})`;
      } else if (roleHits > 0) {
        bestReason = `Intention éditoriale adaptée au rôle « ${seg.role} »`;
      } else {
        bestReason = `Placé dans le développement principal (${String(segIdx + 1).padStart(2, '0')}. ${seg.title})`;
      }
    }
  }

  // Locate the exact internal insertion offset inside bestSeg.scriptText
  const { paragraphs } = locateAnchoredParagraphs(bestSeg.scriptText);
  const proseParagraphs = paragraphs.filter((p) => !p.isCueOnly);

  if (proseParagraphs.length === 0) {
    return {
      targetSegmentId: bestSeg.id,
      targetSegmentIndex: bestSegIndex + 1,
      targetSegmentTitle: bestSeg.title,
      insertionMode: 'append_segment',
      insertOffset: bestSeg.scriptText.length,
      anchorExcerpt: bestSeg.concreteExample || bestSeg.title,
      matchedKeywords: bestMatchedKeywords,
      reasonLabel: bestReason,
      polishedThought,
      confidence: Math.max(0, bestScore),
    };
  }

  let bestSent: AnchoredSpan | null = null;
  let bestSentScore = 0;

  for (const para of proseParagraphs) {
    for (const sent of para.sentences) {
      const sTokens = extractSemanticTokens(sent.text);
      let score = 0;
      for (const tok of sTokens) {
        if (thoughtRoots.has(tok.root)) {
          score += 2;
        }
      }
      if (score > bestSentScore) {
        bestSentScore = score;
        bestSent = sent;
      }
    }
  }

  if (bestSent && bestSentScore > 0) {
    const excerpt =
      bestSent.text.length > 130 ? `${bestSent.text.slice(0, 127).trim()}…` : bestSent.text;
    return {
      targetSegmentId: bestSeg.id,
      targetSegmentIndex: bestSegIndex + 1,
      targetSegmentTitle: bestSeg.title,
      insertionMode: 'after_sentence',
      insertOffset: bestSent.endOffset,
      anchorExcerpt: excerpt,
      matchedKeywords: bestMatchedKeywords,
      reasonLabel: bestReason,
      polishedThought,
      confidence: bestScore,
    };
  }

  // Fallback to paragraph level if title/source matched but not a single sentence
  let bestPara = proseParagraphs[0];
  let bestParaScore = -1;
  for (const para of proseParagraphs) {
    const pTokens = extractSemanticTokens(para.text);
    let pScore = 0;
    for (const tok of pTokens) {
      if (thoughtRoots.has(tok.root)) pScore += 1;
    }
    if (pScore > bestParaScore) {
      bestParaScore = pScore;
      bestPara = para;
    }
  }

  const excerpt =
    bestPara.text.length > 130 ? `${bestPara.text.slice(0, 127).trim()}…` : bestPara.text;

  return {
    targetSegmentId: bestSeg.id,
    targetSegmentIndex: bestSegIndex + 1,
    targetSegmentTitle: bestSeg.title,
    insertionMode: 'end_of_paragraph',
    insertOffset: bestPara.endOffset,
    anchorExcerpt: excerpt,
    matchedKeywords: bestMatchedKeywords,
    reasonLabel: bestReason,
    polishedThought,
    confidence: Math.max(0, bestScore),
  };
}

const ROLE_GUIDANCE: Record<SegmentRole, string[]> = {
  accroche: [
    'Quelle scène banale de la vie sociale fait sourire ou réagir dès les 15 premières secondes ?',
    'Est-ce que le lien avec le film arrive naturellement sans tout dévoiler ?',
  ],
  concept: [
    'Comment expliquer ce concept à un ami dans un café, sans jargon universitaire ?',
    'Quelle image concrète remplace une définition abstraite ?',
  ],
  exemple: [
    'Quel détail sensoriel rend cette situation vécue immédiatement reconnaissable ?',
    'En quoi cet exemple éclaire-t-il directement le choix du personnage ?',
  ],
  bascule: [
    'Quel geste précis du personnage marque la rupture avec son ancienne routine ?',
    'Comment réagit l’entourage quand on sort du script attendu ?',
  ],
  nuance: [
    'Quelle objection honnête un auditeur pourrait-il opposer ici ?',
    'Où s’arrête la liberté individuelle face aux contraintes sociales ou matérielles ?',
  ],
  conclusion: [
    'Quelle question simple ou quel petit défi concret l’auditeur peut-il garder après l’écoute ?',
    'La phrase finale laisse-t-elle une respiration pour la musique de fin ?',
  ],
};

export function analyzeSegmentThought(segment: NarrativeSegment): ThoughtGuidance {
  const words = segment.scriptText.replace(/\[[^\]]*\]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  const hasExample = segment.concreteExample.trim().length > 10;
  const hasCue = /\[(EXTRAIT|PAUSE|EXEMPLE)/i.test(segment.scriptText) || Boolean(segment.soundCueId);

  let missingHint: string | null = null;
  if (words < 20) {
    missingHint = 'Ébauche courte : développez votre pensée en 2 ou 3 phrases parlées.';
  } else if (!hasExample) {
    missingHint = 'Ajoutez un exemple concret de la vie sociale pour ancrer le propos.';
  } else if (!hasCue) {
    missingHint = 'Pensez à placer une [PAUSE 2s] ou un extrait sonore pour laisser respirer la voix.';
  }

  const readinessLabel =
    words >= 45 && hasExample
      ? 'Pensée structurée et prête à lire'
      : words >= 20
        ? 'Idée en cours de construction'
        : 'Première étincelle';

  return {
    readinessLabel,
    guidingQuestions: ROLE_GUIDANCE[segment.role] ?? ROLE_GUIDANCE.concept,
    missingHint,
  };
}

