const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
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

// Indiquer à Express qu'il est derrière un proxy (Docker/Nginx)
// Requis pour express-rate-limit
app.set('trust proxy', 1);

// Sécurité HTTP
app.use(helmet({
    contentSecurityPolicy: false, // Désactivé pour faciliter le dev/déploiement rapide, à affiner en prod
}));

// Limitation du débit (Rate Limiting) pour éviter le brute force et le spam API
const limiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // Limite chaque IP à 10 requêtes par windowMs
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
        
        const socketConfig = {
            JWT_SECRET: process.env.JWT_SECRET,
            ACTION_COOLDOWN: parseInt(process.env.ACTION_COOLDOWN)
        };
        setupSockets(io, state, socketConfig);

        app.use(express.static(path.join(__dirname, '../client/dist')));
        app.get(/(.*)/, (req, res) => {
            res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
        });

        app.use((err, req, res, next) => {
            console.error('? Erreur serveur attrapée :', err);
            res.status(500).json({ error: "Erreur serveur : " + (err.message || "") });
        });

        if (!process.env.PORT) {
            throw new Error("PORT est requis. Définis-le dans ton fichier .env");
        }
        server.listen(process.env.PORT, () => console.log('?? Serveur Pixel Wars prêt sur le port ' + process.env.PORT));
    } catch (e) {
        console.error('FATAL ERROR:', e);
    }
})();
