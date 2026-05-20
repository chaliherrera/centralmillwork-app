# Central Millwork — App de Gestión de Compras

Sistema interno de procurement para Central Millwork. Gestiona el ciclo completo de materiales MTO: importación desde Excel → cotización con proveedores → órdenes de compra → recepción en taller.

---

## Comandos para levantar el sistema

```bash
# Desde la raíz del proyecto — levanta frontend + backend en paralelo
npm run dev

# Por separado:
npm run dev --workspace=backend    # API en http://localhost:4000
npm run dev --workspace=frontend   # UI  en http://localhost:3000

# Migraciones (ejecutar en orden, desde la raíz)
PGPASSWORD=postgres psql -h localhost -U postgres -d centralmillwork -f "database/migrations/001_initial_schema.sql"
# ... repetir del 001 al 009 en orden

# Type-check sin compilar
cd frontend && npx tsc --noEmit
cd backend  && npx tsc --noEmit

# Build de producción (genera frontend/dist/ y backend/dist/)
npm run build
```

---

## Deploy en Railway

### Arquitectura
Un solo servicio Railway: Express sirve tanto la API como el frontend compilado.
- `GET /api/*` → rutas de la API
- `GET /*` → `frontend/dist/index.html` (React SPA)

### Pasos para hacer deploy

**1. Crear proyecto en Railway**
- railway.app → New Project → Deploy from GitHub repo
- Conectar el repositorio de GitHub

**2. Agregar PostgreSQL**
- En el proyecto Railway → New → Database → Add PostgreSQL
- Railway inyecta `DATABASE_URL` automáticamente en el servicio

**3. Configurar variables de entorno**
En Railway → tu servicio → Variables, agregar:
```
NODE_ENV=production
JWT_SECRET=<genera con: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
JWT_EXPIRES_IN=8h
CORS_ORIGIN=https://<tu-app>.up.railway.app
GITHUB_TOKEN=<tu token de GitHub>
GITHUB_USERNAME=<tu usuario>
```
> `DATABASE_URL` la agrega Railway automáticamente — no la toques.

**4. Aplicar migraciones en la DB de Railway**
```bash
# Obtener la URL de la DB desde Railway → Postgres → Connect → DATABASE_URL
# Luego ejecutar cada migración:
psql "<DATABASE_URL>" -f database/migrations/001_initial_schema.sql
psql "<DATABASE_URL>" -f database/migrations/002_...sql
# ... hasta la última migración

# O usar el seed de admin:
DATABASE_URL="<url>" node -e "require('./backend/dist/db/seedAdmin')"
```

**5. Deploy**
Railway hace el deploy automáticamente al hacer push a main.
- Build command (desde railway.json): `npm install && npm run build`
- Start command: `node backend/dist/index.js`

### Archivos clave del deploy
| Archivo | Propósito |
|---|---|
| `railway.json` | Build y start commands para Railway |
| `backend/.env.example` | Plantilla de variables de entorno |
| `backend/src/db/pool.ts` | Detecta `DATABASE_URL` (Railway) vs vars individuales (local) |
| `backend/src/index.ts` | Sirve `frontend/dist/` como static en `NODE_ENV=production` |

### Notas
- Los archivos subidos (`backend/uploads/`) son efímeros en Railway — se pierden en cada redeploy. Para producción real usar Railway Volumes o S3.
- En producción la app está en `https://<tu-app>.up.railway.app` — no hace falta configurar nada en el frontend porque `baseURL: '/api'` es relativo y funciona igual.

---

## Stack tecnológico

### Frontend (`/frontend`) — puerto 3000
| Librería | Versión | Uso |
|---|---|---|
| React | 18.3 | UI framework |
| TypeScript | 5.6 | Tipado estático |
| Vite | 5.4 | Build tool + dev server |
| React Router DOM | 6.26 | Navegación SPA |
| TanStack Query | 5.56 | Server state, cache, mutations |
| React Hook Form | 7.53 | Formularios |
| Zod | 3.23 | Validación de esquemas |
| Tailwind CSS | 3.4 | Estilos (utility-first) |
| Recharts | 2.12 | Gráficas (Bar, Line, Pie) |
| Axios | 1.7 | HTTP client |
| Lucide React | 0.447 | Iconos |
| clsx | 2.1 | Classnames condicionales |
| react-hot-toast | 2.4 | Notificaciones toast |

