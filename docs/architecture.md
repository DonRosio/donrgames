# Architecture — mini-jeux

> **Statut : plan validé à l'étape 1.** À tenir à jour à chaque changement d'architecture.
> Référence fonctionnelle : [cahier-des-charges.md](cahier-des-charges.md). Les écarts assumés avec ce cahier sont signalés au §0.
> Les blocs TypeScript sont des esquisses d'interfaces destinées à la validation, pas du code définitif.

## 0. Décisions

### 0.1 Tranchées ensemble

| Sujet | Décision |
|---|---|
| Blocages | Aucun minuteur de jeu. L'hôte a un bouton « Passer à la suite » (avec confirmation) à chaque étape d'attente. Un joueur déconnecté n'est plus attendu après 60 s ; s'il revient, il reprend où en est la partie. Pas de prise validée → pas présenté dans la manche ; pas de vote → 0. |
| Joueurs | Doublage : 2 à 10. Salon : 10 joueurs max (configurable). |
| Manches | Une manche = une vidéo. Par défaut, la partie joue **toutes les vidéos inédites** pour les joueurs présents ; s'il n'y en a aucune, toutes celles pas encore jouées dans le salon. L'hôte peut en choisir moins et peut **terminer la partie après n'importe quelle manche** (classement final ; les vidéos non jouées restent disponibles). Rythme attendu : 2 soirées par an, puis une nouvelle sélection à importer. |
| Historique entre soirées | Mémoire locale de chaque appareil (localStorage) ; rien n'est stocké côté serveur. Une vidéo déjà vue par un joueur présent n'est donc pas reproposée par défaut, même si elle est toujours dans le manifeste. |
| Contexte de jeu | À distance, tous en appel Discord : chaque appareil joue le son. Chacun se met en sourd et muet sur Discord pendant qu'il s'enregistre. |
| Appareils et navigateurs | **PC uniquement, sous Windows ou Linux, avec Chrome ou Brave (Chromium).** Brave reste pris en charge tant qu'il ne cause pas trop de blocages ; sinon, on passe à Chrome uniquement. Firefox « au mieux » : le code reste standard, mais il n'est pas testé à chaque étape. Safari, iPhone, Mac et mobiles sont hors cible. **Écart assumé** avec le cahier des charges (§ Contraintes navigateur). |
| Jeu de test | **Aucun pour l'instant.** Le moteur est validé par des tests automatiques utilisant un jeu fictif qui n'existe que dans les tests (jamais sur le site). **Écart assumé** avec le cahier des charges (étape 3). |
| Import des vidéos | Tu écris une liste de sélection, puis une seule commande télécharge, découpe, convertit et remplit le manifeste (§7.5). |

### 0.2 Choix techniques retenus

