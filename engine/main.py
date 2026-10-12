"""
engine/main.py
FastAPI application entry point for the Sentinel torrent engine.

On startup:
  1. Initialises the SQLite database.
  2. Starts the libtorrent session.
  3. Restores previously saved torrents from the database.
  4. Prints "SENTINEL_ENGINE_PORT:<port>" to stdout so Electron can discover the port.
  5. Starts uvicorn.

On shutdown:
  1. Pauses all torrents and saves fast-resume data.
"""
from __future__ import annotations
import asyncio
import sys
from pathlib import Path
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import ENGINE_HOST, ENGINE_PORT, ENGINE_TOKEN, DEV_MODE
from logger import log
from state_store import init_db, get_all_torrents, get_setting
from session_manager import session_manager
from schemas import HealthResponse

try:
    import libtorrent as lt
except ImportError:
    lt = None

from routers import torrents as torrents_router
from routers import stats    as stats_router
from routers import settings as settings_router


# ── Startup / shutdown ────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    session_manager.start()
    await _restore_torrents()

    # Signal port to Electron (stdout is read by engine-manager.ts)
    print(f"SENTINEL_ENGINE_PORT:{ENGINE_PORT}", flush=True)
    log.info("Engine ready on %s:%s (dev=%s)", ENGINE_HOST, ENGINE_PORT, DEV_MODE)

    yield  # ← application runs here

    # Shutdown
    session_manager.stop()
    log.info("Engine shutdown complete.")


async def _restore_torrents() -> None:
    """Re-add all torrents saved in SQLite to the libtorrent session."""
    rows = await get_all_torrents()
    default_path = await get_setting("default_save_path", "")
    for row in rows:
        ih        = row["hash"]
        save_path = sanitise_save_path(row["save_path"] or default_path)
        try:
            if row.get("torrent_data"):
                restored_ih = await session_manager.add_torrent_file(row["torrent_data"], save_path)
            elif row.get("magnet_uri"):
                restored_ih = await session_manager.add_magnet(row["magnet_uri"], save_path)
            else:
                log.warning("No restore data for %s — skipping.", ih)
                continue
            log.info("Restored torrent %s", restored_ih)
        except Exception as exc:
            log.error("Failed to restore torrent %s: %s", ih, exc)


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Sentinel Engine",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if DEV_MODE else None,
    redoc_url=None,
)

# CORS: only allow renderer in dev (Vite port).  In production the renderer is
# loaded from a file:// URL, so Electron's fetch goes directly to the engine.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"] if DEV_MODE else [],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Token auth middleware ─────────────────────────────────────────────────────
@app.middleware("http")
async def verify_token(request: Request, call_next):
    # Skip auth for WebSocket upgrade requests and OPTIONS preflight.
    if request.method == "OPTIONS" or request.url.path.startswith("/ws/"):
        return await call_next(request)
    # In dev mode skip token check for easier curl debugging.
    if not DEV_MODE:
        token = request.headers.get("X-Sentinel-Token", "")
        if token != ENGINE_TOKEN:
            raise HTTPException(status_code=401, detail="Unauthorized")
    return await call_next(request)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse)
async def health():
    version_str = getattr(lt, "version", "preview-simulated") if lt else "preview-simulated"
    return HealthResponse(version=version_str)


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(torrents_router.router)
app.include_router(stats_router.router)
app.include_router(settings_router.router)

# ── Web Application UI Mount ──────────────────────────────────────────────────
# Serves the React web app directly when accessed from any browser
from fastapi.staticfiles import StaticFiles
dist_path = Path(__file__).parent.parent / "renderer" / "dist"
if dist_path.exists():
    app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="web_ui")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        app,
        host=ENGINE_HOST,
        port=ENGINE_PORT,
        log_level="debug" if DEV_MODE else "warning",
        access_log=DEV_MODE,
    )
