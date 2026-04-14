const jwt = require('jsonwebtoken');

function setupSockets(io, state, JWT_SECRET) {
    setInterval(() => {
        io.emit('update-scores', state.scores);
    }, 500);

    function getGridColors() {
        const out = {};
        Object.entries(state.pixels).forEach(([key, value]) => {
            out[key] = value && value.color ? value.color : value;
        });
        return out;
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
        });

        socket.on('place-pixel', ({ x, y, color, faction, isBomb }) => {
            const isAdmin = user.isAdmin === 1;
            const userFaction = isAdmin ? faction : (user.team || faction);
            const cost = isBomb ? 40 : 5;

            if (!isAdmin && user.energy < cost) {
                socket.emit('error-msg', `Pas assez d'énergie ! (${cost})`);
                return;
            }

            const FACTION_COLORS = { red: '#ff4444', blue: '#4444ff', green: '#44ff44', yellow: '#ffff44' };
            const activeColor = FACTION_COLORS[userFaction] || color;

            const pixelsToUpdate = [];
            if (isBomb) {
                // Rayon d'explosion défini jusqu'à 4 (soit un carré max de 9x9 pixels)
                for (let dx = -4; dx <= 4; dx++) {
                    for (let dy = -4; dy <= 4; dy++) {
                        const distance = Math.max(Math.abs(dx), Math.abs(dy));
                        
                        // Cœur de l'explosion : un carré dense de 3x3 (= distance 0 ou 1)
                        if (distance <= 1) {
                            pixelsToUpdate.push({ px: x + dx, py: y + dy });
                        } 
                        // Éclats : distance 2, 3 ou 4 (probabilité aléatoire décroissante)
                        else {
                            let chance = 0;
                            if (distance === 2) chance = 0.5;      // 50% de chance
                            else if (distance === 3) chance = 0.25; // 25% de chance
                            else if (distance === 4) chance = 0.1;  // 10% de chance
                            
                            if (Math.random() < chance) {
                                pixelsToUpdate.push({ px: x + dx, py: y + dy });
                            }
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

                    state.pixels[key] = { color: activeColor, faction: userFaction };
                    if (state.scores[userFaction] !== undefined) state.scores[userFaction]++;
                    
                    io.emit('update-pixel', { x: px, y: py, color: activeColor });
                    user.pixelsPlaced = (user.pixelsPlaced || 0) + 1;
                }
            });

            if (!isAdmin) user.energy -= cost;

            socket.emit('energy-update', user.energy);
            socket.emit('stats-update', { team: user.team, pixelsPlaced: user.pixelsPlaced, isAdmin: user.isAdmin === 1 });
            console.log(`🎮 [${username}] ${isBomb ? 'Bombe' : 'Pixel'} : Faction ${userFaction}`);
        });

        socket.on('disconnect', () => {
            console.log(`❌ ${username} s'est déconnecté.`);
        });
    });
}

module.exports = { setupSockets };