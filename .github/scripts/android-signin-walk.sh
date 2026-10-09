#!/usr/bin/env bash
# Walk the sign-in path a player takes in the Android app (tickets 1387 and
# 1450): Enter multiplayer, the site's sign-in page, Continue with Discord,
# then back to the app with real input. Fails only when the app stops
# answering input (an ANR), never because a button moved or the site was
# slow, so it can run against the live site on every build.
# Expects the app installed and running. Writes screenshots and logs to probe/.
set -u
pkg=net.lakesidegames.ahdclient
mkdir -p probe
# Every device call is bounded: a wedged emulator must end the walk, not the job.
a() { timeout 40 adb "$@"; }
read -r W H < <(a shell wm size | tail -1 | grep -o "[0-9]*x[0-9]*" | tr x " ")
W=${W:-320}; H=${H:-640}
echo "screen ${W}x${H}"

step=0
focus() { a shell dumpsys window | grep -E "mCurrentFocus" | head -1 | tr -s ' '; }
snap() {
  step=$((step + 1))
  a exec-out screencap -p > "probe/walk-$step-$1.png"
  echo "=== $step $1: $(focus)"
}
# Centre of the first accessibility node whose line contains $1. uiautomator
# needs the window to go idle, so this only works on static pages (not the
# launcher's globe) and comes back empty when the UI thread is blocked.
center() {
  a shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  a exec-out cat /sdcard/ui.xml | tr '>' '\n' | grep -F -- "$1" | sed -n "${2:-1}p" |
    grep -o 'bounds="[^"]*"' | sed -E 's/bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]"/\1 \2 \3 \4/' |
    awk '{print int(($1+$3)/2), int(($2+$4)/2)}'
}

snap launcher
# Enter multiplayer is the full-width red button just above the middle.
a shell input tap $((W / 2)) $((H * 51 / 100))
sleep 15
snap site
# The site's Sign in, opened in the same app WebView through the widget link.
a shell am start -n "$pkg/.MainActivity" -a android.intent.action.VIEW -d "ahdclient://page/login" >/dev/null
sleep 15
snap login
# Bring the Discord button clear of the gesture bar before tapping it.
a shell input swipe $((W / 2)) $((H * 3 / 4)) $((W / 2)) $((H / 4)) 400
sleep 3
xy=$(center 'Continue with Discord')
echo "\"Continue with Discord\" at: ${xy:-not found}"
reached=0
if [ -n "$xy" ]; then a shell input tap $xy; reached=1; fi
sleep 8
snap after-discord
# Return the way a player does after the Discord app or browser, then give
# the app real input. A blocked UI thread cannot consume it, and Android
# raises an ANR five seconds later.
a shell am start -n "$pkg/.MainActivity" >/dev/null 2>&1
sleep 5
a shell input tap $((W / 2)) $((H / 8))
sleep 2
a shell input keyevent KEYCODE_DPAD_DOWN
sleep 15
snap back-in-app

pid=$(a shell pidof "$pkg" | tr -d '\r')
now=$(focus)
a logcat -d > probe/walk-logcat.txt
a shell dumpsys dropbox --print data_app_anr > probe/walk-anr.txt 2>&1
anr=0
if grep -q "ANR in $pkg" probe/walk-logcat.txt || grep -q "Process: $pkg" probe/walk-anr.txt || echo "$now" | grep -q "Not Responding"; then anr=1; fi
echo "process: ${pid:-NOT RUNNING}; reached Discord button: $reached; focus: $now"
echo "=== ANR record: main thread ==="
awk '/^"main"/{p=1} p&&/^$/{exit} p' probe/walk-anr.txt | head -40
echo "=== ANR and crash lines ==="
grep -E "ANR in|Input dispatching timed out|FATAL|panicked|AndroidRuntime" probe/walk-logcat.txt | tail -40
if [ "$anr" = 1 ]; then echo "RESULT: sign-in walk left the app not responding"; exit 1; fi
if [ "$reached" = 0 ]; then echo "RESULT: responsive, but the walk never reached the Discord button (site layout or network); not a failure"; exit 0; fi
echo "RESULT: responsive after Continue with Discord"
