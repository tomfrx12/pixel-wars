const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const JWT_SECRET = process.env.JWT_SECRET || 'pixel-wars-super-secret-key-2026';

const app = express();
app.use(cors());
app.use(express.json()); // Permet à Express de lire le JSON dans req.body

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Configuration de la grille (ex: 50x50 pixels)
const GRID_SIZE = 50;
let pixels = {}; // On stocke ici sous forme "x-y": { color, faction }
let users = {};  // On stocke ici { username: { passwordHash, energy: 100 } }
// Scores globaux partagés entre tous les clients
let scores = { red: 0, blue: 0, green: 0, yellow: 0 };

// --- SYSTEME DE SAUVEGARDE (PERSISTANCE) ---
const path = require('path');

// Permet de définir un dossier de données spécifique via Docker (ex: /app/server/data), 
// sinon utilise le dossier courant en local.
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DATA_FILE = path.join(DATA_DIR, 'grid.json');

// 1. Restaurer au démarrage du serveur
if (fs.existsSync(DATA_FILE)) {
    try {
        const savedData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        if (savedData.pixels) pixels = savedData.pixels;
        if (savedData.scores) scores = savedData.scores;
        console.log("💾 Données restaurées depuis grid.json !");
    } catch (e) {
        console.error("Erreur de lecture de grid.json :", e);
    }
}

let db = null;

