# Testing Checklist — Branch `claude/jovial-ride-64bfff`

Sesión de testing antes de merge a `main` y deploy a Railway prod.

**Fecha programada**: 2026-05-21 temprano
**Ambiente**: local (worktree en OneDrive)
**Levantar dev**: `taskkill //F //IM node.exe` → `set -a; source backend/.env; set +a` → `npm run dev`

---

## 0. Pre-flight (5 min)

- [ ] Backend levantado en `:4000` sin errores en consola
- [ ] Frontend en `:3000` carga sin errores en consola del browser
- [ ] Login del sistema funciona (chali@centralmillwork.com)
- [ ] Login de kiosko funciona con PIN de Victor
- [ ] `psql` muestra al menos 1 estación con `personal_taller` asignado a CNC

---

## 1. Flujo Iniciar / Continuar / Completado (rediseño 2026-05-19)

### 1.1 Iniciar item desde cero
- [ ] Victor hace clock-in en kiosko (`/kiosk`)
- [ ] Abre Asignaciones (slide panel derecho)
- [ ] Ve órdenes asignadas a él en CNC con badge "Sin iniciar"
- [ ] Botón principal dice **"Iniciar item"** (gold)
- [ ] Click → confirma → la card cambia a badge "● En curso"
- [ ] Botón cambia a **"Item completado"** (emerald)
- [ ] En el header del kiosko aparece `proyecto_codigo` activo
- [ ] **Backend**: row insertado en `time_proyectos` con `hora_fin IS NULL`, `orden_produccion_id` correcto, `estacion='cnc'`
- [ ] **Backend**: row en `orden_historial` con `accion='iniciar'`, `kiosk_personal_id` correcto

### 1.2 Completar item
- [ ] Click "Item completado" → modal de confirmación
- [ ] Confirmar → la card desaparece de Asignaciones (o avanza a siguiente estación)
- [ ] **Backend**: `time_proyectos` segmento cerrado (`hora_fin = NOW()`)
- [ ] **Backend**: `orden_procesos.completado = true` para el proceso terminado
- [ ] **Backend**: `tiempo_real_minutos` = SUM de segmentos cerrados de ese proceso (NO usa `fecha_inicio→fecha_fin` delta)
- [ ] Si era el último proceso: orden status='Completada', `estacion_actual=NULL`
- [ ] Si NO era el último: orden avanza a siguiente estación, asignación a otro operario si corresponde

### 1.3 Multi-día (item que cruza jornadas)
- [ ] Victor inicia item, hace clock-out sin completar
- [ ] Verificar que el segmento de `time_proyectos` se cerró silenciosamente al clock-out
- [ ] Clock-in al día siguiente
- [ ] El item aparece **arriba** en Asignaciones con badge "⏸ Pausado · Xh"
- [ ] El "Xh" coincide con la suma de segmentos previos (no con delta fecha_inicio→ahora)
- [ ] Botón dice **"Continuar item"** (amber)
- [ ] Click → abre nuevo segmento `time_proyectos`, badge cambia a "● En curso"
- [ ] Al completar al día siguiente: `tiempo_real_minutos` = suma TOTAL (día 1 + día 2)

### 1.4 OtroTrabajo + Iniciar item interfieren correctamente
- [ ] Victor inicia OtroTrabajo (link discreto "¿Trabajando en algo no asignado?")
- [ ] Selecciona proyecto/estación, registra
- [ ] Ve card pequeño con código proyecto + Finalizar (NO timer)
- [ ] Abre Asignaciones → click "Iniciar item" en una orden
- [ ] **Esperado**: el segmento de OtroTrabajo se cierra automáticamente, se abre uno nuevo con `orden_produccion_id`
- [ ] **Backend**: en `time_proyectos`, el segmento de OtroTrabajo tiene `hora_fin` = `hora_inicio` del nuevo (mismo timestamp via `NOW()` constante en transacción — cero gap)

### 1.5 Orden de Asignaciones (smart sorting)
- [ ] Si Victor tiene 1 item en curso + 1 pausado + 1 sin iniciar: aparecen en ese orden (en_curso > pausado > es_estacion_activa > prioridad)
- [ ] Si tiene órdenes asignadas a CNC y a Edge Banding: las de su estación_activa primero

---

## 2. Los 4 buckets de tiempo (Resumen del día)

