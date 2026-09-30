import type { RoleId } from '@mini-jeux/shared/games/among-legends-roles';

// One picture per role, `assets/roles/<role id>.webp` (sources in `design/`).
const PICTURES = import.meta.glob<string>('../../assets/roles/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** URL of the picture of a role, if there is one. */
export const pictureOf = (id: RoleId): string | undefined =>
  PICTURES[`../../assets/roles/${id}.webp`];
