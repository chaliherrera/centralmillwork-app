/**
 * tareasFromSystem.ts — Job que genera tareas auto a partir del estado de la DB
 * del módulo de Compras.
 *
 * Reglas v1:
 *   - quote-stale     cotización > 2d sin moverse
 *   - eta-today       OC con ETA hoy y no recibida
 *   - eta-overdue     OC con ETA vencida y no recibida
 *   - partial-stale   OC en estado parcial sin movimiento > 5d
 *
 * Idempotencia: cada regla tiene un prefix único en source_ref. Re-correr no
 * duplica (UNIQUE INDEX parcial cubre el caso).
 *
 * Auto-cierre: después de insertar las activas, marca como 'completada' las
 * tareas de sistema que tenían un source_ref que ya no aparece en las
 * condiciones activas (la situación se resolvió).
 */

import pool from '../db/pool'
import { logger } from '../utils/logger'
import { notifyTareaBySourceRef } from '../utils/notifyTarea'

interface RuleStats {
  created: number
  reactivated: number
  autoClosed: number
  kept: number
  userClosedSkipped: number   // cerradas por user — respetadas, no reactivadas
}

interface SyncResult {
  created: number
  reactivated: number
  autoClosed: number
  kept: number
  userClosedSkipped: number
  byRule: Record<string, RuleStats>
}

type Priority = 'low' | 'medium' | 'high'
type Area = 'procurement' | 'despachos' | 'recepcion' | 'administracion'

interface Condition {
  sourceRef: string
  area: Area
  priority: Priority
  title: string
  description: string
  subject: string
}

interface Rule {
  key: string                                  // prefix de source_ref
  query: () => Promise<Condition[]>
}

const FROM_EMAIL_SYSTEM = 'sistema@centralmillwork.com'

// ─── Rule 1: cotización estancada ────────────────────────────────────────────

async function ruleQuoteStale(): Promise<Condition[]> {
  const { rows } = await pool.query(
    `SELECT s.id, s.folio, s.fecha_solicitud,
            (CURRENT_DATE - s.fecha_solicitud::date) AS dias,
            COALESCE(p.codigo, '') AS proyecto_codigo,
            COALESCE(p.nombre, '') AS proyecto_nombre,
            COALESCE(prov.nombre, 'Proveedor') AS proveedor_nombre
     FROM solicitudes_cotizacion s
     LEFT JOIN proyectos p     ON p.id = s.proyecto_id
     LEFT JOIN proveedores prov ON prov.id = s.proveedor_id
     WHERE s.estado IN ('pendiente', 'enviada')
       AND s.fecha_solicitud < CURRENT_DATE - INTERVAL '2 days'`,
  )
  return rows.map((r: any) => {
    const dias = parseInt(r.dias, 10)
    const priority: Priority = dias >= 7 ? 'high' : dias >= 4 ? 'medium' : 'low'
    return {
      sourceRef: `quote-stale:${r.id}`,
      area: 'procurement',
      priority,
      title: `Seguir cotización ${r.folio} - ${r.proveedor_nombre} (${dias}d sin respuesta)`,
      description: `Cotización ${r.folio} a ${r.proveedor_nombre} enviada hace ${dias} días sin respuesta. ${r.proyecto_nombre ? `Proyecto: ${r.proyecto_nombre}.` : ''}`,
      subject: `${r.proyecto_codigo ? r.proyecto_codigo + ' ' : ''}Cotización ${r.folio} estancada ${dias}d`,
    }
  })
}

// ─── Rule 2: ETA hoy ─────────────────────────────────────────────────────────

async function ruleEtaToday(): Promise<Condition[]> {
  const { rows } = await pool.query(
    `SELECT oc.id, oc.numero, oc.fecha_entrega_estimada,
            COALESCE(p.codigo, '') AS proyecto_codigo,
            COALESCE(p.nombre, '') AS proyecto_nombre,
            COALESCE(prov.nombre, 'Proveedor') AS proveedor_nombre
     FROM ordenes_compra oc
     LEFT JOIN proyectos p     ON p.id = oc.proyecto_id
     LEFT JOIN proveedores prov ON prov.id = oc.proveedor_id
     WHERE oc.estado IN ('enviada', 'confirmada', 'parcial')
       AND oc.fecha_entrega_estimada::date = CURRENT_DATE`,
  )
  return rows.map((r: any) => ({
    sourceRef: `eta-today:${r.id}`,
    area: 'recepcion',
    priority: 'high',
    title: `Llega hoy OC ${r.numero} - ${r.proveedor_nombre}`,
    description: `La orden ${r.numero} (${r.proveedor_nombre}) tiene entrega estimada hoy. Coordinar recepción.${r.proyecto_nombre ? ` Proyecto: ${r.proyecto_nombre}.` : ''}`,
    subject: `${r.proyecto_codigo ? r.proyecto_codigo + ' ' : ''}OC ${r.numero} llega hoy`,
  }))
}

