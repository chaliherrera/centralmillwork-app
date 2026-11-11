import type { Pool, PoolClient } from 'pg'
import pool from '../../../db/pool'
import { createError } from '../../../middleware/errorHandler'
import { calcularEstimadoDesdeDB, congelarEstimado } from './repo'
import { type ResultadoEstimado } from './costeo'
import { parsearCantidad } from './cantidad'

// ─────────────────────────────────────────────────────────────────────────────
// Operaciones del módulo de Estimados.
//
// Todo está armado alrededor de una idea: poner precio tiene que ser RÁPIDO.
// Las decisiones que de verdad aporta el estimador son cuatro — partir en ítems,
// elegir la receta, poner la cantidad y decidir los días de instalación. El resto
// es aritmética, y de eso se encarga el motor.
//
// Por eso acá hay: búsqueda de recetas que perdona el tipeo, copiar un ítem de
// otro proyecto, duplicar un draft, y la cantidad escrita como cuenta.
// ─────────────────────────────────────────────────────────────────────────────

type DB = Pool | PoolClient

const EDITABLE = 'borrador'

/** Un estimado enviado o aceptado no se toca: ya hay un precio prometido. */
async function exigirEditable(db: DB, estimadoId: number): Promise<void> {
  const { rows } = await db.query(
    `SELECT estado, codigo, draft FROM est_estimados WHERE id = $1`, [estimadoId])
  if (!rows.length) throw createError('el estimado no existe', 404)
  if (rows[0].estado !== EDITABLE) {
    throw createError(
      `el estimado ${rows[0].codigo} draft ${rows[0].draft} está ${rows[0].estado} y no se puede editar. ` +
      `Duplicalo para armar el draft siguiente.`, 409)
  }
}

async function estimadoDeItem(db: DB, itemId: number): Promise<number> {
  const { rows } = await db.query(
    `SELECT estimado_id FROM est_estimado_items WHERE id = $1`, [itemId])
  if (!rows.length) throw createError('el ítem no existe', 404)
  return rows[0].estimado_id
}

async function estimadoDeComponente(db: DB, compId: number): Promise<number> {
  const { rows } = await db.query(
    `SELECT i.estimado_id FROM est_estimado_componentes c
       JOIN est_estimado_items i ON i.id = c.item_id WHERE c.id = $1`, [compId])
  if (!rows.length) throw createError('el componente no existe', 404)
  return rows[0].estimado_id
}

// ── catálogo ────────────────────────────────────────────────────────────────

/**
 * Busca recetas para elegir rápido. Son ~150 con nombres largos y parecidos
 * ('Melamine Interior + Plam Doors "Lower Mid"'), así que la búsqueda parte el
 * texto en palabras y pide que estén TODAS, en cualquier orden: escribir
 * "plam lower" encuentra la de arriba sin acordarse del nombre completo.
 */
