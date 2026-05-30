# Diseño: Fotos del trabajo + Alertas de asignación

Plan de implementación para dos features solicitadas durante el testing 2026-05-24, a ejecutar en la próxima iteración (post merge a main).

**Branch sugerido:** `claude/produccion-fotos-alertas` (nuevo, partiendo de main una vez que `claude/jovial-ride-64bfff` esté mergeado).

---

## Feature A — Fotografías del trabajo realizado

### Por qué

Trazabilidad visual de QC + evidencia para cliente + protección legal en caso de disputa "esto no se entregó así". Hoy ya tenemos `qc_inspecciones` que soporta fotos de defectos, pero faltan **fotos del trabajo terminado por estación**, opcionales y rápidas de tomar desde el iPad.

### Modelo de datos

Reusamos la infraestructura existente al máximo. Sugiero **NO crear tabla nueva** — reusar `orden_documentos` que ya soporta imágenes + metadata, con un tipo nuevo.

**Migración 020** (mínima):

```sql
-- Agregar tipo a orden_documentos para distinguir planos de fotos de trabajo
ALTER TABLE orden_documentos
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'documento'
    CHECK (tipo IN ('documento','foto_trabajo'));

-- Quién subió la foto desde el kiosko (vs documentos subidos desde sistema)
ALTER TABLE orden_documentos
  ADD COLUMN IF NOT EXISTS kiosk_personal_id INTEGER REFERENCES personal_taller(id);

CREATE INDEX IF NOT EXISTS idx_orden_documentos_tipo
  ON orden_documentos(orden_id, tipo);
```

Ventajas de reusar `orden_documentos`:
- Storage ya configurado (Supabase Storage en prod, `/uploads` en dev)
- Endpoints existentes para list/delete
- Soporta jpg/png/webp + límite 20MB ya está

### Backend

**Endpoint nuevo en `/api/kiosk/*`** (auth por PIN, mismo middleware existente):

```
POST /api/kiosk/ordenes/:id/fotos
Body multipart: { archivo: File, descripcion?: string }
Query: ?estacion=cnc  (la estación actual del operario)

Crea row en orden_documentos con:
  tipo='foto_trabajo'
  estacion=<estacion del operario>
  uploaded_by=null (NO es UUID de sistema)
  kiosk_personal_id=req.kioskUser.personal_id
  filename=hash + ext
```

**Endpoint para ver fotos** (auth de sistema, mismo `getDocumentos` existente):
- Ya existe `GET /api/produccion/ordenes/:id/documentos`
- Agregar filtro opcional `?tipo=foto_trabajo` para separar planos vs fotos

**Endpoint para borrar foto desde kiosko** (mismo PIN auth):
```
DELETE /api/kiosk/ordenes/:id/fotos/:fotoId
Permite borrar SOLO si kiosk_personal_id === req.kioskUser.personal_id
(el operario solo borra lo que él subió, no fotos de otros)
```

### Frontend — Kiosko

**Dónde aparece el botón "Tomar foto":**

1. Dentro del card de un item en Asignaciones (botón secundario al lado de "Item completado"):
   ```
   [Iniciar item / Item completado / Continuar item]   [📷 Foto]
   ```
2. **Después de completar el item**, modal preguntando: "¿Querés agregar una foto del trabajo?" con botones [Saltar] / [Tomar foto]. **Opcional, no bloquea.**

**Componente nuevo** `frontend/src/components/kiosk/FotoCapture.tsx`:
- Usa `<input type="file" accept="image/*" capture="environment">` — esto en iOS/Android abre directamente la cámara trasera
- Preview de la foto antes de confirmar
- Compresión client-side antes de subir (canvas + toBlob con quality 0.85) — para no mandar 12MB del iPhone
- Campo opcional "descripción" (texto corto)
- Botón Subir → POST multipart al endpoint
- Toast "✓ Foto guardada" + cerrar modal

