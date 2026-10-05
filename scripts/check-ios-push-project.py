#!/usr/bin/env python3
"""Check the generated Xcode project asks for the APNs entitlement.

Runs after configure-ios-widgets.rb on every build, signed or not, so a
project that would ship without push is caught on the pull request.
Prints the entitlement and the release value it resolves to; nothing else.
"""

from __future__ import annotations

import json
import plistlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "apps/desktop/src-tauri/gen/apple"


def main() -> int:
    projects = list(ROOT.glob("*.xcodeproj"))
    if len(projects) != 1:
        print(f"FAIL: expected one Xcode project, found {len(projects)}")
        return 1
    listing = json.loads(subprocess.run(
        ["xcodebuild", "-list", "-json", "-project", str(projects[0])],
        check=True, capture_output=True, text=True).stdout)
    schemes = [name for name in listing["project"].get("schemes", []) if name.endswith("_iOS")]
    if len(schemes) != 1:
        print(f"FAIL: expected one *_iOS scheme, found {schemes}")
        return 1
    settings = json.loads(subprocess.run(
        ["xcodebuild", "-showBuildSettings", "-json", "-project", str(projects[0]),
         "-scheme", schemes[0], "-configuration", "release", "-sdk", "iphoneos"],
        check=True, capture_output=True, text=True).stdout)
    app = next(entry["buildSettings"] for entry in settings
               if entry["buildSettings"].get("WRAPPER_EXTENSION") == "app")
    resolved = app.get("AHD_PUSH_ENVIRONMENT")
    entitlements_path = app.get("CODE_SIGN_ENTITLEMENTS")
    print(f"release AHD_PUSH_ENVIRONMENT: {resolved!r}")
    print(f"CODE_SIGN_ENTITLEMENTS: {entitlements_path!r}")
    errors = []
    if resolved != "production":
        errors.append("release builds do not resolve AHD_PUSH_ENVIRONMENT to production")
    if not entitlements_path:
        errors.append("the app target has no entitlements file")
    else:
        entitlements = plistlib.loads((ROOT / entitlements_path).read_bytes())
        aps = entitlements.get("aps-environment")
        print(f"entitlements aps-environment: {aps!r}")
        if aps != "production":
            errors.append("the entitlements file does not request aps-environment")
    for error in errors:
        print(f"FAIL: {error}")
    if not errors:
        print("PASS: the project requests the production APNs entitlement")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
