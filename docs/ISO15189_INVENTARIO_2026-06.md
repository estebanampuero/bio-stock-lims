# Mapeo ISO 15189:2022 §6.6 — Reactivos y Fungibles
## Qué exige la norma vs. qué hace BIO-STOCK LIMS

> **Fecha:** 2026-06-14
> **Alcance:** Cláusula 6.6 (Reactivos y consumibles) de ISO 15189:2022, parte de inventario/trazabilidad.
> **Objetivo:** identificar qué cumple el sistema hoy y qué falta para que un laboratorio acreditado lo use como registro de inventario.
> ⚠️ Este documento es una guía de implementación, **no** una certificación. La acreditación la otorga el organismo (en Chile, vía ISP / INN).

---

## Resumen de cumplimiento

| § | Requisito | Estado | Prioridad de la brecha |
|---|---|---|---|
| 6.6.2 | Recepción y almacenamiento | 🟡 Parcial | Media |
| 6.6.3 | Pruebas de aceptación (lote nuevo) | 🔴 Falta | **Alta** |
| 6.6.4 | Gestión de inventario | 🟢 Cubierto (con esta entrega) | Baja |
| 6.6.5 | Instrucciones de uso | 🟡 Parcial | Baja |
| 6.6.6 | Reporte de incidentes adversos / recall | 🔴 Falta | Media |
| 6.6.7 | Registros | 🟡 Parcial | **Alta** |

🟢 cubierto · 🟡 parcial · 🔴 falta

---

## Detalle por cláusula

### 6.6.2 — Recepción y almacenamiento
**Exige:** registrar condiciones de almacenamiento (según fabricante) y que se respeten al recibir.
**Hoy:** cada producto define `temperatura` / `almacenamiento_sin_abrir` (Refrigerado/Congelado/Ambiente) + notas de preparación. El escaneo registra fecha (`scanDate`) y usuario.
**Brecha:** no hay registro de **inspección de recepción** (¿llegó en cadena de frío?, ¿íntegro?) ni fecha de recepción separada del escaneo.
**Acción sugerida:** campo "fecha de recepción" + checkbox "recepción conforme" al ingresar stock.

### 6.6.3 — Pruebas de aceptación  🔴 brecha ALTA
**Exige:** cada **lote o envío nuevo** debe verificarse (desempeño/QC) **antes** de usarse en pacientes.
**Hoy:** no existe. Un lote ingresado queda disponible de inmediato.
**Acción sugerida:** estado de lote `PENDIENTE_ACEPTACION → ACEPTADO/RECHAZADO`, con usuario y fecha de aceptación. Bloquear (o marcar) salidas de lotes no aceptados. *(El schema target en CLAUDE.md ya contempla `status` en stock_items.)*

### 6.6.4 — Gestión de inventario  🟢 cubierto
**Exige:** sistema que controle reactivos/consumibles y **segregue** lo aceptado de lo no inspeccionado / vencido / inutilizable.
**Hoy:**
- Stock por lote + vencimiento, soft-delete (`fecha_baja`), consumo FIFO. ✓
- **Alertas de vencimiento** (≤90d aviso / ≤30d crítico / vencidos) — `GET /inventario/alertas`. ✓ *(nuevo)*
- **Stock mínimo por producto** con alerta de stock bajo (`min_stock`). ✓ *(nuevo)*
- Módulo de **salida** con alarma FIFO si hay lote anterior sin descontar. ✓
**Brecha menor:** la segregación de vencidos es **visual** (alerta), no un bloqueo físico de uso. Aceptable si el procedimiento del lab retira el vencido al verlo.

### 6.6.5 — Instrucciones de uso
**Exige:** instrucciones del fabricante disponibles para el personal.
**Hoy:** campo `preparacion` (notas estructuradas: descongelar, reconstituir, alícuotas, etc.) + módulo de **Protocolos**.
**Brecha:** no se adjunta el inserto/IFU del fabricante (PDF). Las notas son manuales.
**Acción sugerida:** adjuntar archivo (inserto) por producto.

### 6.6.6 — Reporte de incidentes adversos / recall
**Exige:** registrar y reportar incidentes atribuibles a un reactivo/lote (y gestionar **recalls**).
**Hoy:** no hay flujo de recall ni de incidente.
**Acción sugerida:** acción "Retirar lote por recall" (estado `RECALLED`) que dé de baja todo el lote y lo deje trazado en auditoría.

### 6.6.7 — Registros  🟡 brecha ALTA
**Exige:** registros de cada reactivo/consumible: nombre, fabricante, **lote**, fecha de recepción, **fecha de vencimiento**, fecha de puesta en servicio, estado, y registros de aceptación.
**Hoy:**
- Lote ✓, vencimiento ✓, fecha de escaneo (≈puesta en servicio) ✓, usuario ✓, **log de auditoría append-only** ✓.
- **Exportación CSV** (inventario / vencimientos / movimientos) para evidencia de acreditación. ✓ *(nuevo)*
**Brecha:** faltan **fabricante**, **fecha de recepción** distinta del escaneo, y **registro de aceptación** (ligado a 6.6.3).
**Acción sugerida:** agregar `fabricante` y `fecha_recepcion` al maestro/stock; incluirlos en el CSV.

---

## Lo que esta entrega aportó al cumplimiento

- `GET /inventario/alertas`: vencidos, por vencer (aviso/crítico) y stock bajo → **soporte directo a 6.6.4**.
- `min_stock` por producto (migración v17) → **6.6.4** (evitar quiebres) + base para reorder.
- `GET /export/csv?tipo=inventario|vencimientos|movimientos` (CSV con BOM, es-CL) → **evidencia documental 6.6.7**.
- Badge de alertas + vista "Alertas y Reportes" en la UI.

## Pendientes priorizados para "acreditación-ready"

1. **(6.6.3 + 6.6.7) Aceptación de lote** — estado PENDIENTE→ACEPTADO/RECHAZADO con usuario/fecha. *La más importante.*
2. **(6.6.7) Campos faltantes** — fabricante + fecha de recepción.
3. **(6.6.6) Recall de lote** — baja total trazada.
4. **(6.6.2) Inspección de recepción** — conforme/no conforme.
5. **(6.6.5) Adjuntar inserto (IFU)** por producto.

---

## Fuentes
- [ISO 15189:2022 Technical Requirements — SANAS (PDF)](https://www.sanas.co.za/Publications%20and%20Manuals%20Files/F%20243-02.pdf)
- [ISO 15189:2022 Checklist — GoAudits](https://goaudits.com/checklist/iso-15189-2022-checklist/920/35/)
- [ISO 15189 requisitos — SimplerQMS](https://simplerqms.com/iso-15189/)
- [ISO 15189:2012 Requirements — Westgard QC](https://westgard.com/lessons/iso-l/iso-15189-2012-requirements-1.html)
