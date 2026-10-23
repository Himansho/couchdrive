# Couchdrive

Your laptop's files, on your phone. Browse and stream over WiFi; nothing to install on the phone.

Couchdrive is a Windows app that shares the folders you pick with your Android phone over your home WiFi or your phone's hotspot. Scan a QR code once, then browse, stream videos with seeking, and download any file in the phone's browser. No internet, no cable, no account.

**Status:** milestone 1 of 5, a test build. It shows a QR code that opens a test page on the phone: one video to stream and seek, plus test files to download and share. File browsing comes in later milestones. The full plan is in [PRD.md](PRD.md).

The window offers two links:

- **Padlock link (HTTPS):** the phone can share files straight to WhatsApp and other apps. The first time, Chrome warns "Your connection is not private", because the laptop makes its own certificate. Tap Advanced, then Proceed.
- **Simple link (HTTP):** no warning, but no Share button either. Share from the download notification instead.

## Install it

Needs Windows and [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dist
```

This builds `release/Couchdrive-Setup-0.1.0.exe`. Double-click it to install Couchdrive for your Windows user, with a desktop and Start menu shortcut. It isn't signed yet, so a copy downloaded from the internet triggers a SmartScreen warning (More info → Run anyway). When Windows Firewall asks about Couchdrive, tick both **Private** and **Public** networks; a phone hotspot counts as Public.

## Develop

| Command | What it does |
| --- | --- |
| `npm start` | Build and open the app without installing it (the first run downloads Electron, about 100 MB) |
| `npm test` | Unit tests (Vitest) |
| `npm run check` | Type-check, unit tests and an end-to-end test of the desktop app (Playwright) |
| `npm run dist` | Build the Windows installer into `release/` |

Set `COUCHDRIVE_HOST` to share on a specific address instead of the detected WiFi one, for example `127.0.0.1` for local testing without the firewall prompt.

## Layout

| Folder | What's in it |
| --- | --- |
| `electron/` | Main process: window, network detection, QR code, starting and stopping the server; `renderer/` is the desktop window |
| `server/` | Express server; the built phone pages go in `server/public` |
| `web/` | Phone pages; for now, only the milestone 1 test page in `web/spike` |
| `shared/` | Types and constants used by all parts |
| `tests/` | Vitest unit tests, a Playwright end-to-end test, and a small sample video |
| `build/` | App icon (`icon.svg`; `npx electron scripts/make-icon.cjs` renders `icon.png`) |

## License

[MIT](LICENSE)
