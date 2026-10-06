#!/usr/bin/env bash
# Run inside the emulator runner: install, launch, wait, report.
set -u
pkg=net.lakesidegames.ahdclient
adb logcat -c
adb install -r -g app.apk
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
