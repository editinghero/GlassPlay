import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { v4 as uuidv4 } from 'uuid';
// import { createHash } from 'crypto';

import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Check if we're running in Electron production mode
const isElectron = process.versions && process.versions.electron !== undefined;
const isProduction = isElectron && process.env.NODE_ENV === 'production';

// Determine paths for Electron production or development
let basePath = __dirname;
if (isProduction) {
  // In Electron production, use the resources path
  basePath = process.resourcesPath;
}

// Set FFmpeg path correctly for Electron
if (isProduction) {
  // In production, use the bundled FFmpeg from resources
  const ffmpegBinaryPath = path.join(process.resourcesPath, 'ffmpeg.exe');
  console.log('Production FFmpeg path:', ffmpegBinaryPath);
  
  // Verify the FFmpeg binary exists
  if (fs.existsSync(ffmpegBinaryPath)) {
    ffmpeg.setFfmpegPath(ffmpegBinaryPath);
    console.log('FFmpeg binary found and set successfully');
  } else {
    console.error('FFmpeg binary not found at:', ffmpegBinaryPath);
    // Try alternative path in case of different packaging
    const altPath = path.join(process.resourcesPath, '..', 'ffmpeg.exe');
    if (fs.existsSync(altPath)) {
      ffmpeg.setFfmpegPath(altPath);
      console.log('FFmpeg found at alternative path:', altPath);
    } else {
      console.error('FFmpeg not found at alternative path either:', altPath);
    }
  }
} else {
  // In development, use the one from node_modules
  console.log('Development FFmpeg path:', ffmpegPath);
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// In-memory job store (reset when server restarts)
const jobs = new Map();
const originalsForCleanup = new Set();

// Cleanup handler removes originals when process exits
const cleanup = () => {
  originalsForCleanup.forEach(p => {
    try { fs.unlinkSync(p); } catch {}
  });
  process.exit(0);
};
['SIGINT','SIGTERM','SIGQUIT'].forEach(sig=>process.once(sig,cleanup));
process.once('exit', cleanup);

// Create necessary directories if they do not exist
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const uploadsDir = path.join(basePath, 'uploads');
const outputsDir = path.join(basePath, 'outputs');

ensureDir(uploadsDir);
ensureDir(outputsDir);

const upload = multer({ dest: uploadsDir });

const app = express();
app.use(cors());
app.use(express.json());  // For parsing application/json
app.use(express.urlencoded({ extended: true }));  // For parsing application/x-www-form-urlencoded
app.use('/media', express.static(outputsDir));

/**
 * POST /api/upload
 * Accepts multipart/form-data with "video" field.
 * 1. Stores the original video in uploads/
 * 2. Spawns ffmpeg to downscale to 240p (keeping FPS) – saved in outputs/
 * 3. Uses ffprobe to gather audio/subtitle track metadata
 * 4. Responds with JSON containing URLs for original & ambient, plus track info
 */
app.post('/video/upload-local', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const id = uuidv4();
  const useFfmpeg = req.query.useFfmpeg !== 'false'; // default true
  const jobId = uuidv4();
  const tempUploadPath = req.file.path;

  // Use sanitized original filename as cache key
  const baseName = path.parse(req.file.originalname).name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = path.extname(req.file.originalname) || '.mp4';
  const originalFilename = `${baseName}${ext}`;
  const originalPath = path.join(outputsDir, originalFilename);

  let ambientFilename = null;

  if (useFfmpeg) {
    ambientFilename = `${baseName}-ambient.mp4`;
    const ambientPath = path.join(outputsDir, ambientFilename);

    // If ambient already exists, skip transcoding
    if (!fs.existsSync(ambientPath)) {
      jobs.set(jobId, { progress: 0, ready: false, videoUrl: `/media/${originalFilename}` });
      
      // Try to use hardware encoding with appropriate fallbacks
      // Try hardware encoders first, then fall back to software if needed
      const encoders = [
        { name: 'h264_amf', options: ['-quality', 'speed', '-cq', '23'] },  // AMD (fastest)
        { name: 'h264_nvenc', options: ['-preset', 'p4', '-cq', '23'] },    // NVIDIA
        { name: 'h264_qsv', options: ['-preset', 'fast', '-q', '23'] },     // Intel
        { name: 'libx264', options: ['-preset', 'fast', '-crf', '23'] }     // Software (fallback)
      ];
      
      // Try encoders in sequence
      let encoderIndex = 0;
      
      const tryNextEncoder = () => {
        try {
          if (encoderIndex >= encoders.length) {
            console.error('[ffmpeg] All encoders failed');
            jobs.delete(jobId);
            return;
          }
          
          const encoderConfig = encoders[encoderIndex++];
          console.log(`[ffmpeg] Trying encoder ${encoderIndex}/${encoders.length}: ${encoderConfig.name}`);
          
          // Extract metadata first to get inputDuration
          ffmpeg.ffprobe(originalPath, (err, data) => {
            let localInputDuration = 0;
            let localAudioTracks = [];
            let localSubtitles = [];
            
            if (!err && data && data.streams) {
              data.streams.forEach((stream) => {
                if (stream.codec_type === 'audio') {
                  localAudioTracks.push({
                    index: stream.index,
                    channels: stream.channels,
                    codec: stream.codec_name,
                    language: stream.tags?.language || 'und',
                  });
                } else if (stream.codec_type === 'subtitle') {
                  localSubtitles.push({
                    index: stream.index,
                    codec: stream.codec_name,
                    language: stream.tags?.language || 'und',
                  });
                }
              });
              if (data.format && data.format.duration) {
                localInputDuration = data.format.duration;
              }
            }
            
            // Create FFmpeg command after we have duration
            const cmd = createFFmpegCommand(originalPath, ambientPath, encoderConfig, jobId, localInputDuration);
            
            // If command creation failed, try next encoder
            if (!cmd) {
              console.log(`[ffmpeg] Failed to create command with encoder ${encoderConfig.name}, trying next`);
              tryNextEncoder();
              return;
            }
            
            cmd.on('end', () => {
              clearTimeout(killTimer);
              console.log('[ffmpeg] ambient ready:', ambientFilename);

              const entry = jobs.get(jobId);
              if (entry) {
                entry.progress = 100;
                entry.ready = true;
                entry.ambientUrl = `/media/${ambientFilename}`;
              }
            })
            .on('error', err => {
              clearTimeout(killTimer);
              console.error(`[ffmpeg] Error with encoder ${encoderConfig.name}:`, err);
              
              // Try next encoder
              tryNextEncoder();
            })
            .save(ambientPath);
            
            // Fail-safe: kill after 10 min
            const killTimer = setTimeout(() => {
              console.error('[ffmpeg] timeout – killing process for', ambientFilename);
              try {
                cmd.kill('SIGKILL');
              } catch (err) {
                console.error('[ffmpeg] Error killing process:', err);
              }
              if (fs.existsSync(ambientPath)) fs.unlinkSync(ambientPath);
              
              // Try next encoder
              tryNextEncoder();
            }, 10 * 60 * 1000);
          });
        } catch (err) {
          console.error('[ffmpeg] Unexpected error in tryNextEncoder:', err);
          // Try next encoder
          setTimeout(tryNextEncoder, 1000);
        }
      };
      
      // Start trying encoders
      let killTimer;
      tryNextEncoder();
    } else {
      console.log('[ffmpeg] Reusing cached ambient for', ambientFilename);
      jobs.set(jobId, { progress: 100, ready: true, videoUrl: `/media/${originalFilename}`, ambientUrl: `/media/${ambientFilename}` });
    }
  }

  // Ensure original file exists in cache directory
  if (!fs.existsSync(originalPath)) {
    fs.copyFileSync(tempUploadPath, originalPath);
  }
  originalsForCleanup.add(originalPath);
  // Remove temp upload regardless (free disk)
  fs.unlinkSync(tempUploadPath);

  // Probe for track metadata
  let audioTracks = [];
  let subtitles = [];
  let inputDuration = 0;
  await new Promise((resolve) => {
    ffmpeg.ffprobe(originalPath, (err, data) => {
      if (!err && data && data.streams) {
        data.streams.forEach((stream) => {
          if (stream.codec_type === 'audio') {
            audioTracks.push({
              index: stream.index,
              channels: stream.channels,
              codec: stream.codec_name,
              language: stream.tags?.language || 'und',
            });
          } else if (stream.codec_type === 'subtitle') {
            subtitles.push({
              index: stream.index,
              codec: stream.codec_name,
              language: stream.tags?.language || 'und',
            });
          }
        });
        if (data.format && data.format.duration) {
          inputDuration = data.format.duration;
        }
      }
      resolve();
    });
  });

  const readyFlag = !useFfmpeg || (ambientFilename && fs.existsSync(path.join(outputsDir, ambientFilename)));

  if (!jobs.has(jobId)) {
    jobs.set(jobId, { progress: readyFlag ? 100 : 0, ready: readyFlag, videoUrl: `/media/${originalFilename}`, ambientUrl: ambientFilename ? `/media/${ambientFilename}` : null });
  }

  res.json({
    id: jobId,
    videoUrl: `/media/${originalFilename}`,
    ambientUrl: ambientFilename ? `/media/${ambientFilename}` : null,
    ready: readyFlag,
    audioTracks,
    subtitles,
  });
});