export async function buscarRecetas(opts: {
  q?: string; grupo?: string; unidad?: string; limite?: number
}) {
  const palabras = (opts.q ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const cond: string[] = ['p.activo']
  const args: unknown[] = []
  for (const p of palabras) {
    args.push(`%${p}%`)
    cond.push(`(lower(p.descripcion) LIKE $${args.length}
                OR lower(coalesce(r.alias, '')) LIKE $${args.length})`)
  }
  if (opts.grupo) { args.push(opts.grupo); cond.push(`p.grupo = $${args.length}`) }
  if (opts.unidad) { args.push(opts.unidad); cond.push(`p.unidad = $${args.length}`) }
  args.push(Math.min(opts.limite ?? 40, 200))

  // Junto con cada receta viaja cuánto se usó y con qué cantidades. Sirve para
  // dos cosas: ordenar por uso (lo más usado primero, no alfabético) y avisar
  // cuando una cantidad queda fuera de lo que esa receta suele llevar — el error
  // de tipear pies cuadrados en una receta que se vende por plancha.
  const { rows } = await pool.query(
    `WITH uso AS (
       SELECT receta_id, COUNT(*)::int AS usos,
              MIN(cantidad_unidad) AS cant_min,
              MAX(cantidad_unidad) AS cant_max,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY cantidad_unidad) AS cant_mediana
         FROM est_estimado_componentes WHERE cantidad_unidad > 0
        GROUP BY receta_id
     )
     SELECT p.id, p.descripcion, r.alias, p.unidad, p.grupo, p.margen, p.horas_unidad,
            p.fuente_costo, round(p.cogs_unidad, 2) AS cogs,
            round(p.precio_unidad, 2) AS precio_unidad,
            COALESCE(u.usos, 0) AS usos, u.cant_min, u.cant_max, u.cant_mediana
       FROM est_receta_precio p
       JOIN est_recetas r ON r.id = p.id
       LEFT JOIN uso u ON u.receta_id = p.id
      WHERE ${cond.join(' AND ')}
      ORDER BY COALESCE(u.usos, 0) DESC, p.descripcion
      LIMIT $${args.length}`, args)
  return rows.map((r) => ({
    id: r.id,
    descripcion: r.descripcion,
    alias: r.alias,
    unidad: r.unidad,
    grupo: r.grupo,
    margen: r.margen === null ? null : Number(r.margen),
    horasUnidad: Number(r.horas_unidad),
    /** 'calculado' = el costo se mueve solo con sus materiales. */
    fuenteCosto: r.fuente_costo,
    cogsUnidad: r.cogs === null ? null : Number(r.cogs),
    precioUnidad: r.precio_unidad === null ? null : Number(r.precio_unidad),
    /** Cuántas veces se usó y con qué cantidades. Null = nunca se usó. */
    uso: r.usos > 0 ? {
      veces: r.usos,
      min: Number(r.cant_min),
      max: Number(r.cant_max),
      mediana: Number(r.cant_mediana),
    } : null,
  }))
}

/**
 * Pone el nombre corto de una receta ("Lower Cabinets"), el que sale en el
 * "Approx. Size" de la propuesta en vez del nombre largo del catálogo.
 *
 * Decisión de producto: no se cargan los 167 de una; el estimador los va poniendo a
 * medida que usa cada receta. Sin alias, la propuesta muestra la descripción
 * completa — feo pero correcto.
 */
export async function setAliasReceta(recetaId: number, alias: string | null) {
  const { rows } = await pool.query(
    `UPDATE est_recetas SET alias = NULLIF(trim($2), ''), actualizado_en = now()
      WHERE id = $1 RETURNING id, descripcion, alias`, [recetaId, alias ?? ''])
  if (!rows.length) throw createError('la receta no existe', 404)
  return rows[0]
}

export async function listGrupos() {
  const { rows } = await pool.query(
    `SELECT g.nombre, g.margen, COUNT(r.id)::int AS recetas
       FROM est_grupos g LEFT JOIN est_recetas r ON r.grupo_id = g.id AND r.activo
      WHERE g.activo GROUP BY g.nombre, g.margen ORDER BY g.nombre`)
  return rows.map((r) => ({ nombre: r.nombre, margen: Number(r.margen), recetas: r.recetas }))
}

// ── estimados ───────────────────────────────────────────────────────────────

export async function listEstimados(filtros: { estado?: string; q?: string } = {}) {
  const cond: string[] = ['TRUE']
  const args: unknown[] = []
  if (filtros.estado) { args.push(filtros.estado); cond.push(`estado = $${args.length}`) }
  if (filtros.q) {
    args.push(`%${filtros.q.toLowerCase()}%`)
    cond.push(`(lower(codigo) LIKE $${args.length} OR lower(nombre) LIKE $${args.length}
                OR lower(coalesce(gc,'')) LIKE $${args.length})`)
  }
  const { rows } = await pool.query(
    `SELECT id, codigo, nombre, gc, estimador, draft, estado, total, horas_taller,
            presentado_en, actualizado_en
       FROM est_estimados WHERE ${cond.join(' AND ')}
      ORDER BY actualizado_en DESC LIMIT 200`, args)
  return rows
}

/** Cabecera + ítems + componentes + el cálculo completo, en una sola llamada. */
export async function getEstimado(id: number) {
  const { rows: cab } = await pool.query(`SELECT * FROM est_estimados WHERE id = $1`, [id])
  if (!cab.length) throw createError('el estimado no existe', 404)

  const { rows: items } = await pool.query(
    `SELECT * FROM est_estimado_items WHERE estimado_id = $1 ORDER BY n`, [id])
  const { rows: comps } = await pool.query(
    `SELECT c.*, r.descripcion AS receta, r.alias, r.unidad, rc.grupo, rc.fuente_costo
       FROM est_estimado_componentes c
       JOIN est_estimado_items i ON i.id = c.item_id
       JOIN est_recetas r ON r.id = c.receta_id
       JOIN est_receta_costo rc ON rc.id = c.receta_id
      WHERE i.estimado_id = $1 ORDER BY i.n, c.orden`, [id])

  const calculo = await calcularEstimadoDesdeDB(pool, id)
  const precioPorItem = new Map(calculo.porItem.map((p) => [p.itemN, p]))

  return {
    ...cab[0],
    calculo,
    items: items.map((it) => ({
      ...it,
      resumen: precioPorItem.get(it.n) ?? { itemN: it.n, precio: 0, cogs: 0, horas: 0 },
      // El "Approx. Size" de la propuesta, armado desde los componentes.
      // `tamanos` (si está cargado) lo pisa — ver tamanosSugeridos().
      tamanosSugeridos: tamanosSugeridos(
        comps.filter((c) => c.item_id === it.id).map((c) => ({
          alias: c.alias, receta: c.receta, unidad: c.unidad,
          cantidad: Number(c.cantidad_unidad) * it.unidades,
          cantidadPropuesta: c.cantidad_propuesta === null
            ? null : Number(c.cantidad_propuesta) * it.unidades,
        }))),
      componentes: comps
        .filter((c) => c.item_id === it.id)
        .map((c) => {
          // Por id, NO por (ítem, receta): la misma receta puede ir dos veces en
          // el mismo ítem (dos paredes, dos medidas) y cada fila tiene su precio.
          const l = calculo.lineas.find((x) => x.id === c.id)
          return {
            id: c.id,
            recetaId: c.receta_id,
            receta: c.receta,
            unidad: c.unidad,
            grupo: c.grupo,
            fuenteCosto: c.fuente_costo,
            cantidadUnidad: Number(c.cantidad_unidad),
            cantidadExpr: c.cantidad_expr,
            cantidadPropuesta: c.cantidad_propuesta === null
              ? null : Number(c.cantidad_propuesta),
            margenOverride: c.margen_override === null ? null : Number(c.margen_override),
            origenMedida: c.origen_medida,
            hojaPlano: c.hoja_plano,
            nota: c.nota,
            precioUnidad: l ? Math.round(l.precioUnidad * 100) / 100 : null,
            precio: l ? Math.round(l.precio * 100) / 100 : null,
            horas: l ? l.horas : 0,
          }
        }),
    })),
  }
}

export async function crearEstimado(datos: {
  codigo: string; nombre: string; ubicacion?: string | null; gc?: string | null
  gcContacto?: string | null; estimador?: string | null; proyectoId?: number | null
  printSetFecha?: string | null
}) {
  const { rows: ver } = await pool.query(
    `SELECT id FROM est_catalogo_versiones ORDER BY fecha DESC, id DESC LIMIT 1`)
  const { rows } = await pool.query(
    `INSERT INTO est_estimados (codigo, nombre, ubicacion, gc, gc_contacto, estimador,
                                proyecto_id, print_set_fecha, draft, estado,
                                catalogo_version_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
             COALESCE((SELECT MAX(draft)+1 FROM est_estimados WHERE codigo = $1), 1),
             'borrador', $9)
     RETURNING *`,
    [datos.codigo, datos.nombre, datos.ubicacion ?? null, datos.gc ?? null,
     datos.gcContacto ?? null, datos.estimador ?? null, datos.proyectoId ?? null,
     datos.printSetFecha ?? null, ver.length ? ver[0].id : null])

  // Los 7 calculadores arrancan con los defaults de la casa. Sin esto el estimado
  // cotiza SÓLO el mueble y da cero en instalación, embalaje, flete, planos y
  // verificación en obra — el 36% del precio, perdido en silencio.
  await pool.query(
    `INSERT INTO est_estimado_parametros (estimado_id, clave, valor)
     SELECT $1, clave, valor FROM est_parametros_default WHERE valor IS NOT NULL
     ON CONFLICT (estimado_id, clave) DO NOTHING`, [rows[0].id])

  return rows[0]
}

/**
 * El catálogo de perillas para la pantalla: etiqueta, unidad, tipo y si cambia
 * por proyecto. Los parámetros los decide el estimador en cada estimado, así que la
 * UI los muestra siempre; `por_proyecto` define cuáles van primero.
 */
export async function listParametrosCatalogo(estimadoId?: number) {
  const { rows } = await pool.query(
    `SELECT d.clave, d.etiqueta, d.ayuda, d.unidad, d.tipo, d.grupo, d.orden,
            d.por_proyecto, d.requerido, d.valor AS valor_default,
            p.valor AS valor
       FROM est_parametros_default d
       LEFT JOIN est_estimado_parametros p
              ON p.estimado_id = $1 AND p.clave = d.clave
      ORDER BY d.por_proyecto DESC, d.grupo, d.orden`, [estimadoId ?? null])
  return rows.map((r) => ({
    clave: r.clave, etiqueta: r.etiqueta, ayuda: r.ayuda, unidad: r.unidad,
    tipo: r.tipo, grupo: r.grupo, porProyecto: r.por_proyecto,
    requerido: r.requerido,
    valor: r.valor ?? r.valor_default,
    /** El valor de la casa, para poder volver a él desde la pantalla. */
    valorDefault: r.valor_default,
    /** true = la cambió en este estimado; false = sigue el default de la casa. */
    cambiado: r.valor !== null && r.valor !== r.valor_default,
  }))
}

export async function actualizarEstimado(id: number, datos: Record<string, unknown>) {
  await exigirEditable(pool, id)
  const campos: Record<string, string> = {
    nombre: 'nombre', ubicacion: 'ubicacion', gc: 'gc', gcContacto: 'gc_contacto',
    estimador: 'estimador', printSetFecha: 'print_set_fecha', nota: 'nota',
    proyectoId: 'proyecto_id', printSet: 'print_set',
    gcEmail: 'gc_email', gcTelefono: 'gc_telefono',
    estimadorEmail: 'estimador_email', estimadorTelefono: 'estimador_telefono',
    estimadorDirecto: 'estimador_directo',
  }
  const sets: string[] = []
  const args: unknown[] = []
  for (const [k, col] of Object.entries(campos)) {
    if (k in datos) { args.push(datos[k]); sets.push(`${col} = $${args.length}`) }
  }
  if (!sets.length) return (await pool.query(`SELECT * FROM est_estimados WHERE id=$1`, [id])).rows[0]
  args.push(id)
  const { rows } = await pool.query(
    `UPDATE est_estimados SET ${sets.join(', ')}, actualizado_en = now()
      WHERE id = $${args.length} RETURNING *`, args)
  return rows[0]
}

/**
 * Duplica un estimado como draft siguiente. Es lo que hoy se hace con "guardar
 * como" sobre un archivo de 5 MB: acá el draft nuevo nace editable, apuntando al
 * catálogo vigente, y el anterior queda intacto con su historia.
 */
export async function duplicarEstimado(id: number, estimador?: string | null) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: orig } = await client.query(
      `SELECT * FROM est_estimados WHERE id = $1 FOR UPDATE`, [id])
    if (!orig.length) throw createError('el estimado no existe', 404)
    const o = orig[0]

    const { rows: ver } = await client.query(
      `SELECT id FROM est_catalogo_versiones ORDER BY fecha DESC, id DESC LIMIT 1`)
    const { rows: nuevo } = await client.query(
      `INSERT INTO est_estimados (codigo, nombre, ubicacion, gc, gc_contacto, estimador,
                                  proyecto_id, print_set_fecha, draft, estado,
                                  catalogo_version_id, nota)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
               (SELECT MAX(draft)+1 FROM est_estimados WHERE codigo = $1),
               'borrador', $9, $10) RETURNING *`,
      [o.codigo, o.nombre, o.ubicacion, o.gc, o.gc_contacto, estimador ?? o.estimador,
       o.proyecto_id, o.print_set_fecha, ver.length ? ver[0].id : null,
       `Duplicado del draft ${o.draft}`])

    await client.query(
      `INSERT INTO est_estimado_items (estimado_id, n, nombre, ref_plano, unidades,
                                       descripcion, acabados, herrajes, exclusiones,
                                       dias_instalacion, dias_instalacion_sugerido,
                                       dias_instalacion_motivo, orden)
       SELECT $1, n, nombre, ref_plano, unidades, descripcion, acabados, herrajes,
              exclusiones, dias_instalacion, dias_instalacion_sugerido,
              dias_instalacion_motivo, orden
         FROM est_estimado_items WHERE estimado_id = $2`, [nuevo[0].id, id])

    // Los precios congelados NO se copian: el draft nuevo sigue al catálogo vivo.
    await client.query(
      `INSERT INTO est_estimado_componentes (item_id, receta_id, cantidad_unidad,
              cantidad_expr, margen_override, origen_medida, hoja_plano, referencia,
              nota, orden)
       SELECT ni.id, c.receta_id, c.cantidad_unidad, c.cantidad_expr, c.margen_override,
              c.origen_medida, c.hoja_plano, c.referencia, c.nota, c.orden
         FROM est_estimado_componentes c
         JOIN est_estimado_items oi ON oi.id = c.item_id
         JOIN est_estimado_items ni ON ni.estimado_id = $1 AND ni.n = oi.n
        WHERE oi.estimado_id = $2`, [nuevo[0].id, id])

    await client.query(
      `INSERT INTO est_estimado_parametros (estimado_id, clave, valor)
       SELECT $1, clave, valor FROM est_estimado_parametros WHERE estimado_id = $2`,
      [nuevo[0].id, id])

    await client.query('COMMIT')
    return nuevo[0]
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** Envía el estimado: clava precios, tarifa y versión de catálogo. */
export async function enviarEstimado(id: number): Promise<ResultadoEstimado> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await exigirEditable(client, id)
    const r = await congelarEstimado(client, id)
    await client.query(
      `UPDATE est_estimados SET estado='enviado', presentado_en = CURRENT_DATE,
              actualizado_en = now() WHERE id = $1`, [id])
    await client.query('COMMIT')
    return r
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function cambiarEstado(id: number, estado: 'aceptado' | 'perdido') {
  const { rows } = await pool.query(
    `UPDATE est_estimados SET estado = $2, actualizado_en = now()
      WHERE id = $1 AND estado IN ('enviado','aceptado','perdido') RETURNING *`, [id, estado])
  if (!rows.length) {
    throw createError('sólo se puede aceptar o perder un estimado ya enviado', 409)
  }
  return rows[0]
}

