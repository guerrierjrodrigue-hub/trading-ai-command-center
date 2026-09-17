#!/bin/sh
# ============================================================
#  A UTILISER SUR LE SERVEUR CLOUD (Oracle) ou tout serveur Linux.
#  Recupere la derniere version depuis GitHub et relance le robot.
#  Usage :  sh update.sh
# ============================================================
cd "$(dirname "$0")" || exit 1
echo "=== Recuperation de la derniere version depuis GitHub ==="
git pull
echo
echo "=== Reconstruction et redemarrage du robot ==="
docker compose up -d --build
echo
echo "Robot a jour et relance."
