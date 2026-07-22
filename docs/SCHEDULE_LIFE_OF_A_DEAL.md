# Life of a Deal — Mapa de Hitos

**Documento de diseño · Rev 0 · 2026-07-21**
Estado: **borrador para revisión de Chali**. No implementar hasta aprobación.

Fuentes: `Life of a Deal 2026 Rev0.pdf` (41 páginas, proceso oficial de Central Millwork) + sistema actual (centralmillwork-app).

---

## 1. Qué es esto

El schedule de un proyecto de Central Millwork, desde la oportunidad de bid hasta el pago final,
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

## 3. Las 9 fases

```
QUOTE → CONTRACT → ENGINEERING → MATERIALS → PRODUCTION → QC → SHIPPING → INSTALL → COMPLETED
```

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

### FASE 1 — QUOTE
Owner de fase: **Estimator**

| # | Hito | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|
| Q-01 | Bid identificado y calificado | Estimator | 1 d | — | Alta del deal en el sistema con cliente, tipo y criterio A/B (p.41) | 🔴 |
| Q-02 | T&C revisados y documentados | Estimator | 2 d | Q-01 | PDF de T&C adjunto + decisión pursue/decline registrada + excepciones listadas (p.2, p.3) | 🔴 |
| Q-03 | Estimado elaborado | Estimator | 5-15 d | Q-02 | Monto cargado + scope plans adjuntos (p.4) | 🔴 |
| Q-04 | Peer review del estimado | Estimating Director | 1-2 d | Q-03 | Aprobación del Director registrada en el sistema (p.4) | 🔴 |
| Q-05 | Propuesta enviada al cliente | Estimator | 1 d | Q-04 | Envío disparado desde el sistema (p.4) | 🔴 |
| Q-06 | **Fecha de entrega requerida confirmada** | Estimator | — | Q-05 | Fecha del bid schedule del GC cargada, o respuesta del cliente en el portal (p.5) | 🔴 |
| Q-07 | Schedule preliminar creado y compartido | Estimator + PM | 1 d | Q-06 | Schedule generado por el sistema y enviado al cliente con la nota de que los hitos incumplidos afectan la fecha final (p.5) | 🔴 |

> **Q-06 es el ancla de todo el proyecto.** Q-07 es donde el sistema contesta la pregunta clave:
> *¿esta fecha es alcanzable?* — calculando hacia atrás y devolviendo la fecha límite de adjudicación.

---

### FASE 2 — CONTRACT
Owner de fase: **Estimator** → handoff a **PM/Engineer**

| # | Hito | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|
| C-01 | Proyecto en negociación | Estimator | — | Q-07 | Cambio de etapa en el pipeline (p.6) | 🔴 |
| C-02 | Contrato revisado / addendum emitido | Estimator | 3-10 d | C-01 | PDF del contrato revisado + addendum adjunto (p.6) | 🔴 |
| C-03 | **CONTRATO FIRMADO — día cero** | Estimator + CFO | — | C-02 | PDF firmado subido al proyecto (p.6) | 🔴 |
| C-04 | Depósito de materiales recibido | Office Manager | 5-15 d | C-03 | Registro de cobro con importe y fecha (p.18) | 🔴 |
| C-05 | MTO preliminar creado | Estimator | 1-2 d | C-03 | Archivo MTO preliminar importado al proyecto (p.7) | 🟡 |
| C-06 | Budget del proyecto creado | Estimator | 1 d | C-03 | Budget cargado por área (p.8) | 🔴 |
| C-07 | Project announcement enviado | Estimator | 1 d | C-05, C-06 | Email disparado desde el sistema + carpeta del proyecto creada con documentos (p.9) | 🔴 |
| C-08 | Kickoff call con GC y designer | Estimator + Eng + PM | 1 d | C-07 | Reunión registrada + notas distribuidas desde el sistema (p.10) | 🔴 |
| C-09 | POC transferido a Engineer/PM | Estimator | — | C-08 | Email de handoff disparado desde el sistema (p.11) | 🔴 |

> **C-03 es el día cero operativo.** Todo el plan se ancla ahí. Los días entre Q-05 y C-03 se
> registran como *tiempo de decisión del cliente* y se descuentan del colchón — con alerta y
> recordatorio automático desde el día 5.

---

