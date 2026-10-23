import { contextBridge, ipcRenderer } from 'electron';
import type { CouchdriveApi, ShareState } from '../shared/types';

const api: CouchdriveApi = {
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (callback) => {
    ipcRenderer.on('state', (_event, state: ShareState) => callback(state));
  },
  restartSharing: () => ipcRenderer.invoke('sharing:restart'),
  selectLink: (kind) => ipcRenderer.invoke('link:select', kind),
  chooseVideo: () => ipcRenderer.invoke('video:choose'),
  copyUrl: () => ipcRenderer.invoke('url:copy'),
};

contextBridge.exposeInMainWorld('couchdrive', api);
