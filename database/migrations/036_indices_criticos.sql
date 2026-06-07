-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 036 — Índices críticos (Audit Fix A5)
-- ─────────────────────────────────────────────────────────────────────────────
-- Audit identificó que las tablas más joineadas del sistema (items_orden_compra,
-- items_recepcion, materiales_mto) NO tenían índices en columnas usadas en
-- JOIN / WHERE. A 50k materiales (1 año de uso esperado) las queries se
-- degradan a multi-segundo.
--
-- Estos CREATE INDEX usan IF NOT EXISTS para ser idempotentes. Sin CONCURRENTLY
-- porque Railway puede tener locks y queremos atomicidad. Si causa lock visible
-- en prod, cambiar a CREATE INDEX CONCURRENTLY (no permitido en transacción).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── items_orden_compra ─────────────────────────────────────────────────────
-- Joineado con ordenes_compra y materiales_mto en queries de detalle de OC,
-- recepciones, dashboard. Sin estos índices son seq-scan a 10k+ rows.
CREATE INDEX IF NOT EXISTS idx_items_oc_orden_compra
  ON items_orden_compra(orden_compra_id);

CREATE INDEX IF NOT EXISTS idx_items_oc_material
  ON items_orden_compra(material_id);

-- ─── items_recepcion ────────────────────────────────────────────────────────
-- Joineado con items_orden_compra para calcular cantidades recibidas vs ordenadas
CREATE INDEX IF NOT EXISTS idx_items_recepcion_item_orden
  ON items_recepcion(item_orden_id);

-- ─── materiales_mto ─────────────────────────────────────────────────────────
-- Filtros más usados: por vendor (Capturar Precios), por codigo (búsqueda),
-- por estado_cotiz + cotizar (dashboard, panel cotizaciones), por proyecto_id
CREATE INDEX IF NOT EXISTS idx_materiales_vendor
  ON materiales_mto(vendor)
  WHERE vendor IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_materiales_codigo
  ON materiales_mto(codigo);

-- Índice compuesto para el filtro frecuente en /materiales y dashboard
-- estado_cotiz + cotizar (ej: COTIZADO+SI = panel "ya cotizados")
CREATE INDEX IF NOT EXISTS idx_materiales_estado_cotiz_cotizar
  ON materiales_mto(estado_cotiz, cotizar);

CREATE INDEX IF NOT EXISTS idx_materiales_proyecto
  ON materiales_mto(proyecto_id)
  WHERE proyecto_id IS NOT NULL;

-- Para queries del dashboard que agrupan por fecha_importacion
CREATE INDEX IF NOT EXISTS idx_materiales_fecha_importacion
  ON materiales_mto(fecha_importacion)
  WHERE fecha_importacion IS NOT NULL;

-- ─── ordenes_compra ─────────────────────────────────────────────────────────
-- Filtros frecuentes: por estado (lista OC), por proveedor (reporte gasto),
-- por fecha_emision (dashboard temporal)
CREATE INDEX IF NOT EXISTS idx_oc_estado
  ON ordenes_compra(estado);

CREATE INDEX IF NOT EXISTS idx_oc_proveedor
  ON ordenes_compra(proveedor_id)
  WHERE proveedor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oc_fecha_emision
  ON ordenes_compra(fecha_emision);

CREATE INDEX IF NOT EXISTS idx_oc_proyecto
  ON ordenes_compra(proyecto_id)
  WHERE proyecto_id IS NOT NULL;

-- ─── recepciones ────────────────────────────────────────────────────────────
-- Joineado con OC para mostrar "qué OCs tienen recepciones"
CREATE INDEX IF NOT EXISTS idx_recepciones_oc
  ON recepciones(orden_compra_id);

CREATE INDEX IF NOT EXISTS idx_recepciones_fecha
  ON recepciones(fecha_recepcion);

COMMIT;

-- Verificación post-aplicación (opcional, comentado para no romper re-runs):
-- \di+ idx_items_oc_*
-- \di+ idx_materiales_*
-- \di+ idx_oc_*
-- \di+ idx_recepciones_*
