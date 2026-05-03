# Development — Central Millwork

Setup local, convenciones de código, workflow para agregar features, debugging tips.

---

## Setup local

### Prerrequisitos

| Herramienta | Versión | Por qué |
|---|---|---|
| Node.js | ≥ 20 (recomendado 22) | Backend + frontend + mobile build tools |
| npm | ≥ 9 | Package manager (workspaces) |
| Git | cualquiera reciente | Source control |
| PostgreSQL | 14+ (recomendado 16) | DB local. Alternativa: usar `DATABASE_URL` de Railway directamente |
| (Opcional) `psql` CLI | misma versión que el server | Para queries manuales y migraciones |

### Clonar y instalar

```bash
git clone https://github.com/chaliherrera/centralmillwork-app.git
cd centralmillwork-app
npm install
```

`npm install` desde la raíz instala dependencias para frontend + backend (es un workspace de npm). El mobile se maneja por separado (ver [MOBILE.md](MOBILE.md) pendiente).

### Variables de entorno locales

Crear `backend/.env` (no se versiona, ver `backend/.env.example`):

```env
PORT=4000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=centralmillwork
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=dev-only-secret-cambialo-en-prod
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:3000
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_KEY=...
SUPABASE_BUCKET=oc-imagenes
```

> **Tip**: para Supabase Storage, podés usar el mismo proyecto de prod en dev (es un bucket público, las uploads de dev son visibles pero no críticas), o crear un proyecto Supabase separado para dev.

> **Sin `.env` el backend levanta pero**: connect a la DB falla (a menos que tengas Postgres con creds default `postgres/postgres`), JWT_SECRET undefined, login falla.

### Crear la base de datos local

```bash
# Asumiendo Postgres corriendo en localhost:5432 con user/pass `postgres`
psql -h localhost -U postgres -c "CREATE DATABASE centralmillwork;"
```

### Aplicar migraciones

Las migraciones viven en `database/migrations/`. Aplicar **en orden numérico**:

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d centralmillwork \
  -f database/migrations/001_initial_schema.sql
PGPASSWORD=postgres psql -h localhost -U postgres -d centralmillwork \
  -f database/migrations/002_add_notas_to_materiales.sql
