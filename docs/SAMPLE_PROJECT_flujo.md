# SAMPLE PROJECT — plantilla canónica del flujo (los 19 pasos)

Extraído del Master.Sched. Define la SECUENCIA y las dependencias estándar con la que se
arman todos los planes. En la app esta lógica vive en `ing_tarea_tipos` (los tipos + orden)
y en el generador de ruta (`cargarPlantillaRuta`/plantilla del schedule). Sirve de SPEC:
el plan auto-generado por Estimados/PM debe reproducir esta secuencia.

| Fila | Tarea | Duración | Predecesores | Start | Finish |
|---|---|---|---|---|---|
| 1 | SAMPLE PROJECT | 51d |  | 09/01/26 | 10/29/26 |
| 2 | PO Execution | 0 |  | 09/01/26 | 09/01/26 |
| 3 | Meeting with Designer to Review Project | 1d | 2FS +2d | 09/03/26 | 09/03/26 |
| 4 | Receipt of Material Deposit | 1d | 2FS +5d | 09/07/26 | 09/07/26 |
| 5 | Shop Drawings Process | 10d | 3 | 09/04/26 | 09/15/26 |
| 6 | Samples Process | 10d | 3 | 09/04/26 | 09/15/26 |
| 7 | Architect/Designer Review Drawings and  Samples | 10d | 5 | 09/16/26 | 09/26/26 |
| 8 | Shop Drawings and Samples Approval | 0 | 7 | 09/26/26 | 09/26/26 |
| 9 | Material Procurement | 5d | 8 | 09/28/26 | 10/02/26 |
| 10 | Field Measurements | 1d | 8 | 09/28/26 | 09/28/26 |
| 11 | 26-599 SD update/Final production set CO#1 | 4d | 10, 8 | 09/29/26 | 10/02/26 |
| 12 | Release to Production | 0 | 11 | 10/02/26 | 10/02/26 |
| 13 | 26-599 CNC Engineering CO#1 | 3d | 12 | 10/03/26 | 10/06/26 |
| 14 | Millwork Fabrication | 15d | 12, 13 | 10/07/26 | 10/23/26 |
| 15 | Millwork Installation | 5d | 14 | 10/24/26 | 10/29/26 |