### 2.1 ResumenDia muestra los 4 metrics
- [ ] Después de ~1h de actividad mixta (items + otro + pausas), ResumenDia muestra:
  - [ ] **En items** (emerald)
  - [ ] **Otro trabajo** (gold)
  - [ ] **En pausa** (blue)
  - [ ] **Sin asignar** (gray, con tooltip "Tiempo entre items: análisis, agua...")
- [ ] La suma de los 4 ≈ jornada total (clock-in hasta ahora)
- [ ] **Sin asignar** se calcula correctamente como `brutas − items − otro − pausas` (puede ser 0 si todo fue cubierto)

### 2.2 Tracking automático de "Sin asignar"
- [ ] Caso: Victor inicia item → trabaja 30 min → toma break 10 min → vuelve y trabaja otro item 20 min
- [ ] ResumenDia debe mostrar:
  - En items ≈ 50 min
  - En pausa ≈ 10 min
  - Sin asignar ≈ jornada bruta − 60 min (incluye transiciones entre items)
- [ ] Si Victor pasa 20 min idle sin reportar nada, esos 20 min aparecen en "Sin asignar" sin que él haga nada

### 2.3 Excel export (Reportes → Horas)
- [ ] Login sistema como admin → `/produccion/horas` → tab "Por persona"
- [ ] Seleccionar Victor + rango de fechas
- [ ] Click "Exportar Excel"
- [ ] Verificar que el XLSX tiene las 4 columnas: **En items / Otro trabajo / Pausas / Sin asignar**
- [ ] Los valores son coherentes con lo que muestra el ResumenDia del kiosko

---

## 3. Timer en vivo en el Mapa del Taller (SHOP_MANAGER)

### 3.1 Timer aparece cuando hay segmento abierto
- [ ] Victor con segmento de `time_proyectos` abierto en CNC
- [ ] Login del sistema como admin → `/produccion` (tab Mapa)
- [ ] La card de CNC muestra `ItemActivoLine` con: ● VI · OP-XXXX · timer (h m)
- [ ] El timer corre cada segundo (sin esperar refetch)
- [ ] Refresh de la página → el timer sigue desde el tiempo correcto (no resetea a 0)

### 3.2 Carpintero individual de Assembly
- [ ] Asignar item a Juan, Juan hace "Iniciar item" desde su kiosko
- [ ] En el Mapa, la celda de Juan (col 2, row 1) muestra:
  - Iniciales JU arriba a la derecha
  - Item activo abajo con timer ● OP-XXXX · 0h Xm

### 3.3 Múltiples operarios en misma estación (Pintura)
- [ ] Si Pintura tiene 4 carpinteros y 2 trabajan items en paralelo, la card muestra 2 líneas de `ItemActivoLine`
- [ ] Cada línea con sus iniciales + timer independiente

### 3.4 Card vacía cuando nadie trabaja
- [ ] Si nadie tiene segmento abierto en CNC, la card NO muestra `ItemActivoLine` (sin sección de borde superior)

### 3.5 Fix CTE (commit 121e571) sigue funcionando
- [ ] Verificar que la query de `/api/produccion/estaciones` devuelve `personal[].item_activo` con datos completos cuando hay segmento abierto
- [ ] (Solo si tenés psql) Inspeccionar plan de ejecución: `EXPLAIN ANALYZE` de la query — debe ser ~2× más rápida que la versión vieja

---

## 4. NUEVO: Rediseño visual del Mapa (blueprint)

### 4.1 Estética general
- [ ] Panel con fondo `#F2EEE4` (paper) y grid técnico 40×40px visible
- [ ] Header del panel: `PLANTA · NIVEL 1 · ESC 1:50` arriba, "Mapa del taller" en 22px
- [ ] Corner ticks en las 4 esquinas del panel
- [ ] Footer del panel: `← MATERIA PRIMA` ... `N ESTACIONES · M OPERADORES` ... `PRODUCTO TERMINADO →`

### 4.2 Layout 4 columnas con flechas
- [ ] 4 zonas con headers: `ZONE 01 · MAQ Maquinado` / `ZONE 02 · ENS Ensamble` / `ZONE 03 · ACA Acabados` / `ZONE 04 · SAL Salida`
- [ ] Entre cada par de columnas hay una flecha punteada `→` centrada verticalmente
- [ ] Columna 1: CNC + Edge Banding
- [ ] Columna 2: Juan, Rolando, Luis, Rubén, Dilan (en ese orden vertical)
- [ ] Columna 3: Pintura + Lámina
- [ ] Columna 4: Final + Registro + Shipping

