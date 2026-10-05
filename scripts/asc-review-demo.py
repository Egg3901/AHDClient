#!/usr/bin/env python3
"""Set the App Review demo account on the editable App Store version.

Env: APPLE_API_ISSUER, APPLE_API_KEY, APPLE_API_KEY_PATH, DEMO_USER,
DEMO_PASSWORD (from a repository secret, never a workflow input: inputs are
visible in public run logs). Prints the version and the username only.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

BUNDLE_ID = "net.lakesidegames.ahdclient"
API = "https://api.appstoreconnect.apple.com/v1"
EDITABLE = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"}


def token() -> str:
    with open(os.environ["APPLE_API_KEY_PATH"], encoding="utf-8") as handle:
        key = handle.read()
    now = int(time.time())
    return jwt.encode(
        {"iss": os.environ["APPLE_API_ISSUER"], "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"},
        key, algorithm="ES256", headers={"kid": os.environ["APPLE_API_KEY"], "typ": "JWT"})


def call(method: str, path: str, auth: str, body: dict | None = None) -> dict:
    request = urllib.request.Request(
        API + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {auth}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")[:300]
        raise SystemExit(f"FAIL: App Store Connect {method} {path.split('?')[0]} -> {error.code} {detail}")
    return json.loads(raw) if raw else {}


def main() -> int:
    user, password = os.environ["DEMO_USER"].strip(), os.environ["DEMO_PASSWORD"]
    if not user or not password:
        print("FAIL: DEMO_USER and the ASC_DEMO_PASSWORD secret are required")
        return 1
    auth = token()
    apps = call("GET", "/apps?" + urllib.parse.urlencode({"filter[bundleId]": BUNDLE_ID}), auth)["data"]
    if len(apps) != 1:
        print(f"FAIL: expected one app for {BUNDLE_ID}, found {len(apps)}")
        return 1
    versions = call("GET", f"/apps/{apps[0]['id']}/appStoreVersions?"
                    + urllib.parse.urlencode({"filter[platform]": "IOS", "limit": 20}), auth)["data"]
    editable = [v for v in versions if v["attributes"]["appStoreState"] in EDITABLE]
    if len(editable) != 1:
        print(f"FAIL: expected one editable iOS version, found {[v['attributes']['versionString'] for v in editable]}")
        return 1
    version = editable[0]
    fields = {"demoAccountName": user, "demoAccountPassword": password, "demoAccountRequired": True}
    detail = call("GET", f"/appStoreVersions/{version['id']}/appStoreReviewDetail", auth).get("data")
    if detail:
        call("PATCH", f"/appStoreReviewDetails/{detail['id']}", auth,
             {"data": {"type": "appStoreReviewDetails", "id": detail["id"], "attributes": fields}})
    else:
        call("POST", "/appStoreReviewDetails", auth, {"data": {
            "type": "appStoreReviewDetails", "attributes": fields,
            "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": version["id"]}}}}})
    print(f"PASS: App Review demo account set to {user!r} on version {version['attributes']['versionString']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
