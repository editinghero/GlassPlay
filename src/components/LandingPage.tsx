import React, { useState, useRef, useEffect } from 'react';
import { BackgroundBeamsWithCollision } from './BackgroundBeamsWithCollision';
import type { ChangeEvent } from 'react'
import type { VideoSubmission } from '../types/video'


interface LandingPageProps {
  onVideoSubmit: (data: VideoSubmission) => void
}

// Check if we're running in Electron
const isElectron = () => {
  return (window as any).electron !== undefined;
};

const LandingPage: React.FC<LandingPageProps> = ({ onVideoSubmit }) => {
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [useFfmpeg, setUseFfmpeg] = useState<boolean>(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // No debug logs in production
  // useEffect(() => {
  //   console.log('Processing state:', processingId ? 'active' : 'inactive');
  // }, [processingId]);

  const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    setVideoUrl(e.target.value)
    setError('')
  }

  const handleElectronFileSelect = async () => {
    // Always use the native file input
    fileInputRef.current?.click();
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return;

    // If FFmpeg is disabled, bypass backend and play immediately from blob
    if (!useFfmpeg) {
      const videoURL = URL.createObjectURL(file);
      onVideoSubmit({ videoUrl: videoURL, fileName: file.name, ambientUrl: undefined, audioTracks: undefined, subtitles: undefined });
      return;
    }

    try {
      const formData = new FormData();
      formData.append('video', file);

      const res = await fetch(`http://localhost:4000/video/upload-local?useFfmpeg=${useFfmpeg}`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();

      if (!data.ready) {
        // show processing UI
        setProcessingId(data.id);

        // poll progress
        const interval = setInterval(async () => {
          try {
            const progressRes = await fetch(`http://localhost:4000/progress/${data.id}`);
            const s = await progressRes.json();

            if (s.ready) {
              clearInterval(interval);
              const backendOrigin = 'http://localhost:4000';
              const submission: VideoSubmission = {
                videoUrl: new URL(s.videoUrl, backendOrigin).href,
                ambientUrl: s.ambientUrl ? new URL(s.ambientUrl, backendOrigin).href : undefined,
                audioTracks: data.audioTracks || [],
                subtitles: data.subtitles || [],
                fileName: file.name,
              }
              setProcessingId(null);
              onVideoSubmit(submission);
            }
          } catch (err) {
            console.error('Error polling status:', err);
          }
        }, 500); // Poll every 500ms
        return;
      }

      const backendOrigin = 'http://localhost:4000';
      const submission: VideoSubmission = {
        videoUrl: new URL(data.videoUrl, backendOrigin).href,
        ambientUrl: data.ambientUrl ? new URL(data.ambientUrl, backendOrigin).href : undefined,
        audioTracks: data.audioTracks || [],
        subtitles: data.subtitles || [],
        fileName: file.name,
      }
      onVideoSubmit(submission);
    } catch (err) {
      console.error(err);
      setError('Upload failed');
    }
  }

  const handleSubmit = () => {
    if (videoUrl.trim() === '') {
      setError('Please enter a valid URL')
      return
    }

    // Simple URL validation
    try {
      new URL(videoUrl)
      const fileName = videoUrl.split('/').pop() || videoUrl

      // FFmpeg is always disabled for URL uploads
      onVideoSubmit({ videoUrl, ambientUrl: undefined, fileName, audioTracks: undefined, subtitles: undefined })
    } catch (err) {
      setError('Please enter a valid URL')
    }
  }

  const handleFileClick = () => {
    // Always use the native file input for now
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 overflow-hidden">
      <BackgroundBeamsWithCollision className="fixed inset-0" style={{ zIndex: 1 }} />
      <div className="absolute inset-0 flex items-center justify-center px-4" style={{ zIndex: 2 }}>
        <div className="max-w-4xl w-full relative">
          {/* Fullscreen Icon Button - Top Right */}
          <button
            onClick={() => {
              if ((window as any).electron && (window as any).electron.send) {
                (window as any).electron.send('toggle-fullscreen');
              } else {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen();
                } else {
                  document.exitFullscreen();
                }
              }
            }}
            className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/40 hover:bg-black/70 transition"
            title="Fullscreen"
            aria-label="Fullscreen"
          >
            {/* SVG Fullscreen Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
            </svg>
          </button>
          <div className="glass-effect p-10 rounded-3xl shadow-2xl backdrop-blur-xl bg-black/30 relative" style={{ zIndex: 3 }}>
            <div>
              <h1 className="text-3xl font-medium text-white mb-8 text-center">GlassPlay</h1>

              <div className="space-y-6 max-w-lg mx-auto mb-10">
                <div>
                  <div className="relative">
                    <input
                      type="text"
                      value={videoUrl}
                      onChange={handleUrlChange}
                      placeholder="Enter video URL..."
                      className="w-full px-5 py-4 rounded-xl bg-white/10 backdrop-blur-sm text-white 
                    border border-white/20 focus:border-white/40 outline-none transition"
                    />
                  </div>
                  {error && <p className="text-red-400 text-sm mt-2 text-left">{error}</p>}
                </div>

                <div className="flex flex-col sm:flex-row gap-6">
                  <button
                    onClick={handleSubmit}
                    className="w-full sm:w-80 text-lg py-4 text-white rounded-2xl hover:ring-2 hover:ring-white/30 transition font-semibold"
                  >
                    Stream
                  </button>

                  <button
                    onClick={handleFileClick}
                    className="w-full sm:w-80 text-lg py-4 text-white rounded-2xl hover:ring-2 hover:ring-white/30 transition font-semibold"
                  >
                    Upload Video
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="video/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
                {/* FFmpeg toggle */}
                <div className="flex items-center justify-center mb-2 select-none">
                  <span className="mr-3 text-sm text-white/70">Blur Ambient (FFmpeg)</span>

                  <button
                    onClick={() => setUseFfmpeg(!useFfmpeg)}
                    className={
                      `
                  relative w-12 h-6 rounded-full transition
                  ${useFfmpeg ? 'bg-white/80' : 'bg-white/20'}
                  backdrop-blur-sm shadow-inner
                  `
                    }
                  >
                    <span
                      className={
                        `
                    absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black/80 transition-transform
                    ${useFfmpeg ? 'translate-x-6' : ''}
                    `
                      }
                    />
                  </button>
                </div>
                {/* FFmpeg note */}
                <p className="text-xs text-center text-white/50 mb-6">
                  FFmpeg Processing Requires Downloading The Video. For URL Streams, Download First For FFmpeg Processing.
                </p>
              </div>
            </div>
          </div>

          {/* Manual Button */}
          <button
            onClick={() => {
              if (isElectron()) {
                // In Electron, use the correct path
                (window as any).electron.send('open-docs');
              } else {
                // In web browser, open in new tab
                window.open('./docs/manual.html', '_blank');
              }
            }}
            className="
          fixed bottom-6 left-6 z-40
          group
          w-14 h-14 rounded-full
          bg-white/10 hover:bg-white/20
          backdrop-blur-md
          border border-white/20 hover:border-white/40
          transition-all duration-300
          flex items-center justify-center
          shadow-lg hover:shadow-xl
          hover:scale-110
        "
            title="Manual"
          >
            {/* Book Icon */}
            <svg
              className="w-6 h-6 text-white group-hover:text-white/90 transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>

            {/* Tooltip */}
            <div className="
          absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2
          opacity-0 group-hover:opacity-100
          transition-opacity duration-300
          bg-black/80 text-white text-sm
          px-3 py-1 rounded-lg
          whitespace-nowrap
          pointer-events-none
        ">
              Manual
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black/80"></div>
            </div>
          </button>

          {processingId && (
            <div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-50">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white mb-6"></div>
              <h2 className="text-white text-xl mb-4 text-center">Processing video...</h2>
              <p className="text-white/70 text-center max-w-md px-6">
                Using FFmpeg Requires GPU Processing And Might Take A Minute Or Two To Render A Smooth Ambient Playback Experience.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LandingPage;