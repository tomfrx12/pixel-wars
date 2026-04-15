# 🎮 Pixel Wars - Documentation & Contexte

## 📖 Présentation du Projet
Pixel Wars est une application web multijoueur en temps réel inspirée de "r/place". Les joueurs s'inscrivent, rejoignent une faction (Rouge, Bleu, Vert, Jaune) et placent des pixels sur une grille partagée en utilisant un système d'énergie qui se recharge avec le temps.

## 🛠️ Stack Technique
*   **Frontend** : React, Vite, Tailwind CSS. Rendu basé sur un `<canvas>`.
*   **Backend** : Node.js, Express, Socket.IO.
*   **Base de données** : SQLite (fichier `users.db` pour les identifiants) et persistance JSON (`grid.json` pour la carte).
*   **Sécurité** : JWT (JsonWebToken) persisté sur 7 jours, `bcryptjs` pour le hashage des mots de passe, `zod` pour la validation stricte des formulaires d'inscription.
*   **Déploiement** : Docker (Multi-stage build) pour un serveur unique. L'infrastructure de production est pensée pour fonctionner derrière un reverse proxy Traefik (VPS OVH).

## 📂 Architecture

Le code est divisé en deux parties distinctes qui fusionnent lors du déploiement en production :

### 1. `client/` (Frontend)
*   Application React gérée par Vite.
*   En développement : Vite agit comme un proxy (redirige `/api` et WebSocket vers `localhost:3001`).
*   Fonctionnalités clés : 
    *   Barre d'énergie dynamique.
    *   Survol de la grille affichant le propriétaire de chaque pixel.
    *   Système de rôle (Joueur classique vs Admin).
    *   Historique des logs en temps réel (réservé aux admins).
    *   Classement de Domination.

### 2. `server/` (Backend modulaire)
Le serveur a été refactoré pour la production et est divisé en modules fonctionnels dans `server/src/` :
*   `index.js` : Point d'entrée. Initialise l'environnement (`dotenv`), monte les middlewares, distribue l'application React compilée (dossier `client/dist`) et capture les erreurs globales pour éviter les crashs HTML.
*   `database.js` : Gère le chargement en RAM de `users.db` et `grid.json`, ainsi que l'enregistrement périodique (toutes les 5 sec).
*   `auth.js` : Expose les routes REST `/api/login` et `/api/register`.
*   `sockets.js` : Gère la logique temps réel (vérification des JWT, mise à jour de l'énergie, calcul probabiliste des impacts de bombes, changements de faction et envois logs admin).

## 🚀 Mécaniques de Jeu
*   **Pixels classiques** : Coûtent 5 énergies. Placés de la couleur de la faction du joueur.
*   **Bombes** : Coûtent 30 énergies. Créent une explosion tactique avec un cœur dense (100% au centre) et des éclats probabilistes sur les bords (jusqu'à une zone de ~5x5).
*   **Système Admin** (`isAdmin: 1`) :
    *   Énergie infinie.
    *   Capacité à changer de faction en direct.
    *   Accès à un panneau confidentiel "ADMIN LOGS" qui trace chaque connexion, déconnexion et pose de pixel/bombe.

## 🐳 Déploiement Docker (Production)
Le projet utilise une image Docker Multi-Stades qui :
1. Compile le frontend Vite (`npm run build`).
2. Installe le backend Node.js (`node:20` recommandé pour compiler nativement la librairie SQLite en C++ afin d'éviter l'erreur GLIBC).
3. Englobe le frontend dans le backend.
4. Lance le service Express sur le port HTTP (80 par défaut).

### Fichiers vitaux ignorés (Voir `.gitignore` et `.dockerignore`)
Les dossiers `node_modules`, `dist` et surtout la base de données locale (`users.db`, `grid.json`, `.env`) ne sont **pas** poussés sur le dépôt ou dans l'image.

### Variables d'environnement (`.env` sur le serveur)
En production, il faut instancier un `.env` à la racine :
```env
PORT=80
JWT_SECRET=super_cle_secrete_production
DATA_DIR=/app/server/data
```

### La Persistance (Volumes)
Le chemin défini dans `DATA_DIR` est capital. Le `docker-compose.yml` du VPS inclut un volume local (ex: `./data:/app/server/data`). Express sauvegardera `users.db` et `grid.json` dans ce dossier, garantissant ainsi que la base de données survit aux redémarrages du conteneur.