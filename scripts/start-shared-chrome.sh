#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${SCAFFOLD_SHARED_CHROME_HOST:-127.0.0.1}"
PORT="${SCAFFOLD_SHARED_CHROME_PORT:-9222}"
PROFILE_DIR="${SCAFFOLD_SHARED_CHROME_PROFILE:-$ROOT_DIR/.tmp/shared-chrome-profile}"
LOG_FILE="$ROOT_DIR/.tmp/shared-chrome.log"
PID_FILE="$ROOT_DIR/.tmp/shared-chrome.pid"
VERSION_URL="http://$HOST:$PORT/json/version"

mkdir -p "$PROFILE_DIR" "$(dirname "$LOG_FILE")"

if curl -fsS "$VERSION_URL" >/dev/null 2>&1; then
  echo "Shared Chrome already running at http://$HOST:$PORT"
  echo "Profile: $PROFILE_DIR"
  exit 0
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use but is not responding as a DevTools browser:" >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2
  exit 1
fi

CHROME_BIN="${CHROME_BIN:-}"
if [[ -z "$CHROME_BIN" ]]; then
  for candidate in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    if [[ -x "$candidate" ]]; then
      CHROME_BIN="$candidate"
      break
    fi
  done
fi

if [[ -z "$CHROME_BIN" ]]; then
  for candidate in google-chrome-stable google-chrome chromium chrome; do
    if command -v "$candidate" >/dev/null 2>&1; then
      CHROME_BIN="$(command -v "$candidate")"
      break
    fi
  done
fi

if [[ -z "$CHROME_BIN" || ! -x "$CHROME_BIN" ]]; then
  echo "Could not find Chrome. Set CHROME_BIN=/path/to/chrome and re-run." >&2
  exit 1
fi

if [[ "$CHROME_BIN" == /Applications/*.app/Contents/MacOS/* ]] && command -v open >/dev/null 2>&1; then
  open -na "${CHROME_BIN%/Contents/MacOS/*}" --args \
    --remote-debugging-address="$HOST" \
    --remote-debugging-port="$PORT" \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    about:blank \
    >>"$LOG_FILE" 2>&1
else
  nohup "$CHROME_BIN" \
    --remote-debugging-address="$HOST" \
    --remote-debugging-port="$PORT" \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    about:blank \
    >>"$LOG_FILE" 2>&1 &

  echo "$!" > "$PID_FILE"
fi

for _ in {1..50}; do
  if curl -fsS "$VERSION_URL" >/dev/null 2>&1; then
    echo "Shared Chrome ready at http://$HOST:$PORT"
    echo "Profile: $PROFILE_DIR"
    echo "Log: $LOG_FILE"
    echo "MCP: chrome-devtools-mcp --browserUrl http://$HOST:$PORT --experimentalPageIdRouting"
    exit 0
  fi
  sleep 0.2
done

echo "Chrome started but DevTools did not become ready. Log: $LOG_FILE" >&2
exit 1
