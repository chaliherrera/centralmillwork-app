-- Add en_transito state to ordenes_compra for partially-received orders
ALTER TYPE estado_orden ADD VALUE IF NOT EXISTS 'en_transito';
