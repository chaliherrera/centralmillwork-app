// ─────────────────────────────────────────────────────────────────────────────
// Domain — Iniciar fabricación de una muestra (F3, 2026-06-09)
// ─────────────────────────────────────────────────────────────────────────────
// Pieza pura sobre Postgres que encapsula:
//   - Resolver procesos default según muestras.tipo
//   - Crear OP + orden_procesos + vincular muestras_versiones.op_id
//   - Transicionar muestra a EN_FABRICACION
//
// Reutilizada desde el controller HTTP. La logica está acá para poder testearla
// sin levantar Express. Sigue el blueprint modules/<feature>/domain.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { logger } from '../../../utils/logger'

export interface ProcesoDefault {
  secuencia: number
  estacion: string
  tiempo_estimado_minutos: number
}

/**
 * Devuelve la ruta default de procesos para un tipo de muestra. Si no hay
 * defaults seteados (caso OTRO), devuelve array vacío — el cliente arma
 * la ruta a mano en la UI.
 */
export async function getProcesosDefaultPorTipo(
  tipo: string
): Promise<ProcesoDefault[]> {
  const { rows } = await pool.query<ProcesoDefault>(
    `SELECT secuencia, estacion, tiempo_estimado_minutos
       FROM muestras_procesos_default
      WHERE tipo = $1
      ORDER BY secuencia ASC`,
    [tipo]
  )
  return rows
}

export interface ProcesoInput {
  estacion: string
  tiempo_estimado_minutos?: number | null
  operador_id?: number | null
}

export interface IniciarFabricacionInput {
  muestraId: number
  procesos: ProcesoInput[]
  notas?: string | null
  usuarioId: string | null
}

export interface IniciarFabricacionResult {
  op_id: number
  op_numero: string
  procesos_creados: number
  muestra: {
    id: number
    estado: string
    version_actual: number
  }
}

/**
 * Maquinaria completa de "iniciar fabricación":
 *  1. Verifica que la muestra esté SOLICITADA y tenga proyecto
 *  2. Verifica que todas las OCs asociadas estén recibidas/canceladas
 *  3. Crea la OP (ordenes_produccion tipo='MUESTRA')
 *  4. Inserta los procesos uno por uno con secuencia ordenada
 *  5. Vincula muestras_versiones.op_id
 *  6. UPDATE muestras estado → EN_FABRICACION
 *  7. Registra evento en muestras_eventos
 *
 * Todo en UNA transacción — si falla algo, nada queda persistido. Errores
 * vuelven como Error con statusCode (helper createError) para que el caller
 * los devuelva al cliente HTTP.
 */
