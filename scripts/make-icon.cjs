// Renders build/icon.svg to build/icon.png (512 px) with Electron's own Chromium.
// Run after editing the SVG: npx electron scripts/make-icon.cjs
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const SIZE = 512;
const buildDir = path.join(__dirname, '..', 'build');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8');
  const window = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });
  const html = `<style>html,body{margin:0;background:transparent}</style>${svg}`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  fs.writeFileSync(path.join(buildDir, 'icon.png'), image.toPNG());
  console.log(`build/icon.png: ${image.getSize().width}x${image.getSize().height}`);
  app.quit();
});
