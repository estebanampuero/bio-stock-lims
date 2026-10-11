# Despliegue de pruebas en el VPS — https://biostock.aurik.cl

Contenedor Docker propio en el VPS compartido `contabo-dji`, publicado por el Traefik de Easypanel.
El VPS aloja otros proyectos: todo lo de BIO-STOCK está acotado a las piezas de esta tabla.

| Pieza | Dónde |
|---|---|
| Código | `/opt/bio-stock-lims` (checkout de `main`) |
| Datos: DB, secretos, respaldos, `app.env` | `/opt/bio-stock-data` (montado en `/data`) |
| Redeploy | `/opt/redeploy-biostock.sh` ← [`redeploy-biostock.sh`](redeploy-biostock.sh) |
| Ruta Traefik | `/etc/easypanel/traefik/config/biostock.yml` ← [`traefik-biostock.yml`](traefik-biostock.yml) |
| Respaldo offsite | `extra-backups-r2.timer` sube `/opt/bio-stock-data/backups` cifrado a R2 |

## Aislamiento

- **Red propia `biostock_edge`**: solo la comparten el contenedor y Traefik. Si Traefik aún no está conectado, el redeploy usa la red compartida `easypanel` y lo avisa.
- **Sin puertos publicados** en el host (el `:3000` del host es del panel de Easypanel).
- **Límites**: 512 MB de RAM, 1 CPU, 256 procesos; logs rotados (3 × 10 MB).
- **Traefik**: router, servicio y middlewares con prefijo `biostock`; no usa middlewares de otros archivos.
- El redeploy no reinicia Traefik ni hace `prune`: solo toca su contenedor y sus imágenes.

## Operación

```bash
ssh contabo-dji /opt/redeploy-biostock.sh              # deploy de origin/main
ssh contabo-dji /opt/redeploy-biostock.sh --rollback   # vuelve a la imagen anterior
```

## Instalar o actualizar la configuración (en el VPS)

```bash
cd /opt/bio-stock-lims && git pull
install -m 755 deploy/vps/redeploy-biostock.sh /opt/redeploy-biostock.sh

# Ruta Traefik: recarga en caliente, sin reinicio. Un YAML inválido en ese directorio
# congela la configuración de TODOS los sitios: validar antes de copiar.
python3 -c 'import sys,yaml; yaml.safe_load(open(sys.argv[1]))' deploy/vps/traefik-biostock.yml
install -m 644 deploy/vps/traefik-biostock.yml /etc/easypanel/traefik/config/biostock.yml.tmp
mv /etc/easypanel/traefik/config/biostock.yml.tmp /etc/easypanel/traefik/config/biostock.yml
```

Red propia (una sola vez). Conectar Traefik lo reinicia y corta unos segundos **todos** los sitios del VPS: hacerlo en una ventana de mantenimiento.

```bash
docker network create --driver overlay --attachable biostock_edge
docker service update --network-add biostock_edge easypanel-traefik
/opt/redeploy-biostock.sh   # recrea el contenedor ya en biostock_edge
```
