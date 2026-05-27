# Changelog — Central Millwork

Cambios importantes del sistema, en orden cronológico inverso (lo más nuevo arriba).

## 2026-05-26 — Items Readiness

Nuevo tab "Items" en detalle de proyecto que muestra, para cada item del MTO, si todos sus materiales están disponibles para fabricar.

Backend:
- Endpoint GET /api/proyectos/:id/items-readiness
- Expande materiales_mto.item con STRING_TO_ARRAY (un material en '3,4,7' cuenta para los 3 items)
- Calcula estado por item: LISTO / PARCIAL / ORDENADO / PENDIENTE

Frontend:
- Tab Items con barra de progreso por item y badges (rec / stock / ord / pend)
- Contador "LISTOS PARA FABRICAR x/N" en header
- Filtros: Todos / Listos / Parciales / Ordenados / Pendientes

Commit e0a29fe. Rama feat/items-readiness mergeada a main.

## 2026-05-18 — Lanzamiento v1.0

Sistema completo de procurement digital en producción. Ver LAUNCH_BRIEF.md para detalles.
