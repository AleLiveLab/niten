#!/usr/bin/env bash
# Copia de seguridad de la base de datos y las fotos. Programalo con cron, ej:
# 0 4 * * * /opt/niten/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
stamp=$(date +%Y%m%d-%H%M)
sqlite3 data/niten.db ".backup backups/niten-$stamp.db" 2>/dev/null || cp data/niten.db "backups/niten-$stamp.db"
tar -czf "backups/uploads-$stamp.tgz" uploads
find backups -type f -mtime +14 -delete
echo "Backup listo: backups/*-$stamp.*"
