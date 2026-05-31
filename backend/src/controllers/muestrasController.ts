import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import multer from 'multer'
import path from 'path'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { logger } from '../utils/logger'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../utils/supabase'

// ─── Tipos y constantes ──────────────────────────────────────────────────────

const ESTADOS = ['SOLICITADA','EN_FABRICACION','EN_QC','ENVIADA','APROBADA','RECHAZADA','ARCHIVADA'] as const
const TIPOS = ['PUERTA','ACABADO','HARDWARE','CABINET','OTRO'] as const
const PRIORIDADES = ['ALTA','MEDIA','BAJA'] as const

// Transiciones válidas. Forma: { [estado_actual]: [estados destino válidos] }
// Permitimos volver atrás solo en casos puntuales (admin override).
const TRANSICIONES: Record<typeof ESTADOS[number], typeof ESTADOS[number][]> = {
  SOLICITADA:     ['EN_FABRICACION', 'ARCHIVADA'],
  EN_FABRICACION: ['EN_QC', 'SOLICITADA', 'ARCHIVADA'],  // SOLICITADA = "esperar más materiales"
  EN_QC:          ['ENVIADA', 'EN_FABRICACION', 'ARCHIVADA'],  // QC fail vuelve a fabricación
  ENVIADA:        ['APROBADA', 'RECHAZADA', 'ARCHIVADA'],
  APROBADA:       ['ARCHIVADA'],
  RECHAZADA:      ['SOLICITADA', 'EN_FABRICACION', 'ARCHIVADA'],  // crea V2 y vuelve
  ARCHIVADA:      [],  // terminal
}

// ─── Schemas de validación ───────────────────────────────────────────────────

export const createMuestraSchema = z.object({
  codigo:           z.string().trim().min(1).max(30),
  proyecto_id:      z.number().int().positive(),
  descripcion:      z.string().trim().min(1).max(2000),
  tipo:             z.enum(TIPOS).optional(),
  prioridad:        z.enum(PRIORIDADES).optional(),
  owner_id:         z.string().uuid().nullable().optional(),
  fecha_compromiso: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
  notas:            z.string().max(5000).nullable().optional(),
  // Specs de V1 — se guardan en muestras_versiones
  especificaciones: z.string().max(10000).nullable().optional(),
})

export const updateMuestraSchema = z.object({
  descripcion:      z.string().trim().min(1).max(2000).optional(),
  tipo:             z.enum(TIPOS).optional(),
  prioridad:        z.enum(PRIORIDADES).optional(),
  owner_id:         z.string().uuid().nullable().optional(),
  fecha_compromiso: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
  notas:            z.string().max(5000).nullable().optional(),
})

export const transicionEstadoSchema = z.object({
  nuevo_estado: z.enum(ESTADOS),
  comentario:   z.string().max(2000).optional(),
  // Para RECHAZADA: razón del rechazo (crea V+1 con esta razón)
  razon_revision: z.string().max(2000).optional(),
})

export const registrarEnvioSchema = z.object({
  destinatario:     z.string().trim().min(1).max(200),
  direccion:        z.string().max(500).optional(),
  tracking_carrier: z.string().max(50).optional(),
  tracking_number:  z.string().max(100).optional(),
  notas:            z.string().max(1000).optional(),
})

export const confirmarRecepcionSchema = z.object({
  envio_id:                   z.number().int().positive(),
  fecha_recepcion_confirmada: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
})

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getMuestraOr404(id: number, next: NextFunction) {
  const { rows: [m] } = await pool.query('SELECT * FROM muestras WHERE id = $1', [id])
  if (!m) {
    next(createError('Muestra no encontrada', 404))
    return null
  }
  return m
}

