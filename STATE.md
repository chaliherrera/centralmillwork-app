# Estado del proyecto — 2026-05-03

Snapshot del estado de Central Millwork App. Para documentación más profunda y permanente, ver los docs específicos en `docs/` (cuando se generen).

---

## En producción

| Servicio | URL | Estado |
|---|---|---|
| Web SPA | https://centralmillwork-frontend-production.up.railway.app | ✅ Online |
| Backend API | https://centralmillwork-backend-production.up.railway.app | ✅ Online |
| Postgres | (interno Railway) | ✅ Online |

**Stack actual**: React 18 + Vite + TanStack Query (web) · Express + pg + winston (backend) · Expo React Native (mobile) · Postgres + Supabase Storage para imágenes · Railway para deploy.

---

## Trabajo reciente (mayo 2026)

Sesión del 2-3 de mayo dejó estos cambios en producción:

| Commit | Tema |
|---|---|
| `04f1a23` | Cerrar SQL injection en consultas de OCs, Recepciones y paginación |
| `7686a8c` | Generar PDF en cliente para cotizaciones (reemplaza envío SMTP) |
| `a70d3ed` | Agregar app móvil (Expo + React Native) con flujo de recepciones |
| `bbe01d9` | Agregar rate limiting global + estricto en login |
| `e542fac` | Fix rate limit fragmentado por múltiples proxies en Railway |
| `bf39b78` | Rate limit: store en Postgres para que funcione con múltiples réplicas |
| `a842840` | Endurecer validación de uploads (mimetype + extensión + 400) |
| `1738c60` | Logs estructurados con winston + request ID por request |

### Cambios notables al flujo de negocio

- **Cotizaciones**: ya no usan SMTP/Outlook. El sistema genera un PDF por vendor que el usuario adjunta manualmente a su cliente de mail. Botón "Marcar como enviada" registra el envío en `solicitudes_cotizacion`.
- **App móvil**: nueva, para registrar recepciones desde el campo. Replica la UX del panel emergente del web (timeline, historial de recepciones previas, materiales ya recibidos disabled, botones TOTAL/PARCIAL explícitos). Toma "quién recibió" del usuario logueado.
- **Imágenes de OCs**: viven en Supabase Storage (commit anterior `b150ac1`). Multer guarda la metadata en `oc_imagenes` y la subida real va a un bucket público.

---

## Seguridad

| Capa | Implementación |
|---|---|
| Auth | JWT (HS256), expiración 8h, almacenado en `localStorage` (key `cm_token`) |
| Autorización | `requireRole(...roles)` middleware. Roles: `ADMIN`, `PROCUREMENT`, `PRODUCTION`, `PROJECT_MANAGEMENT`, `CONTABILIDAD` |
| SQL injection | Queries parametrizadas con placeholders `$N`. Whitelist de columnas en `parsePagination` para `ORDER BY` (no interpolable) |
| Rate limiting | Global: 200 req/min. Login: 5 fallidos/15min. Store compartido en Postgres (`@acpr/rate-limit-postgresql`) — funciona con múltiples réplicas |
| Upload validation | Imágenes: extensión + mimetype (jpeg/png/webp/gif/heic/pdf), max 10 MB. Excel: extensión + mimetype (xlsx/xls/csv), max 20 MB |
| Logs | winston, JSON en producción, con `requestId` UUID por request expuesto como `X-Request-ID` |
| HTTPS | Sí (Railway edge automático) |

### Limitaciones conocidas

- **Tabla `usuarios` accesible solo para ADMIN** — no hay vista de usuario propio para cambiar password / nombre desde la app
- **No hay 2FA / MFA**
- **JWT no es revocable** (no hay blacklist) — si se compromete un token, hay que esperar a que expire (8h) o cambiar `JWT_SECRET` (invalida todas las sesiones)
- **Vulnerabilidad menor**: `getCotizaciones` (`cotizacionesController.ts` línea ~84) interpola `req.query.estado` y `proyecto_id`. `proyecto_id` está protegido por `parseInt`, pero `estado` no escapa. **No es crítico** porque la enum constraint en DB rechaza valores no válidos, pero conviene parametrizar en algún momento.

---

## Pendientes ordenados por prioridad

### Operacional inmediato

1. **Rotar password de Postgres** — la `DATABASE_URL` se compartió en el chat durante la sesión. Acción: Railway → Postgres → Settings → reset password. Railway propaga automáticamente la nueva URL a los servicios que la usen.

### Mejoras técnicas (no urgentes)

2. **Consolidar arquitectura Railway** — actualmente corren dos servicios (`centralmillwork-frontend` y `centralmillwork-backend`) con la misma imagen del backend. Es ineficiente y propenso a env var drift (vimos un caso donde el frontend service no tenía las env vars correctas y rompió el sitio). Plan recomendado en discusión: convertir el frontend service en el "único", agregándole las env vars del backend, y eliminar el backend service. Mantiene la URL pública.
3. **Parametrizar `getCotizaciones`** — eliminar las dos interpolaciones residuales mencionadas arriba.
4. **Distribución móvil real** — hoy la app móvil corre via Expo Go + tunnel (`npx expo start --tunnel`). Solo funciona si la PC del desarrollador está encendida con el tunnel activo. Para distribución real: build standalone via EAS (`eas build`), distribuir vía TestFlight (iOS) o APK / Play Store (Android).
5. **Botones "Reporte Compras" / "Reporte Producción"** del Dashboard — renderizados pero sin funcionalidad. Implementar export PDF/Excel.

### Documentación profesional pendiente

Proponemos generar (en docs separados):

- `docs/ARCHITECTURE.md` — stack, diagrama de componentes, flujos
- `docs/DATABASE.md` — esquema completo, ER diagram conceptual, migraciones
- `docs/API.md` — todos los endpoints
- `docs/OPERATIONS.md` — deploy, env vars, monitoring, rollback, backups
- `docs/SECURITY.md` — modelo de auth, rate limiting, threat model
- `docs/DEVELOPMENT.md` — setup local, convenciones
- `docs/MOBILE.md` — Expo, EAS Build, distribución

### Auditoría de seguridad — recomendación

**No contratar Trail of Bits** (~$30k+). Para Central Millwork (sistema interno, ~10 usuarios, sin PII sensible) es desproporcionado al riesgo.

Reemplazo recomendado (gratuito o muy barato):
- **GitHub Dependabot** — ya viene activable en el repo
- **`npm audit` mensual**
- **Snyk free tier** o **Semgrep** — escaneo estático
- **Pen-test puntual con freelancer** ($1-5k) si surge la necesidad

Considerar Trail of Bits o equivalentes solo si: el sistema se abre a clientes externos, almacena datos sensibles (PII / pagos), o hay un incidente que lo requiera.

---

## Métricas operativas

| Métrica | Valor (snapshot 2026-05-03) |
|---|---|
| Proyectos activos | 5 |
| Total OCs emitidas | $42K |
| OCs completadas | 17 |
| OCs en proceso | 14 |
| OCs retrasadas | 10 |
| Usuarios | (interno, ~10) |

---

## Cómo seguir

- **Para entender la arquitectura**: leer `CLAUDE.md` (tiene todo el detalle de stack, schema, endpoints, lógica de negocio).
- **Para deploy**: cada push a `main` triggea redeploy automático en Railway.
- **Para rollback**: `git revert <commit-sha> && git push` — Railway redeploya el state revertido.
- **Para debug en producción**: el header `X-Request-ID` de cualquier respuesta sirve como filtro en los logs de Railway para ver el trace completo de esa request.
