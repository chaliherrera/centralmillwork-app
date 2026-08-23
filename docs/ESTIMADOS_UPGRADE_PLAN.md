# Plan de construcción — Upgrade de Estimados (post-análisis de Fable)

> Decisiones y orden seguro, según el análisis de interacciones de Fable (2026-08-22).
> Veredicto: **el flujo se construye casi todo con piezas que ya existen; evolución limpia.**

## Los 3 riesgos reales (con solución)
1. **El importador del Excel BORRA todo** (`import_ingenieria_smartsheet.py` hace `TRUNCATE ing_tareas`). Si creamos
   reservas y re-importás el Excel, se comen las reservas. → **Arreglar el import PRIMERO**: que borre solo
   `WHERE origen='import_excel'` (o upsert por `external_ref`, que la tabla ya soporta). **Prerequisito de todo.**
2. **Tres fechas compitiendo por "la verdad"** → jerarquía definida (abajo).
3. **Doble conteo de capacidad** cuando el Excel traiga las tareas reales de un proyecto con reserva → regla: al
   importar, si el `proyecto_ext` tiene filas `origen='reserva'`, marcarlas `estado='na'` (las reales las reemplazan).

## Decisiones de diseño (resueltas)
- **La factibilidad vive en la ESPINA (motor), no en Estimados.** Nuevo `domain/factibilidad.ts`: corre el motor
  **en seco (sin escribir nada)** → fechas necesarias → cruza con la capacidad de Ingeniería → devuelve
  `{factible, fechaRealMasTemprana, cuello, ventanas}` (lo del mockup). Como pasa **antes de que exista el plan**,
  nunca toca la fecha_objetivo ni el semáforo → cero conflicto. Bonus: mismo chequeo antes de mover una fecha comprometida.
- **Jerarquía de fechas** (mata la doble verdad):
  - `proyectos.fecha_entrega_solicitada` (NUEVA, nullable) = lo que el cliente **pidió** (input de factibilidad).
  - `schedule_planes.fecha_objetivo` = la **comprometida y SAGRADA** (única verdad una vez que hay plan).
  - `proyectos.fecha_fin_estimada` = legacy; el flujo nuevo NO la usa (sacar el pre-load de `Estimacion.tsx:46`).
- **La reserva = `ing_tareas` con `origen='reserva'`** (la reserva ES un conjunto provisional de tareas). Migración 055:
  `ADD COLUMN reserva_confirmada_at TIMESTAMPTZ, reserva_confirmada_por UUID`. Reglas:
  - Al reservar: una fila por tipo de tarea de la cadena crítica (shop_drawings/client_review/release/cnc…), con
    `proyecto_id` **Y** `proyecto_ext=proyectos.codigo` (las vistas agrupan por texto), fechas del dry-run,
    `dur_dias` del catálogo, y **`asignado_nombre` obligatorio** (ingeniero propuesto; CNC→Santos) — sin asignado NO consume capacidad.
  - Distinguir de lo real: filtro por `origen` (pintar reservas distinto en Disponibilidad).
  - Confirmación del PM: setea `reserva_confirmada_*` (endpoint PM-only). No cambia el origen (trazabilidad).
  - Liberar si se rechaza: `DELETE WHERE proyecto_id=$1 AND origen='reserva' AND reserva_confirmada_at IS NULL`.
  - Duraciones encapsuladas en UNA función `duracionesPara(presupuesto)` — hoy `dur_dias_tipico`, mañana la tabla calibrada.
- **Eliminar C-01/C-02**: migración chica que los borra de la plantilla (`schedule_plantilla_hitos` + `_dependencias`).
  Seguro: todo cuelga de la plantilla por JOIN; el cálculo hacia atrás no se mueve un día; C-03 queda como raíz.
  Dejar las filas `schedule_hitos` existentes huérfanas (invisibles por el JOIN) — cero riesgo.
- **⚠️ El presupuesto YA EXISTE** en `proyectos` (`001_initial_schema.sql:50`). NO agregarlo de nuevo (error del diseño).
- **DocuSign**: dos fases. **Recibir** (webhook, C-03 con evidencia `{source:'docusign', fechaFirma}`) solo necesita el
  HMAC key de Connect + URL pública (deploy). **Enviar** envelopes necesita Integration Key/JWT/RSA (fase 2). Ojo:
  el webhook necesita **raw body** (`express.raw` ANTES del `express.json()` global) o el HMAC falla. El PDF manual
  obligatorio queda como fallback permanente.
- **Schedule como nav propio**: `ScheduleTab` ya es autónomo (recibe `proyectoId`). Rutas `/schedule` (índice) y
  `/schedule/:id`. **Agregar el nav SIN sacar la pestaña todavía** (transición sin romper hábitos). La **vista índice**
  (todos los proyectos con semáforo/holgura/fecha) es la pieza que falta para el lazo adaptativo multi-proyecto →
  endpoint nuevo `GET /api/schedule/planes` (barato, los campos ya están desnormalizados).

## Orden seguro de construcción
1. **Fix del import de Ingeniería** (TRUNCATE → scoped). *Reversible, urgente, prerequisito.*
2. **Migración**: quitar C-01/C-02 + `ALTER proyectos ADD fecha_entrega_solicitada DATE`. *Aditiva/chica.*
3. **Factibilidad read-only** (`domain/factibilidad.ts` + endpoint + pantalla del mockup). *Cero escrituras = riesgo cero.*
4. **Wizard de Estimados (UI)**: encadena lo existente (ProyectoForm con `variant` sin fechas, PDF obligatorio, intake al final).
5. **Reserva de Ingeniería** (migración 055 + confirmación PM + liberación + regla anti doble-conteo).
6. **Nav "Schedule"** (endpoint índice + rutas + sidebar; la pestaña se retira un sprint después).
7. **DocuSign receive-only** (cuando haya deploy + credenciales).

## Dos avisos honestos de Fable (importantes)
- **"Todo cumplido → crear schedule"**: definir "todo" = **factible + reserva creada**. **NO esperar la confirmación del
  PM** para crear el schedule (es asíncrona; "el PM confirma después"). Si esperamos al PM, Estimados se muere esperando otra bandeja.
- **No esperar duraciones exactas** para lanzar la factibilidad: se lanza **provisional** (como ya hace Disponibilidad).
  El lazo adaptativo se calibra usándose.

## Qué NO construir todavía
Carga real del Taller (elástico, mockup) · duraciones por tamaño (bloqueado por histórico/creador) ·
auto-nivelación de reservas (NP-duro, sobre-ingeniería) · enviar envelopes por API DocuSign (fase 2).
