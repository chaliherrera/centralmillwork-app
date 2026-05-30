# Diseño: Evolución de orden + Materiales del item

Plan de implementación para 2 features solicitadas durante testing final 2026-05-25, con decisiones ya tomadas por Chali.

**Branch sugerido**: `claude/produccion-evolucion-materiales` (nuevo, partiendo de main una vez mergeado `claude/jovial-ride-64bfff`).

---

## Feature A — Evolución de cada orden (timeline + stepper)

### Decisiones tomadas
1. **Detalle**: quién trabajó + pausas. SIN dispositivo.
2. **Tiempo estimado**: comparar contra estimado SI el SHOP_MANAGER lo cargó. Si no → solo mostrar tiempos reales por estación.
3. **Visibilidad**: solo SHOP_MANAGER.

### Arquitectura: Stepper + Timeline combo

**Sección nueva en `DetalleOrden.tsx`** (solo visible si `user.rol === 'SHOP_MANAGER'` o `'ADMIN'`):

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Evolución                                                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ✓ CNC       ✓ EDGE BAND   ◐ ASSEMBLY    ○ PINTURA    ○ FINAL          │
│  1h 23m      45m           2h 10m / 3h   pendiente    pendiente         │
│  ✓ on time   ✓ on time     ⚠ +12% over   est 2h       est 1h            │
│  VH          VH            JU (en curso) —            —                  │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ Resumen                                                                  │
│  Total transcurrido: 1 día 4h 18m  ·  Tiempo trabajado real: 4h 18m     │
│  Estimado total: 7h  ·  Progreso: 60%  ·  ETA: hoy 18:30                │
├─────────────────────────────────────────────────────────────────────────┤
│ Línea de tiempo                                            [Expandir ▼] │
│                                                                          │
│  ● Vie 24 may, 09:15  Creada por Chali · prioridad Alta · est 7h        │
│  │                                                                       │
│  ● Vie 24 may, 09:18  Asignada a Victor en CNC                          │
│  │                                                                       │
│  ● Vie 24 may, 10:42  Victor inició CNC                                 │
│  │ ⏱ 1h 23m                                                              │
│  ● Vie 24 may, 12:05  Victor pausó (Comida) durante 32m                 │
│  │                                                                       │
│  ● Vie 24 may, 12:37  Victor completó CNC → avanza a Edge Banding       │
│  │                                                                       │
│  ● Vie 24 may, 13:00  Victor inició Edge Banding                        │
│  │ ⏱ 45m                                                                 │
│  ...                                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Componentes nuevos

**`<OrdenEvolucionStepper>`** — Stepper horizontal con cards por estación
- Estado de cada estación: `pendiente | en_curso | completado | omitido`
- Por cada estación muestra:
  - Nombre + ícono
  - Tiempo real (de `orden_procesos.tiempo_real_minutos` o calc desde segmentos abiertos)
  - Si hay estimado: comparación visual (`✓ on time` | `⚠ +12% over` | `🔴 +N hours over`)
  - Iniciales del operario que la trabajó (puede haber sido reasignada — mostrar el actual)
  - Hover/click → resalta los eventos relacionados en el timeline

**`<OrdenEvolucionResumen>`** — KPIs entre stepper y timeline
- **Total transcurrido**: from `fecha_inicio` to `fecha_completada || NOW()`
- **Tiempo trabajado real**: sum de `orden_procesos.tiempo_real_minutos`
- **Estimado total**: from `ordenes_produccion.tiempo_estimado_horas` (puede ser null)
- **Progreso %**: `procesos_completados / procesos_total * 100`
- **ETA**: simple — `tiempo_estimado_restante / 8h_por_dia`, solo si hay estimado

