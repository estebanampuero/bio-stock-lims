#!/usr/bin/env bash
# preview.sh — Expone BIO-STOCK LIMS por un túnel HTTPS público (Cloudflare) para
# que el personal del hospital lo pruebe mientras sigues iterando desde tu Mac.
#
#   Uso:   ./scripts/preview.sh
#   Cortar: Ctrl-C (baja el túnel y el servidor)
#
# El servidor corre en HTTP local; Cloudflare le pone el HTTPS público por fuera
# (el tramo Mac→Cloudflare va cifrado). Sin cuenta, sin página de aviso.
# Solo para PRUEBAS con datos ficticios.

set -e
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"

echo "→ Compilando frontend..."
npm run build >/dev/null

echo "→ Iniciando servidor en HTTP local (puerto $PORT)..."
# Forzamos HTTP apuntando los certs a una ruta inexistente (no tocamos tu cert.pem real)
TLS_CERT="$PWD/.no-tls-preview" TLS_KEY="$PWD/.no-tls-preview" PORT="$PORT" node server.cjs &
SVR_PID=$!
trap 'echo; echo "→ Cerrando..."; kill $SVR_PID 2>/dev/null; exit 0' INT TERM

# Esperar healthcheck
for i in $(seq 1 12); do
  sleep 1
  curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1 && break
done
if ! curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; then
  echo "❌ El servidor no respondió. Abortando."; kill $SVR_PID 2>/dev/null; exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Abriendo túnel público. Comparte la URL"
echo "  'https://....trycloudflare.com' de abajo SOLO con tus"
echo "  testers del hospital."
echo "  Login de prueba:  MMA / Laboratorio12345_"
echo "════════════════════════════════════════════════════════════"
echo ""

# Cloudflare quick tunnel en foreground: imprime la URL pública (trycloudflare.com).
# Sin cuenta ni configuración. La URL cambia en cada arranque.
# --protocol http2: evita QUIC/UDP, que algunas redes filtran y tumban el túnel.
cloudflared tunnel --protocol http2 --url "http://localhost:$PORT"
