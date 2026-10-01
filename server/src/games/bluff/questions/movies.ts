import type { RawQuestion } from './types.ts';

/** Films. */
export const MOVIES: RawQuestion[] = [
  {
    text: "Le bourdonnement des sabres laser de Star Wars vient en partie du moteur d'un vieux ______.",
    answer: 'projecteur de cinéma',
    accept: ['projecteur', 'projecteur de film', 'projecteur de cinema'],
  },
  {
    text: "Dans Titanic, les mains qu'on voit dessiner Rose sont celles du réalisateur ______.",
    answer: 'James Cameron',
    accept: ['Cameron'],
  },
  {
    text: 'Dans la scène de la douche de Psychose, le faux sang était du ______.',
    answer: 'sirop de chocolat',
    accept: ['chocolat', 'chocolat liquide', 'sirop au chocolat'],
  },
  {
    text: "Le rugissement du T. rex de Jurassic Park mélange des cris d'éléphant, de tigre et d'______.",
    answer: 'alligator',
    accept: [],
  },
  {
    text: "Le visage d'E.T. a été inspiré par ceux d'Einstein, d'Hemingway et du poète Carl ______.",
    answer: 'Sandburg',
    accept: ['Carl Sandburg'],
  },
  {
    text: "Sur le tournage des Dents de la mer, l'équipe avait surnommé le requin mécanique « ______ ».",
    answer: 'Bruce',
    accept: [],
  },
  {
    text: 'Dans une version du scénario de Retour vers le futur, la machine à voyager dans le temps était un ______.',
    answer: 'réfrigérateur',
    accept: ['frigo', 'frigidaire', 'refrigerateur'],
  },
  {
    text: "Le Roi Lion s'inspire librement d'une pièce de Shakespeare, ______.",
    answer: 'Hamlet',
    accept: [],
  },
  {
    text: "Dans Les Deux Tours, le cri de douleur d'Aragorn après avoir shooté dans un casque est réel : Viggo Mortensen s'était vraiment cassé deux ______.",
    answer: 'orteils',
    accept: ['orteil', 'doigts de pied'],
  },
  {
    text: 'La scène de la batte, dans Shining, a nécessité environ ______ prises.',
    answer: '127',
    accept: ['cent vingt-sept'],
  },
  { text: 'Dans Pulp Fiction, le code de la mallette est ______.', answer: '666', accept: [] },
  {
    text: 'Le chat sur les genoux de Don Corleone, dans Le Parrain, était un chat ______ trouvé sur le plateau par Coppola.',
    answer: 'errant',
    accept: ['de gouttière', 'abandonné', 'perdu', 'égaré'],
  },
  {
    text: "Dans Les Aventuriers de l'arche perdue, Indiana Jones abat un bretteur d'un coup de revolver parce que Harrison Ford était ______ ce jour-là.",
    answer: 'malade',
    accept: ['malade de la dysenterie', 'dysentérique'],
  },
  {
    text: "Le nom de l'ogre Shrek vient d'un mot allemand et yiddish qui signifie « ______ ».",
    answer: 'peur',
    accept: ['la peur', 'terreur', 'frayeur'],
  },
  {
    text: "La langue na'vi, parlée dans Avatar, a été inventée par le linguiste ______.",
    answer: 'Paul Frommer',
    accept: ['Frommer'],
  },
  {
    text: "Le film Intouchables s'inspire de l'histoire vraie de Philippe Pozzo di Borgo et d'Abdel ______.",
    answer: 'Sellou',
    accept: [],
  },
  {
    text: 'Mad Max: Fury Road, censé se passer en Australie, a été tourné dans le désert de ______.',
    answer: 'Namibie',
    accept: ['Namib'],
  },
  {
    text: 'Les costumes du Cinquième Élément ont été dessinés par le couturier ______.',
    answer: 'Jean Paul Gaultier',
    accept: ['Gaultier', 'Jean-Paul Gaultier'],
  },
  {
    text: "Dans le livre original du Magicien d'Oz, les chaussons de Dorothy sont ______ et non rouges.",
    answer: 'argentés',
    accept: ['argent', "d'argent", 'argenté'],
  },
  {
    text: "Dans Reservoir Dogs, les gangsters s'appellent Mr. White, Mr. Orange, Mr. Blonde, Mr. Blue, Mr. Brown et Mr. ______.",
    answer: 'Pink',
    accept: ['rose'],
  },
];