# ... etc, hasta la 013
```

O con un loop:
```bash
for f in database/migrations/*.sql; do
  PGPASSWORD=postgres psql -h localhost -U postgres -d centralmillwork -f "$f"
done
```

### Crear un usuario admin

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/centralmillwork" \
  npm run db:seed-admin --workspace=backend
```

Esto crea un user con email `chali@centralmillwork.com` y password `CentralMillwork2026!` (definidos en `backend/src/db/seedAdmin.ts`). **Cambialos** si vas a usar este script en cualquier cosa que no sea local.

### Levantar dev

```bash
npm run dev
```

Esto corre `concurrently` con backend (puerto 4000) y frontend (puerto 3000). El frontend tiene proxy de Vite que reenvía `/api/*` al backend, así no hay problemas de CORS en dev.

URLs:
- Web: http://localhost:3000
- Backend health: http://localhost:4000/health
- Backend API: http://localhost:4000/api/...

### Levantar solo backend o solo frontend

```bash
npm run dev --workspace=backend
npm run dev --workspace=frontend
```

### Type-check sin compilar

Antes de commitear, suele ser buena idea:

```bash
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
```

### Build de producción local

```bash
npm run build
```

Genera:
- `frontend/dist/` (estáticos del SPA, listos para servir)
- `backend/dist/` (TypeScript compilado a JS)

Para correr el build:
```bash
NODE_ENV=production node backend/dist/index.js
```

En modo producción, el backend sirve el SPA desde `frontend/dist/` (igual que en Railway). Útil para testear el comportamiento end-to-end localmente.

---

## Convenciones de código

### Estilo general

- **TypeScript estricto** en ambos lados (`tsconfig.json` con `strict: true`)
- **No prettier ni eslint configurado formalmente** — convención implícita: 2 espacios, single quotes, sin semicolons opcionales
- **Comentarios al mínimo** — preferimos código autoexplicativo. Comentarios solo cuando el "por qué" no es obvio del código (ej. workarounds, asunciones sobre comportamiento de proxies)
- **Nombres en español** para términos de dominio (`proyecto`, `proveedor`, `cotizar`, `recepcion`) y en inglés para términos técnicos (`logger`, `middleware`, `request`)
- **Arquitectura**: rutas → controllers → DB pool. Sin services/repositories/abstracciones intermedias (es una app chica)

### Backend

#### Estructura de un controller

```ts
import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import { createError } from '../middleware/errorHandler'
import { logger } from '../utils/logger'

export async function listarAlgo(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = parsePagination(req, 'created_at', ['created_at', 'nombre', 'updated_at'])
    
    const conds: string[] = []
    const vals: unknown[] = []
    if (req.query.foo) {
      conds.push(`col = $${vals.length + 1}`)
      vals.push(req.query.foo)
    }
    
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const { rows } = await pool.query(`SELECT ... ${where} ORDER BY ${opts.sort} ${opts.order} LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
      [...vals, opts.limit, opts.offset]
    )
    const { rows: [count] } = await pool.query(`SELECT COUNT(*) FROM ... ${where}`, vals)
    
    res.json(paginatedResponse(rows, parseInt(count.count), opts))
  } catch (err) {
    next(err)
  }
}
```

Reglas:
1. **Siempre `try/catch`** — pasar errores a `next()` para que el `errorHandler` los maneje
2. **Queries parametrizadas** — `$1`, `$2`, `$N`. Nunca interpolar valores en el string SQL
3. **`parsePagination` para listas** — segundo arg es default sort, tercero es whitelist de columnas válidas
4. **`createError(msg, status)`** para errores con HTTP status custom — el errorHandler lo respeta
5. **`logger.info/warn/error`** en lugar de `console.*` — incluir `requestId: req.id` cuando aplique

#### Transacciones

Usar un client exclusivo del pool, no `pool.query` directo:

```ts
const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query('INSERT ...')
  await client.query('UPDATE ...')
  await client.query('COMMIT')
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  next(err)
} finally {
  client.release()  // siempre liberar
}
```

#### Validación de input

Hoy es manual:
```ts
if (!req.body.email) return next(createError('Email es requerido', 400))
if (typeof req.body.email !== 'string') return next(createError('Email debe ser string', 400))
```

Hay `express-validator` en deps pero su uso es parcial. Para validación más robusta a futuro, considerar Zod (ya está en deps del frontend, podría compartirse).

#### Logging

```ts
logger.info('descripción del evento', { requestId: req.id, contexto: 'datos relevantes' })
logger.warn('algo raro pero no error', { requestId: req.id, ... })
logger.error('error que importa', { requestId: req.id, err })
logger.debug('detalle de troubleshooting', { ... })  // solo se ve en NODE_ENV != production
```

### Frontend

#### Estructura de una página

```tsx
import { useQuery } from '@tanstack/react-query'
import { proyectosService } from '@/services/proyectos'

export default function Proyectos() {
  const { data, isLoading } = useQuery({
    queryKey: ['proyectos', { /* filtros activos */ }],
    queryFn: () => proyectosService.getAll(),
  })
  
  if (isLoading) return <Skeleton />
  
  return (
    <MainLayout>
      <PageHeader title="Proyectos" />
      <Card>...</Card>
    </MainLayout>
  )
}
```

#### Servicios (axios clients)

Un servicio por dominio en `services/`. Ejemplo:

```ts
// services/proyectos.ts
import api from './api'
import type { Proyecto, ApiResponse, PaginationParams } from '@/types'

