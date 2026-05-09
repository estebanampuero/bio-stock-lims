# CLAUDE.md — BIO-STOCK LIMS Pro
## Guía Arquitectónica, Estándares y Roadmap Técnico

> **Versión del documento:** 2.0 — Actualizado: 2026-05-08  
> **Estado del sistema:** v1.0 MVP funcional — pendiente hardening enterprise  
> **Modalidad de despliegue:** On-premise / Red interna corporativa (sin dependencia cloud)  
> **Audiencia:** Desarrolladores, arquitectos, agentes de IA colaborando en este proyecto

---

## 0. RESTRICCIÓN ARQUITECTÓNICA FUNDAMENTAL

**El sistema opera exclusivamente en red interna corporativa (on-premise).**

- Un computador actúa como servidor/host principal
- Los demás computadores acceden vía IP local del servidor (ej: `http://192.168.1.100`)
- Toda la comunicación ocurre dentro de la LAN empresarial
- No se depende de servicios cloud externos para funcionar
- Esta es la única modalidad de despliegue soportada inicialmente

Esta restricción determina **todas** las decisiones de arquitectura: base de datos, autenticación, backups, monitoreo, y estrategia de actualización.

---

## 1. DIAGNÓSTICO ACTUAL DEL SISTEMA

### 1.1 Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│  DEPLOYMENT ACTUAL (Windows .bat)                           │
│                                                             │
│  ┌─────────────────┐    HTTP/REST    ┌──────────────────┐  │
│  │  Vite Dev Server│ ◄────────────► │  Express.js API  │  │
│  │  (puerto 1420)  │                │  (puerto 3000)   │  │
│  │  React 19 + TS  │                │  server.cjs      │  │
│  └─────────────────┘                └────────┬─────────┘  │
│                                              │             │
│  Tauri 2.0 (configurado pero NO integrado)  │             │
│                                             ▼             │
│                                    ┌─────────────────┐    │
│                                    │ SQLite (1 archivo│    │
│                                    │ inventario_      │    │
│                                    │ biorad.db)       │    │
│                                    └─────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Stack actual:**
- Frontend: React 19 + TypeScript + Vite 7 + Recharts + Lucide
- Backend: Express 5 + SQLite3 + node-sqlite (wrapper async)
- DB: SQLite (archivo local único)
- Desktop: Tauri 2.0 (configurado pero sin uso real — app corre como webapp)
- Deploy: `.bat` que lanza `npm run dev` (modo desarrollo en producción)

### 1.2 Módulos Existentes

| Módulo | Archivo | Estado |
|--------|---------|--------|
| App principal (activo) | `src/components/InventoryApp.tsx` | Activo |
| App legacy (abandonado) | `src/InventoryApp.tsx` | Duplicado — eliminar |
| Input alternativo (abandonado) | `src/components/InventoryInput.tsx` | Duplicado — eliminar |
| Parser GS1 | `src/utils/gs1Parser.ts` | Funcional, bien diseñado |
| Servidor principal | `server.cjs` | Activo (CommonJS) |
| Servidor legacy | `server.js` | Duplicado ES Modules — eliminar |

### 1.3 Flujo de Datos Actual

```
Escáner Láser (HID keyboard emulation)
    │
    ▼
KeyDown event listener (global window)
    │
    ├── Buffer acumula caracteres hasta Enter
    │
    ▼
parseGS1(codigo) → { gtin, lot, expiration }
    │
    ├── GET /api/producto/:gtin
    │       ├── Existe → POST /api/inventario (registro directo)
    │       └── No existe → Modal registro maestro → POST /api/producto + POST /api/inventario
    │
    ▼
SQLite (inventario + maestro_productos + logs)
    │
    ▼
Polling cada 3s → GET /api/inventario → Re-render React
```

---

## 2. VULNERABILIDADES CRÍTICAS — PRIORIDAD MÁXIMA

Estas deben resolverse antes de cualquier despliegue en producción o expansión.

### 2.1 Credenciales Hardcodeadas (CRÍTICO)

**Problema:** La contraseña admin está literal en el código fuente y en la DB sin hash.

```typescript
// src/InventoryApp.tsx:166 — NUNCA hacer esto
if(passInput === "LAB_ADMIN_2024") { ... }
```

```javascript
// server.js:32 — Contraseña en plaintext en DB
await db.run("INSERT OR IGNORE INTO usuarios VALUES ('admin', 'LAB_ADMIN_2024', 'admin')");
```

**Solución:** bcrypt para hash de PINs/passwords. JWT para sesiones. Variables de entorno para secrets.

### 2.2 Sin Autenticación Real en API (CRÍTICO)

Cualquier request a la API (desde cualquier origen en la red local) puede leer, crear o borrar datos sin ningún token.

**Solución:** JWT Bearer tokens en todas las rutas protegidas. Middleware de autenticación.

### 2.3 CORS Abierto (ALTO)

```javascript
app.use(cors()); // Permite CUALQUIER origen
```

**Solución:** `cors({ origin: ['http://localhost:1420', process.env.ALLOWED_ORIGIN] })`

### 2.4 CSP Deshabilitado en Tauri (ALTO)

```json
"security": { "csp": null }
```

**Solución:** Definir una Content Security Policy estricta.

### 2.5 IDs con Math.random() (MEDIO)

```javascript
const id = Math.random().toString(36).substr(2,9); // Colisiones posibles, predecible
```

**Solución:** `crypto.randomUUID()` (disponible nativamente en Node 19+).

---

## 3. DEUDA TÉCNICA — INVENTARIO COMPLETO

### 3.1 Código

| Problema | Severidad | Archivo(s) |
|----------|-----------|-----------|
| Contraseña hardcodeada en frontend | Crítica | `src/InventoryApp.tsx:166` |
| `any[]` en todos los estados React | Alta | `components/InventoryApp.tsx` |
| Inline styles en todo el componente | Alta | Todos los `.tsx` |
| Fetch calls dentro de JSX inline | Alta | `components/InventoryApp.tsx:250,287` |
| `alert()` y `confirm()` nativos del browser | Media | Todos los `.tsx` |
| Polling cada 3s en vez de WebSocket | Media | `components/InventoryApp.tsx:59` |
| Componente monolítico de 360 líneas | Media | `components/InventoryApp.tsx` |
| Sin manejo de errores en fetch | Media | Todos los `.tsx` |
| Sin loading states | Media | Todos los `.tsx` |
| `Math.random()` para IDs | Media | `server.cjs:51`, `components/InventoryApp.tsx` |
| Dos server files activos (`server.js` + `server.cjs`) | Media | Raíz |
| Tres versiones del componente principal | Media | Raíz |

### 3.2 Base de Datos

| Problema | Severidad |
|----------|-----------|
| Sin índices en `gtin`, `seccion`, `fecha_baja` | Alta |
| Campo `usuario` vs `usuario_registro` — inconsistente entre archivos | Media |
| Sin migración de versión para `server.js` | Media |
| Logs sin paginación real (LIMIT hardcodeado) | Media |
| `secciones` como tabla separada pero también hardcodeadas en frontend | Baja |

### 3.3 Infraestructura

| Problema | Severidad |
|----------|-----------|
| `npm run dev` en producción (Vite dev server) | Crítica |
| Sin `.env` para variables de entorno | Alta |
| Sin proceso de build para el servidor | Alta |
| Tauri no integrado funcionalmente | Media |
| Sin CI/CD | Media |

---

## 4. LO QUE ESTÁ BIEN DISEÑADO

