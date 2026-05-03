# Arquitectura — Central Millwork

Vista de alto nivel del sistema: componentes, stack técnico, flujos de datos, deployment.

---

## TL;DR

Sistema interno de procurement (compras de materiales para proyectos de carpintería). Tres componentes corren contra una misma base de datos:

- **Web SPA** (React) — consumida por procurement, project management, contabilidad
- **Backend API** (Node/Express) — única fuente de verdad para mutaciones
- **App móvil** (Expo/React Native) — usada por personal en campo para registrar recepciones de OCs

Todo deployado en Railway, Postgres en Railway, imágenes en Supabase Storage.

---

## Diagrama de componentes

```
   Usuarios web                              Usuarios mobile
        │                                          │
        ▼                                          ▼
  ┌──────────┐                              ┌─────────────┐
  │ Browser  │                              │ Expo Go /   │
  │  (Chrome,│                              │ EAS Build   │
  │  Edge)   │                              │ (iOS/Android)│
  └─────┬────┘                              └──────┬──────┘
        │ HTTPS                                    │ HTTPS
        │                                          │
        ▼                                          │
  ┌────────────────────────┐                       │
  │ centralmillwork-       │                       │
  │ frontend service       │                       │
  │ (Railway)              │                       │
  │                        │                       │
  │ - React SPA estático   │                       │
  │   (vite build)         │                       │
  │ - Express runtime      │                       │
  │   también levantado    │                       │
  │   pero el SPA pega API │                       │
  │   al backend service   │                       │
  └────────┬───────────────┘                       │
           │ VITE_BACKEND_URL                      │
           │ (compilado en bundle)                 │
           ▼                                       ▼
        ┌─────────────────────────────────────────────┐
        │ centralmillwork-backend service (Railway)   │
        │                                             │
        │ Express 4 + Node 22                         │
        │ ├ /health            (público)              │
        │ ├ /api/auth/*        (login público,        │
        │ │                     resto auth)           │
        │ ├ /api/*             (todas auth + JWT)     │
        │ │   ├─ rate limit global (200/min)          │
        │ │   ├─ rate limit login (5/15min)           │
        │ │   ├─ requestId middleware                 │
        │ │   └─ controllers                          │
        │ └ /uploads/*         (archivos legacy)      │
        └────┬─────────────────────────┬──────────────┘
             │ pg pool                 │ supabase-js
             │ (CRUD)                  │ (uploads)
             ▼                         ▼
  ┌─────────────────────┐    ┌──────────────────────┐
  │ Postgres (Railway)  │    │ Supabase Storage     │
  │                     │    │                      │
  │ - Schema public:    │    │ Bucket: oc-imagenes  │
  │   13 tablas de      │    │ (imágenes públicas)  │
  │   negocio           │    │                      │
  │ - Schema rate_limit:│    └──────────────────────┘
  │   tablas auto-      │
  │   administradas     │
  │   (@acpr lib)       │
  └─────────────────────┘
```

> **Nota arquitectónica**: hay dos servicios Railway corriendo el mismo código del backend (`frontend` y `backend`). El SPA del navegador llama al `backend` directamente vía `VITE_BACKEND_URL`. El servicio `frontend` solo cumple el rol de servir los estáticos del React build. Es ineficiente y hay un plan para consolidar — ver [STATE.md](../STATE.md) y [OPERATIONS.md](OPERATIONS.md) (pendiente).

---

## Stack técnico

### Web (`frontend/`)

| Capa | Lib | Versión |
|---|---|---|
| Framework UI | React | 18.3 |
| Lenguaje | TypeScript | 5.6 |
| Build / dev server | Vite | 5.4 |
| Routing | React Router DOM | 6.26 |
| Server state | TanStack Query | 5.56 |
| Forms | React Hook Form | 7.53 |
| Validación | Zod | 3.23 |
| HTTP | Axios | 1.7 |
| Estilos | Tailwind CSS | 3.4 |
| Charts | Recharts | 2.12 |
| Iconos | Lucide React | 0.447 |
| Toasts | react-hot-toast | 2.4 |
| Classnames | clsx | 2.1 |
| PDF (cliente) | jsPDF + jspdf-autotable | 4.x / 5.x |

Path alias: `@/` → `frontend/src/`

### Backend (`backend/`)

