// ─────────────────────────────────────────────────────────────────────────────
// Gate del depósito (paso 3 → frena 4 y 9)
// ─────────────────────────────────────────────────────────────────────────────
// Regla de arquitectura (Chali): un dato con dueño se LEE, no se copia. El hecho
// "depósito confirmado" lo dueña FINANZAS en el módulo schedule (hito C-04 "Down
// Payment", schedule_hitos.fecha_real). Acá lo LEEMOS. Lo único propio de la ruta
// es la decisión del PM de ABRIR el gate a mano antes de que el pago llegue
// (candado ing_tarea_deps.ignorada_at/por) — nadie más dueña ese hecho.
//
// El motor usa la fecha de RESOLUCIÓN (pago o apertura del candado) como piso
// "no antes de" de material_deposit: un depósito tardío empuja las compras, y abrir
// el candado hace seguir DESDE la apertura (no desde el pasado). Los días día-cero→
// resolución quedan como atribuibles al cliente (justificativo), abra o no el candado.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'

type QueryRunner = PoolClient | typeof pool

export interface EstadoDeposito {
  confirmado_finanzas: boolean   // Finanzas registró el hito C-04 (pago recibido)
  fecha_confirmacion: string | null
  override_pm: boolean           // el PM abrió el gate a mano (seguir sin el pago)
  override_por: string | null    // nombre/email de quién lo abrió
  override_at: string | null
  abierto: boolean               // pagado por Finanzas O abierto por el PM
  // Fecha en que el depósito DEJÓ de frenar = la más temprana entre pago y apertura. Es el
  // piso "no antes de" de material_deposit: al abrir el candado seguimos desde acá, no del pasado.
  fecha_resolucion: string | null
  // Días que el depósito estuvo pendiente (día cero → resolución) = ATRIBUIBLES AL CLIENTE.
  // Se conservan aunque el PM abra el candado — justificativo si la entrega queda en riesgo.
  dias_atribuibles_cliente: number | null
}

/** Lee el estado del gate del depósito de un proyecto (dato de Finanzas + candado del PM). */
export async function estadoDeposito(runner: QueryRunner, proyectoExt: string): Promise<EstadoDeposito> {
  // (1) Día cero (arranca la cuenta de días del cliente) + confirmación de Finanzas (C-04).
  const { rows: fin } = await runner.query<{ dia_cero: string | null; fecha: string | null }>(
    `SELECT to_char(ip.fecha_inicio,'YYYY-MM-DD') AS dia_cero,
            to_char(h.fecha_real,'YYYY-MM-DD') AS fecha
       FROM ing_proyectos ip
       JOIN schedule_planes sp ON sp.proyecto_id = ip.proyecto_id AND sp.scope = 'proyecto'
       JOIN schedule_hitos  h  ON h.plan_id = sp.id AND h.codigo = 'C-04'
      WHERE ip.proyecto_ext = $1
      LIMIT 1`, [proyectoExt])
  const diaCero = fin[0]?.dia_cero ?? null
  const fechaConf = fin[0]?.fecha ?? null
  const confirmado = !!fechaConf

  // (2) Candado del PM: alguna arista que depende de material_deposit está ignorada.
  const { rows: ov } = await runner.query<{ at: string | null; por: string | null }>(
    `SELECT to_char(d.ignorada_at,'YYYY-MM-DD') AS at, u.email AS por
       FROM ing_tarea_deps d
       JOIN ing_tareas t   ON t.id = d.depende_de_id
       JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id AND tt.clave = 'material_deposit'
       LEFT JOIN usuarios u ON u.id = d.ignorada_por
      WHERE t.proyecto_ext = $1 AND d.ignorada_at IS NOT NULL
      ORDER BY d.ignorada_at ASC
      LIMIT 1`, [proyectoExt])
  const overridePm = ov.length > 0
  const overrideAt = ov[0]?.at ?? null

  // Resolución = lo que primero destrabó el depósito (pago o apertura del candado).
  const cand = [fechaConf, overrideAt].filter((x): x is string => !!x).sort()
  const resolucion = cand.length ? cand[0] : null
  const dias = (resolucion && diaCero)
    ? Math.max(0, Math.round((Date.parse(resolucion) - Date.parse(diaCero)) / 86400000))
    : null

  return {
    confirmado_finanzas: confirmado,
    fecha_confirmacion: fechaConf,
    override_pm: overridePm,
    override_por: ov[0]?.por ?? null,
    override_at: overrideAt,
    abierto: confirmado || overridePm,
    fecha_resolucion: resolucion,
    dias_atribuibles_cliente: dias,
  }
}

export interface DepositoBloqueando {
  proyecto_ext: string
  nombre: string | null
  dias_pendiente: number | null   // días que el depósito lleva sin pagar (día cero → hoy)
}

/** Proyectos donde las compras están LISTAS (aprobación #8 hecha) pero el depósito NO se
 *  resolvió (ni pagado ni candado abierto). Es la alerta para la bandeja del PM: el
 *  ingeniero llegó al paso 9 y el pago no está — el PM decide abrir el candado o frenar. */
export async function listDepositosBloqueando(runner: QueryRunner): Promise<DepositoBloqueando[]> {
  const { rows } = await runner.query<DepositoBloqueando>(
    `SELECT ip.proyecto_ext, p.nombre,
            GREATEST(0, (CURRENT_DATE - ip.fecha_inicio))::int AS dias_pendiente
       FROM ing_proyectos ip
       JOIN proyectos p ON p.id = ip.proyecto_id
      WHERE EXISTS (SELECT 1 FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
                     WHERE t.proyecto_ext = ip.proyecto_ext AND tt.clave = 'approval' AND t.estado = 'hecha')
        AND NOT EXISTS (SELECT 1 FROM schedule_planes sp JOIN schedule_hitos h ON h.plan_id = sp.id
                         WHERE sp.proyecto_id = ip.proyecto_id AND sp.scope = 'proyecto'
                           AND h.codigo = 'C-04' AND h.fecha_real IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM ing_tarea_deps d
                          JOIN ing_tareas t ON t.id = d.depende_de_id
                          JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
                         WHERE t.proyecto_ext = ip.proyecto_ext AND tt.clave = 'material_deposit'
                           AND d.ignorada_at IS NOT NULL)
      ORDER BY dias_pendiente DESC, ip.proyecto_ext`)
  return rows
}

/** El PM abre (o cierra) el gate del depósito a mano: pone/saca el candado en TODAS las
 *  aristas que dependen de material_deposit. Reusable para cualquier gate vía tipoClave. */
export async function overrideGate(
  runner: QueryRunner, proyectoExt: string, tipoClave: string, abrir: boolean, usuarioId: string | null
): Promise<{ ok: boolean; afectadas: number }> {
  const { rowCount } = await runner.query(
    `UPDATE ing_tarea_deps d
        SET ignorada_at  = CASE WHEN $3 THEN NOW() ELSE NULL END,
            ignorada_por = CASE WHEN $3 THEN $4::uuid ELSE NULL END
       FROM ing_tareas t, ing_tarea_tipos tt
      WHERE d.depende_de_id = t.id AND t.tipo_id = tt.id
        AND tt.clave = $2 AND t.proyecto_ext = $1`,
    [proyectoExt, tipoClave, abrir, usuarioId])
  return { ok: true, afectadas: rowCount ?? 0 }
}
