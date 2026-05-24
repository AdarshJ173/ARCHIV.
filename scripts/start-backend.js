/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT_DIR, 'server');
const VENV_DIR = path.join(SERVER_DIR, '.venv');

function start() {
  console.log('[Start:Backend] Checking Python backend environment...');

  const isWindows = process.platform === 'win32';
  const pythonPath = isWindows
    ? path.join(VENV_DIR, 'Scripts', 'python.exe')
    : path.join(VENV_DIR, 'bin', 'python');

  // Check if virtual environment is fully set up
  let venvOk = false;
  if (fs.existsSync(VENV_DIR) && fs.existsSync(pythonPath)) {
    try {
      execSync(`"${pythonPath}" -c "import uvicorn, fastapi, sentence_transformers, faiss, torch"`, { 
        stdio: 'ignore',
        env: { ...process.env, NODE_NO_WARNINGS: '1' }
      });
      venvOk = true;
    } catch {
      console.log('[Start:Backend] Virtual environment is incomplete or corrupted.');
    }
  }

  // Run setup/repair if venv is missing or incomplete
  if (!venvOk) {
    console.log('[Start:Backend] Bootstrapping backend setup/repair (installing ML dependencies)...');
    try {
      execSync('node scripts/setup-backend.js', { stdio: 'inherit', cwd: ROOT_DIR });
    } catch {
      console.error('[Start:Backend] Setup failed. Cannot start backend.');
      process.exit(1);
    }
  }

  console.log('[Start:Backend] Launching FastAPI server on port 8000...');

  // 3. Spawn Uvicorn process
  // We run uvicorn through python -m uvicorn to ensure it uses venv imports perfectly!
  const backendProcess = spawn(
    pythonPath, 
    ['-m', 'uvicorn', 'server.main:app', '--host', '127.0.0.1', '--port', '8000', '--reload', '--no-access-log'], 
    {
      cwd: ROOT_DIR,
      shell: true,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    }
  );

  // 4. Handle process outputs and prefix them
  backendProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        console.log(`[Backend] ${trimmed}`);
      }
    }
  });

  backendProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        // Only classify as Error if it contains tracebacks or explicit error tags
        const upper = trimmed.toUpperCase();
        if (upper.includes('ERROR') || upper.includes('CRITICAL') || trimmed.includes('Traceback') || upper.includes('EXCEPTION:')) {
          console.error(`[Backend:Error] ${trimmed}`);
        } else {
          console.log(`[Backend] ${trimmed}`);
        }
      }
    }
  });

  backendProcess.on('close', (code) => {
    console.log(`[Backend] FastAPI server exited with code ${code}`);
  });

  // Handle process termination cleanly
  process.on('SIGINT', () => {
    backendProcess.kill('SIGINT');
    process.exit();
  });

  process.on('SIGTERM', () => {
    backendProcess.kill('SIGTERM');
    process.exit();
  });
}

start();
