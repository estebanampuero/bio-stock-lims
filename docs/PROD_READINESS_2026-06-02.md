# Production Readiness Report — BIO-STOCK LIMS

> **Fecha:** 2026-06-02
> **Modo:** full (project-intelligence-auditor + secscan + qa-playwright Phase 1)
> **Scope:** repo completo · rama `main`
> **Modalidad objetivo:** on-premise Windows, LAN hospitalaria, sin cloud

---

## Veredicto

**Casi listo para producción en su contexto (LAN cerrada), con 2 bloqueos de seguridad que arreglar esta semana.** El sistema es mucho más maduro de lo que documenta su propio `CLAUDE.md`: ya tiene JWT, bcrypt, cifrado AES-256-GCM de PII at-rest, RBAC server-side, lockout persistente, migraciones versionadas y backups automáticos. Los dos bloqueos son: (1) el cambio de PIN forzado se valida solo en el cliente, y (2) la PII de pacientes viaja en texto plano por HTTP. Ambos son arreglables en horas.

### Score por dimensión

| Dimensión      | Score | Nota |
|----------------|-------|------|
| Arquitectura   | 3.0/5 | Monolito apropiado para la escala; dos archivos gigantes; drift de docs severo |
| Seguridad      | 3.5/5 | Excelente at-rest; débil in-transit + PIN forzado client-only + CORS abierto |
| Escalabilidad  | 4.0/5 | SQLite WAL + índices correctos para <20 usuarios en LAN; dentro del diseño |
| UX/UI          | 3.0/5 | Funcional; 612 inline styles, `alert()`/`confirm()` nativos aún presentes |
| DevOps         | 3.0/5 | Tooling Windows (install/backup/restore) sólido; sin CI; observabilidad = console |

---

## 🔴 Critical — Fix This Week

