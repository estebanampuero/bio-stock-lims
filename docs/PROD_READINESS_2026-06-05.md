# Production Readiness Report — BIO-STOCK LIMS

> **Fecha:** 2026-06-05 · **Modo:** full (auditor + secscan + qa Phase 1)
> **Commit:** 5d30f17 (main) · **Deploy de pruebas:** https://biostock.aurik.cl (VPS Contabo, Docker + Traefik)
> **Cambios desde 2026-06-02:** removido diuresis + cifrado PII · deploy en VPS con HTTPS · registro de formatos de escáner configurable · parser multi-formato

---

## Veredicto

**El producto avanzó fuerte: ya es un sistema single-tenant desplegado, con HTTPS, CI y un parser de códigos de barras configurable que es un diferenciador real.** El núcleo (inventario, escaneo, vencimientos, protocolos, anexos, auditoría) está sólido y validándose con un laboratorio. Hay **un bloqueo de seguridad de despliegue** (puerto cleartext público) y **un bug latente de backups** que conviene cerrar esta semana antes de meter datos reales. La deuda estructural (monolito de UI, sin E2E) es tolerable a esta escala. El siguiente salto de producto —multi-tenant— ya tiene cimientos (el registro de formatos es global por diseño).

### Score por dimensión

| Dimensión     | Score | Δ vs 06-02 | Nota |
|---------------|-------|-----------|------|
| Arquitectura  | 3.0/5 | = | Deploy limpio y parser bien diseñado; InventoryApp sigue siendo monolito (1628 líneas) |
| Seguridad     | 3.5/5 | = | Auth server-side sólida; el puerto :8097 cleartext público resta lo que suma el HTTPS |
| Escalabilidad | 4.0/5 | = | SQLite OK para 1 lab; multi-tenant pedirá PostgreSQL |
| UX/UI         | 3.2/5 | ▲ | Nuevas features útiles (diagnóstico, builder de formatos); inline styles persisten |
| DevOps        | 3.5/5 | ▲ | Docker + CI + HTTPS + redeploy en 1 comando; pero backups efímeros + container root |

---

## 🔴 Critical — Fix This Week

### C1. Puerto :8097 expuesto en texto plano a internet
- **Qué:** El contenedor publica `0.0.0.0:8097` (verificado: `http://5.252.52.19:8097/health` → **200** por HTTP plano). Las credenciales (incl. `MMA`) y todo el tráfico viajan **sin cifrar** por ese puerto público, en paralelo al dominio HTTPS.
- **Por qué crítico:** es una puerta cleartext permanente en una IP pública. Cualquiera en la ruta de red puede interceptar logins. El HTTPS de `biostock.aurik.cl` no sirve de nada si el mismo backend está abierto en claro al lado.
- **Fix (5 min):** publicar el contenedor **solo a localhost/red interna** (`-p 127.0.0.1:8097:3000` no sirve para Traefik swarm; mejor adjuntar el contenedor a la red de Traefik y rutear por nombre, o cerrar 8097 en el firewall del VPS dejando solo 80/443). Traefik ya da el acceso por HTTPS; el puerto crudo debe cerrarse.
- **Esfuerzo:** S.

### C2. Los backups automáticos van a un directorio efímero
- **Qué:** El cron diario escribe en `/app/backups` (dentro del contenedor), no en el volumen persistente `/data`. Verificado en logs: `💾 Backup creado: /app/backups/…`. En cada redeploy el contenedor se recrea → **todos los backups se pierden**.
- **Por qué crítico:** la DB sí persiste (`/data`), pero la red de seguridad (backups) no. El día que haya datos reales, un redeploy borra el historial de respaldos.
- **Fix:** apuntar `BACKUPS_DIR` a `/data/backups` (env o constante), y montar/usar el volumen. Una línea + variable de entorno.
- **Esfuerzo:** S.

---

## 🟠 High Priority — This Month

### H1. JWT en localStorage sin revocación
Token en `localStorage` (robable vía XSS); `logout` solo registra log, el token sigue válido 8h. Sin refresh ni tabla de sesiones. Aceptable en LAN, pero ahora es un servicio público — documentar y evaluar httpOnly cookie. **Esfuerzo:** M.

### H2. Sin observabilidad de la app
Solo `console.log`. No hay logging estructurado ni alertas. El VPS ya corre **uptime-kuma** — engancharlo a `https://biostock.aurik.cl/health` da monitoreo de caída gratis. Para errores, considerar el **glitchtip** que ya está en el VPS. **Esfuerzo:** S (uptime) / M (errores).

