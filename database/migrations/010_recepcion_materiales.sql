-- Tabla para materiales recibidos en cada recepción
CREATE TABLE IF NOT EXISTS recepcion_materiales (
  id           SERIAL PRIMARY KEY,
  id_recepcion INT NOT NULL REFERENCES recepciones(id) ON DELETE CASCADE,
  id_material  INT REFERENCES materiales_mto(id) ON DELETE SET NULL,
  cm_code      VARCHAR(50),
  descripcion  VARCHAR(300),
  recibido     BOOLEAN DEFAULT FALSE,
  nota         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recepcion_materiales_recepcion ON recepcion_materiales(id_recepcion);

-- Ampliar tipos permitidos en oc_imagenes (de 2 a 4 slots)
ALTER TABLE oc_imagenes DROP CONSTRAINT IF EXISTS oc_imagenes_tipo_check;
ALTER TABLE oc_imagenes ADD CONSTRAINT oc_imagenes_tipo_check
  CHECK (tipo IN ('delivery_ticket', 'material_recibido', 'material_recibido_2', 'material_recibido_3'));
