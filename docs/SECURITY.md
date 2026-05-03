# Security — Central Millwork

Modelo de seguridad del sistema: threat model, capas de defensa implementadas, lo que no está cubierto, recomendaciones de hardening progresivo.

---

## TL;DR

Sistema interno con ~10 usuarios autenticados. Capas implementadas: HTTPS, JWT con bcrypt, control de roles, queries parametrizadas, rate limiting con store compartido, validación de uploads, logs con tracing por request. **No** hay 2FA, ni revocación de tokens, ni encriptación at-rest custom (delegada a Railway/Supabase), ni APM/SIEM. La postura es razonable para un sistema interno de procurement de bajo riesgo, pero requiere hardening si el sistema se abre a clientes externos o pasa a manejar datos sensibles (PII regulada, payments, etc.).

---

## Threat model

### Activos a proteger

| Activo | Sensibilidad | Razón |
|---|---|---|
| Cuentas de usuario (`usuarios`) | Media | Compromiso = acceso completo a OCs/proveedores/precios |
| Datos de proveedores (`proveedores`) | Media | Datos comerciales (emails, RFC, teléfonos) |
| Precios cotizados (`materiales_mto.unit_price`, OCs) | Alta | Información comercial sensible |
| Órdenes de compra | Alta | Documentos legales/comerciales — modificación o borrado podría ser fraude |
| Imágenes de recepción (`oc_imagenes`) | Baja | Fotos de materiales — no típicamente sensibles |
| Backups de DB | Crítica | Snapshot de todo lo anterior |

### Actores adversariales considerados

| Actor | Motivación | Tratamiento |
|---|---|---|
| Empleado curioso (interno) | Ver datos de colegas, manipular registros | Roles + audit logs + rate limit |
| Ex-empleado | Mantener acceso post-baja | Desactivar `usuarios.activo = false` (login lo rechaza). Tokens viejos siguen vivos hasta expirar (8h) |
| Atacante externo random | Brute force de login, scrape de API | HTTPS + rate limit estricto en login + auth obligatoria en `/api/*` |
| Atacante externo dirigido | Robo de datos de un proyecto/cliente específico | Mismo de arriba + audit logs si hay incidente |
| Insider con acceso a la DB | Lectura/modificación directa de tablas | Acceso a Railway Postgres restringido al owner; password rotable |

### Actores **NO considerados** (out of scope)

- Atacantes con capacidad de comprometer Railway, Supabase o GitHub directamente
- Side-channel attacks, timing attacks sobre bcrypt
- Ingeniería social sofisticada del equipo
- Estado-nación / APT

---

## Capas de defensa

### 1. Transport (HTTPS)

- Todas las URLs públicas usan HTTPS forzado por Railway edge (TLS terminación en Fastly).
- HSTS no está configurado explícitamente, pero Railway/Fastly aplica políticas razonables.
- Tráfico interno (entre servicios Railway) va por la red privada de Railway (`*.railway.internal`).

**Limitación**: si alguien hace MITM en la red privada de Railway, no hay encriptación adicional. Se confía en que Railway aísla correctamente entre proyectos.

### 2. Autenticación (JWT)

- Login: `POST /api/auth/login` con email + password (bcrypt comparado contra `usuarios.password_hash`).
- Token: JWT firmado con HS256 (HMAC-SHA256) usando `JWT_SECRET` (48+ random bytes).
- Payload: `{ id, email, rol }`.
- Expiración: **8 horas** (`JWT_EXPIRES_IN=8h`). Después del límite, hay que loguearse de nuevo.
- Almacenamiento en cliente:
  - Web: `localStorage` con key `cm_token`
  - Mobile: `expo-secure-store` (más seguro que AsyncStorage — usa Keychain en iOS, Keystore en Android)

**Limitaciones**:
- **Tokens no revocables**. No hay blacklist. Si se compromete un token, queda vivo hasta expirar.
  - Mitigación parcial: rotar `JWT_SECRET` invalida todas las sesiones simultáneamente (pero también desconecta a todo el equipo).
- **Sin 2FA / MFA**. Solo password.
- **localStorage en web es vulnerable a XSS**. Si alguien logra inyectar JS en el SPA, puede robar el token. Mitigación: el código del SPA es propio, no carga scripts third-party que podrían ser comprometidos. CSP no está configurado (ver "Pendientes").
- **Sin password reset flow**. Si un usuario olvida la password, hay que cambiarla manualmente en DB (un admin puede hacer `UPDATE usuarios SET password_hash = ...`).

### 3. Autorización (roles)