### Backend (`/backend`) — puerto 4000
| Librería | Versión | Uso |
|---|---|---|
| Node.js + Express | 4.21 | API REST |
| TypeScript | 5.6 | Tipado estático |
| `pg` (node-postgres) | 8.13 | Driver PostgreSQL (pool) |
| multer | 2.1 | Upload de imágenes |
| dotenv | 16.4 | Variables de entorno |
| nodemon + ts-node | — | Hot-reload en desarrollo |

### Base de datos
- **PostgreSQL** (local, puerto 5432)
- DB: `centralmillwork`
- Usuario: `postgres`
- Password: `postgres` (desarrollo)

### Alias de paths
```
@/ → frontend/src/
```

---

## Estructura del proyecto

```
centralmillwork-app/
├── package.json                  # Workspace raíz (npm workspaces)
├── CLAUDE.md
├── database/
│   └── migrations/               # SQL ordenados, aplicar del 001 al 009
├── backend/
│   └── src/
│       ├── index.ts              # Entry point — Express app, puerto 4000
│       ├── db/pool.ts            # Pool de conexiones PostgreSQL
│       ├── routes/index.ts       # Todas las rutas bajo /api/
│       ├── controllers/          # Lógica de endpoints
│       │   ├── dashboardController.ts
│       │   ├── proyectosController.ts
│       │   ├── proveedoresController.ts
│       │   ├── materialesController.ts
│       │   ├── ordenesCompraController.ts
│       │   ├── recepcionesController.ts
│       │   ├── imagenesController.ts
│       │   └── cotizacionesController.ts
│       └── middleware/errorHandler.ts
└── frontend/
    └── src/
        ├── App.tsx               # Rutas React Router
        ├── main.tsx              # Entry point React
        ├── types/index.ts        # Todos los tipos TypeScript
        ├── services/             # Clientes HTTP (axios)
        │   ├── api.ts            # Instancia base axios
        │   ├── dashboard.ts
        │   ├── proyectos.ts
        │   ├── proveedores.ts
        │   ├── materiales.ts
        │   ├── ordenesCompra.ts
        │   ├── recepciones.ts
        │   └── cotizaciones.ts
        ├── pages/                # Una página por ruta principal
        │   ├── Dashboard.tsx
        │   ├── Proyectos.tsx
        │   ├── Materiales.tsx
        │   ├── OrdenesCompra.tsx
        │   ├── Recepciones.tsx
        │   └── Proveedores.tsx
        └── components/
            ├── layout/           # MainLayout, Sidebar, Header
            ├── ui/               # Modal, StatCard, componentes genéricos
            └── modules/          # Componentes específicos por módulo
                ├── materiales/
                │   ├── MaterialForm.tsx
                │   └── CapturaPrecios.tsx
                ├── ordenes_compra/
                │   └── OrdenCompraForm.tsx
                └── ...
```

---

## Esquema de base de datos

### Migraciones aplicadas (001 → 009)

#### Tablas principales

**`proveedores`**
```sql
id, nombre, contacto, email, telefono, rfc, direccion, activo, created_at, updated_at
```

**`proyectos`**
```sql
id, codigo (UNIQUE), nombre, cliente, descripcion,
estado (ENUM: cotizacion|activo|en_pausa|completado|cancelado),
fecha_inicio, fecha_fin_estimada, fecha_fin_real,
presupuesto, responsable, created_at, updated_at
```

**`materiales_mto`** — tabla central del sistema
```sql
id, codigo (UNIQUE), descripcion, unidad, categoria, precio_referencia,
stock_minimo, activo,
-- Agregados por migraciones:
proyecto_id (FK → proyectos, nullable),
item, vendor_code, vendor, color, size, qty, unit_price, total_price,
mill_made (SI|NO),
notas,
fecha_importacion (DATE),
manufacturer,
cotizar (SI|NO|EN_STOCK, DEFAULT 'SI'),
estado_cotiz (COTIZADO|PENDIENTE|EN_STOCK|ORDENADO|RECIBIDO, DEFAULT 'PENDIENTE'),
origen (MTO|DIRECTA|URGENTE|OPERATIVA, DEFAULT 'MTO', CHECK constraint),
created_at, updated_at
```