### C1. El cambio de PIN forzado se aplica solo en el cliente
- **Qué:** Al loguear con `must_change_pin=1`, el server emite un JWT completo y válido ([server.cjs:493-496](../server.cjs#L493-L496)). El forzado de cambio vive únicamente en el frontend (`setShowPinChange(true)` en [InventoryApp.tsx:222](../src/components/InventoryApp.tsx#L222) y [:661](../src/components/InventoryApp.tsx#L661)). Ningún middleware bloquea llamadas a `/api/v1/*` mientras el PIN sigue siendo el default.
- **Por qué es crítico:** El default documentado es `admin / 1234` ([README.md](../README.md), [deploy.sh](../deploy.sh)). Cualquiera en la LAN puede loguear admin/1234, tomar el token y operar toda la API admin (borrar inventario, leer PII, crear usuarios) sin pasar nunca por el modal de cambio. La protección es cosmética.
- **Blast radius:** Compromiso total de la cuenta admin con credenciales conocidas.
- **Fix:** En `authenticate` (o un middleware nuevo), si `req.user` tiene `must_change_pin`, rechazar todo salvo `/me`, `/cambiar-pin`, `/logout` con 403. Incluir el flag en el JWT payload al firmar.
- **Esfuerzo:** S (<1d).

### C2. PII de pacientes en texto plano sobre HTTP
- **Qué:** TLS es opcional y por defecto está apagado; el server arranca en `http://0.0.0.0:3000` ([server.cjs:56](../server.cjs#L56), [:1131](../server.cjs#L1131)). El RUT y nombre del paciente se cifran at-rest (AES-256-GCM) pero se **descifran antes de enviarse** al cliente ([server.cjs:687-688](../server.cjs#L687-L688)), viajando en JSON plano por la red.
- **Por qué es crítico:** Datos clínicos identificables transmitidos sin cifrar en una LAN hospitalaria son interceptables por cualquier sniffer en el segmento. Anula el beneficio del cifrado at-rest y es un problema de compliance (datos de salud).
- **Blast radius:** Exposición de PII de todos los pacientes consultados vía `/diuresis/*`.
- **Fix:** Forzar TLS en producción. El instalador ya genera cert self-signed ([Install-BioStock.ps1:113-139](../scripts/Install-BioStock.ps1#L113-L139)) — hacer que `deploy`/install no arranquen en HTTP cuando hay PII, o redirigir 80→443. Documentar importación del cert raíz en los clientes.
- **Esfuerzo:** S-M (1-2d, mayormente operacional).

---

## 🟠 High Priority — This Month

### H1. CORS completamente abierto
- `app.use(cors())` sin restricción de origen ([server.cjs:84](../server.cjs#L84)). El `README` y `CLAUDE.md` afirman que está cerrado a orígenes específicos — **no lo está**. Cerrar a `http://localhost:3000` + IP del servidor LAN. **Esfuerzo:** S.

### H2. JWT en localStorage, sin revocación
- El token se guarda en `localStorage` ([src/lib/api.ts](../src/lib/api.ts)) → robable vía XSS. `logout` solo registra un log; el token sigue válido 8h ([server.cjs:504-507](../server.cjs#L504-L507)). No hay refresh ni tabla de sesiones revocables. Para LAN cerrada es tolerable, pero documentar el riesgo y considerar httpOnly cookie. **Esfuerzo:** M.

### H3. Sin CI
- 33 tests unit pasan localmente pero nada los corre en PR; no hay gate de build/lint ([.github/workflows](../) no existe). Un GitHub Action mínimo (`npm ci && npm run build && npm test`) evita regresiones. **Esfuerzo:** S.

### H4. Rate limiting solo en /login
- Todas las demás rutas son ilimitadas. `/diuresis/historico` (PII, paginado de 200) puede scrapearse en loop. Agregar un limiter global moderado a `/api/v1`. **Esfuerzo:** S.

---

## 🟡 Medium — Next Quarter

- **M1. Backup "verify" es un no-op.** [server.cjs:376](../server.cjs#L376) comenta "verificación de integridad" pero solo hace `SELECT 1` sobre la DB origen, nunca valida el archivo destino. Un backup corrupto pasaría silencioso. Abrir el `.db` resultante y correr `PRAGMA integrity_check`. **Esfuerzo:** S.
- **M2. Drift de documentación severo.** `CLAUDE.md` (v2.1) y la memoria del proyecto describen el estado pre-seguridad (password hardcodeada, sin auth, Docker/Tauri) como actual. Engaña a cualquier dev/agente nuevo. Actualizar a la realidad: JWT+bcrypt+AES, despliegue NSSM/Windows, `/api/v1`. **Esfuerzo:** M.
- **M3. `InventoryApp.tsx` = 1806 líneas, 612 inline styles, 34 `any`.** Monolito de UI difícil de mantener. Extraer sub-componentes y mover estilos a CSS/tokens cuando se vuelva a tocar. **Esfuerzo:** L.
- **M4. WAL de 4.1MB sin checkpoint.** Agregar `PRAGMA wal_checkpoint(TRUNCATE)` periódico o tras backup. **Esfuerzo:** S.
- **M5. Búsqueda de diuresis por nombre filtra solo dentro de la página.** El filtro corre in-memory post-descifrado sobre 200 filas ([server.cjs:713-716](../server.cjs#L713-L716)), así que resultados fuera de la primera página no aparecen. Limitación inherente al cifrado; documentar o usar hash de búsqueda. **Esfuerzo:** M.
- **M6. Password de PFX hardcodeada** `"biostock-tls-temp"` ([Install-BioStock.ps1:121](../scripts/Install-BioStock.ps1#L121)). Efímera (el .pfx se borra en la línea 141), riesgo bajo, pero randomizar con `[guid]::NewGuid()`. **Esfuerzo:** S.

---

## 💡 Opportunities

- **O1. Detección de anomalías ya existe** (z-score de diuresis, [server.cjs:723-735](../server.cjs#L723-L735)). Extenderla a **predicción de consumo/quiebre de stock** usando `dias_uso_aprox` que ya se captura por unidad.
- **O2. Alertas proactivas de vencimiento.** El dashboard ya calcula vencidos / <30d / <90d ([server.cjs:1042-1057](../server.cjs#L1042-L1057)). Falta solo emitir aviso (badge, email SMTP local) en vez de mostrarlo pasivo.
- **O3. AI sobre audit log.** Hay un log inmutable rico (usuario, perfil, acción, IP). Consulta en lenguaje natural ("¿quién dio de baja stock de Hematología esta semana?") con un LLM local/Haiku-class sería de alto valor para el admin.

---

## ✅ Ready-Now — No tocar

Lo que ya está bien resuelto y no debe re-trabajarse:

- **Cifrado PII at-rest** AES-256-GCM con IV aleatorio + migración de datos legacy (v9) y tests de roundtrip.
- **Auth** bcrypt cost 10, lockout persistente en DB que sobrevive reinicio (5 intentos / 30 min), rate limit en login.
- **Migraciones versionadas** — 14 versiones limpias con `PRAGMA user_version`.
- **Soft-delete + hard-delete admin-only + Papelera/restore** con whitelist de tablas (previene SQL injection en nombres dinámicos, [server.cjs:938-945](../server.cjs#L938-L945)).
- **Audit log + `pii_access_log` separado** con throttle (1/min/usuario/tabla).
- **Backups** VACUUM INTO + retención 30d + catch-up al arranque si >24h.
- **Hygiene de secretos** — `master.key`/`jwt.secret` autogenerados, gitignored, permisos 0600/0700.
- **SQL parametrizado** en todo el server. Sin interpolación de input de usuario.

---

## secscan — triage

4 hallazgos, **todos FP o riesgo bajo** (0 reales):

| rule_id | location | veredicto |
|---|---|---|
| secrets.private-key.pem | Install-BioStock.ps1:139 | FP — header PEM envolviendo key generada en runtime |
| secrets.entropy.assignment | Install-BioStock.ps1:121 | FP/bajo — pwd efímero de PFX, se borra (→ M6) |
| js.jwt.weak-algorithm | server.test.mjs:88, :95 | FP — código de test con SECRET local |

---

## Plan de acción priorizado

**Esta semana:** C1 (PIN forzado server-side) · C2 (forzar TLS) · H1 (cerrar CORS) · H3 (CI mínimo).
**Este mes:** H4 (rate limit global) · M1 (verify backup real) · M2 (actualizar docs).
**Este trimestre:** H2 (revisar estrategia de token) · M3 (refactor InventoryApp) · O2 (alertas de vencimiento).
**No hacer ahora:** migrar a PostgreSQL, Docker, microservicios, WebSockets — sobredimensionado para una LAN de <20 usuarios; SQLite WAL cumple.

---

*Lo más valioso para la próxima semana: cerrar C1 — es la diferencia entre "tiene auth" y "la auth se puede saltar con credenciales públicas". Lo que NO deben hacer: reescribir la UI o migrar la DB; el sistema cumple para su escala y esos cambios solo agregan riesgo.*
