#!/usr/bin/env sh
set -eu

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U postgres -d heartline > "backups/heartline-${TIMESTAMP}.sql"
echo "Backup written to backups/heartline-${TIMESTAMP}.sql"
