import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = ''; // Utilise le proxy Vite configuré pour rediriger vers localhost:3001

const GRID_SIZE = 50;
const PIXEL_SIZE = 15; // Taille d'un pixel à l'écran

const playSound = (type) => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;

  if (type === 'pixel') {
    // Petit "blip" aigu pour le pixel
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'bomb') {
    // Explosion sourde pour la bombe
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  } else if (type === 'nuke') {
    // Énorme impact avec montée de fréquence et bruit blanc simulé
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 1.2);
    
    // Gain qui monte puis descend doucement
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.exponentialRampToValueAtTime(0.4, now + 0.1);
    gain.gain.linearRampToValueAtTime(0, now + 1.5);
    
    osc.start(now);
    osc.stop(now + 1.5);
  }
};

const FACTION_COLORS = {
  red: '#ff0000',
  blue: '#0044ff',
  green: '#00ff00',
  yellow: '#ffff00'
};

function App() {
  const canvasRef = useRef(null);
  const gridStateRef = useRef({}); // Stockera la faction et le username pour le survol

  // --- GAME STATE ---
  const [hoverPixel, setHoverPixel] = useState(null); // { x, y, faction, username }
  const [adminLogs, setAdminLogs] = useState([]);
  const [energy, setEnergy] = useState(100);
  const [myTeam, setMyTeam] = useState('red');
  const [myPixelsPlaced, setMyPixelsPlaced] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [faction, setFaction] = useState('red');
  const [scores, setScores] = useState({ red: 0, blue: 0, green: 0, yellow: 0 });
  const [isBombMode, setIsBombMode] = useState(false);
  const [isNukeMode, setIsNukeMode] = useState(false);
  const [isNukeTriggered, setIsNukeTriggered] = useState(false);

  // --- AUTH STATE ---
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [username, setUsername] = useState(localStorage.getItem('username') || null);
  const [authMode, setAuthMode] = useState('login'); // 'login' ou 'register'
  const [authForm, setAuthForm] = useState({ username: '', password: '', team: 'red' });
  const [authError, setAuthError] = useState("");
  const [socket, setSocket] = useState(null);

  // --- AUTH METHODS ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
      const res = await fetch(`${SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Erreur d'authentification");
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      setToken(data.token);
      setUsername(data.username);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setToken(null);
    setUsername(null);
    if (socket) socket.disconnect();
  };

  const handleResetGrid = () => {
    if (!isAdmin || !socket) return;
    if (window.confirm("⚠️ Êtes-vous sûr de vouloir RÉINITIALISER TOUTE LA GRILLE ? Cette action est irréversible !")) {
      socket.emit('admin-reset-grid');
    }
  };

  // --- SOCKET CONNECTION ---
  useEffect(() => {
    if (!token) return;

    const newSocket = io(SERVER_URL, {
      auth: { token }
    });

    newSocket.on('connect_error', (err) => {
      setError(err.message);
      if (err.message.includes('Accès refusé') || err.message.includes('invalide')) {
        handleLogout(); // Force la reconnexion si token expiré / invalide
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token]);

  // --- GAME EVENTS ---
  useEffect(() => {
    if (!socket || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const drawPixel = (x, y, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
      ctx.strokeStyle = '#ddd';
      ctx.strokeRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
    };

    socket.on('init-grid', (pixels) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height); // On nettoie avant 
      gridStateRef.current = pixels; // On sauvegarde toutes les infos pour le survol
      Object.entries(pixels).forEach(([key, pixelInfo]) => {
        const [x, y] = key.split('-').map(Number);
        // On récupère toujours que la couleur pour dessiner
        drawPixel(x, y, pixelInfo.color || pixelInfo);
      });
    });

    socket.on('update-pixel', ({ x, y, color, faction, username }) => {
      gridStateRef.current[`${x}-${y}`] = { color, faction, username };
      drawPixel(x, y, color);
    });

    socket.on('admin-log', (logMsg) => {
      setAdminLogs(prev => [logMsg, ...prev].slice(0, 20)); // Garde seulement les 20 derniers logs
    });

    socket.on('energy-update', (val) => {
      setEnergy(val);
    });

    socket.on('stats-update', (stats) => {
      if (stats.team) {
        setMyTeam(stats.team);
        setFaction(stats.team); // Pré-sélectionner sa team
      }
      if (stats.pixelsPlaced !== undefined) setMyPixelsPlaced(stats.pixelsPlaced);
      if (stats.isAdmin !== undefined) setIsAdmin(stats.isAdmin);
    });

    socket.on('error-msg', (msg) => {
      setError(msg);
      setTimeout(() => setError(""), 3000); // Efface le message après 3s
    });

    socket.on('update-scores', (s) => {
      setScores(s);
    });

    return () => {
      socket.off('init-grid');
      socket.off('update-pixel');
      socket.off('energy-update');
      socket.off('stats-update');
      socket.off('error-msg');
      socket.off('update-scores');
    };
  }, [socket]); // Re-run si la ref du socket change

  const handleCanvasClick = (e) => {
    if (!socket) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / PIXEL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / PIXEL_SIZE);

    if (isNukeMode) {
      if (energy >= 100 || isAdmin) {
        setIsNukeTriggered(true);
        playSound('nuke');
        setTimeout(() => setIsNukeTriggered(false), 300); // 300ms de flash blanc
      }
    } else if (isBombMode) {
      if (energy >= 40 || isAdmin) playSound('bomb');
    } else {
      if (energy >= 5 || isAdmin) playSound('pixel');
    }

    socket.emit('place-pixel', { 
      x, 
      y, 
      color: FACTION_COLORS[faction], 
      faction, 
      isBomb: isBombMode,
      isNuke: isNukeMode 
    });
  };

  const handleCanvasMouseMove = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / PIXEL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / PIXEL_SIZE);
    
    // Extrait les informations sauvegardées pour ce bloc (depuis les init/updates)
    const key = `${x}-${y}`;
    const info = gridStateRef.current[key];
    
    if (info && info.username) {
      setHoverPixel({ x, y, ...info });
    } else {
      setHoverPixel(null);
    }
  };

  // --- RENDU : ECRAN D'AUTHENTIFICATION ---
  if (!token) {
    return (
      <div className="bg-[#1a1a1a] min-h-screen text-white font-mono flex flex-col items-center justify-center p-5">
        <h1 className="text-[#00ff00] text-5xl font-bold mb-10 drop-shadow-[0_0_10px_rgba(0,255,0,0.8)]">
          {">"} PIXEL_WARS_OS
        </h1>
        <div className="bg-[#222] border-2 border-[#333] p-8 rounded shadow-[0_0_20px_rgba(0,0,0,0.8)] w-[350px]">
          <h2 className="text-[#00ff00] text-xl font-bold mb-6 text-center">
            {authMode === 'login' ? '--- CONNEXION ---' : '--- INSCRIPTION ---'}
          </h2>
          
          {authError && <p className="text-[#ff4444] mb-4 text-sm text-center font-bold">{authError}</p>}
          
          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-gray-400">PSEUDO (3 à 15 car.)</label>
              <input 
                type="text" 
                value={authForm.username} 
                onChange={e => setAuthForm({...authForm, username: e.target.value})}
                className="w-full bg-[#1a1a1a] border border-gray-600 text-white px-3 py-2 outline-none focus:border-[#00ff00]"
                required minLength={3} maxLength={15}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">MOT DE PASSE</label>
              <input 
                type="password" 
                value={authForm.password} 
                onChange={e => setAuthForm({...authForm, password: e.target.value})}
                className="w-full bg-[#1a1a1a] border border-gray-600 text-white px-3 py-2 outline-none focus:border-[#00ff00]"
                required
              />
            </div>
            {authMode === 'register' && (
              <div>
                <label className="text-xs text-gray-400">FACTION COULEUR</label>
                <select 
                  value={authForm.team} 
                  onChange={e => setAuthForm({...authForm, team: e.target.value})}
                  className="w-full bg-[#1a1a1a] border border-gray-600 text-white px-3 py-2 outline-none focus:border-[#00ff00]"
                >
                  <option value="red">Rouge</option>
                  <option value="blue">Bleu</option>
                  <option value="green">Vert</option>
                  <option value="yellow">Jaune</option>
                </select>
              </div>
            )}
            
            <button type="submit" className="bg-[#00ff00] text-black font-bold py-2 mt-4 hover:bg-[#00cc00] transition-colors cursor-pointer">
              {authMode === 'login' ? 'ENTRER' : 'REJOINDRE LA GUERRE'}
            </button>
          </form>

          <button 
            onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}
            className="w-full mt-6 text-xs text-gray-400 hover:text-white underline cursor-pointer"
          >
            {authMode === 'login' ? "Je n'ai pas de compte. M'inscrire." : "J'ai déjà un compte. Me connecter."}
          </button>
        </div>
      </div>
    );
  }

  // --- RENDU : ECRAN DU JEU ---
  return (
    <div className={`bg-[#1a1a1a] min-h-screen text-white font-mono flex flex-col items-center p-5 transition-colors duration-200 ${isNukeTriggered ? '!bg-white blur-sm' : ''}`}>
      
      {/* Header contenant le nom du joueur et bouton QUITTER */}
      <div className={`w-full max-w-[1200px] flex justify-between items-center mb-6 transition-opacity ${isNukeTriggered ? 'opacity-0' : 'opacity-100'}`}>
        <h1 className="text-[#00ff00] text-3xl font-bold drop-shadow-[0_0_10px_rgba(0,255,0,0.8)]">
          {">"} PIXEL_WARS_OS.exe
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm border border-gray-600 px-3 py-1 rounded bg-[#222]">
            {isAdmin ? "👑 ADMIN :" : "ACCÈS AUTORISÉ :"} <span className={`font-bold`} style={{ color: FACTION_COLORS[myTeam] || '#00ff00' }}>{username}</span> ({myPixelsPlaced} pixels)
          </span>
          <button onClick={handleLogout} className="border border-[#ff4444] text-[#ff4444] px-4 py-1 text-sm rounded hover:bg-[#ff4444] hover:text-white transition-colors font-bold cursor-pointer">
            EXIT
          </button>
        </div>
      </div>

      <div className={`flex flex-col lg:flex-row gap-10 items-start transition-transform ${isNukeTriggered ? 'scale-[1.1] rotate-1' : 'scale-100'}`}>
        
        {/* Colonne de gauche: Le Canvas */}
        <div className="flex flex-col items-center">
          <canvas
            ref={canvasRef}
            width={GRID_SIZE * PIXEL_SIZE}
            height={GRID_SIZE * PIXEL_SIZE}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setHoverPixel(null)}
            className={`border-[3px] border-[#333] shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-white cursor-crosshair [image-rendering:pixelated] transition-all ${isNukeTriggered ? 'border-white shadow-[0_0_50px_#fff]' : ''}`}
          />
          {/* Panneau d'informations du pixel survolé (Visible pour tous) */}
          <div className="h-8 mt-2 text-sm text-[#00ff00] font-bold flex items-center justify-center">
            {hoverPixel ? (
              <span>Faction <span style={{color: hoverPixel.color}}>{hoverPixel.faction}</span>, par : {hoverPixel.username}</span>
            ) : "Survolez la grille..."}
          </div>
        </div>

        {/* Colonne de droite: Les Contrôles UI */}
        <div className="flex flex-col w-[600px]">
          
          {/* Barre d'énergie */}
          <div className="mb-6 text-center">
            <div className="w-full h-[25px] border border-[#00ff00] relative mb-1">
              <div 
                className={`h-full transition-[width] duration-300 ease-in-out ${(energy >= 100 || isAdmin) ? 'bg-[#ff0000] shadow-[0_0_10px_#ff0000]' : 'bg-[#00ff00]'}`} 
                style={{ width: isAdmin ? '100%' : `${energy}%` }} 
              />
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-black text-xs font-bold">
                ENERGY: {isAdmin ? '∞ Admin' : `${energy}%`}
              </span>
            </div>
            {error && <p className="text-[#ff4444] my-1 text-sm font-bold">{error}</p>}
          </div>

          <div className="bg-[#333] p-4 rounded mb-3 shadow-[0_0_10px_rgba(0,0,0,0.5)]">
            <span className="text-gray-200 text-sm">FACTION :</span>
            <select 
              value={faction} 
              disabled={!isAdmin}
              onChange={(e) => {
                const newTeam = e.target.value;
                setFaction(newTeam);
                if (isAdmin && socket) socket.emit('change-team', newTeam);
              }} 
              className={`bg-[#1a1a1a] text-white border p-1.5 w-full mt-1 outline-none ${isAdmin ? 'border-[#00ff00] cursor-pointer' : 'border-gray-600 cursor-not-allowed opacity-50'}`}
            >
              <option value="red">🔴 TEAM RED</option>
              <option value="blue">🔵 TEAM BLUE</option>
              <option value="green">🟢 TEAM GREEN</option>
              <option value="yellow">🟡 TEAM YELLOW</option>
            </select>
          </div>

          <div className="bg-[#333] p-4 rounded mb-3 shadow-[0_0_10px_rgba(0,0,0,0.5)]">
            <span className="text-gray-200 text-sm">OUTIL :</span>
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex gap-2">
                <button 
                  onClick={() => { setIsBombMode(false); setIsNukeMode(false); }}
                  className={`flex-1 py-1 px-2 text-sm font-bold border transition-colors cursor-pointer ${(!isBombMode && !isNukeMode) ? 'bg-[#00ff00] text-black border-[#00ff00]' : 'bg-[#1a1a1a] text-white border-gray-500 hover:border-[#00ff00]'}`}
                >
                  PIXEL (5)
                </button>
                <button 
                  onClick={() => { setIsBombMode(true); setIsNukeMode(false); }}
                  className={`flex-1 py-1 px-2 text-sm font-bold border transition-colors cursor-pointer ${isBombMode ? 'bg-[#ffaa00] text-black border-[#ffaa00]' : 'bg-[#1a1a1a] text-white border-gray-500 hover:border-[#ffaa00]'}`}
                >
                  BOMBE (40)
                </button>
              </div>
              <button 
                onClick={() => { setIsNukeMode(true); setIsBombMode(false); }}
                className={`w-full py-1.5 px-2 text-sm font-bold border transition-all cursor-pointer ${isNukeMode ? 'bg-[#ff0000] text-white border-[#ff0000] animate-pulse shadow-[0_0_10px_#ff0000]' : 'bg-[#1a1a1a] text-[#ff4444] border-[#ff4444] hover:bg-[#ff4444] hover:text-white'}`}
              >
                ☢️ NUKE (100)
              </button>
            </div>
          </div>

          <div className="bg-[#222] p-4 rounded border border-[#444] shadow-[0_0_10px_rgba(0,0,0,0.5)]">
            <p className="text-[#00ff00] mb-2 font-bold text-center">--- DOMINATION ---</p>
            <div className="space-y-1">
              {[
                { id: 'red', name: '🔴 Red', score: scores.red || 0 },
                { id: 'blue', name: '🔵 Blue', score: scores.blue || 0 },
                { id: 'green', name: '🟢 Green', score: scores.green || 0 },
                { id: 'yellow', name: '🟡 Yellow', score: scores.yellow || 0 }
              ]
                .sort((a, b) => b.score - a.score)
                .map((team, index) => (
                  <div key={team.id} className="flex justify-between text-sm">
                    <span>
                      {index === 0 && '👑 '}
                      {team.name}:
                    </span>
                    <span className="font-bold">{team.score} px</span>
                  </div>
              ))}
            </div>
          </div>

          {/* ESPACE ADMIN LOGS */}
          {isAdmin && (
            <div className="mt-4 flex flex-col gap-2">
              <button 
                onClick={handleResetGrid}
                className="w-full bg-[#ff0000] text-white py-2 rounded font-bold hover:bg-[#cc0000] transition-colors border-2 border-white/20 shadow-[0_0_10px_rgba(255,0,0,0.5)] cursor-pointer text-xs"
              >
                🚨 RÉINITIALISER LA GRILLE
              </button>
              
              <div className="bg-[#111] p-3 rounded border border-red-500 shadow-[0_0_10px_rgba(255,0,0,0.3)]">
                <p className="text-red-500 mb-2 font-bold text-xs text-center">--- ADMIN LOGS ---</p>
                <div className="space-y-1 h-32 overflow-y-auto text-[10px] text-gray-300 font-mono">
                  {adminLogs.length === 0 ? <span className="opacity-50">Aucun log en cours...</span> : null}
                  {adminLogs.map((log, i) => (
                    <div key={i} className="border-b border-gray-800 pb-1">{log}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default App;