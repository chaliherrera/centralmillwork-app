# API — Central Millwork

Documentación de la API REST. Verificada contra el código en `backend/src/routes/index.ts` y `backend/src/routes/auth.ts` al 2026-05-03.

---

## Convenciones generales

### Base URL
- **Producción**: `https://centralmillwork-backend-production.up.railway.app`
- **Local**: `http://localhost:4000`

### Autenticación

JWT (Bearer token). Header `Authorization: Bearer <token>` en todas las rutas excepto `/health`, `/api/auth/login`.

El token se obtiene via `POST /api/auth/login` y expira en **8h** (config `JWT_EXPIRES_IN`).

### Roles

| Rol | Permisos típicos |
|---|---|
| `ADMIN` | Todo, incluido CRUD de usuarios |
| `PROCUREMENT` | CRUD de proyectos / proveedores / materiales / OCs / cotizaciones / recepciones |
| `PRODUCTION` | Operaciones de recepción + subir/borrar imágenes de OC |
| `PROJECT_MANAGEMENT` | Lectura completa, sin escritura |
| `CONTABILIDAD` | Lectura completa, sin escritura |

Aliases en el router:
- `WRITE` = `ADMIN | PROCUREMENT`
- `REC_WRITE` = `ADMIN | PROCUREMENT | PRODUCTION`

Si no se especifica role en el endpoint, basta con estar autenticado (cualquier rol).

### Formato de respuesta

**Éxito**:
```json
{ "data": <payload>, "message"?: "<opcional>" }
```

**Listas paginadas**:
```json
{ "data": [...], "total": <int>, "page": <int>, "limit": <int> }
```

**Error**:
```json
{ "message": "<texto del error>" }
```

### Códigos HTTP comunes

| Código | Cuándo |
|---|---|
| `200 OK` | Éxito |
| `201 Created` | POST exitoso de creación |
| `400 Bad Request` | Validación (campos faltantes, tipo inválido, archivo mime no permitido) |
| `401 Unauthorized` | Token faltante / inválido / expirado, o credenciales incorrectas |
| `403 Forbidden` | Token válido pero rol insuficiente |
| `404 Not Found` | Recurso inexistente |
| `409 Conflict` | Operación bloqueada por estado (ej. borrar OC `recibida`) |
| `429 Too Many Requests` | Rate limit alcanzado |
| `500 Internal Server Error` | Error inesperado (loguea con `requestId` para trazar) |

### Headers especiales

| Header | Tipo | Descripción |
|---|---|---|
| `Authorization: Bearer <jwt>` | request | Auth |
| `X-Request-ID: <uuid>` | request (opcional) | Si se pasa, se respeta como ID para tracing. Sino se genera uno |
| `X-Request-ID: <uuid>` | response | Siempre presente. Usar para grep en logs de Railway |
| `RateLimit-*` | response | Estado del rate limit (limit, remaining, reset) |

### Paginación y filtros (común en endpoints de lista)

| Query param | Tipo | Default |
|---|---|---|
| `page` | int | 1 |
| `limit` | int | 20 (max 100) |
| `search` | string | — (búsqueda parcial en columnas relevantes según endpoint) |
| `sort` | string | varía por endpoint (debe estar en whitelist o se ignora) |
| `order` | `asc \| desc` | `desc` |

---

## Health check (público)

### `GET /health`

No requiere auth. Útil para Railway health checks y para verificar que el servicio está vivo.

**Response 200**:
```json
{ "status": "ok", "timestamp": "2026-05-03T06:00:00.000Z" }
```

---

## Auth (`/api/auth`)

### `POST /api/auth/login`

Login con email + password. Devuelve JWT para usar en requests subsiguientes.

**Body**:
```json
{ "email": "user@example.com", "password": "..." }
```

**Response 200**:
```json
{
  "token": "eyJhbGc...",
  "user": { "id": "uuid", "nombre": "...", "email": "...", "rol": "ADMIN", "activo": true, ... }
}
```

**Errors**: `400` (campos faltantes), `401` (credenciales inválidas o user inactivo), `429` (5 intentos fallidos en 15 min).

### `GET /api/auth/me`

