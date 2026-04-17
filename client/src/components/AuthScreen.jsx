import React from 'react';

const AuthScreen = ({ authMode, authForm, setAuthForm, handleAuth, authError, setAuthMode, setAuthError }) => {
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
};

export default AuthScreen;