> **NOTAS** (post-2026-05-16):
> - `estado_cotiz` ahora soporta `ORDENADO` y `RECIBIDO` además de los 3 originales. Transiciones automáticas via `recomputeMaterialesEstadoByIds` (en `backend/src/utils/materialesEstado.ts`) llamado desde `generarOCs`, `updateEstadoOrden`, `deleteOrdenCompra`, `createRecepcion`, `createRecepcionCompleta`.
> - `origen` distingue compras planificadas (MTO) de compras puntuales fuera del MTO (DIRECTA, URGENTE) y gastos del taller sin proyecto (OPERATIVA).

**`ordenes_compra`**
```sql
id, numero (UNIQUE), proyecto_id (FK, nullable para OPERATIVA), proveedor_id (FK),
estado (ENUM: borrador|enviada|confirmada|parcial|recibida|cancelada|en_transito),
origen (MTO|DIRECTA|URGENTE|OPERATIVA, DEFAULT 'MTO'),
freight (NUMERIC(14,2) DEFAULT 0),
fecha_emision, fecha_entrega_estimada, fecha_entrega_real,
subtotal, iva, total, notas,
-- Agregados:
fecha_mto (DATE), categoria,
created_at, updated_at
```

**`items_orden_compra`**
```sql
id, orden_compra_id (FK CASCADE), material_id (FK),
descripcion, unidad, cantidad, precio_unitario,
subtotal (GENERATED: cantidad * precio_unitario)
```

**`recepciones`**
```sql
id, folio (UNIQUE), orden_compra_id (FK),
estado (ENUM: pendiente|completa|con_diferencias),
fecha_recepcion, recibio, notas, created_at, updated_at
```

**`items_recepcion`**
```sql
id, recepcion_id (FK CASCADE), item_orden_id (FK),
cantidad_ordenada, cantidad_recibida,
diferencia (GENERATED: recibida - ordenada), observaciones
```

**`solicitudes_cotizacion`**
```sql
id, folio (UNIQUE), proyecto_id (FK), proveedor_id (FK),
estado (ENUM: pendiente|enviada|recibida|aprobada|rechazada),
fecha_solicitud, fecha_respuesta, monto_cotizado, notas, created_at, updated_at
```

**`oc_imagenes`**
```sql
id, orden_compra_id (FK CASCADE),
tipo (delivery_ticket|material_recibido),
filename, original_name, created_at
-- Archivos físicos en: backend/uploads/
-- Servidos en: http://localhost:4000/uploads/<filename>
```

**`mto_freight`**
```sql
id, proyecto_id (FK CASCADE), vendor (TEXT),
freight (DECIMAL),
updated_at
-- UNIQUE(proyecto_id, vendor)
```

---

## API endpoints

Todos los endpoints bajo `/api/`.

