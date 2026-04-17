import React from 'react';

const AdminPanel = ({ 
  isAdmin, 
  adminUsers, 
  openTeams, 
  setOpenTeams, 
  handleResetGrid, 
  adminLogs, 
  FACTION_COLORS 
}) => {
  if (!isAdmin) return null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="bg-[#111] p-3 rounded border border-[#00ff00] shadow-[0_0_15px_rgba(0,255,0,0.2)]">
        <p className="text-[#00ff00] mb-3 font-bold text-xs text-center uppercase tracking-widest">--- JOUEURS CONNECTÉS ---</p>
        
        <div className="space-y-2 h-[400px] overflow-y-auto pr-1 custom-scrollbar">
          {['red', 'blue', 'green', 'yellow'].map(teamId => {
            const teamUsers = adminUsers.filter(u => u.team === teamId);
            const isOpen = openTeams[teamId];
            
            return (
              <div key={teamId} className="border border-gray-800 rounded overflow-hidden">
                <button 
                  onClick={() => setOpenTeams(prev => ({ ...prev, [teamId]: !prev[teamId] }))}
                  className="w-full flex justify-between items-center p-2 bg-[#1a1a1a] hover:bg-[#222] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: FACTION_COLORS[teamId] }}></div>
                    <span className="text-[10px] font-bold uppercase" style={{ color: FACTION_COLORS[teamId] }}>
                      TEAM {teamId} ({teamUsers.length})
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500">{isOpen ? '▼' : '▶'}</span>
                </button>

                {isOpen && (
                  <div className="p-1 bg-black/30 space-y-1">
                    {teamUsers.length === 0 ? (
                      <div className="text-[9px] text-gray-600 italic p-1">Aucun joueur...</div>
                    ) : (
                      teamUsers.map((u, i) => (
                        <div key={i} className="flex justify-between items-center p-1.5 rounded bg-[#151515] border border-gray-900/50">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] text-white`}>
                              {u.username} {u.isAdmin && '👑'}
                            </span>
                          </div>
                          <span className="text-[9px] text-gray-500">⚡{u.energy}%</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button 
        onClick={handleResetGrid}
        className="w-full bg-[#ff0000] text-white py-2 rounded font-bold hover:bg-[#cc0000] transition-colors border-2 border-white/20 shadow-[0_0_10px_rgba(255,0,0,0.5)] cursor-pointer text-xs uppercase"
      >
        🚨 RÉINITIALISER LA GRILLE
      </button>
      
      <div className="bg-[#111] p-3 rounded border border-red-500 shadow-[0_0_10px_rgba(255,0,0,0.3)]">
        <p className="text-red-500 mb-2 font-bold text-xs text-center uppercase tracking-widest">--- ADMIN LOGS ---</p>
        <div className="space-y-1 h-32 overflow-y-auto text-[10px] text-gray-300 font-mono">
          {adminLogs.length === 0 ? <span className="text-gray-500 opacity-50 italic text-center block">Attente de logs...</span> : null}
          {adminLogs.map((log, i) => (
            <div key={i} className="border-b border-gray-900 pb-1 last:border-0 hover:text-white transition-colors">{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
