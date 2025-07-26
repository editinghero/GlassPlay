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
      const validChannels = ['dialog:openFile', 'file-request'];
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

// Log that preload is complete
console.log('Preload script completed'); 