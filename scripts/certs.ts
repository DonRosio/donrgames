// Generates a self-signed certificate for `npm run dev:lan` (HTTPS on the local network).
// Browsers show a warning to accept once per device; the certificate is never used in production.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';

const certDir = path.resolve(import.meta.dirname, '../.certs');
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net !== undefined && net.family === 'IPv4')
  .map((net) => net!.address);
const subjectAltName = ['DNS:localhost', ...addresses.map((ip) => `IP:${ip}`)].join(',');

mkdirSync(certDir, { recursive: true });
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-sha256',
    '-days',
    '825',
    '-subj',
    '/CN=mini-jeux (dev)',
    '-addext',
    `subjectAltName=${subjectAltName}`,
    '-keyout',
    path.join(certDir, 'dev-key.pem'),
    '-out',
    path.join(certDir, 'dev-cert.pem'),
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);
console.log(`Certificat de développement créé dans .certs/ pour : ${subjectAltName}`);
