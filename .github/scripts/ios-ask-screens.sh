#!/usr/bin/env bash
# Screenshot the native Ask sheet on an iPhone and an iPad simulator for
# design review. Never fails the job: screenshots are evidence, not a gate.
set -u
app="$1"
bundle=net.lakesidegames.ahdclient
mkdir -p ios-screens
pick() {
  xcrun simctl list devices available --json | python3 -c "import json,sys
prefix=sys.argv[1]
for runtime, devices in json.load(sys.stdin)['devices'].items():
  if 'iOS' not in runtime: continue
  for d in devices:
    if d['name'].startswith(prefix): print(d['udid'], d['name'].replace(' ', '-')); sys.exit()" "$1"
}
for kind in iPhone iPad; do
  read -r udid name < <(pick "$kind") || true
  [ -z "${udid:-}" ] && { echo "no $kind simulator"; continue; }
  echo "== $kind: $name"
  xcrun simctl boot "$udid" 2>/dev/null
  xcrun simctl bootstatus "$udid" -b >/dev/null 2>&1
  xcrun simctl install "$udid" "$app" || continue
  xcrun simctl launch "$udid" "$bundle" >/dev/null
  sleep 25
  xcrun simctl io "$udid" screenshot "ios-screens/$kind-0-launcher.png" >/dev/null 2>&1
  xcrun simctl openurl "$udid" "ahdclient://ask"
  sleep 4
  xcrun simctl io "$udid" screenshot "ios-screens/$kind-1-opening.png" >/dev/null 2>&1
  sleep 15
  xcrun simctl io "$udid" screenshot "ios-screens/$kind-2-settled.png" >/dev/null 2>&1
  xcrun simctl shutdown "$udid" 2>/dev/null
done
ls -la ios-screens
exit 0
