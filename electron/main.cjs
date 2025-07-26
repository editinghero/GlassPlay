const { app, BrowserWindow, ipcMain, dialog, protocol, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
// More reliable isDev detection
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const fs = require('fs');

// Create log file for debugging
if (!isDev) {
  const logPath = path.join(process.env.TEMP || process.env.TMP || 'C:\\temp', 'glassplay-debug.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  console.log = (...args) => {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] LOG: ${args.join(' ')}\n`;
    logStream.write(message);
    originalConsoleLog(...args);
  };

  console.error = (...args) => {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ERROR: ${args.join(' ')}\n`;
    logStream.write(message);
    originalConsoleError(...args);
  };

  console.log('📄 Debug logging enabled. Log file:', logPath);
}

let mainWindow;
let docsWindow;

// Ensure single instance of the app
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting...');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Continue with app initialization
  app.whenReady().then(createWindow).catch(error => {
    console.error('❌ Fatal error during app initialization:', error);
    dialog.showErrorBox('GlassPlay Error', `Failed to start GlassPlay:\n\n${error.message}\n\nPlease contact support at AstralQuarks.`);
    app.quit();
  });
}

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  if (app.isReady()) {
    dialog.showErrorBox('GlassPlay Error', `Unexpected error:\n\n${error.message}\n\nThe app will now close.`);
  }
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  if (app.isReady()) {
    dialog.showErrorBox('GlassPlay Error', `Unexpected error:\n\n${reason}\n\nThe app will now close.`);
  }
  app.quit();
});

// Function to start the Express server
function startServer() {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('🚀 Starting server directly in main process...');
      console.log('📍 isDev:', isDev);
      console.log('📁 process.resourcesPath:', process.resourcesPath);
      console.log('📂 __dirname:', __dirname);
      console.log('⚙️ process.cwd():', process.cwd());

      // Set environment variables
      process.env.PORT = '4000';
      process.env.NODE_ENV = isDev ? 'development' : 'production';

      if (isDev) {
        // In development, load the server (supports both CJS & ESM)
        const serverPath = path.join(__dirname, '..', 'server', 'index.js');
        console.log('Loading server from:', serverPath);
        if (!fs.existsSync(serverPath)) {
          throw new Error(`Server file not found at: ${serverPath}`);
        }

        try {
          require(serverPath);
          console.log('✅ Server (CJS) loaded successfully during development');
        } catch (cjsErr) {
          if (cjsErr.code === 'ERR_REQUIRE_ESM') {
            console.warn('⚠️ Server is ESModule, falling back to dynamic import');
            const fileUrl = pathToFileURL(serverPath).href;
            await import(fileUrl);
            console.log('✅ Server (ESM) imported successfully during development');
          } else {
            throw cjsErr;
          }
        }
      } else {
        // In production, the server is in the asar file
        console.log('Loading server from asar...');
        console.log('__dirname:', __dirname);
        console.log('process.cwd():', process.cwd());

        try {
          // First attempt: standard CommonJS require
          require('../server/index.js');
          console.log('✅ Server loaded successfully from asar');
        } catch (error) {
          console.warn('⚠️ Server require() failed, trying dynamic import:', error.message);
          console.error('❌ Failed to load server from asar:', error.message);
          console.error('❌ Error stack:', error.stack);

          // Try multiple alternative paths
          const altPaths = [
            path.join(process.resourcesPath, 'app.asar', 'server', 'index.js'),
            path.join(__dirname, '..', 'server', 'index.js'),
            path.join(process.cwd(), 'server', 'index.js'),
            path.join(process.resourcesPath, 'server', 'index.js')
          ];

          let serverLoaded = false;
          for (const altPath of altPaths) {
            try {
              console.log('🔍 Trying path:', altPath);
              console.log('📋 Path exists:', fs.existsSync(altPath));

              if (fs.existsSync(altPath)) {
                try {
                  // Try regular require first
                  require(altPath);
                } catch (cjsErr) {
                  // Fallback to dynamic import for ES modules
                  const fileUrl = pathToFileURL(altPath).href;
                  await import(fileUrl);
                }
                console.log('✅ Server loaded successfully from:', altPath);
                serverLoaded = true;
                break;
              }
            } catch (altError) {
              console.error('❌ Failed to load from', altPath, ':', altError.message);
            }
          }

          if (!serverLoaded) {
            throw new Error('Could not load server from any path');
          }
        }
      }

      // Give the server time to start
      setTimeout(() => {
        console.log('Server started successfully in main process');
        resolve();
      }, 1000);

    } catch (err) {
      console.error('Error starting server:', err);
      reject(err);
    }
  });
}

async function createWindow() {
  try {
    // Start the server first
    await startServer();

    // Register file protocol handler
    protocol.registerFileProtocol('file', (request, callback) => {
      const url = request.url.replace('file:///', '');
      try {
        return callback(decodeURIComponent(url));
      } catch (error) {
        console.error('Failed to register protocol', error);
      }
    });

    // Check if window already exists
    if (mainWindow) {
      console.log('Window already exists, focusing it');
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      return;
    }

    // Get the absolute path to the preload script
    const preloadPath = path.join(__dirname, 'preload.cjs');
    console.log('Loading preload script from:', preloadPath);

    // Check if the preload script exists
    if (!fs.existsSync(preloadPath)) {
      console.error('Preload script not found at:', preloadPath);
      throw new Error('Preload script not found');
    }

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      icon: path.join(__dirname, '..', 'public', 'icon.ico'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath,
        webSecurity: false, // Allow loading local files
        devTools: isDev // Only enable DevTools in development mode
      }
    });

    // Prevent opening DevTools in production
    if (!isDev) {
      mainWindow.webContents.on('devtools-opened', () => {
        mainWindow.webContents.closeDevTools();
      });
    }

    // Add close confirmation dialog
    mainWindow.on('close', (e) => {
      e.preventDefault();
      dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Yes', 'No'],
        title: 'Confirm',
        message: 'Are you sure you want to close GlassPlay?'
      }).then(result => {
        if (result.response === 0) {  // 'Yes' button
          // Clean up original files but keep ambient files
          cleanupOriginalFiles();
          mainWindow.destroy();
        }
      });
    });

    // Remove the menu bar
    Menu.setApplicationMenu(null);

    // Load the app
    if (isDev) {
      mainWindow.loadURL('http://localhost:5173');
      // Only open DevTools when explicitly needed for debugging
      // mainWindow.webContents.openDevTools();
    } else {
      mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Set up file dialog handler
    ipcMain.handle('dialog:openFile', async () => {
      console.log('dialog:openFile handler called');
      try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: 'Videos', extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'] }
          ]
        });

        console.log('Dialog result:', { canceled, filePaths });

        if (canceled || filePaths.length === 0) {
          return null;
        }

        return filePaths[0];
      } catch (error) {
        console.error('Error in dialog:openFile handler:', error);
        throw error;
      }
    });

    ipcMain.on('toggle-fullscreen', () => {
      if (mainWindow) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      }
    });

    ipcMain.on('open-docs', () => {
      createDocsWindow();
    });
  } catch (error) {
    console.error('Error creating window:', error);
    app.quit();
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Server cleanup is not needed since it runs in the main process

// Function to create docs window
function createDocsWindow() {
  // If docs window already exists, focus it
  if (docsWindow) {
    if (docsWindow.isMinimized()) docsWindow.restore();
    docsWindow.focus();
    return;
  }

  // Create new docs window
  docsWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'GlassPlay Manual',
    icon: path.join(__dirname, '..', 'public', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      devTools: isDev
    },
    parent: mainWindow,
    modal: false,
    show: false
  });

  // Remove menu bar from docs window
  docsWindow.setMenuBarVisibility(false);

  // Try multiple paths for docs file
  const possiblePaths = [];

  if (isDev) {
    // Development paths
    possiblePaths.push(
      path.join(__dirname, '..', 'docs', 'manual.html'),
      path.join(process.cwd(), 'docs', 'manual.html')
    );
  } else {
    // Production paths - try multiple locations
    possiblePaths.push(
      // Inside asar file
      path.join(__dirname, '..', 'docs', 'manual.html'),
      // In resources folder
      path.join(process.resourcesPath, 'docs', 'manual.html'),
      // In app.asar
      path.join(process.resourcesPath, 'app.asar', 'docs', 'manual.html'),
      // Alternative locations
      path.join(process.resourcesPath, 'app', 'docs', 'manual.html'),
      path.join(process.cwd(), 'docs', 'manual.html')
    );
  }

  console.log('Trying to load docs from paths:', possiblePaths);

  // Try each path until one works
  let loaded = false;

  const tryLoadPath = async (pathIndex = 0) => {
    if (pathIndex >= possiblePaths.length) {
      // If no path worked, show error
      console.error('Could not find docs file in any location');
      dialog.showErrorBox('Error', 'Could not load documentation file. Please check if the docs folder exists.');
      if (docsWindow) docsWindow.close();
      return;
    }

    const currentPath = possiblePaths[pathIndex];
    console.log(`Trying path ${pathIndex + 1}/${possiblePaths.length}: ${currentPath}`);
    console.log('Path exists:', fs.existsSync(currentPath));

    try {
      await docsWindow.loadFile(currentPath);
      console.log('✅ Successfully loaded docs from:', currentPath);
      docsWindow.show();
      loaded = true;
    } catch (error) {
      console.error(`❌ Failed to load from ${currentPath}:`, error.message);
      // Try next path
      tryLoadPath(pathIndex + 1);
    }
  };

  // Start trying paths
  tryLoadPath();

  // Handle window closed
  docsWindow.on('closed', () => {
    docsWindow = null;
  });
}

// Function to clean up original files but keep ambient files
function cleanupOriginalFiles() {
  try {
    const outputsDir = isDev
      ? path.join(__dirname, '..', 'server', 'outputs')
      : path.join(process.resourcesPath, 'server', 'outputs');

    if (!fs.existsSync(outputsDir)) return;

    const files = fs.readdirSync(outputsDir);

    // Keep ambient files, delete originals
    files.forEach(file => {
      const filePath = path.join(outputsDir, file);
      // Only delete non-ambient files (originals)
      if (!file.includes('-ambient') && !file.endsWith('.gitkeep')) {
        try {
          console.log(`Cleaning up original file: ${filePath}`);
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`Failed to delete file ${filePath}:`, err);
        }
      }
    });
  } catch (err) {
    console.error('Error cleaning up files:', err);
  }
} 