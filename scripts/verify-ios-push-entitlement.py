#!/usr/bin/env python3
"""Verify that a signed IPA can register for APNs.

Without `aps-environment` in both the provisioning profile and the app's
signed entitlements, iOS rejects registerForRemoteNotifications at once
("no valid aps-environment entitlement string found"), on or offline.
Prints only the environment values, never the team or signing identity.
"""

from __future__ import annotations

import argparse
import plistlib
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path


def decode_profile(path: Path) -> dict:
    security = shutil.which("security")
    if security:
        command = [security, "cms", "-D", "-i", str(path)]
    else:
        command = ["openssl", "smime", "-verify", "-inform", "der", "-in", str(path), "-noverify"]
    return plistlib.loads(subprocess.run(command, check=True, capture_output=True).stdout)


def signed_entitlements(app: Path) -> dict:
    result = subprocess.run(
        ["codesign", "-d", "--entitlements", "-", "--xml", str(app)],
        check=True,
        capture_output=True,
    )
    return plistlib.loads(result.stdout) if result.stdout.strip() else {}


def verify(root: Path) -> list[str]:
    apps = list((root / "Payload").glob("*.app"))
    if len(apps) != 1:
        return [f"expected one app bundle, found {len(apps)}"]
    app = apps[0]
    errors: list[str] = []
    profile = decode_profile(app / "embedded.mobileprovision").get("Entitlements", {})
    signed = signed_entitlements(app)
    info = plistlib.loads((app / "Info.plist").read_bytes())
    wanted = info.get("AHDPushEnvironment")
    print(f"Info.plist AHDPushEnvironment: {wanted!r}")
    print(f"profile aps-environment: {profile.get('aps-environment')!r}")
    print(f"signed aps-environment: {signed.get('aps-environment')!r}")
    if wanted != "production":
        errors.append(f"AHDPushEnvironment is {wanted!r}, expected 'production' in a store build")
    if profile.get("aps-environment") != "production":
        errors.append("provisioning profile lacks aps-environment=production (enable Push Notifications on the App ID)")
    if signed.get("aps-environment") != "production":
        errors.append("signed app entitlements lack aps-environment=production")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("ipa", type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="ahdclient-push-") as directory:
        with zipfile.ZipFile(args.ipa) as archive:
            archive.extractall(directory)
        errors = verify(Path(directory))
    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        return 1
    print("PASS: the signed app can register for APNs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
