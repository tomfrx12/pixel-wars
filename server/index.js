require('dotenv').config({ path: '../.env' });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const msgpackParser = require('socket.io-msgpack-parser');

const { state, initDB } = require('./src/database.js');
const { setupAuth } = require('./src/auth.js');
const { setupSockets } = require('./src/sockets.js');

const JWT_SECRET = process.env.JWT_SECRET || 'pixel-wars-super-secret-key-2026';

const app = express();

// Sécurité HTTP
app.use(helmet({
    contentSecurityPolicy: false, // Désactivé pour faciliter le dev/déploiement rapide, à affiner en prod
}));

// Limitation du débit (Rate Limiting) pour éviter le brute force et le spam API
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limite chaque IP à 100 requêtes par windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    parser: msgpackParser // Utilisation de MsgPack pour réduire la taille des payloads
});

(async () => {
    try {
        await initDB();
        setupAuth(app, state, JWT_SECRET);
        setupSockets(io, state, JWT_SECRET);

        app.use(express.static(path.join(__dirname, '../client/dist')));
        app.get(/(.*)/, (req, res) => {
            res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
        });

        app.use((err, req, res, next) => {
            console.error('? Erreur serveur attrap�e :', err);
            res.status(500).json({ error: "Erreur serveur : " + (err.message || "") });
        });

        const PORT = process.env.PORT || 80;
        server.listen(PORT, () => console.log('?? Serveur Pixel Wars pr�t sur le port ' + PORT));
    } catch (e) {
        console.error('FATAL ERROR:', e);
    }
})();
