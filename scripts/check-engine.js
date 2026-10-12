const fs = require("fs");
const path = require("path");

const engineDir = path.join(__dirname, "..", "engine", "dist", "engine");
fs.mkdirSync(engineDir, { recursive: true });

const isWinTarget = process.argv.includes("--win") || process.platform === "win32";
const exeName = isWinTarget ? "engine.exe" : "engine";
const exePath = path.join(engineDir, exeName);

if (!fs.existsSync(exePath)) {
  console.log("\n" + "=".repeat(72));
  console.log(`[INFO] Engine executable not found at: ${exePath}`);
  console.log("Packaging will proceed with UI assets.");
  console.log("NOTE: Because Linux cannot cross-compile Windows C++ libtorrent binaries,");
  console.log("the full Windows installer (~195 MB) is automatically built via GitHub Actions:");
  console.log("https://github.com/santhoshkrish0205-Tech/Torrent-Downloader-Sentinel/actions");
  console.log("=".repeat(72) + "\n");
} else {
  console.log(`[OK] Bundling engine binary found at: ${exePath}`);
}
