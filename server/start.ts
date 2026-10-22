import http, { type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RunningServer {
  host: string;
  port: number;
  /** Stops listening and drops open connections at once (PRD flow step 11). */
  close(): Promise<void>;
}

/**
 * Listens on `host`, starting at `firstPort` and moving to the next port when
 * one is busy, up to `attempts` ports in total (PRD D7). Port 0 picks any free port.
 */
export async function startServer(
  handler: RequestListener,
  host: string,
  firstPort: number,
  attempts: number,
): Promise<RunningServer> {
  const server = http.createServer(handler);
  for (let i = 0; ; i++) {
    try {
      await listen(server, host, firstPort === 0 ? 0 : firstPort + i);
      break;
    } catch (err) {
      if (!isPortBusy(err) || i >= attempts - 1) throw err;
    }
  }
  return {
    host,
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

function listen(server: http.Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

/** EACCES too: Windows reserves some port ranges (Hyper-V, WSL) and refuses them. */
function isPortBusy(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'EADDRINUSE' || code === 'EACCES';
}
