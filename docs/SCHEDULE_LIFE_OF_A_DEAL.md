# Life of a Deal — Mapa de Hitos

**Documento de diseño · Rev 1 · 2026-07-22**
Estado: **borrador en revisión con CEO y PM**. No implementar hasta aprobación final.

Cambios Rev 0 → Rev 1 (notas de Chali sobre el impreso):
- **Fuera la fase Quote.** La vida del proyecto empieza en el **contrato**. La cadena pasa de 9 a 8 fases.
- **Contract:** el depósito deja de ser gate (se procede sin depósito inicial); MTO y budget se *validan*, no solo se crean; el kickoff es una revisión completa del proyecto.
- **Engineering:** reordenada a 12 hitos. El design call (E-01) absorbe long leads, compra anticipada, muestras solicitadas, revisión de schedule y validación de estimado como sub-tareas. Se elimina "Change orders comunicados". El review de schedule se reencuadra como **gestión de riesgo**.
- **Production:** el 3-Week Lookahead (P-04) pasa a ser un **formulario que genera el sistema** (existe una plantilla real de referencia).
- Materials, QC, Shipping, Install y Completed: sin cambios de estructura.

Fuentes: `Life of a Deal 2026 Rev0.pdf` (41 páginas, proceso oficial de Central Millwork) + sistema actual (centralmillwork-app) + plantilla real de "3 Week Lookahead Schedule".

---

## 1. Qué es esto

El schedule de un proyecto de Central Millwork, desde la **firma del contrato** hasta el pago final,
expresado como una cadena de **hitos** encadenados por **dependencias**, anclados a una
**fecha de entrega objetivo** que no se mueve sola.

Este documento define, para cada hito: **quién es el responsable, cuánto dura, de qué depende,
y qué evidencia lo cierra**. Es la columna vertebral del módulo. Nada se programa hasta que
esta lista esté acordada.

---

## 2. Principios de diseño

### P1 — La fecha objetivo es sagrada
La fecha de entrega comprometida con el cliente **nunca se recalcula automáticamente**.
Se recalculan todas las fechas internas y la proyección. Cuando la proyección pasa la fecha
objetivo, el proyecto se pone en **rojo** — no se corre la fecha.

Mover la fecha objetivo es una **decisión humana registrada**: quién, cuándo, por qué,
cuántos días, y con qué autorización del cliente. Queda en el historial para siempre.

### P2 — Ningún hito se cierra por declaración, se cierra por evidencia
No existe el checkbox "ya está". Cada hito se cierra porque apareció el artefacto que lo prueba
(un archivo, un envío, un click del cliente, un movimiento de estación), y **la fecha la pone el
sistema**, no la persona.

Corolario: para cada hito hay que definir *cuál es la evidencia*. Si no hay evidencia posible,
el hito está mal definido o el trabajo tiene que mudarse adentro del sistema.

### P3 — El registro es subproducto del trabajo, no trabajo extra
El submittal de planos sale **desde el sistema** → la fecha queda sola.
El release to production **manda el email** desde el sistema → la fecha queda sola.
Si alguien tiene que hacer una tarea adicional solo para informar, ese diseño está mal y se abandona
a las tres semanas.

### P4 — El avance se cuenta, no se estima
Prohibido el "% de avance" tipeado por una persona. El avance de una fase es
**sub-hitos con evidencia cumplidos / total de sub-hitos**. Si no se puede contar, no se muestra.

### P5 — Dos relojes
- **Hacia atrás** desde la fecha objetivo → fecha límite de cada hito (la referencia).
- **Hacia adelante** desde los hechos reales → proyección de dónde vamos a caer.
- La diferencia entre ambos es la **holgura**. Holgura negativa = riesgo de incumplimiento.

### P6 — El sistema empuja antes, no explica después
Un schedule que solo absorbe atrasos es un contador de derrotas. Cada hito próximo a vencer
genera alerta al responsable **antes** del vencimiento, y recordatorio automático al cliente
cuando la pelota es del cliente.

### P7 — El que llega último tiene la pelota
Cuando un hito depende de varios predecesores, su fecha de inicio real es **la más tardía**
de ellos. El sistema nombra cuál fue y cuántos días costó. Sin discusión.

