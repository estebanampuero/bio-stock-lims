# Production Readiness Report — BIO-STOCK LIMS

> **Fecha:** 2026-06-22 · **Modo:** full (read-only) · **Commit base:** 1e30183 (main)
> **Cambios desde 06-05:** multi-tenant `org_id` end-to-end · aceptación de lote ISO 15189 §6.6.3 · alertas vencimiento/stock mínimo + export CSV
> **Contexto de despliegue:** instalación INMEDIATA = on-premise en PC del hospital (acceso SSH/LAN, single-tenant de facto). Código ya multi-tenant SaaS (trayectoria futura).

---

## Veredicto

El sistema **maduró notablemente**: el aislamiento multi-tenant por `org_id` está implementado con disciplina sorprendente (no hay IDOR cross-tenant en rutas de negocio), la aceptación de lote ISO 15189 está completa y coherente FE↔BE, el contrato cliente↔servidor no tiene rupturas (cero 404, cero desalineación de shape), y el DevOps (Dockerfile non-root, backup con `VACUUM INTO` + verificación de integridad + retención) es maduro para la fase.

**El veredicto depende del modo de despliegue:**

- **On-premise single-tenant (lo que se instala YA):** **GO condicionado.** No hay 🔴 que bloqueen esta instalación — los críticos son SaaS-específicos u operacionales. Condiciones: desplegar como servicio resiliente (Docker `restart: unless-stopped` o systemd, **NO** `deploy.sh`), con volumen `/data` persistente y `JWT_SECRET`/seed admin estables.
- **SaaS multi-tenant público (futuro):** **NO-GO.** Tres huecos cross-tenant deben cerrarse antes de exponer un segundo tenant real (H-5, H-9, H-1).

### Score global: **3.2 / 5** (on-prem efectivo ~3.4 · SaaS ~3.0)

| Dimensión | Score | Nota |
|---|---|---|
| Funcionalidad | 4.0/5 | Contrato FE↔BE completo, flujos críticos persisten y refrescan. −1 por features backend sin UI (SUPER_ADMIN, `/maestro`) y 2 spinners eternos |
| UX/UI | 3.0/5 | Capa feliz sólida (toasts, badges, confirmaciones); resiliencia a fallos desigual (6 vistas sin estado error, 403 sin manejo global) |
| Arquitectura | 3.0/5 | Scoping disciplinado, migraciones versionadas; pero `server.cjs` 1486 LOC monolito + `InventoryApp.tsx` 2025 LOC sin memoización |
| Seguridad | 3.5/5 | Aislamiento multi-tenant correcto, JWT/bcrypt/lockout/CORS sólidos; huecos SaaS (org_default fallback, export-db, scan_formats global) |
| Performance | 3.0/5 | WAL + transacciones + índices base OK; polling 6 endpoints/3s, recharts en bundle main, N+1 en bulk-import |
| Escalabilidad | 2.5/5 | SQLite single-file + soft-delete sin archivado; índices `org_id` de un solo campo inútiles en multi-tenant; sin FK |
| Calidad de Código | 3.0/5 | Tests de parser/format + CI; pero `any` en UI, sin E2E, monolitos |

---

## 🔴 Critical

### C1. Backup corre DESPUÉS de las migraciones — sin snapshot pre-migración
- **Evidencia:** `runMigrations` (server.cjs:544) corre antes que `backupAlArranqueSiHaceFalta` (:549). Una migración con bug se aplica sobre la única DB sin red de seguridad.
- **Por qué crítico:** En un LIMS clínico, una migración v20+ defectuosa corrompe datos reales sin posibilidad de rollback. v15 ya hizo `DROP TABLE diuresis/pii_access_log` (:286) sin backup previo.
- **Fix:** Ejecutar `ejecutarBackupDB()` etiquetado `pre-migracion-vN` ANTES de `runMigrations` cuando la `user_version` del archivo < versión del código. **Esfuerzo: S.**

### C2. `PRAGMA user_version = 19` quedó fuera del COMMIT de su migración
- **Evidencia:** server.cjs:359 (`COMMIT`) → :361 (`PRAGMA user_version = 19`, fuera del try transaccional).
- **Por qué crítico:** Si el proceso muere entre el COMMIT y el set de versión, al reiniciar se re-ejecuta v19 sobre tablas ya migradas → `ALTER TABLE ADD COLUMN org_id` falla por columna duplicada y aborta el arranque. Patrón a no repetir en v20+.
- **Fix:** Mover el `PRAGMA user_version` dentro de la transacción. **Esfuerzo: S.**

