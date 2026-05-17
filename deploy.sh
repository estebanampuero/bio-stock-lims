#!/usr/bin/env bash
# deploy.sh — Despliegue local de BIO-STOCK LIMS (dev / testing en macOS o Linux)
# Para despliegue en hospital Windows, usá scripts/Install-BioStock.ps1 desde PowerShell.

set -e
cd "$(dirname "$0")"

PORT="${PORT:-3000}"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "    BIO-STOCK LIMS — Despliegue local"
echo "════════════════════════════════════════════════════════════"
echo ""

# 1. Matar instancia anterior si existe
if pgrep -f "node server.cjs" > /dev/null; then
  echo "→ Deteniendo instancia anterior..."
  pkill -f "node server.cjs" || true
  sleep 1
fi

# 2. Instalar deps si faltan
if [ ! -d node_modules ]; then
  echo "→ Instalando dependencias..."
  npm install
fi

# 3. Build de producción si dist/ no existe o está desactualizado
if [ ! -d dist ] || [ src/components/InventoryApp.tsx -nt dist/index.html ]; then
  echo "→ Compilando frontend..."
  npm run build
fi

# 4. Arrancar servidor
echo "→ Iniciando servidor en puerto $PORT..."
PORT="$PORT" node server.cjs &
SVR_PID=$!

# 5. Esperar healthcheck
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  if curl -fsS "http://localhost:$PORT/health" > /dev/null 2>&1; then
    break
  fi
done

if ! curl -fsS "http://localhost:$PORT/health" > /dev/null 2>&1; then
  echo "❌ El servidor no respondió en 10s. Logs:"
  kill $SVR_PID 2>/dev/null || true
  exit 1
fi

# 6. Detectar IP de LAN
LAN_IP=""
if command -v ipconfig > /dev/null; then
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
elif command -v hostname > /dev/null; then
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi

echo ""
echo "✅ BIO-STOCK LIMS corriendo"
echo "   PID:       $SVR_PID"
echo "   Local:     http://localhost:$PORT"
[ -n "$LAN_IP" ] && echo "   LAN:       http://$LAN_IP:$PORT"
echo "   Login:     admin / 1234 (se forzará cambio de PIN)"
echo ""
echo "   Detener:   pkill -f 'node server.cjs'"
echo "   Logs:      ya están en esta terminal (servidor en foreground a partir de ahora)"
echo ""

# 7. Abrir navegador (macOS)
if command -v open > /dev/null; then
  open "http://localhost:$PORT"
fi

# 8. Mantener el proceso en foreground para ver logs
wait $SVR_PID
