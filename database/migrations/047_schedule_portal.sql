-- ─────────────────────────────────────────────────────────────────────────────
-- 047 — Portal de cliente (Life of a Deal, Etapa 2)
-- ─────────────────────────────────────────────────────────────────────────────
-- Acceso público por link con token (sin cuenta) para que el cliente vea el
-- estado de su proyecto y APRUEBE los hitos que dependen de él (planos,
-- muestras, compra anticipada, sign-off). Cada aprobación llena el hito con
-- fecha real + autoría (Principio P2: evidencia, no tilde).
--
-- Cada contacto del cliente tiene su propio token, así las acciones quedan
-- atribuidas a una persona concreta. El token es un string aleatorio largo
-- (no adivinable); el acceso es de solo-lectura + aprobar, nunca ve costos,
-- vendors ni márgenes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schedule_portal_tokens (
  id               SERIAL PRIMARY KEY,
  token            TEXT NOT NULL UNIQUE,           -- aleatorio (crypto), va en el link
  proyecto_id      INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  contacto_nombre  TEXT,
  contacto_email   TEXT,
  activo           BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_access_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_proyecto ON schedule_portal_tokens (proyecto_id);

COMMENT ON TABLE schedule_portal_tokens IS
  'Tokens de acceso público del portal de cliente (Life of a Deal). Un token por contacto; solo-lectura + aprobar hitos del cliente. Nunca expone costos/vendors.';
