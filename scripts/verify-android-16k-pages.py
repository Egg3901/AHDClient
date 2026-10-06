#!/usr/bin/env python3
"""Fail when an APK's native libraries are not aligned for 16 KB pages.

Devices running a 16 KB page kernel cannot load a library whose LOAD
segments are aligned to 4 KB; the app dies at launch (ticket 1387). Checks
every lib/<abi>/*.so in the APK with readelf.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


def main() -> int:
    errors = []
    checked = 0
    with tempfile.TemporaryDirectory(prefix="ahdclient-16k-") as directory:
        with zipfile.ZipFile(sys.argv[1]) as apk:
            libs = [name for name in apk.namelist() if name.startswith("lib/") and name.endswith(".so")]
            for name in libs:
                path = Path(directory) / name.replace("/", "_")
                path.write_bytes(apk.read(name))
                if "/x86/" in name or "/armeabi-v7a/" in name:
                    continue  # 32-bit ABIs never run 16 KB page kernels
                out = subprocess.run(["readelf", "-lW", str(path)], check=True, capture_output=True, text=True).stdout
                aligns = [int(line.split()[-1], 16) for line in out.splitlines() if line.strip().startswith("LOAD")]
                checked += 1
                if not aligns or min(aligns) < 0x4000:
                    errors.append(f"{name}: LOAD alignment {[hex(a) for a in aligns]}, needs 0x4000")
    for error in errors:
        print(f"FAIL: {error}")
    if not checked:
        print("FAIL: no 64-bit native libraries found in the APK")
        return 1
    if not errors:
        print(f"PASS: {checked} 64-bit native libraries aligned for 16 KB pages")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
