import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { TOKEN_PARAM } from '../shared/constants';
import type { SpikeInfo } from '../shared/types';
import type { SpikeFile } from './spike-files';

export interface VideoSource {
  path: string;
  /** Changes when the laptop picks another video, so the phone doesn't reuse a cached one. */
  version: string;
}

export interface AppOptions {
  /** Random token from the QR code; every page and file request must carry it. */
  token: string;
  /** Built phone pages (server/public). */
  publicDir: string;
  downloads: SpikeFile[];
  getVideo: () => VideoSource;
  log?: (line: string) => void;
}

/**
 * Milestone 1 spike server: a test page that streams one video and offers test
 * downloads. Pairing cookies, shared folders and the real /api routes come in milestone 2.
 */
export function createApp({ token, publicDir, downloads, getVideo, log }: AppOptions): express.Express {
  const app = express();
  app.disable('x-powered-by');

  if (log) app.use(requestLogger(log));

  // Page assets hold nothing private, so they don't need the token.
  app.use(express.static(publicDir, { index: false }));

  const requireToken = (req: Request, res: Response, next: NextFunction) => {
    if (tokenMatches(req.query[TOKEN_PARAM], token)) return next();
    res
      .status(403)
      .type('html')
      .send(
        '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">' +
          '<title>Couchdrive</title><p style="font:18px system-ui;padding:24px">' +
          'This link has expired. Scan the QR code on your laptop.</p>',
      );
  };

  app.get('/', requireToken, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/spike/info', requireToken, async (_req, res) => {
    const video = getVideo();
    const videoName = path.basename(video.path);
    const videoSize = (await fs.stat(video.path)).size;
    const files = await Promise.all(
      downloads.map(async ({ id, label, name, note, path: filePath }) => ({
        id,
        label,
        name,
        note,
        size: (await fs.stat(filePath)).size,
      })),
    );
    const info: SpikeInfo = {
      video: { name: videoName, size: videoSize, version: video.version },
      downloads: [
        ...files,
        { id: 'video', label: 'The test video above', name: videoName, size: videoSize, note: 'Optional: tests a large download.' },
      ],
    };
    res.set('Cache-Control', 'no-store').json(info);
  });

  // Inline stream for <video>. sendFile answers Range requests with 206 Partial
  // Content, so playback starts at once and seeking fetches only the new part.
  app.get('/spike/video', requireToken, (_req, res) => {
    res.sendFile(getVideo().path, { dotfiles: 'allow' }, (err) => sendFileDone(err, res));
  });

  // Content-Disposition: attachment, with an RFC 5987 filename* so non-English names survive.
  app.get('/spike/download/:id', requireToken, (req, res) => {
    const videoPath = getVideo().path;
    const file =
      req.params.id === 'video'
        ? { path: videoPath, name: path.basename(videoPath) }
        : downloads.find((d) => d.id === req.params.id);
    if (!file) return void res.status(404).send('Not found');
    res.download(file.path, file.name, { dotfiles: 'allow' }, (err) => sendFileDone(err, res));
  });

  app.use((_req, res) => {
    res.status(404).send('Not found');
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log?.(`error: ${err.message}`);
    if (!res.headersSent) res.status(500).send('Something went wrong on the laptop.');
  });

  return app;
}

function tokenMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sendFileDone(err: (Error & { code?: string; status?: number }) | undefined, res: Response): void {
  // The phone cancels requests all the time while seeking; that's not an error.
  if (!err || err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || res.headersSent) return;
  res.status(err.status ?? 404).send(err.status === 416 ? 'Range not satisfiable' : 'File not found');
}

/** One line per request: who, what, which byte range, and how it ended. Hides the token. */
function requestLogger(log: (line: string) => void) {
  const tokenInUrl = new RegExp(`([?&]${TOKEN_PARAM}=)[^&]*`);
  return (req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();
    res.on('close', () => {
      const url = req.originalUrl.replace(tokenInUrl, '$1…');
      const range = req.headers.range ? ` [${req.headers.range}]` : '';
      const outcome = res.writableFinished ? String(res.statusCode) : `${res.statusCode}, cancelled by phone`;
      log(`${req.ip} ${req.method} ${url}${range} → ${outcome} (${Date.now() - started} ms)`);
    });
    next();
  };
}
