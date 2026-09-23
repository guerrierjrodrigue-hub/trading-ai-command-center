#!/bin/sh
# Sauvegarde quotidienne de la base Postgres (conteneur docker compose "db"),
# avec rotation (garde les 14 plus recents) et log dans ~/backups/backup.log.
set -eu

cd "$(dirname "$0")/.."

BACKUP_DIR="$HOME/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
KEEP=14

mkdir -p "$BACKUP_DIR"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/tacc-$TIMESTAMP.sql.gz"
TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT

if ! docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$TMP_FILE" 2>>"$LOG_FILE"; then
  log "ECHEC: pg_dump a echoue, aucune sauvegarde creee"
  exit 1
fi

if [ ! -s "$TMP_FILE" ]; then
  log "ECHEC: dump vide (0 octet), aucune sauvegarde creee"
  exit 1
fi

gzip -c "$TMP_FILE" > "$BACKUP_FILE"

if [ ! -s "$BACKUP_FILE" ]; then
  rm -f "$BACKUP_FILE"
  log "ECHEC: fichier compresse vide, aucune sauvegarde conservee"
  exit 1
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "OK: $(basename "$BACKUP_FILE") ($SIZE)"

# Rotation: ne garde que les $KEEP sauvegardes les plus recentes.
cd "$BACKUP_DIR"
ls -1 tacc-*.sql.gz 2>/dev/null | sort -r | tail -n "+$((KEEP + 1))" | while IFS= read -r old; do
  rm -f "$old"
done