---

## 3. Las 8 fases

```
CONTRACT → ENGINEERING → MATERIALS → PRODUCTION → QC → SHIPPING → INSTALL → COMPLETED
```

**La fecha de entrega objetivo** se carga al crear el proyecto (fase Contract). En ese momento el
sistema calcula hacia atrás y devuelve si la fecha nace alcanzable o ya nace en riesgo — ese cálculo
*es* el chequeo de factibilidad. El **día cero operativo** (arranque del reloj hacia adelante) es la
**firma del contrato** (C-03).

**Nota sobre Assembly:** no es una fase. En el PDF aparece solo como etapa de taller dentro de
*Manufacture* (p.33) y de *Quality Control* (p.34), junto a CNC, laminate, finishing, final y packaging.
El detalle por estación ya lo maneja el módulo de Producción con precisión de minutos; duplicarlo
como fase del schedule sería ruido.

---

## 4. Catálogo de hitos

**Leyenda de la columna "Hoy":**
- 🟢 el dato ya existe en la app
- 🟡 existe parcialmente, falta el acto formal con fecha
- 🔴 no existe — hay que construirlo

**Leyenda de tipo:** `GATE` = bloquea el arranque de otra fase · `CONT` = continuo/recurrente · `COND` = condicional

---

### FASE 1 — CONTRACT
Owner de fase: **Estimator** → handoff a **PM / Engineer**

Al crear el proyecto se carga la **fecha de entrega requerida** (ancla del schedule).

| # | Hito | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|
| C-01 | Proyecto en negociación | Estimator | — | — | Cambio de etapa en el pipeline (p.6) | 🔴 |
| C-02 | Contrato revisado / addendum emitido | Estimator | 3-10 d | C-01 | PDF del contrato revisado + addendum adjunto (p.6) | 🔴 |
| C-03 | **CONTRATO FIRMADO — día cero** | Estimator + CFO | — | C-02 | PDF firmado subido al proyecto (p.6) | 🔴 |
| C-04 | Depósito de materiales recibido *(no bloquea)* | Office Manager | 5-15 d | C-03 | Registro de cobro con importe y fecha (p.18) | 🔴 |
| C-05 | **MTO preliminar validado** | Estimator | 1-2 d | C-03 | MTO preliminar importado **y validado** (cantidades, scope) (p.7) | 🟡 |
| C-06 | **Budget del proyecto validado** | Estimator | 1 d | C-03 | Budget cargado por área **y validado** (p.8) | 🔴 |
| C-07 | Project announcement enviado | Estimator | 1 d | C-05, C-06 | Email disparado desde el sistema + carpeta del proyecto creada con documentos (p.9) | 🔴 |
| C-08 | **Kickoff = revisión completa del proyecto** | Estimator + Eng + PM | 1 d | C-07 | Reunión de revisión completa con GC y designer registrada + notas distribuidas desde el sistema (p.10) | 🔴 |
| C-09 | POC transferido a Engineer/PM | Estimator | — | C-08 | Email de handoff disparado desde el sistema (p.11) | 🔴 |

> **C-03 es el día cero operativo.** Todo el plan se ancla ahí. El depósito (C-04) se sigue
> registrando, pero **ya no bloquea** el avance: la empresa procede sin depósito inicial.
> El criterio de fondo sigue vigente: si el contrato se firma tarde todo corre, pero el error real
> es dejar pasar el tiempo sin firmar — por eso C-02/C-03 alertan antes, no solo registran después.

---

### FASE 2 — ENGINEERING
Owner de fase: **Engineer** (apoyo PM) — la fase más grande y la que más atrasos destapa