1. **Contrat partagé par jeu** dans `shared/src/games/<id>.ts` (métadonnées, phases, réglages, schémas des actions, types des vues). Ajouter un jeu = 2 dossiers + ce fichier + 1 entrée par registre.
2. **Node 24 exécute directement le TypeScript du serveur** (*type stripping*, vérifié sur ta machine avec les workspaces) : ni tsx ni compilation du serveur ; `tsc` sert uniquement à vérifier les types. Contrainte : syntaxe TypeScript « effaçable » (pas d'`enum` ni de `namespace`).
3. **TypeScript 6.0 et non 7.0** : typescript-eslint exige TypeScript < 6.1.
4. **Prises audio avec MediaRecorder**, au format natif de Chrome et Brave (WebM/Opus), lu partout dans la cible. Plus besoin de plan B.
5. **Prises gardées en RAM uniquement** et supprimées dès la fin de chaque manche, ce qui est plus strict que « fin de partie ». Un plantage ne laisse rien sur disque.
6. **Rythme** : les enchaînements techniques sont automatiques (chargement terminé → lecture ; fin de vidéo → étape suivante ; tous les votes reçus → révélation). Les enchaînements conviviaux sont pilotés par l'hôte (« Joueur suivant », « Manche suivante », « Terminer la partie », « Retour au salon ») pour laisser le temps de commenter en vocal.
7. **Arrivée pendant une partie** : on entre dans le salon, on voit « Partie en cours » et on joue à la suivante.
8. **Hôte** : transfert automatique après 60 s de déconnexion (au joueur connecté arrivé le plus tôt). Transfert manuel et exclusion d'un joueur possibles.
9. **Id technique `dubbing`** pour Doublage (le nom affiché reste libre).
10. **Pas de routeur ni de gestionnaire d'état externes** (3 routes, un petit store maison). Styles en CSS Modules, polices système.
11. **Chemins d'URL** : `/`, `/join/ABC123`, `/room/ABC123`.

## 1. Vue d'ensemble

```
 Navigateurs (1 par joueur)                           Serveur Node 24 (un seul processus)
 ┌──────────────────────────────┐   HTTPS + Bearer    ┌─────────────────────────────────────────┐
 │ React (Vite)                 │ ──────────────────▶ │ Fastify : /api/*  +  fichiers du client │
 │  core/  session, médias,     │                     │  core/rooms    salons, sessions         │
 │         composants communs   │   WebSocket         │  core/engine   moteur de jeux           │
 │  games/<id>/  écrans         │ ◀────────────────▶  │  core/media    prises (RAM, TTL)        │
 │                              │   (Socket.IO)       │  core/content  manifestes des vidéos    │
 │ sessionStorage : jeton       │                     │  games/<id>/   machines à états         │
 │ localStorage : déjà vu       │                     │  état 100 % en mémoire                  │
 └──────────────────────────────┘                     └─────────────────────────────────────────┘
```

Principes :

- **Serveur autoritaire.** L'état vit sur le serveur. Le client envoie des *intentions* (`vote {points: 2}`), le serveur vérifie tout (schéma, phase, droits, règles) puis diffuse.
- **Une vue par joueur.** Le serveur n'envoie jamais son état brut : `view(state, joueur)` construit ce que ce joueur a le droit de voir. Ce sont des instantanés complets (pas de diffs), donc une reconnexion revient simplement à renvoyer la vue.
- **Socle et jeux séparés.** `core/` ne connaît aucun jeu. Un jeu branche ses phases, ses règles et ses écrans via des interfaces fixes. Le socle impose les contrôles génériques (phase courante, hôte, participant, schéma).
- **HTTP pour ce qui est ponctuel ou binaire** (créer ou rejoindre un salon, envoyer ou lire un média), **Socket.IO pour tout le reste.**

## 2. Arborescence

```
mini-jeux/
├── package.json            workspaces + scripts racine (dev, check, test, build, start…)
├── tsconfig.base.json · eslint.config.js · .prettierrc · .nvmrc (24) · .env.example
├── CLAUDE.md
├── docs/                   cahier des charges, architecture ; plus tard déploiement, revue de sécurité
├── scripts/                dev.mjs (serveur + client en parallèle), certs (HTTPS local), videos-import
├── content/                contenus des jeux, hors git (seuls les exemples sont versionnés)
│   └── dubbing/
│       ├── selection.txt   ta liste de sélection (entrée du script d'import)
│       ├── *.mp4, *.mkv…   tes vidéos téléchargées, entières (sources du script)
│       ├── videos/         extraits générés par le script (à ne pas modifier à la main)
│       ├── manifest.json   généré par le script, lu par le serveur
│       └── archive/        anciennes sélections (option --replace)
├── shared/src/
│   ├── index.ts
│   ├── core/
│   │   ├── limits.ts       constantes (longueurs, tailles, joueurs max…)
│   │   ├── schemas.ts      zod : code, pseudo, corps HTTP, charges utiles socket, historique
│   │   ├── protocol.ts     événements Socket.IO typés, Ack, codes d'erreur
│   │   ├── room.ts         RoomView, PlayerView
│   │   └── game.ts         GameMeta, SettingDef, defineContract, GameResults
│   └── games/
│       └── dubbing.ts      contrat + types de vue
├── server/src/
│   ├── index.ts            démarrage, arrêt propre
│   ├── app.ts              buildApp(config) : Fastify + Socket.IO (réutilisé par les tests)
│   ├── config.ts           variables d'environnement validées par zod
│   ├── core/
│   │   ├── http/           security.ts (helmet/CSP), routes rooms/games/uploads/media/content, spa.ts, errors.ts
│   │   ├── realtime/       io.ts (auth, origine), handlers.ts, rate-limit.ts, clock.ts
│   │   ├── rooms/          room-manager.ts, codes.ts, tokens.ts, nickname.ts, sweeper.ts
│   │   ├── engine/         define-game.ts, runner.ts, context.ts, scheduler.ts, barrier.ts, harness.ts
│   │   │   └── fixtures/   jeu fictif servant uniquement aux tests du moteur
│   │   ├── content/        library.ts (manifestes), tracker.ts (déjà joué)
│   │   ├── media/          media-store.ts (RAM, TTL, quotas), sniff.ts (signatures de fichiers)
│   │   └── lib/            random.ts (crypto), time.ts, log.ts
│   └── games/
│       ├── registry.ts     une entrée par jeu
│       └── dubbing/        index.ts, phases.ts, views.ts, scoring.ts + tests
└── client/
    ├── index.html · vite.config.ts
    └── src/
        ├── main.tsx
        ├── app/            App.tsx, router.ts, mise en page
        ├── core/
        │   ├── session/    api.ts, socket.ts, store.ts, clock.ts, token.ts, history.ts
        │   ├── media/      loader.ts, audio.ts (AudioContext partagé), recorder.ts, sync.ts
        │   ├── ui/         Scoreboard, RankingScreen, Countdown, VotePanel, VoteReveal, SyncedVideoPlayer,
        │   │               AudioRecorder, LevelMeter, PlayerList, HostBar, ConnectionBanner, SoundUnlock…
        │   ├── pages/      HomePage, RoomPage (salon / partie / résultats)
        │   ├── game-host/  GameView (choisit l'écran de la phase), SettingsForm (générique)
        │   └── dev/        galerie des composants avec des données d'exemple (mode dev uniquement)
        ├── games/
        │   ├── registry.ts une entrée par jeu
        │   └── dubbing/    index.ts + un écran par phase
        └── styles/         tokens.css, global.css
```

## 3. Contrats partagés (`shared`)

### 3.1 Contrat d'un jeu

```ts
// shared/src/core/game.ts
export interface GameMeta {
  id: string;            // 'dubbing' : stable, kebab-case
  name: string;          // nom affiché (FR)
  description: string;   // description affichée (FR)
  minPlayers: number;
  maxPlayers: number;
  replayable: boolean;   // false → badge « à usage unique » + suivi du contenu joué
}

// Réglages déclaratifs : formulaire générique dans le salon, validation générique côté serveur
export type SettingDef =
  | { kind: 'int'; label: string; min: number;
      max: number | 'contentLeft';        // 'contentLeft' : nombre de contenus pas encore joués dans le salon
      default: number | 'contentNew' }    // 'contentNew' : inédits pour tous les présents (à défaut, contentLeft)
  | { kind: 'choice'; label: string; options: { value: string; label: string }[]; default: string }
  | { kind: 'boolean'; label: string; default: boolean };

export interface GameContract {
  meta: GameMeta;
  phases: readonly string[];
  settings: Record<string, SettingDef>;
  actions: Record<string, { payload: ZodType; hostOnly?: boolean }>;          // intentions client → serveur
  uploads?: Record<string, { meta: ZodType; mimeTypes: readonly string[] }>; // fichiers client → serveur
}
export const defineContract = <const C extends GameContract>(contract: C) => contract;

export interface GameResults { ranking: { playerId: PlayerId; score: number; rank: number }[] }
```

La vue d'un jeu est une **union discriminée par `phase`**, déclarée dans le même fichier (type seul). Exemple :

```ts
// shared/src/games/dubbing.ts (extrait)
export const dubbing = defineContract({
  meta: { id: 'dubbing', name: 'Doublage', description: '…', minPlayers: 2, maxPlayers: 10, replayable: false },
  phases: ['loading', 'broadcast', 'recording', 'takeLoading', 'takePlaying', 'voting', 'reveal', 'roundResults'],
  settings: {
    rounds: { kind: 'int', label: 'Nombre de manches (vidéos)', min: 1, max: 'contentLeft', default: 'contentNew' },
  },
  actions: {
    ready:  { payload: z.object({ syncId: z.string().max(32) }) },
    vote:   { payload: z.object({ points: z.union([z.literal(0), z.literal(1), z.literal(2)]) }) },
    next:   { payload: z.object({}), hostOnly: true },
    finish: { payload: z.object({}), hostOnly: true },    // terminer la partie après la manche en cours
  },
  uploads: {
    take: {
      meta: z.object({ offsetMs: z.number().int().min(-1000).max(2000),
                       durationMs: z.number().int().min(500).max(40_000) }),
      mimeTypes: ['audio/webm', 'audio/ogg', 'audio/mp4'],
    },
  },
});
export type DubbingView = LoadingView | BroadcastView | RecordingView | /* … */ RoundResultsView;
```

Le client n'importe les contrats qu'en `import type` : zod reste hors du bundle client.

### 3.2 Protocole temps réel (Socket.IO)

Client → serveur. Chaque événement reçoit un accusé `Ack = { ok: true, data? } | { ok: false, error: ErrorCode }`.

| Événement | Charge utile | Autorisé pour |
|---|---|---|
| `clock:ping` | `{ t0 }` → ack `{ t0, server }` | tous |
| `room:leave` | — | tous |
| `room:kick` / `room:transferHost` | `{ playerId }` | hôte |
| `room:selectGame` | `{ gameId }` | hôte, au salon |
| `room:setSettings` | `{ settings }` | hôte, au salon |
| `room:startGame` | — | hôte, au salon |
| `room:close` | — | hôte |
| `game:action` | `{ type, payload }` | participant (hôte si `hostOnly`), phase autorisée |
| `game:skip` | — | hôte, pendant une partie (« Passer à la suite ») |
| `game:abort` | — | hôte, pendant une partie (retour au salon sans résultat) |
| `results:dismiss` | — | hôte, écran de résultats → salon |

Serveur → client :

| Événement | Contenu |
|---|---|
| `room:state` | `RoomView` complet : joueurs, hôte, statut, jeu choisi, réglages, disponibilité des jeux, résultats |
| `game:view` | `{ gameId, seq, view }` : la vue de ce joueur ; `seq` croissant pour ignorer une vue périmée |
| `session:ended` | `{ reason: 'kicked' \| 'closed' \| 'expired' \| 'replaced' }` |

```ts
// shared/src/core/room.ts
export interface PlayerView {
  id: PlayerId; nickname: string; connected: boolean; isHost: boolean;
  role: 'player' | 'waiting';                 // waiting = arrivé pendant une partie
}
export interface RoomView {
  code: string; me: PlayerId; players: PlayerView[];
  status: 'lobby' | 'playing' | 'results';
  selectedGame: GameId | null;
  settings: Record<string, unknown>;          // réglages choisis par l'hôte, déjà validés
  games: { id: GameId; launchable: boolean;
           reason?: 'NOT_ENOUGH_PLAYERS' | 'TOO_MANY_PLAYERS' | 'NO_CONTENT_LEFT';
           contentLeft?: number;              // pas encore joué dans ce salon
           contentNew?: number }[];           // jamais vu par aucun joueur présent
  results: GameResults | null;
}
```

### 3.3 API HTTP

| Route | Auth | Rôle |
|---|---|---|
| `GET /api/health` | — | supervision |
| `GET /api/games` | — | métadonnées et réglages des jeux (accueil, salon) |
| `POST /api/rooms` | — | `{ nickname, history }` → `{ code, token }` ; l'appelant devient hôte |
| `POST /api/rooms/join` | — | `{ code, nickname, history }` → `{ code, token }` ; le code est dans le corps, jamais dans l'URL |
| `POST /api/uploads/:kind` | Bearer | corps binaire + en-tête `X-Upload-Meta` (JSON) → confié au jeu en cours |
| `GET /api/media/:mediaId` | Bearer | prise privée, si le jeu l'autorise à cet instant |
| `GET /api/content/:gameId/:contentId` | Bearer | vidéo, si le jeu l'expose à cet instant |
| `GET /*` | — | client compilé (prod) ; `index.html` pour les routes de l'application |

### 3.4 Codes d'erreur

Le serveur ne renvoie que des codes, que le client traduit en français : `INVALID_PAYLOAD`, `RATE_LIMITED`, `ROOM_NOT_FOUND` (aussi pour un code faux : réponse volontairement générique), `ROOM_FULL`, `NICKNAME_TAKEN`, `NOT_HOST`, `NOT_PARTICIPANT`, `WRONG_PHASE`, `GAME_UNAVAILABLE`, `SESSION_INVALID`, `UNSUPPORTED_MEDIA`, `MEDIA_TOO_LARGE`, plus les codes propres aux jeux (`ALREADY_VOTED`, `PLUS_TWO_USED`, `SELF_VOTE`, `TAKE_LOCKED`…).

## 4. Socle serveur

### 4.1 Salons et sessions

```ts
interface Room {
  id: string;                              // interne, aléatoire : seul identifiant écrit dans les logs
  code: string;                            // 6 car. A–Z0–9 (crypto.randomInt), unique parmi les salons actifs
  hostId: PlayerId;
  players: Map<PlayerId, Player>;          // ordre d'arrivée conservé
  status: 'lobby' | 'playing' | 'results';
  selectedGame: GameId | null;
  settings: Record<string, unknown>;
  runner: GameRunner | null;
  results: GameResults | null;
  played: Map<GameId, Set<ContentId>>;     // contenu déjà joué dans ce salon
  createdAt: number; lastActionAt: number;
}
interface Player {
  id: PlayerId;                            // public, aléatoire (96 bits) : utilisé dans les vues
  tokenHash: string;                       // SHA-256 du jeton ; le jeton lui-même n'est jamais conservé
  nickname: string;
  joinedAt: number;
  socketId: string | null;                 // null = déconnecté
  disconnectedAt: number | null;
  role: 'player' | 'waiting';
  history: Map<GameId, Set<ContentId>>;    // « déjà vu » déclaré par l'appareil
}
```

- **Jeton** : 256 bits (`crypto.randomBytes(32)`, base64url), remis une seule fois et stocké en sessionStorage. Comme ce stockage est propre à chaque onglet, plusieurs onglets donnent plusieurs joueurs, ce qui est pratique pour tester. Il transite dans `auth` au handshake Socket.IO et dans l'en-tête `Authorization`, jamais dans une URL.
- **Onglet dupliqué** (même jeton connecté deux fois) : la nouvelle connexion remplace l'ancienne, qui reçoit `session:ended {replaced}`.
- **Reconnexion** : même jeton → même joueur ; `room:state` et `game:view` sont renvoyés en entier.
- **Déconnexion** : détectée en 20 s au plus (heartbeat Socket.IO réglé à 10 s + 10 s). En partie, le joueur reste « attendu » 60 s, puis le jeu est prévenu et l'hôte est transféré si c'était lui. Au salon, un joueur déconnecté depuis 5 min est retiré.
- **Pseudo** : normalisé (NFC, espaces rognés et fusionnés), 2 à 16 caractères (graphèmes). Autorisés : lettres de toutes langues, chiffres, espace, `- _ . ' !` et emojis. Unique dans le salon (sans tenir compte de la casse). Toujours affiché comme du texte React.
- **Fermeture** : par l'hôte ; au départ du dernier joueur ; après 10 min sans joueur connecté ; après 60 min sans aucune action ; au bout de 12 h dans tous les cas. Toute fermeture supprime les médias du salon.
- **Limites** : 10 joueurs par salon, 100 salons actifs (configurables).

### 4.2 Moteur de jeux

Ce qu'un jeu fournit côté serveur :

```ts
// server/src/core/engine/define-game.ts
export interface GameDefinition<C extends GameContract, S, V extends { phase: PhaseOf<C> }> {
  contract: C;
  setup(ctx: GameContext<C>, init: { players: PlayerId[]; settings: SettingsOf<C> }): S;
  initialPhase: PhaseOf<C>;
  phases: { [P in PhaseOf<C>]: PhaseDef<C, S> };
  view(state: S, viewer: PlayerId, ctx: ViewContext): V;              // pure : ce que CE joueur a le droit de voir
  onSkip?(state: S, ctx: GameContext<C>): void;                       // « Passer à la suite » (hôte)
  onPlayerChange?(state: S, ctx: GameContext<C>, change: PlayerChange): void;
                                                // 'disconnected' | 'reconnected' | 'unawaited' (grâce écoulée) | 'left'
  canRead?(state: S, viewer: PlayerId, ref: MediaRef): boolean;      // accès aux prises et aux contenus
  uploadLimit?(state: S, from: PlayerId, kind: UploadKindOf<C>): number; // octets max acceptés à cet instant
}

export interface PhaseDef<C extends GameContract, S> {
  actions: readonly ActionTypeOf<C>[];     // seules actions acceptées dans cette phase (filtrage par le socle)
  uploads?: readonly UploadKindOf<C>[];    // seuls envois de fichiers acceptés dans cette phase
  next: readonly PhaseOf<C>[];             // transitions permises (vérifiées par ctx.goto)
  enter?(state: S, ctx: GameContext<C>): void;
  on?: { [A in ActionTypeOf<C>]?: (state: S, ctx: GameContext<C>, from: PlayerId, payload: PayloadOf<C, A>) => void };
  onUpload?: { [K in UploadKindOf<C>]?: (state: S, ctx: GameContext<C>, from: PlayerId,
                                         file: StoredMedia, meta: UploadMetaOf<C, K>) => void };
  timer?(state: S, ctx: GameContext<C>, id: string): void;
}

export interface GameContext<C extends GameContract> {
  readonly phase: PhaseOf<C>;
  now(): number;                               // horloge serveur (fausse en test)
  readonly random: Random;                     // crypto en prod, déterministe en test : int(), shuffle(), pick()
  readonly players: Roster;                    // participants : connected, awaited (connecté ou déconnecté < 60 s)
  goto(phase: PhaseOf<C>): void;               // transition déclarée → enter() ; annule les minuteries de la phase
  schedule(id: string, delayMs: number): void; // minuterie technique → phases[phase].timer(id)
  reject(code: string): never;                 // refuse l'action → ack { ok: false, error: code }
  readonly content: ContentAccess;             // jeux non rejouables : pick(), markPlayed(), remaining()
  readonly media: { discard(id: MediaId): void };
  end(results: GameResults): void;             // fin → classement du socle → retour au salon
}
```

Conventions : les gestionnaires sont **synchrones** et **mutent l'état** ; ils **vérifient tout avant de modifier quoi que ce soit** (`ctx.reject` interrompt proprement). L'horloge, l'aléa et les minuteries passent exclusivement par `ctx`, ce qui rend la logique testable sans réseau.

Traitement de chaque `game:action` par le socle (`GameRunner`) :

1. session valide (middleware socket) et débit respecté ;
2. enveloppe `{ type, payload }` valide (zod) ;
3. `type` existe dans le contrat ; si `hostOnly`, l'émetteur est l'hôte ;
4. `type` ∈ `phases[phase courante].actions`, sinon `WRONG_PHASE` ;
5. l'émetteur est un participant (pas `waiting`) ;
6. `payload` valide selon le schéma de l'action ;
7. appel du gestionnaire du jeu (règles métier) ;
8. recalcul de la vue de chaque membre et envoi à ceux dont la vue a changé.

Banc de test fourni par le socle :

```ts
const g = createHarness(dubbingGame, { players: ['a', 'b', 'c'], settings: { rounds: 2 }, seed: 42, content: fakeVideos });
g.act('b', 'vote', { points: 2 });              // → { ok: true } | { ok: false, error }
g.upload('a', 'take', fakeAudio, { offsetMs: 40, durationMs: 9000 });
g.advance(10_000);                               // avance l'horloge et déclenche les minuteries
g.disconnect('c'); g.skip();
expect(g.view('a').phase).toBe('voting');
```

Le moteur lui-même est testé avec un **jeu fictif** (`core/engine/fixtures/`), minimal et absent des registres, qui exerce chaque mécanisme : phases, actions refusées hors phase, action d'hôte, minuteries, « Passer à la suite », déconnexions, fin de partie.

Aides communes : `Barrier` (qui a fini, complet par rapport aux joueurs attendus), `rank(scores)` (classement avec ex æquo : 1, 1, 3).

### 4.3 Contenu (jeux non rejouables)

- Un manifeste par jeu, `CONTENT_DIR/<gameId>/manifest.json`, généré par le script d'import et **validé par zod au démarrage**. Contrôles : ids uniques `[a-z0-9-]`, fichier `.mp4` existant et situé dans le dossier (pas de `../`), durée entre 1 et 30 s. S'il est invalide, le serveur refuse de démarrer avec un message clair.

  ```json
  { "videos": [ { "id": "chat-surpris", "title": "Chat surpris", "file": "chat-surpris.mp4", "durationSec": 8.4 } ] }
  ```

- **Règle ferme** : un contenu n'est jamais proposé deux fois dans un salon (`room.played`).
- **Préférence** : les vidéos inédites pour tous les joueurs présents passent d'abord (d'après l'historique envoyé par leurs appareils), dans un ordre aléatoire ; viennent ensuite les moins vues.
- **Réglages liés au contenu** : `contentLeft` (pas encore joué dans le salon) et `contentNew` (inédit pour tous les présents) sont recalculés à chaque arrivée ou départ de joueur et affichés dans le salon. S'il ne reste aucun contenu, le jeu ne peut pas être lancé.
- Une vidéo est marquée jouée au début de sa diffusion. Si l'hôte termine la partie plus tôt, les vidéos non diffusées restent disponibles.
- Le manifeste n'est jamais envoyé aux clients : on n'expose que la vidéo de la manche en cours (id et durée ; le titre apparaît au classement de la manche).

### 4.4 Médias privés (prises)

- **`MediaStore` en RAM** : identifiants aléatoires de 128 bits générés par le serveur ; quotas de 30 Mo par salon et 300 Mo au total ; durée de vie maximale de 2 h, contrôlée par un balayage chaque minute.
- **Envoi** `POST /api/uploads/take`, dans cet ordre :
  1. jeton valide ;
  2. phase courante acceptant `take` et émetteur participant ;
  3. taille ≤ `uploadLimit`, soit (durée de la vidéo + 3 s) × 40 Ko/s, environ 1 Mo pour 20 s. Contrôle sur `Content-Length`, puis pendant la réception ;
  4. `Content-Type` dans la liste autorisée ;
  5. signature binaire : WebM `1A 45 DF A3`, Ogg `OggS`, MP4 `ftyp` ;
  6. métadonnées validées par zod ;
  7. stockage, puis `onUpload`.
- **Lecture** `GET /api/media/:id` : jeton du même salon et `canRead` du jeu. Réponse avec `Cache-Control: no-store`.
- **Suppression** : à la fin de chaque manche (Doublage), à la fin ou à l'abandon de la partie, à la fermeture ou à l'expiration du salon, et par la durée de vie maximale. Rien n'est jamais écrit sur disque ni dans les logs.

### 4.5 Temps réel

- Socket.IO est attaché au serveur HTTP de Fastify, avec `maxHttpBufferSize` = 16 Ko (les fichiers passent par HTTP).
- **Handshake** : l'en-tête `Origin` doit être l'origine du site. Le jeton est validé par zod puis recherché ; le joueur est rattaché au socket.
- **Débit** : seau à jetons par socket (10 événements/s, rafale de 20 ; budget séparé pour l'horloge). Dépassement → `RATE_LIMITED` ; abus répété → déconnexion. 30 connexions simultanées maximum par IP.
- **Horloge** : `clock:ping` permet à chaque client de calculer son décalage avec l'horloge du serveur (§6.3).

### 4.6 Sécurité HTTP, configuration et logs

- **En-têtes** (`@fastify/helmet`) :
  - CSP : `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' wss://<hôte>; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests` ;
  - HSTS (en prod), `nosniff`, `Referrer-Policy: no-referrer`, COOP/CORP `same-origin` ;
  - `Permissions-Policy: microphone=(self), camera=(), geolocation=()`.
- **CORS** : aucun en-tête CORS, car le client est servi par la même origine (en dev, via le proxy de Vite). Seules les requêtes de même origine aboutissent ; l'origine est vérifiée au handshake Socket.IO.
- **Limitation de débit** (`@fastify/rate-limit`) :
  - création : 5/min/IP ;
  - rejoindre : 20/min/IP ; au-delà de 10 codes faux en 10 min, blocage de 10 min ;
  - envois de fichiers : 10/min/joueur.

  La clé de comptage est un HMAC de l'IP avec un secret tiré au démarrage : aucune IP en clair, même en mémoire.
- **Erreurs** : la réponse contient seulement `{ error: CODE }` ; les traces de pile apparaissent seulement en dev.
- **Logs** (pino, sortie standard) : méthode, motif de route, statut, durée, id interne du salon. Jamais d'IP, de pseudo, de jeton, de code de salon ni de corps de requête.
- **Configuration** (variables d'environnement validées par zod) : `NODE_ENV`, `HOST`, `PORT`, `PUBLIC_ORIGIN`, `TRUST_PROXY`, `CONTENT_DIR`, `LOG_LEVEL`, ainsi que les limites.

## 5. Socle client

### 5.1 Session et état

- Un `SessionStore` (store externe lu avec `useSyncExternalStore`) contient `{ connection, room, game: { gameId, seq, view }, clock }`. Hooks : `useRoom()`, `useGameView<V>()`, `useServerNow()`, `useAct()`.
- Le jeton est en sessionStorage. L'historique « déjà vu » est en localStorage : ids par jeu, 500 au maximum, mis à jour quand une diffusion commence, avec un bouton « Oublier mon historique » sur l'accueil.

### 5.2 Routes

| Route | Contenu |
|---|---|
| `/` | accueil : présentation, jeux du registre (badge « à usage unique »), « Créer une partie », « Rejoindre », mention sur les enregistrements |
| `/join/:code` | accueil avec le code prérempli (converti en majuscules) |
| `/room/:code` | salon, partie ou résultats. Sans jeton → redirection vers `/join/:code` |

Dans le salon : code en grand, bouton « Copier le lien », liste des joueurs avec leur état, choix du jeu et des réglages pour l'hôte (avec le nombre de vidéos inédites et une estimation de la durée).

### 5.3 Son et lecture automatique

- Chrome et Brave autorisent la lecture avec son après un clic sur la page. Le clic sur « Créer » ou « Rejoindre » suffit donc dans le cas normal.
- Deux cas bloquent quand même la lecture : **après un rechargement de page en pleine partie** (aucun clic depuis) et **si Brave bloque la lecture automatique** pour le site. Le bouton « Activer le son » relance alors la lecture à la bonne position synchronisée.
- **Un seul `AudioContext`**, activé au premier geste, joue les prises avec une programmation précise à l'échantillon près.

### 5.4 Composants communs (`client/src/core/ui`)

| Composant | Rôle |
|---|---|
| `Scoreboard` | scores par joueur, avec les gains de la manche |
| `RankingScreen` | classement avec ex æquo ; sert aussi d'écran de fin de partie du socle |
| `Countdown` | compte à rebours vers une échéance serveur (compensée) ou sur une durée locale (le 3-2-1 avant une prise) |
| `VotePanel` | boutons de vote configurables (options, désactivation du +2…) |
| `VoteReveal` | tableau des votes : chaque « +1 » ou « +2 » apparaît puis s'estompe, puis le total s'affiche |
| `SyncedVideoPlayer` | préchargement authentifié → signal « prêt » → départ à `startAt`, avec ou sans son, piste audio externe calée, correction de dérive |
| `AudioRecorder` (+ `useAudioRecorder`, `recordOverVideo`) | enregistrement calé sur une vidéo avec mesure du décalage ; choix du format |
| `LevelMeter` | vumètre : montre que le micro choisi dans le navigateur capte bien, avec une alerte s'il ne capte rien |
| `PlayerList`, `HostBar`, `ConnectionBanner`, `SoundUnlock`, `ConfirmDialog` | éléments du salon et de la partie |

Mise en page pensée pour un écran de PC (vidéo grande, joueurs et commandes autour), qui reste utilisable dans une fenêtre étroite. Textes en français, polices système.

En mode dev seulement, une **galerie des composants** (`/dev/ui`) les affiche avec des données d'exemple, ce qui permet de les vérifier à l'œil sans lancer de partie.

### 5.5 Module de jeu côté client

```ts
// client/src/games/dubbing/index.ts
export default defineClientGame<typeof dubbing, DubbingView>({
  id: 'dubbing',
  screens: {                          // un écran par phase ; TypeScript impose qu'aucune ne manque
    loading: LoadingScreen, broadcast: BroadcastScreen, recording: RecordingScreen,
    takeLoading: TakeScreen, takePlaying: TakeScreen, voting: VotingScreen,
    reveal: RevealScreen, roundResults: RoundResultsScreen,
  },
});

export interface GameScreenProps<C extends GameContract, V> {
  view: V;                                     // vue de la phase courante, typée
  room: RoomView; me: PlayerView; isHost: boolean;
  act<A extends ActionTypeOf<C>>(type: A, payload: PayloadOf<C, A>): Promise<Ack>;
  upload<K extends UploadKindOf<C>>(kind: K, file: Blob, meta: UploadMetaOf<C, K>): Promise<Ack>;
  fetchMedia(ref: MediaRef): Promise<Blob>;    // vidéo ou prise, avec le jeton
}
```

Registres : `server/src/games/registry.ts` et `client/src/games/registry.ts` contiennent chacun une entrée par jeu. Un test vérifie que les deux registres listent les mêmes jeux.

## 6. Flux d'événements

### 6.1 Créer, rejoindre, se reconnecter

```
Hôte                                  Serveur                                   Ami
POST /api/rooms {nickname, history} ─▶ code unique, joueur hôte, jeton
               ◀─ {code, token}        (token → sessionStorage)
io.connect(auth: {token}) ───────────▶ origine + jeton vérifiés → socket rattaché
               ◀─ room:state
lien /join/ABC123 ──────────────────────────────────────────────────────────▶ ouvre le lien
                                       ◀─ POST /api/rooms/join {code, nickname, history}
                                       débit, codes faux, salon plein, pseudo pris
                                       ─▶ {code, token}
                                       ◀─ io.connect(auth: {token})
               ◀─ room:state ──────────┴──────────────────── room:state ────────────▶

Reconnexion : Socket.IO se reconnecte seul (ou la page est rechargée) avec le même jeton
  → joueur retrouvé → room:state + game:view complets.
  Jeton inconnu (salon fermé ou expiré, joueur exclu) → session:ended → accueil avec un message.
```

### 6.2 Du salon à la partie, et retour

```
Hôte : room:selectGame → room:setSettings → room:startGame
Serveur : vérifie hôte, statut lobby, min ≤ joueurs ≤ max, contenu restant
  → GameRunner(définition, participants = joueurs présents) → setup → enter(initialPhase)
  → room:state {status: 'playing'} + game:view à chacun
  … partie …
Jeu : ctx.end(results) → room:state {status: 'results', results} → RankingScreen
Hôte : results:dismiss → retour au salon ; les joueurs « waiting » deviennent joueurs
À tout moment : game:skip (« Passer à la suite »), game:abort (retour au salon sans résultat)
```

### 6.3 Horloge et départ synchronisé

```
Client : clock:ping {t0} ─▶ ack {t0, server}, reçu à t1
  rtt = t1 − t0 ; offset = server − (t0 + t1) / 2 ; on garde l'échantillon au plus petit RTT
  (5 à la connexion, puis 1 toutes les 30 s et à chaque retour sur l'onglet)
Serveur : startAt = maintenant + 1,5 s (configurable)
Client : départ local = startAt − offset. En retard ? Démarrage à la position (maintenant − départ).
  Pendant la lecture, la vidéo est recalée si elle dérive de plus de 80 ms ; la piste audio sert d'horloge maître.
```

### 6.4 Une manche de Doublage

```
Serveur (dubbing)                                  Chaque client
loading      pick() d'une vidéo, syncId
             vue {video, syncId, ready}      ────▶ GET /api/content/dubbing/<id> (Bearer) → Blob
                                             ◀──── game:action ready {syncId}
             tous les connectés prêts | skip
broadcast    vue {startAt}                   ────▶ lecture avec le son à startAt ; vidéo notée « déjà vue »
             minuterie : fin de vidéo + 0,5 s
recording    vue {validated: [...]}          ────▶ revoir / enregistrer / réécouter / recommencer (en local)
                                             ◀──── POST /api/uploads/take (audio + offsetMs) = validation
             contrôles → MediaStore → validated += joueur → vues renvoyées à tous
             toutes les prises des joueurs attendus | skip → ordre aléatoire des joueurs ayant une prise
takeLoading  présentateur p, syncId
             vue {presenter, take}           ────▶ GET /api/media/<id> (Bearer) → décodage
                                             ◀──── ready {syncId}
takePlaying  vue {startAt}                   ────▶ vidéo muette + prise calée sur startAt
             minuterie : fin de vidéo
voting       vue {voted: [...], canUsePlusTwo} ──▶ VotePanel (sauf pour p)
                                             ◀──── vote {points}
             tous les votants attendus | skip
reveal       vue {votes, total}              ────▶ VoteReveal (animation)
                                             ◀──── next (hôte) → takeLoading (suivant) | roundResults
roundResults prises de la manche supprimées ; vue {scores}
                                             ◀──── next (hôte) → loading (manche suivante) | fin
                                             ◀──── finish (hôte) → fin : ctx.end(classement)
```

### 6.5 Déconnexions et « Passer à la suite »

```
Socket perdu → joueur affiché « déconnecté » à tous, encore attendu pendant 60 s
  → après 60 s : onPlayerChange('unawaited') → le jeu revérifie ses conditions
    (ex. tous les autres ont validé → phase suivante) ; si c'était l'hôte → transfert
  → s'il revient : onPlayerChange('reconnected'), vue complète, il reprend
Chargements : on n'attend que les joueurs connectés (un retardataire rattrape en cours de lecture).
Étapes de jeu (prise, vote) : on attend les joueurs attendus (connectés, ou déconnectés depuis moins de 60 s).
Hôte : game:skip, après une confirmation qui liste les joueurs qu'on n'attendra plus → onSkip :
  chargement → départ sans eux ; enregistrement → clôture (sans prise = pas présenté) ;
  vote → clôture (sans vote = 0)
```

## 7. Doublage (`dubbing`)

### 7.1 Machine à états

```
 loading ──(tous prêts | skip)──▶ broadcast ──(fin de vidéo)──▶ recording
                                                                   │ (toutes les prises | skip)
                                                                   ▼
          ┌────────────▶ takeLoading ──(tous prêts | skip)──▶ takePlaying ──(fin de vidéo)──▶ voting
          │                                                                                    │
          │ next (hôte), s'il reste des joueurs                             (tous ont voté | skip)
          │                                                                                    ▼
          └──────────────────────────────────────────────────────────────────────────────── reveal
                                                                                               │ next (hôte), dernier joueur
                                                                                               ▼
 loading ◀── next (hôte), s'il reste des manches ────────────────────────────────────── roundResults
                                                                                               │ next après la dernière manche,
                                                                                               │ ou finish (hôte) à tout moment
                                                                                               ▼
                                                              ctx.end(classement) → écran final du socle → salon
```

Si personne n'a de prise validée, la partie passe directement de `recording` à `roundResults`.

| Phase | Actions et envois acceptés | Passage à la suite |
|---|---|---|
| `loading` | `ready {syncId}` | tous les connectés prêts, ou skip → `broadcast` |
| `broadcast` | — | minuterie serveur (durée + marge) → `recording` |
| `recording` | envoi `take` | prises de tous les joueurs attendus, ou skip → `takeLoading` / `roundResults` |
| `takeLoading` | `ready {syncId}` | tous les connectés prêts, ou skip → `takePlaying` |
| `takePlaying` | — | minuterie serveur → `voting` |
| `voting` | `vote {points}` | tous les votants attendus ont voté, ou skip → `reveal` |
| `reveal` | `next` (hôte) | `takeLoading` (joueur suivant) ou `roundResults` |
| `roundResults` | `next`, `finish` (hôte) | `next` : `loading` (manche suivante) ou fin après la dernière ; `finish` : fin |

### 7.2 Règles vérifiées par le serveur

- Toute action n'est acceptée que dans sa phase ; `next` et `finish` sont réservés à l'hôte (contrôles du socle).
- **Prise** : phase `recording` ; émetteur participant ; pas déjà validée (une prise validée est verrouillée) ; type, signature et taille conformes (limite calculée sur la durée de la vidéo) ; métadonnées bornées.
- **Vote** : le votant est un participant différent du présentateur ; un seul vote par présentation, définitif ; points ∈ {0, 1, 2} ; le +2 est utilisable une fois par manche et par votant.
- **Prêt** : `syncId` de l'étape en cours uniquement.
- **Accès aux fichiers** :
  - la vidéo de la manche est accessible seulement pendant cette manche ;
  - la prise d'un joueur n'est accessible que pendant sa propre présentation (`takeLoading` à `reveal`), jamais pendant l'enregistrement.

### 7.3 Vues

```ts
type Base = { round: number; rounds: number };
type DubbingView =
  | Base & { phase: 'loading'; video: VideoRef; syncId: string; ready: PlayerId[] }
  | Base & { phase: 'broadcast'; video: VideoRef; startAt: number }
  | Base & { phase: 'recording'; video: VideoRef; validated: PlayerId[]; mine: 'pending' | 'validated' }
  | Base & { phase: 'takeLoading' | 'takePlaying'; video: VideoRef; presenter: PlayerId;
             take: { mediaId: MediaId; offsetMs: number }; syncId: string; startAt: number | null }
  | Base & { phase: 'voting'; presenter: PlayerId; voted: PlayerId[];          // qui a voté, jamais combien
             myVote: 0 | 1 | 2 | null; canUsePlusTwo: boolean; isPresenter: boolean }
  | Base & { phase: 'reveal'; presenter: PlayerId; votes: { voter: PlayerId; points: 0 | 1 | 2 | null }[]; total: number }
  | Base & { phase: 'roundResults'; videoTitle: string; last: boolean;
             scores: { playerId: PlayerId; roundPoints: number; total: number; rank: number }[] };
type VideoRef = { contentId: string; durationMs: number };
```

### 7.4 Enregistrement et synchro audio/vidéo (client)

- **Micro** : demandé à l'entrée dans la phase d'enregistrement.
  - Le micro utilisé est celui choisi dans le navigateur : dans la fenêtre d'autorisation, ou ensuite dans `chrome://settings/content/microphone`. Le vumètre montre s'il capte bien avant de lancer une prise.
  - En cas de refus, un message explique comment autoriser le micro dans Chrome ou Brave ; l'hôte pourra passer la phase.
  - Le micro est coupé entre deux prises, ce qui éteint l'indicateur d'enregistrement du navigateur.
- **Rappel discret** pendant l'enregistrement : « Mets-toi en sourd et muet sur Discord ». C'est déjà votre habitude ; le rappel évite juste un oubli.
- **Revoir** : la vidéo, avec le son, autant de fois que voulu ; c'est impossible pendant une prise.
- **Enregistrer** :
  1. compte à rebours 3-2-1 sur la première image ;
  2. `MediaRecorder.start()` ; l'instant `tRec` est relevé à l'événement `start` ;
  3. la vidéo repart muette depuis 0 ; l'instant `tVid` de la première image affichée est relevé avec `requestVideoFrameCallback` ;
  4. arrêt automatique à la fin de la vidéo ;
  5. `offsetMs = tVid − tRec` est conservé avec la prise.
- **Réécouter** : vidéo muette et prise décodée ; la prise est lue à partir de `offsetMs` pour que la première image coïncide. On peut recommencer autant de fois que voulu.
- **Valider** : seule la dernière prise est envoyée. Les autres sont jetées : elles ne quittent jamais l'appareil et ne sont jamais écrites sur disque. La prise envoyée est ensuite verrouillée.
- **Format**, par ordre de préférence : `audio/webm;codecs=opus` (Chrome, Brave, Firefox), puis `audio/ogg;codecs=opus` et `audio/mp4` en secours. Débit demandé : 96 kbit/s. Les options `echoCancellation`, `noiseSuppression` et `autoGainControl` sont activées.

### 7.5 Contenu : liste de sélection et import

1. Télécharge tes vidéos entières et place-les dans `content/dubbing/`, à côté de `selection.txt`. Le format importe peu (MP4, WebM, MKV…) : le script convertit.
2. Dans `selection.txt`, écris une ligne par extrait sous la forme `source | début | fin | titre` :
   - **source** : le nom du fichier, cherché dans le dossier de `selection.txt`. Ce peut aussi être une URL, que le script télécharge lui-même via yt-dlp ;
   - **début** et **fin** : en secondes (`10`) ou en minutes:secondes (`1:03`) ;
   - **titre** : le nom affiché dans le jeu (sans `|`).

   Les lignes qui commencent par `#` sont des commentaires.

```
# source         | début | fin  | titre
chiendrole.mp4   | 10    | 19   | Chien drôle
extrait-film.mkv | 1:03  | 1:15 | Le dîner
https://www.youtube.com/watch?v=XXXXXXXXXXX | 0:12 | 0:27 | Chat surpris
```

Puis une commande (étape 4) :

```bash
npm run videos:import -- content/dubbing/selection.txt            # ajoute la sélection
npm run videos:import -- content/dubbing/selection.txt --replace  # archive l'ancienne sélection d'abord
```

Pour chaque ligne, le script :
1. télécharge la source avec yt-dlp si c'est une URL, ou lit le fichier local ;
2. découpe l'extrait et le convertit en MP4 H.264 + AAC « faststart » avec ffmpeg ;
3. mesure la durée réelle, génère l'id à partir du titre et écrit l'entrée dans `manifest.json`.

Fonctionnement :
- les lignes déjà importées sont ignorées ;
- une ligne en erreur est signalée sans bloquer les autres ;
- une durée hors de 1 à 30 s est refusée (5 à 20 s recommandées).

Prérequis sur la machine où l'on importe : `sudo apt install ffmpeg`, plus yt-dlp (`pipx install yt-dlp`) seulement si tu utilises des URL. Dans ce cas, c'est à toi de vérifier les droits sur les extraits et les conditions de la plateforme.

- **Pas de lecture directe depuis YouTube, TikTok…**, pour trois raisons :
  - le lecteur intégré enverrait l'IP de chaque joueur à un tiers, ce qu'interdit le cahier des charges ;
  - il ne permet pas un contrôle fin : préchargement, départ synchronisé, relecture muette pour le doublage ;
  - il ajouterait des publicités, et une vidéo supprimée casserait la partie.
- **En production**, le dossier `content/` se copie sur le serveur (rsync), sans passer par git (étape 8).

## 8. Sécurité : exigence → mécanisme

| Exigence du cahier des charges | Mécanisme |
|---|---|
| Serveur autoritaire | pipeline du `GameRunner` (schéma, phase, hôte, participant) + règles métier vérifiées avant toute mutation |
| Jeton ≥ 128 bits, reconnexion | 256 bits, stocké haché (SHA-256), sessionStorage, jamais dans une URL |
| Aucun id de joueur venant du client accepté tel quel | identité déduite du jeton ; les ids passés en paramètre (exclusion, transfert) sont vérifiés dans la liste du salon |
| Prises : type MIME et taille | liste autorisée + signature binaire + limite calculée sur la durée de la vidéo, contrôlée pendant la réception |
| Noms générés par le serveur, accès réservé, jamais en statique | ids aléatoires de 128 bits, route authentifiée + `canRead`, `no-store`, RAM uniquement |
| Suppression (fin de partie, fermeture, expiration, plantage) | fin de chaque manche, fin ou abandon de partie, fermeture ou expiration du salon, durée de vie de 2 h ; RAM seulement, donc rien ne subsiste après un plantage |
| Aucun contenu audio dans les logs | corps de requête jamais journalisés, sérialiseurs de logs restreints |
| Expiration des salons, nombre max de joueurs | balayage : 10 min sans joueur connecté, 60 min sans action, 12 h maximum ; 10 joueurs |
| Limitation de débit, `maxHttpBufferSize` | `@fastify/rate-limit` (création, rejoindre, codes faux, envois) ; seau à jetons par socket ; 16 Ko |
| Pseudos | normalisation + liste de caractères + longueur + unicité ; affichage en texte React ; `dangerouslySetInnerHTML` interdit par ESLint |
| En-têtes, CSP, CORS, erreurs génériques | helmet + CSP stricte ; même origine sans CORS ; origine vérifiée sur Socket.IO ; `{ error: CODE }` en prod |
| Aucun traqueur ni ressource tierce | polices système, aucun CDN, CSP `'self'` |
| Logs minimaux | sortie standard ; ni IP, ni pseudo, ni jeton, ni code ; clés de débit = HMAC de l'IP |
| HTTPS | prod derrière un proxy inverse (Caddy recommandé, étape 8) ; en dev depuis un autre PC du réseau local, certificat auto-signé |
| Dépendances réduites, `npm audit` | liste ci-dessous ; `npm audit` à chaque fin d'étape |

Dépendances d'exécution prévues :

- serveur : `fastify`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/static`, `socket.io`, `zod` ;
- client : `react`, `react-dom`, `socket.io-client`.

Dépendances de développement : `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier`, `@types/*`, puis Playwright à l'étape 7. Outils système pour l'import : ffmpeg, yt-dlp (hors npm).

## 9. Tests

- **Unitaires** (Vitest, sans réseau) :
  - schémas partagés ; codes et jetons ; règles de pseudo ;
  - `RoomManager` (horloge simulée : reconnexion, grâce, transfert d'hôte, expiration) ;
  - limiteur de débit ; `MediaStore` (durée de vie, quotas) ; signatures de fichiers ;
  - `GameRunner`, testé avec le jeu fictif (phase, hôte, participant, annulation des minuteries, « Passer à la suite », fin) ;
  - logique de Doublage, avec le banc de test ;
  - parsing de la liste de sélection et génération du manifeste ;
  - côté client, les fonctions pures : calcul du décalage d'horloge, calcul du départ synchronisé, choix du format d'enregistrement, historique.
- **Intégration** : routes HTTP avec `fastify.inject` (création, rejoindre, limites, en-têtes, envois) ; vrai serveur Socket.IO sur un port éphémère avec `socket.io-client` et le jeu fictif enregistré pour le test (lancement, actions, vues par joueur, reconnexion, retour au salon).
- **Bout en bout** (étape 7) : Playwright avec Chromium, le moteur de Chrome et Brave, donc la cible réelle. Un contexte de navigateur par joueur, faux micro (`--use-fake-device-for-media-stream`, `--use-file-for-fake-audio-capture`).
- **Tests manuels** : à chaque étape, une procédure sur Chrome, puis une vérification sur Brave.

## 10. Découpage par étapes

| Étape | Contenu |
|---|---|
| 2. Socle | monorepo et outillage (TS, ESLint, Prettier, Vitest) ; config ; Fastify + en-têtes de sécurité ; Socket.IO + authentification ; salons (créer, rejoindre, quitter, exclure, transférer l'hôte, reconnexion, expiration) ; limitation de débit ; horloge ; accueil (liste des jeux du registre, pour l'instant vide), `/join/:code`, salon d'attente ; bandeau de connexion ; tests ; HTTPS local pour tester depuis un autre PC |
| 3. Plugins | moteur (`defineGame`, `GameRunner`, contexte, minuteries, banc de test) validé par le jeu fictif ; côté salon : choix du jeu, réglages génériques, lancement, abandon, « Passer à la suite », écran de résultats ; registres ; `Scoreboard`, `RankingScreen`, `Countdown` ; galerie des composants (dev). Sans jeu réel, le test manuel se limite à la galerie ; le lancement d'une partie est couvert par les tests d'intégration, puis testé à la main dès l'étape 4. |
| 4. Doublage (1) | script d'import (liste de sélection) + bibliothèque de contenu ; `MediaStore` + envoi + signatures ; `SyncedVideoPlayer`, « Activer le son » ; `AudioRecorder`, `LevelMeter` ; phases `loading` → `recording` ; tests |
| 5. Doublage (2) | présentation synchronisée (`takeLoading`, `takePlaying`) ; lecture des prises et règles d'accès ; `VotePanel`, `VoteReveal` ; règles de vote ; tests |
| 6. Doublage (3) | enchaînement des manches, classements intermédiaires et final, « Terminer la partie » ; nombre de manches par défaut = vidéos inédites ; suivi du contenu joué (salon + historique des appareils) ; suppression des prises en fin de manche ; tests |
| 7. Sécurité et E2E | passe sécurité complète, tests Playwright multi-joueurs, corrections, rapport des risques restants |
| 8. Déploiement | build de production, variables d'environnement, HTTPS (Caddy), recommandations d'hébergement, copie du contenu |

## 11. Risques et points d'attention

1. **Appel Discord** : comme vous vous mettez en sourd et muet pendant l'enregistrement, les voix de l'appel ne sont pas captées et personne n'entend la prise avant la présentation. Il reste un point pendant les diffusions et les présentations : avec des haut-parleurs et le micro Discord ouvert, le son de la vidéo repart dans l'appel, ce qui fait de l'écho. Parade : un casque, ou le micro Discord coupé pendant la lecture.
2. **Mauvais micro** : un PC a souvent plusieurs micros (webcam, casque). On le choisit dans le navigateur, et le vumètre avec son alerte de silence rend l'erreur visible avant la prise.
3. **Lecture automatique** : elle est bloquée après un rechargement de page en pleine partie, ou si Brave bloque la lecture automatique pour le site. Parade : le bouton « Activer le son ».
4. **Brave** : ses protections anti-empreinte (Shields) perturbent légèrement les mesures audio (sans effet sur l'enregistrement ni la lecture) et peuvent bloquer la lecture automatique. À tester dès l'étape 4. S'il pose trop de problèmes, on passe à Chrome uniquement.
5. **H.264 sous Linux** : Chrome et Brave le lisent. Le « Chromium » des dépôts Linux, lui, peut ne pas le lire. Si un joueur est dans ce cas, le script d'import pourra produire du WebM (VP9/Opus) à la place.
6. **Précision de la synchro** : l'objectif est moins de 50 ms entre l'audio et la vidéo sur un même appareil, et environ 100 ms entre appareils. Le décalage mesuré compense l'écart au démarrage de l'enregistreur et de la vidéo, mais pas la latence matérielle du micro (quelques dizaines de ms).
7. **Parties longues** : avec toutes les vidéos, compter 3 à 6 min par vidéo à 6 joueurs, soit 1 h à 1 h 15 pour 15 vidéos.

   | Étape | Durée |
   |---|---|
   | diffusion | ≈ 20 s |
   | enregistrement | 30 s à 3 min |
   | 6 présentations × 30 s (vidéo 15 s, vote ≈ 5 s, tableau animé ≈ 5 s, clic de l'hôte) | ≈ 3 min |
   | classement de la manche | ≈ 15 s |

   D'où une reconnexion transparente (vues complètes renvoyées) et « Terminer la partie » à la fin de n'importe quelle manche.
8. **Tester depuis un autre PC en dev** : le micro exige HTTPS hors `localhost`. On génère donc un certificat auto-signé avec openssl, déjà présent sur ta machine, et chaque navigateur accepte l'avertissement une fois.