export const proyectosService = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<Proyecto[]>>('/proyectos', { params }).then(r => r.data),
  
  getById: (id: number) =>
    api.get<ApiResponse<Proyecto>>(`/proyectos/${id}`).then(r => r.data),
  
  create: (data: Partial<Proyecto>) =>
    api.post<ApiResponse<Proyecto>>('/proyectos', data).then(r => r.data),
  
  update: (id: number, data: Partial<Proyecto>) =>
    api.put<ApiResponse<Proyecto>>(`/proyectos/${id}`, data).then(r => r.data),
  
  delete: (id: number) =>
    api.delete(`/proyectos/${id}`).then(r => r.data),
}
```

`api.ts` (instancia base de axios) ya configura:
- baseURL
- Authorization header con el JWT
- Interceptor que en 401 limpia token y redirige a `/login`
- Interceptor que muestra toast con el `error.response.data.message` en errores

#### Mutations con TanStack Query

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

const qc = useQueryClient()
const mutation = useMutation({
  mutationFn: (data) => proyectosService.create(data),
  onSuccess: (res) => {
    toast.success(res.message ?? 'Creado')
    qc.invalidateQueries({ queryKey: ['proyectos'] })
    onClose()
  },
  onError: () => toast.error('Error al crear'),
})

// trigger:
mutation.mutate(data)
// ver loading state:
mutation.isPending
```

#### Forms

React Hook Form + Zod (validación):

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  codigo: z.string().min(1, 'Código requerido'),
  nombre: z.string().min(1, 'Nombre requerido'),
})
type FormData = z.infer<typeof schema>

const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
  resolver: zodResolver(schema),
})

// Reset al abrir modal con valores del recurso:
useEffect(() => { if (open) reset(values) }, [open])
```

#### Estilos (Tailwind)

Clases comunes definidas en `frontend/src/index.css`:

```css
.card     → bg-white rounded-xl border border-gray-200 p-5
.input    → border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-forest-500
.label    → block text-sm font-medium text-gray-700 mb-1
.btn-primary → bg-gold-500 hover:bg-gold-600 text-white px-4 py-2 rounded-lg
.btn-ghost → border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg
```

Paleta corporativa custom en `tailwind.config.js`:
- `gold` (500: `#9B7200`, 400: `#dea832`, 600: `#7d5c00`)
- `forest` (700: `#2c3126`, 600: `#3b4233`, 500: `#4A5240`)

---

## Workflow: agregar una feature nueva

Ejemplo: agregar una nueva entidad simple "Almacenes" con CRUD básico.

### 1. Migración SQL

```sql
-- database/migrations/014_almacenes.sql
CREATE TABLE IF NOT EXISTS almacenes (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(20) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  direccion TEXT,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_almacenes_codigo ON almacenes(codigo);
```

Aplicar local + en producción:
```bash
psql "$DATABASE_URL" -f database/migrations/014_almacenes.sql
```

### 2. Tipo TypeScript compartido

```ts
// frontend/src/types/index.ts
export interface Almacen {
  id: number
  codigo: string
  nombre: string
  direccion: string | null
  activo: boolean
  created_at: string
  updated_at: string
}
```

### 3. Controller backend

```ts
// backend/src/controllers/almacenesController.ts
import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import { createError } from '../middleware/errorHandler'

export async function getAlmacenes(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = parsePagination(req, 'codigo', ['codigo', 'nombre', 'created_at'])
    const { rows } = await pool.query(
      `SELECT * FROM almacenes ORDER BY ${opts.sort} ${opts.order} LIMIT $1 OFFSET $2`,
      [opts.limit, opts.offset]
    )
    const { rows: [c] } = await pool.query(`SELECT COUNT(*) FROM almacenes`)
    res.json(paginatedResponse(rows, parseInt(c.count), opts))
  } catch (err) { next(err) }
}

export async function createAlmacen(req: Request, res: Response, next: NextFunction) {
  try {
    const { codigo, nombre, direccion } = req.body
    if (!codigo || !nombre) return next(createError('codigo y nombre requeridos', 400))
    const { rows } = await pool.query(
      `INSERT INTO almacenes (codigo, nombre, direccion) VALUES ($1, $2, $3) RETURNING *`,
      [codigo, nombre, direccion ?? null]
    )
    res.status(201).json({ data: rows[0], message: 'Almacén creado' })
  } catch (err) { next(err) }
}

// ... getAlmacen, updateAlmacen, deleteAlmacen
```

