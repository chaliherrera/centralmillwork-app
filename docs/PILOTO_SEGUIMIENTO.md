# 📋 Seguimiento del Piloto — Life of a Deal (proceso e2e)

> Documento **vivo**: marcamos el `Estado` de cada paso a medida que lo probamos.
> Todo es **local** (rama `feat/schedule`), no toca producción.
> Proyecto piloto: **se crea en vivo con Chali** (aún no existe).

**Estados:** ⬜ pendiente · 🔄 en curso · ✅ hecho · ⚠️ workaround aplicado · ⛔ bloqueado

---

## ✅ Tema archivos en local — RESUELTO (2026-08-20)

**Aplicada la Opción 1**: el `.env` local ahora apunta al bucket de staging (`oc-imagenes-staging`).
Probado con un upload real (subir+borrar un archivo de prueba) → **funciona**. Todos los pasos con
archivo (contrato, planos, CNC, BOL, foto de firma) andan igual que en producción. Los archivos de
prueba quedan en el bucket staging → **borrarlos al terminar el piloto**.

<details><summary>Contexto original del problema (resuelto)</summary>

Varias etapas del proceso piden **subir un archivo** (contrato, planos, CNC, BOL, foto de firma…).
En local **no había almacenamiento de archivos configurado** (Supabase = solo en la nube), así que esos
pasos devolvían un error *"Storage no está configurado"*.

Tenemos **dos formas de resolverlo**, y las vamos a ir aplicando según haga falta:

