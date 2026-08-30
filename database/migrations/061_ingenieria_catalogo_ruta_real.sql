-- ─────────────────────────────────────────────────────────────────────────────
-- 061 — Ingeniería: catálogo de tipos = la RUTA REAL (definida con el equipo 2026-08-29)
-- ─────────────────────────────────────────────────────────────────────────────
-- Reemplaza el catálogo viejo (14 tipos, orden invertido, alias tóxicos) por los 18
-- pasos reales del Master.Sched, en el orden correcto, con duraciones-semilla frescas
-- (el PM las ajusta) y rol por paso. Cambios clave:
--   · Field Measurements pasa a DESPUÉS de la aprobación (orden 10), no primero.
--   · Se agregan po_execution, meeting_designer, material_deposit, approval, sd_update.
--   · Se limpian los alias tóxicos: "meeting with designer…" salía como client_review
--     y "sd update/final production set" salía como shop_drawings — cada uno a su tipo.
--   · Stone (measure/fab/install) → hito_codigo NULL (es externo, no mide el PDF; antes
--     colisionaba E-03/P-05/I-04 con las de millwork).
--   · Nuevas columnas: rol (quién responde) y es_gate_cliente (el gate + review no
--     consumen capacidad del ingeniero).
--   · shipment se conserva (planes importados lo referencian) pero fuera de la ruta nueva.
--
-- SEGURO: solo redefine el CATÁLOGO (los tipos). NO re-tipa las tareas ya importadas
-- (esas conservan su tipo_id; re-tipar la historia es un data-fix aparte). ADITIVO/idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE ing_tarea_tipos ADD COLUMN IF NOT EXISTS rol             TEXT;
ALTER TABLE ing_tarea_tipos ADD COLUMN IF NOT EXISTS es_gate_cliente BOOLEAN NOT NULL DEFAULT FALSE;

-- Upsert de los 18 pasos (+ shipment parqueado). ON CONFLICT reemplaza orden, duraciones,
-- hito, rol, gate y aliases (así se limpian los alias tóxicos del catálogo viejo).
INSERT INTO ing_tarea_tipos
  (clave, nombre, hito_codigo, dur_dias_tipico, dur_dias_min, dur_dias_max, dias_por_item, orden, rol, es_gate_cliente, aliases)
