import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import QRCode from 'qrcode';
import { createApp } from '../server/app';
import { loadOrCreateCertificate } from '../server/certificate';
import { createSpikeFiles, type SpikeFile } from '../server/spike-files';
import { startServer, type RunningServer } from '../server/start';
import { DEFAULT_HTTPS_PORT, DEFAULT_PORT, PORT_ATTEMPTS, TOKEN_PARAM } from '../shared/constants';
import type { LinkKind, ShareLink, ShareState } from '../shared/types';
import { pickLanAddress } from './network';

// Tests use a temporary folder, so they never change the real settings or certificate.
if (process.env.COUCHDRIVE_USER_DATA) app.setPath('userData', process.env.COUCHDRIVE_USER_DATA);

const rootDir = app.getAppPath();
const publicDir = path.join(rootDir, 'server', 'public');
const sampleVideoPath = path.join(rootDir, 'tests', 'fixtures', 'sample.mp4');
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

let window: BrowserWindow | null = null;
let servers: RunningServer[] = [];
let spikeFiles: SpikeFile[] = [];
let video = { path: sampleVideoPath, version: 1 };
let state: ShareState = { status: 'starting', links: [], selected: 'https', otherAddresses: [], video: describeVideo() };
let queue = Promise.resolve();

function describeVideo(): ShareState['video'] {
  return { name: path.basename(video.path), size: fs.statSync(video.path).size, isSample: video.path === sampleVideoPath };
}

function setState(next: ShareState): void {
  state = next;
  window?.webContents.send('state', state);
}

/** The only setting so far: which link's QR code to show. Padlock (HTTPS) unless the user picked the simple one. */
function loadSelectedLink(): LinkKind {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')).link === 'http' ? 'http' : 'https';
  } catch {
    return 'https';
  }
}

function saveSelectedLink(link: LinkKind): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify({ link }, null, 2));
}

async function startSharing(): Promise<void> {
  const { best, all } = pickLanAddress();
  // COUCHDRIVE_HOST overrides the pick: the e2e test uses 127.0.0.1, and it's a way out if the wrong adapter wins.
  const host = process.env.COUCHDRIVE_HOST || best?.address;
  const base = {
    links: [],
    selected: state.selected,
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
    const certificate = await loadOrCreateCertificate(path.join(app.getPath('userData'), 'https'), host);
    servers.push(await startServer(handler, host, DEFAULT_PORT, PORT_ATTEMPTS));
    servers.push(await startServer(handler, host, DEFAULT_HTTPS_PORT, PORT_ATTEMPTS, certificate));
  } catch (err) {
    await stopSharing();
    return setState({ ...base, status: 'error', host, error: (err as Error).message });
  }

  const [httpServer, httpsServer] = servers;
  const links = await Promise.all([
    makeLink('https', host, httpsServer.port, DEFAULT_HTTPS_PORT, token),
    makeLink('http', host, httpServer.port, DEFAULT_PORT, token),
  ]);
  for (const link of links) console.log(`Sharing on ${link.url}`);
  setState({
    ...base,
    status: 'running',
    links,
    host,
    interfaceName: all.find((a) => a.address === host)?.interfaceName ?? 'COUCHDRIVE_HOST',
  });
}

async function makeLink(kind: LinkKind, host: string, port: number, defaultPort: number, token: string): Promise<ShareLink> {
  const url = `${kind}://${host}:${port}/?${TOKEN_PARAM}=${token}`;
  return { kind, url, port, defaultPort, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 360 }) };
}

async function stopSharing(): Promise<void> {
  await Promise.all(servers.splice(0).map((server) => server.close()));
}

/** Re-detects the network and makes a new token and QR codes. Clicks queue up rather than overlap. */
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
  ipcMain.handle('link:select', (_event, kind: LinkKind) => {
    if (kind !== 'https' && kind !== 'http') return;
    saveSelectedLink(kind);
    setState({ ...state, selected: kind });
  });
  ipcMain.handle('url:copy', () => {
    const link = state.links.find((l) => l.kind === state.selected);
    if (link) clipboard.writeText(link.url);
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
    state = { ...state, selected: loadSelectedLink() };
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
