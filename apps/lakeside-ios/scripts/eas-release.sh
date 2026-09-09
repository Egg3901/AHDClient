#!/bin/bash
set -euo pipefail
umask 077
export RUNNER_TEMP="$(mktemp -d)"
cleanup() { rm -rf "$RUNNER_TEMP" build; }
trap cleanup EXIT
for variable in APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_CONTENT APPLE_DEVELOPMENT_TEAM; do
  if [ -z "${!variable:-}" ]; then echo "Missing private release variable: $variable" >&2; exit 1; fi
done
brew install xcodegen
swift test --package-path Core
swift scripts/icons.swift
xcodegen generate
# Validate the exact uploaded source before signing either app.
bash scripts/simulator.sh LakesideAsk
bash scripts/simulator.sh LakesideOps
export LAKESIDE_RELEASE_TARGET=both
# Independent, increasing build numbers across CI providers.
export GITHUB_RUN_NUMBER="$(python3 -c 'from datetime import datetime, timezone; d=datetime.now(timezone.utc); print(str((d.date()-datetime(2020,1,1).date()).days)+d.strftime(".%H.%M"))')"
export GITHUB_STEP_SUMMARY=/dev/null
python3 ../../scripts/private-apple-command.py bash scripts/release.sh
python3 - <<'CHECK'
import json
rows = json.load(open('build/release-status.json'))
assert all(any(row['scheme'] == scheme and row['status'] == 'uploaded-awaiting-apple-processing' for row in rows) for scheme in ['LakesideOps', 'LakesideAsk']), 'Both uploads must be confirmed'
print('Ops and Ask uploaded to Apple. Processing is pending.')
CHECK
