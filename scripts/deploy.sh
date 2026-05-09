#!/bin/bash
# BIO-STOCK LIMS — Script de despliegue para Linux/macOS
set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}"
echo "████████████████████████████████████████████████████████"
echo "█        BIO-STOCK LIMS Pro - Instalador Linux         █"
echo "████████████████████████████████████████████████████████"
echo -e "${NC}"

# ── Verificar prerequisitos ──────────────────────────────────────────────────
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}[ERROR]${NC} '$1' no está instalado. Instálalo primero."
        exit 1
    fi
}

check_command docker
check_command docker-compose-v1 2>/dev/null || check_command docker

if ! docker info &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Docker no está corriendo. Inicia el servicio primero."
    echo "  sudo systemctl start docker"
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Docker funcionando."

# ── Archivo .env ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$ROOT_DIR/.env" ]; then
    echo -e "${YELLOW}[AVISO]${NC} Creando .env desde .env.example..."
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo " ACCIÓN REQUERIDA: Edita el archivo .env"
    echo " Cambia JWT_SECRET y JWT_REFRESH_SECRET:"
    echo ""
    echo " node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
    echo "═══════════════════════════════════════════════════"
    echo ""
    nano "$ROOT_DIR/.env" 2>/dev/null || vi "$ROOT_DIR/.env"
fi

# ── Crear directorios ────────────────────────────────────────────────────────
mkdir -p "$ROOT_DIR/data" "$ROOT_DIR/backups" "$ROOT_DIR/logs"
echo -e "${GREEN}[OK]${NC} Directorios creados."

# ── Obtener IP del servidor ───────────────────────────────────────────────────
SERVER_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")

echo ""
echo "═══════════════════════════════════════════════════"
echo " IP del servidor: $SERVER_IP"
echo " Los clientes acceden en: http://$SERVER_IP"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Build y deploy ───────────────────────────────────────────────────────────
cd "$ROOT_DIR"

echo -e "[1/3] Construyendo imágenes Docker..."
docker compose build --no-cache

echo ""
echo -e "[2/3] Iniciando servicios..."
docker compose up -d

echo ""
echo -e "[3/3] Verificando estado..."
sleep 10
docker compose ps

# ── Cron para backup automático ───────────────────────────────────────────────
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"
chmod +x "$BACKUP_SCRIPT"

if ! crontab -l 2>/dev/null | grep -q "biostock-backup"; then
    (crontab -l 2>/dev/null; echo "0 2 * * * $BACKUP_SCRIPT >> $ROOT_DIR/logs/backup-cron.log 2>&1 # biostock-backup") | crontab -
    echo -e "${GREEN}[OK]${NC} Backup automático configurado (diario 02:00 AM)"
fi

echo ""
echo -e "${GREEN}"
echo "████████████████████████████████████████████████████████"
echo "█    SISTEMA EN LÍNEA - BIO-STOCK LIMS Pro             █"
echo "█                                                      █"
echo "█    Acceso local:   http://localhost                  █"
echo "█    Acceso en red:  http://$SERVER_IP               █"
echo "█                                                      █"
echo "█    Ver logs: docker compose logs -f api             █"
echo "████████████████████████████████████████████████████████"
echo -e "${NC}"
