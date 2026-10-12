"""
engine/session_manager.py
Singleton libtorrent session.  All interaction with libtorrent happens here.
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
        self._mock_torrents: Dict[str, TorrentInfo] = {}
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
                "Running in fallback preview mode. Install python3-libtorrent for native transfers."
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

    def _save_resume(self, ih: str, handle: lt.torrent_handle) -> None:
        """Synchronously save fast-resume data to disk."""
        try:
            if not handle.is_valid():
                return
            data = lt.write_resume_data_buf(handle.save_resume_data())
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
            if self._session:
                atp = lt.parse_magnet_uri(magnet_uri)
                atp.save_path = save_path
                resume = self._load_resume(_ih_from_atp(atp))
                if resume:
                    lt.read_resume_data(resume, atp)
                handle = self._session.add_torrent(atp)
                ih = str(handle.info_hashes().v1 or handle.info_hashes().v2)
                self._handles[ih] = handle
                log.info("Added magnet: %s (ih=%s)", magnet_uri[:60], ih)
                return ih
            else:
                import hashlib
                ih = hashlib.sha1(magnet_uri.encode()).hexdigest()
                self._mock_torrents[ih] = TorrentInfo(
                    hash=ih,
                    name=magnet_uri.split("&dn=")[-1].split("&")[0] if "&dn=" in magnet_uri else f"Torrent-{ih[:8]}",
                    size=2147483648,
                    progress=0.05,
                    download_rate=24500000,
                    upload_rate=1200000,
                    state=TorrentState.DOWNLOADING,
                    peers=54,
                    seeds=120,
                    eta_seconds=84,
                    save_path=save_path,
                    added_at=time.time(),
                )
                log.info("Added magnet in simulation mode (ih=%s)", ih)
                return ih

    async def add_torrent_file(self, data: bytes, save_path: str) -> str:
        """Add from raw .torrent bytes; returns info-hash string."""
        async with self._lock:
            if self._session:
                ti = lt.torrent_info(data)
                atp = lt.add_torrent_params()
                atp.ti = ti
                atp.save_path = save_path
                ih = str(ti.info_hashes().v1 or ti.info_hashes().v2)
                resume = self._load_resume(ih)
                if resume:
                    lt.read_resume_data(resume, atp)
                handle = self._session.add_torrent(atp)
                self._handles[ih] = handle
                log.info("Added .torrent file (ih=%s)", ih)
                return ih
            else:
                import hashlib
                ih = hashlib.sha1(data[:100]).hexdigest()
                self._mock_torrents[ih] = TorrentInfo(
                    hash=ih,
                    name=f"Torrent-File-{ih[:8]}",
                    size=1073741824,
                    progress=0.1,
                    download_rate=18000000,
                    upload_rate=900000,
                    state=TorrentState.DOWNLOADING,
                    peers=32,
                    seeds=88,
                    eta_seconds=50,
                    save_path=save_path,
                    added_at=time.time(),
                )
                log.info("Added .torrent file in simulation mode (ih=%s)", ih)
                return ih

    async def pause(self, ih: str) -> None:
        async with self._lock:
            if self._session:
                if h := self._handles.get(ih):
                    h.pause()
                    self._save_resume(ih, h)
            elif ih in self._mock_torrents:
                t = self._mock_torrents[ih]
                self._mock_torrents[ih] = t.model_copy(update={
                    "state": TorrentState.PAUSED,
                    "download_rate": 0,
                    "upload_rate": 0
                })

    async def resume(self, ih: str) -> None:
        async with self._lock:
            if self._session:
                if h := self._handles.get(ih):
                    h.resume()
            elif ih in self._mock_torrents:
                t = self._mock_torrents[ih]
                self._mock_torrents[ih] = t.model_copy(update={
                    "state": TorrentState.DOWNLOADING,
                    "download_rate": 20000000,
                    "upload_rate": 1000000
                })

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
            elif ih in self._mock_torrents:
                del self._mock_torrents[ih]
                log.info("Removed torrent %s from simulation mode", ih)

    # ── Status queries ────────────────────────────────────────────────────────

    def get_torrent_info(self, ih: str) -> Optional[TorrentInfo]:
        if self._session:
            h = self._handles.get(ih)
            if not h or not h.is_valid():
                return None
            return _status_to_info(ih, h.status())
        return self._mock_torrents.get(ih)

    def get_all_torrent_info(self) -> List[TorrentInfo]:
        if self._session:
            result = []
            self._session.pop_alerts()
            for ih, h in list(self._handles.items()):
                if h.is_valid():
                    result.append(_status_to_info(ih, h.status()))
            return result
        return list(self._mock_torrents.values())

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
            return SessionStats(
                total_download_rate=int(dl),
                total_upload_rate=int(ul),
                dht_nodes=self._session.status().dht_nodes,
                active_torrents=active,
                total_torrents=len(handles),
            )
        total_dl = sum(t.download_rate for t in self._mock_torrents.values())
        total_ul = sum(t.upload_rate for t in self._mock_torrents.values())
        active = sum(1 for t in self._mock_torrents.values() if t.state == TorrentState.DOWNLOADING)
        return SessionStats(
            total_download_rate=int(total_dl),
            total_upload_rate=int(total_ul),
            dht_nodes=350,
            active_torrents=active,
            total_torrents=len(self._mock_torrents),
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
    h = atp.info_hashes
    return str(h.v1 or h.v2) if h else ""


def _status_to_info(ih: str, s: any) -> TorrentInfo:
    state = lt_state_to_enum(int(s.state), s.paused)

    # ETA calculation (seconds)
    if s.download_rate > 0 and s.total_wanted > 0:
        remaining = s.total_wanted - s.total_wanted_done
        eta = int(remaining / s.download_rate) if remaining > 0 else 0
    else:
        eta = -1

    err = s.errc.message() if s.errc.value() else None

    return TorrentInfo(
        hash=ih,
        name=s.name or ih[:8],
        size=s.total_wanted or 0,
        progress=round(float(s.progress), 6),
        download_rate=int(s.download_rate),
        upload_rate=int(s.upload_rate),
        state=state,
        peers=s.num_peers,
        seeds=s.num_seeds,
        eta_seconds=eta,
        save_path=s.save_path,
        added_at=time.time(),
        error_message=err,
    )