```
GET    /health                                    — Health check

# Dashboard
GET    /api/dashboard/stats                       — KPIs legacy (4 contadores)
GET    /api/dashboard/gasto-por-mes               — Gasto OC últimos 12 meses
GET    /api/dashboard/kpis                        — 8 KPIs con filtros
GET    /api/dashboard/charts                      — Datos para 5 gráficas
GET    /api/dashboard/resumen-estados             — Tabla agrupada por estado_cotiz
GET    /api/dashboard/proyectos-recientes         — Proyectos paginados con stats

# Proyectos
GET    /api/proyectos
GET    /api/proyectos/:id
GET    /api/proyectos/:id/resumen              — KPIs agregados (materiales, OCs, recepciones, top_vendors, gasto_mensual)
GET    /api/proyectos/:id/actividad            — Timeline cronológico de eventos (MTO imports, OCs, recepciones)
POST   /api/proyectos                          — Con validateBody(createProyectoSchema) zod
PUT    /api/proyectos/:id                      — Con validateBody(updateProyectoSchema) zod
DELETE /api/proyectos/:id

# Proveedores
GET    /api/proveedores
GET    /api/proveedores/:id
POST   /api/proveedores                        — Con validateBody(createProveedorSchema) zod
PUT    /api/proveedores/:id                    — Con validateBody(updateProveedorSchema) zod
DELETE /api/proveedores/:id

# Materiales MTO
GET    /api/materiales                            — Lista con filtros (proyecto_id, vendor, cotizar, estado_cotiz, search)
GET    /api/materiales/kpis                       — 4 contadores para el header
GET    /api/materiales/import-dates               — Fechas de importación por proyecto
GET    /api/materiales/freight                    — Freight guardado por (proyecto_id, vendor)
GET    /api/materiales/:id
GET    /api/materiales/:id/oc-info                — OCs en las que aparece el material
POST   /api/materiales
PUT    /api/materiales/:id                        — Update parcial (acepta cualquier campo)
PATCH  /api/materiales/precios-lote               — Batch: actualiza precios + freight + estado_cotiz
DELETE /api/materiales/:id

# Órdenes de Compra
GET    /api/ordenes-compra
GET    /api/ordenes-compra/kpis
GET    /api/ordenes-compra/import-dates
GET    /api/ordenes-compra/:id
GET    /api/ordenes-compra/:id/materiales-lote    — Materiales agrupados por vendor para la OC
GET    /api/ordenes-compra/:id/imagenes
POST   /api/ordenes-compra/:id/imagenes           — Upload imagen (multipart/form-data, ?tipo=delivery_ticket|material_recibido)
DELETE /api/imagenes/:imagenId
POST   /api/ordenes-compra/no-mto                 — Crear OC DIRECTA/URGENTE/OPERATIVA (OPERATIVA solo ADMIN)
POST   /api/ordenes-compra
PUT    /api/ordenes-compra/:id
PATCH  /api/ordenes-compra/:id/estado
DELETE /api/ordenes-compra/:id

# Recepciones
GET    /api/recepciones
GET    /api/recepciones/:id
POST   /api/recepciones
PUT    /api/recepciones/:id

# Cotizaciones
GET    /api/cotizaciones
GET    /api/cotizaciones/:id
POST   /api/cotizaciones
PUT    /api/cotizaciones/:id
PATCH  /api/cotizaciones/:id/aprobar
DELETE /api/cotizaciones/:id
```

### Filtros disponibles en GET /api/materiales
| Param | Tipo | Descripción |
|---|---|---|
| `proyecto_id` | number | Filtrar por proyecto |
| `vendor` | string | Filtrar por proveedor (texto exacto) |
| `cotizar` | `SI\|NO\|EN_STOCK` | Filtrar por estado cotizar |
| `estado_cotiz` | `COTIZADO\|PENDIENTE\|EN_STOCK` | Filtrar por estado |
| `search` | string | Búsqueda en descripción, codigo, vendor |
| `fecha_importacion` | date string | Filtrar por fecha de importación |
| `page` | number | Paginación |
| `limit` | number | Items por página |

### Filtros disponibles en endpoints de Dashboard
| Param | Aplica a queries de materiales |
|---|---|
| `fecha_desde` | `m.fecha_importacion >= fecha_desde` |
| `fecha_hasta` | `m.fecha_importacion <= fecha_hasta` |
| `proyecto_estado` | `p.estado = proyecto_estado` |
| `vendor` | `m.vendor ILIKE vendor` |
| `categoria` | `m.categoria = categoria` |

---

## Lógica de negocio

### Campo `cotizar` (tres estados)
Controla si un material debe cotizarse con proveedores.

| Valor | Significado | Color UI |
|---|---|---|
| `SI` | Debe cotizarse — aparece en panel Capturar Precios | Verde |
| `NO` | Excluido de cotización | Gris |
| `EN_STOCK` | En inventario propio — no se cotiza | Azul |

**Ciclo de toggle en tabla**: `SI → NO → EN_STOCK → SI`

**Reglas atómicas al cambiar cotizar**:
- `cotizar = 'EN_STOCK'` → también setea `estado_cotiz = 'EN_STOCK'`
- `cotizar = 'EN_STOCK' → 'SI'` → resetea `estado_cotiz = 'PENDIENTE'`

**Regla de código NC**: materiales cuyo `codigo` empieza con `NC` son automáticamente `cotizar='EN_STOCK'` (stock propio de Central Millwork). Aplicado via migración 009.

### Campo `estado_cotiz` (tres estados)
Refleja el estado del proceso de cotización para cada material.

| Valor | Significado |
|---|---|
| `PENDIENTE` | Sin precio — necesita cotización |
| `COTIZADO` | Tiene `unit_price > 0` — precio capturado |
| `EN_STOCK` | Material en stock (siempre cuando `cotizar='EN_STOCK'`) |

