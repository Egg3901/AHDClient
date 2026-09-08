#!/usr/bin/env python3
"""Verify that a built IPA can share its widget keychain records."""

from __future__ import annotations

import argparse
import plistlib
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path


SUFFIX = "net.lakesidegames.ahdclient.widgets"


def decode_profile(path: Path) -> dict:
    security = shutil.which("security")
    if security:
        command = [security, "cms", "-D", "-i", str(path)]
    else:
        command = ["openssl", "smime", "-verify", "-inform", "der", "-in", str(path), "-noverify"]
    return plistlib.loads(subprocess.run(command, check=True, capture_output=True).stdout)


def load_plist(path: Path) -> dict:
    return plistlib.loads(path.read_bytes())


def verify(root: Path) -> list[str]:
    errors: list[str] = []
    apps = list((root / "Payload").glob("*.app"))
    if len(apps) != 1:
        return [f"expected one app bundle, found {len(apps)}"]
    app = apps[0]
    extensions = list((app / "PlugIns").glob("AHDWidgets.appex"))
    if len(extensions) != 1:
        return [f"expected one AHDWidgets extension, found {len(extensions)}"]

    bundles = [app, extensions[0]]
    profiles = [decode_profile(bundle / "embedded.mobileprovision") for bundle in bundles]
    teams = {profile.get("TeamIdentifier", [None])[0] for profile in profiles}
    if None in teams or len(teams) != 1:
        return ["app and widget profiles do not have one matching team"]
    expected = f"{teams.pop()}.{SUFFIX}"

    for bundle, profile in zip(bundles, profiles):
        info = load_plist(bundle / "Info.plist")
        actual = info.get("AHDWidgetKeychainGroup")
        if actual != expected:
            errors.append(f"{bundle.name}: keychain group is {actual!r}, expected {expected!r}")
        allowed = profile.get("Entitlements", {}).get("keychain-access-groups", [])
        if expected not in allowed and not any(value == expected.split(".", 1)[0] + ".*" for value in allowed):
            errors.append(f"{bundle.name}: provisioning profile does not allow {expected}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("ipa", type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="ahdclient-ipa-") as directory:
        with zipfile.ZipFile(args.ipa) as archive:
            archive.extractall(directory)
        errors = verify(Path(directory))
    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        return 1
    print("PASS: app and widget use the same provisioned keychain group")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
