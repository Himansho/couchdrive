import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import QRCode from 'qrcode';
import { createApp } from '../server/app';
import { createSpikeFiles, type SpikeFile } from '../server/spike-files';
import { startServer, type RunningServer } from '../server/start';
import { DEFAULT_PORT, PORT_ATTEMPTS, TOKEN_PARAM } from '../shared/constants';
import type { ShareState } from '../shared/types';
import { pickLanAddress } from './network';

const rootDir = app.getAppPath();
const publicDir = path.join(rootDir, 'server', 'public');
const sampleVideoPath = path.join(rootDir, 'tests', 'fixtures', 'sample.mp4');

let window: BrowserWindow | null = null;
let server: RunningServer | null = null;
let spikeFiles: SpikeFile[] = [];
let video = { path: sampleVideoPath, version: 1 };
let state: ShareState = { status: 'starting', defaultPort: DEFAULT_PORT, otherAddresses: [], video: describeVideo() };
let queue = Promise.resolve();

function describeVideo(): ShareState['video'] {
  return { name: path.basename(video.path), size: fs.statSync(video.path).size, isSample: video.path === sampleVideoPath };
}

function setState(next: ShareState): void {
  state = next;
  window?.webContents.send('state', state);
}

async function startSharing(): Promise<void> {
  const { best, all } = pickLanAddress();
  // COUCHDRIVE_HOST overrides the pick: the e2e test uses 127.0.0.1, and it's a way out if the wrong adapter wins.
  const host = process.env.COUCHDRIVE_HOST || best?.address;
  const base = {
    defaultPort: DEFAULT_PORT,
    otherAddresses: all.filter((a) => a.address !== host),
    video: describeVideo(),
  };
  if (!host) return setState({ ...base, status: 'no-network' });

  // 128-bit and new every time sharing starts, so old links stop working (PRD D5).
  const token = crypto.randomBytes(16).toString('base64url');
  const handler = createApp({
    token,
    publicDir,
    downloads: spikeFiles,
    getVideo: () => ({ path: video.path, version: String(video.version) }),
    log: (line) => console.log(line),
  });
  try {
    server = await startServer(handler, host, DEFAULT_PORT, PORT_ATTEMPTS);
  } catch (err) {
    return setState({ ...base, status: 'error', host, error: (err as Error).message });
  }

  const url = `http://${host}:${server.port}/?${TOKEN_PARAM}=${token}`;
  console.log(`Sharing on ${url}`);
  setState({
    ...base,
    status: 'running',
    url,
    qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 360 }),
    host,
    port: server.port,
    interfaceName: all.find((a) => a.address === host)?.interfaceName ?? 'COUCHDRIVE_HOST',
  });
}

async function stopSharing(): Promise<void> {
  await server?.close();
  server = null;
}

/** Re-detects the network and makes a new token and QR code. Clicks queue up rather than overlap. */
function restartSharing(): Promise<void> {
  queue = queue.then(async () => {
    await stopSharing();
    setState({ ...state, status: 'starting' });
    await startSharing();
  });
  return queue;
}

function registerIpc(): void {
  ipcMain.handle('state:get', () => state);
  ipcMain.handle('sharing:restart', () => restartSharing());
  ipcMain.handle('url:copy', () => {
    if (state.url) clipboard.writeText(state.url);
  });
  ipcMain.handle('video:choose', async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: 'Choose a test video',
      properties: ['openFile'],
      filters: [
        { name: 'Videos', extensions: ['mp4', 'm4v', 'webm', 'mov', 'mkv'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return;
    video = { path: result.filePaths[0], version: video.version + 1 };
    setState({ ...state, video: describeVideo() });
  });
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 480,
    height: 820,
    minWidth: 400,
    title: 'Couchdrive',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.on('closed', () => {
    window = null;
  });
  void window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });

  void app.whenReady().then(async () => {
    spikeFiles = await createSpikeFiles(path.join(app.getPath('temp'), 'couchdrive-spike'), sampleVideoPath);
    registerIpc();
    createWindow();
    await restartSharing();
  });

  // Closing the window quits for now; the tray arrives in milestone 4.
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    void stopSharing();
  });
}