| Capa | Lib | Versión |
|---|---|---|
| Runtime | Node | ≥20 (engines), prod corre 22 |
| Framework | Express | 4.21 |
| Lenguaje | TypeScript | 5.6 |
| ORM/DB | `pg` (node-postgres pool) | 8.13 |
| Auth | jsonwebtoken | 9.0 |
| Hash | bcryptjs | 2.4 |
| Uploads | multer | 2.1 |
| Storage | @supabase/supabase-js | 2.105 |
| Excel parsing | xlsx | 0.18 |
| Rate limiting | express-rate-limit | 8.4 |
| Rate-limit store | @acpr/rate-limit-postgresql | 1.4 |
| Logs | winston | 3.15 |
| CORS | cors | 2.8 |
| Env | dotenv | 16.4 |
| Validación | express-validator | 7.2 (instalado, uso parcial) |
| Dev | nodemon + ts-node | — |

### Mobile (`mobile/`)

| Capa | Lib | Versión |
|---|---|---|
| Runtime | Expo | SDK 54 |
| Framework | React Native | 0.81 |
| Lenguaje | TypeScript | 5.9 |
| Navegación | @react-navigation/native + native-stack | 7.x |
| Server state | TanStack Query | 5.100 |
| HTTP | Axios | 1.15 |
| Cámara/imágenes | expo-image-picker | 17.0 |
| Almacenamiento seguro | expo-secure-store | 15.0 |
| File system | expo-file-system | 19.0 |
| Updates | expo-updates | 29.0 |

### Infraestructura

| Componente | Provider |
|---|---|
| Compute (web + backend) | **Railway** (2 servicios) |
| Postgres | **Railway Postgres** |
| Storage de imágenes | **Supabase Storage** (bucket público `oc-imagenes`) |
| Source control | **GitHub** (`chaliherrera/centralmillwork-app`) |
| CDN/edge | Fastly (vía Railway) |
| Auto-deploy | Push a `main` → build + deploy automático en Railway |

---

## Estructura del repo

```
centralmillwork-app/
├── package.json          # workspace raíz (npm workspaces frontend + backend)
├── railway.json          # config de build/deploy en Railway
├── CLAUDE.md             # contexto operativo para asistentes
├── STATE.md              # snapshot del proyecto
├── docs/                 # documentación profesional (este folder)
│   ├── ARCHITECTURE.md   # este archivo
│   ├── DATABASE.md
│   ├── API.md
│   ├── OPERATIONS.md     # (pendiente)
│   ├── SECURITY.md       # (pendiente)
│   ├── DEVELOPMENT.md    # (pendiente)
│   └── MOBILE.md         # (pendiente)
├── database/
│   └── migrations/       # 14 .sql, aplicar en orden (001 a 013)
├── backend/
│   ├── package.json
│   ├── .env.example
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                    # entry point: Express setup
│       ├── routes/
│       │   ├── index.ts                # todas las rutas /api/*
│       │   └── auth.ts                 # /api/auth/*
│       ├── middleware/
│       │   ├── auth.ts                 # authenticate + requireRole
│       │   ├── errorHandler.ts         # 500 / 404 / createError
│       │   ├── rateLimit.ts            # global + login limiters
│       │   └── requestId.ts            # UUID por request
│       ├── controllers/                # lógica por dominio
│       │   ├── authController.ts
│       │   ├── usuariosController.ts
│       │   ├── dashboardController.ts
│       │   ├── proyectosController.ts
│       │   ├── proveedoresController.ts
│       │   ├── materialesController.ts
│       │   ├── ordenesCompraController.ts
│       │   ├── recepcionesController.ts
│       │   ├── imagenesController.ts
│       │   ├── cotizacionesController.ts
│       │   └── reportesController.ts
│       ├── db/
│       │   ├── pool.ts                 # PG pool config
│       │   ├── migrate.ts              # runner de migraciones (CLI)
│       │   ├── seed.ts                 # seed inicial (CLI)
│       │   └── seedAdmin.ts            # crea user admin (CLI)
│       └── utils/
│           ├── pagination.ts           # parsePagination + paginatedResponse
│           ├── logger.ts               # winston instance
│           └── supabase.ts             # supabase-js client
├── frontend/
│   ├── package.json
│   ├── vite.config.ts                  # incluye proxy /api en dev
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── public/
│   │   ├── logo_cm.jpg
│   │   ├── logo_cm_login.png
│   │   └── logo_cm_sidebar.png
│   └── src/
│       ├── App.tsx                     # routing
│       ├── main.tsx                    # entry React
│       ├── types/index.ts              # tipos compartidos
│       ├── context/AuthContext.tsx     # auth state + token storage
│       ├── services/                   # axios clients por dominio
│       │   ├── api.ts                  # instancia base + interceptors
│       │   ├── proyectos.ts
│       │   ├── proveedores.ts
│       │   ├── materiales.ts
│       │   ├── ordenesCompra.ts
│       │   ├── recepciones.ts
│       │   ├── cotizaciones.ts
│       │   └── dashboard.ts
│       ├── pages/                      # 1 por ruta principal
│       │   ├── Dashboard.tsx
│       │   ├── Proyectos.tsx
│       │   ├── Materiales.tsx
│       │   ├── OrdenesCompra.tsx
│       │   ├── Recepciones.tsx
│       │   ├── Proveedores.tsx
│       │   └── Login.tsx
│       ├── components/
│       │   ├── layout/                 # MainLayout, Sidebar, Header
│       │   ├── ui/                     # Modal, StatCard, etc.
│       │   └── modules/                # componentes específicos por dominio
│       │       ├── materiales/         # MaterialForm, CapturaPrecios, EnviarCotizacionesModal, ...
│       │       ├── ordenes_compra/     # OrdenCompraForm, ...
│       │       └── ...
│       └── utils/
│           └── cotizacionPdf.ts        # generación de PDF cliente
└── mobile/
    ├── package.json
    ├── app.json                        # config Expo
    ├── App.tsx
    ├── index.ts
    ├── assets/                         # icons + splash
    └── src/
        ├── context/
        │   └── AuthContext.tsx
        ├── services/                   # axios clients (subset del web)
        │   ├── api.ts
        │   ├── ordenesCompra.ts
        │   ├── recepciones.ts
        │   └── imagenes.ts
        ├── components/
        │   └── EtaBadge.tsx
        ├── screens/
        │   ├── LoginScreen.tsx
        │   ├── HomeScreen.tsx
        │   ├── OCsListScreen.tsx
        │   └── OCDetailScreen.tsx
        └── types/
            └── index.ts
```

