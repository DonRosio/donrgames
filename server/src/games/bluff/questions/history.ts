import type { RawQuestion } from './types.ts';

/** Histoire. */
export const HISTORY: RawQuestion[] = [
  {
    text: 'En 1386, à Falaise, un ______ a été jugé, condamné à mort et pendu pour avoir tué un enfant.',
    answer: 'cochon',
    accept: ['une truie', 'truie', 'porc', 'un porc', 'un cochon'],
  },
  {
    text: 'Napoléon mesurait environ ______ m : plutôt la taille moyenne de son époque que « petit ».',
    answer: '1,69',
    accept: ['1,68', '1m69', '1m68', '1.69', '1.68', '1,70'],
  },
  {
    text: 'Cléopâtre a vécu plus près dans le temps de ______ que de la construction de la grande pyramide de Gizeh.',
    answer: "l'alunissage d'Apollo 11",
    accept: [
      '1969',
      'alunissage',
      'les premiers pas sur la Lune',
      'Apollo 11',
      "l'alunissage",
      'la conquête de la Lune',
    ],
  },
  {
    text: 'La guerre de Cent Ans a en réalité duré ______ ans.',
    answer: '116',
    accept: ['cent seize'],
  },
  {
    text: "La guerre anglo-zanzibarie de 1896, la plus courte de l'histoire, a duré environ ______ minutes.",
    answer: '38',
    accept: ['trente-huit', '40', '45'],
  },
  {
    text: 'Louis XIV a régné pendant ______ ans, record de longévité pour un roi de France.',
    answer: '72',
    accept: ['soixante-douze', 'soixante-douze ans'],
  },
  {
    text: "En 1518, une étrange épidémie à Strasbourg a poussé des centaines de personnes à ______ sans pouvoir s'arrêter.",
    answer: 'danser',
    accept: ['la danse', 'danse'],
  },
  {
    text: "En 1932, l'armée australienne a perdu une « guerre » contre des ______.",
    answer: 'émeus',
    accept: ['emeus', 'émeu', 'emeu', 'oiseaux'],
  },
  {
    text: "Dans la Rome antique, les foulons utilisaient de l'______ pour blanchir les toges.",
    answer: 'urine',
    accept: ['pipi'],
  },
  {
    text: 'Dans le calendrier révolutionnaire français, la semaine (« décade ») durait ______ jours.',
    answer: '10',
    accept: ['dix'],
  },
  {
    text: 'Tutankhamon est monté sur le trône à environ ______ ans.',
    answer: '9',
    accept: ['neuf', '8', 'huit'],
  },
  {
    text: "L'armature intérieure de la statue de la Liberté a été conçue par ______.",
    answer: 'Gustave Eiffel',
    accept: ['Eiffel'],
  },
  {
    text: 'La tour Eiffel, prévue pour être démontée après vingt ans, a été conservée grâce à son utilité pour la ______.',
    answer: 'radio',
    accept: ['TSF', 'télégraphie sans fil', 'télégraphie', 'radiotélégraphie', 'radiodiffusion'],
  },
  { text: "Henri VIII d'Angleterre s'est marié ______ fois.", answer: 'six', accept: ['6'] },
  {
    text: "Dans l'Égypte antique, quand un chat mourait, sa famille se rasait les ______.",
    answer: 'sourcils',
    accept: ['sourcil'],
  },
  {
    text: "Contrairement à la légende, les dents de George Washington n'étaient pas en bois, mais notamment en ______.",
    answer: 'ivoire',
    accept: ["ivoire d'hippopotame", 'dents humaines', 'os'],
  },
  { text: "Jeanne d'Arc a été brûlée vive à Rouen en ______.", answer: '1431', accept: [] },
  {
    text: "Le 14 juillet 1789, il n'y avait que ______ prisonniers dans la Bastille.",
    answer: '7',
    accept: ['sept'],
  },
  {
    text: "Avant Sainte-Hélène, Napoléon a été exilé sur l'île d'______.",
    answer: 'Elbe',
    accept: ["l'île d'Elbe"],
  },
  {
    text: 'La peste noire (1347-1352) aurait tué au moins ______ de la population européenne.',
    answer: 'un tiers',
    accept: ['1/3', '33 %', '30 %', '33%', '30%', 'un tiers de la population'],
  },
];
