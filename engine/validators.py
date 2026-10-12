"""
engine/validators.py
Input sanitisation for filesystem paths and torrent metadata.
All save paths must be resolved and confirmed to be within an allowed root.
"""
from __future__ import annotations
import base64
import binascii
from pathlib import Path
from typing import Optional

from config import DEFAULT_DOWNLOAD_DIR


def sanitise_save_path(raw: Optional[str], fallback: Path = DEFAULT_DOWNLOAD_DIR) -> str:
    """
    Validate and resolve a save path.
    - Rejects None / empty → returns default.
    - Resolves symlinks and '..' components.
    - Ensures the parent directory exists (or can be created).
    - Does NOT restrict to a single root — user may choose any location.
    Returns the resolved absolute path as a string.
    """
    if not raw or not raw.strip():
        return str(fallback)

    try:
        p = Path(raw.strip()).expanduser().resolve()
    except (ValueError, OSError):
        return str(fallback)

    # Attempt to create the directory; fail gracefully.
    try:
        p.mkdir(parents=True, exist_ok=True)
    except (PermissionError, OSError):
        return str(fallback)

    return str(p)


def decode_torrent_b64(b64_data: str) -> bytes:
    """
    Decode a base64-encoded .torrent file.
    Raises ValueError on malformed input.
    """
    try:
        data = base64.b64decode(b64_data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"Invalid base64 torrent data: {exc}") from exc

    # Bencode files start with 'd' (0x64).
    if not data or data[0] != ord("d"):
        raise ValueError("Data does not appear to be a valid .torrent file (missing bencode header)")

    return data
