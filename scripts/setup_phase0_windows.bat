@echo off
REM =============================================================================
REM Sentinel Torrent Downloader — Phase 0 Setup Script (Windows)
REM =============================================================================
REM Run this script ONCE in a Command Prompt or PowerShell window before
REM running the Phase 0 validation.
REM
REM Requirements:
REM   - Python 3.12 installed from python.org (NOT Microsoft Store)
REM     https://www.python.org/downloads/
REM   - Python added to PATH during installation (check "Add to PATH" in installer)
REM
REM Usage (Command Prompt as Administrator NOT required):
REM   scripts\setup_phase0_windows.bat
REM =============================================================================

echo.
echo =================================================================
echo   Sentinel -- Phase 0 Environment Setup (Windows)
echo =================================================================
echo.

REM ── 1. Check Python ──────────────────────────────────────────────
echo [INFO] Checking Python installation...
python --version >nul 2>&1
IF ERRORLEVEL 1 (
    echo [ERROR] Python not found in PATH.
    echo.
    echo   Install Python 3.12 from https://www.python.org/downloads/
    echo   During installation, CHECK "Add Python to PATH"
    echo   Then re-run this script.
    pause
    exit /b 1
)
FOR /F "tokens=*" %%i IN ('python --version') DO echo [OK]   %%i found.

REM ── 2. Check Python version is 3.12+ ─────────────────────────────
python -c "import sys; exit(0 if sys.version_info >= (3,12) else 1)" >nul 2>&1
IF ERRORLEVEL 1 (
    echo [WARN] Python 3.12 or newer is required for the libtorrent wheel.
    echo        Found older version. Please install Python 3.12+.
    pause
    exit /b 1
)

REM ── 3. Upgrade pip ───────────────────────────────────────────────
echo.
echo [INFO] Upgrading pip...
python -m pip install --upgrade pip
IF ERRORLEVEL 1 (
    echo [ERROR] pip upgrade failed.
    pause
    exit /b 1
)

REM ── 4. Create virtual environment ────────────────────────────────
echo.
echo [INFO] Creating Python virtual environment in .venv\...
python -m venv .venv
IF ERRORLEVEL 1 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
)
echo [OK]   Virtual environment created at .venv\

REM ── 5. Install libtorrent (Windows wheel from PyPI) ───────────────
echo.
echo [INFO] Installing libtorrent (this may take a moment)...
.venv\Scripts\pip install --upgrade libtorrent
IF ERRORLEVEL 1 (
    echo [ERROR] libtorrent installation failed.
    echo.
    echo   Possible fixes:
    echo     1. Ensure Python 3.12 is installed (not 3.13 which may lack wheels yet)
    echo     2. Try: .venv\Scripts\pip install libtorrent==2.0.10
    echo     3. Check internet connection
    pause
    exit /b 1
)

REM ── 6. Install backend dependencies ──────────────────────────────
echo.
echo [INFO] Installing backend dependencies...
.venv\Scripts\pip install fastapi "uvicorn[standard]" aiosqlite pydantic httpx pytest pytest-asyncio ruff
IF ERRORLEVEL 1 (
    echo [ERROR] Backend dependency installation failed.
    pause
    exit /b 1
)

REM ── 7. Verify libtorrent import ───────────────────────────────────
echo.
echo [INFO] Verifying libtorrent import...
.venv\Scripts\python -c "import libtorrent as lt; print('[OK]   libtorrent', lt.version, 'imported successfully.')"
IF ERRORLEVEL 1 (
    echo [ERROR] libtorrent import failed even after installation.
    echo         Check if Visual C++ Redistributable is installed:
    echo         https://aka.ms/vs/17/release/vc_redist.x64.exe
    pause
    exit /b 1
)

REM ── 8. Show libtorrent version ────────────────────────────────────
echo.
echo =================================================================
echo   Setup complete!
echo.
echo   Run Phase 0 validation:
echo     .venv\Scripts\python engine\poc\phase0_validation.py
echo =================================================================
echo.
pause
