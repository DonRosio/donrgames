# DonrGames

Site de **mini-jeux multijoueurs en temps réel** entre amis, chacun sur son PC. Pas de compte : on crée
un salon, on partage son code, et on joue. Le site est en ligne sur https://www.donrgames.fr.

## Les jeux

- **Doublage** : du lip-sync sur de courtes vidéos. Chacun enregistre sa voix calée sur l'image, puis
  les prises sont rejouées une par une et soumises au vote des autres joueurs.
- **Among Legends** : un jeu de rôles caché autour d'une vraie partie de League of Legends (5 ou 10
  joueurs). Chacun reçoit un rôle secret, joue sa partie, puis tout le monde vote pour deviner les rôles
  des autres à partir des statistiques.
- **Désamorçage** : un jeu coopératif à 4, inspiré de *Keep Talking and Nobody Explodes*. Un démineur
  voit la bombe, trois experts se partagent le manuel. 8 types de modules tirés au hasard, chrono,
  sons générés dans le navigateur.

## Architecture

- **Monorepo TypeScript**, avec npm workspaces : `shared` (types, contrats d'événements, schémas zod),
  `server` et `client`.
- **Serveur** : Node 24, Fastify 5 et Socket.IO 4 pour le temps réel. Chaque événement et chaque
  requête est validé avec zod. Les parties vivent en mémoire, sans base de données.
- **Client** : Vite et React 19.
- **Socle + jeux en plugins.** Le socle gère les salons (création, code, hôte, reconnexion,
  expiration), l'enchaînement des parties, les classements et les composants communs. Chaque jeu se
  déclare avec `defineGame`, et un nouveau jeu s'ajoute sans toucher au reste.
- **Sécurité.** Limitation de débit, médias privés en mémoire avec accès authentifié et durée de vie
  limitée. Une revue de sécurité complète est disponible dans
  [docs/revue-securite.md](docs/revue-securite.md).
- **Tests** : Vitest pour la logique (les jeux sont testables sans réseau), Playwright de bout en bout
  sur le build de production.
- **Déploiement** : VPS Ubuntu, Caddy, service systemd. Un `git push` déclenche le déploiement
  ([docs/deploiement.md](docs/deploiement.md)).

Détails : [cahier des charges](docs/cahier-des-charges.md) · [architecture](docs/architecture.md).

## Lancer en local

Prérequis : Node 24 ou plus récent.

```bash
npm install
```

```bash
npm run dev
```

Vérifications complètes (types, lint, format, tests) :

```bash
npm run check
```

Tests de bout en bout :

```bash
npm run test:e2e
```

## Démarche

J'ai imaginé ce projet pour jouer avec mes amis à distance, à des jeux qu'on ne trouve pas ailleurs,
dont un construit autour de nos parties de League of Legends.

Je l'ai conçu et piloté, et je l'ai développé avec l'assistance de **Claude** (Anthropic), utilisé
comme binôme de programmation. Mon rôle :

- **Écrire le cahier des charges** : les jeux et leurs règles, les exigences de sécurité et de
  confidentialité, la stack, les contraintes des navigateurs, et le découpage en étapes.
- **Imposer une méthode.** Plan d'architecture validé avant toute ligne de code, puis une étape à la
  fois. Chaque étape devait démarrer, passer les tests, être testée à la main par moi, puis recevoir
  mon feu vert.
- **Choisir et cadrer les jeux** : les concepts, les règles attendues, puis les arbitrages et les retours
  au fil des étapes.
- **Assurer la direction artistique** : l'aquarelle de fond, l'illustration du présentateur, les images
  des rôles, et la validation des animations.
- **Déployer et exploiter** : nom de domaine, VPS, durcissement du serveur, mises en production.

Le code a été écrit avec Claude, puis vérifié à chaque étape : typage strict, lint, tests unitaires et
de bout en bout, audit des dépendances, et une revue de sécurité dédiée.
