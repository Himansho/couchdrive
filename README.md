# Couchdrive

Your laptop's files, on your phone. Browse and stream over WiFi; nothing to install on the phone.

Couchdrive is a Windows app that shares the folders you pick with your Android phone over your home WiFi or your phone's hotspot. Scan a QR code once, then browse, stream videos with seeking, and download any file in the phone's browser. No internet, no cable, no account.

**Status:** milestone 1 of 5, a test build. It shows a QR code that opens a test page on the phone: one video to stream and seek, plus test downloads. File browsing comes in later milestones. The full plan is in [PRD.md](PRD.md).

## Run it

Needs Windows and [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm start
```

The first `npm start` downloads Electron (about 100 MB). When Windows Firewall asks about Electron, tick both **Private** and **Public** networks; a phone hotspot counts as Public.

| Command | What it does |
| --- | --- |
| `npm start` | Build and open the app |
| `npm test` | Server unit tests (Vitest) |
| `npm run check` | Type-check, unit tests and an end-to-end test of the desktop app (Playwright) |

Set `COUCHDRIVE_HOST` to share on a specific address instead of the detected WiFi one, for example `127.0.0.1` for local testing without the firewall prompt.

## Layout

| Folder | What's in it |
| --- | --- |
| `electron/` | Main process: window, network detection, QR code, starting and stopping the server; `renderer/` is the desktop window |
| `server/` | Express server; the built phone pages go in `server/public` |
| `web/` | Phone pages; for now, only the milestone 1 test page in `web/spike` |
| `shared/` | Types and constants used by all parts |
| `tests/` | Vitest unit tests, a Playwright end-to-end test, and a small sample video |

## License

[MIT](LICENSE)