### 4. Routes

```ts
// backend/src/routes/index.ts (agregar al final del archivo)
import { getAlmacenes, getAlmacen, createAlmacen, updateAlmacen, deleteAlmacen } from '../controllers/almacenesController'

router.get('/almacenes',         getAlmacenes)
router.get('/almacenes/:id',     getAlmacen)
router.post('/almacenes',        WRITE, createAlmacen)
router.put('/almacenes/:id',     WRITE, updateAlmacen)
router.delete('/almacenes/:id',  WRITE, deleteAlmacen)
```

### 5. Service frontend

```ts
// frontend/src/services/almacenes.ts
import api from './api'
import type { Almacen, ApiResponse, PaginationParams } from '@/types'

export const almacenesService = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<Almacen[]>>('/almacenes', { params }).then(r => r.data),
  // ... getById, create, update, delete
}
```

### 6. Página y componentes

Copiar la estructura de `pages/Proveedores.tsx` (es similar) y adaptar.

### 7. Routing

```tsx
// frontend/src/App.tsx
import Almacenes from '@/pages/Almacenes'
// ...
<Route path="/almacenes" element={<Almacenes />} />
```

Y agregar entry en `components/layout/Sidebar.tsx`.

### 8. Documentar

Actualizar [`DATABASE.md`](DATABASE.md) y [`API.md`](API.md) con la nueva tabla y los endpoints.

### 9. Test manual

`npm run dev` → ir a la nueva página, probar CRUD completo.

### 10. Commit + push

```bash
git add .
git commit -m "Agregar módulo de Almacenes (CRUD básico)

[descripción del por qué]

Co-Authored-By: ..."
git push
```

Railway redeploya. Verificar en producción.

---

## Debugging tips

### Backend: ver qué query está corriendo

`pg` no muestra queries por default. Para debug, agregar log temporal en el controller:

```ts
const sql = `SELECT ... ${where} ORDER BY ...`
logger.debug('debug query', { sql, vals })
const { rows } = await pool.query(sql, vals)
```

O para todas las queries del pool:

```ts
// backend/src/db/pool.ts (modificación temporal)
pool.on('connect', (client) => {
  const origQuery = client.query.bind(client)
  client.query = ((...args) => {
    console.log('[query]', args[0])
    return origQuery(...args)
  }) as any
})
```

> Acordate de removerlo antes de commit.

### Backend: replicar bug de prod localmente

1. Conseguir el `requestId` del error (header `X-Request-ID` o de Railway logs)
2. Buscar en Railway logs todos los logs con ese `requestId` para entender el flujo
3. Si necesitás los datos de prod, hacer un dump (ver [OPERATIONS.md](OPERATIONS.md) → Backups) y restaurar local

### Frontend: ver requests en el browser

F12 → Network → filter por `/api/`. Cada request muestra:
- URL, método, status
- Headers (incluido `X-Request-ID` que sirve para correlacionar con backend logs)
- Request body
- Response body

Para errores: el frontend muestra `error.response.data.message` como toast. El detalle completo está en console.

### Frontend: estado de TanStack Query

