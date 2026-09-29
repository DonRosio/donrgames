# Déploiement — étape 8

Déploiement sur un VPS Debian/Ubuntu avec Caddy (HTTPS automatique) et systemd. Pas de Docker,
pas de dépendance de plus : le serveur est le même process Node qu'en développement
(`npm start`), lancé par systemd.

Le dépôt git de ce projet est local, sans remote GitHub (voir `CLAUDE.md`). Le déploiement
utilise donc le procédé classique « push pour déployer » : un dépôt bare sur le serveur, un hook
`post-receive` qui installe, construit et redémarre l'application à chaque `git push`.

## 0. Choisir un hébergeur

L'application est minuscule (un seul process Node, état en RAM, quelques joueurs, deux soirées
par an) : la plus petite offre suffit largement (1 vCPU, 1 Go de RAM). Par exemple Hetzner CX22,
Scaleway DEV1-S, ou une VM « Always Free » d'Oracle Cloud (gratuite à vie mais un peu plus de
configuration). Choisis une image Debian 12 ou Ubuntu 24.04 LTS. Pointe un sous-domaine
(`jeux.exemple.com`) vers l'IP du serveur (enregistrement DNS A/AAAA) avant de continuer :
Caddy a besoin que le domaine résolve déjà pour obtenir son certificat.

## 1. Préparation du serveur (une fois, connecté en root ou avec sudo)

Envoie d'abord les modèles de configuration versionnés dans ce dépôt (depuis ta machine) :

```bash
scp -r deploy ubuntu@serveur:deploy   # « ubuntu » : l'utilisateur créé par OVH, qui a sudo
```

Puis, sur le serveur :

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git ufw curl gnupg

# Pare-feu : uniquement SSH, HTTP et HTTPS.
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Node 24 LTS (NodeSource).
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# Caddy (dépôt officiel) : reverse proxy + certificats Let's Encrypt automatiques.
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Utilisateur dédié, sans droit sudo, qui fait tourner l'application.
sudo adduser --disabled-password --gecos "" mini-jeux
sudo loginctl enable-linger mini-jeux
```

`enable-linger` permet à l'instance systemd de cet utilisateur (`systemctl --user`) de tourner
sans qu'il soit connecté, et de démarrer au boot.

## 2. Caddy

```bash
sudo cp ~/deploy/Caddyfile /etc/caddy/Caddyfile   # à adapter avec ton domaine
sudo nano /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtient seul le certificat au premier accès au domaine ; aucune autre configuration TLS
n'est nécessaire. Il gère aussi le passage en WebSocket pour Socket.IO sans réglage particulier.

## 3. Dépôt bare et service (une fois)

Toujours sur le serveur, avec ton utilisateur sudo (`~/deploy` vient de l'étape 1, dans le dossier de ton utilisateur) :

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

Donne-toi l'accès SSH direct à cet utilisateur, avec ta clé publique (depuis ta machine,
`cat ~/.ssh/id_ed25519.pub`) :

```bash
sudo -u mini-jeux mkdir -p /home/mini-jeux/.ssh
sudo -u mini-jeux tee -a /home/mini-jeux/.ssh/authorized_keys <<< "TA_CLÉ_PUBLIQUE_ICI"
sudo chmod 700 /home/mini-jeux/.ssh
sudo chmod 600 /home/mini-jeux/.ssh/authorized_keys
```

Crée ensuite `/home/mini-jeux/mini-jeux/current/.env` (copie de `.env.example`, jamais
versionné) avec au minimum :

```
NODE_ENV=production
PUBLIC_ORIGIN=https://jeux.exemple.com
TRUST_PROXY=true
```

```bash
sudo chown mini-jeux:mini-jeux /home/mini-jeux/mini-jeux/current/.env
sudo chmod 600 /home/mini-jeux/mini-jeux/current/.env
```

