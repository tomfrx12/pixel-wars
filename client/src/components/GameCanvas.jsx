import React from 'react';

const GameCanvas = ({ 
  canvasRef, 
  gridSize, 
  pixelSize, 
  handleWheel, 
  handleMouseDown, 
  handleMouseMove, 
  handleMouseUp, 
  handleCanvasClick, 
  hoverInfoRef, 
  isNukeTriggered 
}) => {
  return (
    <div className="flex flex-col items-center bg-[#111] p-4 rounded border border-gray-800 shadow-2xl">
      <canvas
        ref={canvasRef}
        width={gridSize * pixelSize}
        height={gridSize * pixelSize}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleCanvasClick}
        onMouseLeave={() => { 
            if (hoverInfoRef.current) hoverInfoRef.current.innerHTML = "SURVEILLANCE RÉSEAU...";
        }}
        className={`border-2 border-[#333] bg-white cursor-crosshair [image-rendering:pixelated] transition-all ${isNukeTriggered ? 'border-white shadow-[0_0_50px_#fff]' : ''}`}
        style={{ width: '800px', height: '800px' }}
      />
      {/* Panneau d'informations du pixel survolé */}
      <div 
        ref={hoverInfoRef}
        className="h-8 mt-2 text-xs text-[#00ff00] font-bold flex items-center justify-center uppercase tracking-widest"
      >
        SURVEILLANCE RÉSEAU...
      </div>
    </div>
  );
};

export default React.memo(GameCanvas);