VALUES
  ('po_execution',       'PO Execution',                         'C-03', 0, 0, 0,  NULL,  1, 'estimacion', FALSE, ARRAY['po execution']),
  ('meeting_designer',   'Meeting with Designer to Review Project','E-01',1, 1, 1,  NULL,  2, 'ingenieria', FALSE, ARRAY['meeting with designer to review project','meeting with designer to review pr','meeting with vantage to review project','meeting with vantage to review pro']),
  ('material_deposit',   'Receipt of Material Deposit',          'C-04', 0, 0, 0,  NULL,  3, 'admin',      FALSE, ARRAY['receipt of material deposit']),
  ('long_leads',         'Long Lead Material Procurement',       'M-03', 10, 5, 25, NULL,  4, 'compras',    FALSE, ARRAY['long lead time material procuremen','long lead time material procurement','long lead material procurement','phase 2-long lead time material procurement']),
  ('shop_drawings',      'Shop Drawings Process',                'E-06', 10, 2, 31, 1.0,   5, 'ingenieria', FALSE, ARRAY['shop drawings process','shop drawings','shop drawings process rev0']),
  ('samples',            'Samples Process',                      'E-04', 10, 10,15, NULL,  6, 'ingenieria', FALSE, ARRAY['samples process','samples','sample process']),
  ('client_review',      'Architect/Designer Review',            NULL,   10, 1, 33, NULL,  7, 'cliente',    TRUE,  ARRAY['architect/designer review drawings and samples','architect/designer review drawings','architect/designer review','architec/designer review drawings','architect/designer review rev1','architect/designer review rev','shop drawings review','shop drawings review ph1']),
  ('approval',           'Shop Drawings and Samples Approval',   'E-07', 0, 0, 0,  NULL,  8, 'cliente',    TRUE,  ARRAY['shop drawings and samples approval','shop drawings and samples approv','shop drawings approval','shop drawings and samples approval ']),
  ('material_proc',      'Material Procurement',                 'M-04', 10, 1, 10, NULL,  9, 'ingenieria', FALSE, ARRAY['material procurement','material procuremen']),
  ('field_measurements', 'Field Measurements',                   'E-03', 1, 1, 1,  NULL, 10, 'field',      FALSE, ARRAY['field measurements','field measurement','vif']),
  ('sd_update',          'SD update / Final production set',     'E-08', 5, 1, 10, NULL, 11, 'ingenieria', FALSE, ARRAY['sd update/final production set','update/final production set','sd update / final production set','sd update/final prod','sd update/production set','sd_update/production set','final production set']),
  ('release',            'Release to Production',                'E-10', 0, 0, 0,  NULL, 12, 'ingenieria', FALSE, ARRAY['release to production','release to productio','release for production']),
  ('cnc',                'CNC Engineering',                      'E-11', 10, 1, 15, 1.0,  13, 'ingenieria', FALSE, ARRAY['cnc engineering']),
  ('fabrication',        'Millwork Fabrication',                 'P-05', 20, 5, 25, 2.0,  14, 'produccion', FALSE, ARRAY['millwork fabrication']),
  ('installation',       'Millwork Installation',                'I-04', 5, 1, 15, NULL, 15, 'instalacion',FALSE, ARRAY['millwork installation','milwork installation']),
  ('stone_measure',      'Stone Countertop Measuring',           NULL,   1, 1, 1,  NULL, 16, 'externo',    FALSE, ARRAY['stone countertop measuring and template','stone countertop measuring and tem','stone countertop measuring and temp']),
  ('stone_fab',          'Stone Countertops Fabrication',        NULL,   5, 5, 10, NULL, 17, 'externo',    FALSE, ARRAY['stone countertops fabrication','stone countertop fabrication']),
  ('stone_install',      'Stone Countertops Installation',       NULL,   2, 1, 3,  NULL, 18, 'externo',    FALSE, ARRAY['stone countertops installation']),
  ('shipment',           'Millwork Shipment',                    'S-04', 0, 0, 0,  NULL, 99, 'logistica',  FALSE, ARRAY['millwork shipment','milwork shipment'])
ON CONFLICT (clave) DO UPDATE SET
  nombre          = EXCLUDED.nombre,
  hito_codigo     = EXCLUDED.hito_codigo,
  dur_dias_tipico = EXCLUDED.dur_dias_tipico,
  dur_dias_min    = EXCLUDED.dur_dias_min,
  dur_dias_max    = EXCLUDED.dur_dias_max,
  dias_por_item   = EXCLUDED.dias_por_item,
  orden           = EXCLUDED.orden,
  rol             = EXCLUDED.rol,
  es_gate_cliente = EXCLUDED.es_gate_cliente,
  aliases         = EXCLUDED.aliases;

-- ── Tabla canónica de ingenieros (reemplaza el pool inferido de asignado_nombre) ──
-- Fuente única de nombres (adiós a los typos/dos-Adrianas de raíz), flag informativo
-- hace_cnc para la decisión MANUAL del PM (no auto-asigna), y gancho usuario_id para
-- el modelo por-usuario y el Visor 3D PYTHA. 4 columnas, sin lógica de auto-ruteo.
CREATE TABLE IF NOT EXISTS ing_ingenieros (
  nombre     TEXT PRIMARY KEY,                                   -- forma canónica ("Santos", "Sergio Castellon"…)
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,    -- se cablea con el modelo por-usuario
  hace_cnc   BOOLEAN NOT NULL DEFAULT FALSE,                     -- informativo: quién puede hacer CNC
  activo     BOOLEAN NOT NULL DEFAULT TRUE
);

-- Seed desde los nombres ya presentes en el plan (no pisa flags si se re-corre).
INSERT INTO ing_ingenieros (nombre)
  SELECT DISTINCT asignado_nombre FROM ing_tareas
   WHERE asignado_nombre IS NOT NULL AND btrim(asignado_nombre) <> ''
ON CONFLICT (nombre) DO NOTHING;

-- hace_cnc inicial: quienes ya generan sus propios CNC (Santos histórico; Sergio y favio ya
-- entregaron proyectos con su CNC). El resto queda FALSE; el PM lo administra a futuro.
UPDATE ing_ingenieros SET hace_cnc = TRUE
 WHERE lower(nombre) IN ('santos','sergio castellon','favio davalos');

COMMIT;
