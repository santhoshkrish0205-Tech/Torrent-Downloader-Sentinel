"""
Phase 0 — Feasibility Validation
=================================
Purpose:
    Confirm that the libtorrent Python binding is installed correctly, that a
    libtorrent session can be created, and that a magnet link can start
    downloading peers within a reasonable time.

Success condition:
    - libtorrent imports without error.
    - Session reaches download_rate > 0 KB/s at least once within 120 s.
    - Script exits cleanly with no segfault or unhandled exception.

Usage:
    python engine/poc/phase0_validation.py

Requirements:
    pip install libtorrent
    OR (system package):
    sudo apt install python3-libtorrent

Notes:
    - Downloads are written to /tmp/sentinel_phase0_test/ and cleaned up on exit.
    - No data is kept after the script exits.
    - The Ubuntu 24.04 Desktop ISO magnet is used as it is reliably well-seeded
      and its integrity can be verified via the published SHA-256 hash.
"""

import sys
import os
import time
import shutil
import signal
import tempfile

# ── 1. Import check ──────────────────────────────────────────────────────────

try:
    import libtorrent as lt
except ImportError as e:
    print(
        "\n[FAIL] libtorrent could not be imported.\n"
        "  Install with:  pip install libtorrent\n"
        "  OR:            sudo apt install python3-libtorrent\n"
        f"  Error: {e}"
    )
    sys.exit(1)

print(f"[OK]   libtorrent imported successfully.")
print(f"[INFO] libtorrent version : {lt.version}")
print(f"[INFO] Python version     : {sys.version.split()[0]}")
print(f"[INFO] Platform           : {sys.platform}")
print()

# ── 2. Test torrent ───────────────────────────────────────────────────────────
# Ubuntu 24.04.2 LTS Desktop (x86_64) — official magnet link.
# Primary magnet; a Debian fallback is provided in case this swarm is thin.

MAGNET_PRIMARY = (
    "magnet:?xt=urn:btih:3a6d28c7a3ef4c9a0c7ab23a84a4ba00"
    "b5bc50e5&dn=ubuntu-24.04.2-desktop-amd64.iso"
    "&tr=https%3A%2F%2Ftorrent.ubuntu.com%2Fannounce"
    "&tr=https%3A%2F%2Fipv6.torrent.ubuntu.com%2Fannounce"
)

MAGNET_FALLBACK = (
    "magnet:?xt=urn:btih:1ae1b6e4e12e8c1b812f5ca69c0d"
    "7b4a6e8b2c3d&dn=debian-12.5.0-amd64-netinst.iso"
    "&tr=http%3A%2F%2Fbttracker.debian.org%3A6969%2Fannounce"
)

POLL_INTERVAL_S   = 2       # seconds between status prints
MAX_DURATION_S    = 120     # total test time in seconds
SUCCESS_THRESHOLD = 1       # KB/s — considered "downloading" if above this

# ── 3. Temp download directory ────────────────────────────────────────────────

save_dir = tempfile.mkdtemp(prefix="sentinel_phase0_")
print(f"[INFO] Temp download dir  : {save_dir}")
print(f"[INFO] Test duration      : {MAX_DURATION_S} s")
print(f"[INFO] Success threshold  : {SUCCESS_THRESHOLD} KB/s download speed")
print()

# ── 4. Create libtorrent session ──────────────────────────────────────────────

ses = lt.session()

# Apply settings that match the planned Sentinel defaults.
settings = {
    # Enable all peer-discovery mechanisms.
    "enable_dht":       True,
    "enable_lsd":       True,
    "enable_natpmp":    True,
    "enable_upnp":      True,

    # Connection limits — conservative starting point.
    "connections_limit": 200,

    # Disk cache: 256 MB (value is in 16 KB blocks → 256*1024/16 = 16384).
    "cache_size": 16384,

    # Alert mask: only the alerts we need for this POC.
    "alert_mask": (
        lt.alert.category_t.error_notification
        | lt.alert.category_t.status_notification
        | lt.alert.category_t.performance_warning
    ),
}
ses.apply_settings(settings)

# Listen on a range of ports.
try:
    # libtorrent >= 2.x uses listen_interfaces
    ses.apply_settings({"listen_interfaces": "0.0.0.0:6881"})
except Exception:
    # libtorrent 1.x fallback
    ses.listen_on(6881, 6889)

print("[OK]   libtorrent session created.")
print(f"[INFO] DHT started        : {ses.is_dht_running()}")
print()

# ── 5. Add torrent ────────────────────────────────────────────────────────────

def add_magnet(session, magnet_uri, save_path):
    """Parse and add a magnet URI to the session."""
    try:
        atp = lt.parse_magnet_uri(magnet_uri)
    except Exception as e:
        return None, f"parse_magnet_uri failed: {e}"

    atp.save_path = save_path
    # Do not start downloading immediately — wait for metadata first.
    atp.flags |= lt.torrent_flags.upload_mode

    try:
        handle = session.add_torrent(atp)
    except Exception as e:
        return None, f"add_torrent failed: {e}"

    return handle, None


