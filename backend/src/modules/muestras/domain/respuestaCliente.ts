// ─────────────────────────────────────────────────────────────────────────────
// Respuesta del cliente a sus muestras DESDE EL PORTAL (Fase 1, Q3)
// ─────────────────────────────────────────────────────────────────────────────
// Antes: el cliente respondía por fuera y una tarea le pedía a Ingeniería que
// "reflejara la respuesta en el módulo de Muestras". Ahora la decisión del portal
// (E-05) escribe DIRECTO en Muestras: transiciona todas las muestras ENVIADA del
// proyecto a APROBADA (aprobó / aprobó con comentarios) o RECHAZADA (pidió cambios).
//
// Replica los efectos del handler transicionarMuestra (controllers/muestrasController)
// SOLO para esos dos casos: al aprobar, registra fecha + link al catálogo del
// proyecto; al rechazar, crea la V+1 y su tarea de compras. Cierra el aviso a
// Ingeniería. La transición ENVIADA→APROBADA/RECHAZADA es válida en la máquina.
//
// DEUDA: comparte lógica con transicionarMuestra. A futuro conviene un core único;
// se mantiene acotado al caso del cliente para no tocar ese controller crítico.

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { logger } from '../../../utils/logger'

type QueryRunner = PoolClient | typeof pool

/** Transiciona las muestras ENVIADA del proyecto según la respuesta del cliente.
 *  aprobado=false = pidió cambios (RECHAZADA + V+1). Devuelve cuántas tocó. */
export async function responderMuestrasCliente(
  runner: QueryRunner, proyectoId: number, aprobado: boolean, comentario: string | null,
): Promise<number> {
  const { rows: enviadas } = await runner.query<{
    id: number; codigo: string; descripcion: string; tipo: string; version_actual: number; proyecto_id: number | null
  }>(
    `SELECT id, codigo, descripcion, tipo, version_actual, proyecto_id
       FROM muestras WHERE proyecto_id = $1 AND estado = 'ENVIADA' FOR UPDATE`, [proyectoId])
  if (!enviadas.length) return 0

  for (const m of enviadas) {
    if (aprobado) {
      await runner.query(
        `UPDATE muestras SET estado = 'APROBADA', fecha_aprobacion_cliente = CURRENT_DATE WHERE id = $1`, [m.id])
      await runner.query(
        `INSERT INTO muestras_eventos (muestra_id, version_numero, tipo, detalle, usuario_id)
           VALUES ($1,$2,'aprobada',$3,NULL)`,
        [m.id, m.version_actual, comentario ? `Cliente aprobó desde el portal: ${comentario}` : 'Cliente aprobó desde el portal'])
      // Vínculo formal muestra↔proyecto (idempotente por muestra+versión).
      if (m.proyecto_id != null) {
        const { rows: pdfRows } = await runner.query<{ id: number }>(
          `SELECT id FROM muestras_archivos WHERE muestra_id=$1 AND version_numero=$2 AND tipo='sample_request'
            ORDER BY created_at DESC LIMIT 1`, [m.id, m.version_actual])
        await runner.query(
          `INSERT INTO proyectos_muestras_aprobadas
             (proyecto_id, muestra_id, version_numero, codigo, descripcion, tipo, pdf_archivo_id, fecha_aprobacion, aprobado_por, notas)
           VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,NULL,$8)
           ON CONFLICT (muestra_id, version_numero) DO NOTHING`,
          [m.proyecto_id, m.id, m.version_actual, m.codigo, m.descripcion, m.tipo, pdfRows[0]?.id ?? null, comentario ?? null])
      }
    } else {
      const nuevaV = m.version_actual + 1
      await runner.query(
        `INSERT INTO muestras_versiones (muestra_id, version_numero, razon_de_revision, comentarios_cliente)
           VALUES ($1,$2,$3,$4)`, [m.id, nuevaV, comentario ?? null, comentario ?? null])
      // Tarea de compras para la nueva versión (idempotente por source_ref).
      await runner.query(
        `INSERT INTO tareas (area, title, description, priority, from_email, subject, source_email_id, origen, source_ref)
           VALUES ('procurement',$1,$2,'high','sistema@centralmillwork.com',$3,NULL,'sistema',$4)
         ON CONFLICT (source_ref) WHERE origen='sistema' AND source_ref IS NOT NULL DO NOTHING`,
        [`Muestra V${nuevaV}: ${m.codigo} — re-fabricación tras rechazo del cliente`,
         `Muestra ${m.codigo} (V${nuevaV}). El cliente pidió cambios desde el portal.\n` +
         `Comentario: ${comentario ?? '(sin comentario)'}\n\n` +
         `Acción: verificar si los materiales de la nueva versión cambian respecto a la anterior.`,
         `Sample Request V${nuevaV} — ${m.codigo}`,
         `muestra:${m.id}:request:v${nuevaV}`])
      await runner.query(
        `UPDATE muestras SET estado='RECHAZADA', version_actual=$2 WHERE id=$1`, [m.id, nuevaV])
      await runner.query(
        `INSERT INTO muestras_eventos (muestra_id, version_numero, tipo, detalle, usuario_id)
           VALUES ($1,$2,'rechazada',$3,NULL)`,
        [m.id, nuevaV, comentario ? `Cliente pidió cambios desde el portal: ${comentario}` : 'Cliente pidió cambios desde el portal'])
    }
    // Cerrar el aviso in-app a Ingeniería (el cliente ya respondió).
    await runner.query(
      `UPDATE tareas SET estado='completada', completed_at=NOW()
        WHERE source_ref=$1 AND estado NOT IN ('completada','descartada')`,
      [`muestra:${m.id}:aprobacion_ingenieria`])
  }
  logger.info('muestras respondidas desde el portal', { proyectoId, aprobado, n: enviadas.length })
  return enviadas.length
}

/** Cuántas muestras del proyecto están ENVIADA (esperando respuesta del cliente).
 *  Gatea que E-05 sea aprobable en el portal solo si hay una muestra enviada. */
export async function countMuestrasEnviadas(runner: QueryRunner, proyectoId: number): Promise<number> {
  const { rows } = await runner.query<{ n: string }>(
    `SELECT count(*)::int AS n FROM muestras WHERE proyecto_id = $1 AND estado = 'ENVIADA'`, [proyectoId])
  return Number(rows[0]?.n ?? 0)
}
