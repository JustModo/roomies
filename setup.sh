#!/bin/bash
set -e

echo "=== Roomies Setup ==="

if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env from .env.example"
else
  echo "✅ .env file already exists"
fi

mkdir -p config
echo "✅ Ensured ./config directory exists for the SQLite database"

echo ""
echo "Setup complete! You can now start the application with:"
echo "docker-compose up -d --build"
echo ""
