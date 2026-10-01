import type { RawQuestion } from './types.ts';

/** Nourriture. */
export const FOOD: RawQuestion[] = [
  {
    text: "Le ketchup est à l'origine une sauce asiatique à base de ______ fermenté.",
    answer: 'poisson',
    accept: ['poissons'],
  },
  {
    text: 'Avant le XVIIe siècle, les carottes cultivées étaient surtout violettes ou ______, rarement orange.',
    answer: 'jaunes',
    accept: ['jaune', 'blanches', 'blanc'],
  },
  {
    text: 'Des pots de miel encore comestibles ont été retrouvés dans des tombes en ______, vieux de plus de 3 000 ans.',
    answer: 'Égypte',
    accept: ['Egypte'],
  },
  {
    text: "Techniquement, la cacahuète n'est pas une noix mais une ______.",
    answer: 'légumineuse',
    accept: ['legumineuse', 'légumineuses', 'légume'],
  },
  {
    text: "Les petits grains à la surface d'une fraise sont en réalité ses vrais fruits, appelés des ______.",
    answer: 'akènes',
    accept: ['akène', 'akenes'],
  },
  {
    text: 'La pizza Margherita doit son nom à la reine ______ de Savoie.',
    answer: 'Marguerite',
    accept: ['Margherita'],
  },
  {
    text: "Le croissant descend d'une viennoiserie autrichienne appelée « ______ ».",
    answer: 'Kipferl',
    accept: ['kipfel'],
  },
  {
    text: "À l'origine, le riz du sushi servait à ______ le poisson, avant d'être jeté.",
    answer: 'conserver',
    accept: ['fermenter', 'le conserver'],
  },
  {
    text: 'Selon la légende, les chips ont été inventées en 1853 pour un client mécontent de ses ______ trop épaisses.',
    answer: 'frites',
    accept: ['frite'],
  },
  {
    text: 'La mimolette doit sa couleur orange à un colorant naturel, le ______.',
    answer: 'rocou',
    accept: ['annatto'],
  },
  {
    text: "L'échelle qui mesure la force des piments porte le nom du pharmacien Wilbur ______.",
    answer: 'Scoville',
    accept: [],
  },
  {
    text: 'Selon la légende, le camembert aurait été inventé par une fermière normande nommée Marie ______.',
    answer: 'Harel',
    accept: [],
  },
  {
    text: 'Le « wasabi » servi dans beaucoup de restaurants est en fait du ______ coloré en vert.',
    answer: 'raifort',
    accept: [],
  },
  {
    text: 'Pour populariser la pomme de terre, Parmentier faisait garder son champ de jour par des soldats, mais pas ______.',
    answer: 'la nuit',
    accept: ['nuit', 'de nuit'],
  },
  {
    text: "Après l'eau, la boisson la plus consommée au monde est le ______.",
    answer: 'thé',
    accept: ['the', 'le thé'],
  },
  {
    text: "Le fruit « kiwi » porte le nom d'un oiseau néo-zélandais, mais il est originaire de ______.",
    answer: 'Chine',
    accept: ['la Chine'],
  },
  {
    text: 'La forme du Toblerone évoque une montagne suisse, le ______.',
    answer: 'Cervin',
    accept: ['Matterhorn'],
  },
  {
    text: "L'inventeur du tube des Pringles a demandé que ses cendres soient enterrées dans ______.",
    answer: 'un tube de Pringles',
    accept: ['tube de Pringles', 'une boîte de Pringles', 'un tube Pringles', 'Pringles'],
  },
  {
    text: 'La vanille est la deuxième épice la plus chère au monde, derrière le ______.',
    answer: 'safran',
    accept: [],
  },
  {
    text: "La pression dans une bouteille de champagne est d'environ ______ bars.",
    answer: '6',
    accept: ['six', '5', '5 à 6', '5,5'],
  },
];
