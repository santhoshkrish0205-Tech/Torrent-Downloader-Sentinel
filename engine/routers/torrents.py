"""
engine/routers/torrents.py
REST endpoints for torrent CRUD and control operations.
"""
from __future__ import annotations
import base64
import time
from typing import List

from fastapi import APIRouter, HTTPException, BackgroundTasks

from schemas import (
    AddMagnetRequest,
    AddTorrentFileRequest,
    TorrentActionRequest,
    TorrentInfo,
    TorrentState,
)
from session_manager import session_manager
from state_store import upsert_torrent, remove_torrent as db_remove, update_torrent_state
from validators import sanitise_save_path, decode_torrent_b64
from logger import log

router = APIRouter(prefix="/torrents", tags=["torrents"])


@router.get("/", response_model=List[TorrentInfo])
async def list_torrents():
    """Return all currently tracked torrents with live stats."""
    return session_manager.get_all_torrent_info()


@router.post("/magnet", response_model=TorrentInfo)
async def add_magnet(req: AddMagnetRequest, bg: BackgroundTasks):
    save_path = sanitise_save_path(req.save_path)
    try:
        ih = await session_manager.add_magnet(req.magnet_uri, save_path)
    except Exception as exc:
        log.error("add_magnet failed: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc))

    bg.add_task(
        upsert_torrent,
        hash=ih,
        name="",
        save_path=save_path,
        magnet_uri=req.magnet_uri,
    )

    try:
        info = session_manager.get_torrent_info(ih)
    except Exception as exc:
        log.error("Failed to read torrent info for %s: %s", ih, exc)
        info = None

    return info or TorrentInfo(
        hash=ih,
        name=f"Fetching metadata... ({ih[:8]})",
        size=0,
        progress=0.0,
        download_rate=0,
        upload_rate=0,
        state=TorrentState.DOWNLOADING_METADATA,
        peers=0,
        seeds=0,
        eta_seconds=-1,
        save_path=save_path,
        added_at=time.time(),
    )


@router.post("/file", response_model=TorrentInfo)
async def add_torrent_file(req: AddTorrentFileRequest, bg: BackgroundTasks):
    save_path = sanitise_save_path(req.save_path)
    try:
        raw = decode_torrent_b64(req.torrent_b64)
        ih = await session_manager.add_torrent_file(raw, save_path)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        log.error("add_torrent_file failed: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc))

    bg.add_task(
        upsert_torrent,
        hash=ih,
        name="",
        save_path=save_path,
        torrent_data=raw,
    )

    try:
        info = session_manager.get_torrent_info(ih)
    except Exception as exc:
        log.error("Failed to read torrent info for %s: %s", ih, exc)
        info = None

    return info or TorrentInfo(
        hash=ih,
        name=f"Torrent ({ih[:8]})",
        size=0,
        progress=0.0,
        download_rate=0,
        upload_rate=0,
        state=TorrentState.CHECKING,
        peers=0,
        seeds=0,
        eta_seconds=-1,
        save_path=save_path,
        added_at=time.time(),
    )


@router.get("/{ih}", response_model=TorrentInfo)
async def get_torrent(ih: str):
    info = session_manager.get_torrent_info(ih)
    if not info:
        raise HTTPException(status_code=404, detail="Torrent not found")
    return info


@router.post("/{ih}/action")
async def torrent_action(ih: str, req: TorrentActionRequest, bg: BackgroundTasks):
    action = req.action
    try:
        if action == "pause":
            await session_manager.pause(ih)
            bg.add_task(update_torrent_state, ih, "paused")
        elif action == "resume":
            await session_manager.resume(ih)
            bg.add_task(update_torrent_state, ih, "downloading")
        elif action == "remove":
            await session_manager.remove(ih, delete_files=False)
            bg.add_task(db_remove, ih)
        elif action == "remove_with_data":
            await session_manager.remove(ih, delete_files=True)
            bg.add_task(db_remove, ih)
    except Exception as exc:
        log.error("torrent_action %s on %s failed: %s", action, ih, exc)
        raise HTTPException(status_code=500, detail=str(exc))

    return {"ok": True, "action": action, "hash": ih}
