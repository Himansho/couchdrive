import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

// Launches the real desktop app on 127.0.0.1 (no Windows Firewall prompt), with its own
// settings folder, and checks that both QR links open the phone test page.
// COUCHDRIVE_EXE=release/win-unpacked/Couchdrive.exe runs the same test on the packaged app.
test('desktop window shows padlock and simple links that both work', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'couchdrive-e2e-'));
  const exe = process.env.COUCHDRIVE_EXE;
  const app = await electron.launch({
    ...(exe ? { executablePath: path.resolve(exe), args: [] } : { args: ['.'] }),
    env: { ...process.env, COUCHDRIVE_HOST: '127.0.0.1', COUCHDRIVE_USER_DATA: userData },
  });
  try {
    const window = await app.firstWindow();
    await expect(window.locator('#sharing')).toBeVisible();
    await expect(window.locator('#qr')).toHaveAttribute('src', /^data:image\/png;base64,/);

    // Padlock link first.
    await expect(window.locator('[data-link="https"]')).toHaveAttribute('aria-selected', 'true');
    const httpsUrl = (await window.locator('#url').textContent()) ?? '';
    expect(httpsUrl).toMatch(/^https:\/\/127\.0\.0\.1:\d+\/\?t=[\w-]{22}$/);
    expect(await getStatus(httpsUrl)).toBe(200);
    await window.screenshot({ path: 'test-results/desktop-window.png' });

    await window.locator('[data-link="http"]').click();
    await expect(window.locator('#url')).toHaveText(/^http:\/\//);
    const httpUrl = (await window.locator('#url').textContent()) ?? '';
    expect(httpUrl.split('?t=')[1]).toBe(httpsUrl.split('?t=')[1]);
    expect((await fetch(httpUrl)).status).toBe(200);
    const info = (await (await fetch(httpUrl.replace('/?', '/spike/info?'))).json()) as { downloads: unknown[] };
    expect(info.downloads).toHaveLength(6);
    const video = await fetch(httpUrl.replace('/?', '/spike/video?'), { headers: { Range: 'bytes=0-99' } });
    expect(video.status).toBe(206);
    expect((await video.arrayBuffer()).byteLength).toBe(100);
    const hindi = await fetch(httpUrl.replace('/?', '/spike/download/hindi?'));
    expect(hindi.status).toBe(200);
    expect((await hindi.arrayBuffer()).byteLength).toBeGreaterThan(500);

    // The choice is remembered.
    expect(JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'))).toEqual({ link: 'http' });
  } finally {
    await app.close();
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

/** The certificate is self-signed, like on the phone; tests/certificate.test.ts checks it properly. */
function getStatus(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { rejectUnauthorized: false }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
      .on('error', reject);
  });
}
