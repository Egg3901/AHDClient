#!/usr/bin/env bash
# Screenshot the native Ask sheet on an iPhone and an iPad simulator for
# design review. The app is launched with -AHDAskPreview <state>, which opens
# the sheet over the launcher with a canned conversation and no account (see
# NativeAskPreview.swift). Never fails the job: screenshots are evidence, not
# a gate.
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
shot() {
  local udid="$1" file="$2" state="$3" wait="$4"
  xcrun simctl terminate "$udid" "$bundle" >/dev/null 2>&1
  xcrun simctl launch "$udid" "$bundle" -AHDAskPreview "$state" >/dev/null
  sleep "$wait"
  xcrun simctl io "$udid" screenshot "ios-screens/$file.png" >/dev/null 2>&1 && echo "captured $file"
}
for kind in iPad iPhone; do
  read -r udid name < <(pick "$kind") || true
  [ -z "${udid:-}" ] && { echo "no $kind simulator"; continue; }
  echo "== $kind: $name"
  xcrun simctl boot "$udid" 2>/dev/null
  xcrun simctl bootstatus "$udid" -b >/dev/null 2>&1
  xcrun simctl install "$udid" "$app" || continue
  xcrun simctl ui "$udid" appearance light >/dev/null 2>&1
  # The first launch warms the webview and the map renderer.
  shot "$udid" "$kind-1-conversation" conversation 30
  shot "$udid" "$kind-2-history" history 12
  shot "$udid" "$kind-3-empty" empty 10
  shot "$udid" "$kind-4-streaming" streaming 10
  shot "$udid" "$kind-5-consent" consent 10
  shot "$udid" "$kind-6-signedout" signedout 10
  shot "$udid" "$kind-7-quota" quota 10
  xcrun simctl ui "$udid" appearance dark >/dev/null 2>&1
  shot "$udid" "$kind-8-conversation-dark" conversation 12
  shot "$udid" "$kind-9-history-dark" history 12
  xcrun simctl ui "$udid" appearance light >/dev/null 2>&1
  xcrun simctl shutdown "$udid" 2>/dev/null
done
ls -la ios-screens
exit 0
