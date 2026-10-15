# Deployment — step 8

Deployment on a Debian/Ubuntu VPS with Caddy (automatic HTTPS) and systemd. No Docker, no extra
dependency: the server is the same Node process as in development (`npm start`), launched by
systemd.

The deployment uses the classic "push to deploy" method: a bare repository on the server, and a
`post-receive` hook that installs, builds and restarts the application at every `git push`. The
GitHub repository (`origin`) and the deployment remote (`prod`) are two separate remotes.

## 0. Choosing a host

The application is tiny (a single Node process, state in RAM, a few players, two evenings a year):
the smallest offer is largely enough (1 vCPU, 1 GB of RAM). For example Hetzner CX22, Scaleway
DEV1-S, or an Oracle Cloud "Always Free" VM (free for life but a bit more configuration). Choose a
Debian 12 or Ubuntu 24.04 LTS image. Point a subdomain (`games.example.com`) to the server's IP
(DNS A/AAAA record) before continuing: Caddy needs the domain to resolve already to obtain its
certificate.

## 1. Server preparation (once, connected as root or with sudo)

First send the configuration templates versioned in this repository (from your machine):

```bash
scp -r deploy ubuntu@server:deploy   # "ubuntu": the user created by OVH, who has sudo
```

Then, on the server:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git ufw curl gnupg

# Firewall: only SSH, HTTP and HTTPS.
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Node 24 LTS (NodeSource).
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# Caddy (official repository): reverse proxy + automatic Let's Encrypt certificates.
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Dedicated user, without sudo rights, who runs the application.
sudo adduser --disabled-password --gecos "" mini-jeux
sudo loginctl enable-linger mini-jeux
```

`enable-linger` lets this user's systemd instance (`systemctl --user`) run without the user being
logged in, and start at boot.

## 2. Caddy

```bash
sudo cp ~/deploy/Caddyfile /etc/caddy/Caddyfile   # to adapt with your domain
sudo nano /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains the certificate by itself at the first access to the domain; no other TLS
configuration is needed. It also handles the switch to WebSocket for Socket.IO without any
particular setting.

## 3. Bare repository and service (once)

