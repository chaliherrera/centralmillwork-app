-- ============================================================================
-- Personal del taller + asignaciones por estación + rol SHOP_MANAGER
-- ============================================================================
-- `personal_taller` es un sistema de identidad SEPARADO de `usuarios`:
--   - `usuarios`     → login con email+password (admin, compras, shop manager)
--   - `personal_taller` → login con PIN de 4 dígitos desde tablets del taller
--
-- Un operario NO necesita un row en `usuarios` para clockear. La columna
-- opcional `usuario_id` permite vincular un operario a una cuenta del sistema
-- si en el futuro alguien tiene los dos roles.
-- ============================================================================

-- 1. Personal del taller
CREATE TABLE IF NOT EXISTS personal_taller (
  id                  SERIAL PRIMARY KEY,
  usuario_id          UUID REFERENCES usuarios(id) ON DELETE SET NULL,  -- opcional
  nombre              TEXT NOT NULL,
  apellido            TEXT,
  nombre_completo     TEXT GENERATED ALWAYS AS (
                        TRIM(nombre || ' ' || COALESCE(apellido, ''))
                      ) STORED,
  iniciales           TEXT NOT NULL,
  tipo_personal       TEXT CHECK (tipo_personal IN ('carpintero','operador','inspector','logistica')),
  -- PIN de 4 dígitos hasheado con bcrypt. NULL = no puede entrar al kiosko todavía.
  pin_hash            TEXT,
  pin_actualizado_at  TIMESTAMPTZ,
  activo              BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_tipo   ON personal_taller(tipo_personal);
CREATE INDEX IF NOT EXISTS idx_personal_activo ON personal_taller(activo);

COMMENT ON COLUMN personal_taller.pin_hash
  IS 'bcrypt hash del PIN de 4 dígitos. NULL = sin PIN asignado, no puede clockear.';
COMMENT ON COLUMN personal_taller.usuario_id
  IS 'Vinculación opcional a usuarios.id si la persona también tiene login del sistema.';

-- 2. Asignaciones personal ↔ estación (N:M, un operario puede estar en varias)
-- Ej: Victor en CNC (principal) y en Edge Banding (secundaria).
CREATE TABLE IF NOT EXISTS personal_estaciones (
  id                     SERIAL PRIMARY KEY,
  personal_id            INT NOT NULL REFERENCES personal_taller(id) ON DELETE CASCADE,
  estacion               TEXT NOT NULL,
  es_estacion_principal  BOOLEAN DEFAULT false,
  capacidad_max          INT DEFAULT 3,
  activo                 BOOLEAN DEFAULT true,
  UNIQUE(personal_id, estacion)
);

CREATE INDEX IF NOT EXISTS idx_personal_est_estacion ON personal_estaciones(estacion);

COMMENT ON TABLE personal_estaciones
  IS 'Permite que un operador trabaje en múltiples estaciones (ej: Victor en CNC y Edge Banding)';

-- 3. FKs diferidas desde 014 hacia personal_taller
-- (Se hacen acá porque personal_taller no existía cuando se creó 014.)
ALTER TABLE ordenes_produccion
  ADD CONSTRAINT fk_ordprod_personal
  FOREIGN KEY (personal_asignado_id) REFERENCES personal_taller(id) ON DELETE SET NULL;

ALTER TABLE orden_procesos
  ADD CONSTRAINT fk_orden_procesos_operador
  FOREIGN KEY (operador_id) REFERENCES personal_taller(id) ON DELETE SET NULL;

ALTER TABLE orden_historial
  ADD CONSTRAINT fk_hist_personal_origen
  FOREIGN KEY (personal_origen_id) REFERENCES personal_taller(id) ON DELETE SET NULL;

ALTER TABLE orden_historial
  ADD CONSTRAINT fk_hist_personal_destino
  FOREIGN KEY (personal_destino_id) REFERENCES personal_taller(id) ON DELETE SET NULL;

ALTER TABLE orden_historial
  ADD CONSTRAINT fk_hist_kiosk_personal
  FOREIGN KEY (kiosk_personal_id) REFERENCES personal_taller(id) ON DELETE SET NULL;

ALTER TABLE qc_inspecciones
  ADD CONSTRAINT fk_qc_inspector
  FOREIGN KEY (inspector_id) REFERENCES personal_taller(id) ON DELETE SET NULL;

-- 4. Agregar SHOP_MANAGER al enum `user_rol` de `usuarios.rol`
-- En producción, `usuarios.rol` es un enum tipado (`user_rol`), no TEXT con CHECK.
-- ALTER TYPE ... ADD VALUE es idempotente con `IF NOT EXISTS` (PG 9.6+).
ALTER TYPE user_rol ADD VALUE IF NOT EXISTS 'SHOP_MANAGER';

COMMENT ON TYPE user_rol
  IS 'Enum de roles del sistema. SHOP_MANAGER se agregó para gestionar el módulo de producción (asignar órdenes, gestionar PINs del personal_taller). No tiene permisos de ADMIN sobre usuarios ni DB.';