### FASE 3 — ENGINEERING
Owner de fase: **Engineer** (apoyo PM)

| # | Hito | Tipo | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|---|
| E-01 | Long lead times identificados | GATE | Engineer + PM | 2-3 d | C-07 | Materiales marcados como long-lead con lead time reconfirmado por vendor (p.12) | 🟡 |
| E-02 | Compra anticipada aprobada por cliente | GATE | PM | 3-10 d | E-01 | Aprobación del cliente en el portal (p.12) | 🔴 |
| E-03 | Design call con designer y GC | — | Engineer | 1 d | C-08 | Notas de reunión distribuidas desde el sistema (p.13) | 🔴 |
| E-04 | V/E propuesto al cliente | COND | Engineer + PM | 3-5 d | E-03 | Opciones enviadas + respuesta del cliente registrada (p.14) | 🔴 |
| E-05 | VIF / medición en obra | COND | Field Specialist | 1-2 d | C-08 | Medidas y fotos subidas desde la app móvil con fecha y ubicación (p.21) | 🔴 |
| E-06 | Muestras solicitadas al cliente | — | Engineer | 1 d | E-03 | Muestra creada con fecha de compromiso (p.17) | 🟢 |
| E-07 | Muestras fabricadas y enviadas | — | Shop Manager | 10-14 d | E-06 | Envío registrado con foto del paquete (p.17) | 🟢 |
| E-08 | **Muestras aprobadas por el cliente** | GATE | Engineer | 5-15 d | E-07 | Aprobación del cliente en el portal (p.17) | 🟡 |
| E-09 | Shop drawings emitidos al cliente | — | Engineer | 10-25 d | E-03, E-05 | Submittal generado y enviado desde el sistema con PDF adjunto (p.19) | 🔴 |
| E-10 | **Shop drawings aprobados por el cliente** | GATE | Engineer | 10-20 d | E-09 | Aprobar / Aprobar con comentarios / Rechazar en el portal, con fecha y quién (p.19, p.20) | 🔴 |
| E-11 | Revisiones incorporadas y resubmittal | COND | Engineer | 3-10 d | E-10 | Nueva versión emitida desde el sistema (p.20) | 🔴 |
| E-12 | **MTO final liberado a compras** | GATE | Engineer | 2-5 d | E-10, C-04 | MTO marcado como liberado + confirmación del depósito (p.18) | 🟡 |
| E-13 | **Release to Production** | GATE | Engineer | 1 d | E-10 | Planos con sello "Approved" adjuntos + email de release disparado desde el sistema (p.22) | 🔴 |
| E-14 | **Archivos CNC entregados** | GATE | Engineer | 2-5 d | E-13 | Archivos CNC subidos y asociados a la OP (p.29) | 🔴 |
| E-15 | Change orders comunicados | CONT | Engineer + PM | — | — | CO creado, validado por Estimator y enviado al cliente (p.16) | 🔴 |
| E-16 | Revisión de schedule de Ingeniería | CONT | Engineer + PM | semanal | — | Revisión registrada con riesgos marcados y comunicados al cliente (p.15) | 🔴 |

---

### FASE 4 — MATERIALS
Owner de fase: **Procurement Manager**

| # | Hito | Tipo | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|---|
| M-01 | Revisión de schedule de Compras | CONT | Procurement Mgr | semanal | C-07 | Revisión registrada con materiales de riesgo marcados y comunicados a PM y Producción (p.23) | 🔴 |
| M-02 | Budget de materiales validado | — | Procurement Mgr | 2-3 d | E-12 | Validación contra estimado registrada, con discrepancias resueltas (p.24) | 🔴 |
| M-03 | Long-lead ordenados | GATE | Procurement Mgr | 1-3 d | E-02 | OC emitida (p.25) | 🟢 |
| M-04 | MTO cotizado | — | Procurement Mgr | 5-10 d | E-12 | Cotizaciones recibidas por vendor (p.26) | 🟢 |
| M-05 | OCs emitidas | — | Procurement Mgr | 2-3 d | M-04, M-02 | OCs generadas con ETA por vendor (p.26) | 🟢 |
| M-06 | POs a subcontratistas | COND | PM + CFO | 5-10 d | E-13 | PO firmada por el subcontratista (p.27) | 🔴 |
| M-07 | **Material recibido y stockeado 100%** | GATE | Procurement Mgr | según lead time | M-05 | Todas las recepciones cerradas, sin faltantes abiertos (p.28) | 🟢 |

