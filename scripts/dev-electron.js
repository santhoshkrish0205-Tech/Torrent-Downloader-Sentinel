// scripts/dev-electron.js
const http = require('http');
const { spawn } = require('child_process');

function checkVite() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:5173', (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function run() {
  // 1. Compile Electron TypeScript main process
  const tsc = spawn('npm', ['run', 'build:electron'], { stdio: 'inherit' });
  const tscExit = await new Promise((res) => tsc.on('exit', res));
  if (tscExit !== 0) {
    process.exit(tscExit);
  }

  // 2. Check if Vite dev server is already running on localhost:5173
  const isViteRunning = await checkVite();

  if (isViteRunning) {
    console.log('[Sentinel] Vite dev server detected on http://localhost:5173. Launching Electron...');
    const electron = spawn('npx', ['cross-env', 'NODE_ENV=development', 'electron', '.'], {
      stdio: 'inherit',
    });
    electron.on('exit', (code) => process.exit(code || 0));
  } else {
    console.log('[Sentinel] Launching full dev stack (Vite + Electron)...');
    const concurrently = spawn(
      'npx',
      [
        'concurrently',
        '-k',
        '-n',
        'VITE,ELECTRON',
        '-c',
        'blue,yellow',
        'npm run dev:vite',
        'npm run dev:electron',
      ],
      { stdio: 'inherit' }
    );
    concurrently.on('exit', (code) => process.exit(code || 0));
  }
}

run();
