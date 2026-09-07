// ─────────────────────────────────────────────────────────────────────────────
// Novedades del cliente — lo que el cliente decidió desde el PORTAL (Fase 4)
// ─────────────────────────────────────────────────────────────────────────────
// Q8 (Chali): el ingeniero debe VER la decisión del cliente en el portal (planos
// aprobados/rechazados, plan aprobado, etc.) y cotejarla por teléfono/email; gana la
// última decisión con timestamp. Este widget del escritorio LEE los eventos del portal
// (schedule_eventos disparado_por='portal') — es informativo, no cambia nada.
//
// Si se pasa `asignado`, se acota a los proyectos donde ese ingeniero tiene tareas
// (su escritorio); ADMIN/PM lo ven sin filtro.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'

type QueryRunner = PoolClient | typeof pool

export interface NovedadCliente {
  id: number
  proyecto_ext: string | null
  proyecto_nombre: string | null
  hito_codigo: string | null      // PLAN | E-07 (planos) | E-05 (muestras) | I-07 (sign-off)…
  decision: string | null         // aprobado | con_comentarios | rechazado
  comentario: string | null
  contacto: string | null         // quién decidió desde el portal
  descripcion: string | null
  created_at: string              // ISO Z
}

export async function listNovedadesCliente(
  runner: QueryRunner, opts: { asignado?: string | null; limit?: number } = {}
): Promise<NovedadCliente[]> {
  const params: unknown[] = []
  let asigCond = ''
  if (opts.asignado) {
    params.push(opts.asignado)
    asigCond = `AND EXISTS (SELECT 1 FROM ing_tareas t
                             WHERE t.proyecto_ext = ip.proyecto_ext AND t.asignado_nombre = $${params.length})`
  }
  params.push(Math.min(Math.max(opts.limit ?? 15, 1), 50))
  const { rows } = await runner.query<NovedadCliente>(
    `SELECT se.id,
            ip.proyecto_ext,
            p.nombre AS proyecto_nombre,
            se.hito_codigo,
            (se.payload->>'decision')  AS decision,
            (se.payload->>'comentario') AS comentario,
            (se.payload->>'contacto')  AS contacto,
            se.descripcion,
            to_char(se.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
       FROM schedule_eventos se
       JOIN schedule_planes sp ON sp.id = se.plan_id
       JOIN proyectos p        ON p.id  = sp.proyecto_id
       LEFT JOIN ing_proyectos ip ON ip.proyecto_id = sp.proyecto_id
      WHERE se.disparado_por = 'portal' ${asigCond}
      ORDER BY se.created_at DESC
      LIMIT $${params.length}`, params)
  return rows
}