> **M-07 es normalmente el hito del camino crítico.** El lead time del vendor más lento manda.

---

### FASE 5 — PRODUCTION
Owner de fase: **Production Manager**

| # | Hito | Tipo | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|---|
| P-01 | **PRODUCTION INTAKE — gate compuesto** | GATE | Production Mgr | 1 d | **E-08 + E-10 + E-13 + E-14 + M-07** | Los 5 requisitos verificados en verde. El sistema no deja abrir producción sin ellos (p.30) | 🔴 |
| P-02 | Distribución a producción | — | Production Controller | 1 d | P-01 | OPs creadas con planos y MTO asociados, CNC entregado al operador (p.29) | 🟡 |
| P-03 | Budget de labor validado | — | Production Mgr | 1 d | P-01 | Horas presupuestadas vs. planificadas, riesgos informados a PM (p.32) | 🔴 |
| P-04 | 3-Week Lookahead publicado | CONT | PM + Production Mgr | semanal | P-01 | 3WLA generado por el sistema y compartido a la empresa (p.31) | 🔴 |
| P-05 | Fabricación en curso | CONT | Production Team | 10-30 d | P-02 | Avance real por estación y por item — ya lo mide el kiosko (p.33) | 🟢 |
| P-06 | Fabricación completa | — | Production Mgr | — | P-05 | Todos los items del proyecto en estación final (p.33) | 🟢 |

> **P-01 es el corazón del motor de dependencias.** Es la regla del *Production Intake* de la
> página 30 convertida en gate duro. Su fecha real = la más tardía de sus 5 predecesores, y el
> sistema nombra cuál fue.

---

### FASE 6 — QC
Owner de fase: **Production Assistant**

| # | Hito | Tipo | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|---|
| QC-01 | Controles por etapa | CONT | Production Assistant | — | P-05 | Inspecciones registradas en assembly, laminate y pintura (p.34) | 🟢 |
| QC-02 | **QC final aprobado** | GATE | Production Assistant | 1-3 d | P-06 | Inspección final con fotos de todos los items (p.34) | 🟢 |
| QC-03 | Reproceso por defecto | COND | Production Mgr | variable | QC-01/02 | Decisión de reproceso registrada con estación destino y días perdidos (p.34) | 🟢 |

---

### FASE 7 — SHIPPING
Owner de fase: **Logistics Manager**

| # | Hito | Tipo | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|---|
| S-01 | Packaging completo | — | Production Team | 1-3 d | QC-02 | Items etiquetados con proyecto/item/secuencia, contra shipping list (p.35) | 🟡 |
| S-02 | Delivery request emitido (48 h) | GATE | PM | — | S-01 | Solicitud enviada a Logística y Producción con 48 h de anticipación (p.38) | 🔴 |
| S-03 | Transporte confirmado + BOL | — | Logistics Mgr | 1-2 d | S-02 | Camión confirmado y BOL emitido (p.36) | 🔴 |
| S-04 | **Despachado** | — | Logistics Mgr | 1 d | S-03 | Fotos de carga, número de precinto y BOL firmado subidos (p.36) | 🔴 |
| S-05 | Recepción en obra coordinada | COND | Field Specialist | — | S-04 | Coordinación con el instalador registrada. Sin instalación, no aplica (p.37) | 🔴 |

---

### FASE 8 — INSTALL
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

> **I-03 es la dependencia externa del GC.** Merece tratamiento propio: cuando la obra no está
> lista, el atraso **no es de Central Millwork** y el sistema tiene que dejarlo asentado con esa
> atribución. Es tu respaldo documental frente al GC.

---

### FASE 9 — COMPLETED
Owner de fase: **PM + CFO**

| # | Hito | Responsable | Dura | Depende de | Evidencia que lo cierra | Hoy |
|---|---|---|---|---|---|---|
| X-01 | Closeout report interno | PM | 2-3 d | I-07 | Reporte con feedback y fotos cargado (p.39) | 🔴 |
| X-02 | Carpeta del proyecto archivada | PM | 1 d | X-01 | Archivo del proyecto marcado como cerrado (p.39) | 🔴 |
| X-03 | **PAGO FINAL RECIBIDO** | Financial Mgr | 30-90 d | I-07 | Cobro registrado con número de factura e importe (p.39) | 🔴 |
| X-04 | P&L final emitido | CFO | 5 d | X-03 | Reporte de P&L del proyecto (p.39) | 🔴 |