| # | Hito | Tipo | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|---|
| **E-01** | **Design call / arranque de ingeniería** | — | Engineer | 1-2 d | C-08 | Reunión de diseño con designer y GC + notas distribuidas; incluye las 5 sub-tareas de abajo (p.13) | 🔴 |
| ↳ E-01a | Long lead times identificados | GATE | Engineer + PM | 2-3 d | — | Materiales marcados como long-lead con lead time reconfirmado por el vendor (p.12) | 🟡 |
| ↳ E-01b | Compra anticipada aprobada por cliente | GATE | PM | 3-10 d | — | Aprobación del cliente en el portal (p.12) | 🔴 |
| ↳ E-01c | Muestras solicitadas al cliente | — | Engineer | 1 d | — | Muestra creada con fecha de compromiso (p.17) | 🟢 |
| ↳ E-01d | Revisión de schedule | — | Engineer + PM | — | — | Schedule del proyecto revisado con riesgos marcados (p.15) | 🔴 |
| ↳ E-01e | Estimado validado | — | Engineer | — | — | Estimado / MTO preliminar validado contra documentos del proyecto | 🔴 |
| E-02 | V/E propuesto al cliente | COND | Engineer + PM | 3-5 d | E-01 | Opciones enviadas + respuesta del cliente registrada (p.14) | 🔴 |
| E-03 | VIF / medición en obra | COND | Field Specialist | 1-2 d | E-01 | Medidas y fotos subidas desde la app móvil con fecha y ubicación (p.21) | 🔴 |
| E-04 | Muestras fabricadas y enviadas | — | Shop Manager | 10-14 d | E-01c | Envío registrado con foto del paquete (p.17) | 🟢 |
| E-05 | **Muestras aprobadas por el cliente** | GATE | Engineer | 5-15 d | E-04 | Aprobación del cliente en el portal (p.17) | 🟡 |
| E-06 | Shop drawings emitidos al cliente | — | Engineer | 10-25 d | E-01, E-03 | Submittal generado y enviado desde el sistema con PDF adjunto (p.19) | 🔴 |
| E-07 | **Shop drawings aprobados por el cliente** | GATE | Engineer | 10-20 d | E-06 | Aprobar / Aprobar con comentarios / Rechazar en el portal, con fecha y quién (p.19, p.20) | 🔴 |
| E-08 | Revisiones incorporadas y resubmittal | COND | Engineer | 3-10 d | E-07 | Nueva versión emitida desde el sistema (p.20) | 🔴 |
| E-09 | **MTO final liberado a compras** | GATE | Engineer | 2-5 d | E-07 | **MTO actualizado** marcado como liberado (p.18) | 🟡 |
| E-10 | **Release to Production** | GATE | Engineer | 1 d | E-07 | Planos con sello "Approved" adjuntos + email de release disparado desde el sistema (p.22) | 🔴 |
| E-11 | **Archivos CNC entregados** | GATE | Engineer | 2-5 d | E-10 | Archivos CNC subidos y asociados a la OP (p.29) | 🔴 |
| E-12 | **Gestión de riesgo** (verificar si el plazo se cumple) | CONT | Engineer + PM | semanal | — | Revisión del schedule registrada: ¿el plazo puede cumplirse? Riesgos marcados y comunicados al cliente (p.15) | 🔴 |

> **Eliminado en Rev 1:** "Change orders comunicados" como hito de schedule. Los CO se siguen
> gestionando, pero no son un hito del recorrido. Su impacto sobre la fecha objetivo queda como
> pendiente de definición (sección 11).
> **E-09 ya no depende del depósito** (C-04): solo de shop drawings aprobados (E-07).

---

### FASE 3 — MATERIALS
Owner de fase: **Procurement Manager**

| # | Hito | Tipo | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|---|
| M-01 | Revisión de schedule de Compras *(gestión de riesgo)* | CONT | Procurement Mgr | semanal | C-07 | Revisión registrada: materiales de riesgo marcados y comunicados a PM y Producción (p.23) | 🔴 |
| M-02 | Budget de materiales validado | — | Procurement Mgr | 2-3 d | E-09 | Validación contra estimado registrada, con discrepancias resueltas (p.24) | 🔴 |
| M-03 | Long-lead ordenados | GATE | Procurement Mgr | 1-3 d | E-01b | OC emitida (p.25) | 🟢 |
| M-04 | MTO cotizado | — | Procurement Mgr | 5-10 d | E-09 | Cotizaciones recibidas por vendor (p.26) | 🟢 |
| M-05 | OCs emitidas | — | Procurement Mgr | 2-3 d | M-04, M-02 | OCs generadas con ETA por vendor (p.26) | 🟢 |
| M-06 | POs a subcontratistas | COND | PM + CFO | 5-10 d | E-10 | PO firmada por el subcontratista (p.27) | 🔴 |
| M-07 | **Material recibido y stockeado 100%** | GATE | Procurement Mgr | según lead time | M-05 | Todas las recepciones cerradas, sin faltantes abiertos (p.28) | 🟢 |

