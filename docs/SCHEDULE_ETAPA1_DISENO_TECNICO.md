# Life of a Deal — Etapa 1: Diseño Técnico del Motor

**Documento de diseño técnico · Rev 0 · 2026-08-10**
Estado: **borrador para aprobación de Chali**. No escribir código hasta aprobación.

Depende de: [`SCHEDULE_LIFE_OF_A_DEAL.md`](SCHEDULE_LIFE_OF_A_DEAL.md) (Mapa de Hitos Rev 1, aprobado).
Este documento traduce ese mapa en arquitectura de software, acotado **solo a la Etapa 1**.

---

## 0. Para leer esto sin ser programador

Este documento tiene tablas de base de datos y nombres técnicos. No hace falta entenderlos línea por
línea. Lo que sí importa que revises y apruebes:

- **Qué entra y qué no entra** en la primera entrega (sección 1).
- **La decisión de granularidad** — arrancar por proyecto y bajar a item después (sección 3).
- **Qué necesito de vos antes de codear** (sección 11) — son 3 definiciones cortas.

El resto es el *cómo* interno, que es mi responsabilidad. Está escrito para que quede constancia y para
que un futuro programador (o yo en otra sesión) pueda retomarlo sin perder contexto.

---

## 1. Alcance de la Etapa 1

**Objetivo:** que el schedule exista y viva, alimentado por lo que el sistema ya mide hoy
(Materials, Production, QC), mostrado en el detalle de proyecto, más el formulario 3-Week Lookahead
auto-generado.

### Entra
- **El motor de cálculo**: plantilla de hitos, cálculo hacia atrás desde la fecha objetivo, dependencias, holgura, semáforo.
- **Captura automática de fechas reales** desde los módulos ya instrumentados (compras, producción, QC).
- **Atribución de atrasos** (qué área/actor causó cada día perdido) — la estructura de datos, aunque en Etapa 1 solo se pueble desde las fases instrumentadas.
- **Timeline del proyecto**: un tab nuevo en el detalle de proyecto que muestra la cadena de hitos con su semáforo.
- **Formulario 3-Week Lookahead** generado por el sistema.

### No entra (etapas posteriores)
- Portal de cliente (Etapa 2)
- Módulo de Ingeniería, submittals, CNC, release (Etapa 3)
- Field / Shipping / Install en móvil (Etapa 4)
- Contract intake y captura de la fase Contract (Etapa 5)
- Cierre financiero (Etapa 6)

**Importante:** los hitos de las fases todavía no instrumentadas (Contract, Engineering, Shipping,
Install, Completed) **sí aparecen en el timeline** y el motor **sí calcula sus fechas planeadas**
(porque se necesitan para que el cálculo hacia atrás sea completo). Lo que no tienen todavía es
*captura de fecha real*: quedan como hitos "en espera". **No se tildan a mano** — eso violaría el
Principio P2. Su fecha real llega cuando se construya la etapa que la instrumenta.

---

## 2. Conceptos del motor

### Plantilla vs. Plan
- Una **plantilla** es el catálogo canónico de los 53 hitos, con sus duraciones por defecto y sus dependencias. Se define una vez y se edita rara vez. Puede haber varias (millwork estándar, comercial, closets…).
- Un **plan** es la instancia de una plantilla para un proyecto concreto. Al crear el plan, se copian los hitos de la plantilla como **hitos del plan**, y a partir de ahí el proyecto tiene vida propia.

### Los dos relojes (del Mapa de Hitos, P5)
- **Fecha planeada (hacia atrás):** se calcula una vez desde la fecha objetivo. Es la referencia.
- **Fecha real / proyectada (hacia adelante):** se actualiza con cada hecho. Es dónde vamos a caer.
- **Holgura = fecha planeada − fecha proyectada.** Negativa = riesgo.