// Handle file uploads from Electron
app.post('/video/upload-electron', (req, res) => {
  console.log("Received Electron upload request:", req.body);
  
  const filePath = req.body?.filePath;
  const useFfmpeg = req.body?.useFfmpeg !== false; // default to true
  
  console.log(`FFmpeg processing: ${useFfmpeg ? 'enabled' : 'disabled'}`);
  
  if (!filePath) {
    console.error("No file path provided");
    return res.status(400).json({ error: 'No file path provided' });
  }

  try {
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return res.status(404).json({ error: 'File not found' });
    }

    const jobId = uuidv4();
    const fileName = path.basename(filePath);
    const baseName = path.parse(fileName).name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = path.extname(fileName) || '.mp4';
    const originalFilename = `${baseName}${ext}`;
    const originalPath = path.join(outputsDir, originalFilename);

    console.log(`Processing file: ${filePath} -> ${originalPath}`);
    
    // Copy the file to our outputs directory
    fs.copyFileSync(filePath, originalPath);

    // Process the file similar to upload-local endpoint
    let audioTracks = [];
    let subtitles = [];
    let ambientFilename = null;
    let inputDuration = 0;
    
    // If FFmpeg is enabled, create ambient version
    if (useFfmpeg) {
      ambientFilename = `${baseName}-ambient.mp4`;
      const ambientPath = path.join(outputsDir, ambientFilename);
      
      // If ambient already exists, skip transcoding
      if (!fs.existsSync(ambientPath)) {
        console.log(`Creating ambient version: ${ambientPath}`);
        jobs.set(jobId, { progress: 0, ready: false, videoUrl: `/media/${originalFilename}` });
        
        // Try to use hardware encoding with appropriate fallbacks
        // Try hardware encoders first, then fall back to software if needed
        const encoders = [
          { name: 'h264_amf', options: ['-quality', 'speed', '-cq', '23'] },  // AMD (fastest)
          { name: 'h264_nvenc', options: ['-preset', 'p4', '-cq', '23'] },    // NVIDIA
          { name: 'h264_qsv', options: ['-preset', 'fast', '-q', '23'] },     // Intel
          { name: 'libx264', options: ['-preset', 'fast', '-crf', '23'] }     // Software (fallback)
        ];
        
        // Try encoders in sequence
        let encoderIndex = 0;
        
        const tryNextEncoder = () => {
          try {
            if (encoderIndex >= encoders.length) {
              console.error('[ffmpeg] All encoders failed');
              jobs.delete(jobId);
              return;
            }
            
            const encoderConfig = encoders[encoderIndex++];
            console.log(`[ffmpeg] Trying encoder ${encoderIndex}/${encoders.length}: ${encoderConfig.name}`);
            
            // Extract metadata first to get inputDuration
            ffmpeg.ffprobe(originalPath, (err, data) => {
              let localInputDuration = 0;
              let localAudioTracks = [];
              let localSubtitles = [];
              
              if (!err && data && data.streams) {
                data.streams.forEach((stream) => {
                  if (stream.codec_type === 'audio') {
                    localAudioTracks.push({
                      index: stream.index,
                      channels: stream.channels,
                      codec: stream.codec_name,
                      language: stream.tags?.language || 'und',
                    });
                  } else if (stream.codec_type === 'subtitle') {
                    localSubtitles.push({
                      index: stream.index,
                      codec: stream.codec_name,
                      language: stream.tags?.language || 'und',
                    });
                  }
                });
                if (data.format && data.format.duration) {
                  localInputDuration = data.format.duration;
                }
              }
              
              // Update audioTracks and subtitles
              audioTracks = localAudioTracks;
              subtitles = localSubtitles;
              
              // Create FFmpeg command after we have duration
              const cmd = createFFmpegCommand(originalPath, ambientPath, encoderConfig, jobId, localInputDuration);
              
              // If command creation failed, try next encoder
              if (!cmd) {
                console.log(`[ffmpeg] Failed to create command with encoder ${encoderConfig.name}, trying next`);
                tryNextEncoder();
                return;
              }
              
              cmd.on('end', () => {
                clearTimeout(killTimer);
                console.log('[ffmpeg] ambient ready:', ambientFilename);

                const entry = jobs.get(jobId);
                if (entry) {
                  entry.progress = 100;
                  entry.ready = true;
                  entry.ambientUrl = `/media/${ambientFilename}`;
                }
              })
              .on('error', err => {
                clearTimeout(killTimer);
                console.error(`[ffmpeg] Error with encoder ${encoderConfig.name}:`, err);
                
                // Try next encoder
                tryNextEncoder();
              })
              .save(ambientPath);
              
              // Fail-safe: kill after 10 min
              killTimer = setTimeout(() => {
                console.error('[ffmpeg] timeout – killing process for', ambientFilename);
                try {
                  cmd.kill('SIGKILL');
                } catch (err) {
                  console.error('[ffmpeg] Error killing process:', err);
                }
                if (fs.existsSync(ambientPath)) fs.unlinkSync(ambientPath);
                
                // Try next encoder
                tryNextEncoder();
              }, 10 * 60 * 1000);
            });
          } catch (err) {
            console.error('[ffmpeg] Unexpected error in tryNextEncoder:', err);
            // Try next encoder
            setTimeout(tryNextEncoder, 1000);
          }
        };
        
        // Extract metadata and respond immediately
        extractMetadata(originalPath, (audioTracksData, subtitlesData, duration) => {
          audioTracks = audioTracksData;
          subtitles = subtitlesData;
          inputDuration = duration;
          
          // Start trying encoders
          let killTimer;
          tryNextEncoder();
          
          res.json({
            id: jobId,
            videoUrl: `/media/${originalFilename}`,
            ambientUrl: `/media/${ambientFilename}`,
            ready: false,
            audioTracks,
            subtitles
          });
        });
        return;
      } else {
        console.log('[ffmpeg] Reusing cached ambient for', ambientFilename);
        jobs.set(jobId, { 
          progress: 100, 
          ready: true, 
          videoUrl: `/media/${originalFilename}`, 
          ambientUrl: `/media/${ambientFilename}` 
        });
      }
    }

    // Extract metadata using FFmpeg
    extractMetadata(originalPath, (audioTracks, subtitles, duration) => {
      res.json({
        id: jobId,
        videoUrl: `/media/${originalFilename}`,
        ambientUrl: ambientFilename ? `/media/${ambientFilename}` : null,
        ready: true,
        audioTracks,
        subtitles
      });
      
      console.log(`Successfully processed file: ${filePath}`);
    });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Failed to process file: ' + error.message });
  }
});