async function logEvento(
  muestraId: number,
  versionNumero: number,
  tipo: string,
  detalle: string | null,
  usuarioId: string | null
) {
  await pool.query(
    `INSERT INTO muestras_eventos (muestra_id, version_numero, tipo, detalle, usuario_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [muestraId, versionNumero, tipo, detalle, usuarioId]
  )
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

/**
 * GET /api/muestras
 * Lista todas las muestras con resumen para el kanban.
 *
 * Query params opcionales:
 *   - estado=SOLICITADA,EN_FABRICACION   filtra por estado(s)
 *   - proyecto_id=N                       filtra por proyecto
 *   - owner_id=UUID                       filtra por owner
 *   - incluir_archivadas=true             default excluye ARCHIVADA
 */
export async function getMuestras(req: Request, res: Response, next: NextFunction) {
  try {
    const conds: string[] = []
    const vals: unknown[] = []

    if (req.query.estado) {
      const estados = String(req.query.estado).split(',').filter((s) => ESTADOS.includes(s as any))
      if (estados.length > 0) {
        vals.push(estados)
        conds.push(`m.estado = ANY($${vals.length}::muestra_estado[])`)
      }
    } else if (req.query.incluir_archivadas !== 'true') {
      conds.push(`m.estado != 'ARCHIVADA'`)
    }

    if (req.query.proyecto_id) {
      vals.push(parseInt(String(req.query.proyecto_id)))
      conds.push(`m.proyecto_id = $${vals.length}`)
    }
    if (req.query.owner_id) {
      vals.push(String(req.query.owner_id))
      conds.push(`m.owner_id = $${vals.length}`)
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

    const { rows } = await pool.query(
      `SELECT
         m.*,
         p.codigo  AS proyecto_codigo,
         p.nombre  AS proyecto_nombre,
         u.nombre  AS owner_nombre,
         u.email   AS owner_email,
         (SELECT COUNT(*) FROM ordenes_compra WHERE muestra_id = m.id)::int AS ocs_count,
         (SELECT COUNT(*) FROM ordenes_compra
            WHERE muestra_id = m.id AND estado IN ('borrador','enviada','confirmada','parcial'))::int
                                                                              AS ocs_pendientes,
         EXTRACT(DAY FROM NOW() - m.created_at)::int                          AS dias_desde_creacion
       FROM muestras m
       LEFT JOIN proyectos p ON p.id = m.proyecto_id
       LEFT JOIN usuarios u ON u.id = m.owner_id
       ${where}
       ORDER BY
         CASE m.prioridad WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
         m.fecha_compromiso NULLS LAST,
         m.created_at DESC`,
      vals
    )

    // Resumen agregado por estado (para los KPIs del kanban)
    const resumen: Record<string, number> = Object.fromEntries(ESTADOS.map((e) => [e, 0]))
    rows.forEach((r) => { resumen[r.estado]++ })

    res.json({ data: { items: rows, resumen } })
  } catch (err) { next(err) }
}

/**
 * GET /api/muestras/:id
 * Detalle completo: muestra + versión actual + envíos + OCs + timeline reciente.
 */
export async function getMuestra(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    if (!Number.isFinite(id)) return next(createError('id inválido', 400))

    const muestra = await getMuestraOr404(id, next)
    if (!muestra) return

    // Proyecto + owner
    const { rows: [proyecto] } = await pool.query(
      'SELECT codigo, nombre, cliente, estado FROM proyectos WHERE id = $1',
      [muestra.proyecto_id]
    )
    const { rows: [owner] } = muestra.owner_id
      ? await pool.query('SELECT id, nombre, email, rol FROM usuarios WHERE id = $1', [muestra.owner_id])
      : { rows: [null] }

    // Todas las versiones
    const { rows: versiones } = await pool.query(
      `SELECT v.*, op.numero_orden AS op_numero, op.status AS op_status
       FROM muestras_versiones v
       LEFT JOIN ordenes_produccion op ON op.id = v.op_id
       WHERE v.muestra_id = $1
       ORDER BY v.version_numero DESC`,
      [id]
    )

    // OCs asociadas (cualquier versión)
    const { rows: ocs } = await pool.query(
      `SELECT oc.id, oc.numero, oc.estado, oc.fecha_emision, oc.fecha_entrega_estimada,
              oc.fecha_entrega_real, oc.total, oc.origen,
              v.nombre AS vendor_nombre
       FROM ordenes_compra oc
       LEFT JOIN proveedores v ON v.id = oc.proveedor_id
       WHERE oc.muestra_id = $1
       ORDER BY oc.fecha_emision DESC NULLS LAST, oc.id DESC`,
      [id]
    )

    // Envíos (todas las versiones)
    const { rows: envios } = await pool.query(
      `SELECT * FROM muestras_envios
       WHERE muestra_id = $1
       ORDER BY fecha_envio DESC`,
      [id]
    )

    // Timeline reciente (últimos 50 eventos)
    const { rows: eventos } = await pool.query(
      `SELECT e.*, u.nombre AS usuario_nombre, u.email AS usuario_email
       FROM muestras_eventos e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       WHERE e.muestra_id = $1
       ORDER BY e.timestamp DESC
       LIMIT 50`,
      [id]
    )

    // Archivos (todas las versiones)
    const { rows: archivos } = await pool.query(
      `SELECT a.*, u.nombre AS subido_por_nombre
       FROM muestras_archivos a
       LEFT JOIN usuarios u ON u.id = a.subido_por
       WHERE a.muestra_id = $1
       ORDER BY a.version_numero DESC, a.created_at DESC`,
      [id]
    )
    // Re-generar URL pública si hace falta
    if (supabaseEnabled && supabase) {
      const sb = supabase
      for (const a of archivos) {
        if (!a.url || a.url.startsWith('/uploads/')) {
          const { data } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(a.filename)
          a.url = data.publicUrl
        }
      }
    }

    res.json({
      data: {
        muestra,
        proyecto,
        owner,
        versiones,
        ocs,
        envios,
        eventos,
        archivos,
      },
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/muestras
 * Crea una muestra nueva en estado SOLICITADA con su versión V1.
 * Permisos: ADMIN, ENGINEERING, SHOP_MANAGER.
 */
export async function createMuestra(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const body = req.body as z.infer<typeof createMuestraSchema>

    // Verificar que el proyecto existe y está activo (queremos solo activos)
    const { rows: [proy] } = await client.query(
      'SELECT id, estado FROM proyectos WHERE id = $1',
      [body.proyecto_id]
    )
    if (!proy) {
      await client.query('ROLLBACK')
      return next(createError('Proyecto no encontrado', 404))
    }

    // Verificar código único
    const { rows: dup } = await client.query('SELECT id FROM muestras WHERE codigo = $1', [body.codigo])
    if (dup.length > 0) {
      await client.query('ROLLBACK')
      return next(createError(`Ya existe una muestra con código "${body.codigo}"`, 409))
    }

    // Default owner = el creador si no se especifica
    const ownerId = body.owner_id ?? req.user?.id ?? null

    const { rows: [muestra] } = await client.query(
      `INSERT INTO muestras
         (codigo, proyecto_id, descripcion, tipo, prioridad, owner_id, fecha_compromiso, notas, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        body.codigo, body.proyecto_id, body.descripcion,
        body.tipo ?? 'OTRO', body.prioridad ?? 'MEDIA',
        ownerId,
        body.fecha_compromiso ?? null,
        body.notas ?? null,
        req.user?.id ?? null,
      ]
    )

    // Crear V1 automática
    await client.query(
      `INSERT INTO muestras_versiones (muestra_id, version_numero, especificaciones)
       VALUES ($1, 1, $2)`,
      [muestra.id, body.especificaciones ?? null]
    )

    // Evento "creada"
    await client.query(
      `INSERT INTO muestras_eventos (muestra_id, version_numero, tipo, detalle, usuario_id)
       VALUES ($1, 1, 'creada', $2, $3)`,
      [muestra.id, `Muestra creada: ${body.codigo}`, req.user?.id ?? null]
    )

    // ── Notificar a PROCUREMENT: tarea en el módulo /tareas ────────────────
    // Reusa el sistema de tareas con origen='sistema'. Idempotente vía
    // UNIQUE INDEX parcial sobre source_ref. El area='procurement' hace que
    // aparezca en la bandeja de Procurement.
    //
    // Flujo esperado del PROCUREMENT al ver esta tarea:
    //   1. Abrir la muestra (link en description)
    //   2. Verificar qué materiales necesita
    //   3. Si están en stock → marcar "sin compras necesarias" (próxima fase UI)
    //   4. Si faltan → crear OCs directas con muestra_id (próxima fase UI)
    //   5. Cuando todas las OCs estén recibidas, marcar la tarea como completa
    const prioMap: Record<string, string> = { ALTA: 'high', MEDIA: 'medium', BAJA: 'low' }
    const prioTarea = prioMap[body.prioridad ?? 'MEDIA'] ?? 'medium'
    const deadlineMsg = body.fecha_compromiso
      ? ` · Deadline: ${body.fecha_compromiso}`
      : ''
    const tareaDesc = [
      `Muestra: ${body.codigo}`,
      `Proyecto: ${proy.id}`,
      `Descripción: ${body.descripcion}`,
      deadlineMsg.trim(),
      ``,
      `Acción: verificar si hay materiales en stock o crear OCs directas con esta muestra asociada.`,
      `Link: /muestras (abrir SMP-${body.codigo})`,
    ].filter(Boolean).join('\n')

    await client.query(
      `INSERT INTO tareas (area, title, description, priority, from_email, subject, source_email_id, origen, source_ref)
       VALUES ('procurement', $1, $2, $3, 'sistema@centralmillwork.com', $4, NULL, 'sistema', $5)
       ON CONFLICT (source_ref) WHERE origen = 'sistema' AND source_ref IS NOT NULL
       DO NOTHING`,
      [
        `Nueva muestra: ${body.codigo} requiere verificación de materiales`,
        tareaDesc,
        prioTarea,
        `Sample Request — ${body.codigo}`,
        `muestra:${muestra.id}:request`,
      ]
    )

    await client.query('COMMIT')
    logger.info('muestra creada', {
      requestId: req.id, muestraId: muestra.id, codigo: muestra.codigo,
      usuario: req.user?.email,
    })
    res.status(201).json({ data: muestra, message: 'Muestra creada' })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

/**
 * PATCH /api/muestras/:id
 * Edita campos editables de la muestra (no toca estado ni versión).
 * Permisos: ADMIN, ENGINEERING, SHOP_MANAGER.
 */
export async function updateMuestra(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    if (!Number.isFinite(id)) return next(createError('id inválido', 400))

    const muestra = await getMuestraOr404(id, next)
    if (!muestra) return

    const body = req.body as z.infer<typeof updateMuestraSchema>
    const fields = ['descripcion', 'tipo', 'prioridad', 'owner_id', 'fecha_compromiso', 'notas'] as const
    const updates = fields.filter((f) => body[f] !== undefined).map((f, i) => `${f} = $${i + 2}`)
    if (updates.length === 0) return next(createError('Sin campos para actualizar', 400))

    const values = fields.filter((f) => body[f] !== undefined).map((f) => body[f])
    const { rows: [updated] } = await pool.query(
      `UPDATE muestras SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...values]
    )

    await logEvento(id, muestra.version_actual, 'comentario',
      `Datos actualizados: ${updates.map((u) => u.split(' = ')[0]).join(', ')}`,
      req.user?.id ?? null
    )

    res.json({ data: updated, message: 'Muestra actualizada' })
  } catch (err) { next(err) }
}

/**
 * POST /api/muestras/:id/transicion
 * Cambia el estado de la muestra. Si va a RECHAZADA, crea V+1 con la razón.
 * Permisos: ADMIN, SHOP_MANAGER (transiciones del flow). ENGINEERING solo
 * puede mandar a EN_FABRICACION (autorizar arranque) y a ARCHIVADA.
 */
export async function transicionarMuestra(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const id = parseInt(String(req.params.id))
    if (!Number.isFinite(id)) {
      await client.query('ROLLBACK')
      return next(createError('id inválido', 400))
    }

    const { rows: [muestra] } = await client.query('SELECT * FROM muestras WHERE id = $1 FOR UPDATE', [id])
    if (!muestra) {
      await client.query('ROLLBACK')
      return next(createError('Muestra no encontrada', 404))
    }

    const body = req.body as z.infer<typeof transicionEstadoSchema>
    const { nuevo_estado, comentario, razon_revision } = body

    // Verificar transición permitida
    const permitidas = TRANSICIONES[muestra.estado as keyof typeof TRANSICIONES] ?? []
    if (!permitidas.includes(nuevo_estado)) {
      await client.query('ROLLBACK')
      return next(createError(
        `Transición inválida: ${muestra.estado} → ${nuevo_estado}. Permitidas: ${permitidas.join(', ') || '(ninguna)'}`,
        400
      ))
    }

    let nuevaVersion = muestra.version_actual

    // ── Caso especial: EN_FABRICACION ──────────────────────────────────────
    // 1. Verificar que todas las OCs directas asociadas a la muestra estén
    //    en estado 'recibida' (materiales físicamente en el taller). Si hay
    //    OCs pendientes, bloquear con detalle de cuáles faltan.
    //    Excepción: si NO hay ninguna OC asociada, se permite (caso de
    //    muestras hechas con stock propio o materiales del proyecto).
    //
    // 2. Auto-crear una orden de producción (ordenes_produccion) con
    //    tipo='MUESTRA' y vincularla a la versión actual de la muestra
    //    (muestras_versiones.op_id). El operario en el kiosko verá esta OP
    //    igual que cualquier otra, distinguida por el badge MUESTRA.
    if (nuevo_estado === 'EN_FABRICACION') {
      const { rows: ocs } = await client.query(
        `SELECT id, numero, estado FROM ordenes_compra WHERE muestra_id = $1`,
        [id]
      )
      const pendientes = ocs.filter((oc: any) => oc.estado !== 'recibida' && oc.estado !== 'cancelada')
      if (pendientes.length > 0) {
        await client.query('ROLLBACK')
        const detalleFalt = pendientes.map((oc: any) => `${oc.numero} (${oc.estado})`).join(', ')
        return next(createError(
          `No se puede iniciar fabricación: ${pendientes.length} OC(s) asociada(s) aún no están recibidas: ${detalleFalt}. ` +
          `Esperá a que llegue todo el material o cancelá las OCs pendientes.`,
          400
        ))
      }
    }

    // ── Caso especial: RECHAZADA crea V+1 con la razón del cliente ─────────
    // Y genera una tarea nueva para PROCUREMENT (puede que la V2 necesite
    // materiales adicionales o diferentes).
    if (nuevo_estado === 'RECHAZADA') {
      nuevaVersion = muestra.version_actual + 1
      await client.query(
        `INSERT INTO muestras_versiones (muestra_id, version_numero, razon_de_revision, comentarios_cliente)
         VALUES ($1, $2, $3, $4)`,
        [id, nuevaVersion, razon_revision ?? null, comentario ?? null]
      )

      // Tarea PROCUREMENT para V+1 (idempotente por source_ref con la version)
      const tareaDesc = [
        `Muestra: ${muestra.codigo} (V${nuevaVersion} — V${muestra.version_actual} rechazada)`,
        `Razón del rechazo: ${razon_revision ?? '(sin razón especificada)'}`,
        `Descripción: ${muestra.descripcion}`,
        ``,
        `Acción: verificar si los materiales para V${nuevaVersion} necesitan compras nuevas o diferencias respecto a V${muestra.version_actual}.`,
      ].join('\n')
      await client.query(
        `INSERT INTO tareas (area, title, description, priority, from_email, subject, source_email_id, origen, source_ref)
         VALUES ('procurement', $1, $2, 'high', 'sistema@centralmillwork.com', $3, NULL, 'sistema', $4)
         ON CONFLICT (source_ref) WHERE origen = 'sistema' AND source_ref IS NOT NULL
         DO NOTHING`,
        [
          `Muestra V${nuevaVersion}: ${muestra.codigo} re-fabricación tras rechazo`,
          tareaDesc,
          `Sample Request V${nuevaVersion} — ${muestra.codigo}`,
          `muestra:${id}:request:v${nuevaVersion}`,
        ]
      )
    }

    // Caso especial: APROBADA registra fecha_aprobacion_cliente
    const aprobadaUpdate = nuevo_estado === 'APROBADA' ? ', fecha_aprobacion_cliente = CURRENT_DATE' : ''

    const { rows: [updated] } = await client.query(
      `UPDATE muestras
         SET estado = $1, version_actual = $2${aprobadaUpdate}
       WHERE id = $3
       RETURNING *`,
      [nuevo_estado, nuevaVersion, id]
    )

    // Tipo de evento según estado destino
    const tipoEvento: Record<string, string> = {
      EN_FABRICACION: 'en_fabricacion',
      EN_QC:          'qc_pass',
      ENVIADA:        'enviada',
      APROBADA:       'aprobada',
      RECHAZADA:      'rechazada',
      ARCHIVADA:      'archivada',
      SOLICITADA:     'comentario',
    }
    const detalle = razon_revision
      ? `${muestra.estado} → ${nuevo_estado}: ${razon_revision}`
      : comentario
        ? `${muestra.estado} → ${nuevo_estado}: ${comentario}`
        : `${muestra.estado} → ${nuevo_estado}`

    await client.query(
      `INSERT INTO muestras_eventos (muestra_id, version_numero, tipo, detalle, usuario_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, nuevaVersion, tipoEvento[nuevo_estado] ?? 'comentario', detalle, req.user?.id ?? null]
    )

    // ── Auto-crear OP cuando vamos a EN_FABRICACION ──────────────────────
    // El check de materiales recibidos ya pasó arriba. Acá creamos la OP
    // con tipo='MUESTRA' y la vinculamos a la versión actual.
    // El operario va a verla en el kiosko como cualquier OP, distinguida
    // por badge "MUESTRA" + un link a la muestra padre.
    //
    // Si ya existe una OP para esta versión (caso: el usuario revierte
    // EN_QC → EN_FABRICACION y vuelve a avanzar), reusamos esa en vez de
    // crear duplicada.
    let opCreada: any = null
    if (nuevo_estado === 'EN_FABRICACION') {
      const { rows: [versionRow] } = await client.query(
        `SELECT id, op_id FROM muestras_versiones WHERE muestra_id = $1 AND version_numero = $2`,
        [id, nuevaVersion]
      )
      if (versionRow && !versionRow.op_id) {
        // Generar número de OP único: OP-MS-{año}-{seq}
        const { rows: [seqRow] } = await client.query(
          `SELECT COUNT(*) + 1 AS seq FROM ordenes_produccion WHERE tipo = 'MUESTRA'`
        )
        const opNumero = `OP-MS-${new Date().getFullYear()}-${String(seqRow.seq).padStart(3, '0')}`

        // Crear la OP. Campos:
        // - numero_orden, proyecto_id (de la muestra)
        // - numero_item: usamos el codigo de la muestra (no es número del MTO,
        //   así que ponemos el SMP-XXX como referencia visible al operario)
        // - cantidad: 1 (una muestra)
        // - prioridad: heredada de la muestra
        // - status: 'Pendiente' (operario decide cuando arrancar)
        // - tipo: 'MUESTRA' (nuevo campo del enum op_tipo)
        const opPrioridad = updated.prioridad === 'ALTA' ? 'Alta'
                          : updated.prioridad === 'BAJA' ? 'Baja' : 'Media'
        const opEspecs = `Muestra ${updated.codigo} V${nuevaVersion}\n\n${updated.descripcion}`

        const { rows: [op] } = await client.query(
          `INSERT INTO ordenes_produccion
             (numero_orden, proyecto_id, numero_item, cantidad, unidad,
              especificaciones, prioridad, status, tipo,
              fecha_entrega, created_by)
           VALUES ($1, $2, $3, 1, 'pieza', $4, $5, 'Pendiente', 'MUESTRA',
                   $6, $7)
           RETURNING *`,
          [
            opNumero, updated.proyecto_id, updated.codigo,
            opEspecs, opPrioridad,
            updated.fecha_compromiso ?? null,
            req.user?.id ?? null,
          ]
        )
        opCreada = op

        // Vincular la OP a la versión de la muestra
        await client.query(
          `UPDATE muestras_versiones SET op_id = $1 WHERE id = $2`,
          [op.id, versionRow.id]
        )

        // Evento adicional para el timeline
        await client.query(
          `INSERT INTO muestras_eventos (muestra_id, version_numero, tipo, detalle, usuario_id)
           VALUES ($1, $2, 'comentario', $3, $4)`,
          [id, nuevaVersion, `OP creada automáticamente: ${opNumero}`, req.user?.id ?? null]
        )
        logger.info('op auto-creada para muestra', {
          requestId: req.id, muestraId: id, opId: op.id, opNumero,
        })
      }
    }

    await client.query('COMMIT')
    logger.info('muestra transicion', {
      requestId: req.id, muestraId: id,
      de: muestra.estado, a: nuevo_estado, version: nuevaVersion,
      opCreada: opCreada?.numero_orden ?? null,
    })
    res.json({
      data: updated,
      op_creada: opCreada,
      message: opCreada
        ? `Estado actualizado a ${nuevo_estado}. OP ${opCreada.numero_orden} creada.`
        : `Estado actualizado a ${nuevo_estado}`,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

/**
 * POST /api/muestras/:id/envios
 * Registra envío físico al cliente. Cambia automáticamente el estado a ENVIADA
 * si no lo estaba ya.
 * Permisos: ADMIN, SHOP_MANAGER.
 */
export async function registrarEnvio(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const id = parseInt(String(req.params.id))
    if (!Number.isFinite(id)) {
      await client.query('ROLLBACK')
      return next(createError('id inválido', 400))
    }

    const muestra = await getMuestraOr404(id, next)
    if (!muestra) { await client.query('ROLLBACK'); return }

    const body = req.body as z.infer<typeof registrarEnvioSchema>

    const { rows: [envio] } = await client.query(
      `INSERT INTO muestras_envios
         (muestra_id, version_numero, destinatario, direccion, tracking_carrier, tracking_number, notas, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id, muestra.version_actual,
        body.destinatario, body.direccion ?? null,
        body.tracking_carrier ?? null, body.tracking_number ?? null,
        body.notas ?? null,
        req.user?.id ?? null,
      ]
    )

    // Si la muestra no está en ENVIADA todavía, llevarla a ENVIADA
    if (muestra.estado === 'EN_QC') {
      await client.query(`UPDATE muestras SET estado = 'ENVIADA' WHERE id = $1`, [id])
    }

    await client.query(
      `INSERT INTO muestras_eventos (muestra_id, version_numero, tipo, detalle, usuario_id)
       VALUES ($1, $2, 'enviada', $3, $4)`,
      [
        id, muestra.version_actual,
        `Envío registrado: ${body.destinatario}${body.tracking_carrier ? ` vía ${body.tracking_carrier}` : ''}${body.tracking_number ? ` (${body.tracking_number})` : ''}`,
        req.user?.id ?? null,
      ]
    )

    await client.query('COMMIT')
    res.status(201).json({ data: envio, message: 'Envío registrado' })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

/**
 * PATCH /api/muestras/:id/envios/:envioId/recepcion
 * Marca el envío como recibido por el cliente.
 * Permisos: ADMIN, SHOP_MANAGER.
 */
export async function confirmarRecepcion(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    const envioId = parseInt(String(req.params.envioId))
    if (!Number.isFinite(id) || !Number.isFinite(envioId)) {
      return next(createError('id o envio_id inválido', 400))
    }

    const fecha = String(req.body.fecha_recepcion_confirmada ?? new Date().toISOString().slice(0, 10))

    const { rows: [envio] } = await pool.query(
      `UPDATE muestras_envios
         SET fecha_recepcion_confirmada = $1
       WHERE id = $2 AND muestra_id = $3
       RETURNING *`,
      [fecha, envioId, id]
    )
    if (!envio) return next(createError('Envío no encontrado', 404))

    await logEvento(id, envio.version_numero, 'comentario',
      `Cliente confirmó recepción del envío del ${envio.fecha_envio}`,
      req.user?.id ?? null
    )

    res.json({ data: envio, message: 'Recepción confirmada' })
  } catch (err) { next(err) }
}

/**
 * GET /api/muestras/kpis
 * KPIs globales para el dashboard de muestras.
 */
export async function getMuestrasKpis(_req: Request, res: Response, next: NextFunction) {
  try {
    const { rows: [k] } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE estado NOT IN ('ARCHIVADA'))::int       AS activas,
         COUNT(*) FILTER (WHERE estado = 'EN_FABRICACION')::int          AS en_fabricacion,
         COUNT(*) FILTER (WHERE estado = 'EN_QC')::int                   AS en_qc,
         COUNT(*) FILTER (WHERE estado = 'ENVIADA')::int                 AS enviadas,
         COUNT(*) FILTER (
           WHERE estado = 'ENVIADA'
             AND id IN (
               SELECT muestra_id FROM muestras_envios
               WHERE fecha_recepcion_confirmada IS NULL
                 AND fecha_envio < CURRENT_DATE - INTERVAL '5 days'
             )
         )::int                                                          AS enviadas_sin_respuesta_5d,
         COUNT(*) FILTER (
           WHERE estado != 'ARCHIVADA'
             AND fecha_compromiso < CURRENT_DATE
         )::int                                                          AS vencidas,
         COUNT(*) FILTER (WHERE estado = 'APROBADA')::int                AS aprobadas_total,
         (SELECT COUNT(*) FROM muestras_versiones WHERE razon_de_revision IS NOT NULL)::int AS rechazos_historicos
       FROM muestras`
    )
    res.json({ data: k })
  } catch (err) { next(err) }
}

// ─── Upload de archivos a Supabase ──────────────────────────────────────────
// Multer en memoria — el binario se sube a Supabase, no se persiste a disco.
// Mismo bucket que oc_imagenes (configurado en env: SUPABASE_BUCKET).
const ALLOWED_MUESTRA_MIMES = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/dwg', 'application/x-dwg',
])
const ALLOWED_MUESTRA_EXT = /\.(pdf|jpe?g|png|webp|heic|heif|dwg)$/i

export const uploadMuestraArchivo = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const extOk = ALLOWED_MUESTRA_EXT.test(file.originalname)
    const mimeOk = ALLOWED_MUESTRA_MIMES.has((file.mimetype ?? '').toLowerCase())
    if (extOk && mimeOk) return cb(null, true)
    cb(Object.assign(
      new Error(`Tipo de archivo no permitido. PDF, imagen o DWG. Recibido: "${file.originalname}" (${file.mimetype})`),
      { statusCode: 400 }
    ))
  },
  limits: { fileSize: 20 * 1024 * 1024 },  // 20 MB
})

