"""
engine/routers/settings.py
Global settings endpoints (download/upload limits, save path, etc.)
"""
from fastapi import APIRouter
from schemas import GlobalSettings
from state_store import get_setting, set_setting
from session_manager import session_manager
from validators import sanitise_save_path

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/")
async def get_settings():
    dl   = int(await get_setting("download_limit", "-1"))
    ul   = int(await get_setting("upload_limit",   "-1"))
    mc   = int(await get_setting("max_connections","200"))
    path = await get_setting("default_save_path", "")
    return GlobalSettings(
        download_limit=dl,
        upload_limit=ul,
        max_connections=mc,
        default_save_path=path or None,
    )


@router.put("/")
async def update_settings(s: GlobalSettings):
    await set_setting("download_limit",    str(s.download_limit))
    await set_setting("upload_limit",      str(s.upload_limit))
    await set_setting("max_connections",   str(s.max_connections))
    if s.default_save_path:
        sanitised = sanitise_save_path(s.default_save_path)
        await set_setting("default_save_path", sanitised)

    # Apply limits to live session.
    lt_settings: dict = {
        "download_rate_limit": max(0, s.download_limit),
        "upload_rate_limit":   max(0, s.upload_limit),
        "connections_limit":   s.max_connections,
    }
    if session_manager.session:
        session_manager.session.apply_settings(lt_settings)
    return {"ok": True}
