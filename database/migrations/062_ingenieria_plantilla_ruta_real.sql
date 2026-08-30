-- ─────────────────────────────────────────────────────────────────────────────
-- 062 — Ingeniería: plantilla de dependencias = la RUTA REAL (con tipo FS/SS + lags)
-- ─────────────────────────────────────────────────────────────────────────────
-- Reescribe ing_tipo_deps con las aristas exactas de la ruta definida con el equipo.
-- Novedades vs la 059:
--   · po_execution es el arranque (día cero); meeting dispara long_leads/shop_drawings/samples.
--   · samples corre en PARALELO a shop_drawings → tipo 'SS' (start-to-start), como el
--     Master.Sched real ('108SS'). El motor ya soporta SS (holgura.ts, tramo 3).
--   · client_review depende del FIN de shop_drawings; el GATE del cliente (approval) depende
--     SOLO de client_review — las muestras NO bloquean el flujo (decisión de Chali).
--   · Field Measurements se activa con el gate (paso 10), no primero; sd_update necesita 8 y 10.
--   · Depósito (material_deposit) FRENA las compras: long_leads y material_proc dependen de él
--     (gate blando — el PM lo desbloquea con el candado ignorada_*, más abajo).
--   · shipment queda FUERA de la ruta: installation se activa directo con fabrication.
--   · Rama piedra encadenada tras installation (solo si el proyecto lleva stone).
--   · Lags por defecto en 0 (plan conservador); los solapes agresivos (FS -Nd) son decisión
--     manual del PM por proyecto — la app no los propone.
--
-- Solo afecta la GENERACIÓN de planes nuevos (los existentes tienen sus aristas
-- materializadas en ing_tarea_deps). Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Candado de override para gates (ej. el depósito): el PM puede saltar la dependencia
-- sin borrarla — reversible y auditable. El motor filtrará WHERE ignorada_at IS NULL.
ALTER TABLE ing_tarea_deps ADD COLUMN IF NOT EXISTS ignorada_at  TIMESTAMPTZ;
ALTER TABLE ing_tarea_deps ADD COLUMN IF NOT EXISTS ignorada_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- Reescritura completa de la plantilla (la ruta vieja se descarta).
DELETE FROM ing_tipo_deps;

INSERT INTO ing_tipo_deps (tipo_clave, depende_de_clave, tipo, lag_dias) VALUES
  -- arranque
  ('meeting_designer',   'po_execution',       'FS', 0),
  ('material_deposit',   'po_execution',       'FS', 0),
  -- el meeting dispara long leads, shop drawings y samples
  ('long_leads',         'meeting_designer',   'FS', 0),
  ('long_leads',         'material_deposit',   'FS', 0),   -- gate del depósito (PM puede saltar)
  ('shop_drawings',      'meeting_designer',   'FS', 0),
  ('samples',            'shop_drawings',      'SS', 0),   -- ★ paralelo a shop drawings
  ('client_review',      'shop_drawings',      'FS', 0),   -- tras el FIN de shop drawings
  -- el GATE del cliente: SOLO depende de la revisión (samples NO bloquea)
  ('approval',           'client_review',      'FS', 0),
  -- el gate abre compras, medición y set final
  ('material_proc',      'approval',           'FS', 0),
  ('material_proc',      'material_deposit',   'FS', 0),   -- gate del depósito (PM puede saltar)
  ('field_measurements', 'approval',           'FS', 0),
  ('sd_update',          'approval',           'FS', 0),
  ('sd_update',          'field_measurements', 'FS', 0),   -- el set final incorpora la medición
  ('release',            'sd_update',          'FS', 0),
  ('cnc',                'release',            'FS', 0),
  -- fabricación: necesita CNC, el material comprado y los long leads
  ('fabrication',        'cnc',                'FS', 0),
  ('fabrication',        'material_proc',      'FS', 0),
  ('fabrication',        'long_leads',         'FS', 0),
  ('installation',       'fabrication',        'FS', 0),   -- sin shipment en el medio
  -- rama piedra (externa; solo si el proyecto lleva stone)
  ('stone_measure',      'installation',       'FS', 0),
  ('stone_fab',          'stone_measure',      'FS', 0),
  ('stone_install',      'stone_fab',          'FS', 0);

COMMIT;