### C3. (Solo SaaS) `/admin/export-db` exporta la DB completa con rol ADMIN sin filtro de org
- **Evidencia:** server.cjs:1299 `authorize("ADMIN")` + `VACUUM INTO` de toda la base (:1304). ADMIN es rol per-tenant.
- **Por qué crítico (SaaS):** un ADMIN de cualquier tenant descarga los datos de TODOS los laboratorios. **En on-premise single-tenant es la feature deseada** ("llevar los datos al instalar", comentario :1297) → inofensivo ahí.
- **Fix:** Restringir a `SUPER_ADMIN` o deshabilitar en modo multi-tenant. **Esfuerzo: M.**

---

## 🟠 High

- **H-5. (SaaS) Fallback `org_default` en `authenticate`** (server.cjs:121): cualquier JWT válido sin claim `org_id` accede a `org_default` (que es un tenant real). Inofensivo single-tenant; en SaaS rechazar con 401. **S.**
- **H-1. (SaaS) `scan_formats` global mutable por cualquier ADMIN** (server.cjs:1167-1209): sin `org_id`, `authorize("ADMIN")` permite que un tenant rompa/borre el parsing de todos. Restringir a `SUPER_ADMIN`. **S.**
- **H-3. JWT sin revocación / staleness 8h** (server.cjs:110-131, `JWT_TTL=8h`): rol degradado o usuario dado de baja conserva acceso hasta 8h. Re-validar rol/`fecha_baja` contra DB en `authenticate` o tabla de sesiones. **M.**
- **H-6. JWT_SECRET inestable en hosting efímero** (server.cjs:43-46): en Render Free se regenera cada deploy invalidando sesiones. On-prem con `/data` persistente: OK. Exigir `JWT_SECRET` desde env en producción. **S.**
- **H-perf-1. N+1 en bulk-import** (server.cjs:772-784): 3 queries/fila × 5000 = ~15k queries, bloquea el writer SQLite durante el import. Deduplicar secciones en memoria + `INSERT ... ON CONFLICT`. **M.**
- **H-perf-2. Polling de 6 endpoints cada 3s para todos los roles** (InventoryApp.tsx:279-296): TECNOLOGO/TECNICO reciben **403 de `/logs` cada 3s** (es `authorize("ADMIN")`, server.cjs:1096). Condicionar `/logs` a `isAdmin`; separar polling (inventario/alertas 3s; config/protocolos/anexos 30-60s); roadmap WebSocket. **S.**
- **H-deploy. `deploy.sh` no es un servicio resiliente** (lanza `node server.cjs &` con `wait`): muere al cerrar SSH, sin auto-restart ni arranque al boot. **Para el on-prem del hospital, usar Docker `restart: unless-stopped` + volumen `/data`, o un unit systemd (no existe en el repo).** **S.**

---

## 🟡 Medium

- **M-perf-1. `recharts` en el bundle principal (664 KB)** (dist/assets/index-*.js): sacar el `<BarChart>` de InventoryApp.tsx a `lazy()`. **S.**
- **M-perf-2. `InventoryApp.tsx` 2025 LOC con 0 `useMemo`/`useCallback`**: re-render completo + recharts cada 3s. Memoizar derivados o comparar antes de `setState`. **M.**
- **M-data-1. Sin foreign keys** pese a `PRAGMA foreign_keys=ON` (server.cjs:543): hard-delete deja huérfanos. Documentar (ADR) o añadir FK en rebuild. **M.**
- **M-data-2. Índices `org_id` de un solo campo** (server.cjs:335): inútiles en multi-tenant real. Reemplazar por compuestos `(org_id, fecha_baja, expiration)`, `(org_id, gtin, lot)`, `(org_id, fecha)`. **S.**
- **M-ux-1. 403 (mustChangePin / permiso) sin manejo en el cliente HTTP** (api.ts:21-26 solo intercepta 401): el usuario queda colgado con datos vacíos. **M.**
- **M-ux-2. Spinners eternos** en MaestroView.tsx:18-34 y SeccionesView.tsx:16-29 (`Promise.all` sin `.catch`, `setLoading(false)` fuera de `finally`). **S.**
- **M-ux-3. 6 vistas de lectura sin estado de error** (InventarioView, LogsView, AnexosView, ProtocolosView): tabla vacía indistinguible de fallo. **S.**
- **M-input. Sin validación estructurada (Zod)** en `POST /producto` y `bulk-import`: `INSERT OR REPLACE` sin límite de longitud/formato. Viola CLAUDE §13.5. **M.**

