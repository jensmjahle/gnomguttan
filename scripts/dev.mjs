import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const serverEntry = path.join(rootDir, 'server/index.js');
const children = new Set();
let shuttingDown = false;

function start(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
    cwd: rootDir,
  });

  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);

    if (shuttingDown) {
      return;
    }

    if (signal) {
      terminate(1, signal);
      return;
    }

    terminate(typeof code === 'number' ? code || 0 : 0);
    if (code !== 0) {
      console.error(`[dev] ${name} exited with code ${code ?? 'unknown'}`);
    }
  });

  child.on('error', (error) => {
    if (!shuttingDown) {
      console.error(`[dev] Failed to start ${name}`, error);
      terminate(1);
    }
  });

  return child;
}

function terminate(code = 0, signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    child.kill(signal ?? 'SIGTERM');
  }

  setTimeout(() => process.exit(code), 300).unref();
}

process.on('SIGINT', () => terminate(0, 'SIGINT'));
process.on('SIGTERM', () => terminate(0, 'SIGTERM'));

start('server', process.execPath, [serverEntry]);

setTimeout(() => {
  if (!shuttingDown) {
    start('client', process.execPath, [viteBin, '--host', '0.0.0.0']);
  }
}, 250);