> **X-03 cierra formalmente el proyecto.** Es el único hito posterior a la entrega física y
> tiene su propio reloj: se mide contra los términos de pago del contrato, con alertas de
> cobranza cuando se pasa.

---

## 5. Resumen de instrumentación

| Fase | Hitos | 🟢 ya existe | 🟡 parcial | 🔴 a construir |
|---|---|---|---|---|
| Quote | 7 | 0 | 0 | 7 |
| Contract | 9 | 0 | 1 | 8 |
| Engineering | 16 | 2 | 3 | 11 |
| Materials | 7 | 4 | 0 | 3 |
| Production | 6 | 2 | 1 | 3 |
| QC | 3 | 3 | 0 | 0 |
| Shipping | 5 | 0 | 1 | 4 |
| Install | 7 | 0 | 1 | 6 |
| Completed | 4 | 0 | 0 | 4 |
| **Total** | **64** | **11** | **7** | **46** |

**Lectura honesta:** el 17% del recorrido está instrumentado hoy, y está concentrado en el
centro (Materials, Production, QC). Los dos extremos —donde se pierden las semanas— son terreno nuevo.

---

## 6. Los gates duros

Los 8 puntos donde el sistema **bloquea** el avance hasta que se cumplan los requisitos:

| Gate | Requiere | Consecuencia si falla |
|---|---|---|
| **C-03** Contrato firmado | Q-07 | El reloj no arranca. Alerta diaria desde el día 5 |
| **E-12** MTO liberado | Shop drawings aprobados + depósito recibido | Compras no puede cotizar |
| **E-13** Release to Production | Planos aprobados y sellados | Producción no puede abrir |
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

**Atribución de días perdidos** — cada hito que cierra tarde registra a quién corresponde el atraso:
Cliente · GC · Vendor · Estimating · Engineering · Procurement · Production · Logistics · Field · Finanzas.

Ese acumulado es el reporte que a fin de año contesta *"¿por qué entregamos tarde?"* con números
en vez de opiniones — y es el argumento documentado frente a GCs y clientes.

---

## 8. Portal de cliente

Pieza propia, con visión de producto: **el cliente monitorea su proyecto en vivo**.

**Acceso:** link con token por proyecto, sin necesidad de crear cuenta. Cada contacto del cliente
tiene su propio link, de modo que las acciones quedan atribuidas a una persona concreta.

**El cliente puede:**
- Ver el timeline de su proyecto por hitos, con estado y fechas
- Ver de qué está esperando el proyecto **y de quién es la pelota**, incluido cuando es de él
- **Aprobar / aprobar con comentarios / rechazar**: shop drawings, muestras, V/E, change orders
- Dar el **sign-off final**
- Ver fotos de avance de fabricación e instalación
- Descargar documentos: contrato, planos aprobados, BOL, shipping list

**El cliente NO puede ver:** costos, márgenes, budgets, vendors, precios ni información interna.

**Automático hacia el cliente:** recordatorio cuando un hito suyo está por vencer o venció, con
el impacto explícito sobre la fecha de entrega — *"los shop drawings llevan 12 días en revisión.
Cada día adicional corre la entrega del 15 de octubre."*

**Por qué es la pieza de mayor impacto:** convierte el agujero negro *"esperando al cliente"* en
un dato con fecha, hora y responsable. Es el 40% de tus atrasos hoy, y es lo que más barato se
instrumenta.

---

## 9. Cronograma de construcción

Seis etapas. Cada una **funciona sola** y entrega valor aunque se pause. Duraciones estimadas
al ritmo actual de trabajo (Chali + Claude, sesiones regulares, sin equipo de desarrollo).

