// Padlock (HTTPS) link: a certificate this laptop makes for itself. Chrome warns the
// first time; after "Proceed" it remembers that certificate for that address, so the
// same one is reused and replaced only when the laptop's address isn't on it yet.
import 'reflect-metadata'; // @peculiar/x509 needs it loaded first
import crypto, { webcrypto } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as x509 from '@peculiar/x509';

export interface Certificate {
  /** PEM private key. */
  key: string;
  /** PEM certificate. */
  cert: string;
  /** Laptop addresses the certificate is valid for, newest first. */
  ips: string[];
  notAfter: string;
}

const DAY = 24 * 60 * 60 * 1000;
const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
/** Home WiFi, the phone's hotspot, a friend's WiFi…: keep a few, so switching back doesn't re-warn. */
const MAX_IPS = 8;
/** Chrome's limit for certificate lifetimes. */
const VALID_DAYS = 397;
const RENEW_WHEN_DAYS_LEFT = 30;

/** Reuses the saved certificate in `dir` when it covers `ip`; otherwise makes and saves a new one. */
export async function loadOrCreateCertificate(dir: string, ip: string, now = new Date()): Promise<Certificate> {
  const file = path.join(dir, 'https-certificate.json');
  const saved = await readSaved(file);
  const fresh = saved && new Date(saved.notAfter).getTime() - now.getTime() > RENEW_WHEN_DAYS_LEFT * DAY;
  if (saved && fresh && saved.ips.includes(ip)) return saved;

  const ips = [ip, ...(saved?.ips ?? []).filter((old) => old !== ip)].slice(0, MAX_IPS);
  const created = await createCertificate(ips, now);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(created, null, 2));
  return created;
}

export async function createCertificate(ips: string[], now = new Date()): Promise<Certificate> {
  const keys = (await webcrypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify'])) as webcrypto.CryptoKeyPair;
  const notAfter = new Date(now.getTime() + VALID_DAYS * DAY);
  const cert = await x509.X509CertificateGenerator.createSelfSigned(
    {
      name: 'CN=Couchdrive on this laptop',
      // A day early, in case the phone's clock is a little behind.
      notBefore: new Date(now.getTime() - DAY),
      notAfter,
      keys,
      signingAlgorithm: ALGORITHM,
      extensions: [
        new x509.BasicConstraintsExtension(false, undefined, true),
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
        new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
        new x509.SubjectAlternativeNameExtension(ips.map((value) => ({ type: 'ip', value }))),
      ],
    },
    webcrypto as Crypto,
  );
  return {
    key: crypto.KeyObject.from(keys.privateKey).export({ type: 'pkcs8', format: 'pem' }) as string,
    cert: cert.toString('pem'),
    ips,
    notAfter: notAfter.toISOString(),
  };
}

async function readSaved(file: string): Promise<Certificate | null> {
  try {
    const saved = JSON.parse(await fs.readFile(file, 'utf8')) as Certificate;
    return saved.key && saved.cert && Array.isArray(saved.ips) ? saved : null;
  } catch {
    return null;
  }
}
