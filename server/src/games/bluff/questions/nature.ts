import type { RawQuestion } from './types.ts';

/** Nature. */
export const NATURE: RawQuestion[] = [
  { text: 'Le poulpe a ______ cœurs.', answer: 'trois', accept: ['3'] },
  {
    text: 'Les excréments du wombat ont la forme de ______.',
    answer: 'cubes',
    accept: ['cube', 'dés'],
  },
  {
    text: "Un groupe de flamants roses s'appelle une « ______ ».",
    answer: 'flamboyance',
    accept: [],
  },
  {
    text: "Les flamants roses doivent leur couleur aux pigments des ______ qu'ils mangent.",
    answer: 'crevettes',
    accept: ['crevette', 'algues', 'crustacés'],
  },
  {
    text: "Les koalas sont l'un des rares animaux à avoir des ______ presque identiques à celles des humains.",
    answer: 'empreintes digitales',
    accept: ['empreintes', 'empreinte digitale'],
  },
  {
    text: 'Les bananes sont très légèrement radioactives à cause du ______.',
    answer: 'potassium',
    accept: [],
  },
  {
    text: 'Pour ne pas dériver pendant leur sommeil, les loutres de mer se tiennent par ______.',
    answer: 'la patte',
    accept: ['la main', 'les pattes', 'les mains', 'patte', 'main'],
  },
  {
    text: 'Les girafes ont ______ vertèbres cervicales, comme les humains.',
    answer: '7',
    accept: ['sept'],
  },
  {
    text: "Le sang du poulpe est bleu parce qu'il contient du ______, et non du fer.",
    answer: 'cuivre',
    accept: [],
  },
  {
    text: 'Pando, aux États-Unis, est un seul organisme géant formé de ______ clonés.',
    answer: 'trembles',
    accept: ['tremble', 'peupliers trembles'],
  },
  {
    text: "Certains bambous peuvent grandir de près d'un mètre en ______.",
    answer: '24 heures',
    accept: ['un jour', 'une journée', '24h'],
  },
  {
    text: 'Le bananier, qui peut dépasser cinq mètres, est botaniquement une grande ______ et non un arbre.',
    answer: 'herbe',
    accept: ['herbacée', 'plante herbacée'],
  },
  {
    text: "La langue (radula) d'un escargot de jardin porte environ ______ minuscules dents.",
    answer: '14 000',
    accept: ['14000', '14.000'],
  },
  {
    text: "Pour dormir sans se noyer, les dauphins ne dorment qu'avec ______ de leur cerveau à la fois.",
    answer: 'la moitié',
    accept: ['moitié', '50 %', '50%', 'la moitie'],
  },
  {
    text: 'Les chats sont incapables de percevoir le goût ______.',
    answer: 'sucré',
    accept: ['sucre', 'le sucre'],
  },
  {
    text: "Les requins existent depuis avant l'apparition des ______.",
    answer: 'arbres',
    accept: ['arbre', 'forêts'],
  },
  {
    text: 'Le Tyrannosaure a vécu plus près de notre époque que de celle du ______.',
    answer: 'Stégosaure',
    accept: ['stegosaure'],
  },
  {
    text: "La vanille est le fruit d'une plante de la famille des ______.",
    answer: 'orchidées',
    accept: ['orchidee', 'orchidée', 'orchidees'],
  },
  { text: "Chez l'autruche, l'œil est plus gros que le ______.", answer: 'cerveau', accept: [] },
  {
    text: 'Le guépard peut atteindre environ ______ km/h en pointe.',
    answer: '100',
    accept: ['110', '112', '120'],
  },
];
