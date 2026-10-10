#!/usr/bin/env bash
# Install an APK on the emulator, launch it, and walk the player's sign-in
# path (tickets 1387 and 1450). See android-signin-walk.sh for the checks.
set -u
pkg=net.lakesidegames.ahdclient
mkdir -p probe
adb install -r -g app.apk
adb logcat -c
adb shell am start -W -n "$pkg/.MainActivity"
sleep 20
echo "=== renderer and app CPU at the launcher ==="
adb shell top -b -n 3 -d 4 -o PID,%CPU,RES,NAME | grep -E "ahdclient|webview|sandboxed|PID"
bash .github/scripts/android-signin-walk.sh
