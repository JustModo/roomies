#!/bin/sh
set -e

DB_PATH=/config/roomies.db
export DATABASE_URL="file:$DB_PATH"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node /config /cache

  NODE_GROUPS=$(id -G node | tr ' ' ',')
  for device in /dev/dri/*; do
    [ -e "$device" ] && NODE_GROUPS="$NODE_GROUPS,$(stat -c %g "$device")"
  done

  export HOME=/home/node
  exec setpriv --reuid=node --regid=node --groups="$NODE_GROUPS" "$0" "$@"
fi

# Run database migrations
if [ -f "$DB_PATH" ]; then
  cp "$DB_PATH" "$DB_PATH.bak"

  NEEDS_BASELINE=$(node -e "
    require('@libsql/client').createClient({ url: process.env.DATABASE_URL })
      .execute(\"SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('User', '_prisma_migrations')\")
      .then((r) => { const names = r.rows.map((row) => row.name); console.log(names.includes('User') && !names.includes('_prisma_migrations') ? 'yes' : 'no'); });
  ")
  if [ "$NEEDS_BASELINE" = "yes" ]; then
    npx prisma migrate resolve --applied 0_init
  fi
fi

npx prisma migrate deploy

# Execute the passed command
exec "$@"
