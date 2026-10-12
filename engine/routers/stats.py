"""
engine/routers/stats.py
WebSocket endpoint that pushes live stats every 500 ms.
Also exposes a REST fallback for polling clients.
"""
from __future__ import annotations
import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from session_manager import session_manager
from config import STATS_PUSH_INTERVAL_S
from logger import log

router = APIRouter(tags=["stats"])


@router.get("/stats")
async def get_stats():
    """REST fallback: current session stats snapshot."""
    return session_manager.get_session_stats()


@router.websocket("/ws/stats")
async def ws_stats(ws: WebSocket):
    """
    Push torrent list + session stats every STATS_PUSH_INTERVAL_S seconds.
    Client sends any message to request an immediate refresh.
    """
    await ws.accept()
    log.debug("WebSocket client connected")
    try:
        while True:
            torrents = session_manager.get_all_torrent_info()
            stats    = session_manager.get_session_stats()

            payload = {
                "torrents": [t.model_dump() for t in torrents],
                "stats":    stats.model_dump(),
            }
            await ws.send_text(json.dumps(payload))
            await asyncio.sleep(STATS_PUSH_INTERVAL_S)
    except WebSocketDisconnect:
        log.debug("WebSocket client disconnected")
    except Exception as exc:
        log.warning("WebSocket error: %s", exc)
