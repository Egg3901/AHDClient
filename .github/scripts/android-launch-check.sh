#!/usr/bin/env bash
# Run inside the emulator runner: install, launch, wait, report.
set -u
pkg=net.lakesidegames.ahdclient
apksigner=$(ls "$ANDROID_HOME"/build-tools/*/apksigner | sort -V | tail -1)
# Pull-request builds have no release keystore, so their APK is unsigned and
# the emulator refuses it. Sign a copy with a throwaway debug key; the code
# under test is unchanged.
if ! "$apksigner" verify app.apk >/dev/null 2>&1; then
  keytool -genkeypair -keystore launch-test.jks -storepass launchtest -keypass launchtest \
    -alias launchtest -keyalg RSA -keysize 2048 -validity 1 -dname "CN=launch test" >/dev/null 2>&1
  "$apksigner" sign --ks launch-test.jks --ks-pass pass:launchtest --key-pass pass:launchtest app.apk
  echo "APK was unsigned; signed with a throwaway key for the launch test"
fi
adb logcat -c
if ! adb install -r -g app.apk; then echo "RESULT: install failed (not a launch result)"; exit 1; fi
adb shell am start -W -n "$pkg/.MainActivity"
sleep 30
pid=$(adb shell pidof "$pkg" | tr -d '\r')
echo "process after 30s: ${pid:-NOT RUNNING}"
echo "=== crash buffer ==="
adb logcat -d -b crash
echo "=== app, runtime and native crash lines ==="
adb logcat -d | grep -E "AndroidRuntime|FATAL|DEBUG|libc|tombstone|RustStdoutStderr|panicked|ahdclient|Tauri|chromium|WebView" | tail -400
if [ -z "$pid" ]; then echo "RESULT: crashed or exited on launch"; exit 1; fi
echo "RESULT: running"