| # | Etapa | Qué incluye | Duración | Qué se gana al terminar |
|---|---|---|---|---|
| **1** | **Motor de schedule** | Calendario laboral, plantilla de hitos, cálculo hacia atrás, dependencias, holgura, semáforo, atribución de atrasos, timeline en el detalle de proyecto | 3-4 sem | El schedule existe y vive, alimentado por Materials + Production + QC (lo que ya está instrumentado). La mitad del recorrido, real, desde el día uno |
| **2** | **Portal de cliente** | Links tokenizados, timeline público, aprobaciones con fecha, recordatorios automáticos, fotos de avance | 3-4 sem | Se cierra el agujero negro de las aprobaciones. E-08, E-10, I-07 pasan a ser datos duros |
| **3** | **Ingeniería** | Submittals, versiones y revisiones de shop drawings, archivos CNC, release to production, MTO liberado, change orders, VIF | 6-8 sem | La fase más grande y la que más atrasos destapa. Cierra el gate P-01 completo |
| **4** | **Field, Shipping e Install** | BOL, foto de carga y precinto, delivery request, check-in en obra, avance de instalación, punch list — todo en móvil | 4-6 sem | El recorrido queda cerrado punta a punta hasta el sign-off |
| **5** | **Deals y Estimados** | Pipeline de bids, T&C, estimado, peer review, propuesta, contrato, depósito, announcement, kickoff | 5-7 sem | El chequeo de factibilidad al cotizar. La fecha objetivo nace en el sistema |
| **6** | **Cierre financiero** | Budget por área, facturación por hito, cobranza, pago final, P&L. Integración con QuickBooks | 4-6 sem | El proyecto cierra formalmente donde debe cerrar |

**Total: 25-35 semanas de trabajo efectivo — entre 7 y 9 meses.**

Advertencia honesta: esa estimación asume constancia. Si se corta por semanas para atender
producción, se estira proporcionalmente. Y no incluye el tiempo de **adopción**, que en las áreas
que hoy trabajan fuera del sistema puede pesar más que el desarrollo.

### Por qué este orden

- La etapa 1 arranca donde **ya hay datos**: el motor se prueba con la realidad, no con datos inventados.
- La etapa 2 va segunda porque es **la mayor ganancia por el menor código**.
- La etapa 3 es la más grande, y va cuando el motor ya está probado y hay costumbre de usarlo.
- Las etapas 5 y 6 van al final porque son las que menos bloquean: el schedule ya funciona sin ellas,
  arrancando desde el contrato en vez de desde el bid.

---

## 10. Riesgos del proyecto

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Adopción de las áreas de oficina** | Crítico | Cada captura debe ser subproducto del trabajo (P3). Respaldo explícito de Chali. Sin esto el proyecto muere en la etapa 3 |
| **Resistencia a ser medido** | Alto | Presentar la atribución de atrasos como diagnóstico del proceso, no como control de personas. El primer reporte va a incomodar |
| **Durar 8 meses sin ver valor** | Alto | Por eso la etapa 1 entrega un schedule vivo en 3-4 semanas |
| **Construir un gestor documental** | Medio | No lo es. Archivo + fecha + versión. Bluebeam y Pytha siguen siendo las herramientas de trabajo |
| **Datos de plantilla mal calibrados** | Medio | Las duraciones de este documento son **propuestas y hay que corregirlas** con datos reales. Se recalibran con el histórico a partir del sexto mes |
| **El sistema se vuelve pesado de usar** | Medio | Ningún hito puede requerir más de un acto. Si requiere dos, está mal diseñado |

---

## 11. Pendiente de definición

- [ ] **Duraciones**: las de este documento son estimaciones a corregir por Chali y los owners de cada área
- [ ] **Granularidad**: ¿un schedule por proyecto, o por item/área con rollup? (definido previamente: por item con rollup — validar contra este mapa)
- [ ] **Calendario laboral**: días hábiles, feriados de Central Millwork, semanas de cierre
- [ ] **Fases parciales**: proyectos que entregan por piso o por área con fechas distintas
- [ ] **Responsables reales**: mapear cada rol del documento (Estimator, Engineer, PM, Procurement Manager, Production Manager, Production Assistant, Production Controller, Logistics Manager, Field Specialist, Office Manager, Financial Manager, CFO) contra los roles que existen hoy en la app
- [ ] **Proyectos sin instalación**: el PDF los contempla (p.37). La cadena cierra en S-04
- [ ] **Change orders**: cómo impactan la fecha objetivo — ¿la corren automáticamente o requieren decisión?

---

**Rev 0 — pendiente de revisión y corrección de Chali.**
