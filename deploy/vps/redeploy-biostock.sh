#!/usr/bin/env bash
# redeploy-biostock.sh — Reconstruye y redespliega BIO-STOCK LIMS en el VPS de pruebas.
# Versión controlada de /opt/redeploy-biostock.sh. Instalar/actualizar con:
#   install -m 755 /opt/bio-stock-lims/deploy/vps/redeploy-biostock.sh /opt/redeploy-biostock.sh
#
# Uso:  redeploy-biostock.sh              # git pull + build + deploy
#       redeploy-biostock.sh --rollback   # vuelve a la imagen del deploy anterior
#
# Aislamiento respecto de los demás proyectos del VPS:
#   - Red propia (biostock_edge) que solo comparten este contenedor y Traefik.
#   - Sin puertos publicados en el host: Traefik enruta por nombre de contenedor.
#   - Límites de CPU/RAM/PIDs y logs rotados: un fallo aquí no puede agotar el host.
#   - Datos solo en /opt/bio-stock-data. No toca Traefik ni otros contenedores/imágenes.
set -euo pipefail

APP=bio-stock-lims
SRC=/opt/bio-stock-lims
DATA=/opt/bio-stock-data
NET=biostock_edge
TRAEFIK_SVC=easypanel-traefik
MODE="${1:-deploy}"

# Red: biostock_edge si Traefik ya está conectado a ella. Si no, se usa la red compartida
# "easypanel" (comportamiento anterior) y se avisa: conectar Traefik lo reinicia y corta
# todos los sitios del VPS, así que se hace a mano en una ventana de mantenimiento.
RUN_NET=easypanel
if docker network inspect "$NET" >/dev/null 2>&1; then
  NET_ID=$(docker network inspect -f '{{.Id}}' "$NET")
  if docker service inspect "$TRAEFIK_SVC" -f '{{range .Spec.TaskTemplate.Networks}}{{.Target}} {{end}}' | grep -q "$NET_ID"; then
    RUN_NET=$NET
  fi
fi
if [ "$RUN_NET" != "$NET" ]; then
  echo "⚠  Traefik no está conectado a la red $NET: se usa la red compartida 'easypanel'." >&2
  echo "   Para aislar (reinicia Traefik = corte breve de todos los sitios):" >&2
  echo "     docker network create --driver overlay --attachable $NET" >&2
  echo "     docker service update --network-add $NET $TRAEFIK_SVC" >&2
fi

if [ "$MODE" = "--rollback" ]; then
  IMAGE="$APP:previous"
  docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "⛔ No existe $IMAGE" >&2; exit 1; }
else
  cd "$SRC"
  git fetch -q origin main && git reset -q --hard origin/main
  echo "-> build..."
  OLD_PREV=$(docker image inspect -f '{{.Id}}' "$APP:previous" 2>/dev/null || true)
  if docker image inspect "$APP:latest" >/dev/null 2>&1; then docker tag "$APP:latest" "$APP:previous"; fi
  docker build -t "$APP:latest" .
  # Borrar solo la imagen "previous" anterior si quedó sin etiqueta (nunca un prune global).
  if [ -n "$OLD_PREV" ] && [ -z "$(docker image inspect -f '{{join .RepoTags ","}}' "$OLD_PREV" 2>/dev/null)" ]; then
    docker rmi "$OLD_PREV" >/dev/null 2>&1 || true
  fi
  IMAGE="$APP:latest"
fi

mkdir -p "$DATA"
chown -R 10001:10001 "$DATA"
docker rm -f "$APP" >/dev/null 2>&1 || true
docker run -d --name "$APP" --restart unless-stopped \
  --network "$RUN_NET" \
  --memory 512m --memory-swap 512m --cpus 1 --pids-limit 256 \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \
  -v "$DATA:/data" --env-file "$DATA/app.env" \
  "$IMAGE" >/dev/null

# El primer healthcheck corre ~30 s después del arranque (interval del Dockerfile).
echo "-> esperando healthcheck..."
status=starting
for _ in $(seq 1 45); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo missing)
  [ "$status" = healthy ] && break
  sleep 2
done
echo "-> $APP ($IMAGE): $status · red $RUN_NET · https://biostock.aurik.cl (puerto NO publicado)"
if [ "$status" != healthy ]; then
  echo "⛔ No quedó healthy. Logs: docker logs --tail 50 $APP" >&2
  [ "$MODE" = "--rollback" ] || echo "   Volver a la versión anterior: $0 --rollback" >&2
  exit 1
fi
