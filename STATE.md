# Estado del proyecto — 2026-05-17

Snapshot del estado de Central Millwork App al **cierre oficial del Módulo de Compras**. El lanzamiento oficial al equipo es el lunes **2026-05-18**.

---

## En producción

| Servicio | URL | Estado |
|---|---|---|
| Web SPA | https://centralmillwork-frontend-production.up.railway.app | ✅ Online |
| Backend API | https://centralmillwork-backend-production.up.railway.app | ✅ Online |
| Postgres | (interno Railway) | ✅ Online |
| Storage imágenes | Supabase Storage bucket `oc-imagenes` | ✅ Online |
| App móvil iOS | TestFlight — build 1.0.0 (3) Ready to Submit | 🟡 En espera de testers internos |

**Stack actual**: React 18 + Vite + TanStack Query + Recharts (web) · Express + pg + winston + helmet + zod (backend) · Expo + React Native (mobile) · Postgres + Supabase Storage para imágenes · Railway para deploy.

---

## 🎉 Módulo de Compras — CERRADO 2026-05-17

A partir de hoy, el Módulo de Compras se declara **completo**. Próximo foco: Módulo de Producción.

### Features implementadas (módulo Compras)

| Feature | Estado |
|---|---|
| Importación de MTO desde Excel | ✅ |
| Catálogo Materiales MTO con 5 estados (`PENDIENTE`, `COTIZADO`, `ORDENADO`, `RECIBIDO`, `EN_STOCK`) | ✅ |
| Captura de precios + Freight por (proyecto, vendor) | ✅ |
| Generación automática de OCs desde MTO | ✅ |
| Compras DIRECTA (fuera del MTO, rutinaria) | ✅ |
| Compras URGENTE (rotura en obra, cliente parado) | ✅ |
| Compras OPERATIVA (gastos del taller, sin proyecto, **ADMIN-only**) | ✅ |
| Recepción de OCs (TOTAL / PARCIAL, con diferencias, con fotos) | ✅ |
| Vista de detalle por proyecto con 5 tabs (Materiales / OCs / Recepciones / Actividad / Gráficas) | ✅ |
| Cotizaciones por PDF cliente + email manual (sin SMTP) | ✅ |
| App móvil iOS para recepciones en obra | ✅ (pendiente distribución TestFlight final) |

### Trabajo reciente

**Sesiones del 2026-05-11 al 2026-05-17** (recap consolidado):

| Commit | Fecha | Tema |
|---|---|---|
| `c64cb63` | 11-may | Fix: cotizaciones solo PENDIENTES en PDF |
| `34d7a0b` | 11-may | Estados ORDENADO/RECIBIDO + col OC# + transiciones automáticas |
| `0d2adfb` | 16-may | Compras SIN-MTO (DIRECTA/URGENTE) + freight en OCs sin IVA |
| `3ed8fdd` | 16-may | Vista detalle por proyecto con KPIs, tabs, timeline y 2 gráficas |
| `7736696` + `a0b0a8e` | 16-may | Hardening de seguridad: SQL injection, helmet, zod, escapes XSS |
| `fd454c1` | 17-may | Compras OPERATIVAS (gastos del taller, ADMIN-only) |

### Migrations aplicadas en prod (post-base original 001-013)
- `019_backup_pre_ordenado_recibido.sql`
- `020_add_ordenado_recibido_states.sql`
- `021_materiales_origen.sql`
- `022_oc_origen_freight.sql`
- `023_compras_operativas.sql`

---

## Seguridad

Postura completa post-auditoría 2026-05-16 + revisión final 2026-05-17.

| Capa | Implementación |
|---|---|
| Auth | JWT (HS256), expiración 8h, almacenado en `localStorage` (key `cm_token`) |
| Autorización | `requireRole(...roles)` middleware. Roles: `ADMIN`, `PROCUREMENT`, `PRODUCTION`, `PROJECT_MANAGEMENT`, `CONTABILIDAD` |
| SQL injection | Queries **100% parameterizadas** en todos los controllers. Whitelist de columnas en `parsePagination` para `ORDER BY`. Auditado 2026-05-16 |
| Validación de input | `helmet`, schemas `zod` con middleware `validateBody` en endpoints write de proyectos y proveedores |
| Rate limiting | Global 200 req/min, login 5 fallidos/15min. Store compartido en Postgres (`@acpr/rate-limit-postgresql`) |
| HTTP security headers | `helmet` con HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Cross-Origin policies |
| Upload validation | Imágenes: extensión + mimetype + whitelist + max 10 MB. Excel: extensión + mimetype + max 20 MB. `tipo` validado contra whitelist |
| Logs | winston, JSON en producción, con `requestId` UUID por request expuesto como `X-Request-ID` |
| HTTPS | Sí (Railway edge automático) |
| Defense in depth (OPERATIVA) | Ruta `WRITE` middleware + check ADMIN-only en handler |
| XSS en reportes HTML | Escape de `</script` y `<!--` en JSON inyectado |