Roles definidos en el enum `user_rol`:
- `ADMIN` — todo, incluido CRUD de usuarios
- `PROCUREMENT` — CRUD de operación core
- `PRODUCTION` — recepciones + imágenes
- `PROJECT_MANAGEMENT` — solo lectura
- `CONTABILIDAD` — solo lectura
- `RECEPTION` — legacy, no usado en UI moderna pero existe en enum

Middleware `requireRole(...roles)` enforced en endpoints sensibles. Aliases comunes:
- `WRITE = ADMIN | PROCUREMENT`
- `REC_WRITE = ADMIN | PROCUREMENT | PRODUCTION`

Endpoints de lectura básica (GET de proyectos, OCs, etc.) requieren auth pero no rol específico — cualquier usuario logueado los ve. Esto es por diseño: el equipo es chico y la confidencialidad inter-equipo no es alta.

**Limitación**: no hay control de acceso a nivel de fila (ej. "user X solo ve sus propios proyectos"). Cualquier user logueado ve todos los proyectos. Aceptable para CM porque todos los proyectos son del mismo equipo, pero no para multi-tenant.

### 4. Inyección SQL

**Defensa**: queries parametrizadas con placeholders `$1`, `$2`, etc. Nunca interpolar valores de `req` directamente en SQL strings.

Patrón estándar para queries con filtros dinámicos:
```ts
const conds: string[] = []
const vals: unknown[] = []
if (req.query.foo) { conds.push(`col = $${vals.length + 1}`); vals.push(req.query.foo) }
const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
await pool.query(`SELECT ... ${where}`, vals)
```

**Caso especial — `ORDER BY`**: la cláusula no se puede parametrizar con `$N`. Se valida contra una **whitelist** de columnas permitidas en `parsePagination`:
```ts
parsePagination(req, 'created_at', ['created_at', 'updated_at', 'numero', ...])
```
Cualquier `?sort=` con un valor fuera de la whitelist se ignora silenciosamente.

**Historial**: en mayo 2026 se cerraron 3 vulnerabilidades de SQL injection en `getOrdenesCompra`, `getOrdenesCompraKpis`, `getOrdenesCompraImportDates`, `getRecepciones` y `parsePagination` (commit `04f1a23`).

**Vulnerabilidad residual menor**: `getCotizaciones` aún interpola `req.query.estado` (no escapado). Mitigación: el enum `estado_cotizacion` en DB rechaza valores inválidos; el peor caso es un error de Postgres, no leak de datos. Pendiente parametrizar.

### 5. Rate limiting

| Limiter | Aplica a | Límite |
|---|---|---|
| Global | `/api/*` | 200 req/min por IP |
| Login | `/api/auth/login` | 5 intentos por 15 min por IP. Solo cuenta los fallidos (logins exitosos no penalizan) |

**Implementación**: `express-rate-limit` v8 con store compartido en Postgres (`@acpr/rate-limit-postgresql`). Necesario porque Railway corre múltiples réplicas y un store in-memory por proceso fragmentaría los contadores.

**Trust proxy**: `app.set('trust proxy', true)` para que Express tome el primer IP del `X-Forwarded-For` (cliente real) en vez del IP del último proxy. Asume que Railway sanitiza el header (lo hace por defecto). Si Railway dejase de sanitizarlo, un atacante podría falsificar IPs y evadir el rate limit.

**Limitación**: el rate limit es por IP. Si un atacante usa múltiples IPs (botnet, proxies rotatorios), puede evadirlo. Para login específicamente, cuando el ataque escala, conviene bloquear por **email** además de por IP.

### 6. Validación de uploads

Dos endpoints aceptan archivos:
- `POST /api/ordenes-compra/:id/imagenes` (imágenes, max 10 MB)
- `POST /api/materiales/importar` (Excel, max 20 MB)

**Defensa**:
- Extensión del filename validada contra regex
- Mimetype validado contra allowlist
- Ambos checks deben pasar (defense-in-depth)
- Tamaño máximo enforced por multer
- Errores de validación devuelven 400 (no 500, mejora UX)

**Limitación**: no se valida el contenido real del archivo (magic bytes). Un atacante podría subir un binario con extensión `.jpg` y mimetype `image/jpeg` válido y pasaría. Mitigación parcial: el contenido luego es procesado por libs (xlsx para Excel, Supabase Storage para imágenes); un binario malformado fallaría al procesarse, pero el upload en sí funcionó.

Para garantía total habría que usar `file-type` o similar para inspeccionar magic bytes. Pendiente si la app se abre a usuarios no internos.

### 7. CORS