### El ancla
La **fecha objetivo** del plan sale de `proyectos.fecha_fin_estimada` (ya existe). El plan guarda su
propia copia (`fecha_objetivo`) para que, si alguien cambia la del proyecto, quede registrado como
decisión (Principio P1) y no se pierda la original.

---

## 3. Decisión de granularidad — recomendación

El Mapa aprobado dice **"por item/área con rollup al proyecto"**. Eso es lo correcto como destino.
Pero para la Etapa 1 recomiendo:

> **Arrancar el plan a nivel proyecto, con el modelo de datos ya preparado para bajar a item.**

Por qué: el motor (cálculo hacia atrás, dependencias, semáforo) es idéntico a nivel proyecto o item;
lo que cambia es *cuántos planes* corren en paralelo. Probar la lógica con un plan por proyecto es más
simple, se valida antes, y el modelo de datos (campo `scope` en la tabla de planes) ya permite crear
planes por item sin migración nueva cuando lleguemos ahí.

Esto **no** es recortar el alcance: es ordenar la secuencia. El item queda soportado desde el día uno
en la estructura, y se activa en una etapa posterior sin rehacer nada.

*(Esta es una de las 3 decisiones que necesito confirmes — sección 11.)*

---

## 4. Modelo de datos (migración `046_schedule.sql`)

Seis tablas nuevas. Sigo el estilo de las migraciones existentes (prefijo `046_`, `CREATE TABLE IF
NOT EXISTS`, cada migración en su transacción, tracked en `schema_migrations`).

### 4.1 `schedule_plantillas` — catálogo de plantillas
| Columna | Tipo | Nota |
|---|---|---|
| id | serial PK | |
| nombre | varchar | "Millwork estándar" |
| descripcion | text | |
| activa | boolean | |
| created_at / updated_at | timestamptz | |

### 4.2 `schedule_plantilla_hitos` — los 53 hitos canónicos de una plantilla
| Columna | Tipo | Nota |
|---|---|---|
| id | serial PK | |
| plantilla_id | int FK → schedule_plantillas | |
| codigo | varchar | 'M-07', 'P-01', 'E-01a'… |
| fase | varchar | 'CONTRACT'…'COMPLETED' |
| nombre | varchar | |
| tipo | varchar | 'normal' / 'gate' / 'cont' / 'cond' |
| es_gate | boolean | |
| rol_responsable | varchar | rol del PDF (mapeo pendiente, sección 11) |
| dur_dias_default | int | duración en días hábiles |
| dur_dias_min / dur_dias_max | int | rango informativo |
| parent_codigo | varchar null | para sub-tareas (E-01a → E-01) |
| orden | int | orden de display |
| fuente_dato | varchar | cómo se captura la fecha real (ver §6) |

### 4.3 `schedule_plantilla_dependencias` — el grafo de dependencias
| Columna | Tipo | Nota |
|---|---|---|
| id | serial PK | |
| plantilla_id | int FK | |
| hito_codigo | varchar | el que depende |
| depende_de_codigo | varchar | su predecesor |

*(P-01 tendrá 5 filas acá: depende de E-05, E-07, E-10, E-11, M-07.)*

### 4.4 `schedule_planes` — un plan por proyecto (o item)
| Columna | Tipo | Nota |
|---|---|---|
| id | serial PK | |
| proyecto_id | int FK → proyectos | |
| plantilla_id | int FK | |
| scope | varchar | 'proyecto' (Etapa 1) / 'item' (futuro) |
| item_ref | varchar null | número de item, solo si scope='item' |
| fecha_objetivo | date | copia de proyectos.fecha_fin_estimada al crear |
| fecha_objetivo_original | date | la primera; nunca cambia (P1) |
| semaforo | varchar | peor semáforo de la cadena crítica |
| holgura_dias | int | del proyecto |
| created_at / updated_at | timestamptz | |

