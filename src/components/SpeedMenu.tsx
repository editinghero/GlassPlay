import { CheckIcon } from '@heroicons/react/24/solid'

interface SpeedMenuProps {
  currentSpeed: number
  onSpeedChange: (speed: number) => void
}

const speeds = [
  { value: 0.25, label: '0.25x' },
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1, label: '1x (Normal)' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x' },
  { value: 1.75, label: '1.75x' },
  { value: 2, label: '2x' }
]

const SpeedMenu: React.FC<SpeedMenuProps> = ({ currentSpeed, onSpeedChange }) => {
  return (
    <div className="absolute bottom-full right-0 mb-3 rounded-xl overflow-hidden w-40 z-20">
      <h3 className="text-xs text-white/70 px-3 pt-2 pb-1">Playback Speed</h3>
      <ul className="text-sm glass-effect rounded-2xl overflow-hidden">
        {speeds.map((speed) => (
          <li
            key={speed.value}
            onClick={() => onSpeedChange(speed.value)}
            className={`p-2 px-3 flex justify-between items-center cursor-pointer transition
                      ${
                        speed.value === currentSpeed
                          ? 'text-white'
                          : 'text-white/80 hover:bg-white/10'
                      }`}
          >
            {speed.label}
            {speed.value === currentSpeed && (
              <CheckIcon className="w-4 h-4 text-white" />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SpeedMenu 