Still on the server, with your sudo user (`~/deploy` comes from step 1, in your user's folder):

```bash
sudo -u mini-jeux mkdir -p /home/mini-jeux/mini-jeux/current /home/mini-jeux/.config/systemd/user
sudo -u mini-jeux git init --bare /home/mini-jeux/mini-jeux/repo.git
sudo install -o mini-jeux -g mini-jeux -m 755 \
  ~/deploy/post-receive /home/mini-jeux/mini-jeux/repo.git/hooks/post-receive
sudo install -o mini-jeux -g mini-jeux -m 644 \
  ~/deploy/mini-jeux.service /home/mini-jeux/.config/systemd/user/mini-jeux.service
sudo -u mini-jeux XDG_RUNTIME_DIR=/run/user/"$(id -u mini-jeux)" systemctl --user daemon-reload
sudo -u mini-jeux XDG_RUNTIME_DIR=/run/user/"$(id -u mini-jeux)" systemctl --user enable mini-jeux
```

Give yourself direct SSH access to this user, with your public key (from your machine,
`cat ~/.ssh/id_ed25519.pub`):

```bash
sudo -u mini-jeux mkdir -p /home/mini-jeux/.ssh
sudo -u mini-jeux tee -a /home/mini-jeux/.ssh/authorized_keys <<< "YOUR_PUBLIC_KEY_HERE"
sudo chmod 700 /home/mini-jeux/.ssh
sudo chmod 600 /home/mini-jeux/.ssh/authorized_keys
```

Then create `/home/mini-jeux/mini-jeux/current/.env` (a copy of `.env.example`, never
versioned) with at least:

```
NODE_ENV=production
PUBLIC_ORIGIN=https://games.example.com
TRUST_PROXY=true
```

```bash
sudo chown mini-jeux:mini-jeux /home/mini-jeux/mini-jeux/current/.env
sudo chmod 600 /home/mini-jeux/mini-jeux/current/.env
```

`HOST` and `PORT` can stay at their defaults (`127.0.0.1:3000`): only Caddy reaches them, never
the Internet directly (guaranteed by the firewall of step 1).

## 4. First deployment (from your machine)

```bash
git remote add prod ssh://mini-jeux@server/home/mini-jeux/mini-jeux/repo.git
git push prod main
```

The `post-receive` hook installs the dependencies, builds the client and (re)starts the service.
Check:

```bash
ssh mini-jeux@server systemctl --user status mini-jeux
ssh mini-jeux@server journalctl --user -u mini-jeux -f   # logs (no IP/nickname/code, see security-review.md)
```

## 5. Content and fonts (dubbing videos, who's-most questions)

`content/` is not versioned (see `.gitignore`): it is copied separately, with `rsync`, as planned
in `architecture.md` §7.5.

```bash
ssh mini-jeux@server mkdir -p mini-jeux/current/content/dubbing
rsync -avz --delete content/dubbing/ mini-jeux@server:mini-jeux/current/content/dubbing/
ssh mini-jeux@server systemctl --user restart mini-jeux   # re-reads selection.txt at start-up
```

The questions of "Qui est le + ?" (who's-most) are a simple text file (one line per question, see
`architecture.md` §7 quater), without video:

```bash
ssh mini-jeux@server mkdir -p mini-jeux/current/content/whos-most
rsync -avz --delete content/whos-most/ mini-jeux@server:mini-jeux/current/content/whos-most/
ssh mini-jeux@server systemctl --user restart mini-jeux   # re-reads selection.txt at start-up
```

Without this folder, the game is displayed but cannot be started ("no question left"). Do this
copy **before** `git push prod main`: the push already restarts the server, a single time.

The **fonts** are not in the repository either (their licences do not allow redistributing them,
see the "Fonts" section of the README). Copy the `.woff2` files once to `~/mini-jeux/fonts` on the
server; the `post-receive` hook puts them in `client/public/fonts` before each build. Without them,
the site works with the system fonts.

```bash
ssh mini-jeux@server mkdir -p mini-jeux/fonts
rsync -avz fonts/ mini-jeux@server:mini-jeux/fonts/
```

`npm ci` runs in a folder without `.git`: the `prepare` script of `package.json` therefore does
nothing outside a clone (without this guard, it would write into the bare repository's
configuration and disable the `post-receive` hook).

## 6. Updates

- **Code**: `git push prod main` (redeploys and restarts automatically).
- **Content**: redo step 5 (new selection before an evening).
- **Dependencies** (`npm audit`, updates): as in development, then `git push prod main`.
- **System**: `apt update && apt upgrade` from time to time; consider `unattended-upgrades` for
  automatic security fixes.

## 7. Verification

- `curl https://games.example.com/api/health` → `{"ok":true}`.
- Security headers present (`curl -I`): CSP, HSTS, `Permissions-Policy`, etc. (see
  `security-review.md` §3).
- A real game with two browsers, like the manual test procedure of each previous step.
- `journalctl --user -u mini-jeux` contains no IP, no nickname, no room code.

## Reference files

- [`deploy/mini-jeux.service`](../deploy/mini-jeux.service) — systemd unit (`--user`, minimal hardening: on Ubuntu 24.04 the `ProtectSystem`, `PrivateTmp`… protections make the start-up fail with `status=218/CAPABILITIES`).
- [`deploy/Caddyfile`](../deploy/Caddyfile) — HTTPS reverse proxy.
- [`deploy/post-receive`](../deploy/post-receive) — deployment hook (`git push` → build →
  restart).

## Lessons from the first deployment (OVHcloud, September 2026)

- **Expired password**: when the VPS is created, OVH marks the `ubuntu` user's password as expired, and Ubuntu forces you to change it even when you log in with a key. If OVH's e-mail does not contain a password, use "Reset the password" in the customer area, then the password received as "Current password".
- **SSH agent**: `agent refused operation` comes from the desktop's agent, not from the server. A `Host server` shortcut with `IdentityAgent none` in `~/.ssh/config` works around it.
- **Reinstallation**: the server's fingerprint changes; `ssh-keygen -R <ip>` before connecting again.
- **Domain**: OVH's DNS form requires a subdomain (`www` here); `PUBLIC_ORIGIN` and the `Caddyfile` use the exact name (`https://www.donrgames.fr`). The bare name (`donrgames.fr`) leads nowhere without a DNS A entry pointing to the VPS and the `Caddyfile`'s `redir` block: without them, the browser shows `ERR_CONNECTION_RESET`.
- **NIS2**: OVH may ask to validate the holder's contact details of a `.fr` (e-mail with a deadline); do not click the links of the e-mail, go through the customer area (Pending operations, Contact management).
- **Changing the domain name**: the application accepts a single origin (`PUBLIC_ORIGIN`, used for the CSP and the origin check of requests and WebSockets), so the old name cannot keep serving it. In this order: add the DNS A record of the new name; add its block to the `Caddyfile` next to the old one and reload Caddy (the old name keeps working); check that the new name has its certificate; then change `PUBLIC_ORIGIN` in `.env`, restart the service and, at once, replace the old name's block by a `redir` to the new one. Players with a tab open on the old name just reload it.