**`<OrdenTimeline>`** — Lista vertical de eventos
- Default: muestra últimos 10 eventos (colapsable)
- "Expandir todo" muestra desde la creación
- Eventos:
  - **Creada** (de `created_at`)
  - **Asignada** / **Reasignada** (de `orden_historial.accion='asignar'`)
  - **Iniciado item** (de `orden_historial.accion='iniciar-item'`)
  - **Pausa** (de `time_pausas` con motivo, con duración cuando se cierra)
  - **Movida a estación X** (de `orden_historial.accion='mover'`)
  - **Completada** (de `orden_historial.accion='completar'`)
- Cada evento: timestamp legible, ícono, color, descripción humana
- Click en evento de estación → scroll/highlight del step en el stepper

### Backend

Endpoint nuevo (o extiende `getOrden`):
```
GET /api/produccion/ordenes/:id/evolucion
Auth: SHOP_MANAGER | ADMIN
Returns:
{
  orden: { fecha_inicio, fecha_completada, tiempo_estimado_horas, status, ... },
  procesos: [
    {
      estacion, secuencia, estado: 'pendiente' | 'en_curso' | 'completado',
      tiempo_real_minutos, tiempo_estimado_minutos (si se distribuye),
      operador_actual: { iniciales, nombre },
      fecha_inicio, fecha_fin,
      segmentos: [{hora_inicio, hora_fin, personal_iniciales, duracion_min}]
    }
  ],
  eventos: [
    {
      tipo: 'creada' | 'asignada' | 'iniciado_item' | 'pausa' | 'movida' | 'completada',
      timestamp,
      actor: { iniciales, nombre } | null,
      detalle: { estacion_origen?, estacion_destino?, motivo?, duracion_min? }
    }
  ]
}
```

**Sobre cómo se distribuye `tiempo_estimado_horas`** entre estaciones:
- Opción 1 (simple): dividir igual entre todas las estaciones requeridas
- Opción 2 (mejor): el SHOP_MANAGER puede setear estimado por estación en `orden_procesos.tiempo_estimado_minutos` (nueva col)
- Opción 3: dividir según tiempos promedio históricos de cada estación

**Recomiendo Opción 2** con migración mínima: agregar `tiempo_estimado_minutos` a `orden_procesos`. Por default queda null y se computa Opción 1 como fallback.

### Migración 020 (mínima)
```sql
ALTER TABLE orden_procesos
  ADD COLUMN IF NOT EXISTS tiempo_estimado_minutos INTEGER;
```

### Estimación
- Backend (1 endpoint + query rica): 1h
- Migración 020: 5 min
- Componente Stepper: 1.5h
- Componente Timeline: 1h
- Componente Resumen + cálculos: 30 min
- Integración en DetalleOrden + permisos: 30 min
- Testing: 30 min
- **Total: 5 horas (~1 día)**

---

## Feature B — Materiales del item con vinculación a Compras + BOM matching

### Decisiones tomadas
1. **Camino B**: vincular materiales específicos a cada orden de producción.
2. **Comparar BOM vs MTO**: subir documento (Excel/CSV) con la lista de materiales del item, sistema lo compara contra el MTO del proyecto y evidencia diferencias.
3. **Excluir consumibles**: tornillos, clavos, etc. no cuentan.
4. **Visibilidad**: SHOP_MANAGER, PROCUREMENT, CONTABILIDAD.

### Modelo de datos — Migración 021

