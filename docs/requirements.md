# Project: a website of multiplayer mini-games among friends

## Context

I want to build a website to play mini-games among friends, each on their own device (PC or phone), in real time. No accounts: you join a game with a code. I develop on Linux Mint. The site must be extensible: I want to add new mini-games over time without restructuring the rest.

## Way of working

- Before writing code, read this whole prompt, ask me your questions about the ambiguous points, then propose a detailed architecture plan (tree, interfaces, event flows) and wait for my approval.
- Work in steps (see "Steps"). At the end of each step: the project starts, the tests pass, and you explain to me how to test by hand. Wait for my go-ahead before the next step.
- Create and keep up to date a conventions file at the root: architecture, conventions, useful commands, procedure to add a game.
- Code and comments in English, user interface in French.
- One git commit per finished step.

## Technical stack (propose an alternative only if you have a real reason)

- TypeScript everywhere, npm workspaces monorepo: `shared` (types, event contracts), `server`, `client`.
- Server: Node.js LTS, Fastify, Socket.IO for real time.
- Client: Vite + React.
- Validation: zod on the server, on every socket event and every HTTP request.
- Tests: Vitest (the game logic must be testable without a network).
- Game state in memory, no database for now.

## Architecture: a common foundation + games as plugins

The foundation handles everything that is common:

- Rooms: creation, code, joining, list of players, host, reconnection, closing, expiry.
- Chaining: in a room, the host chooses a game and starts it; at the end, back to the room to choose another one with the same players.
- Reusable UI components: scoreboard, ranking screen, timer, voting component, synchronised video player, audio recorder.

Each game is an isolated module, with a server part in `server/src/games/<id>/` and a client part in `client/src/games/<id>/`, declared in a registry (one line per game). A game exposes at least:

- metadata: id, name, description, min/max number of players, `replayable` (boolean);
- a state machine on the server side (phases, actions allowed per phase, transitions), the only source of truth;
- a function that builds the view sent to each player (everybody only receives what they are allowed to see);
- the client screens of each phase.

Adding a game = creating its two folders + one line in each registry, without modifying the foundation. Validate this architecture with a small test game before coding the real game.

Replayability: some games are only interesting once (their content is "consumed"). Provide `replayable: false` in the metadata and a tracking of the content already played (at the very least: the same content is never offered twice in a room).

## Home page

- Presentation of the site and list of the available games, generated from the registry, with a "single use" badge for the games that cannot be replayed.
- Two actions: "Create a game" and "Join" (code field + nickname).
- Game code: 6 random characters among A–Z and 0–9, generated with a cryptographic generator (crypto.randomInt), uniqueness checked among the active rooms. Case-insensitive input.
- Shareable link such as /join/ABC123 that pre-fills the code.
- Short notice: "No account. Your recordings are deleted at the end of the game."

## First game: "Doublage" (dubbing; provisional name)

Course of a round:

1. Broadcast: a short video (meme, movie clip…) is played only once for all the players at the same time, with the original sound. The clients preload the video and tell the server they are ready; the server then gives a common start (timestamp compensating for the clock offset between client and server).

2. Recording, simultaneous for everybody:
   - Each player can watch the video again with the sound, on their side, as often as they want.
   - When they start a recording, the video restarts from the beginning without sound (for the lip-sync) and the microphone records; the recording stops automatically at the end of the video. It is impossible to watch the video with the sound during a recording.
   - They can listen to their take again (muted video + their voice) and record again as many times as they want until they validate.
   - Once validated, the last take is locked and sent to the server. Only the validated take leaves the device; the others stay local and are thrown away.
   - Everybody sees who has validated (without hearing the takes). The phase ends when all the players have validated.
   - Beware of the audio/video sync: measure the offset between the start of the MediaRecorder and that of the video, and compensate for it at playback.

3. Presentation, player by player (random order):
   - The video plays for everybody, muted, with the take of the current player as its soundtrack, synchronised.
   - Vote: every other player gives 0, +1 or +2. The +2 can only be used once per round and per voter. One does not vote for oneself.
   - When everybody has voted, a board shows each voter and what they gave, with an animation (the "+1" or "+2" appears then fades out), then the total earned by that player.
   - We move on to the next player, until all have gone through.

4. End of round: ranking with the points earned in the round and the total score of each player. Then a new round with a new video.

5. End of game after the number of rounds chosen by the host: final ranking, back to the room.

Content: to begin with, short MP4 videos (about 5 to 20 s) that I provide in a folder, described in a manifest file (id, title, file, duration). Explain to me how to add some.

All the rules (a single +2 per round, no double vote, no vote for oneself, actions allowed only in the right phase, take locked after validation) are checked on the server side. The client only displays and sends intentions.

## Security and privacy (requirements, not options)

Voice recordings are personal data: treat them as such.

- Authoritative server: never trust the client. Every message is validated (types, sizes, current phase, host/player rights).
- Identity without an account: when entering a room, the server generates a random session token (crypto, at least 128 bits), stored in sessionStorage, used for reconnection. No player identifier sent by the client is accepted as is.
- Recordings: MIME type and size checked (strict limit adapted to the maximum duration of a video), file names generated by the server, access reserved to the members of the room through their token, never served as public static files, deleted at the end of the game, when the room is closed, and by an automatic safety expiry even in case of a crash. No audio content in the logs.
- Rooms: expiry after inactivity, maximum number of players, rate limiting (room creation, code attempts, socket messages) against brute force and spam. Socket.IO's maxHttpBufferSize limited.
- Nicknames: limited length, controlled characters, never injected as raw HTML (no dangerouslySetInnerHTML).
- HTTP headers: strict Content-Security-Policy, security headers (the equivalent of helmet for Fastify), CORS limited to the site's origin, generic error messages in production (no stack trace).
- No tracker, no analytics, no third-party resource (fonts, CDN) that would leak the players' IP.
- Minimal logs: no IP or nickname kept durably.
- HTTPS mandatory in production (the browser requires it for the microphone anyway).
- Dependencies reduced to what is necessary, npm audit at every step.
- At the end, do a complete security review and list the remaining risks.

## Browser constraints

- Chrome, Firefox and Safari, on computer and mobile (iPhone included: Safari records in audio/mp4, not webm).
- Handle properly: microphone refused, autoplay blocked ("Enable sound" button if needed), connection loss and reconnection during a game.
- Responsive interface, comfortable on a phone.

## Steps

1. Questions + architecture plan + conventions file (no code).
2. Foundation: monorepo, server, client, home page, create/join a room, waiting room, reconnection, room expiry. Tests.
3. Plugin system + minimal test game (e.g. "click the fastest") to validate the architecture and the common components (scores, ranking).
4. Dubbing, part 1: video manifest, synchronised broadcast, complete recording phase (watch again, record, listen back, record again, validate, secure upload).
5. Dubbing, part 2: synchronised presentation, votes, animated board.
6. Dubbing, part 3: chaining of the rounds, intermediate and final rankings, tracking of the content already played.
7. Complete security pass + end-to-end tests (several tabs/players) + fixes.
8. Deployment preparation: production build, environment variables, HTTPS, hosting recommendations.

## Points to settle with me at step 1

- What to do if a player never validates or disconnects (timer? can the host force the next step?).
- Possible timers for the recording and the vote.
- Min/max number of players and default number of rounds.
- Tracking of the "already played" content from one evening to the next (without an account).
