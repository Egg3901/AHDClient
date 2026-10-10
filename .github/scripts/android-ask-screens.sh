#!/usr/bin/env bash
# Screenshot the native Ask sheet for design review. Opens it through the
# ahdclient://ask deep link, then captures it before and after the account
# check settles. Never fails the job: screenshots are evidence, not a gate.
# Expects the app installed. Writes PNGs to probe/.
set -u
pkg=net.lakesidegames.ahdclient
mkdir -p probe
a() { timeout 40 adb "$@"; }
a shell am start -W -n "$pkg/.MainActivity" >/dev/null
sleep 12
a exec-out screencap -p > probe/ask-0-launcher.png
a shell am start -W -n "$pkg/.MainActivity" -a android.intent.action.VIEW -d "ahdclient://ask" >/dev/null
sleep 3
a exec-out screencap -p > probe/ask-1-opening.png
sleep 15
a exec-out screencap -p > probe/ask-2-settled.png
echo "Ask screenshots: $(ls probe/ask-*.png 2>/dev/null | tr '\n' ' ')"
exit 0
