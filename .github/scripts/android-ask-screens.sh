#!/usr/bin/env bash
# Screenshot the native Ask sheet for design review. The preview link
# (ahdclient://ask?preview=1) renders a canned chat with no network, so the
# states below are the same on every run: the chat in light and dark, the
# rich answer further up, and the history list. Then the real sheet through
# ahdclient://ask, before and after the account check settles. Never fails
# the job: screenshots are evidence, not a gate. Writes PNGs to probe/.
set -u
pkg=net.lakesidegames.ahdclient
mkdir -p probe
a() { timeout 40 adb "$@"; }
shot() { a exec-out screencap -p > "probe/ask-$1.png"; }

size=$(a shell wm size | sed -n 's/.*: *\([0-9]*x[0-9]*\).*/\1/p' | tail -1)
width=${size%x*}; height=${size#*x}
width=${width:-320}; height=${height:-640}

# Tap the view whose content description matches, using the live hierarchy.
tap_desc() {
  a shell uiautomator dump /sdcard/ask-ui.xml >/dev/null 2>&1
  a shell cat /sdcard/ask-ui.xml > probe/ask-ui.xml 2>/dev/null
  python3 - "$1" <<'PY' > probe/ask-tap.txt
import re, sys
xml = open("probe/ask-ui.xml", encoding="utf-8", errors="ignore").read()
for node in re.findall(r"<node [^>]*>", xml):
    if f'content-desc="{sys.argv[1]}"' in node:
        m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
        if m:
            x1, y1, x2, y2 = map(int, m.groups())
            print((x1 + x2) // 2, (y1 + y2) // 2)
            break
PY
  read -r x y < probe/ask-tap.txt || true
  if [ -n "${x:-}" ]; then a shell input tap "$x" "$y"; else echo "no view labelled '$1'"; fi
}

scroll_up() { a shell input swipe $((width / 2)) $((height * 30 / 100)) $((width / 2)) $((height * 85 / 100)) 400; }

preview() {
  local mode=$1
  a shell input keyevent 111
  a shell cmd uimode night "$mode" >/dev/null 2>&1
  sleep 3
  a shell am start -W -n "$pkg/.MainActivity" -a android.intent.action.VIEW -d "ahdclient://ask?preview=1" >/dev/null
  sleep 5
  shot "$2-chat"
  scroll_up; sleep 1; scroll_up; sleep 2
  shot "$2-rich"
  tap_desc "Chat history"; sleep 3
  shot "$2-history"
  a shell input keyevent 4; sleep 1
  a shell input keyevent 4; sleep 2
}

a shell am start -W -n "$pkg/.MainActivity" >/dev/null
sleep 12
shot 0-launcher
# Leave whatever page the sign-in walk opened, keyboard included.
a shell input keyevent 111
sleep 1
preview no 1-light
preview yes 2-dark
if [ "${ASK_LAYOUT_BOUNDS:-1}" = 1 ]; then
  a shell cmd uimode night no >/dev/null 2>&1; sleep 2
  a shell setprop debug.layout true; a shell service call activity 1599295570 >/dev/null 2>&1
  a shell am start -W -n "$pkg/.MainActivity" -a android.intent.action.VIEW -d "ahdclient://ask?preview=1" >/dev/null
  sleep 5; shot 9-bounds
  a shell input keyevent 4; sleep 1
  a shell setprop debug.layout false; a shell service call activity 1599295570 >/dev/null 2>&1
fi
a shell cmd uimode night no >/dev/null 2>&1
sleep 3
a shell am start -W -n "$pkg/.MainActivity" -a android.intent.action.VIEW -d "ahdclient://ask" >/dev/null
sleep 3
shot 3-live-opening
sleep 15
shot 4-live-settled
echo "Ask screenshots: $(ls probe/ask-*.png 2>/dev/null | tr '\n' ' ')"
exit 0
