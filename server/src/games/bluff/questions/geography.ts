import type { RawQuestion } from './types.ts';

/** Géographie. */
export const GEOGRAPHY: RawQuestion[] = [
  {
    text: "Le ______ est le seul pays au monde dont le drapeau n'est ni rectangulaire ni carré.",
    answer: 'Népal',
    accept: ['Nepal'],
  },
  {
    text: "Avec ses territoires d'outre-mer, c'est la ______ qui possède le plus de fuseaux horaires au monde.",
    answer: 'France',
    accept: [],
  },
  {
    text: "Le plus grand désert du monde n'est pas le Sahara mais ______.",
    answer: "l'Antarctique",
    accept: ['Antarctique', "l'Antarctica"],
  },
  {
    text: "Le lac Baïkal, en Russie, contient environ ______ % de l'eau douce liquide de surface de la planète.",
    answer: '20',
    accept: ['vingt', 'un cinquième'],
  },
  { text: "La Russie s'étend sur ______ fuseaux horaires.", answer: '11', accept: ['onze'] },
  {
    text: "La Suisse a quatre langues nationales : l'allemand, le français, l'italien et le ______.",
    answer: 'romanche',
    accept: [],
  },
  { text: "Le plus long fleuve d'Europe est la ______.", answer: 'Volga', accept: [] },
  {
    text: 'Le pays qui compte le plus de lacs au monde est le ______.',
    answer: 'Canada',
    accept: [],
  },
  {
    text: 'Le Bhoutan mesure sa prospérité avec le « ______ national brut ».',
    answer: 'bonheur',
    accept: [],
  },
  {
    text: 'Le Lesotho est un pays entièrement enclavé dans un seul autre pays : ______.',
    answer: "l'Afrique du Sud",
    accept: ['Afrique du Sud'],
  },
  {
    text: 'Le seul pays dont le nom commence par la lettre « Q » est le ______.',
    answer: 'Qatar',
    accept: [],
  },
  {
    text: 'Istanbul est à cheval sur deux continents, séparés par le détroit du ______.',
    answer: 'Bosphore',
    accept: [],
  },
  { text: 'La Bolivie a deux capitales : La Paz et ______.', answer: 'Sucre', accept: [] },
  {
    text: 'La plus grande île du monde (hors continents) est le ______.',
    answer: 'Groenland',
    accept: ['Greenland'],
  },
  {
    text: 'Le fleuve qui traverse le plus de pays au monde, avec dix pays, est le ______.',
    answer: 'Danube',
    accept: [],
  },
  {
    text: 'Le pays qui compte le plus de langues parlées, plus de 800, est la ______.',
    answer: 'Papouasie-Nouvelle-Guinée',
    accept: ['Papouasie', 'Papouasie Nouvelle Guinée', 'Papouasie-Nouvelle Guinée'],
  },
  {
    text: "Le Vatican, plus petit pays du monde, ne fait qu'environ ______ hectares.",
    answer: '44',
    accept: ['quarante-quatre', '0,44 km²'],
  },
  {
    text: 'Depuis 2023, le pays le plus peuplé du monde est ______, devant la Chine.',
    answer: "l'Inde",
    accept: ['Inde', 'India'],
  },
  {
    text: 'Environ ______ % des Pays-Bas se situent sous le niveau de la mer.',
    answer: '26',
    accept: ['un quart', '25', '27'],
  },
  {
    text: "Selon la définition qui place la frontière de l'Europe dans le Caucase, le plus haut sommet d'Europe est l'______.",
    answer: 'Elbrouz',
    accept: ['Elbrus', 'mont Elbrouz', "l'Elbrouz", 'Elbrous'],
  },
];