// Initialisation Base de Données SQLite pour les Utilisateurs
(async () => {
    db = await open({
        filename: path.join(DATA_DIR, 'users.db'),
        driver: sqlite3.Database
    });
    
    // Création de la table 'users'
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY, 
            passwordHash TEXT, 
            energy INTEGER,
            team TEXT DEFAULT '',
            pixelsPlaced INTEGER DEFAULT 0,
            isAdmin INTEGER DEFAULT 0
        )
    `);

    // Migration automatique au cas où la table existe déjà pour rajouter la colonne isAdmin
    try { await db.exec("ALTER TABLE users ADD COLUMN isAdmin INTEGER DEFAULT 0"); } catch (e) {}
    
    // Charger tous les utilisateurs en mémoire (fast-cache pour le jeu)
    const rows = await db.all("SELECT * FROM users");
    rows.forEach(row => {
        users[row.username] = { 
            passwordHash: row.passwordHash, 
            energy: row.energy,
            team: row.team,
            pixelsPlaced: row.pixelsPlaced,
            isAdmin: row.isAdmin || 0
        };
    });
    console.log(`🗄️ ${rows.length} utilisateurs chargés depuis SQLite !`);
})();

// 2. Sauvegarder automatiquement toutes les 5 secondes (pour limiter l'écriture disque)
setInterval(() => {
    // Sauvegarde de la grille
    fs.writeFile(DATA_FILE, JSON.stringify({ pixels, scores }), (err) => {
        if (err) console.error("Erreur de sauvegarde de la grille :", err);
    });

    // Mettre à jour l'énergie et les statistiques des joueurs en DB
    if (db) {
        Object.keys(users).forEach(async (username) => {
            await db.run(
                "UPDATE users SET energy = ?, team = ?, pixelsPlaced = ?, isAdmin = ? WHERE username = ?", 
                [users[username].energy, users[username].team || '', users[username].pixelsPlaced || 0, users[username].isAdmin || 0, username]
            );
        });
    }
}, 5000);

// 3. Diffuser les scores à tout le monde 2 fois par seconde au lieu d'à chaque clic
setInterval(() => {
    io.emit('update-scores', scores);
}, 500);

// Helper: renvoie une map "x-y" -> color (le client attend juste la couleur)
function getGridColors() {
    const out = {};
    Object.entries(pixels).forEach(([key, value]) => {
        out[key] = value && value.color ? value.color : value;
    });
    return out;
}

// --- ROUTES D'AUTHENTIFICATION ---
const { z } = require('zod');

const authSchema = z.object({
    username: z.string()
        .min(1, "Champs manquants") // Vérifie que ça n'est pas vide avant le trim
        .trim()
        .min(3, "Pseudo entre 3 et 15 caractères")
        .max(15, "Pseudo entre 3 et 15 caractères")
        .regex(/^[a-zA-Z0-9_-]+$/, "Pseudo invalide (lettres, chiffres, tirets uniquement)"),
    password: z.string()
        .min(6, "Le mot de passe doit faire au moins 6 caractères"),
    team: z.string().optional()
});

app.post('/api/register', async (req, res) => {
    // 1 & 2. Validation et nettoyage avec Zod
    const validation = authSchema.safeParse(req.body);
    if (!validation.success) {
        // Renvoie la première erreur trouvée par Zod
        return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { username, password, team } = validation.data;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const userIsAdmin = (username === 'admin') ? 1 : 0; // Seul le compte "admin" aura ce rôle

        await db.run("INSERT INTO users (username, passwordHash, energy, team, pixelsPlaced, isAdmin) VALUES (?, ?, ?, ?, ?, ?)", [username, hashedPassword, 100, team || '', 0, userIsAdmin]);
        users[username] = { passwordHash: hashedPassword, energy: 100, team: team || '', pixelsPlaced: 0, isAdmin: userIsAdmin }; // On garde en mémoire pour la réactivité du websocket

        // 3. Expiration du Token (7 jours)
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, username });
    } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ error: "Ce pseudo est déjà pris" });
        }
        res.status(500).json({ error: "Erreur serveur" });
    }
});

app.post('/api/login', async (req, res) => {
    // Basic format check for login without detailing security constraints
    if (!req.body.username || typeof req.body.username !== 'string' || 
        !req.body.password || typeof req.body.password !== 'string') {
        return res.status(400).json({ error: "Champs manquants" });
    }

    const username = req.body.username.trim();
    const password = req.body.password;

    // Check SQLite cache    
    const user = users[username];
    if (!user) return res.status(400).json({ error: "Utilisateur introuvable" });

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(400).json({ error: "Mot de passe incorrect" });

    // Expiration identique (7 jours)
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
});

// --- SECURISATION SOCKET.IO ---
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Accès refusé. Token manquant."));

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error("Accès refusé. Token invalide."));
        socket.username = decoded.username;
        next();
    });
});

// Le timer global d'énergie (au lieu d'être lié à socket.id)
setInterval(() => {
    Object.keys(users).forEach(username => {
        if (users[username].energy < 100) {
            users[username].energy += 2;
            if (users[username].energy > 100) users[username].energy = 100;
        }
    });
    // On envoie l'update d'énergie à tous ceux qui sont connectés
    io.sockets.sockets.forEach(socket => {
        if (socket.username && users[socket.username]) {
            socket.emit('energy-update', users[socket.username].energy);
        }
    });
}, 1000);

io.on('connection', (socket) => {
    const username = socket.username;
    
    // Sécurité: Si l'utilisateur n'est pas ou a été supprimé de la base de données
    if (!users[username]) {
        console.log(`❌ Rejet de ${username} (non trouvé en base de données)`);
        socket.emit('error-msg', 'Session expirée ou utilisateur supprimé. Veuillez vous reconnecter.');
        socket.disconnect(true);
        return;
    }

    console.log(`✅ ${username} s'est connecté.`);

    // Envoyer l'énergie initiale au joueur lié à son compte
    socket.emit('energy-update', users[username].energy);
    socket.emit('stats-update', { team: users[username].team, pixelsPlaced: users[username].pixelsPlaced, isAdmin: users[username].isAdmin === 1 });

    // Envoyer la grille actuelle et les scores au nouveau client
    socket.emit('init-grid', getGridColors());
    socket.emit('update-scores', scores);

    // Permet à l'administrateur de changer sa Faction en direct
    socket.on('change-team', (newTeam) => {
        const user = users[username];
        if (!user || user.isAdmin !== 1) return;
        
        user.team = newTeam;
        socket.emit('stats-update', { team: user.team, pixelsPlaced: user.pixelsPlaced, isAdmin: true });
        console.log(`👑 [${username}] a changé de faction pour : ${newTeam}`);
    });

    socket.on('place-pixel', ({ x, y, color, faction, isBomb }) => {
        const user = users[username];
        if (!user) return;
        
        const isAdmin = user.isAdmin === 1;

        // L'admin peut jouer pour n'importe quelle faction, sinon on force celle du joueur
        const userFaction = isAdmin ? faction : (user.team || faction);
        
        const cost = isBomb ? 30 : 5; // <-- Selon votre script actuel on dirait 30 et 5, sinon ajustez
        
        if (!isAdmin && user.energy < cost) {
            socket.emit('error-msg', `Pas assez d'énergie ! (${cost} NRG requis)`);
            return;
        }

        // Mapping couleur/faction pour s'assurer que c'est synchro
        const FACTION_COLORS = { red: '#ff4444', blue: '#4444ff', green: '#44ff44', yellow: '#ffff44' };
        const activeColor = FACTION_COLORS[userFaction] || color;

        // Déterminer la liste des pixels touchés
        const pixelsToUpdate = [];
        if (isBomb) {
            // Zone 3x3 centrée sur le clic
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    pixelsToUpdate.push({ px: x + dx, py: y + dy });
                }
            }
        } else {
            // Pixel unique
            pixelsToUpdate.push({ px: x, py: y });
        }

        let scoreChanged = false;

        pixelsToUpdate.forEach(({ px, py }) => {
            // Vérifier les limites de la grille
            if (px >= 0 && px < GRID_SIZE && py >= 0 && py < GRID_SIZE) {
                const key = `${px}-${py}`;
                const oldPixel = pixels[key];

                if (oldPixel && oldPixel.faction === userFaction) {
                    return; // Déjà à cette faction, on l'ignore (gratuit)
                }

                // 1. Gestion des scores (on retire l'ancien)
                if (oldPixel && oldPixel.faction && scores[oldPixel.faction] !== undefined) {
                    if (scores[oldPixel.faction] > 0) scores[oldPixel.faction]--;
                }

                // 2. Mise à jour du pixel
                pixels[key] = { color: activeColor, faction: userFaction };

                // 3. Nouveau score
                if (scores[userFaction] !== undefined) {
                    scores[userFaction]++;
                }

                scoreChanged = true;

                // 4. Diffusion du nouveau pixel à tout le monde
                io.emit('update-pixel', { x: px, y: py, color: activeColor });
                
                // 5. Incrémenter le compteur de pixels placés
                user.pixelsPlaced = (user.pixelsPlaced || 0) + 1;
            }
        });

        // Déduire l'énergie (seulement si pas admin)
        if (!isAdmin) {
            user.energy -= cost;
        }

        // Mettre à jour le client (les scores partent maintenant par le setInterval)
        socket.emit('energy-update', user.energy);
        socket.emit('stats-update', { team: user.team, pixelsPlaced: user.pixelsPlaced, isAdmin: user.isAdmin === 1 });
        
        console.log(`🎮 [${username}] ${isBomb ? 'Bombe' : 'Pixel'} : Faction ${userFaction}`);
    });

    socket.on('disconnect', () => {
        console.log(`❌ ${username} s'est déconnecté.`);
    });
});

// --- DEPLOIEMENT PRODUCTION (Vite + Express) ---
// Distribue les fichiers statiques de Vite une fois le projet compile
app.use(express.static(path.join(__dirname, '../client/dist')));

// Express 5.x : Le joker général n'est plus '*', mais une expression régulière catch-all
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
});

// Écoute sur le port 80 si spécifié, ou fallback
const PORT = process.env.PORT || 80;
server.listen(PORT, () => {
    console.log(`Serveur Pixel Wars prêt sur le port ${PORT}`);
});