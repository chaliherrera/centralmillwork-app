# Operations — Central Millwork

Guía operacional para deploy, manejo de variables de entorno, monitoring, rollback, backups y troubleshooting.

---

## URLs y servicios

| Recurso | URL / Identificación |
|---|---|
| Web SPA (público) | https://centralmillwork-frontend-production.up.railway.app |
| Backend API (público) | https://centralmillwork-backend-production.up.railway.app |
| Repo GitHub | https://github.com/chaliherrera/centralmillwork-app |
| Postgres | (interno Railway, accesible vía `DATABASE_URL` / `DATABASE_PUBLIC_URL`) |
| Supabase Storage | bucket `oc-imagenes` |
| Railway dashboard | https://railway.app/project/<project-id> |

---

## Deploy

### Flujo automático (lo normal)

1. Hacer cambios en una branch o directo en `main`
2. Commit con mensaje claro (ver convenciones más abajo)
3. `git push origin main`
4. Railway detecta el push automáticamente y arranca el build de **ambos servicios** (frontend + backend)
5. Build (1-3 min):
   - `npm install --include=dev && npm run build`
   - `npm run build` compila frontend (Vite → `frontend/dist/`) y backend (tsc → `backend/dist/`)
6. Start: `node backend/dist/index.js` en cada servicio
7. Health check en `/health` — Railway switch tráfico cuando responde 200
8. Rolling deploy: la versión vieja sigue sirviendo hasta que la nueva esté ready

**Tiempo total típico: 1-3 min.**

### Verificar el deploy

```bash
# Backend healthy?
curl -s https://centralmillwork-backend-production.up.railway.app/health
# Debe responder: {"status":"ok","timestamp":"..."}

# Frontend SPA responde?
curl -s -o /dev/null -w "%{http_code}\n" https://centralmillwork-frontend-production.up.railway.app/
# Debe responder: 200
```

Si el frontend devuelve `404 {"message":"Recurso no encontrado"}`, significa que `NODE_ENV` no está en `production` en el servicio `centralmillwork-frontend` (causa que el bloque que sirve los estáticos no se ejecute). Ver troubleshooting más abajo.

### Logs del deploy

Railway dashboard → click en el servicio → tab **Deployments** → click en el deploy más reciente → **View Logs**. Si el build falla, el log muestra el error de `npm install` o `npm run build`.

### Convenciones de commit

Inspirado en convenciones convencionales pero sin estricto Conventional Commits. Línea 1: imperativa, máximo ~70 chars, en español. Cuerpo opcional con detalles del "por qué".

```
Endurecer validación de uploads (mimetype + extensión + 400)

Antes los fileFilters de imagenesController y materialesController
solo validaban por extensión del filename — trivial de bypassear.
[...explicación del fix...]
```

Co-Author tag al final cuando aplica:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Variables de entorno

Cada **servicio Railway** tiene sus propias variables (no se comparten entre servicios). Las críticas:

### `centralmillwork-backend` (servicio que sirve la API)

| Variable | Valor | Origen |
|---|---|---|
| `NODE_ENV` | `production` | Manual |
| `PORT` | (Railway lo inyecta automáticamente, ej. 8080) | Auto |
| `JWT_SECRET` | Random 48+ bytes (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) | Manual |
| `JWT_EXPIRES_IN` | `8h` | Manual |
| `DATABASE_URL` | URL interna del Postgres | Auto (al vincular Postgres service) |
| `DATABASE_PUBLIC_URL` | URL pública del Postgres (proxy externo) | Auto (al activar Public Networking en Postgres) |
| `CORS_ORIGIN` | `https://centralmillwork-frontend-production.up.railway.app` | Manual |
| `SUPABASE_URL` | URL del proyecto Supabase | Manual |
| `SUPABASE_SERVICE_KEY` | Service role key (NO usar la anon key) | Manual |
| `SUPABASE_BUCKET` | `oc-imagenes` | Manual |

### `centralmillwork-frontend` (servicio que sirve el SPA)