### Opción 1 — Conectar local al bucket de staging *(recomendada: arregla TODO de una)*
Pegar en `backend/.env` las credenciales del bucket de pruebas (`oc-imagenes-staging`):
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET=oc-imagenes-staging`.
- ✅ Con eso **todos** los pasos con archivo funcionan igual que en producción.
- ✅ Cero cambios de código; se prueba el flujo real de subida.
- 🔸 Necesito que Chali consiga y pegue esas credenciales (una sola vez).
- 🔸 Los archivos de prueba quedan en el bucket staging (fáciles de borrar después).

### Opción 2 — Fallback a disco local *(si no conseguimos las credenciales hoy)*
Parchear los controllers del schedule para que, cuando no haya Supabase, guarden el archivo en
una carpeta local (`backend/uploads/`) — igual que ya hace el resto de la app.
- ✅ 100% local, sin depender de la nube.
- 🔸 Es un cambio de código chico; lo aplico **al llegar** a cada paso que lo necesite (así lo pediste: resolver a medida que avanzamos).

### Mientras tanto — pasos que NO se bloquean
- El **contrato** (paso 1) es **opcional**: arrancamos sin adjuntarlo y el día cero (C-03) igual se registra.
- Los pasos de **registro** (validar, liberar, release, sign-off sin foto) no piden archivo y andan directo.
- **Producción y QC** avanzan por el estado de la OP (Camino A), sin fotos obligatorias en local.

</details>

---

## 🗺️ Los pasos del proceso

| Estado | # | Fase | Paso | Dónde | Qué cierra | ¿Archivo? | Cómo se resuelve en local |
|:---:|:---:|---|---|---|---|:---:|---|
| ⬜ | 0 | — | **Crear el proyecto** | `/proyectos` | (arranque) | No | Directo |
| ⬜ | 1 | Contrato | Cargar fecha de entrega + contrato → genera schedule | `/estimados` | **C-03** (día cero) + infiere C-01/C-02 | Opcional | Arrancar **sin** contrato; C-03 igual cierra |
| ⬜ | 2a | Ingeniería | Registrar arranque / design call | `/ingenieria` | E-01 (y E-02/E-03/E-12) | No | Directo |
| ⬜ | 2b | Ingeniería | **Subir planos** (submittal Rev A) | `/ingenieria` | **E-06** (y E-07 aparece en portal) | **Sí** | Opción 1 ó 2 |
| ⬜ | 2c | Ingeniería | Liberar MTO / Release to Production | `/ingenieria` | E-09 / E-10 | No | Directo |
| ⬜ | 2d | Ingeniería | **Subir archivos CNC** | `/ingenieria` | **E-11** | **Sí** | Opción 1 ó 2 |
| ⬜ | 3 | Muestras | Fabricar/enviar muestra → Ingeniería aprueba | `/muestras` + `/tareas` (buzón) | **E-05** (gate de Producción) | **Sí** (PDF de la muestra) | Opción 1 ó 2 · confirmar al llegar |
| ⬜ | 4 | Compras | Emitir OCs + recibir material | módulo Compras/Recepciones | M-03/M-04/M-05/**M-07** | No* | Directo (*foto de recepción opcional) |
| ⬜ | 5 | Producción | **Crear la OP** → kiosko avanza estación por estación | módulo Producción / kiosko | **P-01** (al crear OP) → P-05/**P-06** (rollup) | No | Directo (fotos de avance no obligatorias en local) |
| ⬜ | 6 | QC | Inspección de calidad | kiosko / QC | QC-01 / QC-02 | No* | Directo (*foto opcional) |
| ⬜ | 7a | Despacho | **Subir BOL** | `/logistica` | **S-03** | **Sí** | Opción 1 ó 2 |
| ⬜ | 7b | Despacho | **Registrar despacho** (+ nº de precinto) | `/logistica` | **S-04** | **Sí** | Opción 1 ó 2 |
| ⬜ | 8a | Instalación | Check-in en obra | app móvil *(sin deploy → validar por backend)* | I-04 | Foto opcional | Validar por dominio |
| ⬜ | 8b | Instalación | Checklist de items instalados | app móvil | **I-05** (al instalar todos) | Foto opcional | Validar por dominio |
| ⬜ | 8c | Instalación | Punch list (abrir/cerrar) | app móvil | **I-06** (al cerrar todo) | Foto en el punch | Opción 1 ó 2 al llegar |
| ⬜ | 8d | Instalación | **Sign-off del cliente (ENTREGA)** | app móvil / portal | **I-07** (ancla) | **Sí** (foto de firma) | Opción 1 ó 2 al llegar |
| ⬜ | 9 | Cliente | Aprobar muestras / planos / sign-off | `/portal/<token>` | E-05 / E-07 / I-07 | No | Directo (E-07 muestra el PDF del submittal) |

---

## 📓 Bitácora de decisiones y notas (se va llenando)

- **2026-08-20** — Documento creado. Definido el tema de archivos en local (Opción 1 vs 2).
- **2026-08-20** — ✅ Storage local conectado al bucket staging (`oc-imagenes-staging`) y **probado con upload real**.
  Todos los pasos con archivo funcionan. Entorno listo: backend :4000, frontend :3000, cron ENABLED. **Borrar archivos de prueba del bucket al terminar.**
- **Pendiente (post-piloto)**: Chali consigue la hoja de Smartsheet de Ingeniería (carga de trabajo/plazos) → se integra empezando por leer el Excel exportado.

### Hallazgos y fixes durante el piloto (2026-08-20)
- ✅ **Fix**: "Mi trabajo" escondía los sub-hitos (E-01a..e) por un filtro `parent_codigo IS NULL`. Sacado → los sub-pasos accionables ahora salen en el escritorio del rol. (commit)
- ✅ **Fix**: el freno hacia adelante bloqueaba por condicionales que no aplican (E-06 no se podía subir porque E-03 cond/no_aplica lo frenaba). Ahora un `cond` en `no_aplica` cuenta como satisfecho. (commit)
- ✅ **Feature**: "Ver planos enviados" en el schedule del proyecto y en Mi trabajo (E-06/E-07/E-08) — antes solo el portal mostraba el documento. (commit, verificado en navegador)
- ✅ **Validado**: portal del cliente e2e — subir planos (E-06) → cliente ve el PDF y aprueba (E-07 con comentario "TODO SE VE BIEN"). Storage staging funcionando en el flujo real.
- ✅ **Validado**: enrutamiento por rol — C-04 cae en Finanzas, E-01b en PM (cada hito a su escritorio).

### 🟡 PENDIENTE de construir (decidido: opción B — después del recorrido)
- **Confirmación de pago por el cliente (dos fechas):** el cliente marca "pago enviado" en el portal (fecha 1 + tarea a Finanzas) y Finanzas registra el recibo (fecha 2 + monto, esto completa C-04/X-03). Guardar y mostrar ambas fechas. Objetivo de Chali: "no dejar nada a la casualidad". Aplica a C-04 (depósito) y X-03 (pago final).
- *(acá vamos anotando cada paso: qué salió, qué ajustamos, qué aprendimos)*

---

## 🔗 Relacionados
- Runbook de arranque: `docs/PILOTO_RUNBOOK.md`
- Bitácora de imágenes: `docs/bitacora-piloto/` (motor `tmp/bitacora_capture.js`) · [Artifact](https://claude.ai/code/artifact/420015d6-4403-4c78-9107-423571ccc9c5)
- Calibración de plazos: [Artifact](https://claude.ai/code/artifact/d3272fb9-137d-4443-841a-b1771737c48f)
- Calendario Carga del Taller (mockup): [Artifact](https://claude.ai/code/artifact/fffeb880-cf8d-4f4e-8d03-3a29296b511d)
