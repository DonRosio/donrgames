# Projet : site de mini-jeux multijoueurs entre amis

## Contexte
Je veux créer un site web pour jouer à des mini-jeux entre amis, chacun sur son appareil (PC ou téléphone), en temps réel. Pas de comptes : on rejoint une partie avec un code. Je développe sous Linux Mint. Le site doit être extensible : je veux ajouter de nouveaux mini-jeux au fil du temps sans restructurer le reste.

## Méthode de travail
- Avant d'écrire du code, lis tout ce prompt, pose-moi tes questions sur les points ambigus, puis propose un plan d'architecture détaillé (arborescence, interfaces, flux d'événements) et attends ma validation.
- Travaille par étapes (voir « Étapes »). À la fin de chaque étape : le projet démarre, les tests passent, et tu m'expliques comment tester à la main. Attends mon feu vert avant l'étape suivante.
- Crée et tiens à jour un fichier CLAUDE.md à la racine : architecture, conventions, commandes utiles, procédure pour ajouter un jeu.
- Code et commentaires en anglais, interface utilisateur en français.
- Un commit git par étape terminée.

## Stack technique (propose une alternative seulement si tu as une vraie raison)
- TypeScript partout, monorepo npm workspaces : `shared` (types, contrats d'événements), `server`, `client`.
- Serveur : Node.js LTS, Fastify, Socket.IO pour le temps réel.
- Client : Vite + React.
- Validation : zod côté serveur, sur chaque événement socket et chaque requête HTTP.
- Tests : Vitest (la logique de jeu doit être testable sans réseau).
- État des parties en mémoire, pas de base de données pour l'instant.

## Architecture : un socle commun + des jeux en plugins
Le socle gère tout ce qui est commun :
- Salons : création, code, rejoindre, liste des joueurs, hôte, reconnexion, fermeture, expiration.
- Enchaînement : dans un salon, l'hôte choisit un jeu et le lance ; à la fin, retour au salon pour en choisir un autre avec les mêmes joueurs.
- Composants UI réutilisables : tableau des scores, écran de classement, minuteur, composant de vote, lecteur vidéo synchronisé, enregistreur audio.

Chaque jeu est un module isolé, avec une partie serveur dans `server/src/games/<id>/` et une partie client dans `client/src/games/<id>/`, déclaré dans un registre (une ligne par jeu). Un jeu expose au minimum :
- des métadonnées : id, nom, description, nombre de joueurs min/max, `replayable` (booléen) ;
- une machine à états côté serveur (phases, actions autorisées par phase, transitions), seule source de vérité ;
- une fonction qui construit la vue envoyée à chaque joueur (chacun ne reçoit que ce qu'il a le droit de voir) ;
- les écrans client de chaque phase.

Ajouter un jeu = créer ses deux dossiers + une ligne dans chaque registre, sans modifier le socle. Valide cette architecture avec un petit jeu de test avant de coder le vrai jeu.

Rejouabilité : certains jeux n'ont d'intérêt qu'une fois (leur contenu est « consommé »). Prévois `replayable: false` dans les métadonnées et un suivi du contenu déjà joué (au minimum : un même contenu n'est jamais proposé deux fois dans un salon).

## Page d'accueil
- Présentation du site et liste des jeux disponibles, générée depuis le registre, avec un badge « à usage unique » pour les jeux non rejouables.
- Deux actions : « Créer une partie » et « Rejoindre » (champ code + pseudo).
- Code de partie : 6 caractères aléatoires parmi A–Z et 0–9, générés avec un générateur cryptographique (crypto.randomInt), unicité vérifiée parmi les salons actifs. Saisie insensible à la casse.
- Lien partageable du type /join/ABC123 qui préremplit le code.
- Mention courte : « Aucun compte. Tes enregistrements sont supprimés à la fin de la partie. »

## Premier jeu : « Doublage » (nom provisoire)
Déroulé d'une manche :

1. Diffusion : une vidéo courte (meme, extrait de film…) est jouée une seule fois pour tous les joueurs en même temps, avec le son original. Les clients préchargent la vidéo et signalent au serveur qu'ils sont prêts ; le serveur donne alors un départ commun (horodatage avec compensation du décalage d'horloge client/serveur).

2. Enregistrement, simultané pour tous :
   - Chaque joueur peut revoir la vidéo avec le son, de son côté, autant qu'il veut.
   - Quand il lance un enregistrement, la vidéo repart du début sans son (pour le lip-sync) et le micro enregistre ; l'enregistrement s'arrête automatiquement à la fin de la vidéo. Impossible de revoir la vidéo avec le son pendant un enregistrement.
   - Il peut réécouter sa prise (vidéo muette + sa voix) et se réenregistrer autant de fois qu'il veut tant qu'il n'a pas validé.
   - Une fois validée, la dernière prise est verrouillée et envoyée au serveur. Seule la prise validée quitte l'appareil ; les autres restent en local et sont jetées.
   - Tout le monde voit qui a validé (sans entendre les prises). La phase se termine quand tous les joueurs ont validé.
   - Attention à la synchro audio/vidéo : mesure le décalage entre le démarrage du MediaRecorder et celui de la vidéo, et compense-le à la lecture.

3. Présentation, joueur par joueur (ordre aléatoire) :
   - La vidéo passe pour tout le monde, muette, avec la prise du joueur en cours comme bande son, synchronisée.
   - Vote : chaque autre joueur donne 0, +1 ou +2. Le +2 n'est utilisable qu'une fois par manche et par votant. On ne vote pas pour soi.
   - Quand tout le monde a voté, un tableau affiche chaque votant et ce qu'il a donné, avec une animation (le « +1 » ou « +2 » apparaît puis s'estompe en fondu), puis le total gagné par ce joueur.
   - On passe au joueur suivant, jusqu'à ce que tous soient passés.

