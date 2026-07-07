#!/bin/sh
set -e

# Run database migrations
DATABASE_URL="file:/config/roomies.db" npx prisma db push --accept-data-loss

# Execute the passed command
exec "$@"