Antes de proponer mejoras, reconocer lo que funciona correctamente:

1. **Parser GS1** (`src/utils/gs1Parser.ts`) — excelente implementación para dos casos (parentheses format y raw format). Maneja separadores invisibles. Retorna `null` como fallback.

2. **Soft delete** — `fecha_baja IS NULL` para filtrar stock activo es el patrón correcto para auditoría.

3. **Sistema de logs** — registrar usuario, acción, GTIN, lote y fecha en cada operación es la base correcta para trazabilidad regulatoria.

4. **Migración versionada** en `server.cjs` — `PRAGMA user_version` es el enfoque correcto para SQLite.

5. **Agrupación Master-Detail** — la lógica de agrupar por `nombre` con sub-items por lote/caja es UX correcto para un LIMS.

6. **Barcode buffer pattern** — el patrón de acumular teclas con timeout de 150ms es la forma estándar de capturar escáneres HID.

7. **Glassmorphism UI** — la identidad visual es coherente y modern.

---

## 5. ARQUITECTURA TARGET — ENTERPRISE-GRADE 2026

### 5.1 Stack Recomendado

```
┌─────────────────────────────────────────────────────────────────┐
│  ARQUITECTURA TARGET                                            │
│                                                                 │
│  Frontend (React 19 + TypeScript)                              │
│  ├── Zustand (estado global)                                   │
│  ├── TanStack Query (server state + cache)                     │
│  ├── Tailwind CSS v4 (utility-first)                           │
│  ├── Framer Motion (animaciones)                               │
│  └── Socket.io-client (realtime)                              │
│                                                                 │
│  Backend (Express 5 + TypeScript)                              │
│  ├── JWT auth (access + refresh tokens)                        │
│  ├── bcrypt (hash passwords/PINs)                              │
│  ├── Zod (validación de schemas)                               │
│  ├── Socket.io (WebSocket para realtime)                       │
│  └── Pino (logging estructurado)                               │
│                                                                 │
│  Base de Datos                                                  │
│  ├── SQLite (desarrollo / clínica pequeña)                     │
│  └── PostgreSQL (producción / multi-sede)                      │
│                                                                 │
│  Desktop (Tauri 2.0 — integración real)                        │
│  ├── Comandos Rust para operaciones del sistema                │
│  ├── Auto-updater                                              │
│  └── Notificaciones nativas                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Estructura de Carpetas Target

```
bio-stock-lims/
├── apps/
│   ├── web/                          # Frontend React
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── auth/             # AuthContext, hooks de auth
│   │   │   │   ├── http/             # Cliente HTTP tipado + interceptors
│   │   │   │   └── ws/              # WebSocket client
│   │   │   ├── features/
│   │   │   │   ├── auth/            # Login, logout, session
│   │   │   │   ├── inventory/       # Inventario, stock, barcode
│   │   │   │   ├── catalog/         # Maestro de productos
│   │   │   │   ├── dashboard/       # Métricas, charts
│   │   │   │   ├── audit/           # Logs, trazabilidad
│   │   │   │   └── users/           # Gestión de personal
│   │   │   ├── shared/
│   │   │   │   ├── components/      # Button, Modal, Table, Toast, Badge
│   │   │   │   ├── hooks/           # useDebounce, useLocalStorage, etc.
│   │   │   │   └── types/           # Tipos globales
│   │   │   └── utils/
│   │   │       ├── gs1Parser.ts
│   │   │       ├── dateFormat.ts
│   │   │       └── expirationStatus.ts
│   │   └── package.json
│   └── desktop/                     # Tauri src-tauri (Rust)
├── server/                           # Backend Express + TypeScript
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── inventory.ts
│   │   │   ├── catalog.ts
│   │   │   ├── users.ts
│   │   │   └── audit.ts
│   │   ├── middleware/
│   │   │   ├── authenticate.ts      # JWT verification
│   │   │   ├── authorize.ts         # RBAC role check
│   │   │   ├── validate.ts          # Zod schema validation
│   │   │   └── rateLimit.ts
│   │   ├── db/
│   │   │   ├── connection.ts
│   │   │   ├── migrations/          # Migraciones numeradas
│   │   │   └── repositories/        # Capa de acceso a datos
│   │   ├── services/
│   │   │   ├── inventoryService.ts
│   │   │   ├── auditService.ts
│   │   │   └── notificationService.ts
│   │   ├── events/                  # Event emitters (para WebSocket)
│   │   └── index.ts
│   └── package.json
├── shared/                           # Tipos compartidos frontend/backend
│   └── types/
│       ├── inventory.ts
│       ├── user.ts
│       └── audit.ts
└── package.json                      # Workspace root (monorepo)
```

---

## 6. MODELO DE DATOS — SCHEMA TARGET

```sql
-- Usuarios con hash de contraseña y roles
CREATE TABLE users (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  username    TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,        -- bcrypt hash, NUNCA plaintext
  role        TEXT NOT NULL CHECK(role IN ('ADMIN','SUPERVISOR','TECNICO','VIEWER')),
  is_active   BOOLEAN DEFAULT 1,
  last_login  TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  created_by  TEXT REFERENCES users(id)
);

-- Catálogo maestro de productos
CREATE TABLE products (
  gtin        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  detail      TEXT,
  pack_size   TEXT,
  section     TEXT NOT NULL REFERENCES sections(name),
  temperature TEXT NOT NULL DEFAULT 'Refrigerado' CHECK(temperature IN ('Refrigerado','Congelado','Ambiente')),
  min_stock   INTEGER DEFAULT 1,       -- Umbral mínimo para alerta
  is_active   BOOLEAN DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- Índice de secciones (catálogo)
CREATE TABLE sections (
  name        TEXT PRIMARY KEY,
  description TEXT,
  color       TEXT DEFAULT '#005a9c',
  is_active   BOOLEAN DEFAULT 1
);

-- Stock — cada registro = una caja física
CREATE TABLE stock_items (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  gtin          TEXT NOT NULL REFERENCES products(gtin),
  lot           TEXT NOT NULL,
  expiration    TEXT NOT NULL,         -- Formato ISO YYYYMMDD internamente
  scan_date     TEXT NOT NULL DEFAULT (datetime('now')),
  registered_by TEXT NOT NULL REFERENCES users(id),
  status        TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CONSUMED','EXPIRED','RECALLED')),
  consumed_at   TEXT,
  consumed_by   TEXT REFERENCES users(id),
  notes         TEXT
);

-- Índices críticos para performance
CREATE INDEX idx_stock_gtin ON stock_items(gtin) WHERE status = 'ACTIVE';
CREATE INDEX idx_stock_expiration ON stock_items(expiration) WHERE status = 'ACTIVE';
CREATE INDEX idx_stock_lot ON stock_items(lot);

-- Log de auditoría — APPEND-ONLY, nunca UPDATE ni DELETE
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
  user_id     TEXT REFERENCES users(id),
  username    TEXT NOT NULL,           -- Denormalizado para historial
  action      TEXT NOT NULL,           -- STOCK_IN, STOCK_OUT, LOGIN, etc.
  entity_type TEXT NOT NULL,           -- 'stock_item', 'product', 'user'
  entity_id   TEXT,
  gtin        TEXT,
  lot         TEXT,
  payload     TEXT,                    -- JSON con detalles completos
  ip_address  TEXT,
  session_id  TEXT
);