// Helper function to extract metadata
function extractMetadata(filePath, callback) {
  let audioTracks = [];
  let subtitles = [];
  let inputDuration = 0;
  
  ffmpeg.ffprobe(filePath, (err, data) => {
    if (!err && data && data.streams) {
      data.streams.forEach((stream) => {
        if (stream.codec_type === 'audio') {
          audioTracks.push({
            index: stream.index,
            channels: stream.channels,
            codec: stream.codec_name,
            language: stream.tags?.language || 'und',
          });
        } else if (stream.codec_type === 'subtitle') {
          subtitles.push({
            index: stream.index,
            codec: stream.codec_name,
            language: stream.tags?.language || 'und',
          });
        }
      });
      if (data.format && data.format.duration) {
        inputDuration = data.format.duration;
      }
    }
    callback(audioTracks, subtitles, inputDuration);
  });
}

// Helper function to create a command with the specified encoder
function createFFmpegCommand(inputPath, outputPath, encoderConfig, jobId, inputDuration) {
  const { name: encoder, options: encoderOptions } = encoderConfig;
  
  console.log(`[ffmpeg] Trying encoder: ${encoder}`);
  
  try {
    // Create the command with basic options first
    const cmd = ffmpeg(inputPath)
      .inputOptions(['-hwaccel', 'auto'])
      .outputOptions([
        '-vf', 'scale=-2:144', // 144p
        '-an', // no audio
        '-movflags', 'faststart'
      ]);
    
    // Now add the encoder-specific options
    cmd.outputOptions([
      '-c:v', encoder,
      ...encoderOptions
    ]);
    
    // Add event handlers
    cmd.on('start', cmd => console.log('[ffmpeg]', cmd));
    
    cmd.on('progress', p => {
      const entry = jobs.get(jobId);
      if (!entry) return;
      
      let percent = 0;
      if (p.percent && !isNaN(p.percent)) {
        percent = p.percent;
      } else if (p.timemark && inputDuration) {
        // timemark format HH:MM:SS.xx
        const parts = p.timemark.split(':').map(Number);
        const seconds = parts[0]*3600 + parts[1]*60 + parts[2];
        percent = (seconds / inputDuration) * 100;
      }
      
      entry.progress = Math.min(99, Math.round(percent));
      jobs.set(jobId, entry);
    });
    
    return cmd;
  } catch (err) {
    console.error(`[ffmpeg] Error creating command with encoder ${encoder}:`, err);
    return null;
  }
}