Devuelve datos del user del token actual. Auth requerida.

**Response 200**:
```json
{ "data": { "id": "uuid", "nombre": "...", "email": "...", "rol": "...", "activo": true, "created_at": "...", "updated_at": "..." } }
```

**Errors**: `401` (token inválido), `404` (user no encontrado en DB).

### `POST /api/auth/logout`

Auth requerida. Operación cosmética — el JWT no se invalida en el server (es stateless). El frontend borra el token de localStorage.

**Response 200**: `{ "message": "Sesión cerrada" }`

---

## Usuarios (`/api/usuarios`) — ADMIN only

### `GET /api/usuarios`

Lista paginada de usuarios.

**Query**: `page`, `limit`, `search` (busca en nombre/email)

**Response**: lista paginada de objetos user (sin `password_hash`).

### `POST /api/usuarios`

Crear nuevo usuario. La password se hashea con bcrypt antes de guardar.

**Body**:
```json
{ "nombre": "...", "email": "...", "password": "...", "rol": "PROCUREMENT" }
```

**Errors**: `400` (validación), `409` (email duplicado).

### `PUT /api/usuarios/:id`

Actualizar usuario (cualquier subset de campos). Si se incluye `password`, se rehashea.

---

## Dashboard (`/api/dashboard`) — auth requerida (cualquier rol)

Todos los endpoints son `GET`. Soportan filtros opcionales que aplican a las queries de materiales:
- `fecha_desde`, `fecha_hasta` (sobre `materiales_mto.fecha_importacion`)
- `proyecto_estado` (filtra por estado del proyecto)
- `vendor`, `categoria`

### `GET /api/dashboard/stats`

KPIs legacy — 4 contadores básicos (proyectos, OCs, materiales, etc.).

### `GET /api/dashboard/gasto-por-mes`

Serie temporal del gasto en OCs últimos 12 meses para chart de barras.

### `GET /api/dashboard/kpis`

8 KPIs principales del header del dashboard (proyectos activos, monto total OCs, monto recibido, OCs completadas, en proceso, retrasadas, etc.).

### `GET /api/dashboard/charts`

Datos para los 5 charts del dashboard (proyectos por estado, resumen económico, índice de cumplimiento, top vendors, top categorías).

### `GET /api/dashboard/resumen-estados`

Tabla agrupada por `estado_cotiz` de materiales (cantidad y monto).

### `GET /api/dashboard/proyectos-recientes`

Proyectos paginados con stats de OCs y monto. **Nota**: no acepta los filtros de materiales — devuelve siempre stats globales por proyecto.

---

## Proyectos (`/api/proyectos`)

| Endpoint | Auth | Descripción |
|---|---|---|
| `GET /api/proyectos` | cualquiera | Lista paginada. Query: `search`, `estado`, paginación |
| `GET /api/proyectos/:id` | cualquiera | Detalle |
| `POST /api/proyectos` | WRITE | Crear |
| `PUT /api/proyectos/:id` | WRITE | Actualizar (parcial) |
| `DELETE /api/proyectos/:id` | WRITE | Borrar (CASCADE limpia materiales y mto_freight; RESTRICT por OCs/cotizaciones) |

**Body para create / update** (campos requeridos para create: `codigo`, `nombre`, `cliente`):
```json
{ "codigo": "PRY-2026-001", "nombre": "...", "cliente": "...", "descripcion": "...", "estado": "activo", "fecha_inicio": "2026-01-01", "fecha_fin_estimada": "2026-12-31", "presupuesto": 100000, "responsable": "..." }
```

---

## Proveedores (`/api/proveedores`)

| Endpoint | Auth | Descripción |
|---|---|---|
| `GET /api/proveedores` | cualquiera | Lista paginada. Query: `search`, paginación |
| `GET /api/proveedores/:id` | cualquiera | Detalle |
| `POST /api/proveedores` | WRITE | Crear |
| `PUT /api/proveedores/:id` | WRITE | Actualizar |
| `DELETE /api/proveedores/:id` | WRITE | Borrar (RESTRICT por OCs/cotizaciones) |

