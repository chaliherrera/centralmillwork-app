# Revisión de arquitectura integral (Fable) — 2026-08-21

> Análisis independiente encargado a Fable sobre el ERP completo (schedule + Compras + Producción +
> Muestras) + el modelo real de Ingeniería (`INGENIERIA_MODELO_REAL.md`). Rama `feat/schedule`.
> **Veredicto: el núcleo es sólido — evolución, no reescritura.**

## Resumen ejecutivo (traducción)
- **El motor del schedule es correcto y general — NO se toca.** Cálculo hacia atrás, semáforo, evidencia,
  inferencia, gates, portal: todo bien implementado. Es la pieza que se reusa para Ingeniería.
- **La falla #1 (y la más barata de arreglar): duración única por hito.** La realidad dice que las
  duraciones varían por proyecto (Shop Drawings 5-15d, Review 1-30d). Con duración fija el semáforo
  "miente" en proyectos grandes/chicos → erosiona la confianza en el piloto. Fix: 1 columna `dur_dias_override`.
- **Ingeniería = tareas con recursos** (ingeniero + % asignación + duración + dependencias) en tablas
  propias, y los hitos E-* siguen siendo la interfaz con el motor. Misma relación que Producción ya tiene
  (OPs → P-01/P-05/P-06). El motor no cambia de paradigma.
- **Patrón unificador: existe (taller + ingeniería = capacidad de recurso finita), pero NO generalizarlo
  en código todavía** (un motor genérico de recursos es NP-duro = sobre-ingeniería). Compartir la *forma*
  (vista de carga, convención señal→hito), no el motor. Generalizar recién con una 3ª necesidad real.
- **Bombas de tiempo**: (1) duraciones fijas, (2) doble verdad Muestras vs E-05, (3) rama de 8k líneas
  sin mergear, (4) `schedule_eventos` sin límite, (5) motor sin tests.
- **Bugs concretos**: QC-02 se cumple con la 1ª OP aprobada (debería exigir todas); Muestras y el
  schedule pueden contradecirse sobre "muestras aprobadas".

## Plan de migración (fases, evolutivo, sin big-bang)
- **Fase 0 — Red de seguridad (1-2 días):** tests del motor + merge `feat/schedule` a main + `schedule_eventos` on-change + prune.
- **Fase 1 — Cables + calibración (días):** columna `dur_dias_override` + edición por PM + calibración S/M/L
  con los datos reales del Smartsheet + capturar E-04/E-05 desde Muestras + fix QC-02.
- **Fase 2 — Módulo Ingeniería:** tablas `ing_*` + import del Excel + tab "Plan de Ingeniería" con carga por
  ingeniero + señales E-03/E-06/E-10/E-11. Corre en paralelo con Smartsheet.
- **Fase 3 — Integración viva:** adapter API Smartsheet o corte a nativo.
- **Fase 4 — Unificación:** Carga del Taller real (mismo patrón de vista), consolidar bandejas, des-hardcodear flags.

## Esquema propuesto para Ingeniería (referencia)
`ing_tarea_tipos` (catálogo canónico: clave, hito_codigo que emite, dur típica/min/max, aliases para normalizar
nombres sucios) · `ing_tareas` (proyecto, tipo, asignado_usuario_id, allocation_pct, dur_dias, fechas, estado,
origen import/manual, external_ref para upsert idempotente) · `ing_tarea_deps` (DAG). Índices por
(asignado, fechas) y (proyecto, estado).

Señales E-*: al marcar `hecha` una tarea cuyo tipo tiene `hito_codigo`, se setea la fecha_real del hito con
evidencia `{source:'ing_tarea'}` y se dispara el recompute — vía `captura.ts` (único punto de captura), con
fallback al registro manual actual. E-05/E-07 siguen siendo del cliente (portal); primer hecho real gana.

Duración por proyecto: `ALTER TABLE schedule_hitos ADD COLUMN dur_dias_override INT` y en recompute usar
`override ?? dur_dias_default`. El motor puro no cambia; cambia su input.

Carga por ingeniero (vista, no motor): suma de allocation_pct de tareas que solapan una fecha; >1.0 = sobreasignado.
Misma forma visual que el mockup Carga del Taller, pero por recurso. Advisory, no auto-nivelación.

## Preparación para crecimiento (5x-10x)
schedule_eventos (on-change + prune) · batchear el recompute (1 INSERT…SELECT + skip-if-unchanged) ·
`pg_advisory_xact_lock(plan_id)` en recompute · chunkear el cron a 200+ planes · pasar filtro de área de
mi-trabajo a SQL + índice parcial · paginar getTareas · revisar límites de conexión Railway · consolidar
los 2 servicios Railway.

## Orden recomendado por Fable
Fase 0 (tests + merge + eventos) → Fase 1 (overrides duración + cable Muestras + fix QC-02) → Fase 2
(ing_tareas + import + carga por ingeniero). Fases 0 y 1 son días y elevan el piloto de inmediato; la Fase 2
es el proyecto real de Ingeniería sobre terreno firme.

## Archivos críticos
`backend/src/modules/schedule/domain/recompute.ts` (overrides, lock, eventos on-change) ·
`.../domain/captura.ts` (capturas nuevas: muestras E-04/E-05, ing_tareas, fix QC-02) ·
`.../domain/motor.ts` (no cambia; fijar con tests) · `database/migrations/046_schedule.sql` (base;
nuevas 054+ para override e ing_*) · `backend/src/controllers/muestrasController.ts` (evidencia E-04/E-05).
