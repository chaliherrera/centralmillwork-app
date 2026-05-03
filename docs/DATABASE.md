# Base de datos — Central Millwork

PostgreSQL. Schema documentado contra el estado real de producción al 2026-05-03.

---

## Conexión

| Entorno | Cómo se conecta |
|---|---|
| Local | Variables `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (defaults: localhost:5432, db `centralmillwork`, user/pass `postgres`) |
| Producción (Railway) | `DATABASE_URL` (interna, `*.railway.internal`) o `DATABASE_PUBLIC_URL` (proxy externo, para conexiones desde fuera de Railway) |

El pool en [`backend/src/db/pool.ts`](../backend/src/db/pool.ts) prioriza `DATABASE_PUBLIC_URL` → `DATABASE_URL` → vars individuales. SSL con `rejectUnauthorized: false` cuando se conecta vía URL (necesario para Railway).

Las migraciones del rate-limiter (`@acpr/rate-limit-postgresql`) usan la misma conexión configurada en [`backend/src/middleware/rateLimit.ts`](../backend/src/middleware/rateLimit.ts).

---

## Sistema de migraciones

Las migraciones SQL viven en `database/migrations/` y se aplican manualmente con `psql` o `node` (no hay framework de migrations automático). Hay un script en [`backend/src/db/migrate.ts`](../backend/src/db/migrate.ts) que las corre en orden.

Estado al 2026-05-03 — 14 migraciones aplicadas:

```
001_initial_schema.sql            — schema base (8 tablas + 4 enums)
002_add_notas_to_materiales.sql   — materiales_mto.notas
003_add_fecha_importacion.sql     — materiales_mto.fecha_importacion
004_add_manufacturer_cotizar.sql  — materiales_mto.manufacturer + cotizar
005_add_oc_fields.sql             — ordenes_compra.fecha_mto + categoria
006_oc_imagenes.sql               — tabla oc_imagenes (CASCADE de OCs)
007_mto_freight.sql               — tabla mto_freight (CASCADE de proyectos)
008_cotizar_en_stock.sql          — default de cotizar a 'SI'
009_backfill_cotizar_estado.sql   — backfill estado_cotiz según unit_price
010_recepcion_materiales.sql      — tabla recepcion_materiales (CASCADE de recepciones)
010_usuarios.sql                  — tabla usuarios + enum user_rol
011_envio_cotizaciones.sql        — solicitudes_cotizacion: vendor + materiales_incluidos + email_destinatario + fecha_envio
012_oc_en_transito.sql            — agrega 'en_transito' al enum estado_orden
013_usuarios.sql                  — modificaciones a usuarios
```

Hay también una tabla interna `migrations` que el script de migraciones usa para tracking: `id`, `name` (UNIQUE), `hash`, `executed_at`.

---

## ENUMs

| Enum | Valores |
|---|---|
| `estado_proyecto` | `cotizacion`, `activo`, `en_pausa`, `completado`, `cancelado` |
| `estado_orden` | `borrador`, `enviada`, `confirmada`, `parcial`, `recibida`, `cancelada`, `en_transito` |
| `estado_recepcion` | `pendiente`, `completa`, `con_diferencias` |
| `estado_cotizacion` | `pendiente`, `enviada`, `recibida`, `aprobada`, `rechazada` |
| `user_rol` | `ADMIN`, `PROCUREMENT`, `PRODUCTION`, `PROJECT_MANAGEMENT`, `RECEPTION`, `CONTABILIDAD` |

> **Nota**: el enum `user_rol` incluye `RECEPTION` por compatibilidad histórica, pero la app actual no la usa — `RECEPTION` fue renombrada a `CONTABILIDAD` (ver commit `a6178f7`). Los usuarios con rol `RECEPTION` siguen funcionando porque el valor existe en el enum, pero el frontend muestra y permite asignar `CONTABILIDAD`.

---

## Tablas

Las tablas están agrupadas por dominio funcional para facilitar la lectura. Cada tabla incluye sus columnas, defaults, constraints y relaciones.

### Identity & Access

#### `usuarios`

Cuentas para autenticación. `id` es UUID (no integer) — generado con `gen_random_uuid()`.

| Columna | Tipo | Constraint |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `nombre` | `text` | NOT NULL |
| `email` | `text` | NOT NULL, **UNIQUE** |
| `password_hash` | `text` | NOT NULL (bcrypt, cost factor 10) |
| `rol` | `user_rol` | NOT NULL |
| `activo` | `boolean` | NOT NULL, default `true` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Notas**:
- El password se hashea con `bcrypt.hash(password, 10)` antes de guardar (ver [`authController.ts`](../backend/src/controllers/authController.ts) y [`seedAdmin.ts`](../backend/src/db/seedAdmin.ts)).
- Si `activo = false`, el login lo rechaza con 401.
- No hay tabla de sessions ni de tokens revocados — JWT es stateless.

---

### Master data

#### `proyectos`

Proyectos de procurement. Cada proyecto agrupa materiales, OCs y recepciones.

| Columna | Tipo | Constraint |
|---|---|---|
| `id` | `serial` | PK |
| `codigo` | `varchar(30)` | NOT NULL, **UNIQUE** (ej. `PRY-2026-001`) |
| `nombre` | `varchar(300)` | NOT NULL |
| `cliente` | `varchar(200)` | NOT NULL |
| `descripcion` | `text` | NULL |
| `estado` | `estado_proyecto` | default `cotizacion` |
| `fecha_inicio` | `date` | NULL |
| `fecha_fin_estimada` | `date` | NULL |
| `fecha_fin_real` | `date` | NULL |
| `presupuesto` | `numeric` | default 0 |
| `responsable` | `varchar(150)` | NULL |
| `created_at`, `updated_at` | `timestamptz` | default `now()` |

**Índices**: `idx_proyectos_estado` (estado).

#### `proveedores`

Proveedores con datos de contacto.

| Columna | Tipo | Constraint |
|---|---|---|
| `id` | `serial` | PK |
| `nombre` | `varchar(200)` | NOT NULL |
| `contacto` | `varchar(150)` | NULL |
| `email` | `varchar(150)` | NULL — usado por el flujo de cotización para autocompletar |
| `telefono` | `varchar(30)` | NULL |
| `rfc` | `varchar(20)` | NULL |
| `direccion` | `text` | NULL |
| `activo` | `boolean` | default `true` |
| `created_at`, `updated_at` | `timestamptz` | default `now()` |

#### `materiales_mto`

Materiales del MTO (Material Take-Off). Tabla central — todo el flujo de cotización + OC + recepción gira alrededor de esto.

| Columna | Tipo | Constraint |
|---|---|---|
| `id` | `serial` | PK |
| `codigo` | `varchar(50)` | NOT NULL — código interno, prefijo "NC" indica stock propio |
| `descripcion` | `varchar(300)` | NOT NULL |
| `unidad` | `varchar(20)` | NOT NULL |
| `categoria` | `varchar(100)` | NULL |
| `proyecto_id` | `int` | FK → `proyectos.id` **ON DELETE CASCADE** |
| `item` | `text` | default `''` — número de ítem dentro del MTO |
| `vendor_code` | `text` | default `''` — código del proveedor para este material |
| `vendor` | `text` | default `''` — nombre del proveedor (texto libre, no FK) |
| `color` | `text` | default `''` |
| `size` | `text` | default `''` |
| `qty` | `numeric` | default 0 |
| `unit_price` | `numeric` | default 0 — viene del Excel; 0 si pendiente de cotizar |
| `total_price` | `numeric` | default 0 — calculado = qty × unit_price |
| `estado_cotiz` | `text` | default `'PENDIENTE'` — valores: `PENDIENTE`, `COTIZADO`, `EN_STOCK` |
| `mill_made` | `text` | default `'NO'` — valores: `SI`, `NO` |
| `notas` | `text` | NULL |
| `fecha_importacion` | `date` | NULL — fecha en que se importó del Excel (sirve para batches) |
| `manufacturer` | `text` | default `''` |
| `cotizar` | `text` | default `'SI'` — valores: `SI`, `NO`, `EN_STOCK` |
| `created_at`, `updated_at` | `timestamptz` | default `now()` |

**Reglas de negocio sobre `cotizar` y `estado_cotiz`** (ver [`CLAUDE.md`](../CLAUDE.md) para más detalle):
- `cotizar = 'SI'` → debe cotizarse
- `cotizar = 'NO'` → excluido de cotización
- `cotizar = 'EN_STOCK'` → stock propio, no se cotiza, fuerza `estado_cotiz = 'EN_STOCK'`
- Códigos que empiezan con `NC` son automáticamente `cotizar = 'EN_STOCK'`
- `estado_cotiz` pasa a `COTIZADO` cuando se capturan precios en el panel "Capturar Precios"

> **Sin índices custom en `materiales_mto`** — para tablas grandes podría convenir `(proyecto_id)`, `(vendor)`, `(estado_cotiz)`. Acción futura si la consulta se vuelve lenta.

#### `mto_freight`

Costo de flete por (proyecto, vendor). Usado en el cálculo de "Capturar Precios".

| Columna | Tipo | Constraint |
|---|---|---|
| `id` | `serial` | PK |
| `proyecto_id` | `int` | FK → `proyectos.id` **ON DELETE CASCADE**, NOT NULL |
| `vendor` | `text` | NOT NULL |
| `freight` | `numeric` | NOT NULL, default 0 |
| `updated_at` | `timestamptz` | default `now()` |

**Constraints**: `UNIQUE(proyecto_id, vendor)` — un único registro de freight por combinación proyecto+vendor.

---

### Procurement workflow

#### `solicitudes_cotizacion`

Registro de cotizaciones solicitadas a vendors. Antes se enviaban por SMTP; ahora el frontend genera un PDF y el usuario lo manda manualmente, este registro se crea cuando hace click en "Marcar como enviada".

| Columna | Tipo | Constraint |
|---|---|---|
| `id` | `serial` | PK |
| `folio` | `varchar(30)` | NOT NULL, **UNIQUE** (`COT-YYYY-NNNN`) |
| `proyecto_id` | `int` | FK → `proyectos.id` **ON DELETE RESTRICT** |
| `proveedor_id` | `int` | FK → `proveedores.id` **ON DELETE RESTRICT** — puede ser NULL si el vendor del material no matchea con ningún proveedor registrado |
| `vendor` | `text` | NULL — nombre del vendor (texto libre, viene del MTO) |
| `estado` | `estado_cotizacion` | default `pendiente` |
| `fecha_solicitud` | `date` | default `CURRENT_DATE` |
| `fecha_envio` | `timestamptz` | NULL — cuando se marcó como enviada |
| `fecha_respuesta` | `date` | NULL |
| `email_destinatario` | `text` | NULL — histórico, hoy queda NULL porque el flujo es manual |
| `materiales_incluidos` | `jsonb` | snapshot de los materiales que se incluyeron al momento de marcar enviada |
| `monto_cotizado` | `numeric` | NULL |
| `notas` | `text` | NULL |
| `created_at`, `updated_at` | `timestamptz` | default `now()` |

**Índices**: `idx_cotizaciones_proyecto`, `idx_cotizaciones_proveedor`.

#### `ordenes_compra`

Órdenes de compra. Se generan por (proyecto, vendor) usando los materiales `cotizar='SI' AND estado_cotiz='COTIZADO'`.

| Columna | Tipo | Constraint |
|---|---|---|
| `id` | `serial` | PK |
| `numero` | `varchar(30)` | NOT NULL, **UNIQUE** (`OC-YYYY-NNNN`) |
| `proyecto_id` | `int` | FK → `proyectos.id` **ON DELETE RESTRICT** |
| `proveedor_id` | `int` | FK → `proveedores.id` **ON DELETE RESTRICT** |
| `estado` | `estado_orden` | default `borrador` |
| `fecha_emision` | `date` | default `CURRENT_DATE` |
| `fecha_entrega_estimada` | `date` | NULL — la "ETA" |
| `fecha_entrega_real` | `date` | NULL — se setea cuando estado pasa a `recibida` |
| `fecha_mto` | `date` | NULL — fecha del batch del MTO de origen (relevante para slicing) |
| `categoria` | `varchar(100)` | default `''` (HARDWARE, MILLWORK, etc.) |
| `subtotal` | `numeric` | default 0 |
| `iva` | `numeric` | default 0 |
| `total` | `numeric` | default 0 |
| `notas` | `text` | NULL |
| `created_at`, `updated_at` | `timestamptz` | default `now()` |

**Display en UI**: el backend mapea `estado` → `estado_display`:
- `enviada`, `confirmada`, `parcial` → `ORDENADO`
- `en_transito` → `EN_TRANSITO`
- `recibida` → `EN_EL_TALLER`
- `cancelada` → `CANCELADA`

**Índices**: `idx_ordenes_estado`, `idx_ordenes_proyecto`, `idx_ordenes_proveedor`.

#### `items_orden_compra`

Línea de detalle dentro de una OC.

| Columna | Tipo | Constraint |
|---|---|---|
| `id` | `serial` | PK |
| `orden_compra_id` | `int` | FK → `ordenes_compra.id` **ON DELETE CASCADE** |
| `material_id` | `int` | FK → `materiales_mto.id` **ON DELETE RESTRICT** |
| `descripcion` | `varchar(300)` | NOT NULL |
| `unidad` | `varchar(20)` | NULL |
| `cantidad` | `numeric` | NOT NULL |
| `precio_unitario` | `numeric` | NOT NULL |
| `subtotal` | `numeric` | NULL — generado = cantidad × precio_unitario |

#### `oc_imagenes`

Metadata de imágenes asociadas a una OC. Los archivos físicos viven en Supabase Storage (bucket `oc-imagenes`).

| Columna | Tipo | Constraint |
|---|---|---|
| `id` | `serial` | PK |
| `orden_compra_id` | `int` | FK → `ordenes_compra.id` **ON DELETE CASCADE**, NOT NULL |
| `tipo` | `varchar(30)` | NOT NULL — valores: `delivery_ticket`, `material_recibido`, `recepcion` |
| `filename` | `varchar(255)` | NOT NULL — nombre interno (timestamp + random) |
| `original_name` | `varchar(255)` | NULL — nombre original que subió el usuario |
| `created_at` | `timestamptz` | default `now()` |

**Índices**: `idx_oc_imagenes_orden`.

> **Importante**: cuando se borra un registro de `oc_imagenes` directamente vía SQL, el archivo en Supabase queda huérfano. Para borrar correctamente conviene usar el endpoint `DELETE /api/imagenes/:id` que limpia ambos lados.

---

### Reception

#### `recepciones`

Cabecera de cada recepción registrada contra una OC.

| Columna | Tipo | Constraint |
|---|---|---|
| `id` | `serial` | PK |
| `folio` | `varchar(30)` | NOT NULL, **UNIQUE** (`REC-YYYY-NNNN`) |
| `orden_compra_id` | `int` | FK → `ordenes_compra.id` **ON DELETE RESTRICT** |
| `estado` | `estado_recepcion` | default `pendiente` |
| `fecha_recepcion` | `date` | default `CURRENT_DATE` |
| `recibio` | `varchar(150)` | NULL — quien recibió (web pide el campo, móvil toma del user logueado) |
| `notas` | `text` | NULL |
| `created_at`, `updated_at` | `timestamptz` | default `now()` |

**Estados**:
- `pendiente`: registro "template" que se crea automáticamente al abrir una OC para tener listos los materiales en la UI. No representa una recepción real.
- `completa`: recepción TOTAL — todos los materiales de la OC marcados como recibidos.
- `con_diferencias`: recepción PARCIAL — algunos materiales no llegaron / vienen en backorder.

**Índices**: `idx_recepciones_orden`.

#### `items_recepcion`

Línea por cada item de OC en la recepción. Tabla legacy del flujo original; el flujo nuevo usa `recepcion_materiales` (más abajo).

| Columna | Tipo | Constraint |
|---|---|---|
| `id` | `serial` | PK |
| `recepcion_id` | `int` | FK → `recepciones.id` **ON DELETE CASCADE** |
| `item_orden_id` | `int` | FK → `items_orden_compra.id` **ON DELETE RESTRICT** |
| `cantidad_ordenada` | `numeric` | NOT NULL |
| `cantidad_recibida` | `numeric` | NOT NULL |
| `diferencia` | `numeric` | NULL — generado = recibida - ordenada |
| `observaciones` | `text` | NULL |

#### `recepcion_materiales`

Tabla nueva (migración 010) — granular por material. Es la que usan tanto el flujo web como el móvil para marcar recibido/no-recibido a nivel de material individual.

| Columna | Tipo | Constraint |
|---|---|---|
| `id` | `serial` | PK |
| `id_recepcion` | `int` | FK → `recepciones.id` **ON DELETE CASCADE**, NOT NULL |
| `id_material` | `int` | FK → `materiales_mto.id` **ON DELETE SET NULL** — si se borra el material, se conserva el registro histórico de la recepción |
| `cm_code` | `varchar(50)` | NULL — copia del código del material al momento de la recepción |
| `descripcion` | `varchar(300)` | NULL — copia |
| `recibido` | `boolean` | default `false` |
| `nota` | `text` | NULL — observación específica del material (ej. "back order") |
| `created_at` | `timestamptz` | default `now()` |

**Índices**: `idx_recepcion_materiales_recepcion`.

---

## Diagrama de relaciones

```
                ┌─────────────┐
                │  proyectos  │
                └──┬───┬───┬──┘
                   │   │   │
        ┌──────────┘   │   └────────────┐
        │ CASCADE      │ RESTRICT       │ RESTRICT
        ▼              ▼                ▼
 ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐
 │materiales_mto│  │ordenes_compra│  │solicitudes_cotizacion│
 └──────┬───────┘  └──┬───┬───┬───┘  └─────────────────────┘
        │             │   │   │
        │ RESTRICT    │   │   │
        ▼             │   │   │
 ┌──────────────┐     │   │   │ CASCADE
 │  proveedores │     │   │   ▼
 └──────────────┘     │   │  ┌─────────────────┐
                      │   │  │items_orden_compra│
            CASCADE   │   │  └─────────────────┘
                      │   │
            RESTRICT  │   │  CASCADE
                      ▼   ▼
              ┌───────────────┐  ┌────────────┐
              │  recepciones  │  │oc_imagenes │
              └──┬───────┬────┘  └────────────┘
                 │       │
       CASCADE   │       │  CASCADE
                 ▼       ▼
       ┌──────────────┐  ┌─────────────────────┐
       │items_recepcion│  │recepcion_materiales │
       └──────────────┘  └─────────────────────┘

 ┌───────────┐
 │ proyectos │ ─── CASCADE ───► mto_freight (UNIQUE proyecto, vendor)
 └───────────┘