/**
 * "¿Qué saldría hoy?" — compara lo congelado contra el catálogo vivo, sin tocar
 * el original. Es la pregunta que hoy no se puede contestar: un estimado de hace
 * tres meses no sabe si los costos se movieron.
 */
export async function queSaldriaHoy(id: number) {
  const { rows } = await pool.query(
    `SELECT estado, total, horas_taller, congelado_en FROM est_estimados WHERE id = $1`, [id])
  if (!rows.length) throw createError('el estimado no existe', 404)
  const hoy = await calcularEstimadoDesdeDB(pool, id)
  const congelado = rows[0].total === null ? null : Number(rows[0].total)

  const { rows: movidas } = await pool.query(
    `SELECT rc.descripcion, round(c.precio_unidad, 2) AS congelado,
            round(CASE WHEN c.margen_override IS NOT NULL
                       THEN rp.cogs_unidad / (1 - c.margen_override)
                       ELSE rp.precio_unidad END, 2) AS hoy
       FROM est_estimado_componentes c
       JOIN est_estimado_items i ON i.id = c.item_id
       JOIN est_receta_costo rc ON rc.id = c.receta_id
       JOIN est_receta_precio rp ON rp.id = c.receta_id
      WHERE i.estimado_id = $1 AND c.precio_unidad IS NOT NULL
        AND abs(c.precio_unidad - CASE WHEN c.margen_override IS NOT NULL
                   THEN rp.cogs_unidad / (1 - c.margen_override)
                   ELSE rp.precio_unidad END) > 0.005
      ORDER BY abs(c.precio_unidad - rp.precio_unidad) DESC`, [id])

  return {
    estado: rows[0].estado,
    congeladoEn: rows[0].congelado_en,
    totalCongelado: congelado,
    totalHoy: hoy.total,
    diferencia: congelado === null ? null : Math.round((hoy.total - congelado) * 100) / 100,
    recetasQueSeMovieron: movidas.map((m) => ({
      receta: m.descripcion,
      congelado: Number(m.congelado),
      hoy: Number(m.hoy),
    })),
  }
}

