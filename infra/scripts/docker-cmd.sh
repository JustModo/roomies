#!/bin/bash
set -e

# NOTE: `caddy run` (not `start`) stays in the foreground so its death is visible —
# the container must exit when either process dies, or Docker sees a healthy
# container that is silently serving nothing.
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!

node dist/index.js &
NODE_PID=$!

terminate() {
  kill -TERM "$NODE_PID" "$CADDY_PID" 2>/dev/null || true
}
trap terminate TERM INT

set +e
wait -n
EXIT=$?

echo "[cmd] Process exited (status $EXIT), stopping container"
terminate
wait
exit "$EXIT"