**Body**:
```json
{ "nombre": "...", "contacto": "...", "email": "...", "telefono": "...", "rfc": "...", "direccion": "...", "activo": true }
```

---

## Materiales MTO (`/api/materiales`)

### `GET /api/materiales`

Lista paginada de materiales con filtros.

**Query params específicos**:
| Param | Tipo | Efecto |
|---|---|---|
| `proyecto_id` | int | Filtrar por proyecto |
| `vendor` | string | Filtrar por nombre de vendor (texto exacto) |
| `cotizar` | `SI \| NO \| EN_STOCK` | Filtrar por flag |
| `estado_cotiz` | `COTIZADO \| PENDIENTE \| EN_STOCK` | Filtrar por estado |
| `search` | string | Busca en descripción/codigo/vendor |
| `fecha_importacion` | date | Filtrar por batch de import |

### `GET /api/materiales/kpis`

4 contadores para el header de la página Materiales (total, pendientes, cotizados, en stock).

### `GET /api/materiales/import-dates`

Lista de fechas de import únicas (para dropdown de batch).

**Query**: `proyecto_id` (opcional)

### `GET /api/materiales/freight`

Devuelve los freight guardados para un (proyecto_id, vendor).

**Query**: `proyecto_id`, `vendor`

### `GET /api/materiales/:id`

Detalle de un material.

### `GET /api/materiales/:id/oc-info`

Lista de OCs en las que aparece este material (vía `items_orden_compra`).

### `POST /api/materiales` — WRITE

Crear material individual (uso raro, normalmente se importan en batch).

### `POST /api/materiales/importar` — WRITE

Importa materiales desde Excel/CSV en batch. Multipart/form-data con campo `archivo`.

**Constraints**: tipo permitido `xlsx/xls/csv`, max 20 MB.

**Body (form-data)**: `archivo` (file), `proyecto_id` (int)

### `PATCH /api/materiales/precios-lote` — WRITE

Update batch de precios + freight desde el panel "Capturar Precios". Atómico (transaction).

**Body**:
```json
{
  "proyecto_id": 1,
  "vendor": "RUGBY",
  "freight": 50.00,
  "materiales": [
    { "id": 123, "unit_price": 25.5, "total_price": 51.0 },
    ...
  ]
}
```

Setea `estado_cotiz='COTIZADO'` en los materiales actualizados y hace upsert en `mto_freight`.

### `PUT /api/materiales/:id` — WRITE

Update parcial. Acepta cualquier subset de campos. Si se cambia `cotizar` a `EN_STOCK`, también setea `estado_cotiz='EN_STOCK'` automáticamente (lógica en el controller).

### `DELETE /api/materiales/:id` — WRITE

Borrar material. RESTRICT si está referenciado en `items_orden_compra`.

---

## Órdenes de Compra (`/api/ordenes-compra`)

### `GET /api/ordenes-compra`

Lista paginada con filtros.

**Query**:
| Param | Efecto |
|---|---|
| `proyecto_id` | int |
| `proveedor_id` | int |
| `vendor` | string (ILIKE) |
| `categoria` | string |
| `fecha_mto`, `fecha_mto_desde`, `fecha_mto_hasta` | date |
| `estado_display` | `ORDENADO \| EN_TRANSITO \| EN_EL_TALLER \| CANCELADA` (filtro por estado virtualizado) |
| `search` | string (numero, proyecto.nombre, proveedor.nombre) |
| `sort` | columnas válidas (whitelist): `o.fecha_emision`, `o.fecha_entrega_estimada`, `o.fecha_mto`, `o.numero`, `o.total`, `o.estado`, `o.created_at` |

**Response**: paginada. Cada OC incluye `proyecto`, `proveedor`, `estado_display`, flags virtuales (`flag_vencida`, `flag_retraso`, `flag_2dias`).

### `GET /api/ordenes-compra/kpis`

KPIs de la página OCs (total, pendientes_recepcion, monto_ordenado, monto_en_taller, con_retraso).

**Query**: `proyecto_id` (opcional)

### `GET /api/ordenes-compra/import-dates`

Fechas de `fecha_mto` distintas para dropdown.

### `GET /api/ordenes-compra/vendors-cotizados`

