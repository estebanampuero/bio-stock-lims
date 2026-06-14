# Análisis Competitivo — BIO-STOCK LIMS
## Mercado de gestión de inventario de reactivos para laboratorios clínicos

> **Fecha:** 2026-06-14
> **Contexto:** Validación single-tenant con un laboratorio → roadmap SaaS multi-tenant (ver CLAUDE.md)
> **Foco geográfico:** Chile / LatAm, español
> **Alcance del producto:** control de stock de reactivos y controles, escaneo GS1, lote/vencimiento/FIFO, auditoría, on-premise

---

## 1. Resumen ejecutivo (TL;DR)

- **No hay un competidor idéntico**, pero el espacio LatAm **no está vacío**: SysLAB, Nubelab Clínico y Tenmalab ya venden software clínico en español con módulo de inventario. La diferencia es que **son LIS completos** (pacientes, órdenes, resultados, facturación) donde el inventario es un add-on, no el producto.
- **El hueco real** = un producto **standalone, barato, simple, barcode-first, con opción on-premise**, que un lab pueda adoptar **sin migrar todo su LIS**. Ahí no compite ni Quartzy (research, inglés, USD) ni QBench (enterprise, US$16.5k/año) ni los LIS LatAm (te obligan a casarte con la suite completa).
- **El mayor riesgo competitivo no son ellos**, sino el **módulo de inventario que el lab ya tiene incluido** en su LIS o en el middleware del analizador (Roche/Siemens/Abbott). Si "ya viene incluido", tu venta es cuesta arriba salvo que seas notablemente más simple/barato/mejor.
- **Brechas críticas para competir**: compliance ISO 15189 (trazabilidad lote-a-lote formal), reporting/exportación, alertas proactivas (stock mínimo + vencimiento), y un modelo SaaS multi-tenant con onboarding self-service.

---

## 2. Mapa de competidores (4 categorías)

### Tier A — LIMS/LIS enterprise (mucho más potentes, inalcanzables para lab chico)
| Producto | Origen | Notas |
|---|---|---|
| LabWare, STARLIMS (Abbott), Thermo SampleManager, LabVantage | Global | Suites completas. Inventario = módulo menor. Implementación de meses, precio de 5–6 cifras. |
| **QBench** | USA, cloud | Ancla de precio: **US$275/usuario/mes, mín. 5 usuarios = US$16.500/año**. Growth (con inventario) US$325/usuario/mes. + ~US$5.000 training. |

**Veredicto:** Overkill y carísimo para tu ICP. No compites; te diferencias por simplicidad/precio.

### Tier B — Inventario de laboratorio (parecidos, pero para investigación)
| Producto | Precio | Por qué NO es tu competidor directo |
|---|---|---|
| **Quartzy** | Gratis (académico) / US$69 mes (biotech, 3 usuarios) | Research + marketplace de compras. Inglés, cloud. No clínico. |
| **Labguru** | A pedido (alto) | ELN+LIMS+inventario all-in-one. Research. |
| **eLabInventory** (Eppendorf) | A pedido | Research, parte de eLabNext. |

**Veredicto:** Comparten features (barcode, lote, vencimiento) pero **otro mercado** (investigación, no clínico) y otro idioma.

### Tier C — Inventario clínico específico (competidores de propósito)
| Producto | Notas |
|---|---|
| **Lab Symplified** | El más parecido en *propósito*: exclusivo para labs clínicos (clínico, HLA, molecular, patología). Trazabilidad de lote, control de vencimiento, auditoría, costos por reactivo, proficiency tests. Precio a pedido. Inglés. |
| **QBench / QISS LAB** | Trazabilidad lote/vencimiento en tiempo real, impresión de barcodes. |

**Veredicto:** Lab Symplified es el referente a igualar en features clínicas. Tu ventaja: precio, español, on-prem, simplicidad.

### Tier D — Competidores LatAm / español (los MÁS relevantes para ti)
| Producto | Origen | Modelo | Nota clave |
|---|---|---|---|
| **SysLAB** (syslab.cl) | 🇨🇱 Chile | LIS clínico + inventario de reactivos | Competidor local directo, ya en tu mercado. |
| **Nubelab Clínico** | LatAm | LIS cloud integrado (pacientes, órdenes, resultados, facturación **e inventario** con consumo en tiempo real) | Inventario es un módulo de la suite. |
| **Tenmalab** | 🇨🇱 Chile | Inventario + control de insumos, stock y vencimientos | Cercano en alcance. |
| **Zendo LIMS** | España/LatAm | LIMS con módulo de inventario, alertas de stock | Español. |