---

## 💡 Opportunities

- **O1. Multi-tenant ya está cableado** — falta solo la consola SUPER_ADMIN (las rutas `/admin/orgs` existen, server.cjs:1404-1437, pero no hay UI). Cerrar C3/H-5/H-1 + esa consola = SaaS operable.
- **O2. WebSocket reemplaza el polling** (ADR-004 ya planificado): elimina ~2400-9600 req/min en LAN y el ruido de 403 de `/logs`.
- **O3. El registro de formatos de escáner sigue siendo un moat** para el onboarding self-service de SaaS.

---

## ✅ Ready-Now — No tocar

- **Aislamiento multi-tenant en rutas de negocio:** patrón validate-then-mutate con `org_id` aplicado consistentemente en inventario, maestro, protocolos, anexos, logs, usuarios, admin/trash|restore|hard-delete (con allowlist `ADMIN_TABLES`), export/csv y dashboard. Sin IDOR cross-tenant.
- **Hard-delete/restore NO tienen SQL injection:** `ADMIN_TABLES` es allowlist; `req.params.tabla` es clave de lookup, gate 400 antes de cualquier interpolación.
- **Aceptación de lote ISO 15189:** flujo PENDIENTE→ACEPTADO/RECHAZADO completo; la salida solo descuenta unidades ACEPTADO (server.cjs:709).
- **Auth server-side:** PIN forzado bloqueado en server, bcrypt, lockout persistente, rate limit, CORS allowlist, `errRes` no filtra stack traces.
- **Backup robusto:** `VACUUM INTO` + `PRAGMA integrity_check` real + retención 30d (server.cjs:466-505). En Docker on-prem va a `/data/backups` (persistente).
- **Dockerfile endurecido:** multi-stage, usuario non-root (uid 10001), `NODE_ENV=production`, healthcheck.
- **Migración v19 multi-tenant:** atómica con ROLLBACK, recrea tablas preservando columnas dinámicamente (salvo el detalle de C2).
- **CI:** build + tests en cada push.

---

## Checklist de producción

| Área | Estado | Nota |
|---|---|---|
| Funcionalidad | ✅ | Contrato FE↔BE completo, sin dead-ends de negocio |
| End-to-End | ⚠️ | Trazado estático OK; sin suite E2E ejecutada (residual) |
| UX/UI | ⚠️ | Capa feliz OK; manejo de error desigual (M-ux-1/2/3) |
| Arquitectura | ⚠️ | Funciona; monolitos = deuda tolerable a esta escala |
| Seguridad | ⚠️ | OK on-prem; cerrar C3/H-5/H-1 antes de SaaS |
| Performance | ⚠️ | OK en LAN; N+1 import + polling a optimizar |
| Datos | ❌ | C1 (backup post-migración) + C2 (user_version fuera de COMMIT) |
| Tests | ⚠️ | Unit de parser/format + CI; sin E2E |
| Deploy | ❌ | `deploy.sh` no es servicio; usar Docker/systemd (H-deploy) |
| Score global ≥4.8 | ❌ | 3.2/5 |

---

## Plan de acción (orden recomendado)

**Antes de instalar on-premise (esta semana):**
1. C1 — backup pre-migración (S)
2. C2 — `user_version` dentro del COMMIT (S)
3. H-deploy — desplegar como servicio (Docker `restart: unless-stopped` + `/data`, o systemd) (S)
4. H-6 — `JWT_SECRET` y seed admin persistidos/desde env (S)
5. M-ux-2 — cerrar spinners eternos (S)

**Antes de abrir SaaS multi-tenant (segundo tenant):**
6. C3 — `export-db` a SUPER_ADMIN (M)
7. H-5 — rechazar token sin `org_id` (S)
8. H-1 — `scan_formats` a SUPER_ADMIN (S)
9. M-data-2 — índices compuestos `(org_id, …)` (S)
10. H-3 — revocación de token (M) · O1 — consola SUPER_ADMIN (M)
