#!/usr/bin/env bash
# Build the widget render check for the iOS simulator and run it, writing
# PNGs of every widget kind and size to widget-renders/. Never fails the job:
# the images are review evidence, not a gate.
set -u
work="$RUNNER_TEMP/widget-render"
rm -rf "$work" && mkdir -p "$work"
sed '/^@main$/d' apps/desktop/src-tauri/ios-widgets/AHDWidgets.swift > "$work/AHDWidgets.swift"
cp scripts/widget-render/main.swift "$work/main.swift"
sdk=$(xcrun --sdk iphonesimulator --show-sdk-path)
if ! xcrun swiftc -swift-version 5 -target arm64-apple-ios17.0-simulator -sdk "$sdk" \
  "$work/main.swift" "$work/AHDWidgets.swift" apps/desktop/src-tauri/plugins/briefing-widgets/ios/Sources/BriefingStore.swift \
  -o "$work/widget-render"; then
  echo "widget render check did not compile"; exit 0
fi
udid=$(xcrun simctl list devices available --json | python3 -c "import json,sys
for runtime, devices in json.load(sys.stdin)['devices'].items():
  if 'iOS' in runtime:
    for d in devices:
      if d['name'].startswith('iPhone'): print(d['udid']); sys.exit()")
xcrun simctl boot "$udid" 2>/dev/null
xcrun simctl bootstatus "$udid" -b >/dev/null 2>&1
mkdir -p widget-renders
xcrun simctl spawn "$udid" "$work/widget-render" "$PWD/scripts/widget-render/briefing-fixture.json" "$PWD/widget-renders"
xcrun simctl shutdown "$udid" 2>/dev/null
ls -la widget-renders
exit 0
