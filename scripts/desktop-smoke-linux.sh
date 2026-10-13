#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! -x "$1" ]]; then
  echo "usage: $0 /path/to/ahdclient-desktop" >&2
  exit 2
fi
for tool in xdotool timeout; do
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

timeout --signal=TERM 90s "$binary" >"$tmp/app.log" 2>&1 &
app_pid=$!
window=
for _ in $(seq 1 80); do
  window=$(xdotool search --onlyvisible --name '^desktop-smoke-ready$' 2>/dev/null | head -n 1 || true)
  [[ -n "$window" ]] && break
  kill -0 "$app_pid" 2>/dev/null || { cat "$tmp/app.log" >&2; exit 1; }
  sleep 0.25
done
[[ -n "$window" ]] || { cat "$tmp/app.log" >&2; echo "smoke window did not appear" >&2; exit 1; }
xdotool windowfocus --sync "$window"

click_and_wait_for_title() {
  local x=$1 y=$2 key=$3 expected=$4
  xdotool mousemove --window "$window" "$x" "$y" click 1
  sleep 0.4
  xdotool key "$key"
  for _ in $(seq 1 40); do
    [[ "$(xdotool getwindowname "$window")" == "$expected" ]] && return 0
    sleep 0.25
  done
  echo "confirmation did not produce title $expected" >&2
  cat "$tmp/app.log" >&2
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
cat "$tmp/opened-urls" "$tmp/app.log" 2>/dev/null >&2 || true
exit 1