Por cada vendor del proyecto, devuelve cuántos materiales tiene COTIZADOS y el monto total. Usado en el modal "Generar OCs".

**Query**: `proyecto_id` (requerido)

### `POST /api/ordenes-compra/generar` — WRITE

Genera OCs en batch para los vendors cotizados de un proyecto. Atómico — todo o nada.

**Body**:
```json
{
  "proyecto_id": 1,
  "vendors": [
    { "vendor": "RUGBY", "fecha_entrega_estimada": "2026-06-15" },
    ...
  ]
}
```

Auto-crea proveedores si el vendor no matchea con ninguno existente. Numera OCs secuencialmente (`OC-YYYY-NNNN`).

### `GET /api/ordenes-compra/:id`

Detalle de OC con sus items.

### `GET /api/ordenes-compra/:id/materiales-lote`

Trae los materiales del "lote" de la OC — usa una lógica de slicing por `fecha_importacion` y `vendor` para identificar qué materiales pertenecen al batch que originó esa OC. Si no hay batch detectable, fallback a los items de `items_orden_compra`.

### `GET /api/ordenes-compra/:id/imagenes`

Lista de imágenes asociadas a la OC. Cada item incluye `url` (link público de Supabase Storage).

### `POST /api/ordenes-compra/:id/imagenes` — REC_WRITE

Subir imagen. Multipart/form-data.

**Body (form-data)**:
- `imagen` (file): jpeg/png/webp/gif/heic/pdf, max 10 MB
- `tipo` (string): `delivery_ticket`, `material_recibido`, `recepcion`, etc.

**Errors**: `400` (extensión o mimetype no permitidos, archivo muy grande).

### `DELETE /api/imagenes/:imagenId` — REC_WRITE

Borrar imagen. Limpia tanto el registro en `oc_imagenes` como el archivo en Supabase Storage.

### `POST /api/ordenes-compra` — WRITE

Crear OC manualmente.

**Body**:
```json
{
  "proyecto_id": 1, "proveedor_id": 1,
  "estado": "borrador",
  "fecha_emision": "2026-05-01",
  "fecha_entrega_estimada": "2026-05-15",
  "fecha_mto": "2026-04-30",
  "categoria": "MILLWORK",
  "notas": "...",
  "items": [
    { "material_id": 123, "descripcion": "...", "unidad": "EA", "cantidad": 5, "precio_unitario": 100 }
  ]
}
```

### `PUT /api/ordenes-compra/:id` — WRITE

Update parcial. Si la OC está en estado `recibida`, solo se permite editar `notas` (regla de negocio para auditabilidad).

### `PATCH /api/ordenes-compra/:id/estado` — WRITE

Cambiar solo el estado.

**Body**: `{ "estado": "enviada" }`

### `DELETE /api/ordenes-compra/:id` — WRITE

Borrar OC. **Bloqueo**: rechaza con `409` si la OC está en estado `recibida` o `confirmada`. CASCADE limpia items + metadata de imágenes (los archivos de Supabase quedan huérfanos — preferir eliminar imágenes vía API primero).

---

## Recepciones (`/api/recepciones`)

### `GET /api/recepciones`

Lista paginada.

**Query**: `estado` (opcional), `search` (folio/recibio/numero), paginación.

### `GET /api/recepciones/historial`

Trae todas las recepciones (excluyendo templates `pendiente`) para una OC, con sus materiales nested.

**Query**: `orden_compra_id` (requerido)

**Response**: array de recepciones, cada una con `materiales: [...]`.

### `GET /api/recepciones/:id`

Detalle (incluye items_recepcion para el flujo legacy).

### `POST /api/recepciones` — REC_WRITE

Flujo legacy — crea recepción usando `items_recepcion`. Hoy ya no lo usa nadie en el frontend (ni web ni móvil).

### `POST /api/recepciones/completa` — REC_WRITE

Flujo nuevo — crea recepción usando `recepcion_materiales`. Es el que usan web y móvil.