export async function iniciarFabricacion(
  input: IniciarFabricacionInput
): Promise<IniciarFabricacionResult> {
  if (!input.procesos.length) {
    throw Object.assign(new Error('Debe haber al menos un proceso para crear la OP'), { statusCode: 400 })
  }
  // Saneo: estaciones permitidas vienen de estaciones_config.activa=true
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── 1. Cargar muestra con lock
    const { rows: [muestra] } = await client.query(
      `SELECT id, codigo, descripcion, tipo, estado, proyecto_id, version_actual, prioridad, fecha_compromiso
         FROM muestras WHERE id = $1 FOR UPDATE`,
      [input.muestraId]
    )
    if (!muestra) {
      await client.query('ROLLBACK')
      throw Object.assign(new Error('Muestra no encontrada'), { statusCode: 404 })
    }
    if (muestra.estado !== 'SOLICITADA') {
      await client.query('ROLLBACK')
      throw Object.assign(
        new Error(`No se puede iniciar fabricación: la muestra está en estado ${muestra.estado}. Sólo SOLICITADA puede pasar a EN_FABRICACION.`),
        { statusCode: 400 }
      )
    }
    if (muestra.proyecto_id == null) {
      await client.query('ROLLBACK')
      throw Object.assign(
        new Error('Esta muestra no tiene proyecto asignado. Editá la muestra y linkeala a un proyecto antes de iniciar fabricación (la OP necesita un proyecto).'),
        { statusCode: 400 }
      )
    }

    // ── 2. Verificar OCs asociadas todas recibidas/canceladas
    const { rows: ocs } = await client.query(
      `SELECT id, numero, estado FROM ordenes_compra WHERE muestra_id = $1`,
      [input.muestraId]
    )
    const pendientes = ocs.filter((oc: any) => oc.estado !== 'recibida' && oc.estado !== 'cancelada')
    if (pendientes.length > 0) {
      await client.query('ROLLBACK')
      const detalle = pendientes.map((oc: any) => `${oc.numero} (${oc.estado})`).join(', ')
      throw Object.assign(
        new Error(`No se puede iniciar fabricación: ${pendientes.length} OC(s) aún no recibidas: ${detalle}.`),
        { statusCode: 400 }
      )
    }

    // ── 3. Validar estaciones contra config — bloquear inválidas
    const { rows: estacionesValidas } = await client.query<{ nombre: string }>(
      `SELECT nombre FROM estaciones_config WHERE activa = true`
    )
    const validas = new Set(estacionesValidas.map((e) => e.nombre))
    const inv = input.procesos.find((p) => !validas.has(p.estacion))
    if (inv) {
      await client.query('ROLLBACK')
      throw Object.assign(
        new Error(`Estación inválida: "${inv.estacion}". Válidas: ${[...validas].join(', ')}`),
        { statusCode: 400 }
      )
    }

    // ── 4. Generar número de OP único: OP-MS-{año}-{seq}
    const { rows: [seqRow] } = await client.query(
      `SELECT COUNT(*) + 1 AS seq FROM ordenes_produccion WHERE tipo = 'MUESTRA'`
    )
    const opNumero = `OP-MS-${new Date().getFullYear()}-${String(seqRow.seq).padStart(3, '0')}`

    const opPrioridad = muestra.prioridad === 'ALTA' ? 'Alta'
                      : muestra.prioridad === 'BAJA' ? 'Baja' : 'Media'
    const opEspecs = `Muestra ${muestra.codigo} V${muestra.version_actual}\n\n${muestra.descripcion}${
      input.notas ? `\n\nNotas:\n${input.notas}` : ''
    }`

    const { rows: [op] } = await client.query(
      `INSERT INTO ordenes_produccion
         (numero_orden, proyecto_id, numero_item, cantidad, unidad,
          especificaciones, prioridad, status, tipo,
          fecha_entrega, created_by)
       VALUES ($1, $2, $3, 1, 'pieza', $4, $5, 'Pendiente', 'MUESTRA', $6, $7)
       RETURNING id, numero_orden`,
      [
        opNumero, muestra.proyecto_id, muestra.codigo,
        opEspecs, opPrioridad,
        muestra.fecha_compromiso ?? null,
        input.usuarioId,
      ]
    )

    // ── 5. Insertar procesos. Reasignamos secuencia 1..N por orden recibido
    //    para evitar inconsistencias del cliente.
    for (let i = 0; i < input.procesos.length; i++) {
      const p = input.procesos[i]
      const tiempo = typeof p.tiempo_estimado_minutos === 'number' && p.tiempo_estimado_minutos > 0
        ? Math.round(p.tiempo_estimado_minutos)
        : null
      await client.query(
        `INSERT INTO orden_procesos
           (orden_id, estacion, secuencia, requerido, tiempo_estimado_minutos, operador_id)
         VALUES ($1, $2, $3, true, $4, $5)`,
        [op.id, p.estacion, i + 1, tiempo, p.operador_id ?? null]
      )
    }

    // Setear estacion_actual y operador asignado al primer proceso
    const primerProceso = input.procesos[0]
    await client.query(
      `UPDATE ordenes_produccion
         SET estacion_actual = $1,
             personal_asignado_id = $2,
             updated_at = NOW()
       WHERE id = $3`,
      [primerProceso.estacion, primerProceso.operador_id ?? null, op.id]
    )

    // ── 6. Vincular OP a la version actual
    await client.query(
      `UPDATE muestras_versiones
         SET op_id = $1
       WHERE muestra_id = $2 AND version_numero = $3`,
      [op.id, input.muestraId, muestra.version_actual]
    )

    // ── 7. Transicionar muestra a EN_FABRICACION + evento timeline
    await client.query(
      `UPDATE muestras SET estado = 'EN_FABRICACION', updated_at = NOW() WHERE id = $1`,
      [input.muestraId]
    )
    await client.query(
      `INSERT INTO muestras_eventos (muestra_id, version_numero, tipo, detalle, usuario_id)
       VALUES ($1, $2, 'en_fabricacion', $3, $4)`,
      [
        input.muestraId,
        muestra.version_actual,
        `Iniciar fabricación: OP ${opNumero} creada con ${input.procesos.length} proceso(s) (${input.procesos.map((p) => p.estacion).join(' → ')})`,
        input.usuarioId,
      ]
    )

    await client.query('COMMIT')

    logger.info('muestra iniciar-fabricacion ok', {
      muestraId: input.muestraId,
      opId: op.id,
      opNumero,
      procesos: input.procesos.length,
    })

    return {
      op_id: op.id,
      op_numero: op.numero_orden,
      procesos_creados: input.procesos.length,
      muestra: {
        id: input.muestraId,
        estado: 'EN_FABRICACION',
        version_actual: muestra.version_actual,
      },
    }
  } catch (err) {
    try { await client.query('ROLLBACK') } catch (rbErr) {
      logger.warn('iniciarFabricacion ROLLBACK falló', { rbErr: String(rbErr) })
    }
    throw err
  } finally {
    client.release()
  }
}

// Tipo de la OP que devuelve el query — agregado solo para evitar warning
// de TS sobre el shape. No es FK formal.
export interface OPCreatedRow extends PoolClient {}
