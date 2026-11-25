#!/bin/sh
cd "$(dirname "$0")" || exit 1
git pull
docker compose pull
docker compose up -d
echo "Deploiement termine (app + worker depuis GHCR)."
