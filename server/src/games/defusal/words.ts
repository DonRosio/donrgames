/**
 * Five-letter French words, without accents: the password module draws its list from here and
 * the morse module its words. A bomb uses a few dozen of them; the rest stays unused.
 */
export const WORDS: readonly string[] = [
  ...'ABORD ACIER ADIEU AIGLE ALBUM AMOUR ANGLE ARBRE ASILE AVION'.split(' '),
  ...'BALLE BANDE BARON BASSE BIJOU BLEUE BOIRE BORNE BOULE BRUIT'.split(' '),
  ...'CABLE CADRE CARTE CHAMP CHANT CHAUD CIBLE CLAIR COEUR COURS CREME'.split(' '),
  ...'DANSE DEBUT DETTE DOUTE DROIT DUNES'.split(' '),
  ...'ECOLE ECRAN ENFIN EPAIS ETUDE'.split(' '),
  ...'FERME FILET FLEUR FORCE FRAIS FRUIT'.split(' '),
  ...'GARDE GENIE GLACE GRAIN GRAND GUIDE'.split(' '),
  ...'HERBE HEURE HIVER HOTEL'.split(' '),
  ...'ISSUE JAUNE JEUNE JOUER JUSTE'.split(' '),
  ...'LAINE LARGE LIVRE LOURD LUTTE'.split(' '),
  ...'MAGIE MENER MONDE MONTS MUSEE'.split(' '),
  ...'NEIGE NOBLE NUAGE'.split(' '),
  ...'OCEAN OFFRE ORAGE OUEST'.split(' '),
  ...'PAUSE PETIT PIANO PLAGE PLUIE POINT PORTE PRIME'.split(' '),
  ...'RADIO RAYON REGLE RIVAL ROUTE'.split(' '),
  ...'SABLE SALLE SAVON SCENE SOLDE SOUPE STADE SUCRE'.split(' '),
  ...'TABLE TERRE TIGRE TOILE TRAIN TRAIT'.split(' '),
  ...'UNION USAGE USINE'.split(' '),
  ...'VAGUE VALSE VERRE VILLE VITRE VOILE ZEBRE ZONES'.split(' '),
];
