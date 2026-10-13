#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! -x "$1" ]]; then
  echo "usage: $0 /path/to/ahdclient-desktop" >&2
  exit 2
fi
for tool in xdotool timeout xwininfo; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 2; }
done

binary=$(realpath "$1")
tmp=$(mktemp -d)
app_pid=
cleanup() {
  if [[ -n "$app_pid" ]]; then kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true; fi
  rm -rf "$tmp"
}
trap cleanup EXIT
mkdir -p "$tmp/bin"
cat >"$tmp/bin/xdg-open" <<'OPENER'
#!/usr/bin/env bash
printf '%s\n' "$1" >>"$AHD_SMOKE_OPEN_LOG"
OPENER
chmod +x "$tmp/bin/xdg-open"
export AHD_SMOKE_OPEN_LOG="$tmp/opened-urls"
export PATH="$tmp/bin:$PATH"
export XDG_DATA_HOME="$tmp/data"
export XDG_CONFIG_HOME="$tmp/config"
export XDG_CACHE_HOME="$tmp/cache"

dump_debug() {
  local focused
  focused=$(xdotool getwindowfocus 2>/dev/null || true)
  printf 'Focused X11 window: %s\n' "${focused:-<none>}" >&2
  if [[ -n "$focused" ]]; then
    xdotool getwindowname "$focused" >&2 2>/dev/null || true
    xwininfo -id "$focused" 2>&1 >&2 || true
  fi
  echo "X11 windows found by xdotool:" >&2
  for id in $(xdotool search --all --name '.*' 2>/dev/null || true); do
    printf 'window %s title=' "$id" >&2
    xdotool getwindowname "$id" 2>/dev/null >&2 || true
  done
  echo "X11 root tree:" >&2
  xwininfo -root -tree 2>&1 >&2 || true
  echo "Application log tail:" >&2
  tail -n 40 "$tmp/app.log" >&2 || true
}

timeout --signal=TERM 90s "$binary" >"$tmp/app.log" 2>&1 &
app_pid=$!
window=
for _ in $(seq 1 80); do
  window=$(xdotool search --onlyvisible --name '^desktop-smoke-ready$' 2>/dev/null | head -n 1 || true)
  [[ -n "$window" ]] && break
  kill -0 "$app_pid" 2>/dev/null || { dump_debug; exit 1; }
  sleep 0.25
done
if [[ -z "$window" ]]; then
  echo "smoke window did not appear" >&2
  dump_debug
  exit 1
fi
xdotool windowfocus --sync "$window"

click_and_wait_for_title() {
  local x=$1 y=$2 key=$3 expected=$4
  xdotool mousemove --sync --window "$window" "$x" "$y" click 1
  # A native WebKit confirm is a separate modal GTK window. Wait until it
  # owns X11 keyboard focus so Return/Escape cannot be consumed by the page.
  local dialog_focus=
  for _ in $(seq 1 40); do
    dialog_focus=$(xdotool getwindowfocus 2>/dev/null || true)
    [[ -n "$dialog_focus" && "$dialog_focus" != "$window" ]] && break
    sleep 0.125
  done
  if [[ -z "$dialog_focus" || "$dialog_focus" == "$window" ]]; then
    echo "native confirmation did not take keyboard focus" >&2
    dump_debug
    return 1
  fi
  xdotool key "$key"
  for _ in $(seq 1 40); do
    [[ "$(xdotool getwindowname "$window")" == "$expected" ]] && return 0
    sleep 0.25
  done
  echo "confirmation did not produce title $expected" >&2
  dump_debug
  return 1
}

click_and_wait_for_title 140 62 Return smoke-accepted
click_and_wait_for_title 140 122 Escape smoke-cancelled

# target=_blank exercises the production new-window denial/opener callback.
xdotool mousemove --window "$window" 150 182 click 1
# target=_self exercises the guarded on_navigation/opener callback.
sleep 0.5
xdotool mousemove --window "$window" 150 242 click 1
for _ in $(seq 1 40); do
  if [[ -f "$AHD_SMOKE_OPEN_LOG" ]] \
    && grep -Fqx 'https://example.invalid/desktop-smoke-blank' "$AHD_SMOKE_OPEN_LOG" \
    && grep -Fqx 'https://example.invalid/desktop-smoke-self' "$AHD_SMOKE_OPEN_LOG" \
    && [[ "$(xdotool getwindowname "$window")" == smoke-cancelled ]]; then
    echo "desktop smoke passed: synchronous confirm accept/cancel and guarded external links"
    exit 0
  fi
  sleep 0.25
done
echo "expected external URLs were not handed to the isolated xdg-open stub" >&2
cat "$tmp/opened-urls" 2>/dev/null >&2 || true
tail -n 40 "$tmp/app.log" >&2 || true
exit 1
