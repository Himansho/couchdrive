import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createCertificate, loadOrCreateCertificate } from '../server/certificate';

const tempDirs: string[] = [];
const tempDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'couchdrive-cert-'));
  tempDirs.push(dir);
  return dir;
};

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('createCertificate', () => {
  it('makes a server certificate for the laptop addresses, matching its key', async () => {
    const { key, cert, notAfter } = await createCertificate(['192.168.31.106', '10.20.30.40']);
    const x509 = new crypto.X509Certificate(cert);
    expect(x509.subjectAltName).toBe('IP Address:192.168.31.106, IP Address:10.20.30.40');
    expect(x509.checkIP('192.168.31.106')).toBe('192.168.31.106');
    expect(x509.ca).toBe(false);
    expect(x509.checkPrivateKey(crypto.createPrivateKey(key))).toBe(true);
    const days = (new Date(notAfter).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(396);
    expect(days).toBeLessThanOrEqual(397);
  });
});

describe('loadOrCreateCertificate', () => {
  it('reuses the saved certificate for a known address, so Chrome only warns once', async () => {
    const dir = await tempDir();
    const first = await loadOrCreateCertificate(dir, '192.168.31.106');
    expect((await loadOrCreateCertificate(dir, '192.168.31.106')).cert).toBe(first.cert);
  });

  it('adds a new address and keeps the old ones', async () => {
    const dir = await tempDir();
    const home = await loadOrCreateCertificate(dir, '192.168.31.106');
    const hotspot = await loadOrCreateCertificate(dir, '10.163.48.21');
    expect(hotspot.cert).not.toBe(home.cert);
    expect(hotspot.ips).toEqual(['10.163.48.21', '192.168.31.106']);
    // Back on home WiFi: the hotspot certificate already covers it.
    expect((await loadOrCreateCertificate(dir, '192.168.31.106')).cert).toBe(hotspot.cert);
  });

  it('renews a certificate that is about to expire', async () => {
    const dir = await tempDir();
    const old = await loadOrCreateCertificate(dir, '192.168.31.106', new Date(Date.now() - 380 * 86_400_000));
    expect((await loadOrCreateCertificate(dir, '192.168.31.106')).cert).not.toBe(old.cert);
  });
});