```sql
-- 1) Vinculación material → orden de producción
CREATE TABLE ordenes_produccion_materiales (
  id              SERIAL PRIMARY KEY,
  orden_id        INTEGER NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
  material_id     INTEGER REFERENCES materiales_mto(id) ON DELETE SET NULL,
  -- Si el material vino del BOM pero no matcheó con ningún MTO, guardamos
  -- la info del BOM para mostrar "faltante" sin romper la FK
  bom_codigo      TEXT,
  bom_descripcion TEXT,
  cantidad        DECIMAL(10,3) NOT NULL DEFAULT 1,
  unidad          TEXT,
  notas           TEXT,
  fuente          TEXT NOT NULL DEFAULT 'manual'
                  CHECK (fuente IN ('manual','bom_import')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_material_o_bom CHECK (
    material_id IS NOT NULL OR (bom_codigo IS NOT NULL AND bom_descripcion IS NOT NULL)
  )
);
CREATE INDEX idx_opm_orden ON ordenes_produccion_materiales(orden_id);
CREATE INDEX idx_opm_material ON ordenes_produccion_materiales(material_id);

-- 2) Marcar consumibles para excluirlos del matching
-- Convención: NC% (No Cotizar) ya es "stock interno" y algunos son consumibles.
-- Agregamos flag explícito para precisión.
ALTER TABLE materiales_mto
  ADD COLUMN IF NOT EXISTS es_consumible BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill conservador: marcar como consumibles los que claramente lo son por
-- descripción. El SHOP_MANAGER puede ajustar después.
UPDATE materiales_mto SET es_consumible = TRUE
WHERE LOWER(descripcion) ~ '\m(tornillo|clavo|tornilleria|tornillería|grapa|broca|sandpaper|lija|silicona|pegamento|adhesivo|cola\s+vinilica)\M'
   OR LOWER(categoria)   ~ '\m(consumible|herramienta|insumo)\M';

-- 3) BOM imports (auditoría de qué se importó y cuándo)
CREATE TABLE bom_imports (
  id               SERIAL PRIMARY KEY,
  orden_id         INTEGER NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
  filename         TEXT NOT NULL,
  total_filas      INTEGER NOT NULL,
  matcheadas       INTEGER NOT NULL,
  faltantes        INTEGER NOT NULL,
  consumibles      INTEGER NOT NULL,
  uploaded_by      UUID REFERENCES usuarios(id),
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data         JSONB
);
```

### Flujo de uso

**1) Carga manual** (opción simple, sin BOM):
- En DetalleOrden, sección "Materiales del item" → botón "+ Agregar material"
- Modal con autocomplete sobre `materiales_mto` del proyecto (excluyendo consumibles)
- Setear cantidad
- Se guarda en `ordenes_produccion_materiales`

**2) Import desde BOM** (opción potente):
- Botón "Importar desde Excel/CSV" en sección Materiales
- Wizard de 3 pasos:

  **Paso A — Subir archivo**: drag-and-drop de .xlsx o .csv. Detecta cabeceras.

  **Paso B — Mapeo de columnas**:
  ```
  Columna del Excel       →  Campo del sistema
  ─────────────────────      ─────────────────────
  "Código"                →  Código  [▼]
  "Descripción"           →  Descripción  [▼]
  "Cant"                  →  Cantidad  [▼]
  "U/M"                   →  Unidad  [▼]
  ```
  Se autodetecta cuando los headers son obvios.

  **Paso C — Revisar diferencias** (pantalla clave):
  ```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Revisión de matching                                                 │
  ├──────────────────────────────────────────────────────────────────────┤
  │ ✓ 12 materiales identificados en el MTO del proyecto                │
  │ ⚠  3 materiales del BOM NO encontrados en MTO (faltantes a comprar) │
  │ ◯  5 consumibles del BOM ignorados (tornillos, clavos)              │
  │ ⚠  8 materiales del MTO del proyecto NO están en el BOM (¿sobran?)  │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Detalle:                                                             │
  │                                                                       │
  │ ✓ MATCHES (12)                                          [Expandir ▼] │
  │                                                                       │
  │ ⚠ EN BOM PERO NO EN MTO (3)                                         │
  │ ┌────────────────────────────────────────────────────────────────┐  │
  │ │ Código    Descripción              Qty  Acción                │  │
  │ │ NG-2034   Nogal sólido 1"x4"x8'    3    [Crear MTO] [Skip]    │  │
  │ │ HX-101    Bisagra cierre lento     2    [Crear MTO] [Skip]    │  │
  │ │ —         Lámina HPL color X       1    [Crear MTO] [Skip]    │  │
  │ └────────────────────────────────────────────────────────────────┘  │
  │                                                                       │
  │ ⚠ EN MTO PERO NO EN BOM (8)                            [Expandir ▼] │
  │ │ Probablemente son de otros items del proyecto.                  │  │
  │ │ Solo marcar los que SÍ van a este item:                         │  │
  │ │ ☐ NG-2034  Nogal sólido 1"x4"x10' (12 unid)                    │  │
  │ │ ☐ ...                                                            │  │
  │                                                                       │
  │ [Cancelar]                                       [Confirmar import] │
  └──────────────────────────────────────────────────────────────────────┘
  ```

  - Materiales matcheados → se vinculan automáticamente
  - Faltantes en MTO → opción de crear MTO en el momento o ignorar
  - Consumibles → ignorados silenciosamente (se reportan en el resumen)
  - Sobrantes (en MTO no usados en BOM) → checkbox por si alguno SÍ va a este item