// ── ítems ───────────────────────────────────────────────────────────────────

export async function crearItem(estimadoId: number, datos: {
  nombre: string; refPlano?: string | null; unidades?: number
  descripcion?: string | null; acabados?: string | null; herrajes?: string | null
  exclusiones?: string | null
}) {
  await exigirEditable(pool, estimadoId)
  const { rows } = await pool.query(
    `INSERT INTO est_estimado_items (estimado_id, n, nombre, ref_plano, unidades,
            descripcion, acabados, herrajes, exclusiones, orden)
     VALUES ($1, COALESCE((SELECT MAX(n)+1 FROM est_estimado_items WHERE estimado_id=$1), 1),
             $2,$3,$4,$5,$6,$7,$8,
             COALESCE((SELECT MAX(orden)+1 FROM est_estimado_items WHERE estimado_id=$1), 1))
     RETURNING *`,
    [estimadoId, datos.nombre, datos.refPlano ?? null, datos.unidades ?? 1,
     datos.descripcion ?? null, datos.acabados ?? null, datos.herrajes ?? null,
     datos.exclusiones ?? null])
  return rows[0]
}

export async function actualizarItem(itemId: number, datos: Record<string, unknown>) {
  await exigirEditable(pool, await estimadoDeItem(pool, itemId))
  const campos: Record<string, string> = {
    nombre: 'nombre', refPlano: 'ref_plano', unidades: 'unidades',
    descripcion: 'descripcion', acabados: 'acabados', herrajes: 'herrajes',
    exclusiones: 'exclusiones', diasInstalacion: 'dias_instalacion',
    diasInstalacionMotivo: 'dias_instalacion_motivo', orden: 'orden',
    tamanos: 'tamanos',
  }
  const sets: string[] = []
  const args: unknown[] = []
  for (const [k, col] of Object.entries(campos)) {
    if (k in datos) { args.push(datos[k]); sets.push(`${col} = $${args.length}`) }
  }
  // Escribir los días a mano los FIJA: a partir de ahí el ítem deja de seguir
  // la regla de la casa por día. Para volver a ella está volverALaRegla().
  if ('diasInstalacion' in datos && !('diasInstalacionManual' in datos)) {
    sets.push('dias_instalacion_manual = TRUE')
  }
  if (!sets.length) throw createError('no hay nada para cambiar', 400)
  args.push(itemId)
  const { rows } = await pool.query(
    `UPDATE est_estimado_items SET ${sets.join(', ')} WHERE id = $${args.length} RETURNING *`, args)
  return rows[0]
}

