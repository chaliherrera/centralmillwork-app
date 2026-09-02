-- ─────────────────────────────────────────────────────────────────────────────
-- 071 — Reincorporar "Millwork Shipment" a la ruta (entre Fabricación e Instalación)
-- ─────────────────────────────────────────────────────────────────────────────
-- Chali: el shipment es importante — constancia de que el producto se cargó al camión y
-- se envió. Estaba parqueado (orden 99, excluido del generador). Lo reinsertamos como paso
-- rol='logistica' entre fabrication (14) e installation. El DUEÑO de la tarea queda TBD
-- (por ahora rol logistica). hito_codigo S-04 fue podado (migr. 069) → NULL.
-- Aditivo/idempotente. Afecta proyectos NUEVOS (los existentes conservan su plan).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Reordenar: shipment entra en 15; installation y stone corren +1.
UPDATE ing_tarea_tipos SET orden = 19 WHERE clave = 'stone_install';
UPDATE ing_tarea_tipos SET orden = 18 WHERE clave = 'stone_fab';
UPDATE ing_tarea_tipos SET orden = 17 WHERE clave = 'stone_measure';
UPDATE ing_tarea_tipos SET orden = 16 WHERE clave = 'installation';
UPDATE ing_tarea_tipos
   SET orden = 15, rol = 'logistica', dur_dias_tipico = 1, dias_por_item = NULL, hito_codigo = NULL
 WHERE clave = 'shipment';

-- 2) Dependencias: installation ahora va DESPUÉS de shipment (que va después de fabrication).
DELETE FROM ing_tipo_deps WHERE tipo_clave = 'installation' AND depende_de_clave = 'fabrication';
INSERT INTO ing_tipo_deps (tipo_clave, depende_de_clave, tipo, lag_dias)
VALUES ('shipment', 'fabrication', 'FS', 0)
ON CONFLICT (tipo_clave, depende_de_clave) DO NOTHING;
INSERT INTO ing_tipo_deps (tipo_clave, depende_de_clave, tipo, lag_dias)
VALUES ('installation', 'shipment', 'FS', 0)
ON CONFLICT (tipo_clave, depende_de_clave) DO NOTHING;
