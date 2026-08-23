# Diseño — Upgrade de Estimados (para análisis de Fable)

> Diseño previo a codear. Objetivo: que Fable analice el flujo y **todas sus interacciones con los
> otros módulos** antes de construir — pasos seguros, evolución no reescritura. — 2026-08-22

## Objetivo
Convertir **Estimados** en un **flujo guiado** que arranca en la firma del contrato y **crea el schedule
SOLO si el proyecto es factible** (según la capacidad de Ingeniería). Nueva UX. El schedule pasa a un
**nav lateral propio "Schedule"** (deja de ser una pestaña de la ficha del proyecto).

## El flujo (pasos + interacciones)
| # | Paso | Interacción con otros módulos |
|---|---|---|
| — | Se **eliminan** los pasos previos a la firma (C-01 negociación, C-02 revisión) | Motor/plantilla del schedule (¿se sacan del seed o se infieren?) |
| 1 | **Contrato firmado** → primera fecha de control | **Portal/DocuSign** (webhook, fase con deploy) → hito **C-03** |
| 2 | **Crear el proyecto** (reusa el alta existente; modal sin fechas determinantes) | **Proyectos/Compras** (reuso, no duplicar) |
| 3 | **Subir PDF del contrato firmado** (OBLIGATORIO, no se continúa sin él) → cierra C-03 | **Storage** (Supabase) · hito C-03 evidencia |
| 4 | **Fecha pedida por el cliente + verificar factibilidad** | **Motor** (cálculo hacia atrás) |
| 5 | Factibilidad = **revisión de la carga de Ingeniería** (herramienta de decisión, ver mockup `_mockup_factibilidad.html`) | **Ingeniería** (`ing_tareas`, Disponibilidad) |
| 6 | Si factible → **reservar espacios de Ingeniería** (provisional; el PM confirma después) | **Ingeniería** (crear tareas "reservadas") · **PM** (confirma) |
| 7 | También **carga del Taller** (misma lógica; producción más flexible; hoy mockup) | **Producción** (capacidad — aún mockup) |
| 8 | Todo cumplido → **crear el schedule** | **Espina Life of a Deal** · nav "Schedule" |
| 9 | **Nuevo look & feel** | — |

## Cambios de datos propuestos (a validar con Fable)
- **`proyectos`**: agregar `presupuesto` (tamaño) y `fecha_entrega_solicitada` (si no existe un campo apropiado).
- **`ing_tareas`**: un estado/flag de **reserva** (`origen='reserva'` o `estado='reservada'`) para las tareas que
  Estimados reserva provisionalmente (sin ingeniero confirmado o con propuesto), + confirmación del PM (`reservada`→`confirmada`).
- Posible tabla/campo para el **vínculo envelope DocuSign ↔ proyecto** (custom field = código de proyecto).
- La **factibilidad** probablemente NO persiste (se calcula on-demand); lo que persiste es la **reserva** (si se acepta).

## DocuSign (fase que depende de deploy + credenciales)
Integration Key + JWT (RSA) · envelope con custom field = proyecto · DocuSign Connect (webhook) →
`/api/webhooks/docusign` (verifica HMAC, extrae fecha de firma = 1ra fecha de control + proyecto → marca C-03).
Mientras tanto: PDF subido en Estimados = contrato firmado (manual, obligatorio).

## Preguntas concretas para Fable
1. **Interacciones y riesgos** de este flujo con los módulos existentes (schedule/motor, Ingeniería, Compras/Proyectos, portal). ¿Dónde hay acoplamiento peligroso o doble verdad?
2. **¿Dónde vive la factibilidad?** ¿En Estimados o en la espina (motor)? ¿Cómo encaja con el semáforo, la fecha sagrada y el cálculo hacia atrás que ya existe?
3. **Modelar la "reserva de capacidad" de Ingeniería** sin el modelo de duración final (histórico pendiente), de forma que **evolucione limpio** cuando llegue la data. ¿`ing_tareas` reservadas es el camino? ¿Cómo se distingue reserva provisional de tareas reales importadas del Excel?
4. **Eliminar los pasos pre-firma**: ¿se sacan de la plantilla (migración) o se los deja inferir? ¿Impacto en proyectos existentes?
5. **DocuSign**: ¿el webhook + captura de firma encaja limpio con C-03 y el patrón de evidencia? ¿Riesgos de seguridad?
6. **El schedule como nav propio "Schedule"**: ¿implicaciones de sacarlo de la ficha del proyecto? ¿Rutas, permisos, reuso del componente `ScheduleTab`?
7. **Orden seguro de construcción** (qué primero, qué NO todavía). Evolución, no reescritura.
