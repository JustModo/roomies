#!/bin/sh
set -e

# Start Caddy in the background using docker specific Caddyfile
caddy start --config /etc/caddy/Caddyfile --adapter caddyfile

# Start the Node.js API server in the foreground
exec node dist/index.js
