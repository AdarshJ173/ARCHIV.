/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('=== Starting Ultimate RAG Dev Environment ===');
console.log('[DevServer] Booting Next.js frontend and Python FastAPI backend...\n');

const isWindows = process.platform === 'win32';
// On Windows, Next.js can be spawned via npx.cmd or next.cmd, using shell: true handles it
const frontend = spawn('npx', ['next', 'dev'], {
  cwd: ROOT_DIR,
  shell: true,
  env: { ...process.env, FORCE_COLOR: '3', NODE_NO_WARNINGS: '1' }
});

const backend = spawn('node', [path.join(ROOT_DIR, 'scripts', 'start-backend.js')], {
  cwd: ROOT_DIR,
  shell: true,
  env: { ...process.env, NODE_NO_WARNINGS: '1' }
});

// Prefix and print frontend logs
frontend.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.log(`[Next.js] ${line.trim()}`);
    }
  }
});

frontend.stderr.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.error(`[Next.js:Error] ${line.trim()}`);
    }
  }
});

// Prefix and print backend logs
backend.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.log(line.trim());
    }
  }
});

backend.stderr.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.error(line.trim());
    }
  }
});

// Handle termination cleanly
function killProcesses() {
  console.log('\n[DevServer] Shutting down all servers...');
  try {
    if (isWindows) {
      // On Windows, child processes spawned under shell: true are in a process tree.
      // Taskkill ensures the entire process tree is terminated.
      spawn('taskkill', ['/pid', frontend.pid, '/f', '/t'], { shell: true });
      spawn('taskkill', ['/pid', backend.pid, '/f', '/t'], { shell: true });
    } else {
      frontend.kill('SIGINT');
      backend.kill('SIGINT');
    }
  } catch {
    // Ignore cleanup errors
  }
  process.exit();
}

process.on('SIGINT', killProcesses);
process.on('SIGTERM', killProcesses);
process.on('exit', killProcesses);
