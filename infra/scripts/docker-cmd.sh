#!/bin/bash
set -e

# Run Caddy in foreground so container exits if either process dies.
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