`HOST` et `PORT` peuvent rester par défaut (`127.0.0.1:3000`) : seul Caddy y accède, jamais
Internet directement (vérifié par le pare-feu à l'étape 1).

## 4. Premier déploiement (depuis ta machine)

```bash
git remote add prod ssh://mini-jeux@serveur/home/mini-jeux/mini-jeux/repo.git
git push prod main
```

Le hook `post-receive` installe les dépendances, construit le client et (re)démarre le service.
Vérifie :

```bash
ssh mini-jeux@serveur systemctl --user status mini-jeux
ssh mini-jeux@serveur journalctl --user -u mini-jeux -f   # logs (aucune IP/pseudo/code, cf. revue-securite.md)
```

## 5. Contenu (vidéos de Doublage)

`content/` n'est pas versionné (voir `.gitignore`) : il se copie à part, par `rsync`, comme prévu
dans `architecture.md` §7.5.

```bash
ssh mini-jeux@serveur mkdir -p mini-jeux/current/content/dubbing
rsync -avz --delete content/dubbing/ mini-jeux@serveur:mini-jeux/current/content/dubbing/
ssh mini-jeux@serveur systemctl --user restart mini-jeux   # relit selection.txt au démarrage
```

## 6. Mises à jour

- **Code** : `git push prod main` (redéploie et redémarre automatiquement).
- **Contenu** : refaire l'étape 5 (nouvelle sélection avant une soirée).
- **Dépendances** (`npm audit`, mises à jour) : comme en développement, puis `git push prod main`.
- **Système** : `apt update && apt upgrade` de temps en temps ; envisager
  `unattended-upgrades` pour les correctifs de sécurité automatiques.

## 7. Vérification

- `curl https://jeux.exemple.com/api/health` → `{"ok":true}`.
- En-têtes de sécurité présents (`curl -I`) : CSP, HSTS, `Permissions-Policy`, etc. (voir
  `revue-securite.md` §3).
- Une vraie partie à deux navigateurs, comme la procédure de test manuel de chaque étape
  précédente.
- `journalctl --user -u mini-jeux` ne contient ni IP, ni pseudo, ni code de salon.

## Fichiers de référence

- [`deploy/mini-jeux.service`](../deploy/mini-jeux.service) — unité systemd (`--user`, durcissement minimal : sous Ubuntu 24.04 les protections `ProtectSystem`, `PrivateTmp`… font échouer le démarrage en `status=218/CAPABILITIES`).
- [`deploy/Caddyfile`](../deploy/Caddyfile) — reverse proxy HTTPS.
- [`deploy/post-receive`](../deploy/post-receive) — hook de déploiement (`git push` → build →
  redémarrage).

## Retours du premier déploiement (OVHcloud, septembre 2026)

- **Mot de passe expiré** : à la création du VPS, OVH marque le mot de passe de l'utilisateur `ubuntu` comme expiré, et Ubuntu impose de le changer même en se connectant par clé. Si le mail d'OVH ne contient pas de mot de passe, utiliser « Réinitialiser le mot de passe » dans l'espace client, puis le mot de passe reçu comme « Current password ».
- **Agent SSH** : `agent refused operation` vient de l'agent du bureau, pas du serveur. Le raccourci `Host serveur` avec `IdentityAgent none` (voir `CLAUDE.md`) le contourne.
- **Réinstallation** : l'empreinte du serveur change ; `ssh-keygen -R <ip>` avant de se reconnecter.
- **Domaine** : le formulaire DNS d'OVH exige un sous-domaine (`www` ici) ; `PUBLIC_ORIGIN` et le `Caddyfile` utilisent le nom exact (`https://www.donrgames.fr`). Le nom nu ne mène nulle part sans redirection.
- **NIS2** : OVH peut demander de valider les coordonnées du titulaire d'un `.fr` (mail avec échéance) ; ne pas cliquer les liens du mail, passer par l'espace client (Opérations en cours, Gestion des contacts).