> **M-07 es normalmente el hito del camino crítico.** El lead time del vendor más lento manda.

---

### FASE 4 — PRODUCTION
Owner de fase: **Production Manager**

| # | Hito | Tipo | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|---|
| P-01 | **PRODUCTION INTAKE — gate compuesto** | GATE | Production Mgr | 1 d | **E-05 + E-07 + E-10 + E-11 + M-07** | Los 5 requisitos verificados en verde. El sistema no deja abrir producción sin ellos (p.30) | 🔴 |
| P-02 | Distribución a producción | — | Production Controller | 1 d | P-01 | OPs creadas con planos y MTO asociados, CNC entregado al operador (p.29) | 🟡 |
| P-03 | Budget de labor validado | — | Production Mgr | 1 d | P-01 | Horas presupuestadas vs. planificadas, riesgos informados a PM (p.32) | 🔴 |
| P-04 | **3-Week Lookahead — formulario generado por el sistema** | CONT | PM + Production Mgr | semanal | P-01 | El sistema genera el formulario "3 Week Lookahead" (ver §8) auto-poblado y lo comparte a la empresa (p.31) | 🔴 |
| P-05 | Fabricación en curso | CONT | Production Team | 10-30 d | P-02 | Avance real por estación y por item — ya lo mide el kiosko (p.33) | 🟢 |
| P-06 | Fabricación completa | — | Production Mgr | — | P-05 | Todos los items del proyecto en estación final (p.33) | 🟢 |

> **P-01 es el corazón del motor de dependencias.** Es la regla del *Production Intake* de la
> página 30 convertida en gate duro. Su fecha real = la más tardía de sus 5 predecesores, y el
> sistema nombra cuál fue.

---

### FASE 5 — QC
Owner de fase: **Production Assistant**

| # | Hito | Tipo | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|---|
| QC-01 | Controles por etapa | CONT | Production Assistant | — | P-05 | Inspecciones registradas en assembly, laminate y pintura (p.34) | 🟢 |
| QC-02 | **QC final aprobado** | GATE | Production Assistant | 1-3 d | P-06 | Inspección final con fotos de todos los items (p.34) | 🟢 |
| QC-03 | Reproceso por defecto | COND | Production Mgr | variable | QC-01/02 | Decisión de reproceso registrada con estación destino y días perdidos (p.34) | 🟢 |

---

### FASE 6 — SHIPPING
Owner de fase: **Logistics Manager**

| # | Hito | Tipo | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|---|
| S-01 | Packaging completo | — | Production Team | 1-3 d | QC-02 | Items etiquetados con proyecto/item/secuencia, contra shipping list (p.35) | 🟡 |
| S-02 | Delivery request emitido (48 h) | GATE | PM | — | S-01 | Solicitud enviada a Logística y Producción con 48 h de anticipación (p.38) | 🔴 |
| S-03 | Transporte confirmado + BOL | — | Logistics Mgr | 1-2 d | S-02 | Camión confirmado y BOL emitido (p.36) | 🔴 |
| S-04 | **Despachado** | — | Logistics Mgr | 1 d | S-03 | Fotos de carga, número de precinto y BOL firmado subidos (p.36) | 🔴 |
| S-05 | Recepción en obra coordinada | COND | Field Specialist | — | S-04 | Coordinación con el instalador registrada. Sin instalación, no aplica (p.37) | 🔴 |

---

### FASE 7 — INSTALL
Owner de fase: **Field Specialist** (apoyo PM)