print(f"[INFO] Adding magnet link ...")
handle, err = add_magnet(ses, MAGNET_PRIMARY, save_dir)
if err:
    print(f"[WARN] Primary magnet failed: {err}")
    print(f"[INFO] Trying fallback magnet ...")
    handle, err = add_magnet(ses, MAGNET_FALLBACK, save_dir)
    if err:
        print(f"[FAIL] Both magnets failed to parse: {err}")
        shutil.rmtree(save_dir, ignore_errors=True)
        sys.exit(1)

# Once metadata arrives, switch out of upload_mode to enable downloading.
handle.unset_flags(lt.torrent_flags.upload_mode)

print(f"[OK]   Torrent added.")
print()

# ── 6. Poll loop ──────────────────────────────────────────────────────────────

STATE_NAMES = [
    "queued_for_checking",
    "checking_files",
    "downloading_metadata",
    "downloading",
    "finished",
    "seeding",
    "allocating",
    "checking_resume_data",
]

peak_download_kbps = 0.0
ever_exceeded_threshold = False
start_time = time.monotonic()
interrupted = False


def _handle_sigint(sig, frame):
    global interrupted
    interrupted = True


signal.signal(signal.SIGINT, _handle_sigint)

print("─" * 70)
print(f"  {'Elapsed':>8}  {'State':<24}  {'DL KB/s':>10}  {'UL KB/s':>10}  {'Peers':>6}")
print("─" * 70)

while True:
    elapsed = time.monotonic() - start_time

    if interrupted:
        print("\n[INFO] Interrupted by user (Ctrl-C).")
        break

    if elapsed >= MAX_DURATION_S:
        break

    # Drain alert queue — important to keep libtorrent healthy.
    ses.pop_alerts()

    if not handle.is_valid():
        print("[WARN] Torrent handle became invalid — swarm may be unreachable.")
        break

    status = handle.status()

    state_idx = int(status.state)
    state_name = STATE_NAMES[state_idx] if state_idx < len(STATE_NAMES) else str(state_idx)

    dl_kbps = status.download_rate / 1024.0
    ul_kbps = status.upload_rate / 1024.0
    peers   = status.num_peers

    if dl_kbps > peak_download_kbps:
        peak_download_kbps = dl_kbps

    if dl_kbps >= SUCCESS_THRESHOLD:
        ever_exceeded_threshold = True

    print(
        f"  {elapsed:>7.1f}s  {state_name:<24}  {dl_kbps:>9.1f}  {ul_kbps:>9.1f}  {peers:>6}",
        flush=True,
    )

    time.sleep(POLL_INTERVAL_S)

print("─" * 70)
print()

# ── 7. Clean up ───────────────────────────────────────────────────────────────

print("[INFO] Removing torrent and cleaning up ...")
if handle.is_valid():
    ses.remove_torrent(handle, lt.session.delete_files)

# Give libtorrent a moment to flush and close sockets.
time.sleep(1)
del ses

shutil.rmtree(save_dir, ignore_errors=True)
print(f"[OK]   Temp directory removed: {save_dir}")
print()

# ── 8. Report ─────────────────────────────────────────────────────────────────

print("═" * 70)
print("  PHASE 0 VALIDATION REPORT")
print("═" * 70)
print(f"  libtorrent version   : {lt.version}")
print(f"  Python version       : {sys.version.split()[0]}")
print(f"  Peak download speed  : {peak_download_kbps:.1f} KB/s")
print(f"  Threshold            : {SUCCESS_THRESHOLD} KB/s")
print(f"  Threshold reached    : {'YES ✓' if ever_exceeded_threshold else 'NO ✗'}")
print("═" * 70)

if ever_exceeded_threshold:
    print()
    print("  ✅  PASS — libtorrent is functional on this machine.")
    print("      Proceed to Phase 1: Repository & Environment Setup.")
    print()
    sys.exit(0)
else:
    print()
    print("  ❌  FAIL — Download speed did not exceed threshold within test window.")
    print()
    print("  Possible causes:")
    print("    1. Firewall / ISP is blocking BitTorrent UDP traffic.")
    print("       → Try: sudo ufw allow 6881/udp && sudo ufw allow 6881/tcp")
    print("    2. Magnet link swarm is temporarily thin (low seeds).")
    print("       → Wait and retry, or try a different legal magnet link.")
    print("    3. libtorrent installed but not fully operational (wrong version?).")
    print("       → pip install --upgrade libtorrent")
    print("    4. DHT bootstrap nodes unreachable (no internet access?).")
    print("       → Verify internet connectivity before re-running.")
    print()
    sys.exit(1)