**3) Vista de estado de materiales en DetalleOrden**:

Una vez vinculados los materiales, la sección muestra:

```
┌─────────────────────────────────────────────────────────────────┐
│ Materiales del item                              [+ Agregar]     │
│ 8/12 en taller (67%) · 2 ordenados · 2 pendientes               │
│                                                                  │
│ Estimado para arrancar: 2026-05-27 cuando lleguen ordenados     │
├─────────────────────────────────────────────────────────────────┤
│  🟢 EN TALLER (8)                              [Expandir ▼]     │
│  ────────────────────────────────────────────                    │
│  Nogal sólido 1"x4"x8'         3 unid  ✓ recibido 22/05         │
│  Lámina HPL blanco mate        2 unid  ✓ recibido 20/05         │
│  ...                                                             │
│                                                                  │
│  🟡 ORDENADO (2)                                                 │
│  ────────────────────────────────────────────                    │
│  Bisagra cierre lento Blum     6 unid  OC-2026-145 · ETA 27/05  │
│  Tirador acero brushed         3 unid  OC-2026-148 · ETA 28/05  │
│                                                                  │
│  🟠 EN COTIZACIÓN (1)                                            │
│  ────────────────────────────────────────────                    │
│  Cristal templado 6mm a med.   1 unid  cotización pendiente     │
│                                                                  │
│  🔴 PENDIENTE DE COMPRA (1)                                      │
│  ────────────────────────────────────────────                    │
│  Cerradura empotrada Yale      1 unid  ⚠ no en MTO              │
│                                                                  │
│  Última actualización del BOM: 25/05 por Chali (BOM-v2.xlsx)    │
└─────────────────────────────────────────────────────────────────┘
```

### Backend

Endpoints nuevos (auth: SHOP_MANAGER | PROCUREMENT | CONTABILIDAD | ADMIN):

```
GET    /api/produccion/ordenes/:id/materiales
       Lista de materiales vinculados con estado actual (EN_TALLER, ORDENADO, etc.)

POST   /api/produccion/ordenes/:id/materiales
       Body: { material_id, cantidad, notas? }
       Vincula manualmente

DELETE /api/produccion/ordenes/:id/materiales/:vinculoId
       Quita vínculo (no borra el material)

POST   /api/produccion/ordenes/:id/materiales/import-bom
       Body multipart: { archivo (xlsx/csv), mapeo (JSON con mapping de columnas) }
       Devuelve PREVIEW de matching, NO persiste todavía.

POST   /api/produccion/ordenes/:id/materiales/confirmar-import
       Body: { import_preview_id, items_a_crear[], items_a_vincular[], items_a_omitir[] }
       Persiste los cambios del wizard.
```

**Lógica de matching**:
1. Por `codigo` exacto contra `materiales_mto` del proyecto → match directo
2. Si no, por similitud de descripción (Postgres `pg_trgm` + threshold 0.4) → match probable, muestra para confirmar
3. Si tiene `es_consumible=TRUE` → ignorar (cuenta en "consumibles")

