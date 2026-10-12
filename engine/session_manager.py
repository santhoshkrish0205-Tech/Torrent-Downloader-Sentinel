"""
engine/session_manager.py
Singleton libtorrent session. All interaction with libtorrent happens here.
"""
from __future__ import annotations
import asyncio
import time
from pathlib import Path
from typing import Dict, Optional, List

try:
    import libtorrent as lt
except ImportError:
    lt = None

from config import LT_SETTINGS, RESUME_DIR, DEFAULT_DOWNLOAD_DIR
from schemas import TorrentInfo, SessionStats, TorrentState, lt_state_to_enum
from logger import log


class SessionManager:
    """Manages the libtorrent session and all torrent handles."""

    def __init__(self) -> None:
        self._session = None
        self._handles: Dict[str, any] = {}   # hash → handle
        self._lock = asyncio.Lock()

    # ── Lifecycle ────────────────────────────────────────────────────────────

    def start(self) -> None:
        """Initialise the libtorrent session (call once at startup)."""
        if lt is not None:
            self._session = lt.session()
            self._session.apply_settings(LT_SETTINGS)
            log.info("libtorrent session started (version %s)", lt.version)
        else:
            log.warning(
                "libtorrent library not found on system. "
                "Install python3-libtorrent or libtorrent wheel for native transfers."
            )

    def stop(self) -> None:
        """Pause all torrents and flush state (call at shutdown)."""
        if not self._session:
            return
        log.info("Pausing libtorrent session for clean shutdown …")
        self._session.pause()
        # Save fast-resume for every active handle.
        for ih, handle in list(self._handles.items()):
            self._save_resume(ih, handle)
        log.info("libtorrent session stopped.")

    # ── Resume data helpers ─────────────────────────────────────────────────

    def _resume_path(self, ih: str) -> Path:
        return RESUME_DIR / f"{ih}.fastresume"

    def _save_resume(self, ih: str, handle: any) -> None:
        """Synchronously save fast-resume data to disk if available."""
        try:
            if not handle or not handle.is_valid():
                return
            res = handle.save_resume_data()
            if res is not None:
                data = lt.write_resume_data_buf(res)
                self._resume_path(ih).write_bytes(data)
        except Exception as exc:
            log.warning("Could not save resume for %s: %s", ih, exc)

    def _load_resume(self, ih: str) -> Optional[bytes]:
        p = self._resume_path(ih)
        if p.exists():
            try:
                return p.read_bytes()
            except OSError:
                pass
        return None

    # ── Torrent operations ───────────────────────────────────────────────────

    async def add_magnet(self, magnet_uri: str, save_path: str) -> str:
        """Add a magnet link; returns info-hash string."""
        async with self._lock:
            if not self._session:
                raise RuntimeError("Torrent engine is not initialized. libtorrent is required.")

            atp = lt.parse_magnet_uri(magnet_uri)
            atp.save_path = save_path
            ih = _ih_from_atp(atp)
            resume = self._load_resume(ih)
            if resume:
                try:
                    lt.read_resume_data(resume, atp)
                except Exception as e:
                    log.warning("Failed to apply resume data for %s: %s", ih, e)
            handle = self._session.add_torrent(atp)
            self._handles[ih] = handle
            log.info("Added magnet to libtorrent swarm: %s (ih=%s)", magnet_uri[:60], ih)
            return ih

    async def add_torrent_file(self, data: bytes, save_path: str) -> str:
        """Add from raw .torrent bytes; returns info-hash string."""
        async with self._lock:
            if not self._session:
                raise RuntimeError("Torrent engine is not initialized. libtorrent is required.")

            ti = lt.torrent_info(data)
            atp = lt.add_torrent_params()
            atp.ti = ti
            atp.save_path = save_path
            ih = str(ti.info_hashes().v1 or ti.info_hashes().v2)
            resume = self._load_resume(ih)
            if resume:
                try:
                    lt.read_resume_data(resume, atp)
                except Exception as e:
                    log.warning("Failed to apply resume data for %s: %s", ih, e)
            handle = self._session.add_torrent(atp)
            self._handles[ih] = handle
            log.info("Added .torrent file to libtorrent swarm (ih=%s)", ih)
            return ih

    async def pause(self, ih: str) -> None:
        async with self._lock:
            if self._session:
                if h := self._handles.get(ih):
                    h.pause()
                    self._save_resume(ih, h)

    async def resume(self, ih: str) -> None:
        async with self._lock:
            if self._session:
                if h := self._handles.get(ih):
                    h.resume()

    async def remove(self, ih: str, delete_files: bool = False) -> None:
        async with self._lock:
            if self._session:
                if h := self._handles.get(ih):
                    flags = lt.session.delete_files if delete_files else 0
                    self._session.remove_torrent(h, flags)
                    del self._handles[ih]
                    resume_path = self._resume_path(ih)
                    if resume_path.exists():
                        resume_path.unlink(missing_ok=True)
                    log.info("Removed torrent %s (delete_files=%s)", ih, delete_files)

    # ── Status queries ────────────────────────────────────────────────────────

    def get_torrent_info(self, ih: str) -> Optional[TorrentInfo]:
        if self._session:
            h = self._handles.get(ih)
            if not h or not h.is_valid():
                return None
            return _status_to_info(ih, h.status())
        return None

    def get_all_torrent_info(self) -> List[TorrentInfo]:
        if self._session:
            result = []
            self._session.pop_alerts()
            for ih, h in list(self._handles.items()):
                if h.is_valid():
                    result.append(_status_to_info(ih, h.status()))
            return result
        return []

    def get_session_stats(self) -> SessionStats:
        if self._session:
            self._session.pop_alerts()
            handles = [h for h in self._handles.values() if h.is_valid()]
            active = sum(
                1 for h in handles
                if h.status().state not in (lt.torrent_status.states.finished,
                                             lt.torrent_status.states.seeding)
                and not h.status().paused
            )
            dl = sum(h.status().download_rate for h in handles)
            ul = sum(h.status().upload_rate for h in handles)
            dht = self._session.status().dht_nodes
            return SessionStats(
                total_download_rate=int(dl),
                total_upload_rate=int(ul),
                dht_nodes=dht,
                active_torrents=active,
                total_torrents=len(handles),
            )
        return SessionStats(
            total_download_rate=0,
            total_upload_rate=0,
            dht_nodes=0,
            active_torrents=0,
            total_torrents=0,
        )

    def restore_handle(self, ih: str, handle: any) -> None:
        """Register a handle that was re-added during startup restore."""
        self._handles[ih] = handle

    @property
    def session(self) -> any:
        return self._session