---

## 🟡 Medium — Next Quarter

- **M1. Docker corre como root** (secscan, CWE-250). Agregar usuario no-root en el `Dockerfile` (`adduser` + `USER`). Reduce blast radius. **S.**
- **M2. ReDoS por regex de formatos.** Las regex de `scan_formats` se compilan con `new RegExp` y corren en **cada escaneo en el cliente**. El server valida que compilen, pero no el backtracking catastrófico. Es admin-only (confiable), pero una regex patológica podría colgar el navegador del técnico. Agregar un guard (timeout/longitud/complejidad) o un linter de regex. **S-M.**
- **M3. `InventoryApp.tsx` = 1628 líneas, 17 `any`.** Monolito de UI. Extraer el flujo de escaneo/inventario a sub-componentes y hooks cuando se vuelva a tocar. **L.**
- **M4. Sin tests E2E.** El flujo de escaneo ya tuvo un bug de fallo silencioso (clásico de regresión). Un Playwright mínimo sobre login→escaneo→suma y la matriz RBAC sería alto valor. **M.**
- **M5. Drift de CLAUDE.md.** El doc maestro aún describe el modelo on-premise/diuresis como actual; no menciona el deploy VPS, scan_formats ni que diuresis se eliminó. Actualizarlo. **M.**

---

## 💡 Opportunities

- **O1. El registro de formatos ES un moat.** El onboarding self-service de códigos de barras (lab reporta → se integra desde el panel → todos lo usan) es una ventaja competitiva real para un SaaS de LIMS. Ya está construido **global por diseño** → listo para super-admin.
- **O2. Multi-tenant: cimientos puestos.** El plan acordado (validar single-tenant → luego multi-tenant) es correcto. Cuando llegue: `org_id` en tablas, rol SUPER_ADMIN, scoping centralizado, PostgreSQL. Los formatos de escáner quedan como config de plataforma (no por tenant).
- **O3. Alertas de vencimiento + AI sobre audit log.** Los datos ya existen (dashboard calcula vencidos/30d/90d; audit log es rico). Falta el aviso proactivo y, opcionalmente, consulta en lenguaje natural.

---

## ✅ Ready-Now — No tocar

- **Auth server-side:** PIN forzado bloqueado en el server (no solo UI), bcrypt, lockout persistente, rate limit global + login.
- **HTTPS de verdad:** Traefik + Let's Encrypt (auto-renovable) en biostock.aurik.cl.
- **CI:** build + 26 tests en cada push a main.
- **Parser multi-formato + tests:** GS1 (parens/raw), EAN/UPC/ITF, tolerante a parciales, + formatos custom por regex. 10 tests del parser.
- **Deploy reproducible:** Dockerfile (compila sqlite3 desde fuente), redeploy en 1 comando (`/opt/redeploy-biostock.sh`), DB en volumen persistente, restart unless-stopped.
- **Superficie reducida:** diuresis + cifrado PII + master.key eliminados → sin datos de paciente, menos que proteger.
- **Migraciones limpias** hasta v16 (incl. el DROP de las tablas viejas).

---

## secscan — triage

5 hallazgos · 1 real (Docker root → M1), 4 FP conocidos:

| rule_id | location | veredicto |
|---|---|---|
| docker.user.root | Dockerfile:1 | **REAL** → M1 (agregar USER no-root) |
| secrets.private-key.pem | Install-BioStock.ps1:139 | FP — header PEM envolviendo key generada en runtime |
| secrets.entropy.assignment | Install-BioStock.ps1:121 | FP — pwd efímero de PFX, se borra |
| js.jwt.weak-algorithm | server.test.mjs:30, :37 | FP — código de test con SECRET local |

---

## Plan de acción priorizado

**Esta semana:** C1 (cerrar puerto :8097 cleartext) · C2 (backups → volumen /data).
**Este mes:** H2 (uptime-kuma → /health) · M1 (Docker no-root) · M5 (actualizar CLAUDE.md).
**Este trimestre:** M2 (guard ReDoS) · M4 (Playwright sobre escaneo + RBAC) · M3 (refactor InventoryApp).
**No hacer ahora:** multi-tenant / PostgreSQL (validar single-tenant primero, como acordado); reescribir la UI.

---

*Lo más valioso esta semana: cerrar el puerto :8097 en claro y mandar los backups al volumen persistente — son dos cambios de minutos que eliminan una fuga de credenciales y una pérdida silenciosa de respaldos. Lo que NO conviene: arrancar el multi-tenant todavía; el plan de validar con un laboratorio primero es el correcto.*
