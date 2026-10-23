import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../src/domain/types';
const api: DesktopAPI = {
  openProject: (path) => ipcRenderer.invoke('project:open', path),
  saveProject: (project, saveAs) => ipcRenderer.invoke('project:save', project, !!saveAs),
  exportPng: (data, title) => ipcRenderer.invoke('image:export', data, title),
  getRecentFiles: () => ipcRenderer.invoke('recent:list'),
  removeRecent: (path) => ipcRenderer.invoke('recent:remove', path),
  setDirty: (dirty) => ipcRenderer.send('window:dirty', dirty),
  resetPath: () => ipcRenderer.invoke('project:reset'),
  confirmReplace: () => ipcRenderer.invoke('project:confirm'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  onSaveBeforeClose: (handler) => {
    const listener = async (_event: Electron.IpcRendererEvent, token: string) => {
      let ok = false;
      try {
        ok = await handler(token);
      } finally {
        ipcRenderer.send('window:save-result', token, ok);
      }
    };
    ipcRenderer.on('window:save-request', listener);
    return () => ipcRenderer.removeListener('window:save-request', listener);
  },
};
contextBridge.exposeInMainWorld('desktop', api);
