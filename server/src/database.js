const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// Le dossier de données par défaut est /app/data pour Docker, sinon le dossier parent du serveur
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DATA_FILE = path.join(DATA_DIR, 'grid.json');

const state = {
    pixels: {},
    users: {},
    scores: { red: 0, blue: 0, green: 0, yellow: 0 },
    GRID_SIZE: 200, // Retour à 200x200
    db: null
};

async function initDB() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const savedData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            if (savedData.pixels) state.pixels = savedData.pixels;
            if (savedData.scores) state.scores = savedData.scores;
            console.log("💾 Données restaurées depuis grid.json");
        } catch (e) {
            console.error("Erreur lecture grid.json :", e);
        }
    }

    state.db = await open({
        filename: path.join(DATA_DIR, 'users.db'),
        driver: sqlite3.Database
    });

    await state.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            passwordHash TEXT,
            energy INTEGER,
            team TEXT DEFAULT '',
            pixelsPlaced INTEGER DEFAULT 0,
            isAdmin INTEGER DEFAULT 0
        )
    `);

    try { await state.db.exec("ALTER TABLE users ADD COLUMN isAdmin INTEGER DEFAULT 0"); } catch (e) {}

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

    setInterval(async () => {
        fs.writeFile(DATA_FILE, JSON.stringify({ pixels: state.pixels, scores: state.scores }), () => {});
        if (state.db) {
            const dirtyUsers = Object.entries(state.users).filter(([_, u]) => u.dirty);
            if (dirtyUsers.length === 0) return;

            try {
                await state.db.exec("BEGIN TRANSACTION");
                for (const [username, u] of dirtyUsers) {
                    await state.db.run(
                        "UPDATE users SET energy = ?, team = ?, pixelsPlaced = ?, isAdmin = ? WHERE username = ?",
                        [u.energy, u.team || '', u.pixelsPlaced || 0, u.isAdmin || 0, username]
                    );
                    u.dirty = false;
                }
                await state.db.exec("COMMIT");
            } catch (e) {
                await state.db.exec("ROLLBACK");
                console.error("Erreur sauvegarde db:", e);
            }
        }
    }, 5000);
}

module.exports = { state, initDB };