**Regla de backfill** (migración 009):
1. `codigo ILIKE 'NC%'` → `cotizar='EN_STOCK'`, `estado_cotiz='EN_STOCK'`
2. `unit_price > 0` (y no EN_STOCK) → `cotizar='SI'`, `estado_cotiz='COTIZADO'`
3. `unit_price = 0` (y no EN_STOCK) → `cotizar='SI'`, `estado_cotiz='PENDIENTE'`

### Panel Capturar Precios (slide-in derecho en Materiales MTO)
- Se activa cuando hay un vendor seleccionado en el filtro de la tabla
- Muestra SOLO `cotizar='SI' AND estado_cotiz='PENDIENTE'`
- Permite editar `unit_price` de cada material; `total_price = qty * unit_price` se calcula en tiempo real
- Muestra subtotal + freight + total orden de compra
- Al guardar (`PATCH /api/materiales/precios-lote`):
  - Actualiza `unit_price` y `total_price` de cada material en una transacción
  - Setea `estado_cotiz = 'COTIZADO'`
  - Hace upsert en `mto_freight` (proyecto_id + vendor)
- Bloquea el botón Guardar si algún precio es ≤ 0
- El badge "Capturar Precios {n}" en la tabla solo aparece cuando: vendor seleccionado + hay materiales con `cotizar='SI'`

### Estados de Órdenes de Compra
```
borrador → enviada → confirmada → parcial → recibida
                                          ↘ cancelada
                  ↘ en_transito
```
Display en UI: `ORDENADO` (enviada/confirmada/parcial) | `EN_TRANSITO` | `EN_EL_TALLER` (recibida) | `CANCELADA`

Flags visuales calculados en backend:
- `flag_vencida`: fecha_entrega_estimada < hoy y no recibida
- `flag_retraso`: vencida > 3 días
- `flag_2dias`: vence en ≤ 2 días

### Origen de compras (campo `origen`, agregado 2026-05-16/17)

Toda compra está clasificada con uno de 4 valores en `materiales_mto.origen` y `ordenes_compra.origen`:

| Origen | Cuándo | Quién | Comportamiento |
|---|---|---|---|
| **MTO** (default) | Compras planificadas desde Excel | ADMIN+PROCUREMENT | Flujo normal cotización → OC → recepción |
| **DIRECTA** | Puntual fuera del MTO (cliente cambió, vendor llegó con tema) | ADMIN+PROCUREMENT | OC dedicada, estado='enviada', total = subtotal + freight (sin IVA) |
| **URGENTE** | Crítica (rotura en obra, cliente parado) | ADMIN+PROCUREMENT | Mismo flow que DIRECTA, badge rojo pulsante, sort URGENTE-first en kanban Recepciones |
| **OPERATIVA** | Gasto del taller sin proyecto (insumos, café, herramientas) | **SOLO ADMIN** | proyecto_id=NULL obligatorio, OC nace en 'recibida', materiales en RECIBIDO directo |

**Endpoint único**: `POST /api/ordenes-compra/no-mto` (controller `crearOCNoMTO`) maneja los 3 tipos no-MTO.

**Categorías**:
- MTO/DIRECTA/URGENTE: `MILLWORK | HARDWARE | PAINT | SOLID WOOD | EDGE BANDING | METAL | LAMINATE | GLASS | OTHER`
- OPERATIVA: `INSUMOS_TALLER | LIMPIEZA | OFICINA | ALIMENTACION | COMBUSTIBLE | MANTENIMIENTO | HERRAMIENTAS | OTROS`

### Estados de materiales con ORDENADO/RECIBIDO (agregado 2026-05-11)

`materiales_mto.estado_cotiz` tiene 5 valores:

| Valor | Significado | Color |
|---|---|---|
| `PENDIENTE` | cotizar='SI' sin precio | amarillo |
| `COTIZADO` | con precio, listo para OC | verde claro |
| `ORDENADO` | está en una OC activa (enviada/confirmada/parcial/en_transito) | morado |
| `RECIBIDO` | está en una OC con estado='recibida' | verde oscuro |
| `EN_STOCK` | stock propio (cotizar='EN_STOCK') | azul |