---

## Flujos de datos críticos

### 1. Login

```
Browser → POST /api/auth/login (email + password)
  Backend
    ├ rate limiter login (5/15min) ─── (si > 5 fallidos) → 429
    ├ SELECT usuarios WHERE email
    ├ bcrypt.compare(password, hash) ── (si no match) → 401
    ├ jwt.sign({id, email, rol}, JWT_SECRET, expiresIn=8h)
    └ return { token, user }
  Browser
    ├ localStorage.setItem('cm_token', token)
    └ redirect a /
```

### 2. Request autenticado típico

```
Browser → GET /api/proyectos (Header: Authorization: Bearer <jwt>)
  Backend
    ├ requestId middleware → req.id = uuid
    ├ globalLimiter → check 200/min para este IP
    ├ authenticate → jwt.verify(token, JWT_SECRET)
    │   └ req.user = {id, email, rol}
    ├ controller getProyectos
    │   ├ parsePagination (whitelist sort columns)
    │   ├ pool.query con $1, $2 parametrizado
    │   └ paginatedResponse({data, total, page, limit})
    └ res.json + Header X-Request-ID
```

### 3. Importación de Excel de materiales

```
Browser → POST /api/materiales/importar (multipart/form-data: archivo, proyecto_id)
  Backend
    ├ rate limiter global
    ├ authenticate + requireRole(WRITE)
    ├ multer.uploadExcel.single('archivo')
    │   ├ fileFilter: extensión + mimetype xlsx/xls/csv ── (si no) → 400
    │   ├ limits.fileSize: 20 MB
    │   └ guarda buffer en req.file
    ├ controller importarMateriales
    │   ├ XLSX.read(req.file.buffer)
    │   ├ detectar header row (heurística)
    │   ├ map columnas → fields
    │   ├ insert/update materiales (con fecha_importacion = today)
    │   └ logger.debug con preview de las primeras 3 filas
    └ res.json({data: {inserted, updated, ...}})
```

### 4. Generar cotizaciones (flujo nuevo, sin SMTP)

