import React from 'react';

const Header = ({ totalPlayers, username, myTeam, myPixelsPlaced, isAdmin, FACTION_COLORS, onLogout, isNukeTriggered }) => {
  return (
    <div className={`w-full max-w-[1400px] flex justify-between items-center mb-6 transition-opacity ${isNukeTriggered ? 'opacity-0' : 'opacity-100'}`}>
      <h1 className="text-[#00ff00] text-3xl font-bold drop-shadow-[0_0_10px_rgba(0,255,0,0.8)]">
        {">"} PIXEL_WARS_OS
      </h1>
      <div className="flex items-center gap-4">
        <span className="text-gray-400 text-[10px] border border-gray-800 px-3 py-1 rounded bg-black/50">
          USER: <span style={{ color: FACTION_COLORS[myTeam] }}>{username}</span> {isAdmin && '👑'}
        </span>
        <span className="text-[#00ff00] text-xs font-bold bg-[#111] border border-[#222] px-3 py-1 rounded shadow-[0_0_5px_rgba(0,255,0,0.2)]">
          ● {totalPlayers} CONNECTÉS
        </span>
        <button onClick={onLogout} className="border border-[#ff4444] text-[#ff4444] px-4 py-1 text-sm rounded hover:bg-[#ff4444] hover:text-white transition-colors font-bold cursor-pointer uppercase tracking-widest">
          TERMINATE
        </button>
      </div>
    </div>
  );
};

export default React.memo(Header);