-- Sesiones JWT (para revocación)
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT
);
```

---

## 7. SISTEMA DE AUTENTICACIÓN Y PERMISOS

### 7.1 Arquitectura JWT

```typescript
// server/src/middleware/authenticate.ts

// Access token: 15 minutos (short-lived)
// Refresh token: 7 días (httpOnly cookie)
// Refresh token almacenado en tabla sessions para poder revocar

interface JWTPayload {
  sub: string;       // user.id
  username: string;
  role: UserRole;
  sessionId: string;
  iat: number;
  exp: number;
}
```

### 7.2 RBAC — Roles y Permisos

| Permiso | VIEWER | TECNICO | SUPERVISOR | ADMIN |
|---------|--------|---------|-----------|-------|
| Ver inventario | ✅ | ✅ | ✅ | ✅ |
| Escanear/Ingresar stock | ❌ | ✅ | ✅ | ✅ |
| Dar de baja stock | ❌ | ✅ | ✅ | ✅ |
| Crear productos maestro | ❌ | ✅ | ✅ | ✅ |
| Ver logs de auditoría | ❌ | ❌ | ✅ | ✅ |
| Gestionar usuarios | ❌ | ❌ | ❌ | ✅ |
| Exportar reportes | ❌ | ❌ | ✅ | ✅ |
| Configurar secciones | ❌ | ❌ | ❌ | ✅ |
| Editar stock de otros | ❌ | ❌ | ✅ | ✅ |

### 7.3 Reglas de Negocio de Permisos

- Un usuario nunca puede auto-revocarse
- Solo ADMIN puede cambiar roles
- SUPERVISOR puede ver logs pero no modificar configuración
- Las sesiones expiran automáticamente (15 min access / 7 días refresh)
- El log de auditoría es inmutable — nadie puede borrar entradas

---

## 8. API CONTRACT — ENDPOINTS TARGET

```
POST   /api/auth/login           → { accessToken, user }
POST   /api/auth/refresh          → { accessToken }
POST   /api/auth/logout           → 200

GET    /api/inventory             → StockItem[] (activos, paginados)
POST   /api/inventory             → StockItem (nuevo ingreso)
PATCH  /api/inventory/:id/consume → StockItem (baja de caja)
GET    /api/inventory/expiring    → StockItem[] (próximos a vencer)
GET    /api/inventory/low-stock   → Product[] (bajo mínimo)

GET    /api/products              → Product[]
GET    /api/products/:gtin        → Product | null
POST   /api/products              → Product
PUT    /api/products/:gtin        → Product

GET    /api/sections              → Section[]
POST   /api/sections              → Section

GET    /api/users                 → User[] (solo ADMIN)
POST   /api/users                 → User (solo ADMIN)
DELETE /api/users/:id             → 204 (soft delete, solo ADMIN)

GET    /api/audit                 → AuditLog[] (paginado, solo SUPERVISOR+)
GET    /api/audit/export          → CSV/PDF (solo SUPERVISOR+)

GET    /api/metrics/dashboard     → DashboardMetrics
GET    /api/metrics/section/:name → SectionMetrics
```

---

## 9. REALTIME — WEBSOCKETS

Reemplazar el polling de 3s con WebSocket para:

```typescript
// Eventos del servidor → cliente
'stock:added'      // Nueva caja ingresada
'stock:consumed'   // Caja dada de baja
'stock:critical'   // Stock bajó del mínimo
'stock:expiring'   // Reactivo vence en < 30 días

// Todos los clientes conectados reciben el update inmediato
// Elimina el polling y reduce carga en el servidor
```

---

## 10. UX/UI — SISTEMA DE DISEÑO TARGET

### 10.1 Filosofía Visual

- **Glassmorphism funcional** — vidrio solo donde separa contextos, no decorativo
- **Información densa pero clara** — no sacrificar datos por minimalismo vacío
- **Color como semántica** — rojo/amarillo/verde para estado, azul para acción
- **Typography system** — Inter para UI, Roboto Mono para datos (GTIN, lotes)

### 10.2 Design Tokens

```css
/* Colores primarios */
--color-primary: #005a9c;
--color-primary-hover: #004880;
--color-surface: rgba(255, 255, 255, 0.75);
--color-surface-raised: rgba(255, 255, 255, 0.90);

/* Estados de stock */
--color-stock-ok: #10b981;       /* > 70% del mínimo */
--color-stock-low: #f59e0b;      /* < 70% del mínimo */
--color-stock-critical: #ef4444; /* < 30% del mínimo */

/* Vencimiento */
--color-exp-ok: #10b981;         /* > 90 días */
--color-exp-warn: #f59e0b;       /* 30–90 días */
--color-exp-critical: #ef4444;   /* < 30 días */

