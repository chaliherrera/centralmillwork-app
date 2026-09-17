// ─────────────────────────────────────────────────────────────────────────────
// Simulación del recorrido del cliente (herramienta de test de la consola)
// ─────────────────────────────────────────────────────────────────────────────
// Pone un MOMENTO del cliente PENDIENTE en el portal, para poder abrirlo en vivo y
// probar la aprobación. Marca los momentos anteriores como hechos, el elegido
// pendiente, y sus predecesores como hechos (para que la aprobación no se trabe).
//
// ES UNA HERRAMIENTA DE TEST: escribe directo en el estado del proyecto (hitos /
// deal / una muestra de simulación). Pensada para proyectos de prueba.

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { CLIENT_MOMENTS } from './portal'

type QueryRunner = PoolClient | typeof pool

async function marcarHito(runner: QueryRunner, proyectoId: number, codigo: string, done: boolean): Promise<void> {
  await runner.query(
    `UPDATE schedule_hitos sh
        SET fecha_real = ${done ? 'COALESCE(sh.fecha_real, NOW())' : 'NULL'},
            estado = $3, updated_at = NOW()
       FROM schedule_planes sp
      WHERE sp.id = sh.plan_id AND sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = $2`,
    [proyectoId, codigo, done ? 'cumplido' : 'pendiente'])
}

// E-05 solo se ofrece en el portal si hay una muestra ENVIADA (gate). Para simular,
// mandamos una muestra existente a ENVIADA; si no hay ninguna, creamos una de prueba.
async function asegurarMuestraEnviada(runner: QueryRunner, proyectoId: number): Promise<void> {
  const { rows } = await runner.query<{ id: number }>(
    `SELECT id FROM muestras WHERE proyecto_id = $1 AND estado <> 'ARCHIVADA' ORDER BY id LIMIT 1`, [proyectoId])
  if (rows[0]) { await runner.query(`UPDATE muestras SET estado = 'ENVIADA' WHERE id = $1`, [rows[0].id]); return }
  await runner.query(
    `INSERT INTO muestras (codigo, proyecto_id, descripcion, estado)
       VALUES ($1, $2, $3, 'ENVIADA')`,
    [`SIM-${proyectoId}-${Date.now().toString().slice(-6)}`, proyectoId, 'Muestra de simulación (consola del portal)'])
}

/** Deja el momento `codigo` PENDIENTE en el portal del proyecto. */
export async function simularMomento(runner: QueryRunner, proyectoId: number, codigo: string): Promise<{ ok: boolean; error?: string }> {
  const orden = CLIENT_MOMENTS.map((m) => m.codigo)
  const idx = orden.indexOf(codigo)
  if (idx < 0) return { ok: false, error: 'momento inválido' }

  // Anteriores → hechos. Posteriores → "no aplica" (fuera del foco): así el único
  // pendiente/aprobable en el portal es el momento elegido.
  for (let i = 0; i < orden.length; i++) {
    if (i === idx) continue
    const c = orden[i]
    if (c === 'PLAN') {
      await runner.query(`UPDATE proyectos SET deal_estado = 'aprobado' WHERE id = $1`, [proyectoId])
    } else if (i < idx) {
      await marcarHito(runner, proyectoId, c, true)
    } else {
      await runner.query(
        `UPDATE schedule_hitos sh SET fecha_real = NULL, estado = 'no_aplica', updated_at = NOW()
           FROM schedule_planes sp
          WHERE sp.id = sh.plan_id AND sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = $2`,
        [proyectoId, c])
    }
  }

  // El elegido → pendiente.
  if (codigo === 'PLAN') {
    await runner.query(`UPDATE proyectos SET deal_estado = 'esperando_cliente' WHERE id = $1`, [proyectoId])
  } else {
    await marcarHito(runner, proyectoId, codigo, false)
    // Predecesores del elegido → hechos (para que la aprobación no se trabe).
    await runner.query(
      `UPDATE schedule_hitos sh
          SET fecha_real = COALESCE(sh.fecha_real, NOW()),
              estado = CASE WHEN sh.fecha_real IS NULL THEN 'cumplido' ELSE sh.estado END, updated_at = NOW()
         FROM schedule_planes sp
         JOIN schedule_plantilla_dependencias dep ON dep.plantilla_id = sp.plantilla_id AND dep.hito_codigo = $2
        WHERE sp.id = sh.plan_id AND sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = dep.depende_de_codigo`,
      [proyectoId, codigo])
    if (codigo === 'E-05') await asegurarMuestraEnviada(runner, proyectoId)
  }
  return { ok: true }
}
