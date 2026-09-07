-- 083_catalogo_pasos.sql (Fase 2 de la integración, 2026-09-07)
-- Catálogo único de pasos: por tipo de tarea, CÓMO se cierra y QUÉ entrega. Reemplaza los
-- mapas hardcodeados del frontend (ARTIFACT/COMPLETABLE/LINK_MODULO) por una sola fuente.
--   cierre:        manual = el dueño lo cierra desde su escritorio (con entregable);
--                  derivado = lo cierra un módulo/hecho (el reconciliador);
--                  decision_cliente = requiere la decisión del cliente (aprobado/rechazado).
--   entregable:    qué captura el escritorio al completar.
--   modulo_fuente: de qué módulo se deriva/lee el estado (si aplica).
ALTER TABLE ing_tarea_tipos ADD COLUMN IF NOT EXISTS cierre        TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE ing_tarea_tipos ADD COLUMN IF NOT EXISTS entregable    TEXT NOT NULL DEFAULT 'ninguno';
ALTER TABLE ing_tarea_tipos ADD COLUMN IF NOT EXISTS modulo_fuente TEXT;

-- Seed de los pasos de la ruta (los que no matchean quedan en el default manual/ninguno).
UPDATE ing_tarea_tipos SET cierre=v.cierre, entregable=v.entregable, modulo_fuente=v.modulo_fuente
FROM (VALUES
  ('po_execution',      'manual',           'contrato',  NULL),
  ('material_deposit',  'derivado',         'ninguno',   'finanzas'),
  ('meeting_designer',  'manual',           'ninguno',   NULL),
  ('long_leads',        'derivado',         'ninguno',   'compras'),
  ('shop_drawings',     'manual',           'submittal', NULL),
  ('samples',           'derivado',         'ninguno',   'muestras'),
  ('client_review',     'decision_cliente', 'decision',  NULL),
  ('approval',          'derivado',         'ninguno',   NULL),
  ('material_proc',     'manual',           'mto',       'compras'),
  ('field_measurements','manual',           'medicion',  NULL),
  ('sd_update',         'manual',           'submittal', NULL),
  ('release',           'derivado',         'ninguno',   NULL),
  ('cnc',               'manual',           'archivo',   NULL),
  ('fabrication',       'derivado',         'ninguno',   'produccion'),
  ('shipment',          'manual',           'archivo',   NULL),
  ('installation',      'derivado',         'ninguno',   'instalacion'),
  ('stone_measure',     'manual',           'ninguno',   NULL),
  ('stone_fab',         'manual',           'ninguno',   NULL),
  ('stone_install',     'manual',           'ninguno',   NULL)
) AS v(clave, cierre, entregable, modulo_fuente)
WHERE ing_tarea_tipos.clave = v.clave;