/* Fondo */
--gradient-bg: linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%);
--gradient-bg-dark: linear-gradient(135deg, #0f2027 0%, #203a43 100%);
```

### 10.3 Componentes Críticos a Construir

```
shared/components/
├── Toast.tsx           # Reemplazar todos los alert()
├── ConfirmDialog.tsx   # Reemplazar todos los confirm()
├── DataTable.tsx       # Tabla reutilizable con sort, filter, pagination
├── StatCard.tsx        # Tarjeta de métrica del dashboard
├── StockBadge.tsx      # Badge con color según nivel de stock
├── ExpirationBadge.tsx # Badge con color según días a vencer
├── BarcodeStatus.tsx   # Indicador láser activo/inactivo
├── LoadingSpinner.tsx  # Estado de carga
└── ErrorBoundary.tsx   # Capturar errores React
```

### 10.4 Dashboard Ejecutivo Target

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard                               [Hoy: 2026-05-08]  │
├───────────┬───────────┬───────────┬───────────────────────┐ │
│ 📦 Total  │ ⚠️ Crítico │ 🔴 Vence  │ 📊 Movimientos Hoy   │ │
│   1,247   │    12     │  < 30d: 8 │      +34 / -12       │ │
└───────────┴───────────┴───────────┴───────────────────────┘ │
│                                                              │
│  Stock por Sección ─────────────────────────── [Bar Chart] │ │
│  Reactivos Críticos ────────────────────────── [List]      │ │
│  Próximos a Vencer ─────────────────────────── [Timeline]  │ │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. MANEJO CORRECTO DE STOCK Y LOTES

### 11.1 Reglas de Negocio Críticas

```typescript
// Nunca deben violarse estas reglas

// 1. FIFO — First In First Out
// Al dar de baja, siempre el lote más antiguo primero
// (ordenar por expiration ASC en el query de consumo)

// 2. Alerta de vencimiento
const EXPIRATION_WARN_DAYS = 90;   // Naranja: 30–90 días
const EXPIRATION_CRITICAL_DAYS = 30; // Rojo: < 30 días

// 3. Stock mínimo por producto
// Definido en products.min_stock
// Emitir evento 'stock:critical' cuando stock actual < min_stock

// 4. Lotes — identificador único por producto
// Mismo GTIN + mismo lote = mismo batch físico
// Cajas distintas del mismo lote son items distintos en stock_items

// 5. Vencidos — proceso automático
// Daily job: marcar status='EXPIRED' donde expiration < today
// Registrar en audit_log automáticamente
```

### 11.2 Formato de Fechas

```typescript
// REGLA: Internamente siempre ISO 8601 (YYYYMMDD o YYYY-MM-DD)
// El formato GS1 AAMMDD se convierte al ingresar

function gs1DateToISO(gs1: string): string {
  // "260531" → "2026-05-31"
  const year = 2000 + parseInt(gs1.substring(0, 2));
  const month = gs1.substring(2, 4);
  const day = gs1.substring(4, 6);
  return `${year}-${month}-${day}`;
}

// Display: localizado según configuración del sistema
// Audit log: siempre UTC ISO 8601
```

---

## 12. LOGGING Y AUDITORÍA REGULATORIA

### 12.1 Eventos que SIEMPRE se registran

```typescript
const AUDIT_EVENTS = {
  // Auth
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_FAILED: 'AUTH_FAILED',
  AUTH_TOKEN_REFRESH: 'AUTH_TOKEN_REFRESH',
  
  // Inventario
  STOCK_IN: 'STOCK_IN',           // Ingreso de caja
  STOCK_OUT: 'STOCK_OUT',         // Baja de caja
  STOCK_EXPIRED: 'STOCK_EXPIRED', // Marcado automático por vencimiento
  STOCK_RECALLED: 'STOCK_RECALLED', // Retiro por recall de lote
  
  // Catálogo
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_DEACTIVATED: 'PRODUCT_DEACTIVATED',
  
  // Usuarios
  USER_CREATED: 'USER_CREATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  
  // Seguridad
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  SESSION_REVOKED: 'SESSION_REVOKED',
} as const;
```

### 12.2 Estructura del Log Entry

```typescript
interface AuditEntry {
  id: number;
  timestamp: string;          // UTC ISO 8601
  userId: string;
  username: string;           // Denormalizado para historial permanente
  action: string;
  entityType: string;
  entityId?: string;
  gtin?: string;
  lot?: string;
  payload: Record<string, unknown>; // Snapshot completo del estado
  ipAddress?: string;
  sessionId: string;
}
```

---

## 13. CONVENCIONES DE CÓDIGO

### 13.1 TypeScript

```typescript
// ✅ CORRECTO — tipos explícitos
interface StockItem {
  id: string;
  gtin: string;
  lot: string;
  expiration: string;
  scanDate: string;
  registeredBy: string;
  status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED' | 'RECALLED';
  consumedAt?: string;
  consumedBy?: string;
}

// ❌ NUNCA — any
const [inventory, setInventory] = useState<any[]>([]);

// ✅ CORRECTO
const [inventory, setInventory] = useState<StockItem[]>([]);
```

### 13.2 Naming

```typescript
// Archivos: PascalCase para componentes, camelCase para utilidades
// InventoryTable.tsx, useInventory.ts, gs1Parser.ts

// Funciones: camelCase, verbos que describen la acción
// fetchInventory(), handleBarcodeScanned(), consumeStockItem()

// Constantes: UPPER_SNAKE_CASE
// API_URL, EXPIRATION_WARN_DAYS, AUDIT_EVENTS

// Tipos/Interfaces: PascalCase
// StockItem, AuditEntry, UserRole

// Hooks: prefijo "use"
// useInventory(), useAuth(), useBarcodeScanner()
```

### 13.3 Componentes React

```typescript
// ✅ Separar lógica en custom hooks
// ✅ Un componente = una responsabilidad
// ✅ Nunca fetch() directamente en componentes — pasar por servicios
// ✅ Usar TanStack Query para server state
// ❌ No usar setState en eventos inline del JSX para operaciones API
// ❌ No usar alert() ni confirm() — usar Toast y ConfirmDialog

// Tamaño máximo de componente: ~150 líneas
// Si supera eso, extraer sub-componentes o hooks
```

### 13.4 CSS/Estilos

```typescript
// ✅ Tailwind CSS — clases utility
// ✅ Variables CSS para design tokens
// ❌ Inline styles (style={{}}) — solo para valores dinámicos no expresables en Tailwind
// ❌ Objetos de estilo definidos fuera del componente como constantes
```

### 13.5 Server

```typescript
// ✅ Validación Zod en TODOS los endpoints antes de tocar la DB
// ✅ Manejo de errores con try/catch y respuesta estructurada
// ✅ HTTP status codes semánticamente correctos
// ✅ Logging estructurado con Pino (no console.log)
// ❌ Queries SQL directas en los route handlers — usar repositories
// ❌ Exponer stack traces al cliente en producción
```

---

## 14. PATRONES ESTABLECIDOS

### 14.1 Custom Hook para Datos

```typescript
// features/inventory/hooks/useInventory.ts
function useInventory() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.getAll(),
    staleTime: 30_000,
  });

  const consumeMutation = useMutation({
    mutationFn: inventoryApi.consume,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Caja retirada del stock');
    },
    onError: () => toast.error('Error al retirar la caja'),
  });

  return { inventory: data ?? [], isLoading, error, consume: consumeMutation.mutate };
}
```

### 14.2 Repository Pattern

```typescript
// server/src/db/repositories/inventoryRepository.ts
export const inventoryRepository = {
  findActive: (section?: string) => 
    db.all(`SELECT ... WHERE status = 'ACTIVE' ${section ? 'AND seccion = ?' : ''}`, section ? [section] : []),
  
  findById: (id: string) =>
    db.get('SELECT * FROM stock_items WHERE id = ?', [id]),
  
  create: (item: NewStockItem) =>
    db.run('INSERT INTO stock_items ...', [...]),
  
  consume: (id: string, userId: string) =>
    db.run("UPDATE stock_items SET status='CONSUMED', consumed_at=?, consumed_by=? WHERE id=?", 
      [new Date().toISOString(), userId, id]),
};
```

### 14.3 Barcode Scanner Hook

```typescript
// shared/hooks/useBarcodeScanner.ts
// Encapsula el patrón de buffer de teclado
// Retorna el último código escaneado via callback
// Configurable: debounce time, min length, enabled flag

