-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 038 — Muestras F3: procesos default por tipo
-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla que define la ruta de procesos canónica para cada tipo de muestra.
-- El endpoint POST /api/muestras/:id/iniciar-fabricacion lee esta tabla y
-- pre-llena el modal del frontend con los procesos sugeridos. El usuario
-- puede editar antes de confirmar.
--
-- Diseño:
--  - PK compuesta (tipo, secuencia) — secuencia define el orden en la ruta
--  - estacion FK lógico a estaciones_config.nombre (no FK formal porque
--    estaciones_config.nombre no es UNIQUE en el baseline)
--  - tiempo_estimado_minutos: heurística inicial — el operario va a tunearlo
--    en cada ejecución. Vale ajustarlos en seed con tiempos reales medidos.
--
-- Tipos cubiertos (todos los del enum muestra_tipo excepto OTRO):
--   PUERTA:   cnc → edge_banding → assembly → pintura → final
--   HARDWARE: registro → shipping
--   CABINET:  cnc → edge_banding → assembly → final → shipping
--   ACABADO:  pintura → final → shipping
--   OTRO:     vacío — usuario arma a mano
--
-- Migración idempotente: usa ON CONFLICT para no duplicar al re-correr.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.muestras_procesos_default (
  tipo                    public.muestra_tipo NOT NULL,
  secuencia               integer             NOT NULL,
  estacion                text                NOT NULL,
  tiempo_estimado_minutos integer             NOT NULL DEFAULT 60,
  PRIMARY KEY (tipo, secuencia)
);

COMMENT ON TABLE public.muestras_procesos_default IS
  'Ruta de procesos default según tipo de muestra. Pre-llena el modal de iniciar-fabricacion. F3 Muestras 2026-06-09.';

-- Seed inicial. Tiempos estimados son heurística — ajustar con datos reales.

-- PUERTA: ruta completa de carpintería
INSERT INTO public.muestras_procesos_default (tipo, secuencia, estacion, tiempo_estimado_minutos) VALUES
  ('PUERTA', 1, 'cnc',          60),
  ('PUERTA', 2, 'edge_banding', 30),
  ('PUERTA', 3, 'assembly',     45),
  ('PUERTA', 4, 'pintura',      90),
  ('PUERTA', 5, 'final',        30)
ON CONFLICT (tipo, secuencia) DO NOTHING;

-- HARDWARE: paso por registro y shipping (no requiere producción material)
INSERT INTO public.muestras_procesos_default (tipo, secuencia, estacion, tiempo_estimado_minutos) VALUES
  ('HARDWARE', 1, 'registro', 15),
  ('HARDWARE', 2, 'shipping', 15)
ON CONFLICT (tipo, secuencia) DO NOTHING;

-- CABINET: similar a PUERTA pero termina en shipping
INSERT INTO public.muestras_procesos_default (tipo, secuencia, estacion, tiempo_estimado_minutos) VALUES
  ('CABINET', 1, 'cnc',          90),
  ('CABINET', 2, 'edge_banding', 45),
  ('CABINET', 3, 'assembly',     60),
  ('CABINET', 4, 'final',        30),
  ('CABINET', 5, 'shipping',     15)
ON CONFLICT (tipo, secuencia) DO NOTHING;

-- ACABADO: solo pintura y empaque
INSERT INTO public.muestras_procesos_default (tipo, secuencia, estacion, tiempo_estimado_minutos) VALUES
  ('ACABADO', 1, 'pintura',  120),
  ('ACABADO', 2, 'final',     30),
  ('ACABADO', 3, 'shipping',  15)
ON CONFLICT (tipo, secuencia) DO NOTHING;

-- OTRO: sin seed — el usuario arma la ruta manualmente

-- Índice para lookup rápido por tipo (ya está en PK por orden lexicográfico,
-- pero por completitud para el caso de queries que no usen secuencia).
CREATE INDEX IF NOT EXISTS idx_muestras_procesos_default_tipo
  ON public.muestras_procesos_default (tipo);
