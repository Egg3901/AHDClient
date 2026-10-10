#!/usr/bin/env bash
# Screenshot the native Ask sheet on an iPhone and an iPad simulator for
# design review, in both system appearances. The app is launched with
# -AHDAskPreview <state>, which opens the sheet over the launcher with a
# canned conversation and no account (see NativeAskPreview.swift). Ask follows
# the system appearance; the launcher stays dark in both. Never fails the job:
# screenshots are evidence, not a gate.
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
capture() {
  xcrun simctl io "$1" screenshot "ios-screens/$2.png" >/dev/null 2>&1 && echo "captured $2"
}
# shot <udid> <file> <state|launcher> <wait seconds>
shot() {
  local udid="$1" file="$2" state="$3" wait="$4"
  xcrun simctl terminate "$udid" "$bundle" >/dev/null 2>&1
  if [ "$state" = launcher ]; then
    xcrun simctl launch "$udid" "$bundle" >/dev/null
  else
    xcrun simctl launch "$udid" "$bundle" -AHDAskPreview "$state" >/dev/null
  fi
  sleep "$wait"
  capture "$udid" "$file"
}
for kind in iPad iPhone; do
  read -r udid name < <(pick "$kind") || true
  [ -z "${udid:-}" ] && { echo "no $kind simulator"; continue; }
  echo "== $kind: $name"
  xcrun simctl boot "$udid" 2>/dev/null
  xcrun simctl bootstatus "$udid" -b >/dev/null 2>&1
  xcrun simctl ui "$udid" appearance light
  xcrun simctl install "$udid" "$app" || continue
  # Light system appearance: the launch frame and the launcher must stay
  # dark (no white flash); Ask must render light.
  xcrun simctl launch "$udid" "$bundle" >/dev/null
  sleep 1
  capture "$udid" "$kind-0-launch-frame-light"
  sleep 24
  capture "$udid" "$kind-0-launcher-light"
  shot "$udid" "$kind-1-conversation-light" conversation 14
  shot "$udid" "$kind-2-history-light" history 12
  shot "$udid" "$kind-3-empty-light" empty 10
  shot "$udid" "$kind-4-streaming-light" streaming 10
  shot "$udid" "$kind-5-consent-light" consent 10
  shot "$udid" "$kind-6-signedout-light" signedout 10
  shot "$udid" "$kind-7-quota-light" quota 10
  # Dark system appearance: launcher and Ask both dark.
  xcrun simctl ui "$udid" appearance dark
  shot "$udid" "$kind-8-launcher-dark" launcher 12
  shot "$udid" "$kind-9-conversation-dark" conversation 12
  shot "$udid" "$kind-10-history-dark" history 12
  xcrun simctl ui "$udid" appearance light
  xcrun simctl shutdown "$udid" 2>/dev/null
done
ls -la ios-screens
exit 0