### Technical debt aceptado conscientemente
- **JWT en localStorage** (vulnerable a XSS) — mitigado por React auto-escape + cero `dangerouslySetInnerHTML`. Migrar a httpOnly cookies si la app crece a usuarios externos (~6 hs)
- **Validaciones zod faltan** en endpoints write de materiales, ordenes_compra, recepciones, cotizaciones (~2 hs replicar el patrón)
- **Role guards finos** por proyecto/vendor — aceptable para 10 internos
- **No hay 2FA / MFA** — no aplicable a esta escala
- **JWT no revocable** (sin blacklist) — token comprometido espera 8h o requiere cambiar `JWT_SECRET`

---

## 🚨 Pendiente bloqueante pre-lanzamiento

### Rotar password de Postgres en Railway
Sigue pendiente desde 2026-05-03. El password actual se ha compartido por chat múltiples veces para aplicar migrations.

**Acción**: Railway → Postgres → Settings → Reset password. **2 minutos**. Railway propaga automáticamente.

### Confirmar accesos del equipo para el lunes
Los 10 usuarios deben tener email + password listos para mañana 2026-05-18.

---

## Pendientes diferidos

### Operacional
- Commitear `.easignore` + `mobile/eas.json` (untracked en repo)
- Borrar repo viejo en OneDrive (migrado a `C:\dev\centralmillwork-app\` el 2026-05-06)

### Técnico
- Limpiar migrations rotas 004/008/009 (no rompen prod pero impiden fresh install local — workaround en `database/seed_local_test.sql`)
- Configurar CSP estricto en helmet (hoy desactivado por compat con Vite + reportes HTML)
- Decisión 2026-06-15: ¿eliminar módulo Reportes? — depende de uso real durante observación 30 días
- Validaciones zod al resto de endpoints write
- Consolidar Railway dual-service (frontend + backend con misma imagen)

### Pendientes de feature
- **TestFlight**: solo 4 de 10 testers aceptaron la invitación. Falta crear grupo Internal Testing en App Store Connect + agregar el resto
- **App móvil ampliada**: sugerencias evaluadas para próximas iteraciones — top pick = "Crear compra URGENTE/DIRECTA desde el celular"

---

## Hoja de ruta — qué sigue después del Módulo Compras

### En desarrollo activo: Módulo de Producción
Rama `claude/jovial-ride-64bfff` (NO mergeada todavía). Incluye:
- Migrations 014-019 propias (chocan con la numeración de main → resolver al mergear)
- Auth dual sistema/kiosko
- Layout v2 del taller con Assembly desagregado por carpintero
- PDFs por estación
- Notificaciones SHOP_MANAGER vía toast + Browser Notification API

### Próximas fases
- **Ingeniería**: integración del proceso de ingeniería de proyecto al sistema (conectar diseño → procurement → producción)
- **Estimados**: herramienta de cotización y estimación de proyectos para clientes
- **Más adelante**: notificaciones push en mobile, reportes ejecutivos consolidados, integraciones contables

---

## Métricas operativas (snapshot 2026-05-17)

| Métrica | Valor en prod |
|---|---|
| Proyectos activos | 10 |
| Total materiales en sistema | 142+ (creciendo diario) |
| OCs emitidas | 49 (más SIN-MTO recientes) |
| Estados ORDENADO/RECIBIDO trackeados | ✅ Automáticos |
| Usuarios del sistema | 10 internos planificados |

---

## Cómo seguir trabajando

- **Para entender la arquitectura**: leer `docs/ARCHITECTURE.md`
- **Para endpoints**: ver `docs/API.md` (incluye los nuevos `/no-mto`, `/resumen`, `/actividad`)
- **Para schema y migrations**: ver `docs/DATABASE.md`
- **Para deploy**: cada push a `main` triggea redeploy automático en Railway
- **Para rollback**: tag `backup/pre-ordenado-recibido-2026-05-11` apunta al pre-cambio de estados. `git revert <commit-sha> && git push` para revertir un cambio específico
- **Para debug en producción**: el header `X-Request-ID` de cualquier respuesta sirve como filtro en los logs de Railway
- **Para desarrollo local**: ver `docs/DEVELOPMENT.md` — el workaround del schema local está en `database/seed_local_test.sql`
