import React from 'react';

interface AudioControlsMenuProps {
  bassLevel: number;
  trebleLevel: number;
  vocalsLevel: number;
  onLevelChange: (type: 'bass' | 'treble' | 'vocals', level: number) => void;
}

const AudioControlsMenu: React.FC<AudioControlsMenuProps> = ({
  bassLevel,
  trebleLevel,
  vocalsLevel,
  onLevelChange,
}) => {
  // Define the available levels
  const levels = [-2, -1, 0, 1, 2]; // -2: None, -1: Low, 0: Normal, 1: Medium, 2: High

  const getLevelLabel = (level: number): string => {
    switch (level) {
      case -2: return 'None';
      case -1: return 'Low';
      case 0: return 'Normal';
      case 1: return 'Medium';
      case 2: return 'High';
      default: return 'Normal';
    }
  };

  return (
    <div className="absolute bottom-full right-0 mb-3 settings-menu rounded-xl overflow-hidden w-72 z-50">
      <div className="p-4 glass-effect rounded-2xl overflow-hidden">
        <h3 className="text-sm text-white font-medium mb-3">Audio Controls</h3>
        
        {/* Bass control */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-white/80">Bass</span>
            <span className="text-xs text-white/60">
              {getLevelLabel(bassLevel)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {levels.map((level) => (
              <button
                key={`bass-${level}`}
                onClick={() => onLevelChange('bass', level)}
                className={`basis-1/2 sm:basis-1/4 py-1 px-1 text-xs rounded-md transition text-center whitespace-nowrap ${
                  bassLevel === level
                    ? 'bg-white/30 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {getLevelLabel(level)}
              </button>
            ))}
          </div>
        </div>
        
        {/* Treble control */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-white/80">Treble</span>
            <span className="text-xs text-white/60">
              {getLevelLabel(trebleLevel)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {levels.map((level) => (
              <button
                key={`treble-${level}`}
                onClick={() => onLevelChange('treble', level)}
                className={`basis-1/2 sm:basis-1/4 py-1 px-1 text-xs rounded-md transition text-center whitespace-nowrap ${
                  trebleLevel === level
                    ? 'bg-white/30 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {getLevelLabel(level)}
              </button>
            ))}
          </div>
        </div>
        
        {/* Vocals control */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-white/80">Vocals</span>
            <span className="text-xs text-white/60">
              {getLevelLabel(vocalsLevel)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {levels.map((level) => (
              <button
                key={`vocals-${level}`}
                onClick={() => onLevelChange('vocals', level)}
                className={`basis-1/2 sm:basis-1/4 py-1 px-1 text-xs rounded-md transition text-center whitespace-nowrap ${
                  vocalsLevel === level
                    ? 'bg-white/30 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {getLevelLabel(level)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioControlsMenu; 