// ─── Rule 3: ETA vencida ─────────────────────────────────────────────────────

async function ruleEtaOverdue(): Promise<Condition[]> {
  const { rows } = await pool.query(
    `SELECT oc.id, oc.numero, oc.fecha_entrega_estimada,
            (CURRENT_DATE - oc.fecha_entrega_estimada::date) AS dias_vencida,
            COALESCE(p.codigo, '') AS proyecto_codigo,
            COALESCE(p.nombre, '') AS proyecto_nombre,
            COALESCE(prov.nombre, 'Proveedor') AS proveedor_nombre
     FROM ordenes_compra oc
     LEFT JOIN proyectos p     ON p.id = oc.proyecto_id
     LEFT JOIN proveedores prov ON prov.id = oc.proveedor_id
     WHERE oc.estado IN ('enviada', 'confirmada', 'parcial')
       AND oc.fecha_entrega_estimada::date < CURRENT_DATE`,
  )
  return rows.map((r: any) => {
    const dias = parseInt(r.dias_vencida, 10)
    return {
      sourceRef: `eta-overdue:${r.id}`,
      area: 'recepcion',
      priority: 'high',
      title: `Vencida OC ${r.numero} - ${r.proveedor_nombre} (${dias}d)`,
      description: `La orden ${r.numero} (${r.proveedor_nombre}) está vencida ${dias} días. ETA original ${new Date(r.fecha_entrega_estimada).toLocaleDateString('es')}.${r.proyecto_nombre ? ` Proyecto: ${r.proyecto_nombre}.` : ''}`,
      subject: `${r.proyecto_codigo ? r.proyecto_codigo + ' ' : ''}OC ${r.numero} vencida ${dias}d`,
    }
  })
}

// ─── Rule 4: parcial estancada ───────────────────────────────────────────────