4. Fin de manche : classement avec les points gagnés dans la manche et le score total de chaque joueur. Puis nouvelle manche avec une nouvelle vidéo.

5. Fin de partie après le nombre de manches choisi par l'hôte : classement final, retour au salon.

Contenu : pour commencer, des vidéos MP4 courtes (environ 5 à 20 s) que je fournis dans un dossier, décrites dans un fichier manifeste (id, titre, fichier, durée). Explique-moi comment en ajouter.

Toutes les règles (un seul +2 par manche, pas de double vote, pas de vote pour soi, actions autorisées uniquement dans la bonne phase, prise verrouillée après validation) sont vérifiées côté serveur. Le client ne fait qu'afficher et envoyer des intentions.

## Sécurité et confidentialité (exigences, pas des options)
Les enregistrements vocaux sont des données personnelles : traite-les comme telles.
- Serveur autoritaire : ne jamais faire confiance au client. Chaque message est validé (types, tailles, phase courante, droits hôte/joueur).
- Identité sans compte : à l'entrée dans un salon, le serveur génère un jeton de session aléatoire (crypto, au moins 128 bits), stocké en sessionStorage, qui sert à la reconnexion. Aucun identifiant de joueur envoyé par le client n'est accepté tel quel.
- Enregistrements : type MIME et taille vérifiés (limite stricte adaptée à la durée max d'une vidéo), noms de fichiers générés par le serveur, accès réservé aux membres du salon via leur jeton, jamais servis en statique public, supprimés à la fin de la partie, à la fermeture du salon, et par une expiration automatique de sécurité même en cas de plantage. Aucun contenu audio dans les logs.
- Salons : expiration après inactivité, nombre max de joueurs, limitation de débit (création de salons, tentatives de code, messages socket) contre le force brute et le spam. maxHttpBufferSize de Socket.IO limité.
- Pseudos : longueur limitée, caractères contrôlés, jamais injectés en HTML brut (pas de dangerouslySetInnerHTML).
- En-têtes HTTP : Content-Security-Policy stricte, en-têtes de sécurité (équivalent helmet pour Fastify), CORS limité à l'origine du site, messages d'erreur génériques en production (pas de stack trace).
- Aucun traqueur, aucune analytics, aucune ressource tierce (polices, CDN) qui ferait fuiter l'IP des joueurs.
- Logs minimaux : pas d'IP ni de pseudo conservés durablement.
- HTTPS obligatoire en production (le navigateur l'exige de toute façon pour le micro).
- Dépendances réduites au nécessaire, npm audit à chaque étape.
- À la fin, fais une revue de sécurité complète et liste les risques restants.

## Contraintes navigateur
- Chrome, Firefox et Safari, sur ordinateur et mobile (iPhone compris : Safari enregistre en audio/mp4, pas en webm).
- Gérer proprement : micro refusé, lecture automatique bloquée (bouton « Activer le son » si besoin), perte de connexion et reconnexion en cours de partie.
- Interface responsive, confortable sur téléphone.

## Étapes
1. Questions + plan d'architecture + CLAUDE.md (pas de code).
2. Socle : monorepo, serveur, client, page d'accueil, créer/rejoindre un salon, salon d'attente, reconnexion, expiration des salons. Tests.
3. Système de plugins + jeu de test minimal (par ex. « cliquer le plus vite ») pour valider l'architecture et les composants communs (scores, classement).
4. Doublage, partie 1 : manifeste vidéo, diffusion synchronisée, phase d'enregistrement complète (revoir, enregistrer, réécouter, recommencer, valider, envoi sécurisé).
5. Doublage, partie 2 : présentation synchronisée, votes, tableau animé.
6. Doublage, partie 3 : enchaînement des manches, classements intermédiaires et final, suivi du contenu déjà joué.
7. Passe sécurité complète + tests de bout en bout (plusieurs onglets/joueurs) + corrections.
8. Préparation du déploiement : build de production, variables d'environnement, HTTPS, recommandations d'hébergement.

## Points à trancher avec moi à l'étape 1
- Que faire si un joueur ne valide jamais ou se déconnecte (minuteur ? l'hôte peut forcer la suite ?).
- Minuteurs éventuels pour l'enregistrement et le vote.
- Nombre de joueurs min/max et nombre de manches par défaut.
- Suivi du contenu « déjà joué » d'une soirée à l'autre (sans compte).
