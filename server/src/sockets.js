const jwt = require('jsonwebtoken');

function setupSockets(io, state, JWT_SECRET) {
    setInterval(() => {
        io.emit('update-scores', state.scores);
    }, 500);

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
                        isBot: !!s.isBot,
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
        
        // --- SYSTÈME DE BOTS ---
        // Si pas de token, on vérifie si c'est un bot (via un header ou query par exemple)
        // Pour faire simple, on va regarder s'il y a une info "isBot" dans l'auth
        if (!token && socket.handshake.auth.isBot) {
            socket.username = `bot_${socket.handshake.auth.botId}`;
            socket.isBot = true;
            return next();
        }

        if (!token) return next(new Error("Accès refusé. Token manquant."));

        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) return next(new Error("Accès refusé. Token invalide."));
            socket.username = decoded.username;
            next();
        });
    });

    setInterval(() => {
        Object.keys(state.users).forEach(username => {
            if (state.users[username].energy < 100) {
                state.users[username].energy += 2;
                if (state.users[username].energy > 100) state.users[username].energy = 100;
            }
        });
        io.sockets.sockets.forEach(socket => {
            if (socket.username && state.users[socket.username]) {
                socket.emit('energy-update', state.users[socket.username].energy);
            }
        });
    }, 1000);

    io.on('connection', (socket) => {
        const username = socket.username;

        // Si c'est un bot, on l'initialise s'il n'existe pas encore
        if (socket.isBot && !state.users[username]) {
            state.users[username] = {
                energy: 100,
                team: socket.handshake.auth.team || 'red',
                pixelsPlaced: 0,
                isAdmin: 0
            };
            console.log(`🤖 Initialisation du profil pour ${username}`);
        }

        if (!state.users[username]) {
            console.log(`⌛ Rejet de ${username} (non trouvé en base)`);
            socket.emit('error-msg', 'Session expirée.');
            socket.disconnect(true);
            return;
        }

        console.log(`✅ ${username} s'est connecté.`);
        sendAdminLog(`🟢 CONNEXION : ${username}`);
        const user = state.users[username];

        socket.emit('energy-update', user.energy);
        socket.emit('stats-update', { team: user.team, pixelsPlaced: user.pixelsPlaced, isAdmin: user.isAdmin === 1 });
        socket.emit('init-grid', getGridColors());
        socket.emit('update-scores', state.scores);

        socket.on('change-team', (newTeam) => {
            if (user.isAdmin !== 1) return;
            user.team = newTeam;
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
            const isAdmin = user.isAdmin === 1;
            const userFaction = isAdmin ? faction : (user.team || faction);
            let cost = 5;
            if (isNuke) cost = 100;
            else if (isBomb) cost = 20;

            if (!isAdmin && user.energy < cost) {
                socket.emit('error-msg', `Pas assez d'énergie ! (${cost})`);
                return;
            }

            const FACTION_COLORS = { red: '#ff4444', blue: '#4444ff', green: '#44ff44', yellow: '#ffff44' };
            const activeColor = FACTION_COLORS[userFaction] || color;

            const pixelsToUpdate = [];
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
            } else if (batch.length === 1) {
                io.emit('update-pixel', { ...batch[0], isNuke: false, isBomb: false, username: username });
            }

            if (!isAdmin) user.energy -= cost;

            socket.emit('energy-update', user.energy);
            socket.emit('stats-update', { team: user.team, pixelsPlaced: user.pixelsPlaced, isAdmin: user.isAdmin === 1 });
            let actionType = '🖌️ PIXEL';
            if (isNuke) actionType = '☢️ NUKE';
            else if (isBomb) actionType = '💣 BOMBE';
            
            console.log(`🎮 [${username}] ${actionType} : Faction ${userFaction}`);
            sendAdminLog(`${actionType} : ${username} en (${x}, ${y}) pour la faction ${userFaction}`);
        });

        socket.on('disconnect', () => {
            console.log(`❌ ${username} s'est déconnecté.`);
            sendAdminLog(`🔴 DECONNEXION : ${username}`);
        });
    });
}

module.exports = { setupSockets };