```
Browser
  Modal: usuario selecciona vendors
  ├ Click "Generar PDF" (por cada vendor)
  │   ├ jsPDF + autoTable construye doc en el browser
  │   │   ├ logo, datos proyecto, vendor, tabla materiales
  │   │   └ columna Unit Price vacía (para que el proveedor llene)
  │   └ doc.save('Cotizacion_PROYECTO_VENDOR.pdf')  ── descarga local
  │
  ├ Usuario adjunta el PDF a un email manualmente y lo envía
  │
  └ Click "Marcar como enviada"
      → POST /api/cotizaciones/enviar { proyecto_id, vendors: [{ vendor }, ...] }
        Backend
          ├ valida + dedup
          ├ por cada vendor:
          │   ├ SELECT materiales del lote
          │   ├ INSERT solicitudes_cotizacion (estado='enviada', folio COT-YYYY-NNNN)
          │   └ snapshot de materiales en jsonb
          └ res.json({data: [{vendor, folio, materiales_count}], message})
```

### 5. Recepción desde mobile

```
Mobile (OCDetailScreen)
  Carga inicial paralela:
    ├ GET /api/ordenes-compra/:id/materiales-lote
    └ GET /api/recepciones/historial?orden_compra_id=:id
  
  Compute receivedIds (IDs de materiales ya recibidos en parciales previas)
  
  Usuario marca materiales recibidos + nota + foto
  Selecciona TOTAL/PARCIAL
  
  Click "Registrar recepción"
    → POST /api/recepciones/completa {
        orden_compra_id, tipo, fecha_recepcion,
        recibio: user.nombre,  ← del JWT
        notas,
        materiales: [{ id_material, recibido, nota }, ...]  ← filtra ya-recibidos
      }
      Backend
        ├ INSERT recepciones (folio REC-YYYY-NNNN, estado=completa|con_diferencias)
        ├ INSERT recepcion_materiales (1 por material)
        ├ UPDATE ordenes_compra SET estado='recibida'|'en_transito'
        └ Si recibida, fecha_entrega_real = CURRENT_DATE
    
  Por cada foto local:
    → POST /api/ordenes-compra/:id/imagenes (multipart, tipo='recepcion')
      Backend
        ├ multer fileFilter (jpeg/png/webp/heic, max 10 MB)
        ├ supabase.storage.upload(bucket, file)
        └ INSERT oc_imagenes (filename, original_name, tipo)
```

---

## Modelo de deployment (Railway)

### Build pipeline