**Veredicto:** Aquí está tu competencia real. **Todos son suites/LIS** — el inventario viene atado a comprar todo el sistema. Tu wedge: **producto standalone que no obliga a migrar el LIS**.

---

## 3. Tabla comparativa (vs. tu producto)

| Criterio | Enterprise (QBench/LIMS) | Research (Quartzy) | Clínico (Lab Symplified) | LatAm LIS (SysLAB/Nubelab) | **bio-stock-lims** |
|---|---|---|---|---|---|
| Foco reactivos clínicos | ◐ módulo | ✗ research | ✓ | ◐ módulo | ✓ dedicado |
| **On-premise / LAN sin cloud** | ✗ | ✗ | ✗ | ✗ (cloud) | ✓ **único** |
| Español nativo | ✗ | ✗ | ✗ | ✓ | ✓ |
| Standalone (sin migrar LIS) | ✗ | ✓ | ◐ | ✗ | ✓ |
| Escaneo GS1 a la medida | ◐ genérico | ◐ | ◐ | ◐ | ✓ multi-formato config |
| Precio entrada | US$16.5k/año | gratis–US$69/mes | a pedido | a pedido | ~$0 / bajo |
| Compliance ISO 15189 formal | ✓ | ✗ | ✓ | ◐ | ✗ **brecha** |
| Compras/pedidos a proveedor | ✓ | ✓ | ✓ | ◐ | ✗ |
| Multi-sede / multi-tenant | ✓ | ✓ | ✓ | ✓ | ✗ (en roadmap) |
| Reporting / costos por reactivo | ✓ | ◐ | ✓ | ✓ | ✗ **brecha** |

`✓ sí · ◐ parcial · ✗ no`

---

## 4. Posicionamiento recomendado

**Wedge (cuña de entrada):**
> "El control de reactivos y controles de tu laboratorio, con pistola de código de barras, **sin tener que cambiar tu sistema actual** — funciona en tu red local, en español, a una fracción del costo de un LIMS."

**ICP (cliente ideal):**
- Laboratorios clínicos **pequeños y medianos** en Chile/LatAm.
- Que hoy llevan el inventario en **Excel o en papel**.
- Que **no van a pagar US$16k/año** ni a migrar a un LIS completo solo por inventario.
- Que valoran **on-premise** (datos en casa, sin depender de internet) o cloud simple.

**Diferenciadores defendibles (en orden):**
1. **Standalone + no invasivo** — conviven con su LIS actual. (Nadie en Tier D ofrece esto; todos quieren venderte la suite.)
2. **On-premise real** — requisito duro que ninguno cloud cumple.
3. **Precio y simplicidad** — onboarding en minutos, no en meses.
4. **Escaneo GS1 a la medida** — formatos configurables (ya lo tienes, tabla `scan_formats`).
5. **Español LatAm** — paridad con SysLAB/Nubelab, ventaja sobre el resto.

---

## 5. Brechas a cerrar para competir (priorizadas)

### P0 — Bloqueantes para vender a un lab clínico serio
- [ ] **Trazabilidad ISO 15189 lote-a-lote**: registro formal de cambio de lote, asociación lote↔control de calidad, exportable para acreditación. (Hoy tienes audit log + lote; falta el reporte de acreditación.)
- [ ] **Alertas proactivas**: stock mínimo por producto + vencimiento (<30/90 días) con notificación visible (y email opcional). Ya está en el roadmap del CLAUDE.md.
- [ ] **Reportes / exportación**: CSV/PDF de inventario, consumos, vencidos, costos por reactivo. Es lo primero que pide un jefe de lab.

### P1 — Para el salto a SaaS multi-tenant
- [ ] **Multi-tenancy** (org_id, scoping, rol SUPER_ADMIN, PostgreSQL) — ya planificado.
- [ ] **Onboarding self-service** + import inicial (ya tienes bulk import Excel).
- [ ] **Branding por tenant** y gestión de planes/facturación.

