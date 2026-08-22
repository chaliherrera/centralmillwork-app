# Arquitectura de Central Millwork — Módulos, Contratos y la Espina

> Documento de diseño (no de código). Define **cómo pensamos el sistema**: la columna vertebral,
> las reglas de cada módulo y cómo se hablan entre sí. Contra esto medimos cada decisión.
> **Evolución, no reescritura.** — 2026-08-22

---

## 0. El norte (por qué existe el sistema)

- **Objetivo del negocio:** entregar muebles de alta calidad **en la fecha comprometida**.
- **Objetivo del software:** darnos los datos para **adaptarnos y CUMPLIR LA FECHA que comprometemos**, con calidad.
- **Principio rector (el corazón):** *ningún plan se cumple.* Por eso el sistema **no es un plan — es un lazo
  adaptativo.** Detecta la deriva **temprano**, muestra **dónde y quién**, y ayuda a **re-comprometer con los ojos
  abiertos**. Un cliente perdona mil veces un "te aviso hoy que serán 3 semanas más" antes que un incumplimiento el día de la entrega.

---

## 1. La espina: Life of a Deal

Es la **columna vertebral**: la línea de tiempo del proyecto (los hitos, calculados hacia atrás desde la entrega)
**+ la capacidad** de los recursos. Todo lo demás cuelga de acá.

- **Integra todos los módulos** en modo **hub-and-spine, NO malla.** Cada módulo le habla **a la espina**, no a los
  otros directamente. Eso evita las dependencias cruzadas (N×N) y la fragmentación.
- Es **donde se toman las decisiones cross-módulo**: el semáforo, la **factibilidad de una fecha**, la fecha comprometida.
- **Regla de oro — la fecha objetivo es SAGRADA:** nunca se recalcula sola. Cuando la realidad la amenaza, se pone en
  rojo. Moverla es una **decisión humana registrada**. Sin esto, todo se ve siempre en verde y volvés al Excel muerto.

---

## 2. Los contratos de cada módulo

Cada módulo es un **contexto con dueño**: autónomo en su dominio, consistente en sus bordes. Su contrato =
**qué posee · qué señales emite a la espina · qué consume · qué capacidad expone · su estado hoy.**

| Módulo | Posee | Emite a la espina | Consume | Capacidad que expone | Estado |
|---|---|---|---|---|---|
| **Estimados** | Contrato, fecha de entrega, presupuesto/tamaño | **C-03 (día cero)** + genera el plan | La **factibilidad** (tiempo+capacidad) | — (no es recurso) | **Upgrade** (chequeo de factibilidad) |
| **Ingeniería** | Tareas (ing_tareas), planos, CNC, revisión | E-03 · E-06 · E-09 · E-10 · E-11 | Kickoff (C-08) | **Por ingeniero — INELÁSTICA** | **Creció** (nuevo, con Excel) |
| **Compras** | OCs, materiales, recepciones | M-03 · M-04 · M-05 · M-07 (auto) | MTO liberado (E-09) | Lead time del vendor (externa) | **Sólido** (no se toca) |
| **Producción** | OPs, estaciones/kiosko | P-01 · P-05 · P-06 (auto) | Production Intake gate | **Taller — ELÁSTICA** (turnos/contratar) | **Retoque** (de forma) |
| **QC** | Inspecciones | QC-01 · QC-02 | Fabricación en curso | — | Parte de Producción |
| **Muestras** | Ciclo de muestras | **E-04 · E-05** (cable a construir) | Solicitud de muestra | Taller (fabrica la muestra) | Bandeja Tareas ✅ |
| **Despacho / Logística** | BOL, despacho, precinto | S-03 · S-04 | QC final | Transporte | Escritorio ✅ |
| **Instalación / Field** | Punch list, sign-off | I-04 · I-05 · I-06 · **I-07 (entrega)** | Obra lista, material | Cuadrillas de instalación | Móvil ✅ (sin deploy) |
| **Finanzas** | Pagos | C-04 · X-03 | Hitos que gatillan pago | — | Escritorio ✅ |
| **Portal Cliente** (transversal) | Aprobaciones del cliente | E-05 · E-07 · I-07 (las aprueba el cliente) | La vista curada del proyecto | — | ✅ (falta Resend real) |

**Lectura clave:** cada módulo hace **su trabajo con sus reglas**, y hacia la espina hace **dos cosas**:
(1) emite **señales/evidencia** cuando pasa algo real, y (2) expone su **capacidad/restricción**.

---

## 3. Las convenciones compartidas (el idioma común)

Autonomía adentro, **consistencia en los bordes.** Todos los módulos comparten:

1. **Señal = evidencia de un hecho real, con su dueño.** Nunca un checkbox. La fecha la pone el sistema a partir de lo
   que pasó (una OC emitida, una OP completada, un archivo subido, una aprobación del cliente).
