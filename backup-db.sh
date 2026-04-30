#!/bin/bash
# Backup manual de la DB de Railway
# Uso: ./backup-db.sh

set -e

if [ -z "$DB_URL" ]; then
  echo "❌ Error: la variable \$DB_URL no está seteada."
  echo "   Ejecutá primero: export DB_URL='postgresql://...'"
  exit 1
fi

PG_BIN="/c/Program Files/PostgreSQL/18/bin"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="backups/centralmillwork_${TIMESTAMP}.sql"

echo "🔄 Iniciando backup..."
echo "   Destino: $OUTPUT_FILE"

"$PG_BIN/pg_dump.exe" "$DB_URL" --no-owner --no-acl -f "$OUTPUT_FILE"

SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
echo "✅ Backup completado: $OUTPUT_FILE ($SIZE)"

# Mostrar últimos 5 backups
echo ""
echo "📂 Backups disponibles:"
ls -lh backups/ | tail -6