### 4.5 `schedule_hitos` — instancias de hito dentro de un plan
| Columna | Tipo | Nota |
|---|---|---|
| id | serial PK | |
| plan_id | int FK → schedule_planes | |
| codigo | varchar | copiado de la plantilla |
| fecha_planeada | date | calculada hacia atrás |
| fecha_baseline | date | la primera planeada; para medir slippage |
| fecha_real | timestamptz null | cuándo se cumplió (null si no) |
| fecha_proyectada | date | del reloj hacia adelante |
| estado | varchar | 'pendiente' / 'cumplido' / 'en_riesgo' / 'vencido' / 'no_aplica' |
| semaforo | varchar | 'verde' / 'amarillo' / 'rojo' / 'gris' |
| holgura_dias | int | |
| responsable_usuario_id | uuid null FK → usuarios | quién lo tiene |
| atribucion_atraso | varchar null | 'cliente'/'gc'/'vendor'/'engineering'… |
| evidencia_ref | jsonb null | de dónde salió la fecha real (id de recepción, OP, etc.) |
| created_at / updated_at | timestamptz | |

### 4.6 `schedule_feriados` — calendario laboral
| Columna | Tipo | Nota |
|---|---|---|
| fecha | date PK | |
| descripcion | varchar | "Thanksgiving", "cierre de fin de año" |

Días hábiles = lunes a viernes **menos** los que estén en esta tabla. (La lista de feriados es una de
las 3 definiciones pendientes — sección 11.)

### 4.7 `schedule_eventos` — bitácora de recálculos
| Columna | Tipo | Nota |
|---|---|---|
| id | serial PK | |
| plan_id | int FK | |
| hito_codigo | varchar null | |
| tipo | varchar | 'recalculo' / 'fecha_real' / 'cambio_objetivo' |
| descripcion | text | legible por humanos |
| dias_delta | int null | cuántos días movió |
| disparado_por | varchar | 'recepcion' / 'op' / 'manual' / 'cron' |
| payload | jsonb null | |
| created_at | timestamptz | |

Esta tabla es la que responde *"¿por qué se movió esto?"* — cada recálculo deja rastro.

---

## 5. El algoritmo de cálculo hacia atrás

En palabras simples:

1. El hito final (entrega) se ancla a la **fecha objetivo**.
2. Para cada hito, su **fecha planeada de fin** = la fecha planeada de inicio del hito que le sigue.
3. Su **fecha planeada de inicio** = fecha de fin − su duración, contando **solo días hábiles**.
4. Se recorre el grafo desde el final hacia el principio (orden topológico inverso).
5. Cuando un hito tiene **varios sucesores**, se toma la fecha más temprana que le exijan (el más apremiante manda).

En términos técnicos: es un recorrido topológico inverso sobre el DAG de dependencias, restando
duraciones en días hábiles. El grafo se valida al crear la plantilla (no puede haber ciclos).

Salida: cada `schedule_hitos.fecha_planeada` queda escrita. La primera vez se copia también a
`fecha_baseline` (la línea de base contra la que después medimos cuánto se corrió).

---

## 6. Captura de fechas reales — solo lo instrumentado en Etapa 1

Cada hito de la plantilla tiene una `fuente_dato` que dice cómo se entera de que se cumplió. En
Etapa 1, las fuentes activas son:

| Hito | fuente_dato | Cómo el motor sabe que se cumplió (datos reales del sistema) |
|---|---|---|
| M-03 Long-lead ordenados | `oc_emitida` | Existe OC del proyecto en estado ≥ `enviada` para material long-lead |
| M-04 MTO cotizado | `cotizacion` | `solicitudes_cotizacion` con respuesta recibida |
| M-05 OCs emitidas | `oc_emitida` | OCs del proyecto en estado ≥ `enviada` |
| M-07 Material recibido 100% | `readiness` | `getProyectoItemsReadiness` devuelve todos los items en LISTO |
| P-05 Fabricación en curso | `op_estacion` | Alguna OP del proyecto con `status='En Proceso'` |
| P-06 Fabricación completa | `op_estacion` | Todas las OPs del proyecto con `status='Completada'` |
| QC-01 Controles por etapa | `qc` | `qc_inspecciones` registradas |
| QC-02 QC final aprobado | `qc` | Inspección final aprobada |