`CORS_ORIGIN` env var define el origen permitido. En producción se setea a la URL del SPA (`https://centralmillwork-frontend-production.up.railway.app`).

**Default en código**: `'http://localhost:3000'` (dev). Si la env var no está seteada en producción, el CORS bloquea las requests del SPA real.

`credentials: true` — cookies/auth headers permitidos cross-origin (necesario para que el SPA web mande el JWT).

**Limitación**: hoy solo un origin permitido. Si el SPA web cambiara de URL (por ejemplo, custom domain), hay que actualizar la var.

### 8. Logs y tracing

- Logger central con **winston**, JSON estructurado en producción.
- Cada request tiene un **`requestId`** (UUID) generado por `middleware/requestId.ts`. Se expone en el header `X-Request-ID` de la response.
- Errores 500 loguean `requestId`, `method`, `path`, y el error completo (con stack trace).
- Login attempts (especialmente los fallidos) y rate-limit hits loguean IP + email.

**Para investigar un incidente** (ej. "alguien borró un proyecto sospechosamente"):
1. Identificar timestamp aproximado
2. Filtrar logs de Railway por timestamp + nivel `info` mostrando POST/DELETE
3. Buscar el `requestId` y trackear todo el flujo
4. Cross-reference con la tabla `usuarios` para identificar quién hizo qué

**Limitación**: no hay **audit log persistente** en DB (solo logs efímeros en Railway). Si Railway purga logs viejos, se pierde el trail. Para una app que necesite compliance (SOX, GDPR), conviene una tabla `audit_log` con cada mutación.

### 9. Storage de imágenes (Supabase)

- Bucket `oc-imagenes` configurado como **público** (cualquiera con la URL puede ver la imagen).
- Las URLs son estilo `https://*.supabase.co/storage/v1/object/public/oc-imagenes/<filename>`.
- Filename es timestamp + random string, no fácilmente enumerable, pero **no es secreto**.

**Limitación**: las imágenes no son confidenciales. Si alguien adivina o consigue una URL, accede sin auth. Para CM esto es aceptable porque las imágenes son fotos de materiales recibidos (no contienen PII). Si se subieran documentos sensibles, habría que usar bucket privado + signed URLs.

### 10. Secretos y env vars

- Secretos viven en Railway Variables (no en código, no en `.env` versionado).
- `.env.example` tiene placeholders, no valores reales.
- `JWT_SECRET` rotable (ver [OPERATIONS.md](OPERATIONS.md)).
- `DATABASE_URL` rotable (ver OPERATIONS).

**Limitación**: no hay rotación automática programada. Es un proceso manual. Si un secreto se compromete (ej. accidentalmente expuesto en chat), hay que rotar a mano.

---

## Lo que NO está implementado (gaps conocidos)

### Críticos para producción real con usuarios externos
- **2FA / MFA** — solo password
- **Revocación de tokens** — no hay blacklist; rotar `JWT_SECRET` desconecta a todos
- **Password complexity policy** — bcrypt acepta cualquier string como password
- **Password reset flow** — no hay endpoint "forgot password"
- **Audit log persistente en DB** — solo logs efímeros en Railway
- **CSP (Content Security Policy)** — ningún header configurado, vulnerable a XSS si se inyecta JS
- **HSTS preload** — depende de Fastly default
- **Brute force defense por email** — solo por IP

### Importantes pero menos urgentes
- **Magic bytes validation** en uploads (extensión + mime se pueden fakear)
- **Backup automatizado de Supabase Storage**
- **Error tracking (Sentry, Bugsnag)** — hoy logs solo en Railway
- **Pen test** — nunca se hizo uno
- **SAST/DAST** automatizado en CI

### Nice to have
- **Migración formal del enum `user_rol`** para sacar `RECEPTION` que no se usa
- **Row-level security** (multi-tenancy futura)
- **Encryption at rest custom** (delegado a Railway/Supabase hoy)

---

## Recomendaciones de hardening progresivo

### Hoy (esfuerzo bajo, alto valor)
1. **Habilitar GitHub Dependabot** en el repo. Alerta automática de deps vulnerables.
2. **Correr `npm audit` mensual** y aplicar fixes.
3. **Setear CSP estricto** en el HTML del SPA — bloquea XSS de scripts inyectados:
   ```html
   <meta http-equiv="Content-Security-Policy"
         content="default-src 'self'; img-src 'self' https://*.supabase.co data:; style-src 'self' 'unsafe-inline'; script-src 'self'">
   ```
4. **Parametrizar `getCotizaciones`** — la última vulnerabilidad SQL injection menor que queda.

