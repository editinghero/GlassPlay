interface ElectronAPI {
  send: (channel: string, data?: any) => void;
  receive: (channel: string, func: (...args: any[]) => void) => void;
  invoke: (channel: string, data?: any) => Promise<any>;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export {}; 