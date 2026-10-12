"""
engine/state_store.py
SQLite persistence layer via aiosqlite.
Stores per-torrent metadata so torrents survive application restarts.
"""
from __future__ import annotations
import time
from typing import Optional, List

import aiosqlite

from config import DB_PATH
from logger import log

# ── Schema ────────────────────────────────────────────────────────────────────
_CREATE_TORRENTS = """
CREATE TABLE IF NOT EXISTS torrents (
    hash        TEXT PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT '',
    save_path   TEXT NOT NULL,
    added_at    REAL NOT NULL,
    state       TEXT NOT NULL DEFAULT 'downloading',
    size        INTEGER NOT NULL DEFAULT 0,
    magnet_uri  TEXT,
    torrent_data BLOB
);
"""

_CREATE_SETTINGS = """
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


async def init_db() -> None:
    """Create tables if they don't exist (idempotent)."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(_CREATE_TORRENTS)
        await db.execute(_CREATE_SETTINGS)
        await db.commit()
    log.info("Database initialised at %s", DB_PATH)


# ── Torrent records ───────────────────────────────────────────────────────────
async def upsert_torrent(
    hash: str,
    name: str,
    save_path: str,
    size: int = 0,
    state: str = "downloading",
    magnet_uri: Optional[str] = None,
    torrent_data: Optional[bytes] = None,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO torrents (hash, name, save_path, added_at, state, size, magnet_uri, torrent_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(hash) DO UPDATE SET
                name         = excluded.name,
                save_path    = excluded.save_path,
                state        = excluded.state,
                size         = excluded.size,
                magnet_uri   = COALESCE(excluded.magnet_uri, torrents.magnet_uri),
                torrent_data = COALESCE(excluded.torrent_data, torrents.torrent_data)
            """,
            (hash, name, save_path, time.time(), state, size, magnet_uri, torrent_data),
        )
        await db.commit()


async def update_torrent_state(hash: str, state: str, name: str = "", size: int = 0) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            UPDATE torrents SET state = ?,
                name = CASE WHEN ? != '' THEN ? ELSE name END,
                size = CASE WHEN ? > 0 THEN ? ELSE size END
            WHERE hash = ?
            """,
            (state, name, name, size, size, hash),
        )
        await db.commit()


async def remove_torrent(hash: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM torrents WHERE hash = ?", (hash,))
        await db.commit()


async def get_all_torrents() -> List[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM torrents ORDER BY added_at ASC") as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


# ── Settings ──────────────────────────────────────────────────────────────────
async def get_setting(key: str, default: str = "") -> str:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cur:
            row = await cur.fetchone()
    return row[0] if row else default


async def set_setting(key: str, value: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        await db.commit()