### Próxima iteración (esfuerzo medio)
5. **Audit log table** — capturar mutaciones (CREATE/UPDATE/DELETE) en una tabla `audit_log` con `user_id`, `request_id`, `entity`, `entity_id`, `action`, `before`, `after`, `created_at`.
6. **Password reset flow** — endpoint con token de un solo uso por email.
7. **Setup Sentry o equivalente** para tracking de errores.
8. **Rate limit por email en login** (no solo por IP).

### Solo si la app se abre a clientes externos
9. **2FA con TOTP** (apps tipo Google Authenticator) — `speakeasy` library.
10. **Token revocation** — tabla `revoked_tokens` o switch a sessions con cookies httpOnly.
11. **Pen test profesional** — freelancer ($1-5k) o firma especializada.
12. **Bucket privado para imágenes** + signed URLs.
13. **WAF** (Cloudflare en frente de Railway).

### Solo si se manejan datos sensibles (PII regulada, payments)
14. **Auditoría profesional anual** (Trail of Bits, NCC Group, etc.).
15. **Encriptación at-rest custom** además de la de Railway.
16. **SOC 2 / ISO 27001** compliance.
17. **PCI-DSS** si se procesan tarjetas (mejor: no procesar tarjetas, usar Stripe/MercadoPago).

---

## Sobre auditorías profesionales (Trail of Bits y similares)

**Recomendación para Central Millwork actual: NO contratar.**

Razones:
- Costo: $30k-100k+ por auditoría chica
- Sistema interno con ~10 usuarios; no expuesto a Internet abierta
- No maneja PII regulada (SSN, datos médicos, payments)
- Ya cubrimos los OWASP Top 10 más relevantes
- ROI desproporcionado al riesgo

**Alternativas más pragmáticas**:
- **GitHub Dependabot + npm audit mensual** (gratis)
- **Snyk free tier** o **Semgrep** — escaneo estático (gratis hasta cierto volumen)
- **Pen-test puntual con freelancer** ($1-5k) si surge necesidad puntual
- **Code review con foco en seguridad** internamente o con consultor

**Cuándo sí considerar Trail of Bits o equivalentes**:
- El sistema se abre a clientes externos (no solo equipo interno)
- Se almacena PII regulada (HIPAA, GDPR strict scope)
- Se procesan payments
- Hay incidente de seguridad confirmado
- Se busca certificación formal (SOC 2, ISO 27001)

---

## Procedimiento de respuesta a incidentes

### Si se sospecha compromiso de cuenta de usuario
1. Desactivar el user: `UPDATE usuarios SET activo = false WHERE id = '...'`
2. Revisar logs (filtrar por el email del user) para ver actividad sospechosa
3. Comunicar al user por canal alternativo (no email del sistema)
4. Cuando el user resetee password (manualmente con admin por ahora), reactivar

### Si se sospecha compromiso de `JWT_SECRET`
1. Rotar JWT_SECRET inmediatamente (Railway → Variables)
2. Esto desconecta a todos los users → comunicación interna avisando
3. Investigar logs para identificar uso anómalo del token comprometido
4. Si hay evidencia de mal uso, considerar rollback de mutaciones recientes

### Si se sospecha compromiso de DATABASE_URL
1. Rotar password de Postgres (Railway → Postgres → Settings → Reset password)
2. Revisar logs de Postgres si están disponibles (Railway → Postgres → Logs)
3. Verificar integridad de la DB: contar registros de tablas críticas, comparar con snapshots recientes
4. Si hay dump de backup reciente conocido bueno, considerar restaurar selectivamente

### Si se sospecha exposición de un endpoint
1. Identificar el endpoint vía `requestId` en logs
2. Revisar request body / query params para entender qué datos se accedieron
3. Si fue lectura, evaluar criticidad de los datos expuestos
4. Si fue mutación, rollback vía git revert + redeploy o restauración de backup

### Comunicación
- Owner (Chali Herrera) es el primer contacto.
- No hay (todavía) un canal formal de seguridad. Para CM hoy, email directo a Chali alcanza.

---

## Cumplimiento

Hoy NO se persigue cumplimiento formal de:
- GDPR (no se manejan datos de ciudadanos UE)
- HIPAA (no son datos médicos)
- PCI-DSS (no se procesan pagos)
- SOC 2 / ISO 27001 (no es requisito de clientes)

Si alguno de estos surge como requisito (ej. expansión a otro mercado, cliente regulado), arrancar con el gap analysis.

---

## Referencias

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [express-rate-limit best practices](https://github.com/express-rate-limit/express-rate-limit)
- [JWT best practices](https://datatracker.ietf.org/doc/html/rfc8725)