Instalar [TanStack Query DevTools](https://tanstack.com/query/v5/docs/framework/react/devtools) en dev:

```tsx
// main.tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
// ...
<ReactQueryDevtools initialIsOpen={false} />
```

Muestra el estado de todas las queries en una panel — útil para ver si una query está stale, fetching, o cacheada.

### DB: inspeccionar datos rápido

Conectar con `psql`, pgAdmin o DBeaver al `DATABASE_URL`. Ejemplos útiles:

```sql
-- Ver últimos 10 OCs
SELECT id, numero, estado, total, created_at FROM ordenes_compra ORDER BY id DESC LIMIT 10;

-- Estado del rate limiter
SELECT * FROM rate_limit.records_aggregated;

-- Ver pendientes de cotización
SELECT codigo, descripcion, vendor FROM materiales_mto
WHERE cotizar='SI' AND estado_cotiz='PENDIENTE' AND proyecto_id = 1;

-- Resumen de un proyecto
SELECT
  (SELECT COUNT(*) FROM materiales_mto WHERE proyecto_id=1) AS mats,
  (SELECT COUNT(*) FROM ordenes_compra WHERE proyecto_id=1) AS ocs,
  (SELECT SUM(total) FROM ordenes_compra WHERE proyecto_id=1) AS total_ocs;
```

### Mobile: ver logs del bundle JS

```bash
# Logs en tiempo real
npx expo start --tunnel
# Mostrarse en la terminal donde corre Metro
```

`console.log` desde código del mobile aparece en esa terminal. Para errores con stack trace, sacudí el dispositivo → menú → "Toggle Element Inspector" o "Show Performance Monitor".

---

## Tareas comunes

### Recompilar `frontend/dist/` rápido (sin reiniciar dev server)

```bash
cd frontend && npm run build
```

### Reset completo de la DB local

```bash
psql -h localhost -U postgres -c "DROP DATABASE centralmillwork;"
psql -h localhost -U postgres -c "CREATE DATABASE centralmillwork;"
for f in database/migrations/*.sql; do
  PGPASSWORD=postgres psql -h localhost -U postgres -d centralmillwork -f "$f"
done
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/centralmillwork" \
  npm run db:seed-admin --workspace=backend
```

### Aplicar `npm audit fix`

```bash
npm audit                                     # ver issues
npm audit fix                                 # fixes no-breaking
npm audit fix --workspace=backend             # solo en un workspace
```

Cuando hay breaking changes (require `--force`), revisar uno por uno y testear antes de commitear.

### Cambiar la versión de Node

`package.json` declara `engines.node: ">=20.0.0"`. Para upgrades:
1. Cambiar `engines.node`
2. Si es local: usar nvm para switch (`nvm use 22`)
3. Reinstalar deps por las dudas: `rm -rf node_modules && npm install`
4. Test exhaustivo
5. Push → Railway usa la versión declarada en engines

### Agregar una nueva dependencia

```bash
npm install --workspace=backend nombre-paquete
# o
npm install --workspace=frontend nombre-paquete
```

`--workspace=backend` es importante en monorepo — sino npm la pone en el root `node_modules` y no la encuentra el workspace.

---

## Convenciones de commits

Mensaje en español, una línea (≤70 chars), imperativa.

Cuerpo opcional explicando el "por qué" (no el "qué", que ya está en el diff).

Para cambios destacados:

```
Cerrar SQL injection en consultas de OCs, Recepciones y paginación

Las funciones getOrdenesCompra, getOrdenesCompraKpis,
getOrdenesCompraImportDates y getRecepciones interpolaban
req.query.* directamente en strings SQL. parsePagination interpolaba
req.query.sort sin validación. Todo migrado a placeholders $N
parametrizados + whitelist de columnas para sort.

Co-Authored-By: ...
```

Tipos comunes (sin Conventional Commits estricto):
- "Agregar X" — nueva feature
- "Cerrar / Fixear / Arreglar X" — bug fix
- "Mejorar X" — mejora incremental
- "Endurecer X" — hardening de seguridad
- "Refactor X" — cambio interno sin behavior change
- "Eliminar X" — remoción

---

## Pendientes para mejorar el dev workflow

- **Tests automatizados**: hoy no hay. Considerar Vitest para backend y frontend, Detox para mobile.
- **CI con type-check + tests**: GitHub Actions que corra en cada push y bloquee merges con errores.
- **Linter formal**: ESLint con config compartido entre frontend/backend.
- **Pre-commit hooks**: Husky + lint-staged para forzar type-check antes de commitear.
- **Generador de tipos desde el schema** (kysely-codegen, ts-postgres-types): evitaría mantener interfaces a mano.
- **Commitlint**: enforce mensajes de commit estructurados.
- **Storybook** para los componentes UI del frontend (si crece la complejidad).
