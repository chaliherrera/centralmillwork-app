# Runbook del Piloto — Life of a Deal (proceso e2e)

> Guía para correr TODO el proceso de punta a punta con el proyecto chico real.
> Todo es **local** — no toca producción. Rama `feat/schedule`.

## 0. Arrancar el entorno local

**Backend** (`:4000`, NO recarga solo — reiniciar a mano tras cambios):
```bash
cd /c/dev/centralmillwork-app/backend
set -a; . ./.env; set +a
npx ts-node src/index.ts
```

**Frontend** (`:3000`, recarga sola):
```bash
cd /c/dev/centralmillwork-app/frontend
npm run dev
```

- App: http://localhost:3000
- Usuario admin local: **chali@centralmillwork.com** / `demo1234` (solo local)
- DB local `centralmillwork` (postgres/postgres, PG17)

---

## 1. El recorrido, paso por paso

| # | Fase | Dónde (en la app) | Qué se hace | Qué cierra en el schedule |
|---|------|-------------------|-------------|---------------------------|
| 0 | **Paso previo** | `/proyectos` | **Crear el proyecto** (nombre, cliente) | nada aún — es el arranque |
| 1 | Contrato | `/estimados` | Elegir proyecto → cargar **fecha de entrega** + **contrato PDF** → generar schedule | C-03 (día cero) + infiere C-01/C-02 |
| 2 | Ingeniería | `/ingenieria` | Subir planos (submittal), liberar MTO, release, CNC | E-06/E-09/E-10/E-11; E-07 lo aprueba el cliente en el portal |
| 3 | Muestras | `/tareas` (buzón por rol) | Ingeniería aprueba la muestra | E-05 (gate de Production Intake) |
| 4 | Compras | *(automático)* | Emitir OCs, recibir material | M-03/M-04/M-05/M-07 (solos) |
| 5 | Producción | módulo Producción — **crear la OP** | El kiosko loguea estación por estación | P-01 (al crear OP) → P-05/P-06 (rollup de todas las OPs) |
| 6 | QC | *(automático)* | Inspección en el kiosko | QC-01/QC-02 |
| 7 | Despacho | `/logistica` | Subir BOL + registrar despacho (con precinto) | S-03/S-04 |
| 8 | Instalación | app móvil *(sin deploy → validar por backend)* | Check-in, checklist de items, punch list, sign-off | I-04/I-05/I-06/I-07 (entrega) |
| — | Portal cliente | `/portal/<token>` | El cliente aprueba muestras, planos, sign-off | E-05/E-07/I-07 |

**Ver el schedule del proyecto**: `/proyectos/:id` → tab **Schedule** (journey map).
*(Nota: mañana discutimos moverlo a un lugar más visible para PM/Producción.)*

---

## 2. La bitácora de imágenes

A medida que avanzás, capturar cada estación (NO antes):
```bash
cd /c/dev/centralmillwork-app
node tmp/bitacora_capture.js
```
Genera `docs/bitacora-piloto/BITACORA_PILOTO.html` (Artifact 420015d6). 12 estaciones planificadas.

---

## 3. Cosas que NO se prueban local (esperado)

- **Fotos** (contrato, recepción, producción, instalación): Supabase no está local → no suben.
  El piloto va por **Camino A**: la producción se sigue por el **estado de la OP**, no por fotos.
- **Instalación móvil**: la lógica se valida por backend/dominio; la cámara necesita teléfono real + EAS build (pendiente).
- **Emails / portal reminders**: Resend no anda todavía.

---

## 4. Calendario de carga del taller (contexto)

Mockup aprobado: [Carga del Taller](https://claude.ai/code/artifact/fffeb880-cf8d-4f4e-8d03-3a29296b511d) — 7 fases (hasta Instalación),
fila "Proyectos / 6". Todavía es mockup con datos de ejemplo; se conecta a datos reales tras **calibrar los plazos**
([planilla imprimible](https://claude.ai/code/artifact/d3272fb9-137d-4443-841a-b1771737c48f)).
