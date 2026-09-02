// ─────────────────────────────────────────────────────────────────────────────
// Escritorio por rol — el corazón de la UX del Life of a Deal.
// ─────────────────────────────────────────────────────────────────────────────
// Cada rol ve SOLO su próxima tarea pendiente que YA SE DESBLOQUEÓ (todos los
// predecesores se cumplieron), de TODOS los proyectos, en orden de asignación
// (fecha CPM). Al completarla desaparece y aparece la siguiente. Las bloqueadas no
// se muestran (solo un contador "N en espera").
//
// Prerequisito: cerrarTareasAutomaticas (reconciliador) mantiene el estado de las
// tareas auto al día desde los hechos de módulos — sin eso el filtro trabaría todo.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'

type QueryRunner = PoolClient | typeof pool

export interface EscritorioTarea {
  id: number
  proyecto_ext: string | null
  nombre: string
  tipo_clave: string | null
  rol: string | null
  asignado_nombre: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  dur_dias: number
  estado: string
}

// Una tarea está BLOQUEADA si tiene un predecesor (dep no ignorada por el candado) donde:
//  · FS: el predecesor NO está hecho/na, o
//  · SS: el predecesor está 'pendiente' Y ese predecesor a su vez tiene un FS sin cumplir
//        (= el predecesor todavía no está disponible). Así samples (SS con shop_drawings)
//        aparece cuando shop_drawings se vuelve disponible, no cuando se completa.
const BLOQUEADA = `EXISTS (
  SELECT 1 FROM ing_tarea_deps d JOIN ing_tareas p ON p.id = d.depende_de_id
   WHERE d.tarea_id = t.id AND d.ignorada_at IS NULL
     AND ( (d.tipo = 'FS' AND p.estado NOT IN ('hecha','na'))
        OR (d.tipo = 'SS' AND p.estado = 'pendiente'
            AND EXISTS (SELECT 1 FROM ing_tarea_deps d2 JOIN ing_tareas p2 ON p2.id = d2.depende_de_id
                         WHERE d2.tarea_id = p.id AND d2.ignorada_at IS NULL
                           AND d2.tipo = 'FS' AND p2.estado NOT IN ('hecha','na'))) ))`

export async function getEscritorio(
  runner: QueryRunner,
  opts: { roles: string[]; asignado?: string | null }
): Promise<{ tareas: EscritorioTarea[]; bloqueadas: number }> {
  const params: unknown[] = [opts.roles]
  let asigCond = ''
  if (opts.asignado) { params.push(opts.asignado); asigCond = `AND t.asignado_nombre = $${params.length}` }

  // Base: tareas pendientes/en_curso de la ruta REAL (no sugerencias), del rol pedido.
  const base = `FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
    WHERE t.estado NOT IN ('hecha','na')
      AND t.origen IN ('app','import_excel')
      AND tt.rol = ANY($1) ${asigCond}`

  const { rows } = await runner.query<EscritorioTarea>(
    `SELECT t.id, t.proyecto_ext, t.nombre, tt.clave AS tipo_clave, tt.rol, t.asignado_nombre,
            to_char(t.fecha_inicio,'YYYY-MM-DD') AS fecha_inicio,
            to_char(t.fecha_fin,'YYYY-MM-DD')    AS fecha_fin,
            t.dur_dias, t.estado
       ${base} AND NOT ${BLOQUEADA}
      ORDER BY t.fecha_inicio NULLS LAST, t.proyecto_ext, tt.orden`, params)

  const { rows: bc } = await runner.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n ${base} AND ${BLOQUEADA}`, params)

  return { tareas: rows, bloqueadas: bc[0]?.n ?? 0 }
}

// Mapa rol-de-app → roles-de-ruta que ve su escritorio. ADMIN/PM ven todo (con selector).
export const ROLES_RUTA_POR_APP: Record<string, string[]> = {
  ENGINEERING: ['ingenieria', 'field'],
  FIELD: ['field'],
  PROCUREMENT: ['compras'],
  PRODUCTION: ['produccion', 'instalacion'],
  SHOP_MANAGER: ['produccion', 'instalacion'],
  LOGISTICA: ['logistica'],
  ADMIN: ['ingenieria', 'field', 'compras', 'produccion', 'instalacion', 'logistica', 'estimacion'],
  PROJECT_MANAGEMENT: ['ingenieria', 'field', 'compras', 'produccion', 'instalacion', 'logistica', 'estimacion'],
}
