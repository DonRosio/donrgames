# Security review — step 7

> Review of the whole code (server, client, configuration) at the end of step 7, with the dubbing game finished.
> To be redone for each new game or change of the foundation, with the list of security invariants of [architecture.md §8](architecture.md).

## 1. Method

- Reading of the whole exposed surface: HTTP routes (`core/http/`), Socket.IO events (`core/realtime/io.ts`), rooms and sessions (`core/rooms/`), engine (`core/engine/runner.ts`), media (`core/media/`), content (`core/content/`), configuration and logging; on the client side, token storage, network calls and rendering of the texts coming from players.
- Point-by-point check of the security invariants and of the "requirement → mechanism" table ([architecture.md §8](architecture.md)).
- End-to-end tests (Playwright) on the **production build**: real CSP, real origin check, real browsers (Chrome; Brave configured), fake microphone.
- `npm audit`: no known vulnerability.

## 2. Fixes made

| Problem                                                                                                                                                                                                                                                | Severity | Fix                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Behind a proxy (`TRUST_PROXY=true`), the client's address was the **first** entry of `X-Forwarded-For`, which the client writes itself. By changing it at every request, all the per-IP limits (creation, wrong codes, connections) could be bypassed. | Medium   | Only the **last** entry, added by our proxy, is kept (HTTP and Socket.IO). Tests: `http.test.ts`, `client-ip.test.ts`.       |
| A refusal by the game during a file upload (e.g. two simultaneous uploads of the same take: `TAKE_LOCKED`) became a 500 error logged as a crash.                                                                                                       | Low      | The HTTP error handler returns `409 { error: CODE }`. Test: `errors.test.ts`.                                                |
| "Zalgo" nicknames: dozens of combining marks stacked on one letter overflow onto the display of the other players.                                                                                                                                     | Low      | At most 4 combining marks per character (real scripts and emoji use fewer). Tests: `nickname.test.ts`.                       |
| No test proved that aborting in the middle of a round deletes the takes not yet presented (step 6).                                                                                                                                                    | —        | Integration test added (`media.test.ts`), and end-to-end check: after "Stop the game", the take can no longer be downloaded. |

## 3. Verified invariants

- **Inputs**: every socket event goes through `handle(event, schema, run)` (zod), every HTTP route through `parseInput`; the phase, the host role and the participation are checked by `RoomManager` and `GameRunner` before any processing.
- **Token**: 256 bits, hashed (SHA-256) on the server, sent in `auth` (Socket.IO) and `Authorization` (HTTP), never in a URL or a log.
- **Voice takes**: allowed types, binary signature, size bounded by the video's duration (checked before and during reception), random ids from the server, authenticated route with `no-store`, RAM only, deletion at the end of a round, of a game, on abort, on room closing, and after 2 h at most.
- **Logs**: method, route pattern, status, duration, internal room id. No IP, no nickname, no code, no request body; the limiters' keys are HMACs of the IP.
- **Browser**: no `dangerouslySetInnerHTML` (ESLint rule), no third-party resource; the strict CSP (`'self'`) causes no violation on the complete application (checked by the E2E tests, which fail at the slightest console error).
- **Rate limiting**: room creation, code attempts, file uploads, socket messages, connections per IP.
- **Production**: generic error answers (`{ error: CODE }`, `INTERNAL` without details).

## 4. Remaining risks