| # | Hito | Tipo | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|---|
| I-01 | Fechas de instalación coordinadas | GATE | PM | 3-5 d | QC-02 | Fechas acordadas con el instalador e informadas al cliente (p.38) | 🔴 |
| I-02 | Materiales de instalación comprados | GATE | Procurement Mgr | 2-5 d | I-01 | Lista del instalador recibida y OC emitida, 48 h antes (p.38) | 🟡 |
| I-03 | **Obra lista para instalar** | GATE | PM | — | — | Confirmación del GC. **Dependencia externa — fuera de nuestro control** | 🔴 |
| I-04 | Instalación iniciada | — | Field Specialist | — | S-05, I-02, I-03 | Check-in en obra desde la app móvil (p.40) | 🔴 |
| I-05 | Instalación en curso | CONT | Field Specialist | 5-20 d | I-04 | Avance diario por área desde la app móvil (p.40) | 🔴 |
| I-06 | Punch list cerrado | GATE | Field Specialist | 3-10 d | I-05 | Todos los items del punch list con foto de resuelto (p.40) | 🔴 |
| I-07 | **Sign-off del cliente** | — | PM | — | I-06 | Aprobación final del cliente en el portal | 🔴 |

> **I-03 es la dependencia externa del GC.** Cuando la obra no está lista, el atraso **no es de
> Central Millwork** y el sistema lo deja asentado con esa atribución. Es el respaldo documental
> frente al GC.

---

### FASE 8 — COMPLETED
Owner de fase: **PM + CFO**

| # | Hito | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|
| X-01 | Closeout report interno | PM | 2-3 d | I-07 | Reporte con feedback y fotos cargado (p.39) | 🔴 |
| X-02 | Carpeta del proyecto archivada | PM | 1 d | X-01 | Archivo del proyecto marcado como cerrado (p.39) | 🔴 |
| X-03 | **PAGO FINAL RECIBIDO** | Financial Mgr | 30-90 d | I-07 | Cobro registrado con número de factura e importe (p.39) | 🔴 |
| X-04 | P&L final emitido | CFO | 5 d | X-03 | Reporte de P&L del proyecto (p.39) | 🔴 |

> **X-03 cierra formalmente el proyecto.** Único hito posterior a la entrega física, con su propio
> reloj: se mide contra los términos de pago del contrato, con alertas de cobranza cuando se pasa.

---

## 5. Resumen de instrumentación

| Fase | Hitos | 🟢 ya existe | 🟡 parcial | 🔴 a construir |
|---|---|---|---|---|
| Contract | 9 | 0 | 1 | 8 |
| Engineering | 12 | 1 | 2 | 9 |
| Materials | 7 | 4 | 0 | 3 |
| Production | 6 | 2 | 1 | 3 |
| QC | 3 | 3 | 0 | 0 |
| Shipping | 5 | 0 | 1 | 4 |
| Install | 7 | 0 | 1 | 6 |
| Completed | 4 | 0 | 0 | 4 |
| **Total** | **53** | **10** | **6** | **37** |

*(Los conteos de Engineering cuentan los 12 hitos principales; E-01 tiene además 5 sub-tareas.)*

**Lectura honesta:** ~19% del recorrido está instrumentado hoy, concentrado en el centro
(Materials, Production, QC). Los dos extremos —Contract al principio, Shipping/Install/Completed
al final— son terreno nuevo.

---

## 6. Los gates duros

Los 8 puntos donde el sistema **bloquea** el avance hasta que se cumplan los requisitos:

| Gate | Requiere | Consecuencia si falla |
|---|---|---|
| **C-03** Contrato firmado | C-02 | El reloj no arranca. Alerta desde antes de vencer |
| **E-09** MTO liberado | Shop drawings aprobados (E-07) | Compras no puede cotizar |
| **E-10** Release to Production | Planos aprobados y sellados (E-07) | Producción no puede abrir |
| **P-01** Production Intake | Muestras aprobadas + planos aprobados + release + CNC + material 100% | **Producción no arranca** |
| **QC-02** QC final | Fabricación completa | No se puede empaquetar |
| **S-02** Delivery request | 48 h de anticipación | Logística no puede confirmar camión |
| **I-03** Obra lista | Confirmación del GC | Instalación no arranca — atraso atribuido al GC |
| **I-06** Punch list | Todos los items con foto | No hay sign-off ni pago final |

---

## 7. Modelo de riesgo

Por hito:
- **VERDE** — holgura ≥ 3 días hábiles
- **AMARILLO** — holgura entre 0 y 3 días
- **ROJO** — holgura negativa (ya está comiendo la fecha de entrega)
- **GRIS** — todavía no aplica (predecesores sin cumplir)

