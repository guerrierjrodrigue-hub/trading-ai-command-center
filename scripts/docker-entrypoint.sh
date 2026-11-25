#!/bin/sh
set -e

echo "→ Applying database schema (prisma db push)…"
npx prisma db push --skip-generate

# Seed (catalogue d'actifs) en ARRIÈRE-PLAN pour que le serveur réponde au plus
# vite. Idempotent, et il s'arrête immédiatement si le catalogue est déjà là.
( npx prisma db seed || echo "Seed skipped or already applied." ) &

echo "→ Starting Next.js server on :${PORT:-3000}…"
exec npm run start -- -H 0.0.0.0 -p "${PORT:-3000}"