**Transiciones automáticas** vía helper `recomputeMaterialesEstadoByIds` (en `backend/src/utils/materialesEstado.ts`):
- Crear OC (generarOCs, crearOCNoMTO) → COTIZADO/PENDIENTE → ORDENADO
- OC pasa a recibida (updateEstadoOrden, createRecepcion, createRecepcionCompleta) → ORDENADO → RECIBIDO
- OC cancelada o eliminada (updateEstadoOrden, deleteOrdenCompra) → recompute (RECIBIDO si otra OC; ORDENADO si en otra OC activa; sino COTIZADO)
- OPERATIVA: salta directo a RECIBIDO al crear (no pasa por flujo)

**Regla defensiva**: el helper solo toca materiales con `estado_cotiz IN ('COTIZADO','ORDENADO','RECIBIDO')`. NO toca PENDIENTE ni EN_STOCK.

---

## Paleta de colores corporativa (Tailwind)

```js
gold:   { 500: '#9B7200', 400: '#dea832', 600: '#7d5c00' }
forest: { 700: '#2c3126', 600: '#3b4233', 500: '#4A5240' }
```

**Uso consistente en la app**:
- Sidebar: `bg-forest-700`
- Elementos activos/primarios: `bg-gold-500`
- Estados MTO: COTIZADO=`#10B981` (verde), PENDIENTE=`#F59E0B` (ámbar), EN_STOCK=`#3B82F6` (azul)
- Estados cotizar: SI=verde, NO=gris, EN_STOCK=azul

---

## Patrones de UI

### Patrones establecidos
- **Modal genérico**: `<Modal open onClose title size>` — usar `size="xl"` para formularios grandes
- **Slide-in panel**: `translate-x-full` / `translate-x-0` + backdrop overlay
- **Click-to-cycle toggle**: `const CYCLE: Record<Val, Val> = { A: 'B', B: 'C', C: 'A' }`
- **Reset form al abrir**: `useEffect(() => { if (open) reset(values) }, [open])`  — nunca confiar en `defaultValues` para modales reutilizados
- **Queries con filtros activos**: `useMemo` para derivar `activeFilters` (sin keys vacías) → en `queryKey`
- **Invalidación post-mutation**: siempre invalidar `['materiales']` y `['materiales-kpis']` juntos

### Convenciones CSS (clases globales en `index.css`)
```css
.card     → bg-white rounded-xl border border-gray-200 p-5
.input    → border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-forest-500
.label    → block text-sm font-medium text-gray-700 mb-1
.btn-primary  → bg-gold-500 hover:bg-gold-600 text-white px-4 py-2 rounded-lg
.btn-ghost    → border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg
```

---

## Variables de entorno

### Backend (`backend/.env`)
```env
PORT=4000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=centralmillwork
DB_USER=postgres
DB_PASSWORD=postgres
CORS_ORIGIN=http://localhost:3000
```

### Frontend
Usa proxy de Vite: `/api/*` → `http://localhost:4000/api/*`. No requiere `.env` en desarrollo.

---

## Estado actual y pendientes

### Funcionalidad activa (al 2026-05-17, lanzamiento oficial 2026-05-18)

- [x] Dashboard con filtros, 8 KPIs, 5 gráficas, resumen estados, proyectos recientes
- [x] Proyectos CRUD completo + **vista de detalle** `/proyectos/:id` con 5 tabs (Materiales, OCs, Recepciones, Actividad timeline, Gráficas)
- [x] Materiales MTO: importación, filtros (incluye `origen`), toggle cotizar 3 estados, captura de precios
- [x] Órdenes de Compra CRUD + adjuntos de imágenes + estados + **compras SIN-MTO** (DIRECTA/URGENTE/OPERATIVA)
- [x] Recepciones con kanban URGENTE-first ordenado por ETA
- [x] Proveedores CRUD con validación zod
- [x] Cotizaciones (PDF cliente + email manual, sin SMTP)
- [x] **Autenticación implementada** con JWT, 5 roles (ADMIN, PROCUREMENT, PRODUCTION, PROJECT_MANAGEMENT, CONTABILIDAD)
- [x] **Seguridad endurecida** (2026-05-16): helmet, parameterized queries, role guards, validateBody, escape XSS en reportes, whitelist tipos upload
- [x] App móvil iOS (Expo) con flujo de recepciones; build 1.0.0 (3) en TestFlight "Ready to Submit"

