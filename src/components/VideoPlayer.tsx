import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import {
  PlayIcon, PauseIcon, ArrowLeftIcon,
  Cog6ToothIcon, ArrowsPointingOutIcon,
  BackwardIcon, ForwardIcon,
  SpeakerWaveIcon, SpeakerXMarkIcon
} from '@heroicons/react/24/solid'
import PlaybackControls from './PlaybackControls'
import SpeedMenu from './SpeedMenu'
import AudioControlsMenu from './AudioControlsMenu'

interface AudioTrackInfo {
  index: number;
  language: string;
  codec: string;
  channels?: number;
}

interface SubtitleTrackInfo {
  index: number;
  language: string;
  codec: string;
}

interface VideoPlayerProps {
  videoSrc: string;
  ambientSrc?: string;
  audioTracksInfo?: AudioTrackInfo[];
  subtitleTracksInfo?: SubtitleTrackInfo[];
  videoName: string;
  onBack: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoSrc, ambientSrc, audioTracksInfo, subtitleTracksInfo, videoName, onBack }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  // Ambient background video (240p blurred)
  const ambientVideoRef = useRef<HTMLVideoElement>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // Player state
  const [isPlaying, setIsPlaying] = useState(false)

  // --- Volume state ---
  const [volume, setVolume] = useState(1) // 0.0 - 1.0 range
  const lastVolumeBeforeMute = useRef(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showControls, setShowControls] = useState(true)

  // Menu states
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [showAudioControlsMenu, setShowAudioControlsMenu] = useState(false)

  // Picture-in-Picture state
  const [isPiP, setIsPiP] = useState(false)

  // Video settings
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [videoFileName, setVideoFileName] = useState(videoName)
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  const [previewPosition, setPreviewPosition] = useState(0)
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 })
  // Player resize state (width & height)
  const [playerWidth, setPlayerWidth] = useState<number | null>(null)
  const [playerHeight, setPlayerHeight] = useState<number | null>(null)

  // Audio settings
  const [ambientModeEnabled, setAmbientModeEnabled] = useState(true)
  const [bassLevel, setBassLevel] = useState(0)
  const [trebleLevel, setTrebleLevel] = useState(0)
  const [vocalsLevel, setVocalsLevel] = useState(0)

  // Refs
  const hideControlsTimeout = useRef<number | null>(null)
  const videoContainerSize = useRef({ width: 0, height: 0 })
  // remove lastVolumeBeforeMute ref

  // Audio processing refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const bassFilterRef = useRef<BiquadFilterNode | null>(null)
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null)
  const vocalsFilterRef = useRef<BiquadFilterNode | null>(null)

  // Canvas for ambient background (drawn at low resolution)
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Track selection states
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(0);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState<number>(-1); // -1 = off
  const [showAudioTrackMenu, setShowAudioTrackMenu] = useState(false);
  const [showSubtitleTrackMenu, setShowSubtitleTrackMenu] = useState(false);

  // Initialize video metadata and audio context
  useEffect(() => {
    if (videoRef.current) {

      // Set crossOrigin only for remote URLs, not for local files
      if (videoSrc && !videoSrc.startsWith('file://')) {
        videoRef.current.crossOrigin = 'anonymous';
      }

      // Set up audio context and filters when video is loaded
      const initAudioContext = () => {
        try {
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          const audioContext = new AudioContext();
          audioContextRef.current = audioContext;

          // Create audio source from video element
          if (videoRef.current) { // Check if video element still exists
            const source = audioContext.createMediaElementSource(videoRef.current);
            audioSourceRef.current = source;

            // Create filters
            const bassFilter = audioContext.createBiquadFilter();
            bassFilter.type = 'lowshelf';
            bassFilter.frequency.value = 200;
            bassFilterRef.current = bassFilter;

            const trebleFilter = audioContext.createBiquadFilter();
            trebleFilter.type = 'highshelf';
            trebleFilter.frequency.value = 2000;
            trebleFilterRef.current = trebleFilter;

            // Create mid-range filter for vocals
            const vocalsFilter = audioContext.createBiquadFilter();
            vocalsFilter.type = 'peaking';
            vocalsFilter.frequency.value = 1000;
            vocalsFilter.Q.value = 1;
            vocalsFilterRef.current = vocalsFilter;

            // Connect the nodes: source -> bass -> treble -> vocals -> destination
            source.connect(bassFilter);
            bassFilter.connect(trebleFilter);
            trebleFilter.connect(vocalsFilter);
            vocalsFilter.connect(audioContext.destination);

            // Apply initial filter levels
            updateAudioFilters();
          }
        } catch (error) {
          console.error("Error initializing audio context:", error);
        }
      };

      // Initialize audio context when video can play
      const handleCanPlay = () => {
        if (!audioContextRef.current && videoRef.current) {
          initAudioContext();
        }
      };

      videoRef.current.addEventListener('canplay', handleCanPlay);

      return () => {
        if (videoRef.current) {
          videoRef.current.removeEventListener('canplay', handleCanPlay);
        }
        // Clean up audio context
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      };
    }
  }, [videoSrc]);

  // Enable ambient mode by default if ambient source is available
  useEffect(() => {
    if (ambientSrc) {
      setAmbientModeEnabled(true);
    }
  }, [ambientSrc]);

  // Track Picture-in-Picture enter/leave events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnterPiP = () => setIsPiP(true);
    const handleLeavePiP = () => setIsPiP(false);

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, []);

  // Keep ambient background video in sync with main video
  useEffect(() => {
    const main = videoRef.current;
    const ambient = ambientVideoRef.current;
    if (!main || !ambient) return;

    const syncTime = () => {
      if (Math.abs(ambient.currentTime - main.currentTime) > 0.3) {
        ambient.currentTime = main.currentTime;
      }
    };

    const handlePlay = () => {
      syncTime();
      ambient.play().catch(() => { });
    };
    const handlePause = () => ambient.pause();
    const handleSeeking = syncTime;

    main.addEventListener('play', handlePlay);
    main.addEventListener('pause', handlePause);
    main.addEventListener('seeking', handleSeeking);
    main.addEventListener('timeupdate', syncTime);

    return () => {
      main.removeEventListener('play', handlePlay);
      main.removeEventListener('pause', handlePause);
      main.removeEventListener('seeking', handleSeeking);
      main.removeEventListener('timeupdate', syncTime);
    };
  }, [ambientModeEnabled]);

  // Keep playbackRate identical so FPS matches exactly
  useEffect(() => {
    const main = videoRef.current;
    const ambient = ambientVideoRef.current;
    if (!main || !ambient) return;
    // Keep playbackRate identical so FPS matches exactly
    const syncRate = () => {
      ambient.playbackRate = main.playbackRate;
    };
    syncRate();
    main.addEventListener('ratechange', syncRate);
    return () => main.removeEventListener('ratechange', syncRate);
  }, []);

  // Canvas-based ambient background (renders at <=360p to save resources)
  useEffect(() => {
    if (!ambientModeEnabled || isFullscreen) return;

    const video = videoRef.current;
    const canvas = ambientCanvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const MAX_HEIGHT = 240;

    // Set canvas size once (prevents jitter from resizing)
    const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
    const targetHeight = Math.min(MAX_HEIGHT, video.videoHeight || 240);
    const targetWidth = targetHeight * aspect;
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const drawFrame = () => {
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      }
    };

    let rafId: number;
    const render = () => {
      drawFrame();
      rafId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [ambientModeEnabled, isFullscreen, videoSrc]);

  // Update audio filters when levels change
  useEffect(() => {
    updateAudioFilters();
  }, [bassLevel, trebleLevel, vocalsLevel]);

  // Sync video element volume/mute when 'volume' state changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = volume === 0;
    }
  }, [volume]);

  // Extract filename from URL or use generic name
  useEffect(() => {
    if (videoName) {
      setVideoFileName(videoName)
      return;
    }
    if (videoSrc) {
      try {
        const url = new URL(videoSrc)
        const pathParts = url.pathname.split('/');
        const fileName = pathParts[pathParts.length - 1];
        setVideoFileName(fileName || 'Video');
      } catch {
        // For object URLs or relative paths
        const parts = videoSrc.split('/');
        setVideoFileName(parts[parts.length - 1] || 'Video');
      }
    }
  }, [videoSrc]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      switch (key) {
        case ' ':
          togglePlayPause()
          break
        case 'arrowleft':
          e.preventDefault();
          skipBackward();
          break
        case 'arrowright':
          e.preventDefault();
          skipForward();
          break
        case 'arrowup':
          e.preventDefault();
          setVolume(prev => Math.min(1, prev + 0.05));
          break
        case 'arrowdown':
          e.preventDefault();
          setVolume(prev => Math.max(0, prev - 0.05));
          break
        case 'm':
          e.preventDefault();
          toggleMute();
          break
        case 'f':
          toggleFullscreen()
          break
        case 'p':
          togglePiP()
          break
        default:
          // Check for number keys 0-9
          if (/^[0-9]$/.test(key)) {
            const percent = parseInt(key) * 10
            seekToPercent(percent)
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying]);

  // Auto-hide controls
  useEffect(() => {
    if (isPlaying) {
      startHideControlsTimer()
    } else {
      clearHideControlsTimer()
      setShowControls(true)
    }

    return () => clearHideControlsTimer()
  }, [isPlaying])

  // Get video dimensions on metadata load
  useEffect(() => {
    const handleVideoResize = () => {
      if (videoRef.current) {
        const { videoWidth, videoHeight } = videoRef.current;

        if (videoWidth && videoHeight) {
          setVideoDimensions({
            width: videoWidth,
            height: videoHeight
          });

          // Store the container's initial size
          if (containerRef.current && !videoContainerSize.current.width) {
            const { offsetWidth, offsetHeight } = containerRef.current;
            videoContainerSize.current = {
              width: offsetWidth,
              height: offsetHeight
            };
          }
        }
      }
    };

    const video = videoRef.current;
    if (video) {
      video.addEventListener('loadedmetadata', handleVideoResize);

      // If the video is already loaded, get the dimensions immediately
      if (video.videoWidth && video.videoHeight) {
        handleVideoResize();
      }
    }

    return () => {
      if (video) {
        video.removeEventListener('loadedmetadata', handleVideoResize);
      }
    };
  }, [videoSrc]);

  // Set initial player width once video dimensions are known
  useEffect(() => {
    if (videoDimensions.width && videoDimensions.height && playerWidth === null && playerHeight === null) {
      const minWidth = 640;
      const initial = Math.max(minWidth, Math.min(1280, videoDimensions.width));
      setPlayerWidth(initial);
      const aspect = videoDimensions.height / videoDimensions.width;
      setPlayerHeight(initial * aspect);
    }
  }, [videoDimensions, playerWidth, playerHeight]);

  // Generic resize handler that works for any edge/corner
  const initiateResize = (
    e: React.MouseEvent<HTMLDivElement>,
    xDir: -1 | 0 | 1,
    yDir: -1 | 0 | 1
  ) => {
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = containerRef.current?.offsetWidth || 0;
    const startHeight = containerRef.current?.offsetHeight || 0;

    const onMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      let newWidth = startWidth + dx * xDir;
      let newHeight = startHeight + dy * yDir;

      const minWidth = 320;
      const minHeight = 180;
      const maxWidth = window.innerWidth - 40;
      const maxHeight = window.innerHeight - 40;

      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

      if (xDir !== 0) setPlayerWidth(newWidth);
      if (yDir !== 0) setPlayerHeight(newHeight);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSettingsMenu || showSpeedMenu || showAudioControlsMenu) {
        // Check if click is outside any menu
        const isOutside = !event.composedPath().some(el => {
          if (!(el instanceof HTMLElement)) return false;
          return el.classList.contains('settings-menu') ||
            (typeof el.closest === 'function' && el.closest('.settings-menu'));
        });

        if (isOutside) {
          setShowSettingsMenu(false);
          setShowSpeedMenu(false);
          setShowAudioControlsMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettingsMenu, showSpeedMenu, showAudioControlsMenu]);

  // Thumbnail preview generation
  useEffect(() => {
    const video = videoRef.current;
    const previewVideo = previewVideoRef.current;
    const canvas = canvasRef.current;

    if (!video || !previewVideo || !canvas) return;

    // Don't try to generate thumbnails for local files
    const isLocalFile = videoSrc.startsWith('file://');
    if (isLocalFile) {
      return;
    }

    // Set the canvas dimensions for the preview
    canvas.width = 160;
    canvas.height = 90;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Configure the preview video
    previewVideo.muted = true;
    previewVideo.crossOrigin = 'anonymous';
    previewVideo.preload = 'metadata';
    previewVideo.playsInline = true;
    previewVideo.src = video.src;

    // When the preview video has seeked to a time, capture the frame
    const handleSeeked = () => {
      try {
        // Draw the current frame of previewVideo onto the canvas
        ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
        // Convert canvas to data URL for preview image
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setPreviewImage(imageData);
      } catch (err) {
        console.error("Error capturing video frame:", err);
      }
    };

    previewVideo.addEventListener('seeked', handleSeeked);

    return () => {
      previewVideo.removeEventListener('seeked', handleSeeked);
    };
  }, [videoSrc]);

  // Add fullscreen change detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenElement = document.fullscreenElement;
      setIsFullscreen(!!fullscreenElement);

      // Automatically disable ambient mode in fullscreen
      if (!!fullscreenElement && ambientModeEnabled) {
        setAmbientModeEnabled(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [ambientModeEnabled]);

  // Apply selected tracks when changed
  useEffect(() => {
    const video = videoRef.current as any;
    if (!video) return;

    // Audio tracks (browser support varies)
    const audioTracks = video.audioTracks as any;
    if (audioTracks && typeof audioTracks.length === 'number') {
      for (let i = 0; i < audioTracks.length; i++) {
        audioTracks[i].enabled = i === currentAudioTrack;
      }
    }

    // Subtitle tracks (TextTrackList)
    const textTracks = video.textTracks as TextTrackList;
    if (textTracks && textTracks.length) {
      for (let i = 0; i < textTracks.length; i++) {
        const mode = (i === currentSubtitleTrack ? 'showing' : 'disabled');
        textTracks[i].mode = mode as TextTrackMode;
      }
    }
  }, [currentAudioTrack, currentSubtitleTrack]);

  const handleAudioTrackSelect = (idx: number) => {
    setCurrentAudioTrack(idx);
    setShowAudioTrackMenu(false);
    setShowSettingsMenu(false);
  };

  const handleSubtitleTrackSelect = (idx: number) => {
    setCurrentSubtitleTrack(idx);
    setShowSubtitleTrackMenu(false);
    setShowSettingsMenu(false);
  };

  const updateAudioFilters = () => {
    if (bassFilterRef.current) {
      // For None (-2), we apply -10dB gain
      // For other levels, we scale accordingly: -5dB, 0dB, +5dB, +10dB
      bassFilterRef.current.gain.value = bassLevel === -2 ? -10 : bassLevel * 5;
    }

    if (trebleFilterRef.current) {
      trebleFilterRef.current.gain.value = trebleLevel === -2 ? -10 : trebleLevel * 5;
    }

    if (vocalsFilterRef.current) {
      vocalsFilterRef.current.gain.value = vocalsLevel === -2 ? -10 : vocalsLevel * 5;
    }
  };

  const startHideControlsTimer = () => {
    clearHideControlsTimer()
    hideControlsTimeout.current = window.setTimeout(() => {
      if (!showSettingsMenu && !showSpeedMenu && !showAudioControlsMenu) {
        setShowControls(false)
      }
    }, 3000)
  }

  const clearHideControlsTimer = () => {
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current)
      hideControlsTimeout.current = null
    }
  }

  const handleMouseMove = () => {
    setShowControls(true)
    startHideControlsTimer()
  }

  const togglePlayPause = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  // --- Volume controls ---
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setVolume(value);
    if (value > 0) {
      lastVolumeBeforeMute.current = value;
    }
  };

  const toggleMute = () => {
    if (volume === 0) {
      // restore previous volume
      setVolume(lastVolumeBeforeMute.current || 1);
    } else {
      lastVolumeBeforeMute.current = volume;
      setVolume(0);
    }
  };

  const skipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, videoRef.current.duration)
    }
  }

  const skipBackward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0)
    }
  }

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);

      // Keep ambient background in sync with main video during playback
      if (ambientCanvasRef.current && ambientModeEnabled && Math.abs(ambientCanvasRef.current.width * ambientCanvasRef.current.height - videoRef.current.videoWidth * videoRef.current.videoHeight) > 1000) {
        ambientCanvasRef.current.width = videoRef.current.videoWidth;
        ambientCanvasRef.current.height = videoRef.current.videoHeight;
        const ctx = ambientCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, ambientCanvasRef.current.width, ambientCanvasRef.current.height);
        }
      }
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }

    // Initialize ambient video when main video metadata is loaded
    if (videoRef.current && ambientCanvasRef.current && ambientModeEnabled) {
      ambientCanvasRef.current.width = videoRef.current.videoWidth;
      ambientCanvasRef.current.height = videoRef.current.videoHeight;
      const ctx = ambientCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, ambientCanvasRef.current.width, ambientCanvasRef.current.height);
      }

      if (isPlaying) {
        // The ambient video is now a canvas, so we don't use .play() directly.
        // We rely on the main video's playback state to control the ambient effect.
      }
    }
  }

  const handleVideoProgress = (e: React.MouseEvent<HTMLDivElement>) => {
    if (progressBarRef.current && videoRef.current) {
      const rect = progressBarRef.current.getBoundingClientRect()
      const posX = e.clientX - rect.left;
      seekByX(posX, rect.width);
    }
  }

  const seekByX = (x: number, width: number) => {
    if (!videoRef.current) return;
    const duration = videoRef.current.duration;
    const percent = Math.max(0, Math.min(1, x / width));
    videoRef.current.currentTime = percent * duration;

    // Update preview while scrubbing
    updatePreviewFromX(x, width, duration);
  }

  // Helper to update thumbnail/time preview given x coordinate
  const updatePreviewFromX = (mouseX: number, width: number, duration: number) => {
    if (!previewRef.current || !videoRef.current) return;
    const hoverTime = (mouseX / width) * duration;
    setPreviewTime(hoverTime);

    const previewWidth = previewRef.current?.offsetWidth ?? 0;
    let previewPos = mouseX - previewWidth / 2;
    if (previewPos < 0) previewPos = 0;
    if (previewPos + previewWidth > width) previewPos = width - previewWidth;
    setPreviewPosition(previewPos);

    if (previewVideoRef.current) {
      try {
        const pv = previewVideoRef.current;
        pv.pause();
        pv.currentTime = hoverTime;
      } catch { }
    }
  }

  // Scrub start
  const handleScrubStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;
    setIsScrubbing(true);
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    seekByX(x, rect.width);
  }

  useEffect(() => {
    if (!isScrubbing) return;
    const handleMove = (ev: MouseEvent) => {
      if (!progressBarRef.current) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      seekByX(x, rect.width);
    };
    const stop = () => {
      setIsScrubbing(false);
      setPreviewTime(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', stop, { once: true });
    return () => {
      window.removeEventListener('mousemove', handleMove);
    }
  }, [isScrubbing]);

  const handleProgressBarHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !videoRef.current || !previewRef.current) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const width = rect.width;
    const duration = videoRef.current.duration;

    if (isNaN(duration)) return;

    // Calculate time at hover position
    const hoverTime = (mouseX / width) * duration;
    setPreviewTime(hoverTime);

    // Position the preview element (constrain to stay within the progress bar bounds)
    const previewWidth = previewRef.current?.offsetWidth ?? 0;
    let previewPos = mouseX - (previewWidth / 2);

    // Ensure the preview doesn't go outside the progress bar
    if (previewPos < 0) previewPos = 0;
    if (previewPos + previewWidth > width) previewPos = width - previewWidth;

    setPreviewPosition(previewPos);

    // Generate the thumbnail preview for this time point
    if (previewVideoRef.current) {
      try {
        const pv = previewVideoRef.current;
        pv.pause();
        pv.currentTime = hoverTime;
      } catch { }
    }
  };

  const handleProgressBarLeave = () => {
    setPreviewTime(null)
  }

  const seekToPercent = (percent: number) => {
    if (videoRef.current) {
      const newTime = (percent / 100) * videoRef.current.duration
      videoRef.current.currentTime = newTime
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  const toggleAmbientMode = () => {
    setAmbientModeEnabled(prev => !prev);
    setShowSettingsMenu(false);
  };

  const handleSpeedChange = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed
      setPlaybackSpeed(speed)
      setShowSpeedMenu(false)
      setShowSettingsMenu(false)
    }
  }

  // removed handleQualityChange – quality selection has been deprecated

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSettingsMenu(!showSettingsMenu);
    setShowSpeedMenu(false);
    setShowAudioControlsMenu(false);
  }

  const handleAudioLevelChange = (type: 'bass' | 'treble' | 'vocals', level: number) => {
    switch (type) {
      case 'bass':
        setBassLevel(level);
        break;
      case 'treble':
        setTrebleLevel(level);
        break;
      case 'vocals':
        setVocalsLevel(level);
        break;
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else {
        await video.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch (err) {
      console.error('Failed to toggle Picture-in-Picture', err);
    }
  };

  // Format time in mm:ss
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`
  }

  // Calculate the optimal player size based on video dimensions and screen size
  const getPlayerStyle = () => {
    if (!videoDimensions.width || !videoDimensions.height) {
      return {} as React.CSSProperties;
    }

    return {
      width: playerWidth ? `${playerWidth}px` : '100%',
      height: playerHeight ? `${playerHeight}px` : 'auto',
      maxWidth: '100%',
      maxHeight: '100%',
    } as React.CSSProperties;
  };

  return (
    <div className="relative w-full flex items-center justify-center">
      {/* Full-screen blurred ambient video */}
      {(ambientSrc || videoSrc) && ambientModeEnabled && !isFullscreen && (
        <video
          ref={ambientVideoRef}
          src={ambientSrc || videoSrc}
          muted
          loop
          playsInline
          crossOrigin="anonymous"
          className="fixed inset-0 -z-10 w-full h-full object-cover blur-3xl scale-110 opacity-60 pointer-events-none"
          onError={() => {
            if (ambientVideoRef.current && ambientSrc) {
              // Fallback to main video if ambient not ready yet
              ambientVideoRef.current.src = videoSrc;
            }
          }}
        />
      )}

      <motion.div
        ref={containerRef}
        className="w-full rounded-3xl overflow-hidden relative shadow-2xl bg-black/40"
        style={getPlayerStyle()}
        onMouseMove={handleMouseMove}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Resize handles (corners + edges) */}
        {/* Corners */}
        <div className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-50" onMouseDown={(e) => initiateResize(e, -1, -1)} />
        <div className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-50" onMouseDown={(e) => initiateResize(e, 1, -1)} />
        <div className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-50" onMouseDown={(e) => initiateResize(e, -1, 1)} />
        <div className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-50" onMouseDown={(e) => initiateResize(e, 1, 1)} />
        {/* Edges */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-2 cursor-ns-resize z-50" onMouseDown={(e) => initiateResize(e, 0, -1)} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-2 cursor-ns-resize z-50" onMouseDown={(e) => initiateResize(e, 0, 1)} />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-2 cursor-ew-resize z-50" onMouseDown={(e) => initiateResize(e, -1, 0)} />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 h-4 w-2 cursor-ew-resize z-50" onMouseDown={(e) => initiateResize(e, 1, 0)} />

        {/* Main video - no ambient background here anymore */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover bg-black"
          src={videoSrc}
          crossOrigin="anonymous"
          onClick={togglePlayPause}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {/* Thumbnail preview canvas (hidden) */}
        <canvas ref={canvasRef} className="hidden" width="160" height="90" />

        {/* Glass overlay and controls - visibility controlled by showControls */}
        <motion.div
          className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: showControls ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Top controls */}
          <div className="flex justify-between items-center pointer-events-auto">
            <button
              onClick={onBack}
              className="glass-effect p-2 rounded-full hover:bg-white/20 transition-colors flex items-center gap-2"
            >
              <ArrowLeftIcon className="w-5 h-5 text-white" />
              <span className="text-sm text-white font-medium hidden sm:inline">Back</span>
            </button>

            <div className="glass-effect rounded-full px-4 py-2">
              <h3 className="text-white text-sm font-medium truncate max-w-xs">{videoFileName}</h3>
            </div>

            {/* Volume control */}
            <div className="glass-effect flex items-center gap-2 px-3 py-1 rounded-full">
              <button
                onClick={toggleMute}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                {volume === 0 ? (
                  <SpeakerXMarkIcon className="w-5 h-5 text-white" />
                ) : (
                  <SpeakerWaveIcon className="w-5 h-5 text-white" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="w-24"
              />
            </div>


          </div>

          {/* Center play button - only visible when paused */}
          {!isPlaying && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <button
                className="w-20 h-20 rounded-full glass-effect flex items-center justify-center 
                          hover:bg-white/20 transition-colors pointer-events-auto"
                onClick={togglePlayPause}
              >
                <PlayIcon className="w-10 h-10 text-white" />
              </button>
            </motion.div>
          )}

          {/* Bottom controls */}
          <div className="pointer-events-auto px-4">
            <div className="glass-effect flex items-center gap-4 px-5 py-3 rounded-2xl w-full">
              {/* Media buttons */}
              <button onClick={skipBackward} className="p-1">
                <BackwardIcon className="w-5 h-5 text-white" />
              </button>

              <button onClick={togglePlayPause}>
                {isPlaying ? (
                  <PauseIcon className="w-7 h-7 text-white" />
                ) : (
                  <PlayIcon className="w-7 h-7 text-white" />
                )}
              </button>

              <button onClick={skipForward} className="p-1">
                <ForwardIcon className="w-5 h-5 text-white" />
              </button>

              {/* Time & progress */}
              <span className="text-xs font-medium text-white tabular-nums w-12 text-right select-none">
                {formatTime(currentTime)}
              </span>

              {/* Progress bar with preview */}
              <div className="relative flex-1 mx-2">
                {/* Preview thumbnail & time */}
                {previewTime !== null && (
                  <div
                    ref={previewRef}
                    className="absolute -top-24 left-0 preview-thumbnail flex flex-col items-center"
                    style={{ transform: `translateX(${previewPosition}px)` }}
                  >
                    {previewImage ? (
                      <div className="w-40 h-24 overflow-hidden">
                        <img
                          src={previewImage}
                          alt="preview"
                          className="w-40 h-24 object-cover"
                          onError={(e) => {
                            // Hide the image on error
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-40 h-24 bg-black flex items-center justify-center">
                        <span className="text-xs text-white/70">Loading...</span>
                      </div>
                    )}
                    <span className="text-xs text-white py-1 px-2">{formatTime(previewTime)}</span>
                  </div>
                )}

                <div
                  className="progress-container h-1.5 rounded-full w-full cursor-pointer"
                  ref={progressBarRef}
                  onClick={handleVideoProgress}
                  onMouseMove={handleProgressBarHover}
                  onMouseLeave={handleProgressBarLeave}
                  onMouseDown={handleScrubStart}
                >
                  <div
                    className="progress-bar rounded-full h-full"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
              </div>

              <span className="text-xs font-medium text-white tabular-nums w-12 select-none">
                -{formatTime(Math.max(duration - currentTime, 0))}
              </span>

              {/* Settings / fullscreen */}
              <div className="flex items-center gap-4 items-center">
                <div className="flex items-center">
                  <button onClick={handleSettingsClick}>
                    <Cog6ToothIcon className="w-5 h-5 text-white" />
                  </button>

                  {showSettingsMenu && (
                    <div className="absolute bottom-full right-0 mb-3 rounded-2xl overflow-hidden w-48 z-40 settings-menu">
                      <div className="glass-effect flex flex-col divide-y divide-white/10">
                        <button
                          className="p-3 text-left text-sm text-white hover:bg-white/20 transition"
                          onClick={() => {
                            setShowSpeedMenu(true);
                            setShowAudioControlsMenu(false);
                            setShowSettingsMenu(false);
                          }}
                        >
                          <div>Playback Speed</div>
                          <div className="text-xs text-white/70">{playbackSpeed}x</div>
                        </button>
                        <button
                          className="p-3 text-left text-sm text-white hover:bg-white/20 transition"
                          onClick={togglePiP}
                        >
                          <div>Picture-in-Picture</div>
                          <div className="text-xs text-white/70">{isPiP ? 'On' : 'Off'}</div>
                        </button>
                        <button
                          className="p-3 text-left text-sm text-white hover:bg-white/20 transition"
                          onClick={() => {
                            setShowAudioControlsMenu(true);
                            setShowSpeedMenu(false);
                            setShowSettingsMenu(false);
                          }}
                        >
                          <div>Audio Controls</div>
                          <div className="text-xs text-white/70">Bass, Treble, Vocals</div>
                        </button>
                        <button
                          className="p-3 text-left text-sm text-white hover:bg-white/20 transition"
                          onClick={toggleAmbientMode}
                        >
                          <div>Ambient Mode</div>
                          <div className="text-xs text-white/70">{ambientModeEnabled ? 'Enabled' : 'Disabled'}</div>
                        </button>
                        {audioTracksInfo && audioTracksInfo.length > 1 && (
                          <button
                            className="p-3 text-left text-sm text-white hover:bg-white/20 transition"
                            onClick={() => {
                              setShowAudioTrackMenu(true);
                              setShowSettingsMenu(false);
                              setShowSpeedMenu(false);
                              setShowAudioControlsMenu(false);
                            }}
                          >
                            <div>Audio Track</div>
                            <div className="text-xs text-white/70">{audioTracksInfo[currentAudioTrack]?.language || 'Track'} #{currentAudioTrack + 1}</div>
                          </button>
                        )}

                        {subtitleTracksInfo && subtitleTracksInfo.length > 0 && (
                          <button
                            className="p-3 text-left text-sm text-white hover:bg-white/20 transition"
                            onClick={() => {
                              setShowSubtitleTrackMenu(true);
                              setShowSettingsMenu(false);
                              setShowSpeedMenu(false);
                              setShowAudioControlsMenu(false);
                            }}
                          >
                            <div>Subtitles</div>
                            <div className="text-xs text-white/70">{currentSubtitleTrack === -1 ? 'Off' : subtitleTracksInfo[currentSubtitleTrack]?.language}</div>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={toggleFullscreen}>
                  <ArrowsPointingOutIcon className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Hidden preview video element for seek thumbnails */}
          <video ref={previewVideoRef} src={videoSrc} muted playsInline className="hidden" preload="auto" />
        </motion.div>

        {/* Floating menus - separate from main controls */}
        {showSpeedMenu && (
          <div className="absolute bottom-16 right-8 z-50 settings-menu">
            <SpeedMenu
              currentSpeed={playbackSpeed}
              onSpeedChange={handleSpeedChange}
            />
          </div>
        )}

        {/* Quality menu removed – replaced by PiP toggle */}

        {showAudioControlsMenu && (
          <div className="absolute bottom-16 right-8 z-50 settings-menu">
            <AudioControlsMenu
              bassLevel={bassLevel}
              trebleLevel={trebleLevel}
              vocalsLevel={vocalsLevel}
              onLevelChange={handleAudioLevelChange}
            />
          </div>
        )}

        {/* Audio track menu */}
        {showAudioTrackMenu && audioTracksInfo && (
          <div className="absolute bottom-16 right-8 z-50 settings-menu">
            <div className="glass-effect flex flex-col divide-y divide-white/10 rounded-2xl overflow-hidden">
              {audioTracksInfo.map((track, idx) => (
                <button
                  key={idx}
                  className="p-3 text-left text-sm text-white hover:bg-white/20 transition flex justify-between"
                  onClick={() => handleAudioTrackSelect(idx)}
                >
                  <span>{track.language || 'Track'} #{idx + 1}</span>
                  {currentAudioTrack === idx && <span>✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subtitle track menu */}
        {showSubtitleTrackMenu && subtitleTracksInfo && (
          <div className="absolute bottom-16 right-8 z-50 settings-menu">
            <div className="glass-effect flex flex-col divide-y divide-white/10 rounded-2xl overflow-hidden">
              <button
                className="p-3 text-left text-sm text-white hover:bg-white/20 transition flex justify-between"
                onClick={() => handleSubtitleTrackSelect(-1)}
              >
                <span>Off</span>
                {currentSubtitleTrack === -1 && <span>✓</span>}
              </button>
              {subtitleTracksInfo.map((sub, idx) => (
                <button
                  key={idx}
                  className="p-3 text-left text-sm text-white hover:bg-white/20 transition flex justify-between"
                  onClick={() => handleSubtitleTrackSelect(idx)}
                >
                  <span>{sub.language || 'Subtitle'} #{idx + 1}</span>
                  {currentSubtitleTrack === idx && <span>✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Playback controls - skip forward/backward on tap */}
        <PlaybackControls
          onSkipBackward={skipBackward}
          onSkipForward={skipForward}
          isVisible={isPlaying && !showControls && !showSettingsMenu && !showSpeedMenu && !showAudioControlsMenu}
        />
      </motion.div>
    </div>
  )
}

export default VideoPlayer 