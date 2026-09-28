# Revue de sécurité — étape 7

> Revue du code complet (serveur, client, configuration) à la fin de l'étape 7, avec le jeu Doublage terminé.
> À refaire à chaque nouveau jeu ou changement du socle, avec la liste des invariants de [CLAUDE.md](../CLAUDE.md).

## 1. Méthode

- Relecture de toute la surface exposée : routes HTTP (`core/http/`), événements Socket.IO (`core/realtime/io.ts`), salons et sessions (`core/rooms/`), moteur (`core/engine/runner.ts`), médias (`core/media/`), contenu (`core/content/`), configuration et journalisation ; côté client, stockage du jeton, appels réseau et rendu des textes venus des joueurs.
- Vérification point par point des invariants de sécurité de `CLAUDE.md` et du tableau « exigence → mécanisme » ([architecture.md §8](architecture.md)).
- Tests de bout en bout (Playwright) sur le **build de production** : CSP réelle, vrai contrôle d'origine, vrais navigateurs (Chrome ; Brave configuré), faux micro.
- `npm audit` : aucune vulnérabilité connue.

## 2. Corrections apportées

| Problème                                                                                                                                                                                                                                                    | Gravité | Correction                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Derrière un proxy (`TRUST_PROXY=true`), l'adresse du client était la **première** entrée de `X-Forwarded-For`, que le client écrit lui-même. En la changeant à chaque requête, on contournait toutes les limites par IP (création, codes faux, connexions). | Moyenne | Seule la **dernière** entrée, ajoutée par notre proxy, est retenue (HTTP et Socket.IO). Tests : `http.test.ts`, `client-ip.test.ts`.            |
| Un refus du jeu pendant un envoi de fichier (ex. deux envois simultanés de la même prise : `TAKE_LOCKED`) devenait une erreur 500 journalisée comme un plantage.                                                                                            | Faible  | Le gestionnaire d'erreurs HTTP renvoie `409 { error: CODE }`. Test : `errors.test.ts`.                                                          |
| Pseudos « Zalgo » : des dizaines de signes combinants empilés sur une lettre débordent sur l'affichage des autres joueurs.                                                                                                                                  | Faible  | Au plus 4 signes combinants par caractère (les écritures réelles et les emoji en utilisent moins). Tests : `nickname.test.ts`.                  |
| Aucun test ne prouvait qu'un abandon en pleine manche supprime les prises pas encore présentées (étape 6).                                                                                                                                                  | —       | Test d'intégration ajouté (`media.test.ts`), et vérification de bout en bout : après « Arrêter la partie », la prise n'est plus téléchargeable. |

## 3. Invariants vérifiés

- **Entrées** : chaque événement socket passe par `handle(event, schema, run)` (zod), chaque route HTTP par `parseInput` ; la phase, le rôle d'hôte et la participation sont vérifiés par `RoomManager` et `GameRunner` avant tout traitement.
- **Jeton** : 256 bits, haché (SHA-256) côté serveur, transmis dans `auth` (Socket.IO) et `Authorization` (HTTP), jamais dans une URL ni un log.
- **Prises vocales** : types autorisés, signature binaire, taille bornée par la durée de la vidéo (contrôlée avant et pendant la réception), ids aléatoires du serveur, route authentifiée avec `no-store`, RAM uniquement, suppression en fin de manche, de partie, d'abandon, de salon, et après 2 h au plus.
- **Logs** : méthode, motif de route, statut, durée, id interne du salon. Ni IP, ni pseudo, ni code, ni corps de requête ; les clés des limiteurs sont des HMAC de l'IP.
- **Navigateur** : aucun `dangerouslySetInnerHTML` (règle ESLint), aucune ressource tierce ; la CSP stricte (`'self'`) ne provoque aucune violation sur l'application complète (vérifié par les tests E2E, qui échouent à la moindre erreur console).
- **Limitation de débit** : création de salon, tentatives de code, envois de fichiers, messages socket, connexions par IP.
- **Production** : réponses d'erreur génériques (`{ error: CODE }`, `INTERNAL` sans détail).

## 4. Risques restants

| Risque                                                                                                                                                                                       | Gravité     | Parade actuelle ou possible                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Le code (ou le lien) suffit pour entrer. Un joueur exclu peut revenir avec le même code.                                                                                                     | Faible      | Choix assumé (pas de compte). L'hôte peut fermer le salon et en ouvrir un autre.                                                         |
| Tout participant peut télécharger une prise pendant sa présentation (c'est ainsi qu'elle est lue), donc la garder. Les autres joueurs entendent aussi les prises et peuvent les enregistrer. | Faible      | Inhérent au jeu ; mention sur l'accueil. Les prises ne sont accessibles qu'aux joueurs du salon, et seulement pendant leur présentation. |
| Un joueur peut envoyer n'importe quel audio valide (bruit fort, contenu déplacé), décodé par les navigateurs des autres.                                                                     | Faible      | Jeu entre amis ; exclusion possible. Les navigateurs à jour décodent l'audio de façon isolée.                                            |
| Homoglyphes dans les pseudos (un « А » cyrillique imite « A »).                                                                                                                              | Faible      | Unicité insensible à la casse seulement ; acceptable entre amis.                                                                         |
| Saturation : un attaquant disposant de nombreuses IP peut remplir les 100 salons ou le quota de 300 Mo de médias.                                                                            | Faible      | Salons vides fermés après 10 min, médias bornés ; au besoin, limitation supplémentaire au niveau du proxy (étape 8).                     |
| Recherche de codes à grande échelle (réseau de machines).                                                                                                                                    | Très faible | 2,2 milliards de codes, blocage après 10 codes faux par IP.                                                                              |
| Tentatives de connexion Socket.IO sans jeton valide : non limitées (seules les connexions authentifiées sont comptées, 30 par IP).                                                           | Très faible | Deviner un jeton de 256 bits est impossible ; chaque tentative coûte un hachage.                                                         |
| `TRUST_PROXY=true` suppose un seul proxy et un port Node inaccessible directement (`HOST=127.0.0.1`), sinon `X-Forwarded-For` redevient falsifiable.                                         | À vérifier  | Configuration de déploiement (étape 8).                                                                                                  |
| HTTPS dépend du déploiement.                                                                                                                                                                 | À vérifier  | Caddy (étape 8) ; HSTS et `upgrade-insecure-requests` s'activent automatiquement avec une origine `https://`.                            |
| Jeton en `sessionStorage` : lisible par un script injecté.                                                                                                                                   | Faible      | CSP stricte, aucun HTML injecté, aucune dépendance chargée à l'exécution.                                                                |

## 5. Limites des tests

- Le micro est simulé (bip de Chrome) : les tests prouvent l'enchaînement complet (enregistrement, envoi, décodage et lecture des prises chez chaque joueur, votes, classement), pas la qualité de la synchro audio/vidéo, qui reste à juger à l'oreille.
- Les tests utilisent la plus courte vidéo valide de `content/dubbing` : sans vidéo, ils ne démarrent pas.
- Firefox n'est pas testé (hors cible prioritaire).
