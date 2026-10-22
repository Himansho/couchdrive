import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../server/start';

const host = '127.0.0.1';
const ok: http.RequestListener = (_req, res) => res.end('ok');
const cleanup: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

/** Holds a port open, like another app would. */
async function occupy(port = 0): Promise<number> {
  const blocker = http.createServer();
  await new Promise<void>((resolve) => blocker.listen(port, host, resolve));
  cleanup.push(() => new Promise((resolve) => blocker.close(() => resolve())));
  return (blocker.address() as AddressInfo).port;
}

async function start(firstPort: number, attempts: number): Promise<RunningServer> {
  const server = await startServer(ok, host, firstPort, attempts);
  cleanup.push(() => server.close());
  return server;
}

describe('startServer', () => {
  it('uses the default port when it is free', async () => {
    const free = await occupy();
    await cleanup.pop()!();
    expect((await start(free, 5)).port).toBe(free);
  });

  it('moves to the next free port when the default is busy', async () => {
    const busy = await occupy();
    const server = await start(busy, 5);
    expect(server.port).toBeGreaterThan(busy);
    expect(server.port).toBeLessThan(busy + 5);
    expect(await (await fetch(`http://${host}:${server.port}/`)).text()).toBe('ok');
  });

  it('gives up after the allowed number of ports', async () => {
    const busy = await occupy();
    await expect(startServer(ok, host, busy, 1)).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('drops open connections on close', async () => {
    // A response that never ends, like a long video stream.
    const server = await startServer((_req, res) => res.write('partial'), host, 0, 1);
    const request = fetch(`http://${host}:${server.port}/`).then((res) => res.text());
    await new Promise((resolve) => setTimeout(resolve, 100));
    const started = Date.now();
    await server.close();
    expect(Date.now() - started).toBeLessThan(1000);
    await expect(request).rejects.toThrow();
  });
});