Los demás hitos tienen `fuente_dato='manual_futuro'`: aparecen en el timeline, tienen fecha planeada,
pero su fecha real queda null hasta que se construya su etapa. **Nunca se tildan a mano.**

### Dónde se engancha el recálculo (puntos de inserción reales)

El sistema no tiene eventos globales; el patrón es llamar una función dentro de la misma transacción,
antes del COMMIT (igual que `recomputeMaterialesEstadoForOC`). La función nueva:

```
recomputeScheduleForProyecto(client, proyecto_id)
```

Se inserta en dos lugares que ya existen:

1. **`recepcionesController.ts` → `createRecepcionCompleta`** (cerca de línea 202, junto a
   `recomputeMaterialesEstadoForOC`): cuando llega material, recalcula M-07 y todo lo que dependa.
2. **`produccionController.ts` → `avanzarOrdenInterno`** (rama donde la OP completa su última estación,
   cerca de línea 507): cuando una OP termina, recalcula P-05/P-06 y QC.

Adicionalmente, al **emitir una OC** (`ordenesCompraController.ts → updateEstadoOrden`) para capturar M-03/M-05.

Un **job diario** (o al abrir el proyecto) recalcula la proyección y el semáforo aunque no haya
eventos — para que el paso del tiempo mueva las holguras (un hito no cumplido cuya fecha planeada ya
pasó se pone en rojo solo). *Nota: hoy el cron del proyecto está apagado (decisión 2026-07-12); en
Etapa 1 evaluamos si el recálculo del semáforo corre en un cron liviano o al consultar el timeline.*

---

## 7. Semáforo y atribución

**Semáforo por hito** (del Mapa, sección 7):
- Verde: holgura ≥ 3 días hábiles
- Amarillo: 0 a 3 días
- Rojo: holgura negativa
- Gris: predecesores sin cumplir (todavía no aplica)

**Semáforo del proyecto** = el peor de la cadena crítica.

**Atribución de atraso:** cuando un hito cierra después de su `fecha_baseline`, se registra
`atribucion_atraso` según el `rol_responsable` del hito. En Etapa 1 esto se puebla solo desde las
fases instrumentadas (un material que llega tarde → atribución a Vendor/Procurement). El reporte
consolidado por área es una vista sobre `schedule_hitos` + `schedule_eventos`.

---

## 8. El formulario 3-Week Lookahead

Endpoint nuevo: `GET /schedule/3wla` (opcionalmente filtrable por proyecto). Arma las filas cruzando:

| Columna del formulario | Origen |
|---|---|
| Project # / Name / Client | `proyectos` |
| Items | items de MTO / OP incluidos |
| Millwork (cantidad) | cantidad total del item |
| Progress % | avance por estación (`orden_procesos.completado`) — contado, no tipeado |
| To fabricate | total − completado |
| Due Date | `schedule_hitos.fecha_planeada` del hito de fabricación del item |
| Prioridad (1/2/3/Samples) | prioridad del item, con color |
| Comments | notas del item |
| Semana 1 / 2 / 3 | cantidad a fabricar en cada una de las próximas 3 semanas |

Sample Requests: filas propias desde el módulo de muestras.

Salida: una vista HTML (como los reportes de compras/producción que ya generás) y/o export. Reemplaza
el armado manual semanal del PM.

---

## 9. Ubicación en el código

