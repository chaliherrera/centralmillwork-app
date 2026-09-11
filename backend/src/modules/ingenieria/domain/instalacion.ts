// ─────────────────────────────────────────────────────────────────────────────
// Estado de Instalación para la ruta de ingeniería (#15 Millwork Installation)
// ─────────────────────────────────────────────────────────────────────────────
// Regla de arquitectura (Chali): un dato con dueño se LEE, no se copia. La ejecución
// de la instalación la dueña el MÓDULO DE INSTALACIÓN DE CAMPO (móvil): los ítems a
// instalar se derivan de las OPs de producción (ordenes_produccion) y el "instalado ✓"
// se guarda en schedule_install_items; los defectos en schedule_punch_items.
//
// La instalación es 100% del PM (coordina/programa). Este estado le da acceso al avance
// (ítem×ítem + punch) en su propio Gantt, sin duplicar el módulo de campo.
//   I-04 = instalación en curso (avance de ítems) · I-07 = sign-off (todo + punch cerrado)
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { listInstallItems, type InstallItem } from '../../schedule/domain/installitems'
import { listPunch, type PunchItem } from '../../schedule/domain/field'

type QueryRunner = PoolClient | typeof pool

export interface EstadoInstalacion {
  hay: boolean            // hay ítems a instalar (el proyecto llegó a producción)
  total: number
  instalados: number
  pct: number             // instalados / total, 0..1
  fecha_ultima: string | null
  punch_total: number
  punch_abiertos: number  // defectos sin resolver (bloquean el sign-off I-07)
  completa: boolean       // todos instalados y sin punch abierto (≈ I-07)
}

