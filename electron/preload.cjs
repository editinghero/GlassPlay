const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    send: (channel, data) => {
      // whitelist channels
      const validChannels = ['toMain', 'file-request', 'file-selected', 'toggle-fullscreen', 'open-docs'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    invoke: async (channel, data) => {
      console.log(`invoke called with channel: ${channel}`);
      // whitelist channels
      const validChannels = ['dialog:openFile', 'file-request', 'handle-file-drop'];
      if (validChannels.includes(channel)) {
        try {
          const result = await ipcRenderer.invoke(channel, data);
          console.log(`invoke result for ${channel}:`, result);
          return result;
        } catch (error) {
          console.error(`Error invoking ${channel}:`, error);
          throw error;
        }
      }
      console.error(`Unauthorized IPC invoke to channel: ${channel}`);
      return Promise.reject(new Error(`Unauthorized IPC invoke to channel: ${channel}`));
    },
    receive: (channel, func) => {
      const validChannels = ['fromMain', 'file-selected'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    }
  }
);

// Add drag and drop support - only for debugging, don't interfere with React handlers
window.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, setting up drag and drop debugging');
  
  // Log drag and drop events for debugging without interfering
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventType => {
    document.addEventListener(eventType, (e) => {
      console.log(`${eventType} event detected, files:`, e.dataTransfer?.files?.length || 0);
      // Don't prevent default here - let React handle it
    }, false); // Use capture: false to not interfere with React handlers
  });
});

// Log that preload is complete
console.log('Preload script completed'); 