import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BackwardIcon, ForwardIcon } from '@heroicons/react/24/solid'

interface PlaybackControlsProps {
  onSkipBackward: () => void
  onSkipForward: () => void
  isVisible: boolean
}

const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  onSkipBackward,
  onSkipForward,
  isVisible
}) => {
  const [showLeftTap, setShowLeftTap] = useState(false)
  const [showRightTap, setShowRightTap] = useState(false)

  const handleLeftSideClick = () => {
    onSkipBackward()
    setShowLeftTap(true)
    setTimeout(() => setShowLeftTap(false), 500)
  }

  const handleRightSideClick = () => {
    onSkipForward()
    setShowRightTap(true)
    setTimeout(() => setShowRightTap(false), 500)
  }

  if (!isVisible) return null

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <div className="relative w-full h-full">
        {/* Left side control (rewind) - limited to left third of screen */}
        <div
          className="absolute top-0 left-0 w-1/3 h-full pointer-events-auto"
          onClick={handleLeftSideClick}
        >
          <AnimatePresence>
            {showLeftTap && (
              <motion.div
                className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 
                       w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm 
                       flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                <BackwardIcon className="w-10 h-10 text-white" />
                <span className="absolute -bottom-8 text-white text-sm font-medium">-10s</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right side control (forward) - limited to right third of screen */}
        <div
          className="absolute top-0 right-0 w-1/3 h-full pointer-events-auto"
          onClick={handleRightSideClick}
        >
          <AnimatePresence>
            {showRightTap && (
              <motion.div
                className="absolute top-1/2 right-1/3 translate-x-1/2 -translate-y-1/2 
                       w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm 
                       flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                <ForwardIcon className="w-10 h-10 text-white" />
                <span className="absolute -bottom-8 text-white text-sm font-medium">+10s</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

export default PlaybackControls 