function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  // implementación del buffer pattern actual, pero tipada y reutilizable
}
```

---

## 15. ROADMAP TÉCNICO

### Fase 1 — Hardening de Seguridad (Semana 1–2)

- [ ] Implementar bcrypt para hash de PINs/passwords
- [ ] Implementar JWT access + refresh tokens
- [ ] Agregar middleware de autenticación a todas las rutas
- [ ] Cerrar CORS a orígenes específicos
- [ ] Eliminar contraseña hardcodeada del frontend
- [ ] Configurar `.env` con variables de entorno
- [ ] Configurar CSP en Tauri
- [ ] Cambiar `Math.random()` por `crypto.randomUUID()`

### Fase 2 — Refactoring Frontend (Semana 2–4)

- [ ] Definir todos los tipos TypeScript (eliminar `any`)
- [ ] Instalar y configurar TanStack Query
- [ ] Instalar y configurar Zustand para estado global
- [ ] Instalar Tailwind CSS v4
- [ ] Crear sistema de Toast notifications
- [ ] Crear componente ConfirmDialog
- [ ] Extraer lógica de barcode scanner a `useBarcodeScanner` hook
- [ ] Dividir InventoryApp en sub-componentes (< 150 líneas c/u)
- [ ] Crear `DataTable` reutilizable con paginación
- [ ] Eliminar archivos legacy: `src/InventoryApp.tsx`, `src/components/InventoryInput.tsx`, `server.js`

### Fase 3 — Backend Production-Ready (Semana 3–5)

- [ ] Reescribir server en TypeScript
- [ ] Implementar repository pattern
- [ ] Implementar validación Zod en todos los endpoints
- [ ] Agregar índices SQLite en columnas críticas
- [ ] Implementar WebSocket con Socket.io (reemplazar polling)
- [ ] Implementar logging estructurado con Pino
- [ ] Migrar a build de producción (compilar TypeScript, no Vite dev)
- [ ] Agregar paginación real a `/api/audit` y `/api/inventory`

### Fase 4 — Features LIMS (Semana 4–8)

- [ ] Dashboard con métricas reales (stock crítico, próximos a vencer)
- [ ] Sistema de alertas de stock mínimo configurable por producto
- [ ] Alertas visuales de vencimiento (colores por days-to-expiry)
- [ ] Export de reportes (CSV + PDF)
- [ ] Vista de historial/trazabilidad mejorada con filtros
- [ ] Proceso automático de marcado de vencidos
- [ ] Gestión de secciones desde UI (sin hardcodear)
- [ ] Dark mode

### Fase 5 — Enterprise Features (Mes 2–3)

- [ ] Multi-sede (branch isolation)
- [ ] API pública con documentación OpenAPI
- [ ] Webhooks para integración con sistemas externos
- [ ] OCR para ingreso por foto de etiqueta
- [ ] Generación de QR por ítem de stock
- [ ] Integración Tauri real (notificaciones nativas, escáner USB directo)
- [ ] Modo offline-first con sincronización incremental
- [ ] Backup automático de la DB

---

## 16. DECISIONES ARQUITECTÓNICAS

### ADR-001: SQLite como DB principal

**Decisión:** Mantener SQLite para el MVP y clínicas pequeñas.  
**Razón:** Cero infraestructura adicional, funciona offline, suficiente para < 5 usuarios concurrentes.  
**Trade-off:** No escala a múltiples sedes concurrentes ni a volúmenes > 1M rows de forma óptima.  
**Trigger para migrar:** > 3 sedes concurrentes o > 10 usuarios simultáneos → migrar a PostgreSQL.

### ADR-002: Servicios Windows Nativos como plataforma de despliegue

**Decisión:** Node.js + Nginx for Windows ejecutados como servicios Windows via NSSM. Automatización 100% PowerShell.  
**Razón:** El entorno de despliegue es exclusivamente Windows. Docker Desktop en Windows requiere WSL2 (Linux bajo el capó), lo que contradice la restricción de evitar dependencias Linux. NSSM es el estándar enterprise para ejecutar Node.js como servicio Windows nativo.  
**Trade-off:** El entorno de desarrollo (macOS/Linux) difiere del despliegue (Windows). Mitigado con scripts PowerShell que reproducen el comportamiento.  
**Alternativa descartada:** Docker Compose — require WSL2 en Windows (es un subsistema Linux), viola la restricción de entorno Windows puro.  
**Alternativa descartada:** Tauri — empaquetador de app desktop, incompatible con acceso multi-usuario en LAN.

### ADR-003: No usar ORM

**Decisión:** SQL directo con repository pattern en vez de ORM (TypeORM, Prisma).  
**Razón:** La app es SQLite-first, las queries son simples y conocidas. Un ORM agrega complejidad innecesaria.  
**Trade-off:** Más código SQL manual. Mitigado con el repository pattern.

### ADR-004: Polling → WebSocket

**Decisión:** Migrar el polling de 3s a WebSocket (Socket.io).  
**Razón:** El polling genera ~1,200 requests/hora por cliente. Con WebSocket, el servidor emite eventos solo cuando hay cambios.  
**Impacto:** Mejora performance y permite notificaciones en tiempo real para múltiples clientes simultáneos.

---

## 17. CHECKLIST DE REVISIÓN DE CÓDIGO

Antes de cada PR, verificar:

### Seguridad
- [ ] ¿Hay algún secret o password hardcodeado?
- [ ] ¿Están todos los endpoints protegidos con autenticación?
- [ ] ¿Se valida el input del usuario antes de usar en queries?
- [ ] ¿Los errores expuestos al cliente no revelan detalles internos?

### Código
- [ ] ¿Hay tipos TypeScript explícitos (sin `any`)?
- [ ] ¿Se manejan los estados de error y loading?
- [ ] ¿Los fetch calls pasan por el cliente HTTP centralizado?
- [ ] ¿Se registra en audit_log toda acción de negocio relevante?
- [ ] ¿Los IDs son `crypto.randomUUID()`?

### UX
- [ ] ¿Se usan Toast en vez de `alert()`?
- [ ] ¿Se usan ConfirmDialog en vez de `confirm()`?
- [ ] ¿Hay feedback visual durante operaciones async (loading)?
- [ ] ¿Los mensajes de error son accionables para el usuario?

---

## 18. ARQUITECTURA ON-PREMISE — WINDOWS ENTERPRISE

### 18.1 Visión General del Despliegue

```
  RED INTERNA CORPORATIVA (LAN)
  ════════════════════════════════════════════════════════════════

  [PC Escáner 1]  [PC Escáner 2]  [PC Supervisor]  [PC Admin]
       │               │                │                │
       └───────────────┴────────────────┴────────────────┘
                                │
                         Navegador Web
                    http://192.168.1.100
                                │
  ╔══════════════════════════════╧══════════════════════════════╗
  ║  SERVIDOR PRINCIPAL (Windows 10/11 Pro o Ubuntu Server)    ║
  ║                                                             ║
  ║  ┌─────────────────────────────────────────────────────┐   ║
  ║  │           Docker Compose Stack                      │   ║
  ║  │                                                     │   ║
  ║  │  ┌──────────────┐  ┌──────────────────────────┐    │   ║
  ║  │  │  NGINX       │  │   NODE.JS API            │    │   ║
  ║  │  │  :80         │  │   Express + Socket.io    │    │   ║
  ║  │  │  ├── /       │  │   Puerto interno: 3000   │    │   ║
  ║  │  │  │  React SPA│  │   (NO expuesto a LAN)    │    │   ║
  ║  │  │  └── /api → ─┼──┼──►                       │    │   ║
  ║  │  │  └── /ws  → ─┼──┼──►                       │    │   ║
  ║  │  └──────────────┘  └──────────┬───────────────┘    │   ║
  ║  │                               │                     │   ║
  ║  │                   ┌───────────▼───────────┐         │   ║
  ║  │                   │   SQLite + WAL mode   │         │   ║
  ║  │                   │   /app/data/*.db      │         │   ║
  ║  │                   │   (volumen en disco)  │         │   ║
  ║  │                   └───────────────────────┘         │   ║
  ║  └─────────────────────────────────────────────────────┘   ║
  ║                                                             ║
  ║  ./data/          → Base de datos (persistente)            ║
  ║  ./backups/       → Backups automáticos diarios            ║
  ║  ./logs/          → Logs estructurados rotativos           ║
  ╚═════════════════════════════════════════════════════════════╝
```

### 18.2 Evaluación: Docker vs Alternativas

| Opción | Estabilidad | Facilidad | Actualizaciones | Veredicto |
|--------|-------------|-----------|-----------------|-----------|
| **Docker Compose** | ★★★★★ | ★★★★☆ | ★★★★★ | **Recomendado** |
| PM2 + nativo | ★★★★☆ | ★★★☆☆ | ★★★☆☆ | Alternativa válida |
| Kubernetes | ★★★★★ | ★☆☆☆☆ | ★★★★★ | Sobredimensionado |
| IIS/Windows Services | ★★★☆☆ | ★★☆☆☆ | ★★☆☆☆ | No recomendado |
| `.bat` actual | ★★☆☆☆ | ★★★★★ | ★☆☆☆☆ | Solo desarrollo |

**Docker Compose es la elección correcta porque:**
- Entorno reproducible: mismo comportamiento en cualquier máquina
- Aislamiento: el servidor no contamina el OS host
- Actualizaciones atómicas: `docker compose up -d` sin downtime perceptible
- Rollback trivial: `docker compose down && git checkout v1.0 && docker compose up -d`
- Backups simples: copiar `./data/` es suficiente

### 18.3 Decisión: SQLite vs PostgreSQL en On-Premise

```
Criterio                    SQLite (WAL)        PostgreSQL
─────────────────────────── ─────────────────── ──────────────────
Usuarios concurrentes       < 15 escrituras/s   Ilimitado
Complejidad operacional     Mínima              Media
Backup                      cp archivo.db       pg_dump
Recuperación                Instantánea         ~1-2 minutos
Tamaño máximo efectivo      ~1GB óptimo         Terabytes
Setup en Docker             1 contenedor        2 contenedores
Admin requerido             Ninguno             Alguno
Suficiente para el MVP      ✅ Sí               ✅ Sí (más robusto)
```

**Decisión:** SQLite con WAL mode para el despliegue inicial (laboratorios con hasta ~20 terminales). Migrar a PostgreSQL si se detectan errores "database is locked" o se supera el throughput.

**Activar WAL mode** (se hace una sola vez en la DB):
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;  -- 64MB de cache en memoria
PRAGMA temp_store = memory;
```

### 18.4 Estructura de Archivos del Servidor

```
/opt/bio-stock-lims/          (Linux)
C:\BioStock\                  (Windows)
├── docker-compose.yml
├── Dockerfile.server
├── Dockerfile.frontend
├── nginx/
│   └── nginx.conf
├── .env                      ← NUNCA en git. Solo en el servidor.
├── data/
│   └── inventario_biorad.db  ← DB principal (respaldar esto)
├── backups/
│   ├── biostock_2026-05-08_02-00.db.gz
│   └── backup.log
├── logs/
│   └── api-2026-05-08.log
└── scripts/
    ├── deploy.bat / deploy.sh
    ├── backup.bat / backup.sh
    ├── update.bat
    └── ver-logs.bat
```

### 18.5 Concurrencia en Red Local

**Escenario típico:** 5-20 usuarios simultáneos, acceso desde navegador en LAN.

**Cómo funciona:**

1. **Conexiones HTTP:** Nginx gestiona todas las conexiones (maneja miles sin problema)
2. **Requests API:** Node.js con async/await — puede manejar cientos de requests concurrentes
3. **SQLite WAL:** Permite lecturas concurrentes ilimitadas. Escrituras se serializan (< 1ms cada una — no perceptible para usuarios de laboratorio)
4. **WebSocket (futuro):** Socket.io mantiene una conexión persistente por cliente, emitiendo actualizaciones en tiempo real sin polling

**Cuellos de botella posibles y mitigaciones:**

```
Problema                    Síntoma              Solución
────────────────────────── ─────────────────── ──────────────────────
SQLite "database locked"   Error al escanear   Activar WAL mode
Node.js bloqueado           Requests lentos      Mover trabajo pesado
                                                 a worker threads
Nginx sin conexiones        502 Bad Gateway      Aumentar keepalive
Red local saturada          UI lenta             Activar gzip (ya config.)
```

### 18.6 Configuración de Nginx para LAN

El archivo `nginx/nginx.conf` ya está configurado con:

- **Gzip:** Compresión de JS/CSS/JSON → reduce tráfico ~70% en LAN
- **Cache de assets:** JS/CSS con hash se cachean 1 año en navegadores → primera carga lenta, recargas instantáneas
- **Rate limiting:** 60 req/s por IP para el API, 10 req/min para login (anti brute-force)
- **WebSocket:** Proxy configurado para `/socket.io/` con timeout de 24h
- **Security headers:** X-Frame-Options, X-Content-Type-Options, etc.
- **Health check:** `/health` sin rate limit para monitoring

### 18.7 Autenticación en Entorno Cerrado

Aunque el sistema es on-premise/LAN, **se debe implementar autenticación JWT** porque:
- Protege contra acceso accidental entre departamentos
- Garantiza trazabilidad de quién hizo qué
- Es requerimiento regulatorio en laboratorios clínicos

**Flujo de autenticación en LAN:**

```
Cliente (navegador)                    Servidor (Docker)
─────────────────────                  ─────────────────
POST /api/auth/login
{ username, pin }         ──────────►  Verificar bcrypt(pin) vs DB
                          ◄──────────  { accessToken (15min), refreshToken (7d) }
                                       Set-Cookie: refreshToken (httpOnly)

GET /api/inventory
Authorization: Bearer {accessToken} ──►  Middleware verifica JWT
                          ◄──────────  datos

[Cada 15 min, access token expira]
POST /api/auth/refresh    ──────────►  Verificar refreshToken en DB
                          ◄──────────  { nuevo accessToken }
```

**El refreshToken se guarda en una cookie httpOnly** — no accesible desde JavaScript, protegido contra XSS.

### 18.8 Backups — Estrategia Empresarial

**Estrategia en tres capas:**

```
Capa 1: Backup Automático Local (cada día 02:00 AM)
├── VACUUM INTO → copia consistente sin bloquear la DB
├── Compresión gzip → ahorra ~60% de espacio
├── Retención: 30 días → borra backups más antiguos
└── Log en ./backups/backup.log

Capa 2: Backup en NAS / Disco de Red (semanal)
├── Script xcopy/rsync copia ./backups/ al NAS corporativo
├── El NAS puede estar en otro piso o sala de servidores
└── Protege contra fallo del disco del servidor principal

Capa 3: Backup Offline (mensual, manual)
├── Copiar ./data/ a USB externo
└── Guardar en caja fuerte o ubicación física separada
```

**Script de backup ya creado:** `scripts/backup.bat` y `scripts/backup.sh`

**Tarea Programada en Windows** (configurada automáticamente por `deploy.bat`):
```
Nombre: BioStock-Backup-Diario
Trigger: Diariamente a las 02:00 AM
Acción: scripts\backup.bat
Usuario: SYSTEM
```

**Verificar que los backups funcionan:**
```bat
scripts\backup.bat           :: Corre manualmente
type backups\backup.log      :: Ver historial de backups
dir backups\*.db*            :: Ver archivos de backup
```

### 18.9 Recuperación ante Fallos

**Escenario 1: La API crasheó**
```bash
docker compose restart api   # Docker la reinicia automáticamente (restart: unless-stopped)
docker compose logs api      # Ver por qué crasheó
```

**Escenario 2: El disco de datos está corrupto**
```bat
:: Detener sistema
docker compose down

:: Restaurar último backup
copy backups\biostock_2026-05-07_02-00.db data\inventario_biorad.db

:: Reiniciar
docker compose up -d
```

**Escenario 3: El servidor principal falla (máquina muerta)**
```
1. Instalar Docker en máquina de reemplazo
2. Copiar el directorio completo del proyecto al reemplazo
   (incluyendo ./data/ con la DB)
3. Ejecutar scripts\deploy.bat
4. Comunicar nueva IP a usuarios (o configurar IP estática)
Tiempo de recuperación: < 15 minutos
```

**Escenario 4: Actualización fallida**
```bat
:: El script update.bat hace backup ANTES de actualizar
:: Si falla, el backup garantiza que no se perdieron datos
:: Para revertir el código: git checkout v1.0-anterior
docker compose up -d --build
```

### 18.10 Actualizaciones del Sistema

**Proceso de actualización (zero downtime perceptible):**

```bat
scripts\update.bat
```

El script realiza:
1. Backup de seguridad automático
2. `docker compose down` (< 2 segundos de downtime)
3. `git pull` para obtener el nuevo código
4. `docker compose build --no-cache` (reconstruye imágenes)
5. `docker compose up -d` (nuevo contenedor, misma DB)

**Versiones del sistema:** Usar tags de git como `v1.0`, `v1.1`, `v2.0`.

**Rollback si la actualización es defectuosa:**
```bash
git checkout v1.0   # Volver a versión anterior
docker compose up -d --build
```

### 18.11 Monitoreo Local (Sin Cloud)

**Opción A — Mínimo viable (ya implementado):**

El endpoint `/health` retorna:
```json
{ "status": "ok", "timestamp": "2026-05-08T14:30:00Z" }
```

Docker lo consulta cada 30s. Si falla 3 veces, reinicia el contenedor.

**Opción B — Monitoreo visual local (recomendado para equipos IT):**

Agregar al `docker-compose.yml`:

```yaml
# Uptime Kuma — dashboard de monitoreo, corre 100% local
uptime-kuma:
  image: louislam/uptime-kuma:1
  container_name: biostock_monitor
  ports:
    - "3001:3001"
  volumes:
    - uptime_data:/app/data
  restart: unless-stopped
  networks:
    - biostock_internal
```

Acceso: `http://IP_SERVIDOR:3001`

Monitorear:
- `http://localhost/health` → API disponible
- `http://localhost` → Frontend accesible
- Envía alertas por email (SMTP local) si el sistema cae

**Opción C — Métricas de performance (avanzado):**

```yaml
# Prometheus + Grafana — métricas de sistema
# Solo agregar si el equipo IT tiene experiencia con estas herramientas
prometheus:
  image: prom/prometheus:latest
  ports: ["9090:9090"]
  
grafana:
  image: grafana/grafana:latest
  ports: ["3002:3000"]
```

### 18.12 Seguridad en Red Interna

Aunque es una LAN privada, se aplican las siguientes medidas:

**Firewall del servidor:**
```
Puerto 80  → Permitir desde 192.168.x.x (LAN)
Puerto 22  → Solo para administrador (SSH en Linux)
Puerto 3000 → DENEGAR desde LAN (solo Nginx accede internamente via Docker)
Puerto 5432 → DENEGAR (si se usa PostgreSQL en el futuro)
```

**En Windows Defender Firewall:**
- Crear regla: Permitir entrada en puerto 80 desde red privada
- Bloquear acceso externo si el servidor tiene conexión a Internet

**SSL/TLS en LAN (recomendado a mediano plazo):**
```
Opción 1 — mkcert (más simple):
mkcert -install
mkcert 192.168.1.100 localhost

Opción 2 — Certificado autofirmado:
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/server.key \
  -out nginx/ssl/server.crt \
  -subj "/CN=biostock.local"

Luego actualizar nginx.conf para usar :443 con los certificados
```

### 18.13 Exportación e Importación de Datos

**Exportar inventario actual a CSV:**
```javascript
// Endpoint a implementar: GET /api/export/inventory?format=csv&section=Hematología
// Genera un CSV descargable directamente desde la UI
```

**Exportar base de datos completa:**
```bat
:: Backup mantenible para migración
copy data\inventario_biorad.db exports\biostock_export_%date%.db
```

**Importar datos de sistema anterior:**
```sql
-- Patrón de migración: INSERT OR IGNORE para no duplicar
ATTACH DATABASE 'sistema_anterior.db' AS viejo;
INSERT OR IGNORE INTO maestro_productos SELECT * FROM viejo.maestro_productos;
DETACH DATABASE viejo;
```

### 18.14 Escalabilidad Futura desde On-Premise

Si el sistema crece más de lo previsto en la LAN actual:

```
Paso 1 (actual): 1 servidor, SQLite, Docker Compose
↓
Paso 2 (> 20 usuarios): Cambiar SQLite → PostgreSQL (instalar como servicio Windows)
                         Actualizar DB_PATH en .env y connection string en el código
↓
Paso 3 (multi-sede): Servidor central con PostgreSQL, sedes con acceso VPN
                     Los scripts PowerShell se adaptan solo cambiando la IP en .env
↓
Paso 4 (cloud, si se requiere algún día): Mover el servidor a un VPS Windows
                                           Los mismos scripts PowerShell funcionan
```

**La arquitectura de servicios Windows garantiza portabilidad entre equipos Windows** — el mismo `Install-BioStock.ps1` instala el sistema en cualquier PC Windows 10/11 o Windows Server sin cambios.

---

## 18A. ARQUITECTURA WINDOWS — DETALLE TÉCNICO

### Decisión: Docker Desktop vs Servicios Windows Nativos

**Docker Desktop en Windows** requiere WSL2 (Windows Subsystem for Linux 2), que es esencialmente un kernel Linux corriendo dentro de Windows. Para un entorno que debe ser 100% Windows sin dependencias de Linux, esto es inaceptable.

```
Docker Desktop en Windows
├── Usa WSL2 o Hyper-V
├── Corre contenedores Linux (no Windows containers)
├── Requiere licencia comercial para empresas > 250 empleados
├── Introduce una capa Linux bajo el stack
└── ❌ Viola la restricción de entorno Windows puro

Servicios Windows Nativos (NSSM + Node.js + Nginx for Windows)
├── 100% código nativo Windows
├── Sin WSL2, sin Linux, sin Docker Desktop
├── Integración completa con Windows Services, Event Log, Task Scheduler
├── Administrable desde Services.msc, PowerShell, Server Manager
└── ✅ Enterprise-grade en entorno Windows puro
```

### Stack de Producción Windows

```
C:\BioStock\
├── app\
│   ├── server.cjs              ← API Node.js
│   ├── package.json
│   └── node_modules\
├── nginx\
│   ├── nginx.exe               ← Nginx portable para Windows
│   ├── conf\
│   │   └── nginx.conf          ← Generado por Install-BioStock.ps1
│   ├── html\                   ← React SPA compilada (npm run build)
│   └── logs\
├── data\
│   └── inventario_biorad.db    ← Base de datos SQLite (WAL mode)
├── backups\
│   ├── biostock_2026-05-08_02-00-00.zip
│   └── backup.log
├── logs\
│   ├── api-stdout.log          ← Stdout del API (rotado 10MB)
│   ├── api-stderr.log          ← Stderr del API
│   └── biostock-2026-05-08.log ← Log diario de operaciones
├── tools\
│   └── nssm.exe                ← Non-Sucking Service Manager
├── scripts\
│   ├── BioStockConfig.ps1      ← Módulo de configuración central
│   ├── Install-BioStock.ps1    ← Instalador completo
│   ├── Backup-BioStock.ps1     ← Backup de DB
│   ├── Restore-BioStock.ps1    ← Restauración de DB
│   ├── Update-BioStock.ps1     ← Actualización del sistema
│   ├── Get-BioStockStatus.ps1  ← Monitor de estado
│   ├── Start-BioStock.ps1      ← Iniciar servicios
│   ├── Stop-BioStock.ps1       ← Detener servicios
│   └── Set-ExecutionPolicy-BioStock.ps1
└── .env                        ← Variables de entorno (PRIVADO)
```

### Servicios Windows Instalados

| Servicio | Ejecutable | Puerto | Reinicio |
|---------|-----------|--------|---------|
| `BioStock-API` | `node.exe server.cjs` | 3000 (solo localhost) | Automático (3s delay) |
| `BioStock-Nginx` | `nginx.exe` | 80 (LAN pública) | Automático (3s delay) |

Administración desde `services.msc` o PowerShell:
```powershell
Get-Service BioStock-*           # Ver estado
Restart-Service BioStock-API     # Reiniciar API
Stop-Service BioStock-Nginx      # Detener Nginx
```

### Tareas Programadas (Task Scheduler)

| Tarea | Horario | Acción |
|-------|---------|--------|
| `BioStock-Backup-Diario` | 02:00 AM, cada día, usuario SYSTEM | `Backup-BioStock.ps1` |
| `BioStock-Limpieza-Logs` | 03:00 AM, cada domingo, usuario SYSTEM | Elimina logs > 90 días |

Verificar desde PowerShell:
```powershell
Get-ScheduledTask -TaskName 'BioStock-*' | Select-Object TaskName, State, LastRunTime
```

### Windows Event Log

Todas las operaciones críticas se registran en el Event Log de Windows (Fuente: `BioStock-LIMS`, Log: `Application`):

| EventID | Tipo | Evento |
|---------|------|--------|
| 1000 | Information | Instalación completada |
| 2000 | Information | Backup exitoso |
| 2001 | Error | Backup fallido |
| 2010 | Information | Restauración completada |
| 3000 | Information | Actualización exitosa |
| 4001 | Warning | Alerta de monitoreo (API caída, disco lleno, etc.) |

Ver en PowerShell:
```powershell
Get-EventLog -LogName Application -Source 'BioStock-LIMS' -Newest 20
```

O en el visor de eventos de Windows: `eventvwr.msc` → Application → Source: BioStock-LIMS

### Windows Firewall

Configurado automáticamente por `Install-BioStock.ps1`:

```powershell
# Regla creada: BioStock-HTTP
# Puerto 80 abierto para perfiles Domain y Private (LAN empresarial)
# Puerto 3000 (API) bloqueado desde exterior — solo Nginx accede vía localhost

# Verificar
Get-NetFirewallRule -DisplayName 'BioStock-*' | Select-Object DisplayName, Enabled, Action, Direction
```

### Windows Defender

Exclusiones configuradas automáticamente para evitar falsos positivos con SQLite y Node.js:
- `C:\BioStock\` (directorio completo del sistema)
- `node.exe` (proceso de la API)
- `nginx.exe` (servidor web)

### Política de Ejecución PowerShell

**Antes de la primera instalación**, ejecutar como Administrador:
```powershell
# Paso 0 — Solo una vez por máquina:
powershell -ExecutionPolicy Bypass -File .\scripts\Set-ExecutionPolicy-BioStock.ps1
```

Esto configura `RemoteSigned` a nivel LocalMachine y desbloquea los scripts del proyecto.

---

## 19. COMANDOS ESENCIALES (WINDOWS / POWERSHELL)

```powershell
# ════════════════════════════════════════════════════════════════
# INSTALACIÓN (una sola vez)
# ════════════════════════════════════════════════════════════════

# 0. Preparar política de ejecución (Admin, solo una vez)
powershell -ExecutionPolicy Bypass -File .\scripts\Set-ExecutionPolicy-BioStock.ps1

# 1. Instalación completa
.\scripts\Install-BioStock.ps1

# Opciones de instalación:
.\scripts\Install-BioStock.ps1 -Port 8080              # Puerto personalizado
.\scripts\Install-BioStock.ps1 -InstallPath D:\BioStock # Ruta personalizada
.\scripts\Install-BioStock.ps1 -Offline                 # Sin acceso a internet

# ════════════════════════════════════════════════════════════════
# OPERACIÓN DIARIA
# ════════════════════════════════════════════════════════════════

.\scripts\Get-BioStockStatus.ps1              # Estado completo del sistema
.\scripts\Get-BioStockStatus.ps1 -Watch       # Monitor continuo (auto-refresh)
.\scripts\Start-BioStock.ps1                  # Iniciar todos los servicios
.\scripts\Stop-BioStock.ps1                   # Detener todos los servicios

# Desde services.msc o PowerShell nativo:
Get-Service BioStock-*                        # Ver estado
Restart-Service BioStock-API                  # Reiniciar API

# ════════════════════════════════════════════════════════════════
# BACKUPS Y RESTAURACIÓN
# ════════════════════════════════════════════════════════════════

.\scripts\Backup-BioStock.ps1                          # Backup manual
.\scripts\Backup-BioStock.ps1 -NetworkPath \\NAS\bio   # + copia a red
.\scripts\Restore-BioStock.ps1                         # Restaurar (interactivo)
.\scripts\Restore-BioStock.ps1 -BackupFile C:\...\backup.zip  # Restaurar específico

# ════════════════════════════════════════════════════════════════
# ACTUALIZACIONES
# ════════════════════════════════════════════════════════════════

git pull                                      # Obtener nuevo código
.\scripts\Update-BioStock.ps1                 # Actualizar sistema (con backup previo)
.\scripts\Update-BioStock.ps1 -AutoRollback   # Revertir automáticamente si falla

# ════════════════════════════════════════════════════════════════
# LOGS Y DIAGNÓSTICO
# ════════════════════════════════════════════════════════════════

Get-Content C:\BioStock\logs\api-stderr.log -Tail 50  # Últimos errores del API
Get-EventLog -LogName Application -Source 'BioStock-LIMS' -Newest 20  # Event Log
Get-Content C:\BioStock\backups\backup.log -Tail 20   # Historial de backups
Invoke-RestMethod http://localhost:3000/health         # Test directo del API

# ════════════════════════════════════════════════════════════════
# DESARROLLO LOCAL (mac/linux)
# ════════════════════════════════════════════════════════════════

npm run dev           # Vite frontend (puerto 1420)
node server.cjs       # Backend (puerto 3000)
npm run build         # Compilar frontend → ./dist/
```

---

## 20. GLOSARIO

| Término | Definición |
|---------|------------|
| GTIN | Global Trade Item Number — código de 14 dígitos que identifica un producto |
| GS1 | Estándar global para códigos de barras en salud y retail |
| Lote / Lot | Número de lote de fabricación del reactivo |
| Soft Delete | Marcar `fecha_baja` en vez de borrar físicamente — preserva historial |
| FIFO | First In First Out — consumir el reactivo más antiguo primero |
| Maestro de Productos | Catálogo de productos con metadata (nombre, sección, temperatura) |
| Stock Item | Una caja física individual en el inventario |
| HID | Human Interface Device — cómo los escáneres láser se identifican ante el OS |
| AuditLog | Registro inmutable de todas las acciones del sistema |
| RBAC | Role-Based Access Control — permisos por rol |
| NSSM | Non-Sucking Service Manager — herramienta para ejecutar cualquier proceso como servicio Windows |
| WAL | Write-Ahead Logging — modo de SQLite que permite lecturas concurrentes ilimitadas |
| Event Log | Windows Event Log — sistema centralizado de logs de Windows (eventvwr.msc) |
| Task Scheduler | Programador de tareas de Windows — ejecuta scripts automáticamente |
| VACUUM INTO | Comando SQLite para crear una copia consistente de la DB sin bloquearla |
| RemoteSigned | Política de ejecución de PowerShell — permite scripts locales y firmados de red |

---

*Este documento es el contrato técnico del proyecto. Debe actualizarse cuando cambien decisiones arquitectónicas, se resuelva deuda técnica significativa, o se incorporen nuevos patrones al sistema.*