export async function borrarItem(itemId: number) {
  await exigirEditable(pool, await estimadoDeItem(pool, itemId))
  await pool.query(`DELETE FROM est_estimado_items WHERE id = $1`, [itemId])
}

/**
 * Copia un ítem entero (con sus componentes) desde cualquier otro estimado.
 *
 * Es el atajo que más tiempo ahorra: la mayoría de las cocinas se parecen a otra
 * cocina. En vez de volver a elegir doce recetas y escribir doce cantidades, se
 * trae el ítem de un proyecto anterior y se ajustan las medidas.
 */
export async function copiarItem(estimadoDestino: number, itemOrigen: number, nombre?: string) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await exigirEditable(client, estimadoDestino)
    const { rows: orig } = await client.query(
      `SELECT * FROM est_estimado_items WHERE id = $1`, [itemOrigen])
    if (!orig.length) throw createError('el ítem que querés copiar no existe', 404)
    const o = orig[0]

    const { rows: nuevo } = await client.query(
      `INSERT INTO est_estimado_items (estimado_id, n, nombre, ref_plano, unidades,
              descripcion, acabados, herrajes, exclusiones, dias_instalacion, orden)
       VALUES ($1, COALESCE((SELECT MAX(n)+1 FROM est_estimado_items WHERE estimado_id=$1), 1),
               $2,$3,$4,$5,$6,$7,$8,$9,
               COALESCE((SELECT MAX(orden)+1 FROM est_estimado_items WHERE estimado_id=$1), 1))
       RETURNING *`,
      [estimadoDestino, nombre ?? o.nombre, o.ref_plano, o.unidades, o.descripcion,
       o.acabados, o.herrajes, o.exclusiones, o.dias_instalacion])

    await client.query(
      `INSERT INTO est_estimado_componentes (item_id, receta_id, cantidad_unidad,
              cantidad_expr, margen_override, origen_medida, hoja_plano, referencia, nota, orden)
       SELECT $1, receta_id, cantidad_unidad, cantidad_expr, margen_override,
              origen_medida, hoja_plano, referencia, nota, orden
         FROM est_estimado_componentes WHERE item_id = $2`, [nuevo[0].id, itemOrigen])

    await client.query('COMMIT')
    return nuevo[0]
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** Los ítems que ya se usaron antes, para el buscador de "copiar de…". */
export async function itemsParaCopiar(q?: string) {
  const args: unknown[] = []
  let cond = 'TRUE'
  if (q) {
    args.push(`%${q.toLowerCase()}%`)
    cond = `(lower(i.nombre) LIKE $1 OR lower(e.codigo) LIKE $1 OR lower(e.nombre) LIKE $1)`
  }
  const { rows } = await pool.query(
    `SELECT i.id, i.nombre, i.unidades, e.codigo, e.nombre AS proyecto, e.draft, e.estado,
            COUNT(c.id)::int AS componentes
       FROM est_estimado_items i
       JOIN est_estimados e ON e.id = i.estimado_id
       LEFT JOIN est_estimado_componentes c ON c.item_id = i.id
      WHERE ${cond}
      GROUP BY i.id, i.nombre, i.unidades, e.codigo, e.nombre, e.draft, e.estado
     HAVING COUNT(c.id) > 0
      ORDER BY e.codigo DESC, i.n LIMIT 100`, args)
  return rows
}