| Risk                                                                                                                                                               | Severity | Current or possible countermeasure                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| The code (or the link) is enough to get in. A kicked player can come back with the same code.                                                                      | Low      | Deliberate choice (no account). The host can close the room and open another one.                                                       |
| Any participant can download a take during its presentation (that is how it is played), and so keep it. The other players also hear the takes and can record them. | Low      | Inherent to the game; notice on the home page. Takes are only reachable by the players of the room, and only during their presentation. |
| A player can send any valid audio (loud noise, inappropriate content), decoded by the other players' browsers.                                                     | Low      | Game among friends; kicking is possible. Up-to-date browsers decode audio in an isolated way.                                           |
| Homoglyphs in nicknames (a Cyrillic "А" imitates "A").                                                                                                             | Low      | Case-insensitive uniqueness only; acceptable among friends.                                                                             |
| Saturation: an attacker with many IPs can fill the 100 rooms or the 300 MB media quota.                                                                            | Low      | Empty rooms closed after 10 min, media bounded; if needed, extra limiting at the proxy level (step 8).                                  |
| Large-scale code search (network of machines).                                                                                                                     | Very low | 2.2 billion codes, blocking after 10 wrong codes per IP.                                                                                |
| Socket.IO connection attempts without a valid token: not limited (only authenticated connections are counted, 30 per IP).                                          | Very low | Guessing a 256-bit token is impossible; each attempt costs one hash.                                                                    |
| `TRUST_PROXY=true` assumes a single proxy and a Node port that is not directly reachable (`HOST=127.0.0.1`), otherwise `X-Forwarded-For` can be forged again.      | To check | Deployment configuration (step 8).                                                                                                      |
| HTTPS depends on the deployment.                                                                                                                                   | To check | Caddy (step 8); HSTS and `upgrade-insecure-requests` turn on automatically with an `https://` origin.                                   |
| Token in `sessionStorage`: readable by an injected script.                                                                                                         | Low      | Strict CSP, no injected HTML, no dependency loaded at run time.                                                                         |

## 5. Review of "Qui est le + ?" (who's-most, October 2026)

New surface: upload of one photo per player (PNG), read again by all the players of the room; cut-out in the browser (WebAssembly, hence `'wasm-unsafe-eval'` in `script-src`); questions read from `content/whos-most/selection.txt`.

| Problem                                                                                                                                                                 | Severity | Fix                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only the PNG signature was checked: a file under 1 MB could announce 50,000 × 50,000 pixels (decompression bomb) and exhaust the memory of the other players' browsers. | Low      | The server requires a valid `IHDR` header and at most 1024 px per side (`MAX_IMAGE_SIDE`, `core/media/sniff.ts`); the client sends 512 px. Tests. |

Verified: photos served only by the authenticated route (`no-store`, `image/png`, `nosniff`), to the participants only, during the game; deleted by the game at the end of the game and by the foundation (end, abort, closing, 2 h at most); never on disk. The vote only targets a present player (zod, then the game's check). The questions are displayed as text (React escapes them). MediaPipe's model and WASM are served by the site itself (model committed, WASM pinned by the fingerprint of `package-lock.json`).

| Remaining risk                                                                                                                               | Severity | Current or possible countermeasure                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| Any player of the room can keep the others' photos (they download them to display them).                                                     | Low      | Inherent to the game, like the takes; among friends.                                                                |
| An inappropriate photo (any valid PNG image) is shown to everybody.                                                                          | Low      | Kick by the host; game among friends.                                                                               |
| `'wasm-unsafe-eval'` allows the compilation of WebAssembly by the site's scripts.                                                            | Very low | No JavaScript `eval`; only the site's scripts (`'self'`) run, an injected script could already do everything in JS. |
| A game longer than 2 h would lose its photos (maximum lifetime of the media): heads replaced by initials. Not a flaw, a limit to know about. | —        | Keep games short, or lengthen `ttlMs` if the case arises.                                                           |

## 6. Repository security

- **Before each commit** (`.githooks/pre-commit`, enabled by `npm install`): gitleaks looks for a secret in the staged changes, Prettier checks the format of the staged files. A commit that fails is refused.
- **GitHub Actions** (`.github/workflows/ci.yml`), at each push to `main` and **every Monday**: `npm run check`, build, `npm audit`, gitleaks over the whole history. A failure sends an e-mail to the repository's author: that is how a vulnerability discovered in an existing dependency is reported without anybody pushing. Actions pinned by SHA fingerprint, read-only token.
- **Dependabot** (`.github/dependabot.yml`) keeps the fingerprints of the actions up to date. The npm dependencies are not updated through pull requests (the project commits to `main`): the weekly audit and Dependabot's alerts (repository setting) give warning.

## 7. Limits of the tests

- The microphone is simulated (Chrome's beep): the tests prove the complete chain (recording, upload, decoding and playback of the takes at each player, votes, ranking), not the quality of the audio/video sync, which remains to be judged by ear.
- The tests use the shortest valid video of `content/dubbing`: without a video, they do not start.
- Firefox is not tested (outside the priority target).
