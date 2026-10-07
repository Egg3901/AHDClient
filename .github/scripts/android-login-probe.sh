#!/usr/bin/env bash
# Reproduce "the sign-in page slows down and stops responding" (ticket 1387).
set -u
pkg=net.lakesidegames.ahdclient
mkdir -p probe
adb install -r -g app.apk
adb logcat -c
adb shell am start -W -n "$pkg/.MainActivity"
sleep 15
# The verified App Link for the Discord callback loads it in the app WebView;
# with no state the game answers with its login page, which is the page under test.
adb shell am start -W -a android.intent.action.VIEW -d "https://ahousedividedgame.com/api/auth/discord/callback?error=access_denied" "$pkg"
sleep 25
adb exec-out screencap -p > probe/1-login.png
echo "=== CPU samples (pid, %cpu) ==="
pid=$(adb shell pidof "$pkg" | tr -d '\r')
echo "pid=${pid:-none}"
for i in 1 2 3 4 5; do adb shell top -b -n 1 -p "$pid" 2>/dev/null | tail -1; sleep 4; done
echo "=== tap the page and check it still answers ==="
adb shell input tap 540 1200
sleep 8
adb exec-out screencap -p > probe/2-after-tap.png
adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp" | head -3
echo "process after probe: $(adb shell pidof "$pkg" | tr -d '\r')"
echo "=== ANR / app-not-responding ==="
adb shell dumpsys activity processes | grep -i -E "notResponding|anr" | head -10
adb logcat -d -b crash > probe/crash.txt
adb logcat -d > probe/logcat.txt
grep -E "ANR|Application Not Responding|Skipped [0-9]+ frames|chromium|Console|Tauri|RustStdoutStderr|ahdclient|Choreographer" probe/logcat.txt | tail -300
