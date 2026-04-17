import React, { useMemo } from 'react';

const Sidebar = ({ 
  user, 
  userTeam, 
  energy, 
  scores, 
  onLogout, 
  FACTION_COLORS,
  isAdmin,
  faction,
  setFaction,
  setIsBombMode,
  setIsNukeMode,
  isBombMode,
  isNukeMode,
  socket
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* Barre d'énergie */}
      <div className="bg-[#111] p-4 rounded border border-gray-800 shadow-xl">
        <div className="w-full h-[25px] border border-[#00ff00] relative mb-1">
          <div 
            className={`h-full transition-[width] duration-300 ease-in-out ${(energy >= 100 || isAdmin) ? 'bg-[#ff0000] shadow-[0_0_10px_#ff0000]' : 'bg-[#00ff00]'}`} 
            style={{ width: isAdmin ? '100%' : `${energy}%` }} 
          />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-black text-[10px] font-bold">
            ENERGY: {isAdmin ? '∞ ADMIN' : `${energy}%`}
          </span>
        </div>
      </div>

      <div className="bg-[#111] p-4 rounded border border-gray-800 shadow-xl">
        <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest block mb-2">SÉLECTION FACTION</span>
        <select 
          value={faction} 
          disabled={!isAdmin}
          onChange={(e) => {
            const newTeam = e.target.value;
            setFaction(newTeam);
            if (isAdmin && socket) socket.emit('change-team', newTeam);
          }} 
          className={`bg-black text-white border p-2 w-full outline-none text-xs font-bold ${isAdmin ? 'border-[#00ff00] cursor-pointer' : 'border-gray-800 cursor-not-allowed opacity-50'}`}
        >
          <option value="red">🔴 TEAM RED</option>
          <option value="blue">🔵 TEAM BLUE</option>
          <option value="green">🟢 TEAM GREEN</option>
          <option value="yellow">🟡 TEAM YELLOW</option>
        </select>
      </div>

      <div className="bg-[#111] p-4 rounded border border-gray-800 shadow-xl">
        <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest block mb-3">ARMEMENT</span>
        <div className="flex flex-col gap-2 shadow-[0_0_10px_rgba(0,0,0,0.5)]">
          <div className="flex gap-2">
            <button 
              onClick={() => { setIsBombMode(false); setIsNukeMode(false); }}
              className={`flex-1 py-2 text-[10px] font-bold border transition-colors cursor-pointer uppercase ${(!isBombMode && !isNukeMode) ? 'bg-[#00ff00] text-black border-[#00ff00]' : 'bg-black text-gray-400 border-gray-800 hover:border-gray-600'}`}
            >
              PIXEL (5)
            </button>
            <button 
              onClick={() => { setIsBombMode(true); setIsNukeMode(false); }}
              className={`flex-1 py-2 text-[10px] font-bold border transition-colors cursor-pointer uppercase ${isBombMode ? 'bg-[#ffaa00] text-black border-[#ffaa00]' : 'bg-black text-gray-400 border-gray-800 hover:border-gray-600'}`}
            >
              BOMBE (20)
            </button>
          </div>
          <button 
            onClick={() => { setIsNukeMode(true); setIsBombMode(false); }}
            className={`w-full py-2 text-[10px] font-bold border transition-all cursor-pointer uppercase ${isNukeMode ? 'bg-[#ff0000] text-white border-[#ff0000] animate-pulse shadow-[0_0_10px_#ff0000]' : 'bg-black text-[#ff4444] border-[#ff4444] hover:bg-[#ff4444] hover:text-white'}`}
          >
            ☢️ NUKE (100)
          </button>
        </div>
      </div>

      <div className="bg-[#111] p-4 rounded border border-gray-800 shadow-xl">
        <p className="text-[#00ff00] mb-2 text-[10px] font-bold text-center uppercase tracking-widest">--- DOMINATION ---</p>
        <div className="space-y-1">
          {Object.entries(scores)
            .sort(([, a], [, b]) => b - a)
            .map(([teamId, score], index) => (
              <div key={teamId} className="flex justify-between text-[11px] font-bold font-mono">
                <span className="uppercase" style={{ color: FACTION_COLORS[teamId] }}>
                  {index === 0 && '👑 '}
                  {teamId}:
                </span>
                <span className="text-gray-300">{score} PX</span>
              </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default React.memo(Sidebar);
