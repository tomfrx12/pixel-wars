const { io } = require("socket.io-client");

const NUM_BOTS = process.env.NUM_BOTS || 10; // Valeur par défaut plus prudente
const SERVER_URL = process.env.SERVER_URL || "http://localhost:80"; // URL dynamique pour la prod
const FACTIONS = ["red", "blue", "green", "yellow"];
const COLORS = {
  red: '#ff0000',
  blue: '#0044ff',
  green: '#00ff00',
  yellow: '#ffff00'
};

console.log(`🚀 Lancement de ${NUM_BOTS} bots sur ${SERVER_URL}...`);

for (let i = 0; i < NUM_BOTS; i++) {
  // Étaler les connexions
  setTimeout(() => {
    // Note: On utilise l'URL interne via Docker-Compose si possible
    const faction = FACTIONS[Math.floor(Math.random() * FACTIONS.length)];
    const color = COLORS[faction];

    const socket = io(SERVER_URL, {
        reconnectionDelayMax: 10000,
        rejectUnauthorized: false,
        transports: ['websocket'],
        auth: {
            isBot: true,
            botId: i,
            team: faction
        }
    });

    socket.on('connect_error', (err) => {
      console.error(`❌ Bot ${i} erreur de connexion :`, err.message);
    });

    socket.on('error-msg', (msg) => {
      console.warn(`⚠️ Bot ${i} reçu erreur du serveur :`, msg);
    });

    socket.on('connect', () => {
      // Pour éviter le spam dans la console si un bot perd la connexion et la retrouve, on affiche ça 1 seule fois :
      if (!socket.hasConnectedOnce) {
        console.log(`🤖 Bot ${i} a rejoint la faction ${faction.toUpperCase()}`);
        socket.hasConnectedOnce = true;
      }
    });

    // Dès qu'on reçoit de l'énergie, on décide de jouer
    socket.on('energy-update', (energy) => {
      if (energy >= 100) {
        // 20% de chance d'envoyer une BOMBE quand l'énergie est pleine
        if (Math.random() > 0.8) {
          const x = Math.floor(Math.random() * 50);
          const y = Math.floor(Math.random() * 50);
          socket.emit('place-pixel', { x, y, color, faction, isBomb: true });
        }
      } else if (energy >= 10) {
        // Sinon, si on a un peu d'énergie, 30% de chance de poser un PIXEL
        if (Math.random() > 0.7) {
          const x = Math.floor(Math.random() * 50);
          const y = Math.floor(Math.random() * 50);
          socket.emit('place-pixel', { x, y, color, faction, isBomb: false });
        }
      }
    });

  }, i); // Ajoute un délai de 50ms entre chaque bot
}