**Body**:
```json
{
  "orden_compra_id": 1,
  "tipo": "total",      // o "parcial"
  "fecha_recepcion": "2026-05-03",
  "recibio": "Chali Herrera",
  "notas": "...",
  "materiales": [
    { "id_material": 123, "cm_code": "...", "descripcion": "...", "recibido": true, "nota": "..." },
    ...
  ]
}
```

**Comportamiento**:
- Crea registro en `recepciones` con `estado='completa'` (si tipo=total) o `'con_diferencias'` (si tipo=parcial)
- Inserta una fila por material en `recepcion_materiales`
- Actualiza `ordenes_compra.estado` a `recibida` (total) o `en_transito` (parcial)
- Si `recibida`, setea `fecha_entrega_real = CURRENT_DATE`

### `POST /api/recepciones/inicializar` — REC_WRITE

Pre-popula los `recepcion_materiales` para una OC, creando una recepción "template" con `estado='pendiente'`. Idempotente — si ya existe el template, no hace nada.

**Body**: `{ "orden_compra_id": 1 }`

### `PUT /api/recepciones/:id` — REC_WRITE

Update parcial (estado, fecha, recibio, notas).

> **Sin `DELETE`**. No existe endpoint para borrar recepciones — hay que ir vía SQL directo si hace falta.

---

## Cotizaciones (`/api/cotizaciones`) — todas WRITE

### `GET /api/cotizaciones`

Lista paginada.

**Query**: `estado`, `proyecto_id`, `search` (folio/proyecto.nombre/proveedor.nombre).

### `GET /api/cotizaciones/:id`

Detalle.

### `POST /api/cotizaciones/enviar`

**Importante**: este endpoint **NO envía email** (a pesar del nombre `/enviar`). Solo registra en `solicitudes_cotizacion` que se enviaron las cotizaciones para los vendors indicados. El PDF se genera en el frontend; el envío del mail es manual.

**Body**:
```json
{
  "proyecto_id": 1,
  "vendors": [{ "vendor": "RUGBY" }, { "vendor": "GEMINI" }]
}
```

**Response**:
```json
{
  "data": [
    { "vendor": "RUGBY", "folio": "COT-2026-0001", "materiales_count": 12 }
  ],
  "message": "2 cotización(es) marcada(s) como enviada(s)"
}
```

### `POST /api/cotizaciones`

Crea registro de cotización individual (uso raro).

### `PUT /api/cotizaciones/:id`

Update parcial.

### `PATCH /api/cotizaciones/:id/aprobar`

Marca como `aprobada`. Atómico — también marca como `rechazada` cualquier otra cotización del mismo proyecto en estado `recibida` (asunción: solo se aprueba una cotización por proyecto).

### `DELETE /api/cotizaciones/:id`

Borrar. Bloquea con `409` si está `aprobada`.

---

## Reportes (`/api/reportes`)

### `GET /api/reportes/compras`

Reporte de compras (datos para PDF/Excel — el export propiamente dicho está pendiente de implementar en el frontend).

### `GET /api/reportes/produccion`

Reporte de producción (idem).

### `POST /api/reportes/compartir` — WRITE

Comparte un reporte (mecanismo de generación de URL pública o similar — ver controller para detalles).

---

## Rate limiting

Aplica a todas las rutas `/api/*`:

| Limiter | Límite | Acción al exceder |
|---|---|---|
| Global | 200 req/min por IP | `429` con mensaje genérico |
| Login (`/api/auth/login`) | 5 intentos por 15 min por IP. Solo cuenta los fallidos (logins exitosos no penalizan) | `429` con mensaje y `Retry-After` |

El estado se persiste en Postgres (`@acpr/rate-limit-postgresql`), compartido entre todas las réplicas del backend.

Ver [SECURITY.md](SECURITY.md) (pendiente) para más detalle sobre el threat model.

---

## Cambios recientes notables (mayo 2026)

- **`POST /api/cotizaciones/enviar`** ya no manda email — el flujo cambió a PDF + envío manual.
- Eliminado `GET /api/cotizaciones/vendor-emails` — el modal nuevo no necesita autocompletar emails.
- Agregada validación estricta de mimetype en uploads de imágenes (antes solo extensión).
- Errores de validación en uploads ahora devuelven `400` (antes devolvían `500`).
