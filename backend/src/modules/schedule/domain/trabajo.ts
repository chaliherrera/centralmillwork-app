// ─────────────────────────────────────────────────────────────────────────────
// Domain — "Mi trabajo por área" (los escritorios por rol)
// ─────────────────────────────────────────────────────────────────────────────
// La frontera activa del schedule, filtrada al área de un equipo, a través de
// TODOS los proyectos. Es el motor de los escritorios (Ingeniería, Estimados…):
// "esto es lo que le toca a tu equipo, en todos los proyectos, ahora".
//
// Solo hitos accionables (pendiente/en_riesgo/vencido), registrables a mano
// (manual_futuro) y que NO son del cliente (los aprobables van por el portal).
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { areaFromRol } from './recompute'

type QueryRunner = PoolClient | typeof pool

// Aprobables por el cliente (no son trabajo interno): van por el portal.
const APROBABLES_CLIENTE = new Set(['E-05', 'E-07', 'I-07'])

export interface TrabajoHito {
  codigo: string
  nombre: string
  rol_responsable: string | null
  fecha_planeada: string | null
  estado: string
  semaforo: string
  holgura_dias: number | null
  atribucion_atraso: string | null
}
export interface TrabajoProyecto {
  proyecto_id: number
  proyecto_codigo: string
  proyecto_nombre: string
  fecha_objetivo: string | null
  hitos: TrabajoHito[]
}

/** Devuelve el trabajo pendiente del área, agrupado por proyecto.
 *  Horizonte: los PENDIENTES solo si vencen dentro de `horizonteDias` (evita el ruido
 *  de hitos a meses vista); los en_riesgo/vencido siempre se muestran. */
export async function getTrabajoPorArea(runner: QueryRunner, area: string, horizonteDias = 30): Promise<TrabajoProyecto[]> {
  const { rows } = await runner.query<{
    proyecto_id: number; proyecto_codigo: string; proyecto_nombre: string; fecha_objetivo: string | null
    codigo: string; nombre: string; rol_responsable: string | null; fecha_planeada: string | null
    estado: string; semaforo: string; holgura_dias: number | null; atribucion_atraso: string | null
    orden: number
  }>(
    `SELECT sp.proyecto_id, p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre,
            to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fecha_objetivo,
            sh.codigo, ph.nombre, ph.rol_responsable, ph.orden,
            to_char(sh.fecha_planeada,'YYYY-MM-DD') AS fecha_planeada,
            sh.estado, sh.semaforo, sh.holgura_dias, sh.atribucion_atraso
       FROM schedule_planes sp
       JOIN proyectos p ON p.id = sp.proyecto_id
       JOIN schedule_hitos sh ON sh.plan_id = sp.id
       JOIN schedule_plantilla_hitos ph ON ph.plantilla_id = sp.plantilla_id AND ph.codigo = sh.codigo
      WHERE sp.scope = 'proyecto'
        AND ph.fuente_dato = 'manual_futuro'
        AND sh.estado IN ('pendiente','en_riesgo','vencido')
        AND (sh.estado <> 'pendiente' OR sh.fecha_planeada IS NULL
             OR sh.fecha_planeada <= CURRENT_DATE + make_interval(days => $1))
      ORDER BY sh.holgura_dias NULLS LAST, sp.proyecto_id, ph.orden`, [horizonteDias])

  const porProyecto = new Map<number, TrabajoProyecto>()
  for (const r of rows) {
    if (APROBABLES_CLIENTE.has(r.codigo)) continue          // eso lo hace el cliente
    if (areaFromRol(r.rol_responsable) !== area) continue    // solo el área pedida
    let g = porProyecto.get(r.proyecto_id)
    if (!g) {
      g = {
        proyecto_id: r.proyecto_id, proyecto_codigo: r.proyecto_codigo,
        proyecto_nombre: r.proyecto_nombre, fecha_objetivo: r.fecha_objetivo, hitos: [],
      }
      porProyecto.set(r.proyecto_id, g)
    }
    g.hitos.push({
      codigo: r.codigo, nombre: r.nombre, rol_responsable: r.rol_responsable,
      fecha_planeada: r.fecha_planeada, estado: r.estado, semaforo: r.semaforo,
      holgura_dias: r.holgura_dias, atribucion_atraso: r.atribucion_atraso,
    })
  }
  return [...porProyecto.values()]
}