async function rulePartialStale(): Promise<Condition[]> {
  const { rows } = await pool.query(
    `SELECT oc.id, oc.numero,
            (CURRENT_DATE - oc.updated_at::date) AS dias,
            COALESCE(p.codigo, '') AS proyecto_codigo,
            COALESCE(p.nombre, '') AS proyecto_nombre,
            COALESCE(prov.nombre, 'Proveedor') AS proveedor_nombre
     FROM ordenes_compra oc
     LEFT JOIN proyectos p     ON p.id = oc.proyecto_id
     LEFT JOIN proveedores prov ON prov.id = oc.proveedor_id
     WHERE oc.estado = 'parcial'
       AND oc.updated_at < CURRENT_DATE - INTERVAL '5 days'`,
  )
  return rows.map((r: any) => {
    const dias = parseInt(r.dias, 10)
    return {
      sourceRef: `partial-stale:${r.id}`,
      area: 'recepcion',
      priority: 'medium',
      title: `Cerrar recepción parcial OC ${r.numero} (${dias}d sin movimiento)`,
      description: `La orden ${r.numero} (${r.proveedor_nombre}) sigue en recepción parcial desde hace ${dias} días sin movimiento.${r.proyecto_nombre ? ` Proyecto: ${r.proyecto_nombre}.` : ''}`,
      subject: `${r.proyecto_codigo ? r.proyecto_codigo + ' ' : ''}OC ${r.numero} parcial estancada ${dias}d`,
    }
  })
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const RULES: Rule[] = [
  { key: 'quote-stale',  query: ruleQuoteStale },
  { key: 'eta-today',     query: ruleEtaToday },
  { key: 'eta-overdue',   query: ruleEtaOverdue },
  { key: 'partial-stale', query: rulePartialStale },
]

export async function syncSystemTareas(): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    reactivated: 0,
    autoClosed: 0,
    kept: 0,
    userClosedSkipped: 0,
    byRule: {},
  }

  for (const rule of RULES) {
    const ruleStats: RuleStats = { created: 0, reactivated: 0, autoClosed: 0, kept: 0, userClosedSkipped: 0 }
    let activeConditions: Condition[] = []
    try {
      activeConditions = await rule.query()
    } catch (err) {
      logger.error('syncSystemTareas rule query failed', { rule: rule.key, err: String(err) })
      result.byRule[rule.key] = ruleStats
      continue
    }

    const activeRefs = new Set(activeConditions.map((c) => c.sourceRef))

    // Existing system tareas de esta regla, en estado activo
    const existing = await pool.query(
      `SELECT id, source_ref FROM tareas
       WHERE origen = 'sistema'
         AND source_ref LIKE $1
         AND estado IN ('pendiente', 'en_progreso')`,
      [`${rule.key}:%`],
    )
    const existingRefs = new Set(existing.rows.map((r: any) => r.source_ref))

    // UPSERT por cada condición activa:
    // - si no existe ningún row con ese source_ref → INSERT nueva (estado=pendiente)
    // - si existe y está en estado activo → no-op (mantener metadata original, no pisar)
    // - si existe pero está en estado completada/descartada Y user NO la cerró →
    //   REACTIVAR (volver a pendiente, limpiar completed_at, refrescar metadata).
    //   Este es el caso "ghost task" que el bug original arreglaba.
    // - si existe en completada/descartada Y closed_by_user_at IS NOT NULL →
    //   no-op: el user la cerró a propósito, RESPETAR esa decisión.
    //
    // El UNIQUE INDEX parcial sobre (source_ref WHERE origen='sistema') asegura idempotencia.
    for (const cond of activeConditions) {
      if (existingRefs.has(cond.sourceRef)) {
        ruleStats.kept++
        continue
      }
      try {
        const upsert = await pool.query(
          `INSERT INTO tareas (area, title, description, priority, from_email, subject, source_email_id, origen, source_ref)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, 'sistema', $7)
           ON CONFLICT (source_ref) WHERE origen = 'sistema' AND source_ref IS NOT NULL
           DO UPDATE SET
             estado = 'pendiente',
             completed_at = NULL,
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             priority = EXCLUDED.priority,
             subject = EXCLUDED.subject,
             area = EXCLUDED.area
           WHERE tareas.estado IN ('completada', 'descartada')
             AND tareas.closed_by_user_at IS NULL
           RETURNING (xmax = 0) AS inserted`,
          [cond.area, cond.title, cond.description, cond.priority, FROM_EMAIL_SYSTEM, cond.subject, cond.sourceRef],
        )
        // xmax = 0 cuando es INSERT genuino. Si fue UPDATE (reactivación), xmax != 0.
        if (upsert.rows[0]?.inserted) {
          ruleStats.created++
          // F7: mandar email a destinatarios (rol según area). Idempotente
          // — si email_sent_at ya está, no se manda. Fire-and-forget para
          // no bloquear el cron si Resend está lento.
          notifyTareaBySourceRef(pool, cond.sourceRef)
            .catch((err) => logger.warn('notifyTarea after sync upsert failed', {
              sourceRef: cond.sourceRef, err: String(err),
            }))
        }
        else if (upsert.rows.length > 0) ruleStats.reactivated++
        else ruleStats.userClosedSkipped++   // existía cerrada por user — respetada
      } catch (err) {
        logger.error('syncSystemTareas upsert failed', { sourceRef: cond.sourceRef, err: String(err) })
      }
    }

    // Auto-cerrar: las que existen activas pero ya no están en condiciones.
    // Safety: si pasamos de >5 activas a 0 condiciones, log warning. Sospechoso de
    // un fallo transitorio (DB connection, query timeout, etc.) que devolvió 0
    // cuando en realidad había condiciones. Igual procedemos — el UPSERT de arriba
    // las reactivaría en la siguiente corrida si la condición sigue activa.
    if (existing.rows.length > 5 && activeRefs.size === 0) {
      logger.warn('syncSystemTareas: auto-close masivo sospechoso (todas las activas se cierran)', {
        rule: rule.key,
        existingActive: existing.rows.length,
        activeConditions: activeRefs.size,
      })
    }

    for (const ex of existing.rows) {
      if (!activeRefs.has(ex.source_ref)) {
        await pool.query(
          `UPDATE tareas
           SET estado = 'completada', completed_at = NOW()
           WHERE id = $1 AND estado IN ('pendiente', 'en_progreso')`,
          [ex.id],
        )
        ruleStats.autoClosed++
      }
    }

    result.byRule[rule.key] = ruleStats
    result.created           += ruleStats.created
    result.reactivated       += ruleStats.reactivated
    result.autoClosed        += ruleStats.autoClosed
    result.kept              += ruleStats.kept
    result.userClosedSkipped += ruleStats.userClosedSkipped
  }

  return result
}
