const jwt = require('jsonwebtoken');

function setupSockets(io, state, config) {
    function broadcastPlayerCount() {
        const totalConnected = io.sockets.sockets.size; // Nombre brut de sockets
        io.emit('total-players-update', totalConnected);
    }

    function getGridColors() {
        const out = {};
        Object.entries(state.pixels).forEach(([key, value]) => {
            if (value && value.color) {
                out[key] = {
                    color: value.color,
                    faction: value.faction,
                    username: value.username
                };
            }
        });
        return out;
    }

    function sendAdminLog(message) {
        io.sockets.sockets.forEach(s => {
            if (s.username && state.users[s.username] && state.users[s.username].isAdmin === 1) {
                s.emit('admin-log', `[${new Date().toLocaleTimeString()}] ${message}`);
            }
        });
    }

    function updateConnectedUsers() {
        const connected = [];
        const seen = new Set();
        
        io.sockets.sockets.forEach(s => {
            if (s.username && !seen.has(s.username)) {
                seen.add(s.username);
                const u = state.users[s.username];
                if (u) {
                    connected.push({
                        username: s.username,
                        team: u.team,
                        isAdmin: u.isAdmin === 1,
                        energy: u.energy
                    });
                }
            }
        });

        // Envoyer uniquement aux admins
        io.sockets.sockets.forEach(s => {
            if (s.username && state.users[s.username] && state.users[s.username].isAdmin === 1) {
                s.emit('admin-users-list', connected);
            }
        });
    }

    setInterval(updateConnectedUsers, 2000); // Mise à jour toutes les 2s

    io.use((socket, next) => {
        const token = socket.handshake.auth.token;

        if (!token) return next(new Error("Accès refusé. Token manquant."));

        jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
            if (err) return next(new Error("Accès refusé. Token invalide."));
            
            // Sécurité supplémentaire : Vérifier si l'utilisateur existe encore en base
            if (!state.users[decoded.username]) {
                return next(new Error("Utilisateur introuvable. Reconnectez-vous."));
            }

            socket.username = decoded.username;
            next();
        });
    });

    setInterval(() => {
        const updatedUsers = new Set();
        Object.keys(state.users).forEach(username => {
            const u = state.users[username];
            if (u.energy < 100) {
                u.energy += 2;
                if (u.energy > 100) u.energy = 100;
                u.dirty = true;
                updatedUsers.add(username);
            }
        });
        io.sockets.sockets.forEach(socket => {
            if (socket.username && updatedUsers.has(socket.username)) {
                socket.emit('energy-update', state.users[socket.username].energy);
            }
        });
    }, 1000);

    io.on('connection', (socket) => {
        const username = socket.username;
        let lastActionTime = 0;

        if (!state.users[username]) {
            console.log(`⌛ Rejet de ${username} (non trouvé en base)`);
            socket.emit('error-msg', 'Session expirée.');
            socket.disconnect(true);
            return;
        }

        console.log(`✅ ${username} s'est connecté.`);
        sendAdminLog(`🟢 CONNEXION : ${username}`);
        broadcastPlayerCount();
        const user = state.users[username];

        socket.emit('energy-update', user.energy);
        socket.emit('stats-update', { team: user.team, pixelsPlaced: user.pixelsPlaced, isAdmin: user.isAdmin === 1 });
        socket.emit('init-grid', getGridColors());
        socket.emit('update-scores', state.scores);
        socket.emit('total-players-update', io.sockets.sockets.size);

        socket.on('change-team', (newTeam) => {
            if (user.isAdmin !== 1) return;
            user.team = newTeam;
            user.dirty = true;
            socket.emit('stats-update', { team: user.team, pixelsPlaced: user.pixelsPlaced, isAdmin: true });
            console.log(`👑 [${username}] a changé pour : ${newTeam}`);
            sendAdminLog(`🔄 CHANGEMENT EQUIPE : ${username} -> ${newTeam}`);
        });

        socket.on('admin-reset-grid', () => {
            if (user.isAdmin !== 1) return;
            
            // Réinitialisation de l'état
            state.pixels = {};
            state.scores = { red: 0, blue: 0, green: 0, yellow: 0 };
            
            // Notification à tous les clients
            io.emit('init-grid', {});
            io.emit('update-scores', state.scores);
            
            console.log(`🚨 [${username}] a RÉINITIALISÉ la grille !`);
            sendAdminLog(`🚨 RESET GRILLE : ${username} a tout effacé !`);
        });

        socket.on('place-pixel', ({ x, y, color, faction, isBomb, isNuke }) => {
            const now = Date.now();
            if (now - lastActionTime < config.ACTION_COOLDOWN) return; // Anti-spam
            lastActionTime = now;

            const isAdmin = user.isAdmin === 1;
            const userFaction = isAdmin ? (faction || user.team) : (user.team || faction);
            
            // Validation simple des coordonnées pour la sécurité
            if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x >= state.GRID_SIZE || y < 0 || y >= state.GRID_SIZE) {
                return;
            }

            let cost = 5;
            if (isNuke) cost = 100;
            else if (isBomb) cost = 20;

            if (!isAdmin && user.energy < cost) {
                socket.emit('error-msg', `Pas assez d'énergie ! (${cost})`);
                return;
            }

            // OPTIMISATION : Réponse immédiate pour le client qui a cliqué
            socket.emit('energy-update', user.energy - cost);

            const FACTION_COLORS = { red: '#ff4444', blue: '#4444ff', green: '#44ff44', yellow: '#ffff44' };
            const activeColor = FACTION_COLORS[userFaction] || color;

            const pixelsToUpdate = [];
            
            // On limite les nukes/bombes pour éviter les freezes CPU si spammé
            if (isNuke) {
                // Zone NUKE dévastatrice
                for (let dx = -9; dx <= 9; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= state.GRID_SIZE) continue;
                    for (let dy = -9; dy <= 9; dy++) {
                        const ny = y + dy;
                        if (ny < 0 || ny >= state.GRID_SIZE) continue;
                        const dSq = dx*dx + dy*dy;
                        if (dSq <= 16) pixelsToUpdate.push({ px: nx, py: ny });
                        else if (dSq <= 42 && Math.random() < 0.7) pixelsToUpdate.push({ px: nx, py: ny });
                        else if (dSq <= 81 && Math.random() < 0.3) pixelsToUpdate.push({ px: nx, py: ny });
                    }
                }
            } else if (isBomb) {
                for (let dx = -3; dx <= 3; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= state.GRID_SIZE) continue;
                    for (let dy = -3; dy <= 3; dy++) {
                        const ny = y + dy;
                        if (ny < 0 || ny >= state.GRID_SIZE) continue;
                        
                        const distance = Math.abs(dx) + Math.abs(dy);
                        // Cœur (dist 0-1) : 100%
                        if (distance <= 1) {
                            pixelsToUpdate.push({ px: nx, py: ny });
                        } 
                        // Milieu (dist 2) : 70%
                        else if (distance === 2 && Math.random() < 0.7) {
                            pixelsToUpdate.push({ px: nx, py: ny });
                        }
                        // Bord (dist 3-4) : 30%
                        else if (distance > 2 && distance <= 4 && Math.random() < 0.3) {
                            pixelsToUpdate.push({ px: nx, py: ny });
                        }
                    }
                }
            } else {
                pixelsToUpdate.push({ px: x, py: y });
            }

            // --- OPTIMISATION : ENVOI GROUPÉ ---
            const batch = [];
            pixelsToUpdate.forEach(({ px, py }) => {
                const key = `${px}-${py}`;
                const oldPixel = state.pixels[key];
                
                // Si le pixel appartient déjà à la faction, on ne change rien (économie d'énergie/bande passante)
                if (oldPixel && oldPixel.faction === userFaction) return;

                if (oldPixel && oldPixel.faction && state.scores[oldPixel.faction] !== undefined) {
                    if (state.scores[oldPixel.faction] > 0) state.scores[oldPixel.faction]--;
                }

                state.pixels[key] = { color: activeColor, faction: userFaction, username: username };
                if (state.scores[userFaction] !== undefined) state.scores[userFaction]++;
                
                batch.push({ x: px, y: py, color: activeColor, faction: userFaction, username: username });
                user.pixelsPlaced = (user.pixelsPlaced || 0) + 1;
            });

            if (batch.length > 1) {
                io.emit('update-pixel-batch', { pixels: batch, isNuke, isBomb, username: username });
                io.emit('update-scores', state.scores);
            } else if (batch.length === 1) {
                io.emit('update-pixel', { x: batch[0].x, y: batch[0].y, color: batch[0].color, faction: batch[0].faction, isNuke: false, isBomb: false, username: username });
                io.emit('update-scores', state.scores);
            }

            if (!isAdmin) user.energy -= cost;
            user.dirty = true;

            socket.emit('energy-update', user.energy);
            socket.emit('stats-update', { team: user.team, pixelsPlaced: user.pixelsPlaced, isAdmin: user.isAdmin === 1 });
            
            let actionType = '🖌️ PIXEL';
            if (isNuke) actionType = '☢️ NUKE';
            else if (isBomb) actionType = '💣 BOMBE';
            
            console.log(`🎮 [${username}] ${actionType} : Faction ${userFaction}`);
            
            // On envoie le log admin une seule fois par action (même si plusieurs pixels changent)
            if (batch.length > 0 || !isBomb && !isNuke) {
                sendAdminLog(`${actionType} : ${username} (${userFaction})`);
            }
        });

        socket.on('disconnect', () => {
            console.log(`❌ ${username} s'est déconnecté.`);
            sendAdminLog(`🔴 DECONNEXION : ${username}`);
            broadcastPlayerCount();
        });
    });
}

module.exports = { setupSockets };