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
  entregable: string | null       // catálogo (083): qué captura el escritorio al completar
  cierre: string | null           // manual | derivado | decision_cliente
  rol: string | null
  asignado_nombre: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  fecha_entrega: string | null    // entrega comprometida del proyecto (para el intake + contexto)
  es_critico: boolean | null      // ¿está en el camino crítico? (prioridad)
  holgura_dias: number | null     // días de holgura del CPM (< 0 = en riesgo)
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

  // Handoff del paso 9 (Material Procurement, Q4): el MTO nace en Ingeniería (pendiente = el
  // ingeniero lo produce/importa) y APENAS se importa (n_materiales>0 → en_curso, vía el
  // reconciliador) pasa a COMPRAS (cotizar/comprar). Aunque su rol de catálogo es 'ingenieria',
  // en_curso lo ve Compras; pendiente lo ve Ingeniería. El resto de los pasos van por su rol.
  const verCompras = opts.roles.includes('compras')
  const rolCond = `( (tt.rol = ANY($1) AND NOT (tt.clave = 'material_proc' AND t.estado = 'en_curso'))${
    verCompras ? " OR (tt.clave = 'material_proc' AND t.estado = 'en_curso')" : ''} )`

  // Base: tareas pendientes/en_curso de la ruta REAL (no sugerencias), del rol pedido.
  // Solo proyectos ACTIVOS: un plan 'app' entra a los escritorios recién cuando el PM
  // activa el proyecto (el cliente ya aceptó) — no mientras es prospecto/reserva. Los
  // importados del Excel (import_excel) son proyectos reales en curso: se muestran siempre.
  const base = `FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
    LEFT JOIN ing_proyectos ip ON ip.proyecto_ext = t.proyecto_ext
    LEFT JOIN proyectos p ON p.id = t.proyecto_id
    WHERE t.estado NOT IN ('hecha','na')
      AND t.origen IN ('app','import_excel')
      AND (t.origen = 'import_excel' OR p.estado = 'activo')
      AND NOT (tt.clave = 'po_execution' AND t.origen <> 'app')
      AND ${rolCond} ${asigCond}`

  const { rows } = await runner.query<EscritorioTarea>(
    `SELECT t.id, t.proyecto_ext, t.proyecto_id, t.nombre, tt.clave AS tipo_clave, tt.entregable, tt.cierre, tt.rol, t.asignado_nombre,
            to_char(t.fecha_inicio,'YYYY-MM-DD') AS fecha_inicio,
            to_char(t.fecha_fin,'YYYY-MM-DD')    AS fecha_fin,
            to_char(ip.fecha_entrega,'YYYY-MM-DD') AS fecha_entrega,
            t.es_critico, t.holgura_dias,
            t.dur_dias, t.estado, t.reprogramacion_pedida, t.reprogramacion_motivo
       ${base} AND NOT ${BLOQUEADA}
      ORDER BY t.fecha_inicio NULLS LAST, t.proyecto_ext, tt.orden`, params)

  // Las bloqueadas, con el predecesor que las traba (el más tardío = el que manda).
  const { rows: bloq } = await runner.query<EnEspera>(
    `SELECT DISTINCT ON (t.id) t.id, t.proyecto_ext, t.nombre,
            pr.nombre AS espera_nombre, ptt.rol AS espera_rol
       FROM ing_tareas t
       JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
       LEFT JOIN proyectos pj ON pj.id = t.proyecto_id
       JOIN ing_tarea_deps d ON d.tarea_id = t.id AND d.ignorada_at IS NULL
       JOIN ing_tareas pr ON pr.id = d.depende_de_id
       JOIN ing_tarea_tipos ptt ON ptt.id = pr.tipo_id
      WHERE t.estado NOT IN ('hecha','na')
        AND t.origen IN ('app','import_excel')
        AND (t.origen = 'import_excel' OR pj.estado = 'activo')
        AND tt.rol = ANY($1) ${asigCond}
        AND ( (d.tipo = 'FS' AND pr.estado NOT IN ('hecha','na'))
           OR (d.tipo = 'SS' AND pr.estado = 'pendiente'
               AND EXISTS (SELECT 1 FROM ing_tarea_deps d2 JOIN ing_tareas p2 ON p2.id = d2.depende_de_id
                            WHERE d2.tarea_id = pr.id AND d2.ignorada_at IS NULL
                              AND d2.tipo = 'FS' AND p2.estado NOT IN ('hecha','na'))) )
      ORDER BY t.id, pr.fecha_fin DESC NULLS LAST`, params)

  return { tareas: rows, bloqueadas: bloq }
}

/** Conteo liviano de tareas ACCIONABLES (desbloqueadas) por rol de escritorio, para el
 *  badge "te toca: N" del menú. Respeta el mismo filtro que el escritorio (proyecto activo,
 *  handoff de material_proc, asignado). Devuelve { <rol>: N } — la piedra/MTO ya ruteados. */
export async function getEscritorioResumen(
  runner: QueryRunner, opts: { roles: string[]; asignado?: string | null }
): Promise<Record<string, number>> {
  const params: unknown[] = [opts.roles]
  let asigCond = ''
  if (opts.asignado) { params.push(opts.asignado); asigCond = `AND t.asignado_nombre = $${params.length}` }
  const verCompras = opts.roles.includes('compras')
  const rolCond = `( (tt.rol = ANY($1) AND NOT (tt.clave = 'material_proc' AND t.estado = 'en_curso'))${
    verCompras ? " OR (tt.clave = 'material_proc' AND t.estado = 'en_curso')" : ''} )`
  const { rows } = await runner.query<{ erol: string; n: number }>(
    `SELECT (CASE WHEN tt.clave = 'material_proc' AND t.estado = 'en_curso' THEN 'compras' ELSE tt.rol END) AS erol,
            COUNT(*)::int AS n
       FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
       LEFT JOIN proyectos p ON p.id = t.proyecto_id
      WHERE t.estado NOT IN ('hecha','na') AND t.origen IN ('app','import_excel')
        AND (t.origen = 'import_excel' OR p.estado = 'activo')
        AND NOT (tt.clave = 'po_execution' AND t.origen <> 'app')
        AND ${rolCond} ${asigCond}
        AND NOT ${BLOQUEADA}
      GROUP BY erol`, params)
  const m: Record<string, number> = {}
  for (const r of rows) if (r.erol) m[r.erol] = r.n
  return m
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