/**
 * POST /api/muestras/:id/archivos
 * Sube un archivo (PDF de sample request, foto, DWG) a la muestra.
 * Body fields: tipo (sample_request|foto|pdf|dwg|otro), nombre opcional.
 * Si no se especifica version, usa la version_actual de la muestra.
 */
export async function uploadArchivo(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    if (!Number.isFinite(id)) return next(createError('id inválido', 400))
    if (!req.file) return next(createError('No se recibió ningún archivo', 400))

    const muestra = await getMuestraOr404(id, next)
    if (!muestra) return

    const tipo = String(req.body.tipo ?? 'otro').toLowerCase()
    const nombre = req.body.nombre?.trim() || req.file.originalname
    const versionNumero = req.body.version_numero
      ? parseInt(String(req.body.version_numero))
      : muestra.version_actual

    if (!supabaseEnabled || !supabase) {
      return next(createError('Supabase Storage no configurado en el server', 500))
    }

    // Filename con prefijo para organizar y evitar colisiones
    const ext = path.extname(req.file.originalname)
    const filename = `muestra-${id}/v${versionNumero}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`

    const { error: upErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      })
    if (upErr) {
      logger.error('uploadArchivo muestra error', { requestId: req.id, muestraId: id, err: upErr })
      return next(createError('Error subiendo a Supabase: ' + upErr.message, 500))
    }

    const { data: pub } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filename)
    const url = pub.publicUrl

    const { rows: [archivo] } = await pool.query(
      `INSERT INTO muestras_archivos
         (muestra_id, version_numero, tipo, nombre, filename, mime_type, size_bytes, url, subido_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id, versionNumero, tipo, nombre, filename,
        req.file.mimetype, req.file.size, url,
        req.user?.id ?? null,
      ]
    )

    // Log evento
    await logEvento(id, versionNumero, 'comentario',
      `Archivo subido: ${nombre} (${tipo})`,
      req.user?.id ?? null
    )

    logger.info('archivo muestra subido', {
      requestId: req.id, muestraId: id, archivoId: archivo.id,
      tipo, tamano_kb: Math.round(req.file.size / 1024),
    })
    res.status(201).json({ data: archivo, message: 'Archivo subido' })
  } catch (err) { next(err) }
}

/**
 * GET /api/muestras/:id/archivos
 * Lista todos los archivos de la muestra, agrupados por versión.
 */
export async function getArchivos(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    if (!Number.isFinite(id)) return next(createError('id inválido', 400))

    const { rows } = await pool.query(
      `SELECT a.*, u.nombre AS subido_por_nombre
       FROM muestras_archivos a
       LEFT JOIN usuarios u ON u.id = a.subido_por
       WHERE a.muestra_id = $1
       ORDER BY a.version_numero DESC, a.created_at DESC`,
      [id]
    )

    // Re-generar URL pública (por si el bucket cambió de público a privado)
    if (supabaseEnabled && supabase) {
      const sb = supabase
      for (const r of rows) {
        if (!r.url || r.url.startsWith('/uploads/')) {
          const { data } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(r.filename)
          r.url = data.publicUrl
        }
      }
    }

    res.json({ data: rows })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/muestras/:id/archivos/:archivoId
 * Borra un archivo de Supabase + DB.
 */
export async function deleteArchivo(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    const archivoId = parseInt(String(req.params.archivoId))
    if (!Number.isFinite(id) || !Number.isFinite(archivoId)) {
      return next(createError('id o archivoId inválido', 400))
    }

    const { rows: [archivo] } = await pool.query(
      'DELETE FROM muestras_archivos WHERE id = $1 AND muestra_id = $2 RETURNING *',
      [archivoId, id]
    )
    if (!archivo) return next(createError('Archivo no encontrado', 404))

    // Best-effort borrar de Supabase (si falla, igual ya quitamos el record)
    if (supabaseEnabled && supabase) {
      const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove([archivo.filename])
      if (error) {
        logger.warn('deleteArchivo Supabase remove warn', { requestId: req.id, archivoId, err: error.message })
      }
    }

    await logEvento(id, archivo.version_numero, 'comentario',
      `Archivo eliminado: ${archivo.nombre}`,
      req.user?.id ?? null
    )

    res.json({ message: 'Archivo eliminado' })
  } catch (err) { next(err) }
}