2. **Integración unidireccional:** el módulo avisa a la espina con un *hook best-effort post-commit* (`recompute…Safe`).
   El módulo no sabe nada de la espina más allá de "avisé". Si el aviso falla, el trabajo del módulo no se rompe.
3. **Un solo modelo de fechas y estados:** planeada (baseline), proyectada (con la realidad), real (cuando pasó);
   semáforo verde/amarillo/rojo/gris. Nadie inventa su propio esquema.
4. **Cierre hacia atrás + freno hacia adelante:** la cadena se mantiene coherente en ambos sentidos.

---

## 4. La capacidad, ciudadano de primera clase

Lo que faltaba y lo que hace posible responder *"¿podemos comprometer esta fecha?"*:

- **Ingeniería = cuello INELÁSTICO.** No se suman ingenieros rápido (**curva de aprendizaje de 60 días**). Es el
  **límite real de cuántos proyectos y con qué fechas** podemos tomar. Se modela **por persona**. Punto único: **CNC = solo Santos**.
- **Taller = ELÁSTICO.** Si se llena, turnos extra o contratar carpinteros. Su tope ("6 proyectos") es **blando**.
- **Compras = restricción externa** (lead time del vendor). No es capacidad interna: es un informe de calibración.
- **Factibilidad = espina (tiempo) + capacidad de los módulos-recurso.** El sistema avisa con **60 días** de
  anticipación cuándo la demanda va a superar la capacidad de CNC → decisión estratégica (entrenar un 2º Santos).

---

## 5. El lazo adaptativo (cómo se "cumple la fecha")

El sistema **no desafía la física**: si la fecha original se vuelve imposible, no la cumple por magia. Lo valioso es el **ciclo**:

```
   hecho real  →  el sistema recalcula  →  muestra la deriva + atribución  →  actuás  →  re-comprometés
      ▲                                                                                        │
      └────────────────────────────  (y el ciclo se repite)  ◄─────────────────────────────────┘
```

- **Dos relojes** (planeado vs proyectado) → ves la deriva *en vivo*, no a fin de mes.
- **Recompute ante cada hecho real** → cuando algo se corre, te enterás **hoy**.
- **Atribución de atraso** → no solo "vamos tarde", sino **quién** lo causó → dónde actuar (el que llega último tiene la pelota).
- **"Qué pasa ahora"** → qué hacer dado dónde estás *realmente*.
- **Re-comprometer:** si no se recupera, mover la fecha **a los ojos abiertos y registrado** — no un deslizamiento silencioso.

*Cumplir la fecha* = cumplir **la fecha que comprometiste con los datos en la mano**, no la que dibujaste el día uno.

---

## 6. Evolución, no reescritura

**Se conserva (no se toca):** el motor (cálculo hacia atrás + semáforo + evidencia), Compras, Producción (salvo forma),
el patrón de señales, el portal, los escritorios por rol.

**Evoluciona:** Ingeniería → modelo de recursos (ing_tareas) que emite señales · Estimados → chequeo de factibilidad ·
la capacidad → ciudadano de primera clase · las duraciones → predichas por tamaño (histórico de 2 años).

**Lo que NO hacemos:** reescribir de cero · malla N×N entre módulos · que cada módulo invente sus propias convenciones.

---

## 7. Principios que no se negocian

1. **La fecha objetivo es sagrada** (moverla = decisión humana registrada).
2. **Evidencia, no declaración** (la fecha la pone el sistema).
3. **El registro es subproducto del trabajo**, no trabajo extra.
4. **El avance se cuenta** (sub-hitos con evidencia), nunca se tipea un %.
5. **El que llega último tiene la pelota** (la atribución nombra al predecesor más tardío).

---

## 8. Roadmap (alto nivel — el detalle lo define el plan de acción)

- **Ahora:** Ingeniería con el Excel (Disponibilidad, *provisional*) + calibración con el **creador** (8 días).
- **Con el creador:** aclarar el **"%" real** → capacidad exacta por persona · traer **duraciones por tamaño** (histórico) · validar fidelidad.
- **Siguiente:** **factibilidad en Estimados** (fecha+presupuesto → factible/fecha real) + **reserva de capacidad al aceptar** · conectar Ingeniería a la espina (señales E-*).
- **Después:** upgrade de Estimados · retoque de Producción · **carga real del Taller** · reminders del portal (Resend).
- **Hardening (review de Fable):** tests del motor · merge a main · `schedule_eventos` on-change+prune · fix QC-02 · cable Muestras↔E-05.

---

*Este documento es el "reimaginar" hecho diseño. Se actualiza cuando cambia una decisión de fondo.*