Por proyecto: el peor semáforo de la cadena crítica, más los días acumulados de atraso y su atribución.

**Gestión de riesgo como disciplina.** Cada fase tiene un hito de revisión de schedule
(E-12 en Ingeniería, M-01 en Compras) cuyo propósito explícito es **verificar si el plazo puede
cumplirse**. Es la cara operativa del modelo de dos relojes (P5): no espera al atraso, lo anticipa.

**Atribución de días perdidos** — cada hito que cierra tarde registra a quién corresponde el atraso:
Cliente · GC · Vendor · Estimating · Engineering · Procurement · Production · Logistics · Field · Finanzas.

Ese acumulado es el reporte que a fin de año contesta *"¿por qué entregamos tarde?"* con números
en vez de opiniones — y es el argumento documentado frente a GCs y clientes.

---

## 8. El formulario 3-Week Lookahead

El **3-Week Lookahead (3WLA)** es hoy una planilla semanal que el PM arma a mano y comparte a la
empresa. Existe una plantilla real de referencia. En PEE **lo genera el sistema**, auto-poblado
desde datos que ya tiene.

Columnas del formulario (según la plantilla real):

| Columna | De dónde sale |
|---|---|
| Project # / Project Name / Client | `proyectos` |
| Items | items del MTO / OP incluidos |
| Millwork (cantidad) | cantidad total del item |
| Progress % | avance real por estación (kiosko) — **contado, no tipeado** |
| To fabricate | cantidad pendiente = total − completado |
| Due Date | fecha límite del item (del schedule hacia atrás) |
| Prioridad (1 / 2 / 3 / Samples) | prioridad del item, con color rojo/amarillo/verde |
| Comments | notas del item (material outsourced, ETA, stain by CM, etc.) |
| Semana 1 / Semana 2 / Semana 3 | cantidad a fabricar en cada una de las próximas 3 semanas |

Incluye también las **Sample Requests** como filas propias.

**Por qué es alcanzable ya:** todos esos datos existen o se derivan de lo que la app trackea hoy
(proyectos, items, avance por estación, due dates). Es de las primeras cosas que puede salir del motor,
y reemplaza un trabajo manual semanal del PM.

---

## 9. Portal de cliente

Pieza propia, con visión de producto: **el cliente monitorea su proyecto en vivo**.

**Acceso:** link con token por proyecto, sin necesidad de crear cuenta. Cada contacto del cliente
tiene su propio link, de modo que las acciones quedan atribuidas a una persona concreta.

**El cliente puede:**
- Ver el timeline de su proyecto por hitos, con estado y fechas
- Ver de qué está esperando el proyecto **y de quién es la pelota**, incluido cuando es de él
- **Aprobar / aprobar con comentarios / rechazar**: shop drawings, muestras, V/E, compra anticipada
- Dar el **sign-off final**
- Ver fotos de avance de fabricación e instalación
- Descargar documentos: contrato, planos aprobados, BOL, shipping list

**El cliente NO puede ver:** costos, márgenes, budgets, vendors, precios ni información interna.

**Automático hacia el cliente:** recordatorio cuando un hito suyo está por vencer o venció, con
el impacto explícito sobre la fecha de entrega — *"los shop drawings llevan 12 días en revisión.
Cada día adicional corre la entrega del 15 de octubre."*

**Por qué es la pieza de mayor impacto:** convierte el agujero negro *"esperando al cliente"* en
un dato con fecha, hora y responsable. Es una porción grande de los atrasos, y es lo que más barato
se instrumenta.

---

## 10. Cronograma de construcción

Seis etapas. Cada una **funciona sola** y entrega valor aunque se pause. Duraciones estimadas
al ritmo actual de trabajo (Chali + Claude, sesiones regulares, sin equipo de desarrollo).

