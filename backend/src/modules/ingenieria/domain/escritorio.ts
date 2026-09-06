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
  proyecto_id: number | null      // para acciones que operan sobre el proyecto (ej. registrar firma)
  nombre: string
  tipo_clave: string | null
  rol: string | null
  asignado_nombre: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  fecha_entrega: string | null    // entrega comprometida del proyecto (para el intake de la firma)
  dur_dias: number
  estado: string
  reprogramacion_pedida: boolean
  reprogramacion_motivo: string | null
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

// Una tarea "en espera": bloqueada, con QUÉ predecesor la traba y de qué rol es
// (para que cada persona entienda por qué no ve nada, sin notificar a nadie).
export interface EnEspera {
  id: number
  proyecto_ext: string | null
  nombre: string
  espera_nombre: string   // la tarea predecesora que falta
  espera_rol: string | null   // rol de esa predecesora (→ de quién depende)
}

export async function getEscritorio(
  runner: QueryRunner,
  opts: { roles: string[]; asignado?: string | null }
): Promise<{ tareas: EscritorioTarea[]; bloqueadas: EnEspera[] }> {
  const params: unknown[] = [opts.roles]
  let asigCond = ''
  if (opts.asignado) { params.push(opts.asignado); asigCond = `AND t.asignado_nombre = $${params.length}` }

  // Base: tareas pendientes/en_curso de la ruta REAL (no sugerencias), del rol pedido.
  const base = `FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
    LEFT JOIN ing_proyectos ip ON ip.proyecto_ext = t.proyecto_ext
    WHERE t.estado NOT IN ('hecha','na')
      AND t.origen IN ('app','import_excel')
      AND tt.rol = ANY($1) ${asigCond}`

  const { rows } = await runner.query<EscritorioTarea>(
    `SELECT t.id, t.proyecto_ext, t.proyecto_id, t.nombre, tt.clave AS tipo_clave, tt.rol, t.asignado_nombre,
            to_char(t.fecha_inicio,'YYYY-MM-DD') AS fecha_inicio,
            to_char(t.fecha_fin,'YYYY-MM-DD')    AS fecha_fin,
            to_char(ip.fecha_entrega,'YYYY-MM-DD') AS fecha_entrega,
            t.dur_dias, t.estado, t.reprogramacion_pedida, t.reprogramacion_motivo
       ${base} AND NOT ${BLOQUEADA}
      ORDER BY t.fecha_inicio NULLS LAST, t.proyecto_ext, tt.orden`, params)

  // Las bloqueadas, con el predecesor que las traba (el más tardío = el que manda).
  const { rows: bloq } = await runner.query<EnEspera>(
    `SELECT DISTINCT ON (t.id) t.id, t.proyecto_ext, t.nombre,
            p.nombre AS espera_nombre, pt.rol AS espera_rol
       FROM ing_tareas t
       JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
       JOIN ing_tarea_deps d ON d.tarea_id = t.id AND d.ignorada_at IS NULL
       JOIN ing_tareas p ON p.id = d.depende_de_id
       JOIN ing_tarea_tipos pt ON pt.id = p.tipo_id
      WHERE t.estado NOT IN ('hecha','na')
        AND t.origen IN ('app','import_excel')
        AND tt.rol = ANY($1) ${asigCond}
        AND ( (d.tipo = 'FS' AND p.estado NOT IN ('hecha','na'))
           OR (d.tipo = 'SS' AND p.estado = 'pendiente'
               AND EXISTS (SELECT 1 FROM ing_tarea_deps d2 JOIN ing_tareas p2 ON p2.id = d2.depende_de_id
                            WHERE d2.tarea_id = p.id AND d2.ignorada_at IS NULL
                              AND d2.tipo = 'FS' AND p2.estado NOT IN ('hecha','na'))) )
      ORDER BY t.id, p.fecha_fin DESC NULLS LAST`, params)

  return { tareas: rows, bloqueadas: bloq }
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