**Backend** — módulo nuevo siguiendo la plantilla de `modules/muestras/`:
```
backend/src/modules/schedule/
├── index.ts                        # barrel: export scheduleModuleRouter + helpers de domain
├── routes.ts                       # sub-router con requireRole por endpoint
├── controllers/
│   ├── schedulePlan.controller.ts    # GET plan de un proyecto, timeline
│   └── lookahead.controller.ts       # GET 3WLA
└── domain/
    ├── motor.ts                      # cálculo hacia atrás + dependencias
    ├── captura.ts                    # fuentes de dato → fecha real
    ├── recompute.ts                  # recomputeScheduleForProyecto (el hook)
    └── calendario.ts                 # días hábiles / feriados
```
Montaje en `routes/index.ts`: `import { scheduleModuleRouter } from '../modules/schedule'` +
`router.use('/schedule', scheduleModuleRouter)`.

Endpoints Etapa 1:
- `GET  /schedule/proyecto/:id` — el plan + hitos con semáforo (para el timeline)
- `POST /schedule/proyecto/:id/generar` — crea el plan desde la plantilla (o al crear el proyecto)
- `PATCH /schedule/hito/:id` — ajustar duración/responsable/fecha objetivo (con registro en eventos)
- `GET  /schedule/3wla` — el formulario

**Frontend** — nuevo tab en el detalle de proyecto:
- `frontend/src/pages/ProyectoDetalle.tsx`: agregar `'schedule'` al union `TabKey`, un item al array de tabs, y `{tab === 'schedule' && <ScheduleTab proyectoId={proyectoId} />}`.
- `frontend/src/components/modules/schedule/ScheduleTab.tsx`: el timeline visual (lista de fases → hitos con semáforo, fechas planeada/real/holgura).
- `frontend/src/services/schedule.ts`: llamadas a la API (patrón de `proyectos.ts`).

> **Nota sobre el tab "Calendar" existente:** ya hay un tab que muestra un calendario mensual de
> actividad (mto/oc/recepción). El Schedule es distinto: es la cadena de hitos con fechas planeadas
> vs reales. Recomiendo tab **separado** en Etapa 1; después evaluamos si el Schedule absorbe o
> reemplaza a Calendar.

---

## 10. Orden de construcción interno de la Etapa 1

1. Migración 046 + seed de la plantilla "Millwork estándar" con los 53 hitos y sus dependencias.
2. `domain/calendario.ts` (días hábiles) — es la base de todo cálculo.
3. `domain/motor.ts` (cálculo hacia atrás) — probado con un proyecto de prueba.
4. `POST /generar` + `GET /proyecto/:id` — se puede ver el plan calculado (aunque sin fechas reales).
5. `domain/captura.ts` + `domain/recompute.ts` + los 3 hooks — entran las fechas reales.
6. Semáforo + atribución + `schedule_eventos`.
7. `ScheduleTab.tsx` — el timeline visual.
8. `GET /schedule/3wla` + su vista.

Cada punto es un commit local. Trabajo en rama `feat/schedule`. Nada va a producción hasta validarlo
en local con vos y, si querés, en staging.

---

## 11. Lo que necesito de vos antes de codear

Tres definiciones cortas:

1. **Granularidad Etapa 1** (sección 3): ¿confirmás arrancar a nivel **proyecto**, con el modelo ya
   listo para item después? *(Mi recomendación: sí.)*

2. **Fecha objetivo**: el plan la toma de `proyectos.fecha_fin_estimada`. ¿Está bien esa fecha como
   "entrega comprometida", o esa columna hoy significa otra cosa y conviene un campo dedicado?

3. **Calendario laboral**: ¿trabajan de lunes a viernes? ¿Qué feriados y semanas de cierre cargo para
   este año? (Podés pasarme la lista después; con lun-vie arranco.)

Las **duraciones** y el **mapeo de responsables** (roles del PDF → roles de la app) los necesito para
el *seed* de la plantilla (punto 1 del orden interno), pero puedo arrancar con las estimaciones del
Mapa y vos las vas corrigiendo — no bloquean el inicio.

---

**Rev 0 — pendiente de aprobación de Chali.**