`railway.json`:
```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install --include=dev && npm run build"
  },
  "deploy": {
    "startCommand": "node backend/dist/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

`npm run build` desde la raíz hace:
1. `npm run build --workspace=frontend` → `frontend/dist/` (estáticos del SPA)
2. `npm run build --workspace=backend` → `backend/dist/` (TypeScript compilado a JS)

`startCommand` corre el backend, que:
- Sirve `/health` (público)
- Sirve `/api/auth/*` (login público) y `/api/*` (auth JWT)
- En `NODE_ENV=production`: sirve `frontend/dist/` como estáticos + `app.get('*')` para el SPA fallback

### Servicios actuales

| Servicio | URL pública | Rol funcional |
|---|---|---|
| `centralmillwork-frontend` | `centralmillwork-frontend-production.up.railway.app` | Sirve el SPA al usuario. (También corre el backend code internamente pero no se usa) |
| `centralmillwork-backend` | `centralmillwork-backend-production.up.railway.app` | Maneja todas las API requests del SPA y del mobile |
| `Postgres` | (interno) | Storage |

El SPA del web tiene `VITE_BACKEND_URL` baked-in apuntando a la URL del `centralmillwork-backend`. Sin esa variable, el SPA pegaría a su mismo origen (frontend service), que técnicamente también tiene el backend code pero sin DATABASE_URL configurado → 500.

Esta dualidad es histórica y propensa a errores (vimos un caso donde el frontend service quedó sin `NODE_ENV=production` y `CORS_ORIGIN` y el sitio dejó de funcionar). Hay propuesta de consolidar — ver [STATE.md](../STATE.md).

### Auto-deploy

Push a `main` en GitHub → Railway detecta cambio → para cada servicio:
1. `npm install --include=dev && npm run build`
2. `node backend/dist/index.js`
3. Health check en `/health`
4. Cuando responde 200, switchea tráfico de la versión vieja a la nueva (rolling deploy con breve overlap)

Tiempo total típico: 1-3 min.

### Variables de entorno

Cada servicio tiene su set de env vars en Railway → Variables. Críticas:

**Backend service**:
- `NODE_ENV=production`
- `JWT_SECRET=<random 48 bytes>`
- `JWT_EXPIRES_IN=8h`
- `DATABASE_URL` (Railway lo inyecta automáticamente al vincular Postgres)
- `CORS_ORIGIN=https://centralmillwork-frontend-production.up.railway.app`
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET=oc-imagenes`

**Frontend service** (mismas que backend, las usa para cuando alguien pega directo al frontend service URL):
- `NODE_ENV=production`
- `CORS_ORIGIN=...`
- (Otros opcionales, históricos)

Lista completa: ver [OPERATIONS.md](OPERATIONS.md) (pendiente).

---

## Modelo de seguridad (resumen)

Detalle completo en [SECURITY.md](SECURITY.md) (pendiente). Resumen:

| Capa | Implementación |
|---|---|
| Transport | HTTPS forzado por Railway edge |
| Auth | JWT HS256, expiración 8h, no revocable (stateless) |
| Authz | `requireRole` middleware en endpoints sensibles |
| SQL injection | Queries parametrizadas + whitelist de columnas para ORDER BY |
| Rate limiting | Global 200/min, login 5/15min (Postgres-backed para multi-replica) |
| CORS | Origin restringido a la URL del SPA |
| Upload validation | Mimetype + extensión + size limits |
| Logs | winston con `requestId` para tracing |

---

## Observabilidad

- **Logs**: stdout/stderr capturados por Railway dashboard → cada servicio → Logs. Formato JSON en producción (filtrable). Cada log de request incluye `requestId` que matchea el header `X-Request-ID` de la response.
- **Health check**: `GET /health` (público, sin DB). Railway lo usa para gate de rolling deploys.
- **Métricas**: Railway dashboard muestra CPU, memoria, network out-of-the-box. Sin APM custom.
- **Error tracking**: hoy NO hay Sentry/Bugsnag/etc. Errores 500 se loguean con `logger.error` y se ven en los logs de Railway. Pendiente para considerar si la app crece.

---

## Decisiones arquitectónicas notables

### Por qué Railway en vez de Vercel/Heroku/AWS

Simplicidad operativa: un solo dashboard para servicios + DB, deploy automático con push, costo predecible. Trade-off: lock-in moderado (la config de `DATABASE_URL` etc. es Railway-específica), menor flexibilidad que AWS.

### Por qué Postgres y no algo serverless (Supabase, Neon, PlanetScale)

Postgres administrado por Railway viene en el mismo proyecto y simplifica networking (sin auth cross-cloud). Trade-off: backups dependen de Railway, escalado vertical solamente.

### Por qué Supabase Storage solo para imágenes (no migración completa a Supabase)

Migración progresiva: las imágenes (binarios grandes) se beneficiaron de un blob store; el resto del dato (relacional) seguía siendo más eficiente en Postgres clásico. Costo + complejidad de migrar todo a Supabase no se justifica hoy.

### Por qué dos services en Railway (frontend + backend) corriendo el mismo código

Decisión histórica que no se justifica funcionalmente. El plan es consolidar en un solo service. Mientras tanto, hay drift potencial entre env vars que ya nos mordió una vez (post-deploy del rate limit).

### Por qué JWT y no sessions con cookies

Compatibilidad con el mobile (no maneja cookies fácilmente con cross-origin). Trade-off: tokens no son revocables (mitigación: expiración corta de 8h).

### Por qué generar PDFs en cliente (jsPDF) y no en server

Solucionado a cambio de quitar la dependencia frágil de SMTP/Outlook (Microsoft está deprecando Basic SMTP Auth y CM no tiene admin de IT). El cliente genera el PDF y el usuario lo manda manualmente. Trade-off: el formato del PDF depende del browser; sin server-side rendering significa que no hay "log central" del PDF generado.

---

## Pendientes arquitectónicos

- **Consolidar a un solo Railway service** (eliminar la dualidad frontend/backend que ejecuta el mismo código)
- **Centralizar tipos compartidos** entre frontend y backend (hoy hay duplicación en `types/`)
- **Error tracking** (Sentry o similar) para no depender de Railway logs como única fuente
- **CI/CD con tests** (hoy no hay tests automatizados; el deploy confía en type-check y validación manual)
- **APM / métricas custom** si la base de usuarios crece
- **Tabla compartida de tipos generados** del DB (ej. con `kysely-codegen` o similar) para evitar mantener interfaces a mano
