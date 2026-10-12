"""
engine/config.py
Configuration and environment management for the Sentinel engine.
"""
import os
import sys
import socket
import tempfile
from pathlib import Path

# ── Runtime mode ──────────────────────────────────────────────────────────────
DEV_MODE: bool = "--dev" in sys.argv

# ── Port selection ────────────────────────────────────────────────────────────
def _is_port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False

def _find_free_port() -> int:
    """Bind to port 0 and let the OS assign a free port, then release it."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def _determine_port() -> int:
    env_port = int(os.environ.get("SENTINEL_ENGINE_PORT", 0))
    if env_port > 0 and _is_port_free(env_port):
        return env_port
    if _is_port_free(54321):
        return 54321
    return _find_free_port()

ENGINE_PORT: int = _determine_port()
ENGINE_HOST: str = "127.0.0.1"

# Shared secret token sent in X-Sentinel-Token header.
# Electron generates this at startup and passes it via env var.
ENGINE_TOKEN: str = os.environ.get("SENTINEL_ENGINE_TOKEN", "dev-token-insecure")

# ── Paths ─────────────────────────────────────────────────────────────────────
if getattr(sys, "frozen", False):
    # PyInstaller bundle — resources are next to the executable.
    _BASE = Path(sys.executable).parent
else:
    _BASE = Path(__file__).parent.parent

APP_DATA_DIR: Path = Path(
    os.environ.get(
        "SENTINEL_APP_DATA",
        str(Path.home() / ".sentinel"),
    )
)
APP_DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH: Path = APP_DATA_DIR / "sentinel.db"
RESUME_DIR: Path = APP_DATA_DIR / "resume"
RESUME_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR: Path = APP_DATA_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# Default download directory
DEFAULT_DOWNLOAD_DIR: Path = Path.home() / "Downloads"
DEFAULT_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ── libtorrent session settings ───────────────────────────────────────────────
# These are tunable; some exposed via the Settings API.
LT_SETTINGS: dict = {
    "enable_dht":         True,
    "enable_lsd":         True,
    "enable_natpmp":      True,
    "enable_upnp":        True,
    "connections_limit":  200,
    # Cache: 256 MB in 16 KB blocks
    "cache_size":         16384,
    "listen_interfaces":  "0.0.0.0:6881",
    "alert_mask":         0x7FFFFFFF,  # all alerts (filtered in session_manager)
}

# ── WebSocket push interval ───────────────────────────────────────────────────
STATS_PUSH_INTERVAL_S: float = 0.5  # 500 ms
