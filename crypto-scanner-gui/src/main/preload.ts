import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export interface ElectronAPI {
  selectFolder: () => Promise<string | null>;
  selectFile: () => Promise<string | null>;
  startScan: (options: any) => Promise<any>;
  cancelScan: () => Promise<any>;
  saveCsv: (data: string) => Promise<any>;
  onScanProgress: (callback: (event: IpcRendererEvent, ...args: any[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}

const electronAPI: ElectronAPI = {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  startScan: (options) => ipcRenderer.invoke('start-scan', options),
  cancelScan: () => ipcRenderer.invoke('cancel-scan'),
  saveCsv: (data) => ipcRenderer.invoke('save-csv', data),
  onScanProgress: (callback) => ipcRenderer.on('scan-progress', callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}