### Pendientes conocidos

1. **Rotar password de Postgres en Railway** — `DATABASE_URL` se compartió múltiples veces por chat. Acción de usuario en Railway dashboard.

2. **Migración 009 puede no estar aplicada** — verificar con:
   ```sql
   SELECT cotizar, estado_cotiz, COUNT(*) FROM materiales_mto GROUP BY cotizar, estado_cotiz;
   ```

3. **Migrations 004, 008, 009 fallan en fresh install** (asumen columnas que se agregan en otras migraciones). Hay un workaround en `database/seed_local_test.sql` (no commiteado).

4. **Botón "Reporte Producción"** en Dashboard — sigue sin funcionalidad. "Reporte Compras" sí funciona. Decisión 2026-06-15: si nadie usa Reportes en 30 días, eliminar el módulo entero (decisión "Opción C" del 2026-05-16).

5. **Cotizaciones** — la página `Cotizaciones.tsx` y sus rutas de API existen pero el módulo fue removido del menú. La funcionalidad fue absorbida por el flujo de cotizar en Materiales MTO.

6. **`mto_freight`** — el freight se guarda en `mto_freight` por `(proyecto_id, vendor)` para flujo MTO. Las OCs SIN-MTO guardan freight directamente en `ordenes_compra.freight`.

7. **Validaciones zod faltan en endpoints write restantes** — materiales, ordenes_compra, recepciones, cotizaciones tienen validación manual inline pero no usan el patrón `validateBody(schema)` de proyectos/proveedores. ~2 hs replicar.

8. **JWT en localStorage** — vulnerable a XSS si la app crece con inputs externos. Acceptado como debt para usuarios internos. Migrar a httpOnly cookies requiere refactor (~6 hs).

9. **Branch `claude/jovial-ride-64bfff`** con módulo Producción + Kiosko (migraciones 014-019) pendiente de mergear a main. Conflicto de numeración con migrations 019-023 ya aplicadas en main.

---

## Notas para Claude

- El backend usa **queries dinámicas con arrays de condiciones** — al agregar filtros, siempre construir `conds: string[]` + `vals: any[]` con índices `$i` explícitos. **NUNCA** interpolar `req.query.*` directo en SQL (SQL injection); el patrón seguro está en `ordenesCompraController.getOrdenesCompra` y `materialesController.getMateriales`.
- El campo `cotizar` en `materiales_mto` es `TEXT` (no ENUM) para permitir `EN_STOCK` sin ALTER TYPE. Los valores válidos son `'SI'`, `'NO'`, `'EN_STOCK'`. Lo mismo `estado_cotiz` y `origen`.
- **`replace_all` es peligroso** en archivos de tipos/servicios — siempre reemplazar strings puntuales, no patrones amplios, para evitar afectar campos similares.
- El `unit_price` en `materiales_mto` viene originalmente de importación Excel; puede ser `0` si el material aún no tiene precio cotizado.
- `SELECT DISTINCT` en PostgreSQL requiere que las columnas de `ORDER BY` estén en el `SELECT`. Siempre incluir la columna raw (sin cast) cuando se ordena y se selecciona con cast.
- Las imágenes de OC viven en Supabase Storage (bucket `oc-imagenes`); el código en `imagenesController.ts` cubre fallback a filesystem local si Supabase no está configurado.
- **Helper crítico**: `backend/src/utils/materialesEstado.ts` — siempre llamarlo dentro de cualquier endpoint que cambie `ordenes_compra.estado` o cree/elimine items_orden_compra. Mantiene la sincronía de `materiales_mto.estado_cotiz`.
- **Middleware crítico**: `backend/src/middleware/validate.ts` con `validateBody(zodSchema)` — usar en TODOS los nuevos endpoints write. Pattern establecido en proyectos/proveedores.
- **Working directory activo**: `C:\dev\centralmillwork-app\` (fuera de OneDrive). El clon viejo en OneDrive ya no se usa.
- **Frontend invalidations**: usar `qc.invalidateQueries({ queryKey: [...], refetchType: 'all' })` para refrescar queries que pueden estar inactivas en otras páginas. Sin `refetchType: 'all'` los datos quedan stale hasta que el usuario vuelve a la página.