// Progress polling endpoint
app.get('/progress/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Unknown job' });
  res.json(job);
});

// FFmpeg test endpoint
app.get('/test/ffmpeg', (req, res) => {
  console.log('FFmpeg test endpoint called');
  
  // Test if FFmpeg is accessible
  try {
    const { spawn } = require('child_process');
    const ffmpegPath = ffmpeg()._getFfmpegPath();
    
    console.log('Testing FFmpeg at path:', ffmpegPath);
    
    // Test FFmpeg version command
    const testProcess = spawn(ffmpegPath, ['-version'], { stdio: 'pipe' });
    
    let output = '';
    let errorOutput = '';
    
    testProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    testProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    testProcess.on('close', (code) => {
      console.log('FFmpeg test completed with code:', code);
      console.log('FFmpeg output:', output);
      console.log('FFmpeg error output:', errorOutput);
      
      if (code === 0 || output.includes('ffmpeg version')) {
        res.json({
          success: true,
          message: 'FFmpeg is working correctly',
          path: ffmpegPath,
          version: output.split('\n')[0],
          isProduction,
          isElectron
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'FFmpeg test failed',
          path: ffmpegPath,
          exitCode: code,
          output,
          errorOutput,
          isProduction,
          isElectron
        });
      }
    });
    
    testProcess.on('error', (err) => {
      console.error('FFmpeg test process error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to start FFmpeg process',
        error: err.message,
        path: ffmpegPath,
        isProduction,
        isElectron
      });
    });
    
  } catch (err) {
    console.error('FFmpeg test error:', err);
    res.status(500).json({
      success: false,
      message: 'FFmpeg test failed with exception',
      error: err.message,
      isProduction,
      isElectron
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`FFmpeg media server listening on :${PORT}`));