**Visualización en kiosko (opcional para v1):**
- Dentro del drawer Asignaciones, badge "📷 3" si ya hay fotos del item en esa estación
- Click muestra grid de thumbnails (solo lectura, sin borrar — eso lo hace el SHOP_MANAGER)

### Frontend — Sistema (SHOP_MANAGER)

**En DetalleOrden:**
- Sección nueva "Fotos del trabajo" (tabs separados de "Documentos / Planos")
- Grid de thumbnails agrupado por estación
- Click → lightbox con descripción + quién la subió + cuándo
- Botón borrar (admin only)

**En el Mapa del Taller:**
- Badge `📷 N` en cards que tienen fotos del trabajo en curso (opcional, baja prioridad)

### Tamaño y compresión

- Foto cruda iPhone: ~3-6MB
- Compresión client-side a 1600px max dimension + JPEG quality 0.85: ~300-600KB
- Esto reduce el storage en Railway / Supabase significativamente
- Función helper en `frontend/src/lib/imageCompress.ts`

### Casos edge

- **Sin internet en el iPad** → guardar foto en localStorage como base64 + retry queue (v2, no v1)
- **Foto subida en estación equivocada** → SHOP_MANAGER puede mover la foto de estación desde DetalleOrden
- **Más de N fotos por item** → no hay límite formal, pero UI muestra "+5 más" al pasar de 6

### Estimación

- Migración: 15 min
- Backend (3 endpoints): 1h
- Frontend kiosko (FotoCapture + integración Asignaciones): 2h
- Frontend sistema (visualización en DetalleOrden): 1h
- Compresión client-side + testing: 1h
- **Total: medio día de trabajo**

---

## Feature B — Alerta en el dispositivo cuando se asigna nueva tarea

### Por qué

Hoy el operario tiene que abrir el drawer de Asignaciones manualmente para ver si tiene algo nuevo. Si está en el medio del taller con el iPad cerca, una asignación nueva puede pasar inadvertida hasta que termine lo que está haciendo. Una alerta visual + sonora cuando el SHOP_MANAGER le asigna algo cambia el ciclo de "pull manual" a "push automático".

### Modelo de datos

**No requiere tabla nueva.** Usamos `orden_historial` que ya tiene `accion='asignar'` con `personal_destino_id`.

Query nuevo para el kiosko:

```sql
-- Eventos de asignación NUEVOS para este operario desde un timestamp dado
SELECT
  oh.id,
  oh.timestamp,
  oh.orden_id,
  o.numero_orden,
  o.item_nombre,
  o.prioridad,
  o.fecha_entrega,
  o.estacion_actual,
  p.codigo AS proyecto_codigo,
  p.nombre AS proyecto_nombre
FROM orden_historial oh
JOIN ordenes_produccion o ON o.id = oh.orden_id
LEFT JOIN proyectos p     ON p.id = o.proyecto_id
WHERE oh.accion = 'asignar'
  AND oh.personal_destino_id = $1     -- personal_id del operario
  AND oh.timestamp > $2                -- last_seen del cliente
  AND o.status NOT IN ('Completada','Cancelada')
ORDER BY oh.timestamp DESC
LIMIT 20
```

### Backend

**Endpoint nuevo** en `/api/kiosk/*`:

```
GET /api/kiosk/notificaciones?desde=<ISO>
Returns: {
  desde: ISO,
  ahora: ISO,
  asignaciones: [
    { id, timestamp, orden_id, numero_orden, item_nombre, prioridad,
      fecha_entrega, estacion_actual, proyecto_codigo, proyecto_nombre }
  ]
}
```

Default `desde` = últimos 30 minutos si no viene en query.

**Performance**: polling cada 25-30s (mismo que `eventos-recientes` del SHOP_MANAGER). 13 operarios × 1 request c/30s = ~26 req/min, trivial para Postgres.

### Frontend — Kiosko

