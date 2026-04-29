-- Tabla para imágenes adjuntas a órdenes de compra
-- Tipos: 'delivery_ticket' | 'material_recibido'
-- Las imágenes se guardan en /uploads del servidor; esta tabla guarda el metadata
CREATE TABLE IF NOT EXISTS oc_imagenes (
  id               SERIAL PRIMARY KEY,
  orden_compra_id  INT NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  tipo             VARCHAR(30) NOT NULL CHECK (tipo IN ('delivery_ticket', 'material_recibido')),
  filename         VARCHAR(255) NOT NULL,
  original_name    VARCHAR(255),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_imagenes_orden ON oc_imagenes(orden_compra_id);
