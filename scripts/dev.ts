// Runs the Node server and the Vite dev server together, with prefixed output.
// --lan: HTTPS with a self-signed certificate, reachable from other devices on the network.
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const lan = process.argv.includes('--lan');

if (lan && !existsSync(path.join(root, '.certs', 'dev-cert.pem'))) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'certs.ts')], {
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const children: ChildProcess[] = [];
let stopping = false;

function run(label: string, color: number, workspace: string, env: Record<string, string> = {}) {
  const child = spawn('npm', ['run', 'dev', '-w', workspace], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `\x1b[${color}m[${label}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let pending = '';
    stream.on('data', (chunk: Buffer) => {
      const lines = (pending + chunk.toString()).split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) process.stdout.write(prefix + line + '\n');
    });
  }
  child.on('exit', (code) => {
    if (!stopping) {
      console.log(`${prefix}arrêté (code ${code ?? '?'}), arrêt de l'ensemble.`);
      stop(code ?? 1);
    }
  });
  children.push(child);
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

// The Vite proxy targets 127.0.0.1:3000: the server address is fixed in development, whatever
// HOST/PORT the environment may contain (some tools export PORT for the front-end server).
run('serveur', 36, '@mini-jeux/server', { HOST: '127.0.0.1', PORT: '3000' });
run('client', 35, '@mini-jeux/client', lan ? { DEV_LAN: '1' } : {});
