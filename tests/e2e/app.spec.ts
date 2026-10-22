import { _electron as electron, expect, test } from '@playwright/test';

// Launches the real desktop app on 127.0.0.1 (no Windows Firewall prompt) and
// checks that its QR link opens the phone test page.
test('desktop window shows a QR code whose link works', async () => {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, COUCHDRIVE_HOST: '127.0.0.1' } });
  try {
    const window = await app.firstWindow();
    await expect(window.locator('#sharing')).toBeVisible();
    await expect(window.locator('#qr')).toHaveAttribute('src', /^data:image\/png;base64,/);

    const url = (await window.locator('#url').textContent()) ?? '';
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?t=[\w-]{22}$/);
    await window.screenshot({ path: 'test-results/desktop-window.png' });

    const page = await fetch(url);
    expect(page.status).toBe(200);
    const info = (await (await fetch(url.replace('/?', '/spike/info?'))).json()) as { downloads: unknown[] };
    expect(info.downloads).toHaveLength(6);
  } finally {
    await app.close();
  }
});
