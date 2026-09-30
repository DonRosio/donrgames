// Roles of Among Legends: plain data, shared by the server (draw, rules) and the client (role
// cards, rules in the lobby). No zod here, so that the client can import it at runtime.

export const ROLE_IDS = [
  'impostor',
  'superhero',
  'snake',
  'two-face',
  'crook',
  'pacifist',
  'speedrunner',
  'marathoner',
  'chameleon',
  'droid',
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export type Team = 'blue' | 'red';

/** Mode of the Double Face: an ally must win, an impostor must lose. */
export type TwoFaceMode = 'ally' | 'impostor';

export const TEAM_SIZE = 5;
/** The Double Face switches mode every 7 minutes of game time. */
export const TWO_FACE_PERIOD_MS = 7 * 60_000;
/** The Chameleon discovers its real role after 15 minutes of game time. */
export const CHAMELEON_REVEAL_MS = 15 * 60_000;

export interface RoleInfo {
  id: RoleId;
  /** Displayed name (French). */
  name: string;
  /** Mission, as told to the player (French). */
  goal: string;
  /** Scoring, one line per rule (French). */
  points: readonly string[];
  /** Not playable yet: shown greyed out in the lobby. */
  inDevelopment?: true;
}

export const ROLES: Readonly<Record<RoleId, RoleInfo>> = {
  impostor: {
    id: 'impostor',
    name: 'Imposteur',
    goal: 'Tu dois perdre la partie sans te faire démasquer.',
    points: [
      '−3 en cas de victoire, +2 en cas de défaite',
      "+1 par joueur qui ne t'a pas désigné comme Imposteur",
    ],
  },
  superhero: {
    id: 'superhero',
    name: 'Super-Héros',
    goal: 'Tu dois absolument gagner la partie. Bonus si tu es premier de ton équipe en kills, en dégâts ou en assists.',
    points: [
      '+2 en cas de victoire, −3 en cas de défaite',
      "+1 pour le plus de dégâts, +1 pour le plus d'assists, +1 pour le plus de kills",
      'Aucun malus si ton rôle est découvert',
    ],
  },
  snake: {
    id: 'snake',
    name: 'Serpentin',
    goal: 'Tu dois gagner la partie en ayant le plus de morts et le plus de dégâts de ton équipe.',
    points: [
      '+2 en cas de victoire, −2 en cas de défaite',
      '+1 pour le plus de dégâts, +1 pour le plus de morts',
    ],
  },
  'two-face': {
    id: 'two-face',
    name: 'Double Face',
    goal: 'En mode Allié, tu dois gagner ; en mode Imposteur, tu dois perdre. Ton mode change toutes les 7 minutes.',
    points: ['+2 si ton mode à la fin de la partie correspond au résultat'],
  },
  crook: {
    id: 'crook',
    name: 'Escroc',
    goal: 'Tu dois gagner la partie tout en te faisant désigner comme Imposteur au vote final.',
    points: [
      '+2 en cas de victoire, −3 en cas de défaite',
      '+1 par joueur qui te désigne comme Imposteur',
    ],
  },
  pacifist: {
    id: 'pacifist',
    name: 'Pacifiste',
    goal: 'Tu dois gagner la partie avec le moins de kills de ton équipe, idéalement aucun.',
    points: [
      '+2 en cas de victoire, −2 en cas de défaite',
      "+1 pour le moins de kills, +1 de plus si tu n'en as fait aucun",
    ],
  },
  speedrunner: {
    id: 'speedrunner',
    name: 'Speedrunner',
    goal: 'Tu dois gagner en moins de 25 minutes, quitte à prendre des coups.',
    points: [
      '+2 pour une victoire en moins de 25 minutes, +1 pour une victoire plus tardive',
      '−2 en cas de défaite',
      '+2 pour le plus de dégâts subis',
    ],
  },
  marathoner: {
    id: 'marathoner',
    name: 'Marathonien',
    goal: "Tu dois gagner après 35 minutes, en restant à l'abri des coups.",
    points: [
      '+2 pour une victoire après 35 minutes, +1 pour une victoire plus rapide',
      '−2 en cas de défaite',
      '+2 pour le moins de dégâts subis',
    ],
  },
  chameleon: {
    id: 'chameleon',
    name: 'Caméléon',
    goal: 'À 15 minutes, tu découvres ton vrai rôle, parmi ceux qui ne sont pas dans ton équipe. Tu dois alors en remplir la mission.',
    points: [
      'Les points de ton nouveau rôle',
      '+1 si tu remplis sa mission principale',
      'Si la partie finit avant 15 minutes : seulement les points communs',
    ],
  },
  droid: {
    id: 'droid',
    name: 'Droïde',
    goal: 'Tu dois gagner la partie en respectant les ordres qui te sont donnés.',
    points: ['+2 en cas de victoire, −2 en cas de défaite', '+1 si les ordres sont respectés'],
    inDevelopment: true,
  },
};

/** Rules shared by every role (French). */
export const COMMON_POINTS: readonly string[] = [
  '+1 par rôle correctement deviné au vote final, −1 par erreur',
  "+1 par joueur qui n'a pas trouvé ton rôle, −1 par joueur qui l'a trouvé",
];

export const TEAM_NAMES: Readonly<Record<Team, string>> = {
  blue: 'Équipe bleue',
  red: 'Équipe rouge',
};

/** Mode of a Double Face at a given time of the game, from its starting mode. */
export function twoFaceModeAt(start: TwoFaceMode, elapsedMs: number): TwoFaceMode {
  const switches = Math.floor(Math.max(0, elapsedMs) / TWO_FACE_PERIOD_MS);
  if (switches % 2 === 0) return start;
  return start === 'ally' ? 'impostor' : 'ally';
}
