import type { Episode } from '../../types/podcast';

export const EPISODE_21_MORALE_TROTTOIR: Episode = {
  id: 'ep-21-morale-trottoir',
  number: '21',
  category: 'cinema_serie',
  title: 'Morale de trottoir : Pourquoi un extraterrestre est plus poli que toi — La morale, le naturel et la société',
  workTitle: 'Morale de trottoir · Resident Alien (Chris Sheridan) & Le Contrat social',
  philosophicalTheme:
    'Morale de trottoir, état de nature, contrat social et socialisation (Thomas Hobbes, Jean-Jacques Rousseau & Norbert Elias)',
  logline:
    'Seul au milieu d’une forêt immense, personne ne juge tes gestes ; dès que tu poses le pied sur un trottoir en ville, tout devient permis ou interdit. À travers Harry Vanderspeigle dans Resident Alien, on explore avec Hobbes, Rousseau et Elias pourquoi la morale est un outil de survie collective plutôt qu’une boussole innée.',
  targetMinutes: 33,
  draftThoughts:
    'Épisode issu du brouillon « Morale de trottoir » : 1) Contraste forêt isolée vs trottoir urbain ; 2) L’E.T. débarque (Harry Vanderspeigle dans Resident Alien, « sac de viande », émotions vues comme bruits parasites, franchise brute de sa forêt cosmique) ; 3) Saut philosophique avec Hobbes (l’homme est un loup pour l’homme, contrat social) et Rousseau (état de nature neutre, survie et pitié naturelle) ; 4) Ce que Harry révèle sur nous : des « extraterrestres socialisés » qui oublient que la politesse est culturelle, puis la naissance de l’empathie comme ciment invisible ; 5) Pour aller plus loin : le « bonjour » à la boulangerie, le gamin qui crie dans un magasin, et la question finale : quelle règle expliquer en premier à un visiteur galactique ?',
  status: 'en_preparation',
  updatedAt: '2026-11-15',
  sources: [
    {
      id: 'src-mt-resident-alien',
      title: 'Resident Alien — Saison 1 & intégrale (Harry Vanderspeigle à Patience)',
      authorOrDirector: 'Chris Sheridan (avec Alan Tudyk)',
      year: '2021',
      kind: 'film_serie',
      referenceLocation: 'Saison 1 · Arrivée au Colorado, observation clinique et apprentissage des codes',
      keyTakeaway:
        'Un être purement utilitaire découvre que nos interdits ordinaires et nos politesses tiennent la vie commune debout.',
      status: 'verifiee',
    },
    {
      id: 'src-mt-hobbes',
      title: 'Léviathan (Chapitre XIII : De la condition naturelle des hommes)',
      authorOrDirector: 'Thomas Hobbes',
      year: '1651',
      kind: 'philosophie',
      referenceLocation: 'État de nature, crainte réciproque et naissance du pacte commun',
      keyTakeaway:
        'Sans règle partagée sur un même territoire, la liberté brute de chacun déclenche la défiance de tous contre tous.',
      status: 'verifiee',
    },
    {
      id: 'src-mt-rousseau',
      title: 'Discours sur l’origine et les fondements de l’inégalité / Du contrat social',
      authorOrDirector: 'Jean-Jacques Rousseau',
      year: '1755',
      kind: 'philosophie',
      referenceLocation: 'L’état de nature neutre (conservation & pitié) puis le passage à l’état civil',
      keyTakeaway:
        'Avant la vie en groupe, l’humain n’est ni vertueux ni vicieux : la moralité apparaît uniquement quand nos actes touchent autrui.',
      status: 'verifiee',
    },
    {
      id: 'src-mt-elias',
      title: 'La Civilisation des mœurs',
      authorOrDirector: 'Norbert Elias',
      year: '1939',
      kind: 'sociologie',
      referenceLocation: 'Histoire de la pudeur, de la table et de l’autocontrainte silencieuse',
      keyTakeaway:
        'Ce que nous croyons spontané ou naturel résulte de siècles d’apprentissage collectif lentement enfoui dans nos réflexes.',
      status: 'a_relire',
    },
  ],
  notes: [
    {
      id: 'note-mt-1',
      title: 'Forêt cosmique & sac de viande',
      content:
        'Dans le segment 2, garder la formule crue de Harry sur le corps comme sac de viande et son franc-parler dénué de filtre.',
      segmentId: 'mt-seg-2',
      createdAt: '2026-11-15',
    },
    {
      id: 'note-mt-2',
      title: 'ADN vs outil de cohabitation',
      content:
        'Insister au cœur du segment 3 sur le renversement clé : nos règles morales ne flottent pas dans notre biologie, elles naissent pour cohabiter sans s’étriper.',
      segmentId: 'mt-seg-3',
      createdAt: '2026-11-15',
    },
    {
      id: 'note-mt-3',
      title: 'Question finale auditeur (boulangerie)',
      content:
        'Terminer le dernier segment avec le cri dans le magasin, le bonjour chez le boulanger et la question : par quoi tu commencerais ?',
      segmentId: 'mt-seg-6',
      createdAt: '2026-11-15',
    },
  ],
  segments: [
    {
      id: 'mt-seg-1',
      title: 'Accroche : Seul au fond des bois vs le drame du bitume urbain',
      role: 'accroche',
      status: 'brouillon',
      estimatedWpm: 136,
      targetDurationSec: 340,
      soundCueId: 'cue_reveil_routine',
      linkedSourceIds: ['src-mt-resident-alien'],
      concreteExample:
        'Marcher nu sous les sapins à dix kilomètres de toute maison sans éprouver la moindre gêne, puis sentir instantanément l’interdit dès qu’un feu piéton passe au vert en centre-ville.',
      scriptText:
        '[EXTRAIT SONORE : Réveil 7h00 & Routine métro]\n\nBienvenue dans ce nouvel épisode. Installe-toi confortablement.\n\nImagine une seconde que tu te réveilles ce matin dans un endroit où aucun regard ne peut t’atteindre. Tu es seul, complètement seul, au milieu d’une forêt immense. Pas un village, pas un randonneur, pas un chat à dix kilomètres à la ronde. Juste les grands pins, l’odeur d’humus mouillé et le vent dans les branches.\n\nPose-toi honnêtement cette petite expérience de pensée : là-bas, perdu entre deux clairières, est-ce que tu te demandes si tu dois enfiler un pantalon propre avant d’allumer un feu de bois ? Est-ce que tu vérifies s’il est bien ou mal de pousser un cri de toute la force de tes poumons pour tester l’écho, de marcher nu-pieds — ou même complètement nu — dans la boue tiède du sentier, ou de satisfaire un besoin biologique pressant directement contre l’écorce d’un vieux chêne ?\n\nNon. Évidemment que non ! La question de la pudeur ou de la décence ne traverse même pas ton esprit une fraction de seconde. Pas parce que tu serais devenu soudain un sauvage pervers, ni parce que tu aurais jeté ta conscience aux orties. Tout simplement parce qu’il n’y a personne en face de toi pour observer, pour juger, pour être incommodé ou blessé. Dans cette solitude totale, tes gestes ne sont ni vertueux ni coupables : ils sont purement fonctionnels, comme ceux d’un renard qui cherche de l’eau ou d’un oiseau qui secoue ses plumes après l’averse.\n\n[PAUSE 2s]\n\nMaintenant, fais un saut instantané de quelques heures. Te voilà de retour en ville, un mardi ordinaire à neuf heures moins le quart. Tu ouvres la porte de ton immeuble, tu poses tes semelles sur les dalles grises de la rue, au bord de la chaussée animée où passent des mères avec leurs poussettes, des retraités qui portent le journal et des passants pressés vers le tramway.\n\nSuppose maintenant que l’idée saugrenue de répéter exactement les mêmes actes qu’au fond de tes bois te traverse soudain la tête. Là, c’est immédiatement le séisme ! En une milliseconde, tout ton corps saisit que c’est radicalement exclu. Ce qui n’était hier soir qu’une simple respiration physiologique devient sur-le-champ un scandale public, un trouble à l’ordre, un délit verbalisé, une conduite jugée obscène et profondément répréhensible.\n\nPourquoi un geste identique change-t-il ainsi de nature selon l’endroit où tes pieds sont posés ? Le ciel n’a pourtant pas bougé, ton corps reste composé des mêmes cellules, et ton besoin demeure identique. Ce qui a basculé du tout au tout entre la mousse sylvestre et la bordure de béton, c’est la présence de l’autre. Dès qu’un espace réunit plusieurs existences qui se frôlent, l’air entre nous se charge de règles invisibles.\n\nPense même à ces micro-frontières que nous franchissons chaque matin sans prononcer un mot : dans ta salle de bains fermée à clé, tu chantes faux à tue-tête, tu te grattes le dos sans élégance, tu mâches la bouche ouverte devant ton bol. Dès que ton pied passe le seuil du palier et que tu entends le cliquetis de l’ascenseur du voisin, ta posture entière se verrouille ! Tes épaules se redressent, ton souffle baisse d’un octave, tes mains cherchent une contenance calme dans tes poches. En moins de deux mètres carrés entre ton tapis d’entrée et la cage d’escalier, tu viens de quitter l’état brut pour revêtir ton uniforme invisible de citoyen fréquentable.\n\nNous avons tous intériorisé cette bascule silencieuse au point de ne plus jamais la remarquer. Si un inconnu traverse l’allée en peignoir ouvert, s’il crache au milieu du passage ou s’il s’assoit beaucoup trop près sur un banc pourtant désert, une alarme intérieure sonne aussitôt chez nous : « Mais enfin, ça ne se fait pas ! » Pourtant, qui a gravé ce « ça ne se fait pas » sur le bitume ? Est-ce une loi physique comparable à la gravité, ou un pacte fragile que nous reconduisons chaque matin sans lire les petites lignes ?\n\nC’est précisément ce point de départ génial qui rend si savoureuse la série Resident Alien : observer un voyageur venu d’ailleurs qui débarque sur notre pavé avec les réflexes bruts de sa solitude d’origine. Aujourd’hui, nous allons décortiquer ensemble ce que j’appelle la « morale de trottoir » : comment distingue-t-on le naturel du conventionnel, pourquoi un extraterrestre nous paraît parfois plus franc — ou plus courtois à sa façon — que nos contemporains, et d’où sort vraiment cette frontière entre le permis et l’interdit quand on vit côte à côte. Prépare ton verre d’eau ou ton café, on prend le temps de dérouler le fil tranquillement dans PHILOA2BALLES.',
    },
    {
      id: 'mt-seg-2',
      title: 'L’E.T. débarque : Harry Vanderspeigle et la franchise brute hors société',
      role: 'exemple',
      status: 'brouillon',
      estimatedWpm: 136,
      targetDurationSec: 360,
      soundCueId: 'cue_cafe_social',
      linkedSourceIds: ['src-mt-resident-alien'],
      concreteExample:
        'Un médecin fraîchement débarqué de l’espace annonce froidement à un patient ou à ses collègues une vérité crue sur la mort ou la vanité, déclenchant un malaise glacé dans la salle d’attente.',
      scriptText:
        'Pour ceux qui n’ont pas encore croisé la série créée par Chris Sheridan, le point de départ tient en une phrase aussi absurde que brillante : une créature venue d’une autre galaxie s’écrase dans les Rocheuses avec une mission secrète d’extermination de notre planète. Contraint d’attendre les réparations de son appareil, ce visiteur usurpe l’identité d’un médecin solitaire installé au bord d’un lac gelé dans la petite bourgade de Patience, au Colorado : Harry Vanderspeigle.\n\nSauf que pour éviter de finir sur une table d’autopsie gouvernementale, notre imposteur n’a pas le choix : il doit sortir de sa cabane isolée, ouvrir le cabinet médical, discuter au bar du coin et regarder les habitants droit dans les yeux. Et c’est précisément à cette minute que l’expérience philosophique commence à briller sous le vernis de la comédie.\n\nHarry débarque avec sa propre logique interstellaire : une rationalité clinique, sèche, strictement utilitaire. À ses yeux, notre enveloppe charnelle n’est qu’un fragile « sac de viande » bourré d’eau tiède, nos élans affectifs ressemblent à des bruits parasites qui brouillent la clarté du jugement, et les courbettes de la bienséance terrestre lui paraissent d’une extravagance incompréhensible.\n\n[EXTRAIT SONORE : Brouhaha café & Small Talk]\n\nAu début de son séjour, il ne pige absolument rien aux petits mensonges par omission qui huilent nos journées, aux codes vestimentaires absurdes, ni à cette manière très humaine de tourner quinze minutes autour du pot plutôt que d’énoncer un fait désagréable. Pense à ces scènes jubilatoires où il ausculte un habitant inquiet et répond sans détour ni sucre ajouté ce que lui dicte son cerveau de clinicien pur, ou bien lorsqu’il commente la laideur d’un nouveau-né ou la médiocrité d’une soirée avec l’aplomb tranquille d’un biologiste notant la couleur d’un caillou.\n\nToute la pièce se fige. Les sourires se crispent autour des tasses. On échange des coups d’œil gênés parce qu’il vient de faire voler en éclats le théâtre poli de la salle commune. Pourquoi cette franchise désarmante met-elle tout le village aussi mal à l’aise ? Parce que cet étranger nous tend un miroir impitoyable : il s’exprime et agit dans les rues de Patience comme s’il se trouvait encore dans sa « forêt cosmique », totalement indifférent aux convenances du bitume civilisé.\n\nRegarde aussi comment il réagit devant nos rituels de deuil, d’amour ou d’ambition professionnelle. Lorsqu’un habitant vient chercher du réconfort moral après une rupture ou une défaite, notre faux docteur examine le cas comme un problème d’hydraulique défaillante : « Tu es triste parce que ton cerveau réclame une dose chimique d’attachement, va boire un verre d’eau et passe à un autre spécimen ! » Aux oreilles des terriens présents, cette phrase sonne comme une gifle glacée. Aux oreilles de Harry, il formule au contraire un constat limpide et presque secourable !\n\nPense même à son rapport au vêtement, à la nourriture ou à la pudeur physique : s’il ne se couvrait pas pour ne pas éveiller les soupçons du shérif, il ne verrait aucun sens à s’encombrer d’une chemise boutonnée jusqu’au col ni à retenir ses gestes autour d’une table. Quand on lui explique qu’il faut féliciter poliment un voisin pour une performance pourtant médiocre, son regard traduit une stupeur sincère : pourquoi encourager l’erreur avec des syllabes fausses ?\n\nEt voilà le paradoxe piquant que met en scène Alan Tudyk : par certains côtés, ce visiteur brut paraît presque plus propre moralement que les humains rusés qui l’entourent, car il ignore l’hypocrisie, la médisance souriante et les coups tordus en coulisses. Son impolitesse n’est pas animée par la malice : elle vient de son ignorance complète de notre théâtre urbain. Il ne sait pas encore qu’ici-bas, vivre ensemble oblige sans cesse à envelopper la crudité du vrai dans du papier de soie pour ne pas écorcher son vis-à-vis au coin de chaque couloir.',
    },
    {
      id: 'mt-seg-3',
      title: 'Le saut philosophique : Hobbes, Rousseau et l’invention du bien et du mal',
      role: 'concept',
      status: 'brouillon',
      estimatedWpm: 135,
      targetDurationSec: 400,
      soundCueId: 'cue_nappe_precepteur',
      linkedSourceIds: ['src-mt-hobbes', 'src-mt-rousseau'],
      concreteExample:
        'Deux inconnus qui veulent cueillir les dernières baies sur la même branche isolée contre deux cents habitants qui doivent partager une seule rue, une file d’attente et un point d’eau.',
      scriptText:
        'Ce décalage comique entre l’arrivant brutal venu d’ailleurs et les notables susceptibles du Colorado rejoint directement l’une des interrogations les plus vertigineuses de la pensée occidentale. Bien avant l’invention de la télévision, deux géants du dix-septième et du dix-huitième siècle ont passé leur vie à démonter ce mécanisme : Thomas Hobbes et Jean-Jacques Rousseau.\n\nRemontons d’abord avec eux par la pensée jusqu’à cette hypothèse fameuse qu’on appelle « l’état de nature ». Attention : ni Hobbes en 1651 dans le Léviathan, ni Rousseau un siècle plus tard dans son Discours sur l’inégalité ne racontent un simple conte préhistorique avec des massues en silex. Ils proposent une expérience mentale radicale : enlève par la pensée les tribunaux, la police municipale, les écoles, les clôtures, les registres d’état civil et les regards de quartier. Que reste-t-il de nous ?\n\n[EXTRAIT SONORE : Nappe contemplative grave]\n\nChez Rousseau, l’individu isolé de cette condition première n’est ni un ange saint ni un démon cruel. Il est tout simplement neutre sur le plan moral ! Ses actes obéissent à deux ressorts très simples : l’amour de soi — c’est-à-dire l’instinct paisible de préserver sa vie, de manger quand le ventre crie et de dormir à l’abri — et une répugnance instinctive devant la souffrance criante d’un autre être sensible, qu’il nomme la pitié naturelle. Mais dans ce face-à-face solitaire avec les arbres, personne ne connaît la notion de faute, de mérite, d’insolence ou de convenance, parce qu’il n’existe aucune loi commune ni aucun tribunal social pour distribuer les bons et les mauvais points.\n\nMaintenant, rapproche les corps sur un même territoire. Fais naître les campements, les hameaux, les marchés, puis les grands boulevards serrés où chacun convoite la même place au soleil, le même abri sec et la même reconnaissance. Là, la donne bascule de fond en comble.\n\nC’est exactement l’avertissement sombre et lucide que lance Thomas Hobbes : livrés à la seule loi de la jungle au milieu de la foule, sans arbitre ni pacte, les humains se méfient immédiatement les uns des autres. Si mon voisin peut s’emparer de ma réserve demain matin par crainte que je ne prenne la sienne ce soir, la peur réciproque déclenche une guerre permanente de chacun contre chacun ! Voilà le sens réel de la célèbre formule reprise par Hobbes : « L’homme est un loup pour l’homme. » Non pas parce que notre cœur serait irrémédiablement pourri, mais parce que l’absence de garantie commune rend la méfiance plus rationnelle que l’ouverture.\n\n[PAUSE 2s]\n\nComment sort-on alors de cet enfer où personne ne dort sur ses deux oreilles ? Par une invention prodigieuse que nos deux penseurs placent au fondement de toute vie civile : le contrat social.\n\nPour éviter de nous entretuer au moindre désaccord sur un passage étroit ou sur une récolte, nous acceptons collectivement de brider une partie de nos impulsions immédiates. Chacun renonce au droit de tout faire sans limites, à condition que le voisin s’impose exactement la même retenue. On s’engage à couvrir son corps dans la rue, à respecter le rang dans une file d’attente, à ne pas soulager sa vessie devant la porte d’entrée d’autrui, à modérer sa voix la nuit et à polir ses mots pour ne pas allumer une rixe à chaque carrefour.\n\nPrends une seconde pour mesurer la révolution intellectuelle contenue dans cette idée : personne n’invente la civilité par goût abstrait de la géométrie ! Elle naît d’une négociation vitale dès que nos coudes se touchent. Suppose dix mille naufragés jetés sur une île minuscule avec une seule source d’eau douce : le premier jour, chacun veut puiser sans attendre ; le troisième jour, tout le monde comprend que sans tour de rôle respecté, personne ne boira sans recevoir un coup sur la tête. L’interdit surgit exactement à l’endroit où mon désir rencontre ton espace fragile.\n\nRegarde la conséquence immense de ce retournement pour notre propre existence : la morale n’est pas une boussole magique qui flotterait de toute éternité dans nos gènes ou dans la moindre parcelle de notre ADN ! Elle n’est pas tombée toute prête du plafond. C’est d’abord un formidable outil de survie collective. On la forge patiemment parce que nous sommes trop nombreux à partager le même arpent de bitume et la même cage d’escalier.\n\nRetiens cette boussole limpide pour éclairer mille débats stériles : tant que tu erres complètement coupé du monde, tu n’as pas besoin d’être moral ; tu as juste besoin de rester vivant. À la seconde exacte où tu croises la silhouette de ton prochain sur le chemin, tes gestes produisent un effet concret sur sa sécurité, sa tranquillité ou sa dignité — et tu entres aussitôt dans la sphère morale.',
    },
    {
      id: 'mt-seg-4',
      title: 'Bascule : Nous sommes tous des extraterrestres socialisés (Elias & l’empathie)',
      role: 'bascule',
      status: 'brouillon',
      estimatedWpm: 136,
      targetDurationSec: 360,
      soundCueId: 'cue_declic_lunettes',
      linkedSourceIds: ['src-mt-elias', 'src-mt-resident-alien'],
      concreteExample:
        'Dire machinalement « pardon » quand quelqu’un d’autre vous bouscule dans le métro ou retenir une remarque blessante lors d’un repas tendu, puis réaliser combien ces réflexes ont été patiemment fabriqués.',
      scriptText:
        'Voici l’instant où la perspective se renverse complètement, et c’est là que la série comique touche au génie anthropologique : en riant des gaffes monumentales du faux médecin du Colorado, nous finissons par découvrir que nous sommes tous, chacun à notre manière, des extraterrestres socialisés.\n\nNous avons si profondément avalé ces codes dès nos trois ans — « Tiens-toi droit ! Ne montre pas du doigt ! Mets la main devant ta bouche ! Ne prends pas le dernier gâteau sans demander ! » — que nous avons fini par oublier la date de leur fabrication. À trente ou quarante ans, nous jurons la main sur le cœur qu’attendre son tour au guichet, baisser la voix dans un wagon silencieux ou murmurer « excusez-moi » quand quelqu’un vient de nous marcher sur le pied découle d’un élan purement « naturel ».\n\nEh bien non ! Le grand sociologue Norbert Elias l’a démontré dans un livre passionnant paru en 1939, La Civilisation des mœurs, en fouillant les manuels de savoir-vivre du Moyen Âge et de la Renaissance. Pendant des siècles, se moucher dans la nappe, cracher sous la table ou manger avec les doigts dans le plat collectif ne choquait strictement personne à la cour des rois ! Ce sont des siècles lents de densité urbaine, de promiscuité accrue et de crainte du dégoût mutuel qui ont dressé peu à peu nos seuils de pudeur et d’autocontrainte. Ce que tu crois spontané n’est donc pas inscrit dans la pierre biologique : c’est artificiel, culturel, fruit d’innombrables compromis pour cohabiter sans nous déchirer.\n\nRegarde même à quelle vitesse ces apprentissages anciens gouvernent encore notre moindre frisson de gêne : essaie une seule fois de rester silencieux cinq secondes de trop pendant un appel téléphonique, ou de manger une pizza avec une pince à épiler devant tes beaux-parents. Rien de dangereux ne se produit, pourtant tes joues chauffent ! Ce rouge aux joues, c’est la signature vivante du long dressage collectif qui veille silencieusement en nous.\n\n[EXTRAIT SONORE : Déclic prise de conscience]\n\nPourtant, si l’histoire s’arrêtait là, la moralité ne serait qu’un vernis de police extérieure — une peur froide de l’amende ou du ridicule. Or regarde ce qui arrive à Harry au fil des saisons dès qu’il s’attache malgré lui à ses compagnons humains ! Il ne reste pas un comédien cynique qui récite des formules de politesse pour sauver sa couverture. Quelque chose de beaucoup plus profond s’éveille sous sa peau d’emprunt.\n\nBon gré mal gré, au contact de la peine discrète de son assistante, des maladresses d’un gamin qui connaît son secret ou des fragilités de la ville, il commence à intégrer de vraies bribes d’empathie. Il saisit peu à peu pourquoi l’on retient parfois une vérité sèche qui écraserait gratuitement un ami fragile ; pourquoi l’on se lève la nuit pour protéger les gens qu’on aime ; pourquoi l’on ne réduit plus le voisin à un simple obstacle mécanique sur sa route.\n\nC’est exactement ce passage décisif qui achève sa métamorphose : il franchit la frontière qui sépare une créature isolée, obsédée par sa seule survie technique, d’un véritable être social relié aux autres. Il découvre à ses dépens que la morale authentique ne se réduit pas à une suite de contraintes ennuyeuses qui gâchent le plaisir. Elle forme ce ciment invisible, patient et discret, qui empêche l’espace humain de basculer à nouveau dans une jungle destructrice où seul le plus fort ou le plus bruyant impose sa loi à coups de coude.\n\nPense à ce petit miracle ordinaire qui se répète des millions de fois chaque matin dans nos villes serrées : deux mille inconnus descendent sur un même quai étroit sans s’agresser ni se piétiner. Non par lâcheté, mais parce que chacun accepte intérieurement de laisser trois centimètres de répit à l’autre corps humain. Cette retenue apprise devient le socle discret de toute confiance possible.',
    },
    {
      id: 'mt-seg-5',
      title: 'Nuance critique : Ce qui protège le lien vs ce qui étouffe sous l’étiquette',
      role: 'nuance',
      status: 'brouillon',
      estimatedWpm: 135,
      targetDurationSec: 360,
      soundCueId: 'cue_glitch_matrice',
      linkedSourceIds: ['src-mt-rousseau', 'src-mt-elias'],
      concreteExample:
        'Distinguer l’interdit protecteur — ne pas humilier ou mettre en danger un passant — du conformisme snob qui juge quelqu’un sur sa tenue ou son accent.',
      scriptText:
        'Ralentissons ici deux minutes pour éviter un double piège qui guette toujours dès qu’on parle d’ordre et de conventions partagées.\n\nLe premier excès serait de tomber dans un relativisme paresseux du genre : « Puisque toute règle sociale est artificielle et inventée de main d’homme, alors toutes les règles se valent ou ne méritent aucun respect ! » Attention à l’erreur logique. Une digue contre les inondations est tout aussi artificielle et construite par des mains humaines ; personne de sensé ne conclut pour autant qu’on ferait bien de la dynamiter demain matin ! Qu’une règle de cohabitation soit née de l’histoire plutôt que gravée dans les astres ne la rend pas futile : au contraire, savoir qu’elle repose uniquement sur notre accord fragile rend notre soin quotidien d’autant plus précieux.\n\nMais voici aussitôt le piège inverse, tout aussi fréquent dans nos conversations du soir : confondre les garde-fous indispensables du vivre-ensemble avec les manies d’un club fermé qui confond l’étiquette bourgeoise et la justice !\n\n[EXTRAIT SONORE : Rupture de boucle (Glitch doux)]\n\nRegarde combien souvent les groupes humains commettent cette confusion commode : on hisse des habitudes purement locales — comment tenir sa fourchette, quel accent sonne « distingué », quelle coupe vestimentaire convient « aux gens bien » — au rang d’impératifs moraux sacrés, pendant qu’on ferme pudiquement les yeux sur une vraie muflerie commise à voix douce et en costume trois-pièces ! Un banquier peut respecter scrupuleusement chaque virgule de la bienséance mondaine tout en ruinant froidement trois familles avant le dîner, tandis qu’un ouvrier rustaud qui lance une phrase maladroite sans connaître les codes du salon se fait aussitôt traiter d’être sans éducation.\n\nVoilà pourquoi il est si sain de trier nos règles de trottoir en deux paniers très nets !\n\nDans le premier panier se trouvent les principes de protection mutuelle : ne pas blesser gratuitement, laisser dormir ses voisins à deux heures du matin, céder la place à quelqu’un qui chancelle, ne pas confisquer l’espace commun pour son seul caprice, annoncer la couleur avec loyauté. Ces égards-là ne servent pas à flatter la vanité d’une caste ; ils protègent concrètement le plus vulnérable contre la loi du plus brutal.\n\nDans le second panier dorment les conventions de pur tri social : les moqueries contre celui qui détonne, les obligations creuses destinées uniquement à vérifier si tu possèdes les bons codes de la tribu, ou l’hypocrisie polie qui interdit de nommer une injustice flagrante sous prétexte qu’il ne faut pas « casser l’ambiance ».\n\nSonge également aux différences culturelles qui déclenchent tant de crispations inutiles entre voisins venus d’ailleurs : dans certains pays, manger bruyamment sa soupe exprime sa gratitude envers le cuisinier, tandis qu’à deux mille kilomètres de là, le même bruit passe pour un affront ; ici l’on regarde droit dans les yeux pour prouver sa franchise, ailleurs l’on baisse respectueusement les paupières devant un aîné ! Tant que personne ne connaît le sens caché du code voisin, chacun prend la maladresse de l’autre pour de l’insolence volontaire.\n\n[PAUSE 2s]\n\nC’est là que l’œil innocent du visiteur étranger rend un service immense : il secoue ce second panier poussiéreux qui confond la timidité conformiste avec la vertu, tout en apprenant humblement la valeur du premier panier qui permet à des inconnus fragiles de marcher côte à côte sans peur.\n\nÀ ton échelle, cette lucidité te rend infiniment plus libre et plus juste : tu cesses d’écraser les maladroits qui n’ont simplement pas appris ton manuel d’usage, et tu défends avec calme les gestes qui rendent réellement la rue respirable pour tout le monde.',
    },
    {
      id: 'mt-seg-6',
      title: 'Conclusion : Pour aller plus loin — la boulangerie et la question au visiteur',
      role: 'conclusion',
      status: 'brouillon',
      estimatedWpm: 135,
      targetDurationSec: 320,
      soundCueId: 'cue_cloche_conclusion',
      linkedSourceIds: ['src-mt-hobbes', 'src-mt-rousseau', 'src-mt-resident-alien'],
      concreteExample:
        'Un client pousse la porte de la boulangerie sans décrocher un « bonjour », ou un enfant hurle dans l’allée d’un supermarché : reconnaître le petit accord invisible qu’on défend.',
      scriptText:
        'Rassemblons maintenant tout ce que ce détour entre les sapins solitaires, le pavé citadin et les maladresses d’un visiteur galactique vient d’éclairer devant nous.\n\nPour aller plus loin dès demain matin dans ta propre semaine, observe cette scène minuscule que nous avons tous vécue cent fois sans y prêter attention. La prochaine fois que tu te surprends à râler intérieurement parce qu’un gamin hurle à pleins poumons entre les rayons d’un magasin, ou qu’un type pousse la porte d’une boulangerie, passe sa commande et repart sans même laisser tomber un petit « bonjour » vers la boulangère, arrête ton premier mouvement d’agacement et rappelle-toi ceci :\n\nÀ cet instant précis, tu n’es pas en train de faire respecter une faute divine tombée du ciel ni une loi universelle gravée dans le marbre depuis la nuit des temps ! Tu défends tout simplement ces petites ententes tacites, patiemment négociées par des générations avant nous, qui permettent à des millions d’êtres humains très différents de cohabiter dans le même quartier sans se sauter à la gorge avant midi.\n\nUn simple « bonjour » en franchissant le seuil n’est pas un mot magique : c’est un minuscule traité de paix renouvelé à haute voix ! Cela signifie en substance : « Je t’ai vu, je ne traverse pas cette boutique comme si tu étais un distributeur automatique en plastique, je reconnais ta présence humaine à côté de la mienne. » Quant au calme demandé dans les lieux clos, c’est notre manière collective de veiller à ce que la fatigue ou le tintamarre d’un seul n’envahisse pas toute l’oreille de cent voisins qui n’ont rien demandé.\n\nRegarde comme ce changement de regard adoucit tout à coup nos jugements trop secs ! Quand quelqu’un manque à l’une de ces petites règles, au lieu de crier au monstre immoral ou de le condamner sans appel, tu sais désormais ce qui se joue : peut-être a-t-il brièvement oublié le pacte commun par fatigue, peut-être arrive-t-il d’une autre « forêt » où l’on n’a pas codé ce geste de la même façon que chez toi. Tu peux rappeler la frontière avec fermeté quand elle protège chacun, sans mépris ni arrogance morale.\n\nEt en même temps, tu réalises pourquoi il vaut la peine de soigner toi-même ces égards minuscules que l’on finit par mépriser quand on est pressé : laisser passer une poussette, répondre sans sécheresse, tenir la porte trois secondes, écouter sans couper. Rien de spectaculaire sur une affiche, aucun trophée à la clé — juste ce mortier invisible qui transforme une foule de solitudes méfiantes en un village habitable.\n\nImagine encore à quel point nos journées deviendraient plus légères si nous transmettions ces gestes aux enfants non pas avec le ton glacé du « parce que c’est interdit, un point c’est tout ! », mais en leur expliquant leur raison vivante : « On baisse la voix ici parce que la dame fatiguée à la caisse a besoin de paix, on salue le boulanger parce qu’il existe avant le pain qu’il te tend. » Dès qu’une règle révèle son cœur humain, elle cesse de ressembler à une corvée arbitraire pour redevenir une attention choisie.\n\n[EXTRAIT SONORE : Note finale suspendue]\n\nAlors avant de couper l’écoute et de retrouver le bruit vivant de ta rue, je te laisse avec une seule question simple à garder dans un coin de ta tête pendant que tu marches aujourd’hui :\n\nEt toi, si tu devais expliquer une seule règle de notre « morale de trottoir » à un visiteur venu d’une autre galaxie, par quoi tu commencerais ?\n\nPrends soin de tes pas, garde un œil neuf sur nos drôles de coutumes terrestres, et à très bientôt pour un nouvel épisode. C’était PHILOA2BALLES.',
    },
  ],
};
