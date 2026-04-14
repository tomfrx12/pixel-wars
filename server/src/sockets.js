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

    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
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

        socket.on('place-pixel', ({ x, y, color, faction, isBomb, isNuke }) => {
            const isAdmin = user.isAdmin === 1;
            const userFaction = isAdmin ? faction : (user.team || faction);
            let cost = 5;
            if (isNuke) cost = 100;
            else if (isBomb) cost = 40;

            if (!isAdmin && user.energy < cost) {
                socket.emit('error-msg', `Pas assez d'énergie ! (${cost})`);
                return;
            }

            const FACTION_COLORS = { red: '#ff4444', blue: '#4444ff', green: '#44ff44', yellow: '#ffff44' };
            const activeColor = FACTION_COLORS[userFaction] || color;

            const pixelsToUpdate = [];
            if (isNuke) {
                // Zone NUKE (7x7 environ) avec dispersion aléatoire plus large
                for (let dx = -4; dx <= 4; dx++) {
                    for (let dy = -4; dy <= 4; dy++) {
                        const distance = Math.sqrt(dx*dx + dy*dy); // Distance euclidienne pour un cercle
                        
                        if (distance <= 1.5) { // Centre dense
                            pixelsToUpdate.push({ px: x + dx, py: y + dy });
                        } else if (distance <= 3 && Math.random() < 0.6) { // Milieu moyennement dense
                            pixelsToUpdate.push({ px: x + dx, py: y + dy });
                        } else if (distance <= 4.5 && Math.random() < 0.25) { // Bordures très dispersées
                            pixelsToUpdate.push({ px: x + dx, py: y + dy });
                        }
                    }
                }
            } else if (isBomb) {
                // Zone maximale (de -2 à +2 équivaut à un carré 5x5 environ)
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dy = -2; dy <= 2; dy++) {
                        const distance = Math.max(Math.abs(dx), Math.abs(dy));

                        // Cœur de l'explosion (le pixel central est à 100%)
                        if (distance === 0) {
                            pixelsToUpdate.push({ px: x + dx, py: y + dy });
                        }
                        // Périmètre immédiat (2x2 / 3x3) : très forte densité (75% de chance)
                        else if (distance === 1 && Math.random() < 0.75) {
                            pixelsToUpdate.push({ px: x + dx, py: y + dy });
                        }
                        // Gouttes aléatoires éparpillées (périmètre 4x4 / 5x5) : faible densité (20% de chance)
                        else if (distance === 2 && Math.random() < 0.20) {
                            pixelsToUpdate.push({ px: x + dx, py: y + dy });
                        }
                    }
                }
            } else {
                pixelsToUpdate.push({ px: x, py: y });
            }

            pixelsToUpdate.forEach(({ px, py }) => {
                if (px >= 0 && px < state.GRID_SIZE && py >= 0 && py < state.GRID_SIZE) {
                    const key = `${px}-${py}`;
                    const oldPixel = state.pixels[key];

                    if (oldPixel && oldPixel.faction === userFaction) return;

                    if (oldPixel && oldPixel.faction && state.scores[oldPixel.faction] !== undefined) {
                        if (state.scores[oldPixel.faction] > 0) state.scores[oldPixel.faction]--;
                    }

                    state.pixels[key] = { color: activeColor, faction: userFaction, username: username };
                    if (state.scores[userFaction] !== undefined) state.scores[userFaction]++;
                    
                    io.emit('update-pixel', { x: px, y: py, color: activeColor, faction: userFaction, username: username });
                    user.pixelsPlaced = (user.pixelsPlaced || 0) + 1;
                }
            });

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