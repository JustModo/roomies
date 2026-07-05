#!/bin/bash
set -e

echo "=== Roomies Setup ==="

if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env from .env.example"
else
  echo "✅ .env file already exists"
fi

# Securely generate POSTGRES_PASSWORD if it's empty
if grep -q "^POSTGRES_PASSWORD=$" .env; then
  # Generate a 32-character random hex string for the database password
  SECURE_PASS=$(openssl rand -hex 16)
  
  # Cross-platform sed for updating the variable inline
  sed -i.bak "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$SECURE_PASS/" .env
  rm -f .env.bak
  
  echo "✅ Generated secure POSTGRES_PASSWORD in .env"
fi

echo ""
echo "Setup complete! You can now start the application with:"
echo "docker-compose up -d --build"
echo ""