# ── Module-level singleton ────────────────────────────────────────────────────
session_manager = SessionManager()


# ── Private helpers ────────────────────────────────────────────────────────────
def _ih_from_atp(atp: any) -> str:
    h = getattr(atp, "info_hashes", None)
    if h:
        return str(h.v1 or h.v2)
    return ""


def _status_to_info(ih: str, s: any) -> TorrentInfo:
    try:
        paused = getattr(s, "paused", False)
        st_int = int(getattr(s, "state", 0))
        state = lt_state_to_enum(st_int, paused)
        has_meta = getattr(s, "has_metadata", False)

        # When metadata is not yet downloaded from the swarm:
        if not has_meta:
            state = TorrentState.DOWNLOADING_METADATA

        dl_rate = int(getattr(s, "download_rate", 0))
        ul_rate = int(getattr(s, "upload_rate", 0))
        wanted = int(getattr(s, "total_wanted", 0))
        wanted_done = int(getattr(s, "total_wanted_done", 0))

        # ETA calculation (seconds)
        if dl_rate > 0 and wanted > 0:
            remaining = wanted - wanted_done
            eta = int(remaining / dl_rate) if remaining > 0 else 0
        else:
            eta = -1

        err = None
        if hasattr(s, "errc") and s.errc.value():
            err = s.errc.message()

        s_name = getattr(s, "name", "")
        displayName = s_name if (has_meta and s_name) else f"Fetching metadata... ({ih[:8]})"
        displaySize = wanted if has_meta else 0
        save_path = getattr(s, "save_path", "")

        return TorrentInfo(
            hash=ih,
            name=displayName,
            size=displaySize,
            progress=round(float(getattr(s, "progress", 0.0)), 6),
            download_rate=dl_rate,
            upload_rate=ul_rate,
            state=state,
            peers=int(getattr(s, "num_peers", 0)),
            seeds=int(getattr(s, "num_seeds", 0)),
            eta_seconds=eta,
            save_path=save_path,
            added_at=time.time(),
            error_message=err,
        )
    except Exception as exc:
        log.error("Failed to build TorrentInfo for %s: %s", ih, exc)
        return TorrentInfo(
            hash=ih,
            name=f"Torrent ({ih[:8]})",
            size=0,
            progress=0.0,
            download_rate=0,
            upload_rate=0,
            state=TorrentState.DOWNLOADING_METADATA,
            peers=0,
            seeds=0,
            eta_seconds=-1,
            save_path="",
            added_at=time.time(),
            error_message=str(exc),
        )