/** Lee el avance de instalación de un proyecto (ítems instalados + punch list). */
export async function estadoInstalacion(runner: QueryRunner, proyectoExt: string): Promise<EstadoInstalacion> {
  // Ítems a instalar = OPs no canceladas; instalados = con registro en schedule_install_items.
  const { rows: it } = await runner.query<{ total: string; instalados: string; ultima: string | null }>(
    `SELECT COUNT(op.*)::int AS total,
            COUNT(ii.id)::int AS instalados,
            to_char(max(ii.instalado_at),'YYYY-MM-DD') AS ultima
       FROM ing_proyectos ip
       JOIN ordenes_produccion op ON op.proyecto_id = ip.proyecto_id
            AND op.status <> 'Cancelada' AND op.tipo IS DISTINCT FROM 'MUESTRA'
       LEFT JOIN schedule_install_items ii ON ii.op_id = op.id AND ii.proyecto_id = op.proyecto_id
      WHERE ip.proyecto_ext = $1`, [proyectoExt])

  // Punch list (defectos). Abierto = sin fecha de resolución.
  const { rows: pu } = await runner.query<{ total: string; abiertos: string }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE p.resolved_at IS NULL)::int AS abiertos
       FROM schedule_punch_items p
       JOIN ing_proyectos ip ON ip.proyecto_id = p.proyecto_id
      WHERE ip.proyecto_ext = $1`, [proyectoExt])

  const total = it[0] ? +it[0].total : 0
  const instalados = it[0] ? +it[0].instalados : 0
  const punchAbiertos = pu[0] ? +pu[0].abiertos : 0
  return {
    hay: total > 0,
    total,
    instalados,
    pct: total > 0 ? Math.round((instalados / total) * 100) / 100 : 0,
    fecha_ultima: it[0]?.ultima ?? null,
    punch_total: pu[0] ? +pu[0].total : 0,
    punch_abiertos: punchAbiertos,
    completa: total > 0 && instalados === total && punchAbiertos === 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detalle ítem×ítem + punch list para el panel del PM (#15). Solo lectura: lee del
// módulo de campo (installitems + field), sin duplicar nada. El PM lo abre desde su
// Gantt para ver el mismo avance que el instalador captura en el móvil.
export interface DetalleInstalacion { items: InstallItem[]; punch: PunchItem[] }

export async function detalleInstalacion(runner: QueryRunner, proyectoExt: string): Promise<DetalleInstalacion> {
  const { rows } = await runner.query<{ proyecto_id: number }>(
    `SELECT proyecto_id FROM ing_proyectos WHERE proyecto_ext = $1`, [proyectoExt])
  const pid = rows[0]?.proyecto_id
  if (!pid) return { items: [], punch: [] }
  const [items, punch] = await Promise.all([listInstallItems(runner, pid), listPunch(runner, pid)])
  return { items, punch }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handoff de instalación de 3 etapas — la parte del PM (Chali 2026-09-08).
// La instalación la gestiona el PM: la inicia, Campo verifica en el móvil (ítems +
// punch + firma del cliente = I-07), y cuando la verificación está completa vuelve al
// PM para completarla. Este widget de la bandeja del PM muestra las que le tocan:
//   · etapa 'iniciar'   = installation PENDIENTE y desbloqueada (envío hecho).
//   · etapa 'completar' = installation EN_CURSO con la verificación completa (I-07 firmado).
// (El estado en_curso SIN firma lo ve Campo en el móvil, no el PM.)
// ─────────────────────────────────────────────────────────────────────────────
export interface InstalacionPM {
  tarea_id: number
  proyecto_ext: string | null
  proyecto_nombre: string | null
  estado: string                 // pendiente | en_curso
  etapa: 'iniciar' | 'completar'
  fecha_fin: string | null       // fecha planeada de la tarea
  items_total: number
  items_instalados: number
  punch_abiertos: number
  firmada: boolean               // I-07 (firma del cliente) registrada
}

export async function listInstalacionesPM(runner: QueryRunner): Promise<InstalacionPM[]> {
  const { rows } = await runner.query<InstalacionPM & { estado: string }>(
    `SELECT t.id AS tarea_id, t.proyecto_ext, p.nombre AS proyecto_nombre, t.estado,
            CASE WHEN t.estado = 'pendiente' THEN 'iniciar' ELSE 'completar' END AS etapa,
            to_char(t.fecha_fin,'YYYY-MM-DD') AS fecha_fin,
            (SELECT COUNT(*) FROM ordenes_produccion op
              WHERE op.proyecto_id = p.id AND op.status <> 'Cancelada' AND op.tipo IS DISTINCT FROM 'MUESTRA')::int AS items_total,
            (SELECT COUNT(*) FROM schedule_install_items si WHERE si.proyecto_id = p.id)::int AS items_instalados,
            (SELECT COUNT(*) FROM schedule_punch_items pi WHERE pi.proyecto_id = p.id AND pi.estado = 'abierto')::int AS punch_abiertos,
            (i07.fecha_real IS NOT NULL) AS firmada
       FROM ing_tareas t
       JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
       LEFT JOIN proyectos p ON p.id = t.proyecto_id
       LEFT JOIN schedule_planes sp ON sp.proyecto_id = p.id AND sp.scope = 'proyecto'
       LEFT JOIN schedule_hitos i07 ON i07.plan_id = sp.id AND i07.codigo = 'I-07'
      WHERE tt.clave = 'installation'
        AND t.origen IN ('app','import_excel')
        AND (t.origen = 'import_excel' OR p.estado = 'activo')
        AND (
          (t.estado = 'pendiente'
             AND NOT EXISTS (SELECT 1 FROM ing_tarea_deps d JOIN ing_tareas pr ON pr.id = d.depende_de_id
                              WHERE d.tarea_id = t.id AND d.ignorada_at IS NULL AND d.tipo = 'FS'
                                AND pr.estado NOT IN ('hecha','na')))
          OR (t.estado = 'en_curso' AND i07.fecha_real IS NOT NULL)
        )
      ORDER BY t.fecha_fin NULLS LAST, t.proyecto_ext`)
  return rows.map((r) => ({ ...r, etapa: r.estado === 'pendiente' ? 'iniciar' : 'completar' }))
}
