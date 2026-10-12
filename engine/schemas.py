"""
engine/schemas.py
Pydantic request/response models — the typed contract between UI and engine.
ALL data crossing the API boundary is validated here first.
"""
from __future__ import annotations
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, field_validator
import re

# ── Torrent state enum ─────────────────────────────────────────────────────────
class TorrentState(str, Enum):
    QUEUED            = "queued"
    CHECKING          = "checking"
    DOWNLOADING_META  = "downloading_metadata"
    DOWNLOADING       = "downloading"
    FINISHED          = "finished"
    SEEDING           = "seeding"
    PAUSED            = "paused"
    ERROR             = "error"


# ── libtorrent state index → our enum ─────────────────────────────────────────
_LT_STATE_MAP: dict[int, TorrentState] = {
    0: TorrentState.QUEUED,
    1: TorrentState.CHECKING,
    2: TorrentState.DOWNLOADING_META,
    3: TorrentState.DOWNLOADING,
    4: TorrentState.FINISHED,
    5: TorrentState.SEEDING,
    6: TorrentState.QUEUED,          # allocating
    7: TorrentState.CHECKING,        # checking_resume_data
}

def lt_state_to_enum(lt_state_int: int, paused: bool) -> TorrentState:
    if paused:
        return TorrentState.PAUSED
    return _LT_STATE_MAP.get(lt_state_int, TorrentState.DOWNLOADING)


# ── Response models ────────────────────────────────────────────────────────────
class TorrentInfo(BaseModel):
    hash:          str
    name:          str
    size:          int           # bytes; 0 if metadata not yet received
    progress:      float         # 0.0 – 1.0
    download_rate: int           # bytes/s
    upload_rate:   int           # bytes/s
    state:         TorrentState
    peers:         int
    seeds:         int
    eta_seconds:   int           # -1 = unknown
    save_path:     str
    added_at:      float         # Unix timestamp
    error_message: Optional[str] = None


class SessionStats(BaseModel):
    total_download_rate: int     # bytes/s
    total_upload_rate:   int     # bytes/s
    dht_nodes:           int
    active_torrents:     int
    total_torrents:      int


class HealthResponse(BaseModel):
    status:  str = "ok"
    version: str


# ── Request models ─────────────────────────────────────────────────────────────
_MAGNET_RE = re.compile(r"^magnet:\?xt=urn:[a-zA-Z0-9]+:[a-zA-Z0-9]{32,40}", re.IGNORECASE)

class AddMagnetRequest(BaseModel):
    magnet_uri: str = Field(..., min_length=10, max_length=2048)
    save_path:  Optional[str] = None

    @field_validator("magnet_uri")
    @classmethod
    def validate_magnet(cls, v: str) -> str:
        if not _MAGNET_RE.match(v.strip()):
            raise ValueError("Invalid magnet URI format")
        return v.strip()


class AddTorrentFileRequest(BaseModel):
    torrent_b64: str = Field(..., description="Base64-encoded .torrent file contents")
    save_path:   Optional[str] = None


class TorrentActionRequest(BaseModel):
    action: str = Field(..., pattern="^(pause|resume|remove|remove_with_data)$")


class BandwidthSettings(BaseModel):
    download_limit: int = Field(ge=-1, default=-1)  # bytes/s; -1 = unlimited
    upload_limit:   int = Field(ge=-1, default=-1)


class GlobalSettings(BaseModel):
    download_limit:   int = Field(ge=-1, default=-1)
    upload_limit:     int = Field(ge=-1, default=-1)
    max_connections:  int = Field(ge=1, le=5000, default=200)
    default_save_path: Optional[str] = None
