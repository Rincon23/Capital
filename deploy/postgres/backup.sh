#!/bin/sh
# Backup diário do Capital com rotação: 7 dumps diários + 4 semanais (os de domingo).
# Roda em loop no container `backup`. Se o Pi estiver desligado no horário, o backup do dia
# é feito assim que ele voltar. Conexão via PGHOST/PGUSER/PGPASSWORD (docker-compose.yml).
set -u

DIR=/backups
HOUR="${BACKUP_HOUR:-3}"
DATABASES="${BACKUP_DATABASES:-capital}"
FIRST_DB="${DATABASES%% *}"

mkdir -p "$DIR/daily" "$DIR/weekly"
chmod 700 "$DIR" 2>/dev/null || true

log() { echo "$(date '+%F %T') $*"; }

run_backup() {
  day="$1"
  for db in $DATABASES; do
    tmp="$DIR/daily/.$db-$day.dump.tmp"
    if pg_dump --format=custom --dbname="$db" --file="$tmp"; then
      mv "$tmp" "$DIR/daily/$db-$day.dump"
      if [ "$(date +%u)" = 7 ]; then cp "$DIR/daily/$db-$day.dump" "$DIR/weekly/$db-$day.dump"; fi
      log "backup ok: $db-$day.dump"
    else
      rm -f "$tmp"
      log "ERRO no backup de $db (nova tentativa em 10 min)" >&2
      return 1
    fi
  done
  # Usuários e senhas (hash), para uma restauração completa do zero.
  pg_dumpall --globals-only --file="$DIR/daily/globals-$day.sql" || log "aviso: globals não salvos" >&2
  find "$DIR/daily" -type f -mtime +6 -delete
  find "$DIR/weekly" -type f -mtime +27 -delete
}

log "backup do Capital ativo: bancos [$DATABASES], diário a partir das ${HOUR}h"
while true; do
  day=$(date +%F)
  hour=$(date +%H)
  hour=${hour#0}
  if [ "$hour" -ge "$HOUR" ] && [ ! -f "$DIR/daily/$FIRST_DB-$day.dump" ]; then
    run_backup "$day" || true
  fi
  sleep 600
done
