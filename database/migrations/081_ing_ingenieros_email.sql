-- 081_ing_ingenieros_email.sql
-- Vínculo ingeniero ↔ usuario por EMAIL (su login). El escritorio deriva "sus tareas"
-- del usuario logueado; con este email (= dirección de login) el círculo se cierra sin
-- selector visible: el admin asocia el correo del ingeniero a su ficha y listo.
-- Se mantiene usuario_id como vínculo alternativo (ambos se aceptan al resolver).
ALTER TABLE ing_ingenieros ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS ing_ingenieros_email_idx ON ing_ingenieros (lower(email));
