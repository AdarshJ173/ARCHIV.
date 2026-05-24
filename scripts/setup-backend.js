/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT_DIR, 'server');
const VENV_DIR = path.join(SERVER_DIR, '.venv');

function runCommand(command, cwd = ROOT_DIR) {
  console.log(`[Setup:Backend] Executing: ${command}`);
  try {
    execSync(command, { stdio: 'inherit', cwd });
    return true;
  } catch (error) {
    console.error(`[Setup:Backend] Command failed: ${command}\n`, error.message);
    return false;
  }
}

function findPython() {
  const commands = ['python3', 'python', 'py -3'];
  for (const cmd of commands) {
    try {
      const output = execSync(`${cmd} -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      const [major, minor] = output.split('.').map(Number);
      if (major === 3 && minor >= 10) {
        console.log(`[Setup:Backend] Found Python ${output} using command: '${cmd}'`);
        return cmd;
      }
    } catch {
      // Command failed, try next
    }
  }
  return null;
}

function setup() {
  console.log('=== Ultimate RAG Engine — Python Backend Setup ===');

  // 1. Find Python
  const pythonCmd = findPython();
  if (!pythonCmd) {
    console.error('[Setup:Backend] ERROR: Python 3.10 or higher not found. Please install Python 3.10+ and add it to your PATH.');
    process.exit(1);
  }

  // 2. Create Venv if not exists
  if (!fs.existsSync(VENV_DIR)) {
    console.log('[Setup:Backend] Creating virtual environment in server/.venv...');
    const created = runCommand(`${pythonCmd} -m venv .venv`, SERVER_DIR);
    if (!created) {
      console.error('[Setup:Backend] ERROR: Failed to create virtual environment.');
      process.exit(1);
    }
  } else {
    console.log('[Setup:Backend] Virtual environment already exists in server/.venv.');
  }

  // 3. Determine Executable Paths
  const isWindows = process.platform === 'win32';
  const pipPath = isWindows 
    ? path.join(VENV_DIR, 'Scripts', 'pip.exe')
    : path.join(VENV_DIR, 'bin', 'pip');
  const pythonBinPath = isWindows
    ? path.join(VENV_DIR, 'Scripts', 'python.exe')
    : path.join(VENV_DIR, 'bin', 'python');

  // 4. Upgrade pip
  console.log('[Setup:Backend] Upgrading pip...');
  runCommand(`"${pipPath}" install --upgrade pip`);

  // 5. Check for GPU acceleration
  console.log('[Setup:Backend] Checking for GPU availability...');
  let hasGpu = false;
  try {
    const gpuCheckCmd = `"${pythonCmd}" -c "import torch; print(torch.cuda.is_available())"`; // eslint-disable-line @typescript-eslint/no-unused-vars
    // We try to run with outer python first (if torch installed there) or just assume GPU check during install
    execSync('nvidia-smi', { stdio: 'ignore' });
    console.log('[Setup:Backend] NVIDIA GPU detected. GPU acceleration will be loaded automatically.');
    hasGpu = true; // eslint-disable-line @typescript-eslint/no-unused-vars
  } catch {
    console.log('[Setup:Backend] No NVIDIA GPU detected or nvidia-smi not available. Using CPU fallback.');
  }

  // 6. Install requirements
  console.log('[Setup:Backend] Installing requirements from server/requirements.txt...');
  const reqPath = path.join(SERVER_DIR, 'requirements.txt');
  const installed = runCommand(`"${pipPath}" install -r "${reqPath}"`);
  if (!installed) {
    console.error('[Setup:Backend] ERROR: Failed to install Python dependencies.');
    process.exit(1);
  }

  // 7. Verify PyTorch CUDA in venv
  try {
    console.log('[Setup:Backend] Verifying PyTorch hardware compatibility inside virtual environment...');
    const result = execSync(`"${pythonBinPath}" -c "import torch; print(f'PyTorch: {torch.__version__} | CUDA: {torch.cuda.is_available()}')"`, { encoding: 'utf8' }).trim();
    console.log(`[Setup:Backend] Verification output: ${result}`);
  } catch (e) {
    console.warn('[Setup:Backend] Warning: Could not verify PyTorch installation in virtual environment.', e.message);
  }

  // 8. Download NLTK data pre-emptively
  console.log('[Setup:Backend] Downloading NLTK tokenizer and stopword databases...');
  runCommand(`"${pythonBinPath}" -m nltk.downloader punkt stopwords`);

  console.log('\n=== Backend setup completed successfully! ===');
  console.log('You can now run "npm run dev" to start both the Next.js frontend and FastAPI backend.');
}

setup();
