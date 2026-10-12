#!/usr/bin/env bash
# =============================================================================
# Sentinel Torrent Downloader — Phase 0 Setup Script  [LINUX / Pop!_OS]
# =============================================================================
# This script sets up the development environment on Linux (Debian/Ubuntu/Pop!_OS).
#
# For Windows, use:  scripts\setup_phase0_windows.bat
#
# Key difference:
#   Linux  — libtorrent comes from apt (python3-libtorrent, compiled against
#             the system's libboost). pip install libtorrent may lack a matching
#             wheel for the system Python on Ubuntu 24.04.
#   Windows — libtorrent comes from PyPI (precompiled .whl for cp312-win_amd64).
#             No apt equivalent; pip install libtorrent is the correct method.
#
# Usage:
#   chmod +x scripts/setup_phase0.sh
#   ./scripts/setup_phase0.sh
# =============================================================================

set -e  # Exit immediately on any error

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       Sentinel — Phase 0 Environment Setup                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Check OS ─────────────────────────────────────────────────────────────────
if ! command -v apt-get &>/dev/null; then
    echo "[ERROR] This script requires apt-get (Debian/Ubuntu/Pop!_OS)."
    echo "        For other distros, install 'python3-libtorrent' equivalent manually."
    exit 1
fi

echo "[INFO] Updating apt package index ..."
sudo apt-get update -q

echo ""
echo "[INFO] Installing required packages ..."
sudo apt-get install -y \
    python3-libtorrent \
    python3-venv \
    python3-pip \
    python3-dev \
    build-essential

echo ""
echo "[INFO] Verifying installation ..."
python3 -c "import libtorrent as lt; print(f'[OK]   libtorrent {lt.version} imported successfully.')"

echo ""
echo "[INFO] Creating Python virtual environment in .venv/ ..."
# Use --system-site-packages so the venv can see python3-libtorrent
python3 -m venv --system-site-packages .venv
echo "[OK]   Virtual environment created at: .venv/"

echo ""
echo "[INFO] Upgrading pip inside venv ..."
.venv/bin/pip install --upgrade pip --quiet

echo ""
echo "[INFO] Installing Python backend dependencies ..."
.venv/bin/pip install \
    fastapi \
    "uvicorn[standard]" \
    aiosqlite \
    pydantic \
    httpx \
    pytest \
    pytest-asyncio \
    ruff \
    --quiet

echo ""
echo "[INFO] Verifying libtorrent is accessible from venv ..."
.venv/bin/python3 -c "import libtorrent as lt; print(f'[OK]   venv libtorrent {lt.version} OK')"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       Setup complete!                                        ║"
echo "║                                                              ║"
echo "║  Run Phase 0 validation:                                     ║"
echo "║    .venv/bin/python3 engine/poc/phase0_validation.py         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