/**
 * Los días de instalación del proyecto, ítem por ítem: lo que se usa, lo que
 * sugiere la regla de la casa de producto por día, y si fue fijado a mano.
 * El cálculo ya lo resuelve; acá sólo se le agrega el nombre de cada ítem.
 */
export async function sugerirDias(estimadoId: number) {
  const r = await calcularEstimadoDesdeDB(pool, estimadoId)
  const { rows: items } = await pool.query(
    `SELECT id, n, nombre FROM est_estimado_items WHERE estimado_id = $1 ORDER BY n`,
    [estimadoId])
  const precio = new Map(r.porItem.map((x) => [x.itemN, x.precio]))
  const inst = new Map(r.instalacionPorItem.map((x) => [x.itemN, x]))
  return {
    diasTotal: r.diasInstalacion,
    items: items.map((i) => ({
      id: i.id, n: i.n, nombre: i.nombre,
      precio: precio.get(i.n) ?? 0,
      dias: inst.get(i.n)?.dias ?? 0,
      sugerido: inst.get(i.n)?.sugerido ?? 0,
      manual: inst.get(i.n)?.manual ?? false,
    })),
  }
}

/** Devuelve un ítem a la regla: deja de estar fijado a mano. */
export async function volverALaRegla(itemId: number) {
  await exigirEditable(pool, await estimadoDeItem(pool, itemId))
  const { rows } = await pool.query(
    `UPDATE est_estimado_items SET dias_instalacion_manual = FALSE
      WHERE id = $1 RETURNING *`, [itemId])
  return rows[0]
}


// ── componentes ─────────────────────────────────────────────────────────────

