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

export function getEnginePort(): Promise<number> {
  return portPromise;
}

export function startEngine(): void {
  const resolved = resolveEngineCommand();
  if (!resolved) {
    const errMsg = "[EngineManager] Torrent engine executable not found. Running in UI preview mode.";
    console.warn(errMsg);
    if (portReject) {
      portReject(new Error(errMsg));
    }
    return;
  }

  const { cmd, args, opts } = resolved;
  console.log("[EngineManager] Starting engine:", cmd, args.join(" "));

  try {
    engineProcess = spawn(cmd, args, {
      ...opts,
      windowsHide: true,
      env: {
        ...process.env,
        SENTINEL_ENGINE_TOKEN: ENGINE_TOKEN,
        SENTINEL_APP_DATA: app.getPath("userData"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Handle spawn-level failures (e.g. ENOENT, EACCES) to prevent uncaught main process crashes
    engineProcess.on("error", (err) => {
      console.error("[EngineManager] Subprocess spawn error:", err.message);
      engineProcess = null;
      if (portReject && enginePort === null) {
        portReject(err);
      }
    });

    // Read port from stdout
    engineProcess.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/SENTINEL_ENGINE_PORT:(\d+)/);
      if (match && portResolve) {
        enginePort = parseInt(match[1], 10);
        console.log("[EngineManager] Engine port discovered:", enginePort);
        portResolve(enginePort);
      }
      if (isDev) process.stdout.write(`[ENGINE] ${text}`);
    });

    engineProcess.stderr?.on("data", (chunk: Buffer) => {
      if (isDev) process.stderr.write(`[ENGINE ERR] ${chunk.toString()}`);
    });

    engineProcess.on("exit", (code, signal) => {
      console.warn("[EngineManager] Engine exited:", code, signal);
      engineProcess = null;
      if (portReject && enginePort === null) {
        portReject(new Error(`Engine exited before reporting port (code=${code})`));
      }
    });

    // Timeout if engine never reports port
    setTimeout(() => {
      if (enginePort === null && portReject) {
        portReject(new Error("Engine port discovery timed out after 15s"));
      }
    }, 15_000);
  } catch (err: any) {
    console.error("[EngineManager] Unexpected exception while spawning engine:", err);
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
