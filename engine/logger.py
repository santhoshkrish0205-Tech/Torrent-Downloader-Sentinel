"""
engine/logger.py
Rotating file logger + console output for the Sentinel engine.
"""
import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from config import LOG_DIR, DEV_MODE


def setup_logger(name: str = "sentinel") -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG if DEV_MODE else logging.INFO)

    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console handler (always enabled in dev; errors only in prod)
    ch = logging.StreamHandler(sys.stderr)
    ch.setLevel(logging.DEBUG if DEV_MODE else logging.WARNING)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    # Rotating file handler: 5 × 10 MB
    log_file = LOG_DIR / "engine.log"
    fh = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    return logger


log = setup_logger()
