# Architecture — mini-jeux

> **Status: plan validated at step 1.** To be kept up to date at every architecture change.
> Functional reference: [requirements.md](requirements.md). The deliberate deviations from these requirements are flagged in §0.
> The TypeScript blocks are sketches of interfaces meant for validation, not final code.

## 0. Decisions

### 0.1 Settled together

| Topic                    | Decision                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocking situations      | No game timer. The host has a "Passer à la suite" (skip to next) button (with confirmation) at every waiting step. A disconnected player is no longer waited for after 60 s; if they come back, they resume where the game is. No validated take → not presented in the round; no vote → 0.                                                                                                           |
| Players                  | Dubbing: 2 to 10. Room: 10 players max (configurable).                                                                                                                                                                                                                                                                                                                                                |
| Rounds                   | A round = a video. By default, the game plays **all the videos not yet played in the room**, in a random order. The host can choose fewer and can **end the game after any round** (final ranking; the unplayed videos remain available). Expected rhythm: 2 evenings a year, with new videos added in between.                                                                                       |
| History between evenings | **None** (removed at step 5 at the user's request): the only rule is that a video is never replayed in the same room. Nothing is kept on the devices.                                                                                                                                                                                                                                                 |
| Game context             | Remote, everybody in a Discord call: each device plays the sound. Everybody deafens and mutes themselves on Discord while recording.                                                                                                                                                                                                                                                                  |
| Devices and browsers     | **Desktop PC only, on Windows or Linux, with Chrome or Brave (Chromium).** Brave stays supported as long as it does not cause too many blockages; otherwise, we switch to Chrome only. Firefox "best effort": the code stays standard, but it is not tested at every step. Safari, iPhone, Mac and mobiles are out of target. **Deliberate deviation** from the requirements (§ Browser constraints). |
| Test game                | **None for now.** The engine is validated by automatic tests using a fake game that only exists in the tests (never on the site). **Deliberate deviation** from the requirements (step 3).                                                                                                                                                                                                            |
| Videos                   | You drop already-trimmed clips (MP4) in `content/dubbing/` and list them in `selection.txt` (`file \| title`). The server reads the duration and the format itself; no import script and no ffmpeg (§7.5).                                                                                                                                                                                            |

### 0.2 Technical choices made

1. **Contract shared per game** in `shared/src/games/<id>.ts` (metadata, phases, settings, action schemas, view types). Adding a game = 2 folders + this file + 1 entry per registry.
2. **Node 24 runs the server's TypeScript directly** (_type stripping_, checked on your machine with the workspaces): neither tsx nor a server compilation; `tsc` is only used to check the types. Constraint: "erasable" TypeScript syntax (no `enum` or `namespace`).
3. **TypeScript 6.0 and not 7.0**: typescript-eslint requires TypeScript < 6.1.
4. **Audio takes with MediaRecorder**, in the native format of Chrome and Brave (WebM/Opus), playable everywhere in the target. No plan B needed any more.
5. **Takes kept in RAM only** and deleted as soon as each round ends, which is stricter than "end of game". A crash leaves nothing on disk.
6. **Rhythm**: the technical chainings are automatic (loading finished → playback; end of video → next step; all votes received → reveal). The friendly chainings are driven by the host ("Joueur suivant", "Manche suivante", "Terminer la partie", "Retour au salon") to leave time to comment in voice chat.
7. **Arrival during a game**: you enter the room, you see "Partie en cours" (game in progress) and you play the next one.
8. **Host**: automatic transfer after 60 s of disconnection (to the connected player who arrived earliest). Manual transfer and kicking a player are possible.
9. **Technical id `dubbing`** for Doublage (the displayed name stays free).
10. **No external router or state manager** (3 routes, a small home-made store). Styles in CSS Modules, system fonts.
11. **URL paths**: `/`, `/join/ABC123`, `/room/ABC123`.

> Update: the display fonts (titles, presenter's line) were added later, with the art direction. They are not distributed with the repository (see the README, "Fonts").

## 1. Overview

```
 Browsers (1 per player)                              Node 24 server (a single process)
 ┌──────────────────────────────┐   HTTPS + Bearer    ┌─────────────────────────────────────────┐
 │ React (Vite)                 │ ──────────────────▶ │ Fastify: /api/*  +  client files        │
 │  core/  session, media,      │                     │  core/rooms    rooms, sessions          │
 │         common components    │   WebSocket         │  core/engine   game engine              │
 │  games/<id>/  screens        │ ◀────────────────▶  │  core/media    takes (RAM, TTL)         │
 │                              │   (Socket.IO)       │  core/content  video lists              │
 │ sessionStorage: token        │                     │  games/<id>/   state machines           │
 │                              │                     │  100% in-memory state                   │
 └──────────────────────────────┘                     └─────────────────────────────────────────┘
```

Principles:

- **Authoritative server.** The state lives on the server. The client sends _intentions_ (`vote {points: 2}`), the server checks everything (schema, phase, rights, rules) then broadcasts.
- **One view per player.** The server never sends its raw state: `view(state, player)` builds what this player is allowed to see. These are complete snapshots (no diffs), so a reconnection simply amounts to sending the view again.
- **Foundation and games separated.** `core/` knows no game. A game plugs in its phases, rules and screens through fixed interfaces. The foundation enforces the generic checks (current phase, host, participant, schema).
- **HTTP for what is one-off or binary** (create or join a room, upload or read a media), **Socket.IO for everything else.**

## 2. Tree

```
mini-jeux/
├── package.json            workspaces + root scripts (dev, check, test, build, start…)
├── tsconfig.base.json · eslint.config.js · .prettierrc · .nvmrc (24) · .env.example
├── playwright.config.ts    end-to-end tests (installed Chrome and Brave)
├── design/                 sources of the art direction: annotated moodboard, original fonts' notes (outside the bundle)
├── deploy/                 systemd unit (--user), Caddyfile, post-receive hook: see docs/deployment.md
├── docs/                   requirements, architecture, security review, deployment
├── scripts/                dev.ts (server + client in parallel), certs.ts (local HTTPS), content-check.ts
├── tests/                  registries.test.ts ; e2e/ (test production server, Playwright scenarios)
├── content/                games' content, outside git (only the examples are versioned)
│   └── dubbing/
│       ├── selection.txt   the list of videos: "file | title"
│       └── *.mp4           the clips, already trimmed
├── shared/src/
│   ├── index.ts
│   ├── core/
│   │   ├── limits.ts       constants (lengths, sizes, max players…)
│   │   ├── schemas.ts      zod: code, nickname, HTTP bodies, socket payloads
│   │   ├── protocol.ts     typed Socket.IO events, Ack, error codes
│   │   ├── room.ts         RoomView, PlayerView
│   │   └── game.ts         GameMeta, SettingDef, GameContract, defineContract, derived types (PhaseOf, PayloadOf…)
│   └── games/
│       └── dubbing.ts      contract + view types
├── server/src/
│   ├── index.ts            start-up, clean shutdown
│   ├── app.ts              buildApp(config): Fastify + Socket.IO (reused by the tests)
│   ├── config.ts           environment variables validated by zod
│   ├── core/
│   │   ├── http/           security.ts (helmet/CSP, origin), errors.ts, rooms.routes.ts, client.ts ; later uploads/media/content
│   │   ├── realtime/       io.ts (auth, origin, rate, handlers)
│   │   ├── rooms/          room-manager.ts (rooms, sessions, host, expiry through sweep())
│   │   ├── engine/         types.ts (defineGame), runner.ts, validate.ts, settings.ts, helpers.ts (Barrier, rank),
│   │   │                   random.ts, scheduler.ts, harness.ts (createHarness)
│   │   │   └── fixtures/   fake game used only by the engine tests
│   │   ├── content/        library.ts (selection.txt + MP4 headers), tracker.ts (already played)
│   │   ├── media/          media-store.ts (RAM, TTL, quotas), sniff.ts (file signatures)
│   │   └── lib/            random.ts (crypto, token hashing), time.ts, rate-limit.ts, origin.ts, client-ip.ts, validation.ts, errors.ts
│   └── games/
│       ├── registry.ts     one entry per game
│       └── dubbing/        index.ts, phases.ts, views.ts, scoring.ts + tests
└── client/
    ├── index.html · vite.config.ts
    └── src/
        ├── main.tsx
        ├── app/            App.tsx, router.ts, layout
        ├── core/
        │   ├── session/    api.ts, session.ts, context.ts, clock.ts, storage.ts, errors.ts
        │   ├── media/      loader.ts, audio.ts (shared AudioContext), recorder.ts, sync.ts
        │   ├── ui/         Scoreboard, RankingScreen, Countdown, VotePanel, VoteReveal, SyncedVideoPlayer,
        │   │               AudioRecorder, LevelMeter, PlayerList, HostBar, ConnectionBanner, SoundUnlock…
        │   ├── pages/      HomePage, RoomPage (room / game / results)
        │   ├── game-host/  client-game.ts (defineClientGame), GamePanel + SettingsForm (room),
        │   │               GameView (phase screen + host bar), ResultsView
        │   └── dev/        gallery of the components with sample data (dev mode only)
        ├── games/
        │   ├── registry.ts one entry per game
        │   └── dubbing/    index.ts + one screen per phase
        ├── assets/fonts/   (not versioned) self-hosted fonts, see the README
        └── styles/         tokens.css (palette, radii, fonts), fonts.css, global.css (background, buttons, cards)
```

## 3. Shared contracts (`shared`)

### 3.1 A game's contract

```ts
// shared/src/core/game.ts
export interface GameMeta {
  id: string; // 'dubbing': stable, kebab-case
  name: string; // displayed name (FR)
  description: string; // displayed description (FR)
  minPlayers: number;
  maxPlayers: number;
  playerCounts?: readonly number[]; // only these numbers of players are allowed (e.g. [5, 10])
  replayable: boolean; // false → "single use" badge + tracking of the played content
}

// Declarative settings: generic form in the room, generic validation on the server
export type SettingDef =
  | {
      kind: 'int';
      label: string;
      min: number;
      // Step 4: 'contentLeft' = number of contents not yet played in the room
      max: number | 'contentLeft';
      // 'contentLeft' = all the content not yet played in the room
      default: number | 'contentLeft';
    }
  | { kind: 'choice'; label: string; options: { value: string; label: string }[]; default: string }
  | { kind: 'boolean'; label: string; default: boolean }
  // Checkboxes; value: list of the checked options, in the order of the options. By default,
  // all the options that are not greyed out. Option: { value, label, locked?, disabled?, note?,
  // minWhenChecked? } (locked = always checked; disabled = never; minWhenChecked = if
  // checked, at least N options are needed). isValidMulti() is shared by the server and the form.
  | { kind: 'multi'; label: string; options: MultiOption[]; min: number };

export interface GameContract {
  meta: GameMeta;
  phases: readonly string[];
  settings: Record<string, SettingDef>;
  actions: Record<string, { payload: ZodType; hostOnly?: boolean }>; // client → server intentions
  uploads?: Record<string, { meta: ZodType; mimeTypes: readonly string[] }>; // step 4: client → server files
  errors: readonly string[]; // error codes of the game's rules; French messages on the client side
}
export const defineContract = <const C extends GameContract>(contract: C) => contract;

// Raw scores given by the game at the end; the foundation computes the ranking (ties included).
export interface ScoreEntry {
  playerId: string;
  score: number;
}
```

A game's view is a **union discriminated by `phase`**, declared in the same file (type only). Example:

```ts
// shared/src/games/dubbing.ts (excerpt)
export const dubbing = defineContract({
  meta: {
    id: 'dubbing',
    name: 'Doublage',
    description: '…',
    minPlayers: 2,
    maxPlayers: 10,
    replayable: false,
  },
  phases: [
    'loading',
    'broadcast',
    'recording',
    'takeLoading',
    'takePlaying',
    'voting',
    'reveal',
    'roundResults',
  ],
  settings: {
    rounds: {
      kind: 'int',
      label: 'Nombre de manches (vidéos)',
      min: 1,
      max: 'contentLeft',
      default: 'contentLeft',
    },
  },
  actions: {
    ready: { payload: z.object({ syncId: z.string().max(32) }) },
    vote: { payload: z.object({ points: z.union([z.literal(0), z.literal(1), z.literal(2)]) }) },
    next: { payload: z.object({}), hostOnly: true },
    finish: { payload: z.object({}), hostOnly: true }, // end the game after the current round
  },
  errors: ['ALREADY_VOTED', 'PLUS_TWO_USED', 'SELF_VOTE', 'TAKE_LOCKED'],
  uploads: {
    take: {
      meta: z.object({
        offsetMs: z.number().int().min(-1000).max(2000),
        durationMs: z.number().int().min(500).max(40_000),
      }),
      mimeTypes: ['audio/webm', 'audio/ogg', 'audio/mp4'],
    },
  },
});
export type DubbingView = LoadingView | BroadcastView | RecordingView | /* … */ RoundResultsView;
```

The client only imports the contracts with `import type`: zod stays out of the client bundle.

### 3.2 Real-time protocol (Socket.IO)

Client → server. Every event receives an acknowledgement `Ack = { ok: true, data } | { ok: false, error }`, where `error` is a foundation code or a code declared in the game's `errors`.

| Event                             | Payload                         | Allowed for                                            |
| --------------------------------- | ------------------------------- | ------------------------------------------------------ |
| `clock:ping`                      | `{ t0 }` → ack `{ t0, server }` | everybody                                              |
| `room:leave`                      | —                               | everybody                                              |
| `room:kick` / `room:transferHost` | `{ playerId }`                  | host                                                   |
| `room:setSettings`                | `{ settings }`                  | host, in the room                                      |
| `room:startGame`                  | —                               | host, in the room                                      |
| `room:close`                      | —                               | host                                                   |
| `game:action`                     | `{ type, payload }`             | participant (host if `hostOnly`), allowed phase        |
| `game:skip`                       | —                               | host, during a game ("Passer à la suite")              |
| `game:abort`                      | —                               | host, during a game (back to the room without results) |
| `results:dismiss`                 | —                               | host, results screen → room                            |

Server → client:

| Event           | Content                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `room:state`    | Complete `RoomView`: players, host, status, chosen game, settings, availability of the games, results |
| `game:view`     | `{ gameId, runId, seq, view }`: this player's view; `runId` identifies the game, `seq` increases      |
| `session:ended` | `{ reason: 'kicked' \| 'closed' \| 'expired' \| 'replaced' }`                                         |

```ts
// shared/src/core/room.ts
export interface PlayerView {
  id: PlayerId;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  role: 'player' | 'waiting'; // waiting = arrived during a game
}
export interface RoomView {
  code: string;
  me: PlayerId;
  hostId: PlayerId;
  players: PlayerView[];
  maxPlayers: number;
  status: 'lobby' | 'playing' | 'results';
  // Game chosen by the host and its settings, already validated
  selectedGame: { id: GameId; settings: Record<string, SettingValue> } | null;
  games: {
    id: GameId;
    launchable: boolean;
    reason: 'NOT_ENOUGH_PLAYERS' | 'TOO_MANY_PLAYERS' | null; // step 4: + 'NO_CONTENT_LEFT'
    content: { left: number } | null; // content not yet played in this room
  }[];
  // Final ranking ('results' status): { playerId, nickname, score, rank }
  results: { gameId: GameId; ranking: RankingEntry[] } | null;
}
```

### 3.3 HTTP API

| Route                                 | Auth   | Role                                                                                                                                                                      |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                     | —      | monitoring                                                                                                                                                                |
| `GET /api/games`                      | —      | metadata and settings of the games (home page, room)                                                                                                                      |
| `POST /api/rooms`                     | —      | `{ nickname, gameId? }` → `{ code, token }`; the caller becomes the host; **a room = a game**, chosen here for its whole life (the first game of the registry by default) |
| `POST /api/rooms/join`                | —      | `{ code, nickname }` → `{ code, token }`; the code is in the body, never in the URL                                                                                       |
| `POST /api/uploads/:kind`             | Bearer | binary body + `X-Upload-Meta` header (JSON) → handed to the current game                                                                                                  |
| `GET /api/media/:mediaId`             | Bearer | private take, if the game allows it at that moment                                                                                                                        |
| `GET /api/content/:gameId/:contentId` | Bearer | video, if the game exposes it at that moment                                                                                                                              |
| `GET /*`                              | —      | compiled client (prod); `index.html` for the application's routes                                                                                                         |

### 3.4 Error codes

The server only returns codes, which the client translates into French: `INVALID_PAYLOAD`, `RATE_LIMITED`, `ROOM_NOT_FOUND` (also for a wrong code: a deliberately generic answer), `ROOM_FULL`, `NICKNAME_TAKEN`, `NOT_HOST`, `NOT_PARTICIPANT`, `WRONG_PHASE`, `GAME_UNAVAILABLE`, `SESSION_INVALID`, `UNSUPPORTED_MEDIA`, `MEDIA_TOO_LARGE`, plus the games' own codes (`ALREADY_VOTED`, `PLUS_TWO_USED`, `SELF_VOTE`, `TAKE_LOCKED`…).

## 4. Server foundation

### 4.1 Rooms and sessions

```ts
interface Room {
  id: string; // internal, random: the only identifier written in the logs
  code: string; // 6 chars A–Z0–9 (crypto.randomInt), unique among the active rooms
  hostId: PlayerId;
  players: Map<PlayerId, Player>; // order of arrival kept
  status: 'lobby' | 'playing' | 'results';
  selectedGame: GameId | null;
  settings: Record<string, unknown>;
  runner: GameRunner | null;
  results: GameResults | null;
  played: Map<GameId, Set<ContentId>>; // content already played in this room
  createdAt: number;
  lastActionAt: number;
}
interface Player {
  id: PlayerId; // public, random (96 bits): used in the views
  tokenHash: string; // SHA-256 of the token; the token itself is never kept
  nickname: string;
  joinedAt: number;
  socketId: string | null; // null = disconnected
  disconnectedAt: number | null;
  role: 'player' | 'waiting';
}
```

- **Token**: 256 bits (`crypto.randomBytes(32)`, base64url), handed over only once and stored in sessionStorage. As this storage is specific to each tab, several tabs give several players, which is handy for testing. It travels in `auth` at the Socket.IO handshake and in the `Authorization` header, never in a URL.
- **Duplicated tab** (same token connected twice): the new connection replaces the old one, which receives `session:ended {replaced}`.
- **Reconnection**: same token → same player; `room:state` and `game:view` are sent again in full.
- **Disconnection**: detected within 20 s at most (Socket.IO heartbeat set to 10 s + 10 s). During a game, the player remains "awaited" for 60 s, then the game is notified and the host is transferred if it was them. In the room, a player disconnected for 5 min is removed.
- **Nickname**: normalised (NFC, spaces trimmed and merged), 2 to 16 characters (graphemes). Allowed: letters of all languages, digits, space, `- _ . ' !` and emoji; at most 4 combining marks per character (against "Zalgo" text). Unique in the room (case-insensitive). Always displayed as React text.
- **Closing**: by the host; when the last player leaves; after 10 min without a connected player; after 60 min without any action, **except during a game** (Among Legends: a League of Legends game is played outside the site); after 12 h in all cases. Every closing deletes the room's media.
- **Limits**: 10 players per room, 100 active rooms (configurable).

### 4.2 Game engine

What a game provides on the server side:

```ts
// server/src/core/engine/types.ts
export interface GameDefinition<C extends GameContract, S, V extends { phase: PhaseOf<C> }> {
  contract: C;
  setup(ctx: GameContext<C>, init: { players: PlayerId[]; settings: SettingsOf<C> }): S;
  initialPhase: PhaseOf<C>;
  phases: { [P in PhaseOf<C>]: PhaseDef<C, S> };
  view(state: S, viewer: PlayerId, ctx: ViewContext): V; // pure: what THIS player is allowed to see
  onSkip?(state: S, ctx: GameContext<C>): void; // "Passer à la suite" (host)
  onPlayerChange?(state: S, ctx: GameContext<C>, change: PlayerChange): void;
  // 'disconnected' | 'reconnected' | 'unawaited' (grace period elapsed) | 'left'
  canRead?(state: S, viewer: PlayerId, ref: MediaRef): boolean; // step 4: access to takes and contents
  uploadLimit?(state: S, from: PlayerId, kind: UploadKindOf<C>): number; // step 4: max bytes accepted
}

export interface PhaseDef<C extends GameContract, S> {
  actions: readonly ActionTypeOf<C>[]; // only actions accepted in this phase (filtered by the foundation)
  uploads?: readonly UploadKindOf<C>[]; // only file uploads accepted in this phase
  next: readonly PhaseOf<C>[]; // allowed transitions (checked by ctx.goto)
  enter?(state: S, ctx: GameContext<C>): void;
  on?: {
    [A in ActionTypeOf<C>]?: (
      state: S,
      ctx: GameContext<C>,
      from: PlayerId,
      payload: PayloadOf<C, A>,
    ) => void;
  };
  onUpload?: {
    [K in UploadKindOf<C>]?: (
      state: S,
      ctx: GameContext<C>,
      from: PlayerId,
      file: StoredMedia,
      meta: UploadMetaOf<C, K>,
    ) => void;
  };
  timer?(state: S, ctx: GameContext<C>, id: string): void;
}

export interface GameContext<C extends GameContract> {
  readonly phase: PhaseOf<C>;
  now(): number; // server clock (fake in tests)
  readonly random: Random; // crypto in prod, deterministic in tests: int(), shuffle(), pick()
  readonly players: Roster; // participants: connected, awaited (connected or disconnected < 60 s)
  goto(phase: PhaseOf<C>): void; // declared transition → enter(); cancels the phase's timers
  schedule(id: string, delayMs: number): void; // technical timer → phases[phase].timer(id)
  reject(code: string): never; // refuses the action → ack { ok: false, error: code }
  readonly content: ContentAccess; // step 4 (non-replayable games): pick(), markPlayed(), remaining()
  readonly media: { discard(id: MediaId): void }; // step 4
  end(scores: readonly ScoreEntry[]): void; // end → ranking computed by the foundation → back to the room
}
```

Conventions: the handlers are **synchronous** and **mutate the state**; they **check everything before modifying anything** (`ctx.reject` cleanly interrupts). The clock, randomness and timers go exclusively through `ctx`, which makes the logic testable without a network.

Processing of each `game:action` by the foundation (`GameRunner`):

1. valid session (socket middleware) and rate respected;
2. valid `{ type, payload }` envelope (zod);
3. `type` exists in the contract; if `hostOnly`, the sender is the host;
4. `type` ∈ `phases[current phase].actions`, otherwise `WRONG_PHASE`;
5. the sender is a participant (not `waiting`);
6. `payload` valid according to the action's schema;
7. call to the game's handler (business rules);
8. recomputation of each member's view and sending to those whose view changed.

Test bench provided by the foundation:

```ts
const g = createHarness(dubbingGame, {
  players: ['a', 'b', 'c'],
  settings: { rounds: 2 },
  seed: 42,
  content: fakeVideos,
});
g.act('b', 'vote', { points: 2 }); // → { ok: true } | { ok: false, error }
g.upload('a', 'take', fakeAudio, { offsetMs: 40, durationMs: 9000 });
g.advance(10_000); // advances the clock and triggers the timers
g.disconnect('c');
g.skip();
expect(g.view('a').phase).toBe('voting');
```

The engine itself is tested with a **fake game** (`core/engine/fixtures/`), minimal and absent from the registries, which exercises every mechanism: phases, actions refused out of phase, host action, timers, "Passer à la suite", disconnections, end of game.

Common helpers: `Barrier` (who has finished, complete with respect to the awaited players), `rank(scores)` (ranking with ties: 1, 1, 3).

### 4.3 Content (non-replayable games)

- One list per game, `CONTENT_DIR/<gameId>/selection.txt`, written by hand (§7.5), **read and validated at start-up**. For each line:
  - the file must be a plain name, without `/` or `..`, present in the folder and ending in `.mp4`;
  - the server reads the MP4 header itself to get the duration and the codecs (without ffmpeg). It requires H.264 + AAC and a duration of 1 to 30 s;
  - the content id is the file name, without extension and normalised to `[a-z0-9-]`: it is used to never replay a video in the same room.

  An invalid line is discarded with a clear warning, without preventing the server from starting. `npm run content:check` prints the complete report.

- **Firm rule**: a content is never offered twice in a room (`room.played`).
- **Choice**: a random video among those not yet played in the room.
- **Content-related settings**: `contentLeft` (not yet played in the room) is recomputed and displayed in the room; it serves as the maximum and as the default value of the number of rounds. If no content is left, the game cannot be started.
- A video is marked as played when its broadcast starts. If the host ends the game earlier, the videos not broadcast remain available.
- The list is never sent to the clients: only the video of the current round is exposed (id and duration; the title appears in the round ranking).

### 4.4 Private media (takes)

- **`MediaStore` in RAM**: random 128-bit identifiers generated by the server; quotas of 30 MB per room and 300 MB in total; maximum lifetime of 2 h, enforced by a sweep every minute.
- **Upload** `POST /api/uploads/take`, in this order:
  1. valid token;
  2. current phase accepting `take` and sender is a participant;
  3. size ≤ `uploadLimit`, i.e. (video duration + 3 s) × 40 KB/s, about 1 MB for 20 s. Checked on `Content-Length`, then during reception;
  4. `Content-Type` in the allowed list;
  5. binary signature: WebM `1A 45 DF A3`, Ogg `OggS`, MP4 `ftyp`;
  6. metadata validated by zod;
  7. storage, then `onUpload`.
- **Read** `GET /api/media/:id`: token of the same room and the game's `canRead`. Response with `Cache-Control: no-store`.
- **Deletion**: at the end of each round (dubbing), at the end or abort of the game, at the closing or expiry of the room, and by the maximum lifetime. Nothing is ever written to disk or to the logs.

### 4.5 Real time

- Socket.IO is attached to Fastify's HTTP server, with `maxHttpBufferSize` = 16 KB (files go through HTTP).
- **Handshake**: the `Origin` header must be the site's origin. The token is validated by zod then looked up; the player is attached to the socket.
- **Rate**: token bucket per socket (10 events/s, burst of 20; separate budget for the clock). Overrun → `RATE_LIMITED`; repeated abuse → disconnection. 30 simultaneous connections maximum per IP.
- **Clock**: `clock:ping` lets each client compute its offset from the server clock (§6.3).

### 4.6 HTTP security, configuration and logs

- **Headers** (`@fastify/helmet`):
  - CSP: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' wss://<host>; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`;
  - HSTS (in prod), `nosniff`, `Referrer-Policy: no-referrer`, COOP/CORP `same-origin`;
  - `Permissions-Policy: microphone=(self), camera=(), geolocation=()`.
- **CORS**: no CORS header, because the client is served from the same origin (in dev, through Vite's proxy). Only same-origin requests succeed; the origin is checked at the Socket.IO handshake.
- **Rate limiting** (home-made module, no dependency: fixed window per key for HTTP, token bucket for sockets):
  - creation: 5/min/IP;
  - joining: 20/min/IP; beyond 10 wrong codes in 10 min, a 10-min block;
  - file uploads: 10/min/player.

  The counting key is an HMAC of the IP with a secret drawn at start-up: no IP in clear, even in memory. With `TRUST_PROXY=true` (a single reverse proxy, a Node port reachable by it alone), the retained IP is the **last** entry of `X-Forwarded-For`, the one added by the proxy: the previous entries come from the client and could be made up.

- **Errors**: the response only contains `{ error: CODE }`; stack traces only appear in dev.
- **Logs** (pino, standard output): method, route pattern, status, duration, internal room id. Never an IP, a nickname, a token, a room code or a request body.
- **Configuration** (environment variables validated by zod): `NODE_ENV`, `HOST`, `PORT`, `PUBLIC_ORIGIN`, `TRUST_PROXY`, `CONTENT_DIR`, `LOG_LEVEL`, as well as the limits.

## 5. Client foundation

### 5.1 Session and state

- A `SessionStore` (external store read with `useSyncExternalStore`) holds `{ connection, room, game: { gameId, seq, view }, clock }`. Hooks: `useRoom()`, `useGameView<V>()`, `useServerNow()`, `useAct()`.
- The token is in sessionStorage (specific to each tab). Only the last nickname used is kept in localStorage, for convenience.

### 5.2 Routes

| Route         | Content                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`           | home: nickname, **game choice** (selectable cards, "single use" badge), then "Créer une partie de …" (create a game of …) or "Rejoindre" (join) |
| `/join/:code` | home with the code pre-filled (converted to upper case)                                                                                         |
| `/room/:code` | room, game or results. Without a token → redirect to `/join/:code`                                                                              |

In the room: the code in large, a "Copier le lien" (copy the link) button, then two columns (players | game card with its settings and, for the host, "Lancer la partie" (start the game)), then the game's full-width area if it provides one (`lobbyPanel`: Among Legends puts a collapsible "Règles du jeu" (game rules) and the role carousel there: no beginning or end, no scroll bar, chevron arrows, the role's picture to the right of its description). The room's game does not change: to play another game, you create another room.

### 5.3 Sound and autoplay

- Chrome and Brave allow playback with sound after a click on the page. The click on "Créer" or "Rejoindre" is therefore enough in the normal case.
- Two cases block playback anyway: **after a page reload in the middle of a game** (no click since) and **if Brave blocks autoplay** for the site. The "Activer le son" (enable sound) button then restarts playback at the right synchronised position.
- **A single `AudioContext`**, activated at the first gesture, plays the takes with sample-accurate scheduling.

### 5.4 Common components (`client/src/core/ui`)

| Component                                                                   | Role                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Scoreboard`                                                                | scores per player, with the round's gains                                                                                                                                                                                                                                                                                                                 |
| `RankingScreen`                                                             | ranking with ties; also serves as the foundation's end-of-game screen                                                                                                                                                                                                                                                                                     |
| `Countdown`                                                                 | countdown to a server deadline (compensated) or over a local duration (the 3-2-1 before a take)                                                                                                                                                                                                                                                           |
| `VotePanel`                                                                 | configurable vote buttons (options, disabling the +2…)                                                                                                                                                                                                                                                                                                    |
| `VoteReveal`                                                                | vote board: each "+1" or "+2" appears then fades out, then the total is displayed                                                                                                                                                                                                                                                                         |
| `SyncedVideoPlayer`                                                         | authenticated preloading → "ready" signal → start at `startAt`, with or without sound, external audio track aligned, drift correction                                                                                                                                                                                                                     |
| `AudioRecorder` (+ `useAudioRecorder`, `recordOverVideo`)                   | recording aligned on a video with offset measurement; format choice                                                                                                                                                                                                                                                                                       |
| `LevelMeter`                                                                | level meter: shows that the microphone chosen in the browser does pick up sound, with an alert if it picks up nothing                                                                                                                                                                                                                                     |
| `PlayerList`, `HostBar`, `ConnectionBanner`, `SoundUnlock`, `ConfirmDialog` | elements of the room and of the game                                                                                                                                                                                                                                                                                                                      |
| `RoundTransition` (+ `CloudSheet`, `Presenter`, `Starburst`)                | transition between two rounds: clouds sliding diagonally (top left → bottom right), the presenter pointing a finger (illustration `assets/presenter.webp`) and an explosion "Manche suivante !" (Heyam font, very large), portal on `document.body`, catches no click. `hold` keeps the clouds during a loading. `prefers-reduced-motion`: a simple fade. |
| `Backdrop`                                                                  | fixed backdrop behind all pages: watercolour of a sunset over the rooftops (`assets/backdrop.webp`), with a light dark veil at the top and bottom for legibility                                                                                                                                                                                          |

Layout designed for a PC screen (large video, players and controls around it), which stays usable in a narrow window. Texts in French, system fonts.

In dev mode only, a **component gallery** (`/dev/ui`) displays them with sample data, which makes it possible to check them by eye without starting a game.

### 5.5 Game module on the client side

```ts
// client/src/games/dubbing/index.ts
export default defineClientGame<typeof dubbing, DubbingView>({
  id: 'dubbing',
  screens: {
    // one screen per phase; TypeScript enforces that none is missing
    loading: LoadingScreen,
    broadcast: BroadcastScreen,
    recording: RecordingScreen,
    takeLoading: TakeScreen,
    takePlaying: TakeScreen,
    voting: VotingScreen,
    reveal: RevealScreen,
    roundResults: RoundResultsScreen,
  },
  // French messages for the errors declared in the contract (TypeScript enforces that none is missing)
  errorMessages: { ALREADY_VOTED: 'Tu as déjà voté.' /* … */ },
  // Optional: wrapper that stays mounted from one phase to the next (Dubbing: `RoundFrame` starts the
  // transition when the round number increases; a reload in the middle of a round does not play one).
  frame: RoundFrame,
});

export interface GameScreenProps<C extends GameContract, V> {
  view: V; // view of the current phase, typed
  room: RoomView;
  me: PlayerView;
  isHost: boolean;
  // Refusal already translated: { ok: true } | { ok: false, message }
  act<A extends ActionTypeOf<C>>(type: A, payload: PayloadOf<C, A>): Promise<ActResult>;
  // Step 4:
  upload<K extends UploadKindOf<C>>(
    kind: K,
    file: Blob,
    meta: UploadMetaOf<C, K>,
  ): Promise<ActResult>;
  fetchMedia(ref: MediaRef): Promise<Blob>; // video or take, with the token
}
```

Registries: `server/src/games/registry.ts` and `client/src/games/registry.ts` each contain one entry per game. Several checks protect their consistency:

- at start-up, the server validates each definition (`validateRegistry`): phases declared and defined, allowed actions all handled, transitions to known phases, default settings within their bounds. An inconsistent game prevents the server from starting;
- the `tests/registries.test.ts` test checks that both registries list the same games, that each phase has a screen and each error a message;
- during the game, `ctx.goto` refuses any undeclared transition.

## 6. Event flows

### 6.1 Create, join, reconnect

```
Host                                  Server                                    Friend
POST /api/rooms {nickname} ─▶ unique code, host player, token
               ◀─ {code, token}        (token → sessionStorage)
io.connect(auth: {token}) ───────────▶ origin + token checked → socket attached
               ◀─ room:state
link /join/ABC123 ──────────────────────────────────────────────────────────▶ opens the link
                                       ◀─ POST /api/rooms/join {code, nickname}
                                       rate, wrong codes, full room, nickname taken
                                       ─▶ {code, token}
                                       ◀─ io.connect(auth: {token})
               ◀─ room:state ──────────┴──────────────────── room:state ────────────▶

Reconnection: Socket.IO reconnects by itself (or the page is reloaded) with the same token
  → player found → complete room:state + game:view.
  Unknown token (room closed or expired, player kicked) → session:ended → home with a message.
```

### 6.2 From the room to the game, and back

```
Room creation with the chosen game (`POST /api/rooms` with `gameId`); host: room:setSettings → room:startGame
Server: checks host, lobby status, min ≤ players ≤ max, remaining content
  → GameRunner(definition, participants = present players) → setup → enter(initialPhase)
  → room:state {status: 'playing'} + game:view to everybody
  … game …
Game: ctx.end(scores) → the foundation ranks → room:state {status: 'results', results} → RankingScreen
Host: results:dismiss → back to the room; the "waiting" players become players
At any time: game:skip ("Passer à la suite"), game:abort (back to the room without results)
```

### 6.3 Clock and synchronised start

```
Client: clock:ping {t0} ─▶ ack {t0, server}, received at t1
  rtt = t1 − t0 ; offset = server − (t0 + t1) / 2 ; keep the sample with the smallest RTT
  (5 at connection, then 1 every 30 s and at every return to the tab)
Server: startAt = now + 1.5 s (configurable)
Client: local start = startAt − offset. Late? Start at the position (now − start).
  During playback, the video is realigned if it drifts by more than 80 ms; the audio track serves as master clock.
```

### 6.4 A dubbing round

```
Server (dubbing)                                   Each client
loading      pick() of a video, syncId
             view {video, syncId, ready}     ────▶ GET /api/content/dubbing/<id> (Bearer) → Blob
                                             ◀──── game:action ready {syncId}
             all connected players ready | skip
broadcast    view {startAt}                  ────▶ playback with sound at startAt
             timer: end of video + 0.5 s
recording    view {validated: [...]}         ────▶ watch again / record / listen back / redo (locally)
                                             ◀──── POST /api/uploads/take (audio + offsetMs) = validation
             checks → MediaStore → validated += player → views sent again to everybody
             all awaited players' takes | skip → random order of the players who have a take
takeLoading  presenter p, syncId
             view {presenter, take}          ────▶ GET /api/media/<id> (Bearer) → decoding
                                             ◀──── ready {syncId}
takePlaying  view {startAt}                  ────▶ muted video + take aligned on startAt
             timer: end of video
voting       view {voted: [...], canUsePlusTwo} ──▶ VotePanel (except for p)
                                             ◀──── vote {points}
             all awaited voters | skip
reveal       view {votes, total}             ────▶ VoteReveal (animation)
                                             ◀──── next (host) → takeLoading (next) | roundResults
roundResults the round's takes deleted; view {scores}
                                             ◀──── next (host) → loading (next round) | end
                                             ◀──── finish (host) → end: ctx.end(ranking)
```

### 6.5 Disconnections and "Passer à la suite"

```
Socket lost → player displayed as "disconnected" to everybody, still awaited for 60 s
  → after 60 s: onPlayerChange('unawaited') → the game re-checks its conditions
    (e.g. all the others have validated → next phase); if it was the host → transfer
  → if they come back: onPlayerChange('reconnected'), complete view, they resume
Loadings: only the connected players are awaited (a latecomer catches up during playback).
Game steps (take, vote): the awaited players are waited for (connected, or disconnected for less than 60 s).
Host: game:skip, after a confirmation that lists the players who will no longer be awaited → onSkip:
  loading → start without them; recording → closing (no take = not presented);
  vote → closing (no vote = 0)
```

## 7. Dubbing (`dubbing`)

### 7.1 State machine

> **Implemented at step 5** as described below. Details: the loading steps only wait for the connected players; "Passer à la suite" exists at every waiting step (loading, broadcast, recording, take, vote); takes are deleted on entering `roundResults`, once the presentation is over.

```
 loading ──(all ready | skip)──▶ broadcast ──(end of video)──▶ recording
                                                                   │ (all takes | skip)
                                                                   ▼
          ┌────────────▶ takeLoading ──(all ready | skip)──▶ takePlaying ──(end of video)──▶ voting
          │                                                                                    │
          │ next (host), if players remain                                  (all voted | skip)
          │                                                                                    ▼
          └──────────────────────────────────────────────────────────────────────────────── reveal
                                                                                               │ next (host), last player
                                                                                               ▼
 loading ◀── next (host), if rounds remain ──────────────────────────────────────────── roundResults
                                                                                               │ next after the last round,
                                                                                               │ or finish (host) at any time
                                                                                               ▼
                                                              ctx.end(ranking) → foundation's final screen → room
```

If nobody has a validated take, the game goes directly from `recording` to `roundResults`.

| Phase          | Actions and uploads accepted | Move to the next                                                        |
| -------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `loading`      | `ready {syncId}`             | all connected players ready, or skip → `broadcast`                      |
| `broadcast`    | —                            | server timer (duration + margin) → `recording`                          |
| `recording`    | `take` upload                | takes of all awaited players, or skip → `takeLoading` / `roundResults`  |
| `takeLoading`  | `ready {syncId}`             | all connected players ready, or skip → `takePlaying`                    |
| `takePlaying`  | —                            | server timer → `voting`                                                 |
| `voting`       | `vote {points}`              | all awaited voters have voted, or skip → `reveal`                       |
| `reveal`       | `next` (host)                | `takeLoading` (next player) or `roundResults`                           |
| `roundResults` | `next`, `finish` (host)      | `next`: `loading` (next round) or end after the last one; `finish`: end |

### 7.2 Rules checked by the server

- Every action is only accepted in its phase; `next` and `finish` are reserved to the host (foundation checks).
- **Take**: `recording` phase; sender is a participant; not already validated (a validated take is locked); type, signature and size compliant (limit computed from the video's duration); bounded metadata.
- **Vote**: the voter is a participant other than the presenter; a single vote per presentation, final; points ∈ {0, 1, 2}; the +2 can be used once per round and per voter.
- **Ready**: `syncId` of the current step only.
- **File access**:
  - the round's video is only accessible during that round;
  - a player's take is only accessible during their own presentation (`takeLoading` to `reveal`), never during the recording.

### 7.3 Views

```ts
type Base = { round: number; rounds: number };
type DubbingView =
  | (Base & { phase: 'loading'; video: VideoRef; syncId: string; ready: PlayerId[] })
  | (Base & { phase: 'broadcast'; video: VideoRef; startAt: number })
  | (Base & {
      phase: 'recording';
      video: VideoRef;
      validated: PlayerId[];
      mine: 'pending' | 'validated';
    })
  | (Base & {
      phase: 'takeLoading' | 'takePlaying';
      video: VideoRef;
      presenter: PlayerId;
      take: { mediaId: MediaId; offsetMs: number };
      syncId: string;
      startAt: number | null;
    })
  | (Base & {
      phase: 'voting';
      presenter: PlayerId;
      voted: PlayerId[]; // who has voted, never how many
      myVote: 0 | 1 | 2 | null;
      canUsePlusTwo: boolean;
      isPresenter: boolean;
    })
  | (Base & {
      phase: 'reveal';
      presenter: PlayerId;
      votes: { voter: PlayerId; points: 0 | 1 | 2 | null }[];
      total: number;
    })
  | (Base & {
      phase: 'roundResults';
      videoTitle: string;
      last: boolean;
      // The rank is not sent: Scoreboard recomputes it from `total` (ties included).
      scores: { playerId: PlayerId; roundPoints: number; total: number }[];
    });
type VideoRef = { contentId: string; durationMs: number };
```

### 7.4 Recording and audio/video sync (client)

- **Microphone**: requested on entering the recording phase.
  - The microphone used is the one chosen in the browser: in the permission window, or afterwards in `chrome://settings/content/microphone`. The level meter shows whether it picks up sound properly before starting a take.
  - In case of refusal, a message explains how to allow the microphone in Chrome or Brave; the host will be able to skip the phase.
  - The microphone is cut between two takes, which turns off the browser's recording indicator.
- **Discreet reminder** during the recording: "Mets-toi en sourd et muet sur Discord" (deafen and mute yourself on Discord). It is already your habit; the reminder just avoids an oversight.
- **Watch again**: the video, with sound, as many times as wanted; it is impossible during a take.
- **Record**:
  1. 3-2-1 countdown on the first frame;
  2. `MediaRecorder.start()`; the instant `tRec` is taken at the `start` event;
  3. the video restarts muted from 0; the instant `tVid` of the first displayed frame is taken with `requestVideoFrameCallback`;
  4. automatic stop at the end of the video;
  5. `offsetMs = tVid − tRec` is kept with the take.
- **Listen back**: muted video and decoded take; the take is played from `offsetMs` so that the first frame coincides. You can start over as many times as wanted.
- **Validate**: only the last take is sent. The others are thrown away: they never leave the device and are never written to disk. The sent take is then locked.
- **Format**, in order of preference: `audio/webm;codecs=opus` (Chrome, Brave, Firefox), then `audio/ogg;codecs=opus` and `audio/mp4` as fallbacks. Requested bitrate: 96 kbit/s. The `echoCancellation`, `noiseSuppression` and `autoGainControl` options are enabled.

### 7.5 Content: ready-to-use videos

You prepare the clips yourself: already trimmed, in MP4 (H.264 + AAC, the standard format), from 1 to 30 s (5 to 20 s recommended). No import script or ffmpeg is needed.

1. Drop the files in `content/dubbing/`.
2. List them in `content/dubbing/selection.txt`, one line per video: `file | title`. The title is the one displayed in the game; lines starting with `#` are comments.

   ```
   # file             | title
   8morts6blesses.mp4 | 8 morts, 6 blessés
   raclette.mp4       | Ma réaction quand il y a de la raclette
   ```

3. `npm run content:check` (step 4) checks each line (file present, format, duration) and prints the retained list.
4. Restart the server, which re-reads the list at start-up.

For a new evening, it is enough to add new files and their lines (and to remove the old ones if you no longer want to offer them). Avoid reusing a file name for another video: the id comes from the name.

- **No direct playback from YouTube, TikTok…**, for three reasons:
  - the embedded player would send each player's IP to a third party, which the requirements forbid;
  - it does not allow fine control: preloading, synchronised start, muted replay for the dubbing;
  - it would add advertisements, and a deleted video would break the game.
- **In production**, the `content/` folder is copied to the server (rsync), without going through git (step 8).

## 7 bis. Among Legends (`among-legends`)

Secret-role game around a real League of Legends match, played outside the site. Complete rules and scale: `shared/src/games/among-legends-roles.ts` (shared data, without zod, imported by the client).

- **Players**: exactly 5 (one team) or 10 (two teams of 5 facing each other): `playerCounts: [5, 10]`.
- **Setting**: `roles`, a checklist. Impostor locked, Droid greyed out (in development), at least 5 roles, at least 6 with the Chameleon.
- **Draw** (server): per team, the Impostor plus 4 other checked roles, drawn at random, never a duplicate within a team; the two teams draw independently. Each player sees **only their own role**; the teams are public.
- **Two-Face**: starting mode at random, switches every 7 min of play. **Chameleon**: at 15 min, receives a checked role absent from their team (if they become Two-Face, they follow the same rhythm).
- **Alarms**: triggered by **server** timers (`ctx.schedule`, aligned on `startedAt`), because the browser slows down the timers of background tabs. The player's view carries `alert: { seq, kind }`; the client rings when `seq` increases (not when the page is reloaded). Sound generated by Web Audio (`client/src/core/media/alarm.ts`), unlocked by the click on "J'ai lu mon rôle" (I have read my role).

```
 teams (10 players: team choice, validated by the host; 5 players: skipped at once)
   → briefing (draw, secret role, "J'ai lu mon rôle", alarm test)
   → playing (host's "La partie a commencé": timer, alarms)
   → stats ("La partie est terminée": the host enters the statistics, the others wait)
   → voting (everybody votes, statistics shown under the vote; the host can correct them)
   → results (roles revealed, detailed points) → "Voir le classement final": ctx.end(scores)
```

### End of game: `stats`, `voting` and `results` (steps 10 and 10 bis)

- **Stopping the timer**: "La partie est terminée" freezes `endedAt` (the timers of `playing` are cancelled by `goto`). The final mode of a Two-Face (Chameleon turned Two-Face included) is computed with the **site's timer** (`twoFaceModeAt(start, endedAt − startedAt)`), not with the entered duration: that is what the player saw on the screen. A Chameleon only has a new role if the reveal alarm (15 min) has rung.
- **`stats` phase**: only action, `submitStats` (host): `{ winner, minutes, teams: { blue, red? } }`. `winner` is `blue` or `red`; with 5 players, `red` means "defeat" (the only team is `blue`). `red` is required with 10 players and refused with 5. Per team, 8 answers (`STAT_KEYS`): lists of the team's players (ties: several). Checked by `validateTeamStats` (shared with the form): players of the team without duplicates (`STATS_INVALID`), inconsistencies (`STATS_ZERO_KILLS`: if there are players with 0 kills, the "fewest kills" is exactly this group; `STATS_OVERLAP`: "most" and "fewest" kills, or damage taken, do not name the same player unless the whole team is tied), then missing answers (`STATS_INCOMPLETE`, except "0 kills", which can be empty). The other players see a waiting screen; nobody can vote. A valid submission moves on to `voting`. "Passer à la suite" does nothing there.
- **`voting` phase**: everybody's view carries the statistics (`stats`), displayed under the vote menus (`StatsSummary`). Actions:
  - `vote`: a single, final submission (`ALREADY_VOTED`) with the guessed role of **each other player** (4 to 5 players, 9 to 10, opposing team included); roles among those checked by the host (`BAD_VOTE` otherwise). Duplicates are allowed in a ballot. For the Chameleon, "Chameleon" has to be guessed.
  - `submitStats` (host): correction of the statistics, immediately visible to all; the votes already sent are kept.
  - `reveal` (host): requires the vote of all the awaited players (`VOTES_MISSING`); a player disconnected for 60 s is no longer awaited. "Passer à la suite" forces the display: a missing ballot is **ignored everywhere** (the player neither gives nor costs any point to the others).
- **`results`**: everybody's view reveals everything (drawn role, Chameleon's role, final mode, who found whom, points detailed line by line) and their own ballot. No role is visible before. `finish` (host) ends the game with the totals: the foundation ranks (scores can be negative).
- **Points computation**: `computeScores` (`shared/src/games/among-legends-scoring.ts`), a pure function, tested in `among-legends-scoring.test.ts`. It returns per player `{ total, lines: { rule, count, points }[] }`; the client translates `rule` with `SCORE_LABELS`. Rules:
  - common: +1 per correctly guessed role, −1 per mistake; +1 per voter who did not find your role, −1 per voter who found it (except Superhero, who keeps the +1s);
  - per role: see `ROLES[…].points`. The performance bonuses also count in case of defeat. The Impostor's rules **add up** with the common ones (+2 per fooled player, −1 per player who found them). Speedrunner: victory in under 25 min (entered duration < 25). Marathoner: 35 min or more. Two-Face: +2 if the final mode matches the result;
  - Chameleon: votes on "Chameleon"; points of their new role (the Superhero exemption follows the current role) + 1 if they fulfil the main mission, otherwise only the common points. Missions: Superhero = win; Snake = win + most deaths + most damage; Pacifist = win + fewest kills; Speedrunner = win in under 25 min; Marathoner = win at 35 min or more; Crook = win + be designated Impostor by at least half of the voters; Two-Face = final mode matching the result.
- **The Droid** remains in development (never drawn); `computeScores` only gives it +2 / −2 for the result.

## 7 ter. Defusal (`defusal`)

Cooperative game for exactly 4 players (`playerCounts: [4]`), inspired by _Keep Talking and Nobody Explodes_, in a Discord call. Data, rules and manual texts: `shared/src/games/defusal-data.ts` (without zod, imported by the client); contract: `shared/src/games/defusal.ts`; server: `server/src/games/defusal/` (`rules.ts` parameters and conditions, `modules.ts` the modules, `bomb.ts` assembly and dealing of the manual).

- **Roles**: at each bomb, a defuser sees the bomb and has no manual; the three experts each have **their own pages**, never the others', and do not see the bomb. A game = 4 bombs; the order of the defusers is drawn at the start, each one defuses once.
- **Everything is new at each bomb**: bomb parameters, modules **and manual rules** (drawn by `ctx.random`). Nothing can be learned by heart.
- **Settings**: `strikes` (1 to 3): the bomb explodes **at** the N-th mistake; `minutes` (2 to 10, 5 by default).
- **Timer** (deliberate exception to "no timer"): `Clock { remaining, since, speed }`, held by the server; each mistake makes it run 25% faster (`speed = 1 + 0.25 × mistakes`) and reschedules the `explosion` timer. The client displays `formatClock(remainingAt(clock, server time))`, the same function the server uses to judge the button.
- **Bomb parameters** ("edgework"): serial number (6 characters, last one a digit, no O or Y), battery holders (AA = 2, D = 1), indicators (3-letter label, lit or unlit), ports. The rules constantly refer to them.
- **Manual**: each module has **two pages**, always given to two different experts (`dealPages`, loads balanced to within one page: 14 pages for 3 experts), to force discussion. Ordered rules "If … and …, do …", first true rule, then "Otherwise".
- **Modules**: 8 exist, **6 are drawn per bomb** (`MODULES_PER_BOMB`), plus the vent. Each one therefore appears in about three bombs out of four.

| Module          | Bomb (defuser)                                                                           | Page 1                          | Page 2                                                                             |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| Wires           | 3 to 6 coloured wires, cut one                                                           | rules for 3 and 4 wires         | rules for 5 and 6 wires                                                            |
| Button          | big button on a danger-striped base, word in capitals; held, a coloured strip lights up  | press briefly or hold           | timer digit at which to release, according to the strip                            |
| Symbols         | 4 symbols, to press in order                                                             | columns 1 to 3                  | columns 4 to 6 (only one column contains the 4)                                    |
| Maze            | 6×6 grid, two markers, position, exit, no walls                                          | markers → maze number (9)       | numbered maps                                                                      |
| Colours         | 4 pads; a sequence of 4 or 5 steps that gets longer                                      | translation table with no error | tables for 1 and 2 errors                                                          |
| Morse           | a lamp blinking a word in a loop, a radio to tune (16 frequencies), "Émettre" (transmit) | morse alphabet                  | word → frequency (16 words)                                                        |
| Memory          | a display (1 to 4), 4 numbered buttons, 5 steps                                          | rules of steps 1 to 3           | rules of steps 4 and 5                                                             |
| Password        | 5 wheels of 6 letters, "Valider" (confirm)                                               | list of 18 words                | list of 18 other words (only one of the 36 can be formed)                          |
| Vent (to watch) | "AU REPOS" (at rest) screen, then a word; 4 coloured valves                              | word → valve                    | corrections according to the bomb and the word (next valve, previous, or the same) |

- **Colours**: the table depends on the **number of mistakes of the whole bomb** at the moment of the answer (0, 1 or 2) and on a vowel in the serial number; for each row, the two tables differ, and no colour is mapped to itself. A mistake replays the step.
- **Morse**: the server only gives the patterns (dots and dashes); the client animates the lamp (unit of 320 ms, dash = 3, pauses of 1, 3 and 7 units). Decoding and finding the word is for the experts to do.
- **Memory**: the rules of the later steps refer to what was pressed earlier (position or digit); a mistake restarts at step 1 with a new display.
- **Password**: the letters of the five wheels are in the defuser's view (they scroll them locally); only the submission of the word is a gesture. The generator guarantees a single formable word among the 36 of the game.
- **Vent**: server timers `purgeOn` (first activation 25 to 45 s after the start, then 30 to 60 s after each end) and `purgeOff-<n>` (40 s window; the activation number prevents an old window from closing a new one). Wrong valve: mistake, the vent stays awake. Window elapsed: mistake, and it goes back to sleep. It never counts among the modules to defuse. The timers fall with the phase (`goto`).
- **Gestures** (defuser only, `NOT_DEFUSER` otherwise; `BAD_MODULE` for a wrong module, an already cut wire, a finished module): `cut`, `buttonDown` / `buttonUp` (under 700 ms = short press; a release is judged on the timer display at that instant or within the previous 750 ms, to allow for latency), `press`, `move`, `simon`, `tune` / `transmit`, `memory`, `password`, `purge`. A mistake does not end the module: it remains to be completed.
- **End**: all modules completed → defused; N-th mistake or timer at zero → explosion. Team points, identical for everybody: 100 per defused bomb + 1 per remaining second.
- **Sounds** (`client/src/games/defusal/sounds.ts`, `sound-events.ts`): synthesised by Web Audio, no file. A tick at every displayed second (higher-pitched under 30 s, urgent under 10 s, hence faster when a mistake speeds up the timer), a low buzz at every mistake, two notes at every defused module, double beeps of the vent while it is awake (closer together under 10 s; only the defuser sees it), one note per colour, explosion (low fall and a burst of white noise) and a success arpeggio on the result screen. The decision "which sound for which change of the view" is a tested pure function (`soundEvents`). The audio context requires a click: "Je suis prêt" wakes it up. The "Son" button mutes and restores everything, per browser (`localStorage`, with a fallback if unavailable).
- **Button**: the big button is centred alone in its block, on a base with yellow and black stripes; the light strip (the coloured "slot") is placed next to it, without shifting the centring. Its colour is still drawn at random (the rules refer to it); its words are displayed in capitals, in the bomb as in the manual.
- **Design**: the bomb's grid has three columns (two rows of three modules, then the vent alone in the middle of the third; two columns under 900 px, one under 560 px); each module's content is centred in its block, under its title; light glints on the wires, buttons, colour pads, valves, keys, indicators and screens; bomb casing (screws, danger strip, "DX-4" plate), modules with rivets; a defused module greys out under a green ✓; wires with tips, cut in the middle; red segment clock that turns orange under 30 s and blinks under 10 s; mistakes as glowing red boxes; explosion (flash and a shaking title) or green ring on the result; icons (bomb for the defuser, open manual for the experts); numbered manual pages with a binding margin, **each in a collapsible block** (closed at the start, like the appendix: the titles give the overview, one step is opened at a time, several blocks can stay open). All animations respect `prefers-reduced-motion`.
- **Playability guarantee**: a test plays hundreds of bombs with a virtual team that reads **only** the views (the defuser's bomb, the experts' pages); each bomb must be defused without a mistake. Other tests check uniqueness: a single column of symbols, distinct pairs of markers, perfect mazes (a single path), a single formable word in the password, 16 distinct words and 16 distinct frequencies in the morse, colour tables that differ, memory rules that only refer to an earlier step. The virtual team also answers the vent; the timers (wake-up, 40-s window, old windows) have their own tests.

## 7 quater. Qui est le + ? (`whos-most`)

3 to 10 players. Phases: `photos` (everybody sends their head as a PNG; the host starts when everybody has one, or "Passer à la suite" to start without the latecomers, who are displayed without an image) → `voting` (one vote per player, final, voting for oneself allowed; the host triggers the reveal when all have voted) → `reveal` (votes received per head, revealed from the least voted to the most voted, confetti; ties for first all win, in the centre, the others scattered and slightly transparent if they have no vote) → next question, or back to the room after the last one. **No points and no ranking**: the game declares `ranked: false` (a generic option of the foundation: at the end, `ctx.end([])` takes everybody back to the room, without a results screen).

- **Questions**: **text** content of the game (`content: 'text'`), one line per question in `content/whos-most/selection.txt` (what follows "Qui est le +", 80 characters max, outside git like the videos; `npm run content:check` checks them). The foundation knows how to load this content without a file (`loadContentLibrary(…, 'text')`: id = normalised text, `file: ''`, never downloadable); it brings the "never the same question twice in a room" tracking and the "Number of questions" setting bounded by `contentLeft`. The game is therefore `replayable: false` ("single use"): a room ends up exhausting the list.
- **Photos**: `head` files (PNG, binary signature checked, 1 MB max), in RAM like the takes; readable by all the players of the room during the game, deleted at the end, on abort and on closing of the room (by the foundation) and by the game at the end of the game. Sending again replaces the previous photo (the old one is deleted).
- **Cut-out**: in the player's browser, before any upload (`client/src/core/media/head-cutout.ts`, `HeadPicker` component). `@mediapipe/tasks-vision` (Apache-2.0) + `selfie_segmenter.tflite` model (`client/public/vendor/mediapipe/`, committed); the WASM runtime is copied from `node_modules` at build time by a small plugin of `client/vite.config.ts` (never committed, 13 MB). Everything is self-hosted; the CSP gains `'wasm-unsafe-eval'` in `script-src` (WebAssembly only, no JavaScript `eval`). The model requires WebGL2: without it (or on failure), the photo is kept as is. MediaPipe writes information lines to `console.error`: the e2e tests must ignore them.

## 8. Security: requirement → mechanism

| Requirement                                             | Mechanism                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Authoritative server                                    | `GameRunner` pipeline (schema, phase, host, participant) + business rules checked before any mutation                           |
| Token ≥ 128 bits, reconnection                          | 256 bits, stored hashed (SHA-256), sessionStorage, never in a URL                                                               |
| No player id coming from the client accepted as is      | identity deduced from the token; the ids passed as parameters (kick, transfer) are checked against the room's list              |
| Takes: MIME type and size                               | allowed list + binary signature + limit computed from the video's duration, checked during reception                            |
| Server-generated names, restricted access, never static | random 128-bit ids, authenticated route + `canRead`, `no-store`, RAM only                                                       |
| Deletion (end of game, closing, expiry, crash)          | end of each round, end or abort of the game, closing or expiry of the room, 2-h lifetime; RAM only, so nothing survives a crash |
| No audio content in the logs                            | request bodies never logged, restricted log serialisers                                                                         |
| Room expiry, max number of players                      | sweep: 10 min without a connected player, 60 min without action, 12 h maximum; 10 players                                       |
| Rate limiting, `maxHttpBufferSize`                      | home-made limiters (creation, joining, wrong codes, uploads); token bucket per socket; 16 KB                                    |
| Nicknames                                               | normalisation + character list + length + uniqueness; display as React text; `dangerouslySetInnerHTML` forbidden by ESLint      |
| Headers, CSP, CORS, generic errors                      | helmet + strict CSP; same origin without CORS; origin checked on Socket.IO; `{ error: CODE }` in prod                           |
| No tracker or third-party resource                      | no CDN, CSP `'self'`; the fonts are self-hosted, outside the repository                                                         |
| Minimal logs                                            | standard output; no IP, nickname, token or code; rate keys = HMAC of the IP                                                     |
| HTTPS                                                   | prod behind a reverse proxy (Caddy recommended, step 8); in dev from another PC of the local network, self-signed certificate   |
| Reduced dependencies, `npm audit`                       | list below; `npm audit` at the end of each step                                                                                 |

Planned runtime dependencies:

- server: `fastify`, `@fastify/helmet`, `@fastify/static`, `socket.io`, `zod`;
- client: `react`, `react-dom`, `socket.io-client`.

Development dependencies: `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier`, `@types/*`, `@playwright/test` (step 7, without downloading a browser).

Complete review and remaining risks: [security-review.md](security-review.md).

## 9. Tests

- **Unit** (Vitest, no network):
  - shared schemas; codes and tokens; nickname rules;
  - `RoomManager` (simulated clock: reconnection, grace period, host transfer, expiry);
  - rate limiter; `MediaStore` (lifetime, quotas); file signatures;
  - `GameRunner`, tested with the fake game (phase, host, participant, timer cancellation, "Passer à la suite", end);
  - logic of Dubbing, Among Legends and Defusal, with the test bench; playability of each generated bomb (virtual team);
  - Among Legends point computation (`computeScores`, `validateTeamStats`): one case per rule and per role, Chameleon, two teams;
  - reading of `selection.txt` and of the MP4 headers (duration, codecs);
  - on the client side, the pure functions: clock offset computation, synchronised start computation, choice of the recording format.
- **Integration**: HTTP routes with `fastify.inject` (creation, joining, limits, headers, uploads); a real Socket.IO server on an ephemeral port with `socket.io-client` and the fake game registered for the test (launch, actions, per-player views, reconnection, back to the room).
- **End to end** (step 7, `npm run test:e2e`, outside `npm run check`): Playwright drives the **installed Chrome and Brave** (Playwright's Chromium does not play H.264). The test server (`tests/e2e/server.ts`) runs in production mode with the compiled client (real CSP, origin check on `http://127.0.0.1:4173`) and plays the shortest valid video of `content/dubbing`. One browser context per player, fake microphone (`--use-fake-device-for-media-stream`), autoplay allowed. The content folder can be replaced by `CONTENT_DIR` (useful if `content/dubbing` no longer contains a valid video). Scenarios: Defusal with 4 (error setting, roles, distinct manuals, held button, voluntary explosion, 4 bombs, summary); complete Among Legends game with 5 (briefing, waiting for the others during the stats entry, inconsistency refused, vote with the stats displayed, correction by the host, results, final ranking); complete Dubbing game with 3 (recording, presentations, votes, ranking, back to the room, video not replayable); reload in the middle of a game, "Passer à la suite", manual access to a take (with and without a token), "Arrêter la partie" which deletes it. Any console error (including a CSP violation) makes the test fail.
- **Manual tests**: at each step, a procedure on Chrome, then a check on Brave.

## 10. Split into steps

| Step                  | Content                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2. Foundation         | monorepo and tooling (TS, ESLint, Prettier, Vitest); config; Fastify + security headers; Socket.IO + authentication; rooms (create, join, leave, kick, transfer host, reconnection, expiry); rate limiting; clock; home page (list of the registry's games, empty for now), `/join/:code`, waiting room; connection banner; tests; local HTTPS to test from another PC                                                            |
| 3. Plugins            | engine (`defineGame`, `GameRunner`, context, timers, test bench) validated by the fake game; room side: game choice, generic settings, launch, abort, "Passer à la suite", results screen; registries; `Scoreboard`, `RankingScreen`, `Countdown`; component gallery (dev). Without a real game, the manual test is limited to the gallery; starting a game is covered by the integration tests, then tested by hand from step 4. |
| 4. Dubbing (1)        | content library (`selection.txt`, MP4 headers) + `npm run content:check`; `MediaStore` + upload + signatures; `SyncedVideoPlayer`, "Activer le son"; `AudioRecorder`, `LevelMeter`; phases `loading` → `recording`; tests                                                                                                                                                                                                         |
| 5. Dubbing (2)        | synchronised presentation (`takeLoading`, `takePlaying`); take playback and access rules; `VotePanel`, `VoteReveal`; vote rules; tests                                                                                                                                                                                                                                                                                            |
| 6. Dubbing (3)        | chaining of the rounds, intermediate and final rankings, "Terminer la partie"; final checks; deletion of the takes at the end of a round; tests                                                                                                                                                                                                                                                                                   |
| 7. Security and E2E   | complete security pass, multi-player Playwright tests, fixes, report of the remaining risks                                                                                                                                                                                                                                                                                                                                       |
| 9. Among Legends (1)  | foundation: `multi` setting, `playerCounts`, `lobbyPanel`, no inactivity expiry during a game, `playAlarm()` alarm; game: teams, role draw, briefing, game in progress with the alarms (Two-Face, Chameleon), rules panel; tests                                                                                                                                                                                                  |
| 10. Among Legends (2) | `stats` (host's form, the others wait), `voting` (everybody's vote with the stats displayed) and `results`: `computeScores` (pure function), plain screens, end-to-end test with 5 players; Droid later                                                                                                                                                                                                                           |
| 12. Defusal (1)       | bomb and parameters, server timer that speeds up, mistakes, rotation of the 4 roles, separate manuals, 4 modules (wires, button, symbols, maze); tests (virtual team) and end to end with 4                                                                                                                                                                                                                                       |
| 13. Defusal (2)       | Simon, morse, memory, password, vent (module to watch); 6 modules per bomb                                                                                                                                                                                                                                                                                                                                                        |
| 14. Defusal (3)       | design and sounds                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 11. Among Legends (3) | design: role carousel (done: infinite, pictures, arrows), cards, sounds (content provided by the user)                                                                                                                                                                                                                                                                                                                            |
| 8. Deployment         | **[docs/deployment.md](deployment.md)**: Debian/Ubuntu VPS, systemd (`--user`), Caddy (automatic HTTPS), deployment by `git push` (bare repository + `post-receive` hook), content copied with `rsync`                                                                                                                                                                                                                            |

## 11. Risks and points of attention

1. **Discord call**: as you deafen and mute yourself during the recording, the voices of the call are not picked up and nobody hears the take before the presentation. One point remains during the broadcasts and presentations: with speakers and the Discord microphone open, the video's sound goes back into the call, which makes an echo. Countermeasure: a headset, or the Discord microphone muted during playback.
2. **Wrong microphone**: a PC often has several microphones (webcam, headset). It is chosen in the browser, and the level meter with its silence alert makes the mistake visible before the take.
3. **Autoplay**: it is blocked after a page reload in the middle of a game, or if Brave blocks autoplay for the site. Countermeasure: the "Activer le son" button.
4. **Brave**: its anti-fingerprinting protections (Shields) slightly disturb the audio measurements (with no effect on recording or playback) and can block autoplay. To test from step 4. If it causes too many problems, we switch to Chrome only.
5. **H.264 on Linux**: Chrome and Brave play it. The "Chromium" of the Linux repositories may not. Your clips are in H.264: a player in this case will have to use Chrome or Brave.
6. **Sync accuracy**: the goal is less than 50 ms between audio and video on a single device, and about 100 ms between devices. The measured offset compensates for the gap between the start of the recorder and of the video, but not the microphone's hardware latency (a few tens of ms).
7. **Long games**: with all the videos, count 3 to 6 min per video with 6 players, i.e. 1 h to 1 h 15 for 15 videos.

   | Step                                                                                | Duration      |
   | ----------------------------------------------------------------------------------- | ------------- |
   | broadcast                                                                           | ≈ 20 s        |
   | recording                                                                           | 30 s to 3 min |
   | 6 presentations × 30 s (video 15 s, vote ≈ 5 s, animated board ≈ 5 s, host's click) | ≈ 3 min       |
   | round ranking                                                                       | ≈ 15 s        |

   Hence a transparent reconnection (complete views sent again) and "Terminer la partie" at the end of any round.

8. **Testing from another PC in dev**: the microphone requires HTTPS outside `localhost`. A self-signed certificate is therefore generated with openssl, already present on your machine, and each browser accepts the warning once.
