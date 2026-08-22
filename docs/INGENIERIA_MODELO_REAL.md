# Modelo real de Ingeniería (de su Smartsheet "Master.Sched")

> Destilado del export `Master.Sched.xlsx` (2026-08-21). Fuente de verdad de cómo Ingeniería
> planifica y mide su trabajo HOY. Insumo para la revisión de arquitectura.

## Qué es
El **schedule maestro de Ingeniería** en Smartsheet: **21 proyectos activos**, cada uno con fases
y tareas de ingeniería. Es un Gantt con **recursos** (no solo hitos).

## Columnas (11)
`Task | Project Name | Assigned To | Allocation % | PM | Duration | Predecessors | Start | Finish | Status | Comments`

- **Project Name** = columna outline con jerarquía: **Proyecto → Fase → Tarea** (indentado).
- **Assigned To** = ingeniero responsable de la tarea.
- **Allocation %** = fracción de la capacidad del ingeniero que consume esa tarea (0.2, 0.7, 1.0).
- **Duration** = días (varía por proyecto).
- **Predecessors** = números de fila (dependencias, como un DAG).
- **Start/Finish** = fechas calculadas.
- **Status** = Active / Not announced.

## Los 6 ingenieros (recurso escaso)
Santos · Favio Davalos · Sergio Castellon · Samantha · Adriana Mendez · Vivian Carolina Quiñonez.
La **carga real** de un ingeniero en una ventana = suma de `Allocation %` de sus tareas que se
**solapan por fecha**. Si supera 1.0 (100%) → sobreasignado. (En el export, la suma total por
ingeniero no es simultánea; hay que cruzar por fechas para la carga real.)

## Tipos de tarea recurrentes y duración REAL (para calibrar)
| Tarea (Smartsheet) | Duración real | Hito nuestro (Life of a Deal) |
|---|---|---|
| Field Measurements | 1d | E-03 (VIF/medición en obra) |
| Samples Process | 10–15d | E-04/E-05 (muestras) |
| Shop Drawings Process | 5–15d | E-06 (planos emitidos) |
| Architect/Designer Review Drawings | 1–30d (muy variable) | E-07 (aprobación del cliente) |
| SD update / Final production set | 1–10d | E-06/E-08 |
| Release to Production | 0d | E-10 (release) |
| CNC Engineering | 1–8d (típico ~5) | E-11 (archivos CNC) |
| Long Lead Time Material Procurement | 15–25d | M-03 (long leads) |
| Material Procurement | 1–10d | M-04/M-05 (compras) |
| Millwork Fabrication | 5–25d | P-05 (fabricación — taller) |
| Millwork Installation | 1–15d | I-04/I-05 (instalación) |
| Stone Countertops (measure/fab/install) | 1–10d | subproceso de fabricación/instalación |

## Observaciones clave (para el diseño)
1. **Las duraciones dependen del tamaño del proyecto** — no son fijas. Nuestro `dur_dias_default`
   único por hito es una simplificación. La realidad exige duración por-proyecto (o por-tamaño).
2. **La restricción real es la CAPACIDAD del ingeniero** (Allocation %), igual que el taller tiene
   tope de 6 proyectos. Mismo patrón: *scheduling multi-proyecto con capacidad de recurso*.
3. **Ingeniería es multi-proyecto por naturaleza** — un ingeniero reparte su % entre varios proyectos
   a la vez. Nuestro schedule hoy es por-proyecto; falta la vista transversal por-recurso.
4. **Datos algo sucios**: nombres de tarea con variantes (mayúsculas/espacios: "Field Measurements"
   vs "field measurements", "Release to Production" vs "release to production"). Para integrar en vivo
   habría que normalizar (o mapear a un catálogo canónico de tareas).
5. **Smartsheet API**: Chali tiene acceso a la hoja pero el plan no da API en vivo hoy. Integración
   inicial = leer el export (Excel/CSV). API en vivo depende del plan (Business/Enterprise).

## La pregunta arquitectónica
¿Ingeniería debe seguir siendo "hitos con duración fija" o pasar a un **modelo de tareas con recursos**
(ingeniero + % + duración + dependencias) que:
- alimente el schedule del proyecto (emitiendo las mismas señales E-05/E-06/E-07/E-10/E-11 que el motor ya consume),
- alimente una **vista de carga por ingeniero** (como "Carga del Taller" pero por recurso),
- y habilite integración/automatización (importar del Excel hoy, API en vivo o reemplazo nativo después)?