Como corre el mismo código del backend, necesita las mismas vars. **Si falta alguna, el sitio puede romperse en formas no obvias** (lo vivimos).

| Variable | Valor | Notas |
|---|---|---|
| `NODE_ENV` | `production` | **Crítica** — sin esto el bloque que sirve los estáticos no se ejecuta y el SPA no se sirve |
| `CORS_ORIGIN` | URL del propio servicio (`https://centralmillwork-frontend-production.up.railway.app`) | **Crítica** — sin esto las requests del SPA mismo origen pueden fallar |
| `JWT_SECRET` | El mismo que el backend service | Necesario para que tokens emitidos por el backend service sean reconocidos también por este servicio (en caso de que alguien pegue API por la URL del frontend) |
| Otros (DATABASE_URL, SUPABASE_*) | Pueden estar pero no se usan en el flujo normal | El SPA llama al `centralmillwork-backend` para todo /api/* |

### Variables de build del frontend (Vite)

Vite consume vars con prefijo `VITE_*` **en build time** (no runtime). Quedan baked-in en el bundle JS.

| Variable | Valor |
|---|---|
| `VITE_BACKEND_URL` | `https://centralmillwork-backend-production.up.railway.app` |

> **Atención**: si cambiás `VITE_BACKEND_URL`, hay que **rebuildear el frontend**. Un push a main lo hace automáticamente.

### Local (desarrollo)

`backend/.env` (no versionado, ver `.env.example`):

```env
PORT=4000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=centralmillwork
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=dev-only-secret-no-usar-en-prod
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:3000
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_KEY=...
SUPABASE_BUCKET=oc-imagenes
```

El frontend en dev no necesita `.env` — usa el proxy de Vite que reenvía `/api/*` a `http://localhost:4000`.

### Cómo agregar / cambiar una variable

1. Railway dashboard → servicio → **Variables**
2. **+ New Variable** o click en una existente para editarla
3. Save → Railway redeploya el servicio automáticamente con la nueva env var
4. Esperar 1-2 min al rolling restart

### Cómo rotar `JWT_SECRET`

Razones típicas: token comprometido, política periódica de rotación.

1. Generar nuevo secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
2. Cambiar `JWT_SECRET` en **ambos** servicios (`centralmillwork-backend` y `centralmillwork-frontend`)
3. Save (Railway redeploya)
4. **Efecto secundario**: TODOS los usuarios logueados son desconectados (sus tokens dejan de validar). Tienen que loguearse de nuevo.

### Cómo rotar password de Postgres

1. Railway dashboard → servicio **Postgres** → tab **Settings** → buscar "Reset password" o "Regenerate credentials"
2. Confirmar
3. Railway genera nueva password, actualiza `DATABASE_URL` y `DATABASE_PUBLIC_URL` automáticamente, y propaga a los servicios que las consumen
4. Los servicios redeployean con las nuevas vars

> **Si compartiste la `DATABASE_URL` en algún canal externo, rotá la password.**

---

## Monitoring

### Logs

Railway dashboard → servicio → **Logs** (live tail).

Formato en producción: JSON estructurado (winston). Ejemplo:
```json
{"level":"info","message":"createRecepcionCompleta payload","requestId":"791a994d-...","orden_compra_id":50,"tipo":"total","timestamp":"2026-05-03T05:31:02.123Z"}
```

#### Filtros útiles

| Buscar | Patrón |
|---|---|
| Errores 500 | `"level":"error"` |
| Rate limit hits | `ratelimit hit` |
| Boot logs | `"message":"boot"` |
| Login attempts | `controllers/authController` |
| Una request específica | El UUID del header `X-Request-ID` |

Para correlacionar todos los logs de una request: copiá el `X-Request-ID` de la response y grepalo en los logs. Vas a ver el flujo completo de la request, incluso si pasó por varios middlewares y controllers.

### Métricas

Railway dashboard → servicio → tab **Metrics**: CPU, memoria, red, network egress. Útil para detectar leaks o spikes.

No hay APM custom (Sentry, Datadog, etc.). Si la app crece, considerar agregar.

### Health check

`/health` es el único endpoint público sin auth. Devuelve 200 si el proceso está vivo (no chequea DB connectivity). Railway lo usa internamente para el gate de rolling deploys.

Para verificar manualmente:
```bash
curl -s https://centralmillwork-backend-production.up.railway.app/health
```

### Postgres

Railway dashboard → Postgres → tab **Metrics**: connections, queries por segundo, espacio en disco usado.

**Pool de conexiones**: el pool de la app (`backend/src/db/pool.ts`) usa el default de `pg` (max 10 connections). El rate-limit-postgresql crea 2 pools adicionales (uno por limiter), 10 connections cada uno. Total potencial: ~30 connections desde el backend.

Railway Postgres tier free permite 100 connections. Si vemos pool exhaustion, hay que tunear `Pool({ max: ... })`.

---

## Rollback

### Caso: el último deploy rompió producción

```bash
# 1. Identificar el commit a revertir
git log -5 --oneline

# 2. Revertir
git revert <sha-del-commit-malo>

# 3. Push — dispara redeploy automático
git push origin main
```

`git revert` crea un commit nuevo que deshace el anterior (no reescribe historia). Railway redeploya con el commit de revert y vuelve al estado pre-cambio.

### Caso: rollback urgente (rollback rápido sin esperar redeploy)

Railway dashboard → servicio → tab **Deployments** → buscar un deployment anterior estable → click **Redeploy**. Esto vuelve al artifact compilado de ese deployment (sin necesidad de rebuild).

Útil cuando el bug es del código y querés volver inmediatamente sin esperar 1-3 min de build.

### Caso: rollback de migración SQL

No hay sistema automatizado. Si una migración rompió algo:

1. Identificar la migración (en `database/migrations/`)
2. Escribir SQL de rollback manual (DROP TABLE, ALTER TABLE DROP COLUMN, etc.)
3. Aplicar via psql contra `DATABASE_URL`:
   ```bash
   psql "$DATABASE_URL" -c "ALTER TABLE ... DROP COLUMN ..."
   ```

> **Buenas prácticas a futuro**: cada migración nueva debería incluir un script `down.sql` paralelo para rollback. Hoy no se sigue.

---

## Backups

### Postgres (Railway)

**Snapshots automáticos**: Railway hace snapshots diarios. Verificar en Railway dashboard → Postgres → tab **Backups**. Retención según plan.

**Backup manual** (recomendado antes de cambios riesgosos):
```bash
# Conseguir DATABASE_PUBLIC_URL desde Railway → Postgres → Variables
DATABASE_URL="postgresql://..." pg_dump "$DATABASE_URL" --no-owner --no-acl > backup_$(date +%Y%m%d_%H%M%S).sql
```

**Restaurar de un dump local**:
```bash
psql "$DATABASE_URL" < backup_YYYYMMDD_HHMMSS.sql
```

> **Cuidado**: `psql < dump.sql` aplica los CREATEs e INSERTs sobre la DB existente. Si querés un restore limpio, primero hacer un `DROP TABLE ... CASCADE` o restaurar a una DB nueva.

### Imágenes (Supabase Storage)

Supabase no hace backups automáticos del storage. Para backups manuales:
- Supabase dashboard → Storage → bucket → descargar archivos individualmente, o
- Usar `supabase-js` desde un script para listar y bajar todo:
  ```js
  const { data } = await supabase.storage.from('oc-imagenes').list()
  for (const f of data) {
    const { data: file } = await supabase.storage.from('oc-imagenes').download(f.name)
    // guardar localmente...
  }
  ```

> **Pendiente**: setup de backup automático de Supabase Storage (cron + script o servicio externo).

### Repo / código

Git + GitHub es el backup del código. No hay riesgo si Railway o el local mueren — el repo está en GitHub.

Tags importantes que crearíamos en momentos críticos:
```bash
git tag backup/pre-<cambio> <sha>
git push origin --tags
```

Ya hay uno: `backup/pre-security-fixes-2026-05-02` (creado antes de los SQL injection fixes).

---

## Troubleshooting

Lista de problemas reales que vivimos y cómo se diagnosticaron/resolvieron.

### "Recurso no encontrado" en la URL raíz del frontend

**Síntoma**: `https://centralmillwork-frontend-production.up.railway.app/` devuelve `{"message":"Recurso no encontrado"}` con status 404.

**Causa**: el bloque condicional `if (process.env.NODE_ENV === 'production')` en `backend/src/index.ts` no se ejecuta porque `NODE_ENV` no está seteado a `'production'`. Resultado: `app.use(notFound)` (modo dev) atiende todas las requests con 404 JSON.

**Fix**: Railway dashboard → servicio `centralmillwork-frontend` → **Variables** → setear `NODE_ENV=production`. Save → redeploya solo.

### Header `Access-Control-Allow-Origin: http://localhost:3000` en producción

**Síntoma**: el browser bloquea requests por CORS, error tipo "blocked by CORS policy".

**Causa**: `CORS_ORIGIN` no está seteada o tiene un valor de desarrollo. El default en código es `'http://localhost:3000'`.

**Fix**: Railway dashboard → servicio → **Variables** → `CORS_ORIGIN=https://centralmillwork-frontend-production.up.railway.app`.

### Login falla con "Token inválido o expirado" inmediatamente

**Síntomas**: el JWT recién emitido no funciona en la siguiente request.

**Causas posibles**:
1. `JWT_SECRET` distinto entre el servicio que firmó el token y el que lo verifica. Si el SPA pega al `centralmillwork-backend` para login pero a `centralmillwork-frontend` para otras requests (o viceversa), y los secrets difieren, el token del primero no valida en el segundo.
2. `JWT_SECRET` se rotó después del login (todos los tokens viejos quedan inválidos).

**Fix**: Sincronizar `JWT_SECRET` entre **ambos** servicios. Después relogin.

### Rate limit no funciona — todos los intentos pasan sin acumular

**Síntoma**: 7+ intentos fallidos de login devuelven todos 401, ninguno 429. Headers `RateLimit-*` muestran `remaining=4` constante.

**Causa raíz**: Railway corre múltiples réplicas del servicio. El default in-memory store de `express-rate-limit` mantiene contadores separados por proceso. Las requests se reparten entre réplicas, ninguna acumula los 5 fallidos.

**Fix**: usar un store compartido. Hoy se usa `@acpr/rate-limit-postgresql` que persiste el contador en Postgres. Ver [`backend/src/middleware/rateLimit.ts`](../backend/src/middleware/rateLimit.ts).

**Cómo verificar que está bien**: enviar 7 logins fallidos y observar `remaining` decreciendo monotónicamente y `reset` decreciendo también:
```bash
for i in 1 2 3 4 5 6 7; do
  curl -s -i -X POST https://centralmillwork-backend-production.up.railway.app/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"x@x.com","password":"wrong"}' | grep -E "^(HTTP|ratelimit)"
done
```

### El cliente móvil dice "Internet connection appears to be offline" pero el celular sí tiene Internet

**Causa**: la app está intentando conectarse al servidor de Expo dev (`exp://192.168.x.x:8081`) que no está accesible. Posibles motivos:
- Tu PC no está corriendo `npx expo start`
- Tu PC está en una red distinta al teléfono
- WiFi tiene client isolation (común en redes guest)

**Fix corto**: usar tunnel mode: `npx expo start --tunnel -c`. El tunnel expone tu dev server vía Internet pública. Funciona desde cualquier red.

**Fix largo (producción)**: build standalone con EAS (`eas build`). El bundle queda autocontenido — la app no depende de tu PC. Ver [MOBILE.md](MOBILE.md) (pendiente).

### Multer error 500 en upload en vez de 400

**Síntoma**: subir archivo no permitido (extensión o mimetype) devuelve "Error interno del servidor" en vez de un mensaje legible 400.

**Causa**: `cb(new Error(...))` en el fileFilter no setea statusCode. El errorHandler default devuelve 500.

**Fix**: usar `cb(Object.assign(new Error(msg), { statusCode: 400 }))` para que el errorHandler reconozca el código. Ya está aplicado en ambos endpoints de upload.

### Después de cambiar env vars del servicio, el sitio no se actualiza

**Causa**: Railway redeploya automáticamente al guardar variables, pero el browser puede tener cacheado el bundle viejo del SPA.

**Fix**: hard refresh en el browser (Ctrl+Shift+R / Cmd+Shift+R). Si tampoco funciona, abrir en incógnito.

### Postgres connection pool exhaustion / "too many connections"

**Síntoma**: errores de timeout al conectar a la DB; logs muestran "remaining connection slots are reserved".

**Causa**: pool exhausted. Cada réplica del backend abre hasta 10 conexiones (default `pg`). Con 2 servicios × N réplicas + el rate-limit lib (2 pools extra de 10), se llegan rápido a los límites del plan free de Railway (100 conexiones).

**Fix temporal**: reiniciar el servicio (Railway dashboard → service → menú → Restart). Esto cierra todas las conexiones huérfanas.

**Fix de fondo**: tunear `Pool({ max: 5 })` en `backend/src/db/pool.ts` y en la config de rate-limit-postgresql para limitar las conexiones por proceso.

---

## Tareas operacionales periódicas

### Mensual
- Correr `npm audit` en backend y frontend, revisar y aplicar fixes de seguridad si los hay
- Revisar logs de Railway por patrones inusuales (spikes de errores, rate limits frecuentes)
- Verificar tamaño de la DB (Railway → Postgres → Metrics) — alertar si crece más rápido de lo esperado
- Revisar backups de Railway (que estén corriendo y sean recuperables — probar restore en una DB de staging si se quiere ser estricto)

### Trimestral
- Rotar `JWT_SECRET` (precaución: desconecta a todos los usuarios)
- Revisar y depurar imágenes huérfanas en Supabase Storage (archivos sin registro en `oc_imagenes`)
- Revisar tabla `recepciones` por templates `pendiente` viejos sin uso (se acumulan cuando alguien abre una OC y nunca completa la recepción)

### Una vez (pendientes)
- Setup de error tracking (Sentry / equivalente)
- Setup de backup automatizado de Supabase Storage
- Consolidar los dos servicios Railway en uno (eliminar el dual `frontend`/`backend`)

---

## Acceso al equipo

| Persona | Rol | Acceso |
|---|---|---|
| Chali Herrera | Owner / Admin | Todo (Railway, Supabase, GitHub, código) |
| (otros usuarios de la app) | según `usuarios.rol` | Solo la app vía login |

Si hay que dar acceso a otra persona al **deploy infrastructure** (Railway, Supabase), agregarla como collaborator en cada plataforma. No compartir credenciales de DB directamente.

---

## Referencias rápidas

| Necesito... | Voy a... |
|---|---|
| Ver el último deploy | Railway dashboard → servicio → Deployments |
| Ver logs en vivo | Railway dashboard → servicio → Logs |
| Ver/cambiar env vars | Railway dashboard → servicio → Variables |
| Acceder a la DB | Postgres service → Variables → copiar `DATABASE_PUBLIC_URL` → conectarse con psql/pgAdmin/DBeaver |
| Ver el bucket de imágenes | Supabase dashboard → Storage → bucket `oc-imagenes` |
| Hacer rollback rápido | Railway dashboard → servicio → Deployments → click en uno anterior → Redeploy |
| Hacer revert via git | `git revert <sha> && git push origin main` |
| Ver versión de Node deployada | Railway logs → buscar línea de boot del proceso |
| Diagnosticar request específica | Buscar el `X-Request-ID` (response header) en los logs de Railway |
