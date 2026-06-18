import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import multer from 'multer'
import path from 'path'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { logger } from '../utils/logger'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../utils/supabase'
import { notifyTareaBySourceRef } from '../utils/notifyTarea'

// ─── Tipos y constantes ──────────────────────────────────────────────────────

// Exportados para que tests + (futura) extracción a domain/ los consuman.
// La carpeta domain/muestras/ aún no existe — extracción gradual cuando
// haya 3+ helpers que justifiquen el módulo. Por ahora vive acá pero ya
// exportado como "interfaz canónica del state machine".
export const ESTADOS = ['SOLICITADA','EN_FABRICACION','EN_QC','ENVIADA','APROBADA','RECHAZADA','ARCHIVADA'] as const
export const TIPOS = ['PUERTA','ACABADO','HARDWARE','CABINET','OTRO'] as const
export const PRIORIDADES = ['ALTA','MEDIA','BAJA'] as const

export type EstadoMuestra = typeof ESTADOS[number]

// Transiciones válidas. Forma: { [estado_actual]: [estados destino válidos] }
// Permitimos volver atrás solo en casos puntuales (admin override).
export const TRANSICIONES: Record<EstadoMuestra, EstadoMuestra[]> = {
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
  // proyecto_id NULL permitido — INGENIERIA puede crear muestra huérfana y
  // linkearla a un proyecto después. Pero EN_FABRICACION requiere proyecto.
  proyecto_id:      z.number().int().positive().nullable().optional(),
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
  // Permitir linkear/cambiar proyecto después (huérfanas → asignadas)
  proyecto_id:      z.number().int().positive().nullable().optional(),
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
    // F5: si hay foto_filename, generar signed URL para mostrarla. Usamos
    // createSignedUrl porque el bucket oc-imagenes es privado (mismo fix
    // que se aplicó a oc_imagenes el 2026-06-08).
    if (supabaseEnabled && supabase) {
      const sb = supabase
      for (const e of envios) {
        if (e.foto_filename) {
          const { data } = await sb.storage
            .from(SUPABASE_BUCKET)
            .createSignedUrl(e.foto_filename, 3600)
          ;(e as any).foto_url = data?.signedUrl ?? null
        } else {
          ;(e as any).foto_url = null
        }
      }
    }

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

    // Verificar el proyecto si se especificó. Si proyecto_id es NULL, se permite
    // (muestra huérfana, ENGINEERING la linkea después).
    let proy: { id: number; estado: string } | null = null
    if (body.proyecto_id != null) {
      const { rows: [p] } = await client.query(
        'SELECT id, estado FROM proyectos WHERE id = $1',
        [body.proyecto_id]
      )
      if (!p) {
        await client.query('ROLLBACK')
        return next(createError('Proyecto no encontrado', 404))
      }
      proy = p
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
    const proyectoLabel = proy ? `Proyecto: id=${proy.id}` : `Proyecto: (sin proyecto asignado — INGENIERIA debe linkear después)`
    const tareaDesc = [
      `Muestra: ${body.codigo}`,
      proyectoLabel,
      `Descripción: ${body.descripcion}`,
      deadlineMsg.trim(),
      ``,
      `Acción: verificar si hay materiales en stock o crear OCs directas con esta muestra asociada.`,
      `Link: /muestras (abrir ${body.codigo})`,
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

    // F7: notificar a PROCUREMENT por email tras COMMIT. Fire-and-forget —
    // si falla el email no abortamos la creación de la muestra.
    notifyTareaBySourceRef(pool, `muestra:${muestra.id}:request`)
      .catch((err) => logger.warn('notifyTarea after createMuestra failed', {
        muestraId: muestra.id, err: String(err),
      }))
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
    const fields = ['descripcion', 'tipo', 'prioridad', 'owner_id', 'fecha_compromiso', 'notas', 'proyecto_id'] as const
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

    // ── F6 (2026-06-09): APROBADA / RECHAZADA solo INGENIERIA o ADMIN ──────
    // Antes lo podía hacer SHOP_MANAGER también. Ahora la decisión queda
    // formalmente en ingeniería (que es quien tiene el sample request del
    // cliente y valida si la respuesta corresponde a aprobación o rechazo).
    if (nuevo_estado === 'APROBADA' || nuevo_estado === 'RECHAZADA') {
      const rol = req.user?.rol
      if (rol !== 'ADMIN' && rol !== 'ENGINEERING') {
        await client.query('ROLLBACK')
        return next(createError(
          `Solo INGENIERIA (o ADMIN) puede ${nuevo_estado === 'APROBADA' ? 'aprobar' : 'rechazar'} una muestra. ` +
          `Tu rol actual es ${rol ?? 'desconocido'}.`,
          403
        ))
      }
    }

    // ── Constraint especial RECHAZADA → SOLICITADA (Chali 2026-05-31) ──────
    // "Una vez rechazada, es INGENIERIA quien debe llevarla nuevamente a
    // SOLICITADAS, con un nuevo PDF Sample Request".
    //
    // Reglas:
    //  1. Solo ADMIN o ENGINEERING puede hacer esta transición (no SHOP_MANAGER)
    //  2. La versión actual (recién creada al rechazar) debe tener un PDF
    //     de tipo='sample_request' subido. Sino, bloquear con mensaje claro.
    if (muestra.estado === 'RECHAZADA' && nuevo_estado === 'SOLICITADA') {
      const rol = req.user?.rol
      if (rol !== 'ADMIN' && rol !== 'ENGINEERING') {
        await client.query('ROLLBACK')
        return next(createError(
          'Solo INGENIERIA (o ADMIN) puede reabrir una muestra rechazada. ' +
          'El flujo esperado: ingeniería genera un nuevo Sample Request basado en la razón del rechazo del cliente.',
          403
        ))
      }
      const { rows: pdfs } = await client.query(
        `SELECT id FROM muestras_archivos
         WHERE muestra_id = $1 AND version_numero = $2 AND tipo = 'sample_request'
         LIMIT 1`,
        [id, muestra.version_actual]
      )
      if (pdfs.length === 0) {
        await client.query('ROLLBACK')
        return next(createError(
          `Para reabrir esta muestra necesitás subir un nuevo PDF de Sample Request para V${muestra.version_actual} primero. ` +
          `Andá a la tab "Archivos" del detalle, elegí tipo "Sample Request" y versión V${muestra.version_actual}, y subí el documento revisado.`,
          400
        ))
      }
    }

    // ── Pre-condición EN_FABRICACION: proyecto requerido (OP necesita proyecto) ─
    if (nuevo_estado === 'EN_FABRICACION' && muestra.proyecto_id == null) {
      await client.query('ROLLBACK')
      return next(createError(
        `Esta muestra no tiene proyecto asignado. ` +
        `Editá la muestra y linkeala a un proyecto antes de pasar a fabricación (la OP de producción necesita un proyecto).`,
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

    // ── RECHAZADA → SOLICITADA: notificar PROCUREMENT para que reverifique
    // materiales (la nueva versión puede requerir otros materiales que V anterior).
    if (muestra.estado === 'RECHAZADA' && nuevo_estado === 'SOLICITADA') {
      await client.query(
        `INSERT INTO tareas (area, title, description, priority, from_email, subject, source_email_id, origen, source_ref)
         VALUES ('procurement', $1, $2, 'high', 'sistema@centralmillwork.com', $3, NULL, 'sistema', $4)
         ON CONFLICT (source_ref) WHERE origen = 'sistema' AND source_ref IS NOT NULL
         DO NOTHING`,
        [
          `Muestra reabierta: ${muestra.codigo} V${muestra.version_actual} requiere verificación de materiales`,
          `Muestra: ${muestra.codigo} (V${muestra.version_actual}, reabierta por INGENIERIA con nuevo Sample Request).\n` +
          `Descripción: ${muestra.descripcion}\n\n` +
          `Acción: verificar si materiales para esta versión cambian respecto a versiones previas. Crear OCs nuevas si hace falta.`,
          `Sample Request V${muestra.version_actual} reabierto — ${muestra.codigo}`,
          `muestra:${id}:reopened:v${muestra.version_actual}`,
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

    // ── F6 (2026-06-09): vincular formalmente muestra aprobada ↔ proyecto ──
    // Cuando se aprueba, generamos un row en proyectos_muestras_aprobadas
    // con snapshot de codigo/desc/tipo + ref al PDF sample_request más
    // reciente de la versión. Si la muestra no tiene proyecto, NO podemos
    // vincular — se loggea pero no falla la transición (no debería pasar
    // porque APROBADA viene siempre desde ENVIADA, y ENVIADA requiere
    // EN_FABRICACION que ya requiere proyecto).
    //
    // UNIQUE(muestra_id, version_numero) → idempotente: si ya existe el row
    // (re-aprobación post-RECHAZADA), ON CONFLICT DO NOTHING preserva el
    // original. Si la versión cambia (V2 aprobada), inserta nuevo row.
    if (nuevo_estado === 'APROBADA') {
      if (updated.proyecto_id == null) {
        logger.warn('muestra aprobada sin proyecto — no se vincula', {
          muestraId: id, codigo: updated.codigo,
        })
      } else {
        const { rows: [pdf] } = await client.query<{ id: number }>(
          `SELECT id FROM muestras_archivos
            WHERE muestra_id = $1 AND version_numero = $2 AND tipo = 'sample_request'
            ORDER BY created_at DESC
            LIMIT 1`,
          [id, nuevaVersion]
        )
        await client.query(
          `INSERT INTO proyectos_muestras_aprobadas
             (proyecto_id, muestra_id, version_numero, codigo, descripcion,
              tipo, pdf_archivo_id, fecha_aprobacion, aprobado_por, notas)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8, $9)
           ON CONFLICT (muestra_id, version_numero) DO NOTHING`,
          [
            updated.proyecto_id, id, nuevaVersion,
            updated.codigo, updated.descripcion, updated.tipo,
            pdf?.id ?? null,
            req.user?.id ?? null,
            comentario ?? null,
          ]
        )
        logger.info('muestra aprobada registrada en catalogo del proyecto', {
          muestraId: id, proyectoId: updated.proyecto_id, version: nuevaVersion,
          pdfArchivoId: pdf?.id ?? null,
        })
      }
    }

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

    // F5: cerrar tareas SHOP_MANAGER abiertas de esta muestra (ready_to_fab,
    // qc, etc) que quedaron sin marcar. Estas tareas SÍ existen porque F2
    // las crea y el ADMIN las ve en su inbox — auto-cerrarlas evita basura
    // colgada cuando el flow ya avanzó.
    // NOTA: tabla tareas no tiene updated_at — completed_at marca el cambio
    await client.query(
      `UPDATE tareas
          SET estado = 'completada',
              completed_at = NOW()
        WHERE area = 'shop_manager'
          AND origen = 'sistema'
          AND source_ref LIKE $1
          AND estado NOT IN ('completada', 'descartada')`,
      [`muestra:${id}:%`]
    )

    await client.query('COMMIT')

    // F5 cleanup (2026-06-09): patrón email puro a INGENIERIA, consistente
    // con F4. Antes creábamos tarea + email; el módulo Tareas hoy sólo lo
    // ve ADMIN, así que para ENGINEERING el único canal útil es el mail.
    // Fire-and-forget post-COMMIT — no bloquea ni rompe la transición.
    const { notifyMuestraEnviada } = await import('../utils/notifyMuestra')
    void notifyMuestraEnviada({
      muestraId: id,
      codigo: muestra.codigo,
      descripcion: muestra.descripcion,
      versionNumero: muestra.version_actual,
      destinatario: body.destinatario,
      carrier: body.tracking_carrier ?? null,
      trackingNumber: body.tracking_number ?? null,
    })

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
 * POST /api/muestras/:id/envios/:envioId/foto — F5 Muestras
 *
 * Sube la foto del paquete/etiqueta de un envío. Body multipart con campo
 * 'foto'. Reusa SUPABASE_BUCKET (mismo de oc_imagenes) y signed URLs
 * privadas. Permisos: ADMIN, PROCUREMENT (es decisión de logística).
 */
export async function uploadEnvioFoto(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    const envioId = parseInt(String(req.params.envioId))
    if (!Number.isFinite(id) || !Number.isFinite(envioId)) {
      return next(createError('id o envio_id inválido', 400))
    }
    if (!req.file) return next(createError('No se recibió ninguna foto', 400))

    // Validar que el envío pertenece a la muestra
    const { rows: [envio] } = await pool.query<{ id: number; foto_filename: string | null }>(
      `SELECT id, foto_filename FROM muestras_envios WHERE id = $1 AND muestra_id = $2`,
      [envioId, id]
    )
    if (!envio) return next(createError('Envío no encontrado para esta muestra', 404))

    if (!supabaseEnabled || !supabase) {
      return next(createError('Supabase Storage no configurado en el server', 500))
    }

    // Generar filename — incluye muestra-id/envio-id para organizar
    const ext = path.extname(req.file.originalname)
    const filename = `muestra-${id}/envio-${envioId}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`

    const { error: upErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      })
    if (upErr) {
      logger.error('uploadEnvioFoto error', { requestId: req.id, muestraId: id, envioId, err: upErr })
      return next(createError('Error subiendo a Supabase: ' + upErr.message, 500))
    }

    // Si ya había foto previa, borrarla post-update (no en transacción —
    // tolerar falla del cleanup, ya tenemos la nueva referenciada).
    const fotoAnterior = envio.foto_filename
    await pool.query(
      `UPDATE muestras_envios SET foto_filename = $1 WHERE id = $2`,
      [filename, envioId]
    )
    if (fotoAnterior) {
      void supabase.storage.from(SUPABASE_BUCKET).remove([fotoAnterior])
        .then(({ error }) => {
          if (error) logger.warn('uploadEnvioFoto: cleanup foto anterior failed', {
            envioId, fotoAnterior, err: error.message,
          })
        })
    }

    // Devolver URL firmada para que el frontend la renderice de una
    const { data: signed } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(filename, 3600)

    logger.info('envio foto subida', {
      requestId: req.id, muestraId: id, envioId,
      tamano_kb: Math.round(req.file.size / 1024),
    })
    res.status(201).json({
      data: { envio_id: envioId, foto_filename: filename, foto_url: signed?.signedUrl ?? null },
      message: 'Foto subida',
    })
  } catch (err) { next(err) }
}

// Multer setup para foto de envío — usa fileUploadHelper para no duplicar config.
import { createImageUploadMulter } from '../utils/fileUploadHelper'
export const uploadEnvioFotoMulter = createImageUploadMulter({
  diskPrefix: 'envio-',
  sizeMb: 10,
  allowedMimes: new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'image/gif', 'image/heic', 'image/heif', 'application/pdf',
  ]),
  allowedExtRe: /\.(jpe?g|png|webp|gif|heic|heif|pdf)$/i,
  formatsLabel: 'imágenes (jpg/png/webp/heic) o PDF',
})

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