### 4.3 Cards de estación (V2Card)
- [ ] Stripe vertical de 3px a la izquierda con color según status (verde/ámbar/gris)
- [ ] Corner ticks en las 4 esquinas
- [ ] Header: código tipo `MAQ-1.01` + tag corto M/A/F/O
- [ ] Nombre de estación en MAYÚSCULAS (`CNC`, `JUAN`, etc.) Inter 18/600
- [ ] Si hay orden running: `▸ OP-XXXX` + nombre proyecto + `due Hoy 14:30` (rojo si vencida)
- [ ] Si no hay orden: `— vacante —` italic
- [ ] Barra de capacidad 6px con notches blancos cada slot
- [ ] Footer: avatares 18px + "+N EN COLA" si aplica

### 4.4 Datos correctos
- [ ] Una estación con orden en curso muestra el código real (OP-XXXX, no CM-XXXX del mock)
- [ ] La fecha "due" se computa desde `fecha_entrega` real (no hardcoded)
- [ ] Cards con sobrecarga (queue > cap) muestran stripe ámbar
- [ ] Cards sin nada muestran stripe gris + "— vacante —"

### 4.5 Tipografía
- [ ] Inter cargado correctamente
- [ ] JetBrains Mono cargado correctamente (códigos, IDs, etiquetas técnicas)
- [ ] Sin fallback feo a serif por fonts no cargados

---

## 5. Asignaciones / Documentos / Notificaciones (sesión 2026-05-13)

### 5.1 Botón "Ver planos" en kiosko
- [ ] Una orden con docs adjuntos por estación muestra botón "Ver planos · N" (gold oscuro) en cada item
- [ ] Si N=1: click abre el PDF en pestaña nueva
- [ ] Si N≥2: click abre modal con lista de docs

### 5.2 Subir docs desde sistema
- [ ] Login sistema → DetalleOrden de una orden
- [ ] Card "Documentos" muestra secciones por estación + "Generales"
- [ ] Click "Subir" → modal con file picker multi-archivo
- [ ] Subir 1 PDF + 1 JPG → ambos aparecen en la sección correcta
- [ ] Cada `ProcesoRow` muestra badge 📎 con el count

### 5.3 Notificaciones SHOP_MANAGER
- [ ] Login como admin (o SHOP_MANAGER si existe en prod)
- [ ] Header muestra campana con badge rojo (unread count)
- [ ] Hacer un evento desde kiosko (completar/mover) → en ~25s aparece toast + Browser Notification
- [ ] Click en campana abre drawer con feed de últimas 24h
- [ ] Click en evento navega al detalle de la orden

---

## 6. Edge cases / bugs viejos confirmados que NO deben regresar

- [ ] **Bug A** (HTTP 500 al avanzar último proceso): completar el ÚLTIMO proceso de una orden no falla; orden queda en status='Completada', estacion_actual=NULL
- [ ] **Bug B** (Ver planos abría Dashboard): click en "Ver planos" desde kiosko abre el PDF, no el Dashboard
- [ ] Doble clock-in: intentar clock-in cuando ya está adentro → backend rechaza con error claro
- [ ] Doble clock-out: idem
- [ ] PIN incorrecto: rate limit dispara después de N intentos

---

## 7. Performance + DB

- [ ] `GET /api/produccion/estaciones` responde en < 200ms (con la query nueva basada en CTEs)
- [ ] `GET /api/kiosk/dia` responde en < 150ms incluso con muchos segmentos en el día
- [ ] `GET /api/kiosk/mi-cola` responde en < 200ms
- [ ] El refetchInterval de 30s en Mapa NO satura el backend (verificar logs)

---

## Si todo pasa → merge a main

```bash
git checkout main
git pull
git merge claude/jovial-ride-64bfff --no-ff
git push
```

Railway deployará automáticamente.

**Antes de deploy a prod**:
- [ ] Confirmar que NO hace falta migración nueva (creo que solo código)
- [ ] Avisar al SHOP_MANAGER del cambio de UI del kiosko
- [ ] Rotar password de Postgres (pendiente de hace 4 días)

## Si algo falla
- Anotar en `project_pendientes_2026_05_21.md` y NO mergear hasta resolver