export async function agregarComponente(itemId: number, datos: {
  recetaId: number; cantidad: string | number; margenOverride?: number | null
  origenMedida?: string | null; hojaPlano?: string | null; referencia?: string | null
  nota?: string | null
}) {
  await exigirEditable(pool, await estimadoDeItem(pool, itemId))
  const { cantidad, expresion } = parsearCantidad(datos.cantidad)
  const { rows } = await pool.query(
    `INSERT INTO est_estimado_componentes (item_id, receta_id, cantidad_unidad,
            cantidad_expr, margen_override, origen_medida, hoja_plano, referencia, nota, orden)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
             COALESCE((SELECT MAX(orden)+1 FROM est_estimado_componentes WHERE item_id=$1), 1))
     RETURNING *`,
    [itemId, datos.recetaId, cantidad, expresion, datos.margenOverride ?? null,
     datos.origenMedida ?? null, datos.hojaPlano ?? null, datos.referencia ?? null,
     datos.nota ?? null])
  return rows[0]
}

export async function actualizarComponente(compId: number, datos: Record<string, unknown>) {
  await exigirEditable(pool, await estimadoDeComponente(pool, compId))
  const sets: string[] = []
  const args: unknown[] = []
  if ('cantidad' in datos) {
    const { cantidad, expresion } = parsearCantidad(datos.cantidad as string | number)
    args.push(cantidad); sets.push(`cantidad_unidad = $${args.length}`)
    args.push(expresion); sets.push(`cantidad_expr = $${args.length}`)
  }
  const campos: Record<string, string> = {
    recetaId: 'receta_id', margenOverride: 'margen_override',
    origenMedida: 'origen_medida', hojaPlano: 'hoja_plano',
    referencia: 'referencia', nota: 'nota', orden: 'orden',
    cantidadPropuesta: 'cantidad_propuesta',
  }
  for (const [k, col] of Object.entries(campos)) {
    if (k in datos) { args.push(datos[k]); sets.push(`${col} = $${args.length}`) }
  }
  if (!sets.length) throw createError('no hay nada para cambiar', 400)
  args.push(compId)
  const { rows } = await pool.query(
    `UPDATE est_estimado_componentes SET ${sets.join(', ')}
      WHERE id = $${args.length} RETURNING *`, args)
  return rows[0]
}

export async function borrarComponente(compId: number) {
  await exigirEditable(pool, await estimadoDeComponente(pool, compId))
  await pool.query(`DELETE FROM est_estimado_componentes WHERE id = $1`, [compId])
}

// ── parámetros del proyecto ─────────────────────────────────────────────────

export async function getParametros(estimadoId: number) {
  const { rows } = await pool.query(
    `SELECT clave, valor FROM est_estimado_parametros WHERE estimado_id=$1 ORDER BY clave`,
    [estimadoId])
  return Object.fromEntries(rows.map((r) => [r.clave, r.valor]))
}

export async function setParametros(estimadoId: number, valores: Record<string, unknown>) {
  await exigirEditable(pool, estimadoId)
  for (const [clave, valor] of Object.entries(valores)) {
    await pool.query(
      `INSERT INTO est_estimado_parametros (estimado_id, clave, valor) VALUES ($1,$2,$3)
       ON CONFLICT (estimado_id, clave) DO UPDATE SET valor = EXCLUDED.valor`,
      [estimadoId, clave, String(valor)])
  }
  return getParametros(estimadoId)
}

// ── la propuesta que recibe el GC ───────────────────────────────────────────

/** Unidades que describen un tamaño. El herraje y los consumibles no van. */
const UNIDADES_DIMENSIONALES = new Set(['LF', 'SF'])

/**
 * Arma el "Approx. Size" del ítem desde sus componentes:
 *     "Lower Cabinets=7.3 LF; Countertop=19.24 SF"
 *
 * Hoy esa línea se tipea a mano aunque las cantidades ya están cargadas, y por
 * eso puede quedar desincronizada del precio. Se genera de los componentes que
 * tienen unidad dimensional, nombrados con el alias corto de la receta.
 *
 * Ojo: puede no coincidir con lo que se escribía a mano. En una propuesta real
 * la línea de estantes decía la mitad de los pies que cobra el modelo (los pies
 * de corrida, no los de estante). Por eso es una SUGERENCIA:
 * `est_estimado_items.tamanos` la pisa.
 */
export function tamanosSugeridos(
  comps: {
    alias: string | null; receta: string; unidad: string | null
    cantidad: number
    /** Lo que ve el cliente, si difiere de lo que se cotiza. Ver migración 106. */
    cantidadPropuesta?: number | null
  }[],
): string | null {
  const partes = comps
    .filter((c) => c.unidad && UNIDADES_DIMENSIONALES.has(c.unidad))
    .map((c) => ({ ...c, mostrar: c.cantidadPropuesta ?? c.cantidad }))
    .filter((c) => c.mostrar > 0)
    .map((c) => `${c.alias ?? c.receta}=${Math.round(c.mostrar * 100) / 100} ${c.unidad}`)
  return partes.length ? partes.join('; ') : null
}

