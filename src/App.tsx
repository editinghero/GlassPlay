import React, { useState, useEffect } from 'react'
import LandingPage from './components/LandingPage'
import VideoPlayer from './components/VideoPlayer'
import type { VideoSubmission } from './types/video'

function App() {
  const [videoData, setVideoData] = useState<VideoSubmission | null>(null)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)

  // TEMPORARILY DISABLED - Enable right-click and inspect for debugging glass effect
  useEffect(() => {
    console.log('🔧 DEBUG MODE: Right-click and developer tools are ENABLED for debugging glass effect');
    console.log('🔧 You can now use F12, Ctrl+Shift+I, right-click inspect, etc.');

    // Only handle F11 for fullscreen, allow all other keys
    const handleKeyDown = (e: KeyboardEvent) => {
      // F11 for fullscreen
      if (e.key === 'F11') {
        e.preventDefault();
        if ((window as any).electron && (window as any).electron.send) {
          (window as any).electron.send('toggle-fullscreen');
        } else {
          // Browser fallback
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
          } else {
            document.exitFullscreen();
          }
        }
      }
    };

    // Only add keydown listener for F11, no context menu or other restrictions
    document.addEventListener('keydown', handleKeyDown);

    // Clean up
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleVideoSubmit = (data: VideoSubmission) => {
    setVideoData(data)
    setIsPlaying(true)
  }

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4">
      <div className={`transition-all duration-500 ${!isPlaying ? 'w-full max-w-4xl' : 'w-full'}`}>
        {!isPlaying || !videoData ? (
          <LandingPage onVideoSubmit={handleVideoSubmit} />
        ) : (
          <VideoPlayer
            videoSrc={videoData.videoUrl}
            ambientSrc={videoData.ambientUrl}
            audioTracksInfo={videoData.audioTracks}
            subtitleTracksInfo={videoData.subtitles}
            videoName={videoData.fileName}
            onBack={() => setIsPlaying(false)}
          />
        )}
      </div>
    </div>
  )
}

export default App
