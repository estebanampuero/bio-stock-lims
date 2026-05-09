#!/bin/bash
# BIO-STOCK LIMS — Backup automático de base de datos
# Diseñado para correr como cron job o manualmente

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$ROOT_DIR/data"
BACKUP_DIR="$ROOT_DIR/backups"
DB_FILE="inventario_biorad.db"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/biostock_$TIMESTAMP.db"
LOG_FILE="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ── Verificar que la DB existe ────────────────────────────────────────────────
if [ ! -f "$DATA_DIR/$DB_FILE" ]; then
    log "ERROR: No se encontró $DATA_DIR/$DB_FILE"
    exit 1
fi

# ── Backup via VACUUM INTO (backup online, no corrompe DB activa) ─────────────
log "Iniciando backup: $BACKUP_FILE"

node -e "
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('$DATA_DIR/$DB_FILE', (err) => {
  if(err) { console.error(err); process.exit(1); }
  db.run('VACUUM INTO ?', ['$BACKUP_FILE'], (err2) => {
    if(err2) { console.error(err2); process.exit(1); }
    db.close();
    process.exit(0);
  });
});
"

# Verificar que el backup se creó y tiene tamaño
if [ ! -s "$BACKUP_FILE" ]; then
    log "ERROR: El backup se creó vacío o falló."
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup exitoso: $BACKUP_FILE ($BACKUP_SIZE)"

# ── Comprimir backup ──────────────────────────────────────────────────────────
if command -v gzip &> /dev/null; then
    gzip "$BACKUP_FILE"
    log "Backup comprimido: ${BACKUP_FILE}.gz"
fi

# ── Eliminar backups antiguos ─────────────────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "biostock_*.db*" -mtime "+$RETENTION_DAYS" -delete -print | wc -l)
log "Limpieza: $DELETED backups eliminados (retención: $RETENTION_DAYS días)"

log "Backup completado exitosamente."
