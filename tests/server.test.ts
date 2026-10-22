import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { createSpikeFiles, HINDI_FILE_NAME } from '../server/spike-files';
import { startServer, type RunningServer } from '../server/start';
import type { SpikeInfo } from '../shared/types';

const token = 'test-token-0123456789';
const sampleMp4 = path.resolve('tests', 'fixtures', 'sample.mp4');
let server: RunningServer;
let tempDir: string;
let base: string;

const get = (urlPath: string, headers: Record<string, string> = {}) => fetch(`${base}${urlPath}`, { headers });

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'couchdrive-test-'));
  const publicDir = path.join(tempDir, 'public');
  await fs.mkdir(publicDir);
  await fs.writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>test page</title>');
  await fs.writeFile(path.join(publicDir, 'test-page.js'), '// script');
  const downloads = await createSpikeFiles(path.join(tempDir, 'files'), sampleMp4);
  const app = createApp({ token, publicDir, downloads, getVideo: () => ({ path: sampleMp4, version: '1' }) });
  server = await startServer(app, '127.0.0.1', 0, 1);
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  await server.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('token', () => {
  it.each(['/', '/?t=wrong', '/spike/info', '/spike/video', '/spike/download/pdf', `/spike/info?t=${token}x`])(
    'refuses %s',
    async (urlPath) => {
      const res = await get(urlPath);
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('Scan the QR code');
    },
  );

  it('opens the test page with the right token', async () => {
    const res = await get(`/?t=${token}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('test page');
  });

  it('serves page assets without the token', async () => {
    expect((await get('/test-page.js')).status).toBe(200);
  });
});

describe('/spike/info', () => {
  it('describes the video and every test download', async () => {
    const info = (await (await get(`/spike/info?t=${token}`)).json()) as SpikeInfo;
    expect(info.video).toEqual({ name: 'sample.mp4', size: (await fs.stat(sampleMp4)).size, version: '1' });
    expect(info.downloads.map((d) => d.id)).toEqual(['mp4', 'pdf', 'zip', 'apk', 'hindi', 'video']);
    expect(info.downloads.find((d) => d.id === 'hindi')?.name).toBe(HINDI_FILE_NAME);
  });
});

describe('/spike/video', () => {
  it('answers a range request with 206 Partial Content', async () => {
    const size = (await fs.stat(sampleMp4)).size;
    const res = await get(`/spike/video?t=${token}`, { Range: 'bytes=1000-1999' });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 1000-1999/${size}`);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });

  it('plays inline rather than downloading', async () => {
    const res = await get(`/spike/video?t=${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-disposition')).toBeNull();
    await res.arrayBuffer();
  });
});

describe('/spike/download', () => {
  it('keeps a Hindi file name (RFC 5987 filename*)', async () => {
    const res = await get(`/spike/download/hindi?t=${token}`);
    expect(res.status).toBe(200);
    const disposition = res.headers.get('content-disposition') ?? '';
    expect(disposition).toMatch(/^attachment;/);
    expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent(HINDI_FILE_NAME)}`);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    await res.arrayBuffer();
  });

  it.each([
    ['mp4', 'video/mp4', 'couchdrive-test.mp4'],
    ['pdf', 'application/pdf', 'couchdrive-test.pdf'],
    ['zip', 'application/zip', 'couchdrive-test.zip'],
    ['apk', 'application/vnd.android.package-archive', 'couchdrive-test.apk'],
  ])('sends the %s file as an attachment', async (id, type, name) => {
    const res = await get(`/spike/download/${id}?t=${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(type);
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename=${name}`);
    await res.arrayBuffer();
  });

  it('can resume a download (range request)', async () => {
    const res = await get(`/spike/download/video?t=${token}`, { Range: 'bytes=100-' });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename=sample.mp4');
    await res.arrayBuffer();
  });

  it('returns 404 for anything else', async () => {
    expect((await get(`/spike/download/..%2F..%2Fwindows?t=${token}`)).status).toBe(404);
    expect((await get(`/spike/download/exe?t=${token}`)).status).toBe(404);
  });
});
