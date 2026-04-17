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
*   Architecture Modulaire (`src/components/`) :
    *   `GameCanvas.jsx` : Rendu haute performance (`React.memo`) avec Dual-Canvas (OffscreenCanvas). Throttling via `requestAnimationFrame`.
    *   `Sidebar.jsx` : Contrôles d'armement, sélection de faction et affichage des scores.
    *   `Header.jsx` : Statistiques de session et informations utilisateur.
    *   `AdminPanel.jsx` : Logs système et contrôles de maintenance.
*   Fonctionnalités clés : 
    *   Barre d'énergie dynamique (recharge 2% par seconde).
    *   Système de Zoom et Pan (déplacement à la souris).
    *   Survol de la grille affichant le propriétaire de chaque pixel.
    *   Rendu optimisé : Redessine uniquement les pixels modifiés sur l'OffscreenCanvas.

### 2. `server/` (Backend modulaire)
Le serveur est divisé en modules fonctionnels dans `server/src/` :
*   `index.js` : Point d'entrée. Initialise la configuration globale (`serverConfig`), monte les middlewares de sécurité (Helmet, RateLimit) et gère le routage statique.
*   `database.js` : Gère la persistance SQLite (`game.db`) pour les utilisateurs et les pixels.
*   `auth.js` : Routes `/api/login` et `/api/register` avec validation Zod et hashage Bcrypt.
*   `sockets.js` : Orchestration temps réel. Gère les modes d'attaque (Pixel, Bombe, Nuke), le mode Admin, les mises à jour de scores et les logs.

## 🚀 Mécaniques de Jeu
*   **Pixels classiques** : Coûtent 5 énergies.
*   **Bombes** : Coûtent 20 énergies. Zone de dégâts ~5x5 avec dispersion probabiliste.
*   **Nuke** : Coûtent 100 énergies (réservé aux admins ou joueurs max énergie). Zone massive 19x19.
*   **Nuke Full Map (ADMIN)** : Disponible uniquement pour les administrateurs via un bouton dédié. Conquiert instantanément toute la grille pour la faction sélectionnée.
*   **Système Admin** (`isAdmin: 1`) :
    *   Énergie infinie.
    *   Capacité à changer de faction en direct.
    *   Accès à un panneau "ADMIN LOGS" temps réel.
    *   Contrôle total des nukes et reset de grille.

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