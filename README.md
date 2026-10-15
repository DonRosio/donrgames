# DonrGames

A website of **real-time multiplayer mini-games** among friends, each on their own PC. No account:
you create a room, share its code, and play. The site is online at https://www.donrgames.fr.

The games themselves are in French (their screens and messages); the code and this documentation
are in English.

## The games

- **Doublage** (dubbing): lip-sync on short videos. Everybody records their voice aligned with the
  picture, then the takes are replayed one by one and submitted to the vote of the other players.
- **Among Legends**: a hidden-role game around a real League of Legends match (5 or 10 players).
  Everybody gets a secret role, plays their match, then everybody votes to guess the others' roles
  from the statistics.
- **Désamorçage** (defusal): a cooperative game for 4, inspired by _Keep Talking and Nobody
  Explodes_. One defuser sees the bomb, three experts share the manual. 8 types of modules drawn at
  random, a timer, sounds generated in the browser.
- **Qui est le + ?** (who's the most?): everybody sends a photo of their head, cut out in the
  browser, then votes for the player who best fits each question.

## Architecture

- **TypeScript monorepo**, with npm workspaces: `shared` (types, event contracts, zod schemas),
  `server` and `client`.
- **Server**: Node 24, Fastify 5 and Socket.IO 4 for real time. Every event and every request is
  validated with zod. Games live in memory, without a database.
- **Client**: Vite and React 19.
- **Foundation + games as plugins.** The foundation handles the rooms (creation, code, host,
  reconnection, expiry), the chaining of the games, the rankings and the common components. Each
  game is declared with `defineGame`, and a new game is added without touching the rest.
- **Security.** Rate limiting, private media kept in memory with authenticated access and a limited
  lifetime. A complete security review is available in
  [docs/security-review.md](docs/security-review.md).
- **Tests**: Vitest for the logic (the games can be tested without a network), Playwright end to end
  on the production build.
- **Deployment**: Ubuntu VPS, Caddy, systemd service. A `git push` triggers the deployment
  ([docs/deployment.md](docs/deployment.md)).

Details: [requirements](docs/requirements.md) · [architecture](docs/architecture.md).

## Running locally

Prerequisite: Node 24 or newer.

```bash
npm install
```

```bash
npm run dev
```

Full checks (types, lint, format, tests):

```bash
npm run check
```

End-to-end tests:

```bash
npm run test:e2e
```

### Before committing

A hook refuses the commit if a secret is detected or if the staged files are not formatted. It needs
[gitleaks](https://github.com/gitleaks/gitleaks#installing) and is enabled by `npm install`.
To report a vulnerability, see [SECURITY.md](SECURITY.md).

### Content and fonts

The content of the games (videos of Doublage, questions of Qui est le + ?) and the fonts are not in
the repository. The content goes in `content/<game>/` (see [docs/architecture.md](docs/architecture.md)
§7.5); without it, the games that need it cannot be started.

**Fonts.** The site uses four fonts whose licences do not allow redistributing them, so they are
not versioned: Shizuoka Cyberpunk (titles), Heyam (the presenter's line), Candice and Sniglet
(Qui est le + ?). To use them, put the `.woff2` files in `client/public/fonts/` under the names
listed in `design/font/usage.txt`. Without them, the site works with the system fonts.

## Approach

I imagined this project to play with my friends remotely, with games that cannot be found
elsewhere, one of them built around our League of Legends matches.

I designed and drove it, and I developed it with the assistance of **Claude** (Anthropic), used as a
pair-programming partner. Every commit message ends with a line saying it was developed with
Claude, for that reason. My role:

- **Write the requirements**: the games and their rules, the security and privacy requirements, the
  stack, the browser constraints, and the split into steps.
- **Impose a method.** An architecture plan validated before any line of code, then one step at a
  time. Each step had to start, pass the tests, be tested by hand by me, then receive my go-ahead.
- **Choose and frame the games**: the concepts, the expected rules, then the trade-offs and feedback
  along the steps.
- **Provide the art direction**: the watercolour backdrop, the presenter's illustration, the role
  pictures, and the validation of the animations.
- **Deploy and operate**: domain name, VPS, server hardening, production releases.

The code was written with Claude, then checked at every step: strict typing, lint, unit and
end-to-end tests, dependency audit, and a dedicated security review.

## License and credits

The code is under the [MIT license](LICENSE). The pictures of the site (backdrop, presenter, role
illustrations, logo, in `design/` and `client/src/assets/`) were created for this project, by me or
generated for me; they are not covered by the MIT license and are not to be reused. The fonts are
not included (see above). The photo cut-out uses Google's [MediaPipe](https://github.com/google-ai-edge/mediapipe)
(`@mediapipe/tasks-vision` and the `selfie_segmenter` model, Apache-2.0).