### P2 — Diferenciadores de crecimiento
- [ ] Compras/pedidos a proveedor (PO simple, reorder points).
- [ ] Costos y analítica de consumo (US$ por sección/mes).
- [ ] App móvil / PWA para escaneo sin pistola (cámara del teléfono).

---

## 6. Estrategia de precios SaaS (LatAm)

El mercado tiene dos extremos: **gratis/research** (Quartzy) y **enterprise** (QBench US$16.5k/año). Tu espacio es el medio-bajo, anclando MUY por debajo de un LIMS:

| Plan | Precio sugerido (referencial) | Para quién |
|---|---|---|
| **On-premise / Self-hosted** | Licencia única + soporte anual | Labs que exigen datos en casa |
| **Cloud Starter** | ~US$29–49 / mes por laboratorio (no por usuario) | Lab chico, 1 sede |
| **Cloud Pro** | ~US$79–129 / mes | Multi-usuario, alertas, reportes, compliance |
| **Multi-sede / Enterprise** | A pedido | Cadenas de labs |

**Clave de pricing:** cobrar **por laboratorio/sede, no por usuario** — es tu mayor arma contra QBench (que cobra US$275/usuario × 5 mínimo). Un lab con 8 personas paga lo mismo que con 2.

---

## 7. Riesgos competitivos

1. **"Ya viene incluido"** — el LIS o el middleware del analizador del lab ya trae inventario. Mitigación: ser tan simple que valga la pena igual; atacar labs sin LIS o con LIS sin inventario usable.
2. **SysLAB/Nubelab bajan a tu nicho** — un jugador local podría ofrecer su módulo de inventario suelto. Mitigación: velocidad, on-prem, y mejor UX de escaneo.
3. **Compliance como barrera de entrada** — sin trazabilidad ISO 15189 formal, un lab acreditado no te compra. Mitigación: P0 de la sección 5.
4. **Confianza/soporte** — un software "casero" asusta a un lab. Mitigación: docs, SLA, casos de éxito, respaldos demostrables (ya tienes backups).

---

## 8. Conclusión

Hay software **más potente** (LIMS enterprise, Lab Symplified) y software **en tu idioma/mercado** (SysLAB, Nubelab, Tenmalab), pero **ninguno ocupa exactamente tu posición**: standalone + on-premise + barato + barcode-first + español, sin obligar a migrar el LIS.

Esa posición es **defendible y real**, pero solo si cierras las brechas P0 (compliance ISO 15189, alertas, reportes). Sin eso, eres un buen Excel con pistola; con eso, eres una alternativa creíble a un módulo de LIMS a 1/10 del precio.

**Próximo paso recomendado:** priorizar reportes + alertas (impacto inmediato en venta) y mapear el checklist ISO 15189 de inventario contra lo que ya hace el sistema.

---

## Fuentes

- [Best Lab Inventory Management Software 2026 — Research.com](https://research.com/software/best-lab-inventory-management-software)
- [Lab Symplified Review 2026 — Research.com](https://research.com/software/reviews/lab-symplified-review)
- [Lab Symplified — clinical labs](https://labsymplified.com/laboratory-inventory-management-software-for-clinical-labs/)
- [QBench — How much does a LIMS cost (2026)](https://qbench.com/blog/how-much-does-a-lims-cost)
- [QBench pricing explained — Scispot](https://www.scispot.com/blog/qbench-pricing-explained-is-it-worth-it)
- [Quartzy alternatives & pricing — ProcureDesk](https://www.procuredesk.com/quartzy-alternatives/)
- [Quartzy vs Labguru — SoftwareSuggest](https://www.softwaresuggest.com/compare/quartzy-vs-labguru)
- [SysLAB — software laboratorios Chile](https://www.syslab.cl/)
- [Nubelab Clínico](https://nubelabclinico.com/)
- [Cómo elegir software para laboratorios clínicos en Chile — Tenmalab](https://tenmalab.com/como-elegir-el-mejor-software-para-laboratorios-clinicos-en-chile/)
- [Zendo LIMS — inventario laboratorio](https://www.zendolims.com/es/laboratorio-inventario.html)
- [ISO 15189:2012 Requirements — Westgard QC](https://westgard.com/lessons/iso-l/iso-15189-2012-requirements-1.html)