**Lógica de "estado del material"** (derivada en query):
- `EN_TALLER`: existe recepción confirmada de OC que tiene este material
- `ORDENADO`: existe OC en estado `enviada/confirmada/parcial` con este material
- `EN_COTIZACION`: `estado_cotiz IN ('PENDIENTE','EN_COTIZACION')` (módulo Compras)
- `PENDIENTE`: no hay OC ni cotización
- `EN_STOCK`: `cotizar='EN_STOCK'` (stock propio Central Millwork)

### Parser de BOM

Usar la lib `xlsx` que ya está en backend para Excel. Para CSV, parser nativo Node.

**Heurística de detección de columnas**:
```typescript
const COLUMN_PATTERNS = {
  codigo:      /^(c[oó]digo|cod|code|sku|ref)$/i,
  descripcion: /^(descripci[oó]n|description|nombre|item|producto)$/i,
  cantidad:    /^(cant|qty|cantidad|quantity|qt|n[uú]mero)$/i,
  unidad:      /^(u\/m|unidad|um|unit)$/i,
}
```

Si auto-detecta todas las columnas, salta el paso de mapeo manual.

### Frontend — Visualización para roles permitidos

**En `DetalleOrden.tsx`** — bloque visible solo si:
```typescript
const PUEDE_VER_MATERIALES = ['SHOP_MANAGER','PROCUREMENT','CONTABILIDAD','ADMIN']
const showMateriales = PUEDE_VER_MATERIALES.includes(user.rol)
```

Para PROCUREMENT específicamente: link directo "Ver en Compras" que abre el material en su contexto de cotización.

### Estimación
- Migración 021 (3 cambios): 30 min
- Backend matching + endpoints: 3-4h
- Componente vista de materiales: 1.5h
- Wizard de import BOM (3 pasos): 3h
- Heurísticas + lib xlsx parser: 1h
- Visualización en DetalleOrden + permisos: 1h
- Testing E2E con archivo real: 1h
- **Total: 11-12 horas (~1.5 días)**

---

## Plan de implementación sugerido

| Orden | Feature | Estimación | Por qué este orden |
|-------|---------|------------|---------------------|
| 1 | Evolución de orden | ~1 día | Más simple, sin migraciones de modelo nuevo |
| 2 | Materiales — Camino B sin BOM | ~1 día | Vincular manualmente (subset de feature B) |
| 3 | Materiales — BOM import wizard | ~0.5 día | Agrega el BOM matching sobre la base ya hecha |

Total: **~2.5 días** repartidos en 3 commits incrementales.

**Branch sugerido**: `claude/produccion-evolucion-materiales` (nuevo, partiendo de main post-merge de `claude/jovial-ride-64bfff`).

---

## Pre-requisitos antes de implementar

1. ✅ Merge de `claude/jovial-ride-64bfff` a main (pendiente para hoy)
2. ✅ Aplicar migración 019 a Railway si no estaba
3. ⚠ Necesito un BOM de ejemplo (.xlsx o .csv) para diseñar la heurística de columnas con datos reales — si me pasás 1-2 ejemplos, ajusto el parser a su formato exacto

---

## Preguntas pendientes (responder antes de implementar Feature B)

1. **¿Quién puede subir BOMs?** Solo SHOP_MANAGER + ADMIN, o también PROCUREMENT (parece coherente con "Compras vincula los materiales")?
2. **¿Un BOM por orden o un BOM por proyecto que se reusa?** Mi propuesta es por orden (cada item de fabricación tiene su BOM). Confirmar.
3. **Si un BOM se reimporta**, ¿sobrescribe los vínculos previos o los suma?
4. **¿El campo `es_consumible` es editable desde Materiales MTO?** (probablemente sí, para que el SHOP_MANAGER pueda marcar lo que se le escape al backfill).

---

*Documento generado 2026-05-25. Pendiente aprobación de Chali + ejemplo de BOM para refinar parser.*
