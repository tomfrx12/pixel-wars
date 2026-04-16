require('dotenv').config({ path: '../env' });
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

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET est requis. Définis-le dans ton fichier .env");
}

const app = express();

// Sécurité HTTP
app.use(helmet({
    contentSecurityPolicy: false, // Désactivé pour faciliter le dev/déploiement rapide, à affiner en prod
}));

// Limitation du débit (Rate Limiting) pour éviter le brute force et le spam API
const limiter = rateLimit({
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 25, // Limite chaque IP à 25 requêtes par windowMs
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
        setupAuth(app, state, process.env.JWT_SECRET);
        setupSockets(io, state, process.env.JWT_SECRET);

        app.use(express.static(path.join(__dirname, '../client/dist')));
        app.get(/(.*)/, (req, res) => {
            res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
        });

        app.use((err, req, res, next) => {
            console.error('? Erreur serveur attrap�e :', err);
            res.status(500).json({ error: "Erreur serveur : " + (err.message || "") });
        });

        if (!process.env.PORT) {
            throw new Error("PORT est requis. Définis-le dans ton fichier .env");
        }
        server.listen(process.env.PORT, () => console.log('?? Serveur Pixel Wars pr�t sur le port ' + process.env.PORT));
    } catch (e) {
        console.error('FATAL ERROR:', e);
    }
})();
