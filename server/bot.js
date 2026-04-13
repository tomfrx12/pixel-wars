const { io } = require("socket.io-client");

const NUM_BOTS = 100; // Nombre d'utilisateurs simultanés
const SERVER_URL = "http://172.21.10.255:3001/"; // L'URL de votre serveur
const FACTIONS = ["red", "blue", "green", "yellow"];
const COLORS = {
  red: '#ff0000',
  blue: '#0044ff',
  green: '#00ff00',
  yellow: '#ffff00'
};

console.log(`🚀 Lancement de ${NUM_BOTS} bots sur le Pixel Wars...`);

for (let i = 0; i < NUM_BOTS; i++) {
  // Étaler les connexions pour ne pas saturer le réseau instantanément
  setTimeout(() => {
    const socket = io(SERVER_URL);
    const faction = FACTIONS[Math.floor(Math.random() * FACTIONS.length)];
    const color = COLORS[faction];
    
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
