#!/usr/bin/env bash
# Reproduce "the sign-in page slows down and stops responding" (ticket 1387).
# Page JavaScript runs in the WebView renderer, a separate process from the
# app, so CPU is sampled for every process, and the probe uses the page the
# way a player does: type into the fields, then tap Continue with Discord.
set -u
pkg=net.lakesidegames.ahdclient
mkdir -p probe
adb install -r -g app.apk
adb logcat -c
read -r W H < <(adb shell wm size | tail -1 | grep -o "[0-9]*x[0-9]*" | tr x " ")
echo "screen ${W}x${H}"
adb shell am start -W -n "$pkg/.MainActivity"
sleep 15
# The verified App Link for the Discord callback loads it in the app WebView;
# with no state the game answers with its login page, which is the page under test.
adb shell am start -W -a android.intent.action.VIEW -d "https://ahousedividedgame.com/api/auth/discord/callback?error=access_denied" "$pkg"
sleep 25

step=0
snap() {
  step=$((step + 1))
  adb exec-out screencap -p > "probe/$step-$1.png"
  echo "=== $step $1: top processes ==="
  adb shell top -b -n 1 -o PID,%CPU,RES,NAME | head -14
  adb shell dumpsys window | grep -E "mCurrentFocus" | head -1
}
# Centre of the first accessibility node whose line contains $1.
center() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb exec-out cat /sdcard/ui.xml | tr '>' '\n' | grep -F -- "$1" | sed -n "${2:-1}p" |
    grep -o 'bounds="[^"]*"' | sed -E 's/bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]"/\1 \2 \3 \4/' |
    awk '{print int(($1+$3)/2), int(($2+$4)/2)}'
}

snap login
echo "=== renderer and app CPU over 20s ==="
adb shell top -b -n 5 -d 4 -o PID,%CPU,RES,NAME | grep -E "ahdclient|webview|sandboxed|PID"

xy=$(center 'android.widget.EditText' 1)
echo "email field at: ${xy:-not found}"
[ -n "$xy" ] && adb shell input tap $xy && sleep 3 && adb shell input text probeuser && sleep 3
snap typed-email

xy=$(center 'android.widget.EditText' 2)
echo "password field at: ${xy:-not found}"
[ -n "$xy" ] && adb shell input tap $xy && sleep 3 && adb shell input text probepass && sleep 3
snap typed-password
adb shell input keyevent KEYCODE_BACK
sleep 2

xy=$(center 'Discord')
# Scroll the button clear of the gesture bar before tapping it.
adb shell input swipe $((W / 2)) $((H * 3 / 4)) $((W / 2)) $((H / 4)) 400
sleep 3
xy=$(center 'Discord')
echo "Discord button at: ${xy:-not found}"
snap before-discord
[ -n "$xy" ] && adb shell input tap $xy
sleep 12
snap after-discord-tap
# Come back the way a player would after the Discord app or browser.
adb shell am start -W -n "$pkg/.MainActivity"
sleep 10
snap back-in-app
echo "=== renderer and app CPU over 20s after return ==="
adb shell top -b -n 5 -d 4 -o PID,%CPU,RES,NAME | grep -E "ahdclient|webview|sandboxed|PID"

echo "process after probe: $(adb shell pidof "$pkg" | tr -d '\r')"
echo "=== ANR / app-not-responding ==="
adb shell dumpsys activity processes | grep -i -E "notResponding|anr" | head -10
adb logcat -d -b crash > probe/crash.txt
adb logcat -d > probe/logcat.txt
echo "=== page console and app log ==="
grep -E "ANR|Application Not Responding|CONSOLE|Console|Tauri|RustStdoutStderr|ahdclient|CompanionSafety|FATAL" probe/logcat.txt | tail -150
