const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

function setupAuth(app, state, config) {
    const authSchema = z.object({
        username: z.string()
            .min(1, "Champs manquants")
            .trim()
            .min(3, "Pseudo entre 3 et 15 caractères")
            .max(15, "Pseudo entre 3 et 15 caractères")
            .regex(/^[a-zA-Z0-9_-]+$/, "Pseudo invalide (lettres, chiffres, tirets uniquement)"),
        password: z.string()
            .min(6, "Le mot de passe doit faire au moins 6 caractères"),
        team: z.string().optional()
    });

    app.post('/api/register', async (req, res) => {
        const validation = authSchema.safeParse(req.body);
        if (!validation.success) {
            const errMsg = validation.error?.errors?.[0]?.message || JSON.stringify(validation.error) || "Format de données invalide";
            return res.status(400).json({ error: errMsg });
        }

        const { username, password, team } = validation.data;

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const userIsAdmin = (username === 'admin') ? 1 : 0;

            await state.db.run(
                "INSERT INTO users (username, passwordHash, energy, team, pixelsPlaced, isAdmin) VALUES (?, ?, ?, ?, ?, ?)",
                [username, hashedPassword, 100, team || '', 0, userIsAdmin]
            );
            
            state.users[username] = { passwordHash: hashedPassword, energy: 100, team: team || '', pixelsPlaced: 0, isAdmin: userIsAdmin };
            const token = jwt.sign({ username }, config.JWT_SECRET, { expiresIn: '1d' });
            res.json({ token, username });
        } catch (e) {
            if (e.code === 'SQLITE_CONSTRAINT') {
                return res.status(400).json({ error: "Ce pseudo est déjà pris" });
            }
            res.status(500).json({ error: "Erreur serveur" });
        }
    });

    app.post('/api/login', async (req, res) => {
        if (!req.body.username || typeof req.body.username !== 'string' ||
            !req.body.password || typeof req.body.password !== 'string') {
            return res.status(400).json({ error: "Champs manquants" });
        }

        const username = req.body.username.trim();
        const password = req.body.password;

        const user = state.users[username];
        if (!user) return res.status(400).json({ error: "Utilisateur introuvable" });

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return res.status(400).json({ error: "Mot de passe incorrect" });

        const token = jwt.sign({ username }, config.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, username });
    });
}

module.exports = { setupAuth };