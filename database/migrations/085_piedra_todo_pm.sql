-- 085_piedra_todo_pm.sql (2026-09-08)
-- Piedra (countertops) = proveedor EXTERNO, 100% gestionado por el PM (decisión de Chali):
-- el PM inicia con la medición, sigue con la fabricación y termina con la instalación —
-- los 3 pasos van a su widget "Piedra". Hoy stone_measure y stone_install eran rol 'field'
-- (iban al escritorio de Campo) y solo stone_fab era 'externo' → la piedra quedaba partida.
-- Se unifican en 'externo' para que los 3 aparezcan en la bandeja del PM, encadenados
-- (medición → fabricación → instalación), cada uno con su botón de confirmación.
UPDATE ing_tarea_tipos SET rol = 'externo' WHERE clave IN ('stone_measure', 'stone_install');