```

---

## Resumen de comportamiento de DELETE

Esto es importante para entender qué pasa al borrar entidades:

| Borrar... | Cascada (auto-borra) | Bloquea (RESTRICT) si existe... |
|---|---|---|
| **Proyecto** | `materiales_mto`, `mto_freight` | `ordenes_compra`, `solicitudes_cotizacion` |
| **Proveedor** | (nada) | `ordenes_compra`, `solicitudes_cotizacion` |
| **OC** | `items_orden_compra`, `oc_imagenes` (metadata) | `recepciones` |
| **Recepción** | `items_recepcion`, `recepcion_materiales` | (nada) |
| **Material** | (nada) | `items_orden_compra` |

**Limitaciones del controller** (no SQL):
- `DELETE /api/ordenes-compra/:id` rechaza con 409 si la OC está en estado `recibida` o `confirmada`.
- `DELETE /api/cotizaciones/:id` rechaza con 409 si la cotización está `aprobada`.
- No existe `DELETE /api/recepciones/:id` — para borrar recepciones hay que ir vía SQL directo.

**Cleanup completo de un proyecto** (orden recomendado):
1. Borrar imágenes vía API (`DELETE /api/imagenes/:id`) — limpia DB y Supabase Storage
2. Borrar recepciones vía SQL (CASCADE limpia items + recepcion_materiales)
3. Borrar cotizaciones vía SQL
4. Borrar OCs vía SQL (CASCADE limpia items + oc_imagenes-metadata)
5. Borrar el proyecto vía SQL (CASCADE limpia materiales_mto + mto_freight)

---

## Tablas auto-administradas (rate limiting)

El paquete [`@acpr/rate-limit-postgresql`](https://www.npmjs.com/package/@acpr/rate-limit-postgresql) crea automáticamente sus propias tablas en el schema `rate_limit`:

| Tabla | Propósito |
|---|---|
| `rate_limit.records_aggregated` | Contadores agregados por (key, prefix). Es la que usan los limiters de la app |
| `rate_limit.individual_records` | Existe en el schema pero la app no la usa (sería para el modo "individual IP" — análisis detallado) |
| `rate_limit.sessions` | Tracking interno del paquete |

**No tocar manualmente**. La librería las gestiona. Si querés resetear los contadores, podés `TRUNCATE rate_limit.records_aggregated;` — los IPs vuelven al límite máximo inmediatamente.

---

## Backup & restore

Hoy no hay backup automatizado en código. Lo que existe:

- **Railway Postgres** tiene snapshots automáticos diarios incluidos en el plan (consultar dashboard de Railway → Postgres → Backups). Ver retención según plan.
- En `backups/` del repo hay un dump manual del 2026-04-30 (`centralmillwork_20260430_232611.sql`). No está versionado en git (gitignored), es local.

**Para hacer un backup ad-hoc desde tu máquina**:
```bash
DATABASE_URL="postgresql://..." pg_dump "$DATABASE_URL" --no-owner --no-acl > backup.sql
```

**Para restaurar**:
```bash
psql "$DATABASE_URL" < backup.sql
```

---

## Convenciones de queries

Reglas que se siguen en los controllers:

1. **Siempre parametrizar** — usar `$1`, `$2`, etc. y pasar values en array a `pool.query(sql, values)`. Nunca interpolar `req.query.*` o `req.body.*` directamente en el SQL string.
2. **Whitelist para `ORDER BY`** — `parsePagination` recibe un tercer arg con las columnas válidas para ordenar. Sin esto, alguien podría inyectar SQL vía `?sort=...`.
3. **Para queries dinámicas** (filtros opcionales) usar el patrón `conds: string[]` + `vals: any[]`:
   ```ts
   const conds: string[] = []
   const vals: unknown[] = []
   if (req.query.foo) { conds.push(`col = $${vals.length + 1}`); vals.push(req.query.foo) }
   const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
   await pool.query(`SELECT ... ${where}`, vals)
   ```
4. **Para transacciones** usar `pool.connect()` para tomar un client exclusivo, hacer `BEGIN/COMMIT/ROLLBACK`, y siempre `client.release()` en `finally`.

---

## Pendientes

- **Migración formal** que documente la adición de `materiales_mto.proyecto_id` (la columna fue agregada en producción sin migración versionada).
- **Backfill** del enum `user_rol`: convertir todos los usuarios con rol `RECEPTION` a `CONTABILIDAD` y eventualmente eliminar `RECEPTION` del enum (requiere recrear el tipo).
- **Índices** en `materiales_mto(proyecto_id)`, `materiales_mto(vendor)`, `materiales_mto(estado_cotiz)` si las consultas se vuelven lentas con datos a escala.