| # | Etapa | Qué incluye | Duración | Qué se gana al terminar |
|---|---|---|---|---|
| **1** | **Motor de schedule + 3WLA** | Calendario laboral, plantilla de hitos, cálculo hacia atrás, dependencias, holgura, semáforo, atribución de atrasos, timeline en el detalle de proyecto, **formulario 3-Week Lookahead auto-generado** | 3-5 sem | El schedule vive, alimentado por Materials + Production + QC. El PM deja de armar el 3WLA a mano |
| **2** | **Portal de cliente** | Links tokenizados, timeline público, aprobaciones con fecha, recordatorios automáticos, fotos de avance | 3-4 sem | Se cierra el agujero negro de las aprobaciones. E-05, E-07, I-07 pasan a ser datos duros |
| **3** | **Ingeniería** | Submittals, versiones y revisiones de shop drawings, archivos CNC, release to production, MTO liberado, VIF, gestión de riesgo | 6-8 sem | La fase más grande y la que más atrasos destapa. Cierra el gate P-01 completo |
| **4** | **Field, Shipping e Install** | BOL, foto de carga y precinto, delivery request, check-in en obra, avance de instalación, punch list — todo en móvil | 4-6 sem | El recorrido queda cerrado punta a punta hasta el sign-off |
| **5** | **Contract intake** | Contrato firmado, depósito (no bloqueante), MTO preliminar validado, budget validado, announcement, kickoff, handoff POC | 3-4 sem | El proyecto nace en el sistema con su fecha objetivo y su factibilidad |
| **6** | **Cierre financiero** | Budget por área, facturación por hito, cobranza, pago final, P&L. Integración con QuickBooks | 4-6 sem | El proyecto cierra formalmente donde debe cerrar |

**Total: 23-33 semanas de trabajo efectivo — entre 6 y 8 meses.**

Advertencia honesta: esa estimación asume constancia. Si se corta por semanas para atender
producción, se estira proporcionalmente. Y no incluye el tiempo de **adopción**, que en las áreas
que hoy trabajan fuera del sistema puede pesar más que el desarrollo.

### Por qué este orden

- La etapa 1 arranca donde **ya hay datos**: el motor se prueba con la realidad, y el 3WLA da valor inmediato.
- La etapa 2 va segunda porque es **la mayor ganancia por el menor código**.
- La etapa 3 es la más grande, y va cuando el motor ya está probado y hay costumbre de usarlo.
- La etapa 5 (Contract intake) va tarde porque el schedule ya funciona arrancando desde el contrato
  aunque su carga sea manual al principio.

---

## 11. Riesgos del proyecto

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Adopción de las áreas de oficina** | Crítico | Cada captura debe ser subproducto del trabajo. Respaldo explícito de la dirección. Sin esto el proyecto muere en la etapa 3 |
| **Resistencia a ser medido** | Alto | Presentar la atribución de atrasos como diagnóstico del proceso, no como control de personas. El primer reporte va a incomodar |
| **Durar meses sin ver valor** | Alto | Por eso la etapa 1 entrega schedule vivo + 3WLA en 3-5 semanas |
| **Construir un gestor documental** | Medio | No lo es. Archivo + fecha + versión. Bluebeam y Pytha siguen siendo las herramientas de trabajo |
| **Datos de plantilla mal calibrados** | Medio | Las duraciones de este documento son **propuestas y hay que corregirlas**. Se recalibran con el histórico a partir del sexto mes |
| **El sistema se vuelve pesado de usar** | Medio | Ningún hito puede requerir más de un acto. Si requiere dos, está mal diseñado |

---

## 12. Pendiente de definición

- [ ] **Duraciones**: las de este documento son estimaciones a corregir por Chali y los owners de cada área
- [ ] **Granularidad**: por item/área con rollup al proyecto (definido) — validar contra este mapa
- [ ] **Calendario laboral**: días hábiles, feriados de Central Millwork, semanas de cierre
- [ ] **Fases parciales**: proyectos que entregan por piso o por área con fechas distintas
- [ ] **Responsables reales**: mapear cada rol del documento (Estimator, Engineer, PM, Procurement Manager, Production Manager, Production Assistant, Production Controller, Logistics Manager, Field Specialist, Office Manager, Financial Manager, CFO) contra los roles que existen hoy en la app
- [ ] **Proyectos sin instalación**: el PDF los contempla (p.37). La cadena cierra en S-04
- [ ] **Change orders**: cómo impactan la fecha objetivo — ¿la corren automáticamente o requieren decisión? (el hito de CO se quitó del recorrido en Rev 1, pero el impacto sigue sin definir)

---

**Rev 1 — en revisión con CEO y PM.**