**Hook nuevo** `useNotificacionesKiosko()`:
- Similar a `useEventosProduccion` (que ya existe para SHOP_MANAGER)
- Polling cada 25s con `GET /api/kiosk/notificaciones`
- localStorage `cm_kiosk_notif_last_seen` para dedupe
- Comparar timestamps; por cada asignación nueva:
  1. **Toast visible y persistente** (no auto-dismiss): "📋 Nueva tarea: OP-2026-118 · Puerta corrediza · CNC"
  2. **Sonido corto** (`<audio>` con un ping suave, ~300ms, low volume) — necesita unlock por gesto previo del usuario
  3. **Visual flash en el badge "Asignaciones N"** del home (animar el N + cambiar color a gold por 3 segundos)
  4. **Browser Notification** si el operario aceptó permisos (mismo patrón que SHOP_MANAGER)

**Componente afectado:**
- `AsignacionesCard` (home del kiosko) — agregar prop `hasNew: boolean` que dispara animación
- `KioskApp.tsx` — provider/hook para gestionar el estado de notificaciones
- `KioskLogin.tsx` — agregar disclaimer "este kiosko reproduce sonidos al asignar tareas" + botón "Activar notificaciones" para permission grant

**UX del sonido**:
- Volumen bajo por default (taller ruidoso, no agresivo)
- Toggle "Sonido on/off" en el header del kiosko (icono altavoz)
- Persiste en localStorage por device

**Asset nuevo**: `frontend/public/sounds/new-task.mp3` (~5KB, sonido sutil tipo "ding").

### Frontend — Sistema (SHOP_MANAGER)

**Confirmation visual al asignar**:
- Cuando el SHOP_MANAGER asigna desde Mapa o desde DetalleOrden, mostrar toast: "✓ Asignado a Victor — recibirá notificación en su kiosko"

### Asignaciones que disparan notificación

- ✅ Nueva orden creada con operario asignado
- ✅ Reasignación manual desde DetalleOrden
- ✅ Avance automático a próxima estación SI el siguiente operario es diferente al actual
- ❌ Cambios de fecha/prioridad (eso lo verá cuando abra Asignaciones)
- ❌ Misma persona se queda con el item en otra estación (continuidad sin notificación)

### Casos edge

- **Operario clockeado out** → no notifica (el kiosko no está logueado)
- **Misma persona asignada 2 veces en rápida sucesión** → dedupe por orden_id en 60s
- **iPad en background** → Browser Notification se dispara, toast queda esperando al volver
- **Múltiples kioskos del mismo operario** (raro) → ambos reciben, no es problema

### Estimación

- Backend (1 endpoint): 30 min
- Hook `useNotificacionesKiosko`: 1h
- Integración con AsignacionesCard + animación: 30 min
- Asset de sonido + toggle: 30 min
- Disclaimer en login + permission request: 30 min
- Testing en iPad real: 30 min
- **Total: medio día de trabajo**

---

## Orden sugerido de implementación

1. **Primero alertas** (Feature B) — más impacto inmediato, menos código, no requiere subir archivos
2. **Después fotos** (Feature A) — más complejo (storage, compresión, UI con preview) pero alto valor

Total estimado para ambas: **1 día completo de trabajo**.

---

## Riesgos / dudas a confirmar antes de implementar

### Para fotos
1. ¿Las fotos las puede ver el cliente o son solo internas? Si es solo interno, todo OK con Supabase Storage privado.
2. ¿Quieren que el SHOP_MANAGER reciba notificación cuando se sube una foto? (puede ser ruidoso)
3. ¿Foto obligatoria al completar? (recomiendo opcional para no fricción)

### Para alertas
1. ¿El sonido del kiosko puede molestar a otros operarios? Si el iPad está cerca de varios, sonidos cada vez que asignan a CUALQUIERA puede ser molesto. Toggle off-by-default puede ser mejor.
2. ¿Querés también notificar **cuando el item avanza a la siguiente estación** (al próximo operario)? Mi propuesta SÍ lo cubre, decir si es deseable o demasiado.
3. ¿Browser Notification permission lo pedimos al primer login del operario o cuando ocurre la primera asignación? Probablemente al primer login es más limpio.

---

*Documento generado 2026-05-24. Pendiente de aprobación de Chali antes de implementar.*
