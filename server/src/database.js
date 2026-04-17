const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');

// Le dossier de données par défaut est /app/data pour Docker, sinon le dossier parent du serveur
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const state = {
    pixels: {},
    users: {},
    scores: { red: 0, blue: 0, green: 0, yellow: 0 },
    GRID_SIZE: 200, // Retour à 200x200
    db: null
};

async function initDB() {
    console.log(`📂 DATA_DIR utilisé : ${path.resolve(DATA_DIR)}`);
    state.db = await open({
        filename: path.join(DATA_DIR, 'game.db'),
        driver: sqlite3.Database
    });
    console.log(`💾 Base de données connectée : ${path.join(DATA_DIR, 'game.db')}`);

    // Création des tables
    await state.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            passwordHash TEXT,
            energy INTEGER,
            team TEXT DEFAULT '',
            pixelsPlaced INTEGER DEFAULT 0,
            isAdmin INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS pixels (
            x INTEGER,
            y INTEGER,
            color TEXT,
            faction TEXT,
            username TEXT,
            PRIMARY KEY (x, y)
        );
    `);

    // Chargement des pixels en mémoire
    const pixels = await state.db.all("SELECT * FROM pixels");
    pixels.forEach(p => {
        state.pixels[`${p.x}-${p.y}`] = { color: p.color, faction: p.faction, username: p.username };
        if (state.scores[p.faction] !== undefined) state.scores[p.faction]++;
    });
    console.log(`💾 ${pixels.length} pixels chargés depuis SQLite !`);

    // Chargement des utilisateurs
    const rows = await state.db.all("SELECT * FROM users");
    rows.forEach(row => {
        state.users[row.username] = {
            passwordHash: row.passwordHash,
            energy: row.energy,
            team: row.team,
            pixelsPlaced: row.pixelsPlaced,
            isAdmin: row.isAdmin || 0
        };
    });
    console.log(`🗄️ ${rows.length} utilisateurs chargés !`);

    // Sauvegarde périodique (Batch)
    setInterval(async () => {
        if (!state.db) return;

        const dirtyUsers = Object.entries(state.users).filter(([_, u]) => u.dirty);
        const dirtyPixels = Object.entries(state.pixels).filter(([_, p]) => p.dirty);

        if (dirtyUsers.length === 0 && dirtyPixels.length === 0) return;

        try {
            await state.db.exec("BEGIN TRANSACTION");
            
            for (const [username, u] of dirtyUsers) {
                await state.db.run(
                    "UPDATE users SET energy = ?, team = ?, pixelsPlaced = ?, isAdmin = ? WHERE username = ?",
                    [u.energy, u.team || '', u.pixelsPlaced || 0, u.isAdmin || 0, username]
                );
                u.dirty = false;
            }

            for (const [key, p] of dirtyPixels) {
                const [px, py] = key.split('-').map(Number);
                await state.db.run(
                    "INSERT OR REPLACE INTO pixels (x, y, color, faction, username) VALUES (?, ?, ?, ?, ?)",
                    [px, py, p.color, p.faction, p.username || '']
                );
                p.dirty = false;
            }

            await state.db.exec("COMMIT");
        } catch (e) {
            await state.db.exec("ROLLBACK");
            console.error("Erreur sauvegarde db collective :", e);
        }
    }, 5000);
}

module.exports = { state, initDB };