import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import msgpackParser from 'socket.io-msgpack-parser';
import AuthScreen from './components/AuthScreen';
import AdminPanel from './components/AdminPanel';
import Sidebar from './components/Sidebar';
import GameCanvas from './components/GameCanvas';
import Header from './components/Header';

const SERVER_URL = ''; // Utilise le proxy Vite configuré pour rediriger vers localhost:3001

// --- SYSTEME AUDIO OPTIMISÉ (SINGLETON) ---
let audioCtx = null;
const playSound = (type) => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  // Reprendre le contexte si le navigateur l'a suspendu
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === 'pixel') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.05);
  } else if (type === 'bomb') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  } else if (type === 'nuke') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.8);
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + 0.8);
    osc.start(now);
    osc.stop(now + 0.8);
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
  const offscreenCanvasRef = useRef(null); // Canvas en mémoire
  const gridStateRef = useRef({}); // Stockera la faction et le username pour le survol
  
  const hoverInfoRef = useRef(null); // DOM ref pour optimiser les performances au survol de la souris

  // --- GAME STATE ---
  const [gridSize, setGridSize] = useState(200);
  const [pixelSize, setPixelSize] = useState(4);
  const [adminLogs, setAdminLogs] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]); // Liste des connectés pour l'admin
  const [openTeams, setOpenTeams] = useState({ red: true, blue: true, green: true, yellow: true }); // État des accordéons
  const [totalPlayers, setTotalPlayers] = useState(0); // Nouveau compteur global
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

  // --- ZOOM & PAN STATE ---
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

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
      auth: { token },
      parser: msgpackParser
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

    // --- OPTIMISATION : CACHE OFFSCREEN ---
    // On dessine l'état des pixels sur un canvas invisible une seule fois, 
    // puis le rendu principal n'a qu'à faire un seul "drawImage" très rapide.
    const updateOffscreen = (pixelsToDraw) => {
      // S'assurer que le canvas offscreen existe et a la bonne taille
      if (!offscreenCanvasRef.current || 
          offscreenCanvasRef.current.width !== gridSize * pixelSize || 
          offscreenCanvasRef.current.height !== gridSize * pixelSize) {
        offscreenCanvasRef.current = document.createElement('canvas');
        offscreenCanvasRef.current.width = gridSize * pixelSize;
        offscreenCanvasRef.current.height = gridSize * pixelSize;
        
        const oCtx = offscreenCanvasRef.current.getContext('2d', { alpha: false });
        oCtx.imageSmoothingEnabled = false;
        oCtx.fillStyle = '#ffffff';
        oCtx.fillRect(0, 0, offscreenCanvasRef.current.width, offscreenCanvasRef.current.height);
        
        // Si on vient de le créer (ou redimensionner), on force un redraw complet
        pixelsToDraw = null; 
      }

      const oCtx = offscreenCanvasRef.current.getContext('2d');
      oCtx.imageSmoothingEnabled = false;

      if (pixelsToDraw) {
        // Mise à jour partielle
        Object.entries(pixelsToDraw).forEach(([key, pixelInfo]) => {
          const [px, py] = key.split('-').map(Number);
          oCtx.fillStyle = pixelInfo.color || pixelInfo;
          oCtx.fillRect(px * pixelSize, py * pixelSize, pixelSize, pixelSize);
        });
      } else {
        // Full redraw (fond + tous les pixels)
        oCtx.fillStyle = '#ffffff';
        oCtx.fillRect(0, 0, offscreenCanvasRef.current.width, offscreenCanvasRef.current.height);
        
        Object.entries(gridStateRef.current).forEach(([key, pixelInfo]) => {
          const [px, py] = key.split('-').map(Number);
          oCtx.fillStyle = pixelInfo.color || (typeof pixelInfo === 'string' ? pixelInfo : '#ffffff');
          oCtx.fillRect(px * pixelSize, py * pixelSize, pixelSize, pixelSize);
        });
      }
    };

    const drawGrid = () => {
      if (!offscreenCanvasRef.current) updateOffscreen();
      
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);

      ctx.drawImage(offscreenCanvasRef.current, 0, 0);

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(0, 0, gridSize * pixelSize, gridSize * pixelSize);

      ctx.restore();
    };

    // On redessine quand le zoom ou l'offset change
    drawGrid();

    socket.on('init-grid', ({ pixels, gridSize: serverGridSize, pixelSize: serverPixelSize }) => {
      console.log('Grid init received:', { serverGridSize, serverPixelSize, pixelCount: Object.keys(pixels).length });
      if (serverGridSize) setGridSize(serverGridSize);
      if (serverPixelSize) setPixelSize(serverPixelSize);
      gridStateRef.current = pixels;
      updateOffscreen();
      drawGrid();
    });

    socket.on('update-pixel', (pixel) => {
      const { x, y, color, faction, username: pUsername, isBomb, isNuke } = pixel;
      console.log('Pixel update received:', { x, y, color });
      
      gridStateRef.current[`${x}-${y}`] = { color, faction, username: pUsername };
      updateOffscreen({ [`${x}-${y}`]: { color } });
      drawGrid();

      if (pUsername === localStorage.getItem('username')) {
        if (isNuke) {
          playSound('nuke');
          setIsNukeTriggered(true);
          setTimeout(() => setIsNukeTriggered(false), 500);
        } else if (isBomb) {
          playSound('bomb');
        } else {
          playSound('pixel');
        }
      }
    });

    socket.on('update-pixel-batch', ({ pixels, isNuke, isBomb, username: batchUser }) => {
      const batchMap = {};
      pixels.forEach(({ x, y, color, faction, username }) => {
        gridStateRef.current[`${x}-${y}`] = { color, faction, username };
        batchMap[`${x}-${y}`] = { color };
      });
      
      updateOffscreen(batchMap);
      drawGrid();

      if (batchUser === localStorage.getItem('username')) {
        if (isNuke) {
          playSound('nuke');
          setIsNukeTriggered(true);
          setTimeout(() => setIsNukeTriggered(false), 500);
        } else if (isBomb) {
          playSound('bomb');
        }
      }
    });

    socket.on('admin-log', (logMsg) => {
      setAdminLogs(prev => [logMsg, ...prev].slice(0, 20)); // Garde seulement les 20 derniers logs
    });

    socket.on('admin-users-list', (users) => {
      setAdminUsers(users);
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

    socket.on('total-players-update', (count) => {
      setTotalPlayers(count);
    });

    // --- BLOQUER LE SCROLL DE LA PAGE SUR LE CANVAS ---
    const preventWheel = (e) => {
      e.preventDefault();
    };
    
    const canvasElement = canvasRef.current;
    if (canvasElement) {
      canvasElement.addEventListener('wheel', preventWheel, { passive: false });
    }

    return () => {
      if (canvasElement) {
        canvasElement.removeEventListener('wheel', preventWheel);
      }
      socket.off('init-grid');
      socket.off('update-pixel');
      socket.off('update-pixel-batch'); // Nettoyage de l'événement batch
      socket.off('energy-update');
      socket.off('stats-update');
      socket.off('error-msg');
      socket.off('update-scores');
    };
  }, [socket, zoom, offset]); // Re-run si le zoom ou l'offset change

  const handleWheel = (e) => {
    // Le preventDefault est maintenant géré par l'addEventListener ci-dessus
    const scaleAmount = -e.deltaY * 0.001;
    const newZoom = Math.min(Math.max(zoom + scaleAmount, 0.1), 10);
    
    // Zoomer vers la souris
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculer la nouvelle position pour garder le point sous la souris
    const newOffsetX = mouseX - (mouseX - offset.x) * (newZoom / zoom);
    const newOffsetY = mouseY - (mouseY - offset.y) * (newZoom / zoom);
    
    setZoom(newZoom);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const handleMouseDown = (e) => {
    if (e.button === 1 || e.altKey) { // Clic milieu ou Alt+Clic pour déplacer
      setIsDragging(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
    handleCanvasMouseMove(e);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleCanvasClick = (e) => {
    if (!socket || isDragging) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Transformer les coordonnées écran en coordonnées grille
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const x = Math.floor((mouseX - offset.x) / (pixelSize * zoom));
    const y = Math.floor((mouseY - offset.y) / (pixelSize * zoom));

    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return;

    // Pas besoin de jouer le son ici, il sera joué à la réception de l'événement socket
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
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const x = Math.floor((mouseX - offset.x) / (pixelSize * zoom));
    const y = Math.floor((mouseY - offset.y) / (pixelSize * zoom));
    
    // Extrait les informations sauvegardées pour ce bloc (depuis les init/updates)
    const key = `${x}-${y}`;
    const info = gridStateRef.current[key];
    
    if (hoverInfoRef.current) {
      if (info && info.username) {
        hoverInfoRef.current.innerHTML = `<span>Faction <span style="color: ${info.color}">${info.faction}</span>, par : ${info.username}</span>`;
      } else {
        hoverInfoRef.current.innerHTML = "Survolez la grille...";
      }
    }
  };

  // --- RENDU : ECRAN D'AUTHENTIFICATION ---
  if (!token) {
    return (
      <AuthScreen 
        authMode={authMode}
        authForm={authForm}
        setAuthForm={setAuthForm}
        handleAuth={handleAuth}
        authError={authError}
        setAuthMode={setAuthMode}
        setAuthError={setAuthError}
      />
    );
  }

  // --- RENDU : ECRAN DU JEU ---
  return (
    <div className={`min-h-screen bg-[#0a0a0a] text-white font-mono flex flex-col items-center p-5 transition-colors duration-200 ${isNukeTriggered ? '!bg-white blur-sm' : ''}`}>
      
      <Header 
        totalPlayers={totalPlayers}
        username={username}
        myTeam={myTeam}
        myPixelsPlaced={myPixelsPlaced}
        isAdmin={isAdmin}
        FACTION_COLORS={FACTION_COLORS}
        onLogout={handleLogout}
        isNukeTriggered={isNukeTriggered}
      />

      <div className={`flex flex-col lg:flex-row gap-8 items-start transition-transform ${isNukeTriggered ? 'scale-[1.1] rotate-1' : 'scale-100'}`}>
        
        {/* Colonne de gauche: Le Canvas */}
        <GameCanvas 
          canvasRef={canvasRef}
          gridSize={gridSize}
          pixelSize={pixelSize}
          handleWheel={handleWheel}
          handleMouseDown={handleMouseDown}
          handleMouseMove={handleMouseMove}
          handleMouseUp={handleMouseUp}
          handleCanvasClick={handleCanvasClick}
          hoverInfoRef={hoverInfoRef}
          isNukeTriggered={isNukeTriggered}
        />

        {/* Colonne de droite: Les Contrôles UI */}
        <div className="flex flex-col w-[350px]">
          
          <Sidebar 
            user={username}
            userTeam={myTeam}
            energy={energy}
            scores={scores}
            onLogout={handleLogout}
            FACTION_COLORS={FACTION_COLORS}
            isAdmin={isAdmin}
            faction={faction}
            setFaction={setFaction}
            setIsBombMode={setIsBombMode}
            setIsNukeMode={setIsNukeMode}
            isBombMode={isBombMode}
            isNukeMode={isNukeMode}
            socket={socket}
          />

          {error && <p className="text-[#ff4444] my-2 text-xs font-bold animate-pulse uppercase text-center bg-red-900/20 p-2 border border-red-900">{error}</p>}

          {/* ESPACE ADMIN PANNEAU */}
          <AdminPanel 
            isAdmin={isAdmin}
            adminUsers={adminUsers}
            openTeams={openTeams}
            setOpenTeams={setOpenTeams}
            handleResetGrid={handleResetGrid}
            adminLogs={adminLogs}
            FACTION_COLORS={FACTION_COLORS}
          />

        </div>
      </div>
    </div>
  );
}

export default App;