-- ─────────────────────────────────────────────────────────────────────────────
-- 090 — Desbloquear el cierre del paso "shipment" (BLOQUEANTE del go-live)
-- ─────────────────────────────────────────────────────────────────────────────
-- SÍNTOMA: el paso `shipment` (Millwork Shipment, rol logística) NO se puede
-- cerrar desde ningún escritorio. Como la ruta es fabrication → shipment →
-- installation → stone, HOY ningún proyecto nuevo puede llegar a instalación ni
-- a piedra. Bloquea el go-live entero.
--
-- CAUSA: la migración 083 le puso a shipment entregable='archivo'. El frontend
-- (ENTREGABLE_OBLIGATORIO) exige entonces adjuntar un archivo para habilitar
-- "Completar" — pero shipment quedó SIN hito (migr. 071 lo dejó con
-- hito_codigo=NULL porque S-04 fue podado en la 069), así que no hay a qué
-- adjuntar el archivo (subirArchivoHito rechaza hitos inexistentes). Resultado:
-- botón trabado para siempre.
--
-- FIX (Fase 0, mínimo, sin pre-decidir producto): shipment pasa a cierre manual
-- SIN entregable. El dueño (logística) lo cierra apretando "Completar", como una
-- constancia de despacho. Esto desbloquea installation/stone de inmediato.
--
-- PENDIENTE (Q5 de Chali, Fase 1): "qué archivo / quién cierra" el shipment. Si
-- se decide exigir un documento (BOL, foto del camión), ahí se agrega un hito
-- propio + su plomería de archivo y se revierte a entregable='archivo'.
--
-- Aditivo/idempotente. Afecta el catálogo → aplica a proyectos nuevos y a los
-- existentes (el cierre se evalúa contra el catálogo en tiempo real).
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE ing_tarea_tipos
   SET entregable = 'ninguno'
 WHERE clave = 'shipment'
   AND entregable = 'archivo';
