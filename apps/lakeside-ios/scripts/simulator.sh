#!/bin/bash
set -euo pipefail
scheme="${1:?scheme required}"
case "$scheme" in LakesideAsk|LakesideOps) ;; *) exit 2 ;; esac
simulator_id=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(v["udid"] for k,vs in sorted(d["devices"].items(), reverse=True) if "iOS" in k for v in vs if v["name"].startswith("iPhone")))')
xcodebuild test -project Lakeside.xcodeproj -scheme "$scheme" \
  -destination "platform=iOS Simulator,id=$simulator_id" \
  -derivedDataPath "build/$scheme" -resultBundlePath "build/$scheme.xcresult" \
  -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO
