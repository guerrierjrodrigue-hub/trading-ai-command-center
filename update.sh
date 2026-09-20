#!/bin/sh
cd "$(dirname "$0")" || exit 1
git pull
docker compose pull app
docker compose up -d app
echo "Deploiement termine (image GHCR)."