/**
 * Las etiquetas de los 7 renglones. Cambian según lo que tenga el estimado: un
 * proyecto con piedra dice "Stone Base Bid" y uno sin ella "Solid Surface Base
 * Bid"; la instalación menciona la piedra sólo si la hay. Se calcula una
 * razonable y `est_estimado_renglones` la pisa cuando hace falta.
 */
export function etiquetasRenglones(opts: {
  haySolidSurface: boolean; hayStone: boolean
  viajesEntrega: number; viajesVif: number
}): Record<number, string> {
  const piedra = opts.hayStone ? 'Stone' : 'Solid Surface'
  return {
    1: 'Millwork Base Bid',
    2: opts.haySolidSurface || opts.hayStone
      ? `Millwork & ${piedra} Installation`
      : 'Millwork Installation',
    3: `${piedra} Base Bid`,
    4: 'Packaging',
    5: `Delivery -Trips Included (${opts.viajesEntrega})`,
    6: 'Fabrication Documents - Per Client Specifications',
    7: `Field Verification - Trips Included (${opts.viajesVif})`,
  }
}

/**
 * Todo lo que necesita la hoja que se le manda al GC, en una sola llamada:
 * encabezado, los 7 renglones con su etiqueta, impuesto, total, el desglose por
 * ítem con sus cinco líneas de texto, y los Términos y Condiciones vigentes.
 *
 * Un estimado enviado trae sus números congelados y la versión de T&C con la
 * que salió; uno en borrador, lo que daría hoy.
 */
export async function getPropuesta(id: number) {
  const e = await getEstimado(id)
  const p = await getParametros(id)
  const num = (k: string) => Number(p[k] ?? 0)

  const grupos = new Set(e.calculo.lineas.map((l: { grupo: string | null }) => l.grupo))
  const base = etiquetasRenglones({
    haySolidSurface: grupos.has('Solid Surface'),
    hayStone: grupos.has('Stone'),
    viajesEntrega: num('viajes_entrega'),
    viajesVif: num('viajes_vif'),
  })

  const { rows: overrides } = await pool.query(
    `SELECT renglon, etiqueta FROM est_estimado_renglones WHERE estimado_id = $1`, [id])
  for (const o of overrides) base[o.renglon] = o.etiqueta

  const { rows: tyc } = await pool.query(
    `SELECT version, contenido, terminos_pago FROM est_tyc_versiones
      WHERE ($1::text IS NULL AND vigente) OR version = $1 LIMIT 1`,
    [e.tyc_version ?? null])

  return {
    encabezado: {
      cliente: { nombre: e.gc, contacto: e.gc_contacto, email: e.gc_email, telefono: e.gc_telefono },
      preparadoPor: {
        empresa: 'Central Millwork, LLC.',
        estimador: e.estimador, email: e.estimador_email,
        oficina: e.estimador_telefono, directo: e.estimador_directo,
      },
      proyecto: { codigo: e.codigo, nombre: e.nombre, ubicacion: e.ubicacion },
      presentadoEl: e.presentado_en,
      basadoEn: e.print_set,
      draft: e.draft,
      estado: e.estado,
    },
    renglones: e.calculo.renglones.map((r: { n: number; monto: number }) => ({
      n: r.n, etiqueta: base[r.n], monto: r.monto,
    })),
    total: e.calculo.total,
    salesTax: e.calculo.salesTax,
    totalConImpuestos: e.calculo.totalConImpuestos,
    /** Cuando no se cobra impuesto la hoja dice esto en vez de un número. */
    leyendaImpuesto: e.calculo.salesTax > 0 ? null : 'RESALE TAX PROVIDED',
    items: e.items
      .filter((it: { unidades: number }) => it.unidades > 0)
      .map((it: Record<string, any>) => ({
        n: it.n,
        titulo: `Item ${it.n} | ${it.nombre} |${it.unidades} Unit${it.unidades > 1 ? 's' : ''}`,
        refPlano: it.ref_plano,
        precio: it.resumen.precio,
        descripcion: it.descripcion,
        tamanos: it.tamanos ?? it.tamanosSugeridos,
        acabados: it.acabados,
        herrajes: it.herrajes,
        exclusiones: it.exclusiones,
      })),
    terminos: tyc.length
      ? {
          version: tyc[0].version,
          contenido: tyc[0].contenido,
          /** Los puntos del bloque TERMS del encabezado. Siempre los mismos. */
          pago: (tyc[0].terminos_pago ?? '').split('\n').filter(Boolean),
        }
      : null,
    advertencias: e.calculo.advertencias,
  }
}
