/**
 * electron/engine-manager.ts
 * Spawns and manages the Python FastAPI engine subprocess.
 * Reads the port from the engine's stdout and makes it available.
 */
import { ChildProcess, spawn } from "child_process";
import { app } from "electron";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const isDev = process.env.NODE_ENV === "development";

export const ENGINE_TOKEN = process.env.SENTINEL_ENGINE_TOKEN ?? crypto.randomBytes(24).toString("hex");

let engineProcess: ChildProcess | null = null;
let enginePort: number | null = null;
let portResolve: ((port: number) => void) | null = null;
let portReject: ((err: Error) => void) | null = null;

const portPromise = new Promise<number>((resolve, reject) => {
  portResolve = resolve;
  portReject = reject;
});

export interface EngineStatus {
  running: boolean;
  port: number | null;
  error: string | null;
  resolvedPath: string | null;
}

let engineStatus: EngineStatus = {
  running: false,
  port: null,
  error: null,
  resolvedPath: null,
};

export function getEngineStatus(): EngineStatus {
  return { ...engineStatus };
}

let logStream: fs.WriteStream | null = null;
function writeToEngineLog(text: string): void {
  try {
    if (!logStream) {
      const logDir = path.join(app.getPath("userData"), "logs");
      fs.mkdirSync(logDir, { recursive: true });
      logStream = fs.createWriteStream(path.join(logDir, "engine.log"), { flags: "a" });
    }
    logStream.write(`[${new Date().toISOString()}] ${text}\n`);
  } catch {}
}

export function getEnginePort(): Promise<number> {
  return portPromise;
}

export function startEngine(): void {
  const resolved = resolveEngineCommand();
  if (!resolved) {
    const errMsg = "Torrent engine executable (engine.exe) not found. Packaged build is missing engine bundle. Install the full release (~195 MB) to run the torrent engine.";
    console.warn(`[EngineManager] ${errMsg}`);
    writeToEngineLog(`[ERROR] ${errMsg}`);
    engineStatus.error = errMsg;
    if (portReject) {
      portReject(new Error(errMsg));
    }
    return;
  }

  const { cmd, args, opts } = resolved;
  engineStatus.resolvedPath = cmd;
  console.log("[EngineManager] Starting engine:", cmd, args.join(" "));
  writeToEngineLog(`[INFO] Starting engine: ${cmd} ${args.join(" ")}`);

  try {
    engineProcess = spawn(cmd, args, {
      ...opts,
      windowsHide: true,
      env: {
        ...process.env,
        SENTINEL_ENGINE_PORT: "54321",
        SENTINEL_ENGINE_TOKEN: ENGINE_TOKEN,
        SENTINEL_APP_DATA: app.getPath("userData"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Handle spawn-level failures (e.g. ENOENT, EACCES) to prevent uncaught main process crashes
    engineProcess.on("error", (err) => {
      console.error("[EngineManager] Subprocess spawn error:", err.message);
      writeToEngineLog(`[ERROR] Subprocess spawn error: ${err.message}`);
      engineStatus.running = false;
      engineStatus.error = `Failed to launch engine binary: ${err.message}`;
      engineProcess = null;
      if (portReject && enginePort === null) {
        portReject(err);
      }
    });

    // Read port from stdout
    engineProcess.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      writeToEngineLog(`[STDOUT] ${text.trimEnd()}`);
      const match = text.match(/SENTINEL_ENGINE_PORT:(\d+)/);
      if (match && portResolve) {
        enginePort = parseInt(match[1], 10);
        engineStatus.running = true;
        engineStatus.port = enginePort;
        engineStatus.error = null;
        console.log("[EngineManager] Engine port discovered:", enginePort);
        portResolve(enginePort);
      }
      if (isDev) process.stdout.write(`[ENGINE] ${text}`);
    });

    engineProcess.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      writeToEngineLog(`[STDERR] ${text.trimEnd()}`);
      if (isDev) process.stderr.write(`[ENGINE ERR] ${text}`);
    });

    engineProcess.on("exit", (code, signal) => {
      console.warn("[EngineManager] Engine exited:", code, signal);
      writeToEngineLog(`[EXIT] Engine process exited with code ${code}, signal ${signal}`);
      engineStatus.running = false;
      if (code !== 0 && code !== null) {
        engineStatus.error = `Engine process exited unexpectedly with code ${code}. Check engine.log for details.`;
      }
      engineProcess = null;
      if (portReject && enginePort === null) {
        portReject(new Error(`Engine exited before reporting port (code=${code})`));
      }
    });

    // Timeout if engine never reports port
    setTimeout(() => {
      if (enginePort === null && portReject) {
        const timeoutErr = new Error("Engine port discovery timed out after 15s");
        engineStatus.error = timeoutErr.message;
        writeToEngineLog(`[ERROR] ${timeoutErr.message}`);
        portReject(timeoutErr);
      }
    }, 15_000);
  } catch (err: any) {
    console.error("[EngineManager] Unexpected exception while spawning engine:", err);
    engineStatus.error = `Exception launching engine: ${err.message || err}`;
    writeToEngineLog(`[ERROR] Exception spawning engine: ${err.message || err}`);
    if (portReject && enginePort === null) {
      portReject(err);
    }
  }
}

export function stopEngine(): void {
  if (engineProcess) {
    console.log("[EngineManager] Stopping engine …");
    engineProcess.kill("SIGTERM");
    engineProcess = null;
  }
}

function resolveEngineCommand(): { cmd: string; args: string[]; opts: object } | null {
  if (isDev) {
    // Dev: check project .venv on Linux and Windows, else system python
    const venvPyLinux = path.join(app.getAppPath(), ".venv", "bin", "python3");
    const venvPyWin = path.join(app.getAppPath(), ".venv", "Scripts", "python.exe");
    let py = "python3";
    if (fs.existsSync(venvPyLinux)) {
      py = venvPyLinux;
    } else if (fs.existsSync(venvPyWin)) {
      py = venvPyWin;
    } else if (process.platform === "win32") {
      py = "python";
    }
    return {
      cmd: py,
      args: [path.join(app.getAppPath(), "engine", "main.py"), "--dev"],
      opts: { cwd: path.join(app.getAppPath()) },
    };
  }

  // Production: bundled PyInstaller executable
  const exeName = process.platform === "win32" ? "engine.exe" : "engine";

  // Check multiple candidate locations across packaging variations
  const candidatePaths = [
    path.join(process.resourcesPath, "engine", exeName),
    path.join(process.resourcesPath, "engine", "engine", exeName),
    path.join(process.resourcesPath, exeName),
    path.join(app.getAppPath(), "engine", "dist", "engine", exeName),
    path.join(app.getAppPath(), "engine", "dist", exeName),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      console.log(`[EngineManager] Resolved engine binary at: ${candidate}`);
      return {
        cmd: candidate,
        args: [],
        opts: { cwd: path.dirname(candidate) },
      };
    }
  }

  console.warn(`[EngineManager] Engine binary not found in any standard path:`, candidatePaths);
  return null;
}
