#!/usr/bin/env bash
# Walk the sign-in path a player takes in the Android app (tickets 1387 and
# 1450): launcher, Enter multiplayer, the site's Sign in, Continue with
# Discord, then back to the app. Fails only when the app stops answering
# input (an ANR), never because a button moved or the site was slow, so it
# can run against the live site on every build.
# Expects the app installed and running. Writes screenshots and logs to probe/.
set -u
pkg=net.lakesidegames.ahdclient
mkdir -p probe
# Root lets the main-thread stack be dumped at the end (google_apis images).
timeout 30 adb root >/dev/null 2>&1 && timeout 60 adb wait-for-device
sleep 3
read -r W H < <(adb shell wm size | tail -1 | grep -o "[0-9]*x[0-9]*" | tr x " ")
echo "screen ${W}x${H}"

step=0
snap() {
  step=$((step + 1))
  timeout 20 adb exec-out screencap -p > "probe/walk-$step-$1.png"
  echo "=== $step $1: $(adb shell dumpsys window | grep -E "mCurrentFocus" | head -1 | tr -s ' ')"
}
# Centre of the first accessibility node whose line contains $1. uiautomator
# waits for the app to go idle, so a hung UI thread makes this come back empty.
center() {
  timeout 30 adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  timeout 10 adb exec-out cat /sdcard/ui.xml | tr '>' '\n' | grep -F -- "$1" | sed -n "${2:-1}p" |
    grep -o 'bounds="[^"]*"' | sed -E 's/bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]"/\1 \2 \3 \4/' |
    awk '{print int(($1+$3)/2), int(($2+$4)/2)}'
}
tap_text() {
  local xy
  xy=$(center "$1")
  echo "\"$1\" at: ${xy:-not found}"
  [ -n "$xy" ] && adb shell input tap $xy
}

snap launcher
tap_text 'Enter multiplayer'
sleep 20
snap site
tap_text 'Sign in'
sleep 15
snap login
# Bring the Discord button clear of the gesture bar before tapping it.
adb shell input swipe $((W / 2)) $((H * 3 / 4)) $((W / 2)) $((H / 4)) 400
sleep 3
reached_login=0
if tap_text 'Continue with Discord'; then reached_login=1; fi
sleep 8
snap after-discord
# Return the way a player does after the Discord app or browser, then give
# the app real input. A blocked UI thread cannot consume it, and Android
# raises an ANR five seconds later.
timeout 20 adb shell am start -n "$pkg/.MainActivity" >/dev/null 2>&1
sleep 5
adb shell input tap $((W / 2)) $((H / 2))
sleep 2
adb shell input keyevent KEYCODE_DPAD_DOWN
sleep 15
snap back-in-app

pid=$(adb shell pidof "$pkg" | tr -d '\r')
focus=$(adb shell dumpsys window | grep -E "mCurrentFocus" | head -1)
adb logcat -d > probe/walk-logcat.txt
anr=0
if grep -q "ANR in $pkg" probe/walk-logcat.txt || echo "$focus" | grep -q "Not Responding"; then anr=1; fi
echo "process: ${pid:-NOT RUNNING}; reached Discord button: $reached_login; focus: $focus"
if [ -n "$pid" ]; then
  # The main thread's stack names the call that holds it (root on google_apis).
  timeout 30 adb shell debuggerd -j "$pid" > probe/walk-java-stacks.txt 2>&1 ||
    timeout 30 adb shell su 0 debuggerd -j "$pid" > probe/walk-java-stacks.txt 2>&1 || true
  echo "=== main thread ==="
  awk '/^"main"/{p=1} p&&/^$/{exit} p' probe/walk-java-stacks.txt | head -40
fi
echo "=== ANR and crash lines ==="
grep -E "ANR in|Input dispatching timed out|FATAL|panicked|AndroidRuntime" probe/walk-logcat.txt | tail -40
if [ "$anr" = 1 ]; then echo "RESULT: sign-in walk left the app not responding"; exit 1; fi
if [ "$reached_login" = 0 ]; then echo "RESULT: responsive, but the walk never reached the Discord button (site layout or network); not a failure"; exit 0; fi
echo "RESULT: responsive after Continue with Discord"
