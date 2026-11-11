import type { PoolClient, Pool } from 'pg'
import {
  calcularEstimado,
  type RecetaCosteo,
  type ComponenteCosteo,
  type ParametrosEstimado,
  type ResultadoEstimado,
} from './costeo'

// ─────────────────────────────────────────────────────────────────────────────
// Puente entre la base y el motor de costeo.
//
// Todo lo que decide de dónde sale el costo de una receta vive en la vista
// `est_receta_costo` (modo híbrido: 'directo' o 'calculado'), así que acá sólo
// se lee y se le pasa al motor. Si mañana una receta se despieza, nada de este
// archivo cambia.
// ─────────────────────────────────────────────────────────────────────────────

type Ejecutor = Pool | PoolClient

const n = (v: unknown, def = 0): number =>
  v === null || v === undefined ? def : Number(v)

/** Los parámetros se guardan clave/valor; acá se tipan. */
function leerParametros(filas: { clave: string; valor: string }[],
                        tarifaTaller: number): ParametrosEstimado {
  const m = new Map(filas.map((f) => [f.clave, f.valor]))
  const num = (k: string, def = 0) => {
    const v = m.get(k)
    return v === undefined || v === '' || v === 'None' ? def : Number(v)
  }
  const si = (k: string) => (m.get(k) ?? '').toUpperCase() === 'YES'
  return {
    tarifaTaller,
    instalacionIncluida: si('instalacion_incluida'),
    proyectoLocal: si('proyecto_local'),
    dolaresPorDiaInstalacion: num('dolares_por_dia_instalacion'),
    diasInstalacion: num('dias_instalacion'),
    instaladores: num('instaladores'),
    horasPorDia: num('horas_por_dia'),
    tarifaInstalacion: num('tarifa_instalacion'),
    millasIda: num('millas_ida'),
    punchListDias: num('punch_list_dias'),
    margenLaborInst: num('margen_labor_inst'),
    margenViajeInst: num('margen_viaje_inst'),
    margenOtrosInst: num('margen_otros_inst'),
    crates: num('crates'),
    costoCrate: num('costo_crate'),
    margenPackaging: num('margen_packaging'),
    camionBase: num('camion_base'),
    camionFactor: num('camion_factor'),
    viajesEntrega: num('viajes_entrega'),
    margenEntrega: num('margen_entrega'),
    costoPlanoTaller: num('costo_plano_taller'),
    margenPlanos: num('margen_planos'),
    vifIncluido: si('vif_incluido'),
    viajesVif: num('viajes_vif'),
    costoVif: num('costo_vif'),
    margenVif: num('margen_vif'),
    fleteMaterialPct: num('flete_material_pct'),
    margenFeesMaterial: num('margen_fees_material'),
    incluirSalesTax: si('incluir_sales_tax'),
    // Se guarda como 'True'/'False' además de YES/NO: viene del porteo.
    resaleCertificate: /^(yes|true)$/i.test(String(m.get('resale_certificate') ?? '')),
    tasaSalesTax: num('tasa_sales_tax'),
    renglonesSinImpuesto: String(m.get('renglones_sin_impuesto') ?? '')
      .split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => !Number.isNaN(x)),
  }
}

/**
 * Calcula un estimado EN BORRADOR contra el catálogo vivo.
 *
 * Un estimado enviado o aceptado NO se recalcula: guarda sus propios precios
 * congelados (decisión A). Para esos, leer `est_estimado_componente_calc`, que
 * ya devuelve lo congelado — o llamar a esta función para responder la pregunta
 * "¿qué saldría hoy?" sin tocar el original.
 */
export async function calcularEstimadoDesdeDB(
  db: Ejecutor,
  estimadoId: number,
): Promise<ResultadoEstimado> {
  const { rows: tarifa } = await db.query(
    `SELECT valor FROM est_tarifas
      WHERE clave = 'taller' AND vigente_hasta IS NULL LIMIT 1`,
  )
  if (!tarifa.length) throw new Error('no hay tarifa de taller vigente en est_tarifas')
  const tarifaTaller = Number(tarifa[0].valor)

  // La vista resuelve el modo híbrido: el motor no se entera de cuál es cuál.
  const { rows: rec } = await db.query(
    `SELECT id, descripcion, grupo, margen, horas_unidad, tarifa_override,
            costo_material, material_estandar, fees_extra
       FROM est_receta_costo`,
  )
  const recetas: RecetaCosteo[] = rec.map((r) => ({
    id: r.id,
    descripcion: r.descripcion,
    grupo: r.grupo,
    margen: r.margen === null ? null : Number(r.margen),
    horasUnidad: n(r.horas_unidad),
    tarifaOverride: r.tarifa_override === null ? null : Number(r.tarifa_override),
    costoMaterial: n(r.costo_material),
    materialEstandar: !!r.material_estandar,
    feesExtra: n(r.fees_extra),
  }))

  const { rows: comp } = await db.query(
    `SELECT c.id, i.n AS item_n, c.receta_id, c.margen_override,
            c.cantidad_unidad * i.unidades AS cantidad_total
       FROM est_estimado_componentes c
       JOIN est_estimado_items i ON i.id = c.item_id
      WHERE i.estimado_id = $1
      ORDER BY i.n, c.orden`,
    [estimadoId],
  )
  const componentes: ComponenteCosteo[] = comp.map((c) => ({
    id: c.id,
    itemN: c.item_n,
    recetaId: c.receta_id,
    cantidadTotal: n(c.cantidad_total),
    margenOverride: c.margen_override === null ? null : Number(c.margen_override),
  }))

  // Cada estimado guarda SUS perillas, copiadas al crearlo. Pero una perilla que
  // se agrega después no está en esa copia, y entonces vale 0 para todos los
  // estimados anteriores: el precio sale corto y en silencio. Así que lo que el
  // estimado no tiene lo cubre el default de la casa. Lo que el estimador tocó
  // en este estimado siempre manda. El segundo brazo del UNION son las perillas
  // que sólo existen a nivel estimado (vienen del porteo del Excel).
  const { rows: par } = await db.query(
    `SELECT d.clave, COALESCE(p.valor, d.valor) AS valor
       FROM est_parametros_default d
       LEFT JOIN est_estimado_parametros p
              ON p.estimado_id = $1 AND p.clave = d.clave
      UNION ALL
     SELECT p.clave, p.valor
       FROM est_estimado_parametros p
      WHERE p.estimado_id = $1
        AND NOT EXISTS (SELECT 1 FROM est_parametros_default d
                         WHERE d.clave = p.clave)`,
    [estimadoId],
  )
  const p = leerParametros(par, tarifaTaller)

  const { rows: itemsInst } = await db.query(
    `SELECT n, dias_instalacion, dias_instalacion_manual
       FROM est_estimado_items WHERE estimado_id = $1 ORDER BY n`,
    [estimadoId],
  )
  const r = calcularEstimado(recetas, componentes, p, itemsInst.map((i) => ({
    itemN: i.n,
    dias: n(i.dias_instalacion),
    manual: !!i.dias_instalacion_manual,
  })))

  // Una perilla requerida sin valor hace que el precio salga CORTO y en silencio:
  // sin `costo_crate` el embalaje da cero, sin `tarifa_instalacion` la instalación
  // también. En un proyecto real eso sería el 36% del total. Mejor que avise.
  const { rows: falta } = await db.query(
    `SELECT d.clave, d.etiqueta
       FROM est_parametros_default d
       LEFT JOIN est_estimado_parametros p
              ON p.estimado_id = $1 AND p.clave = d.clave
      WHERE d.requerido
        AND COALESCE(p.valor, d.valor, '') IN ('', 'None')
      ORDER BY d.grupo, d.orden`,
    [estimadoId],
  ).catch(() => ({ rows: [] as { clave: string; etiqueta: string }[] }))
  r.advertencias = falta.map((f) => `Falta "${f.etiqueta}" (${f.clave})`)

  return r
}

/**
 * Congela un estimado: clava los precios unitarios de cada componente, la
 * tarifa y los totales. A partir de acá deja de seguir al catálogo.
 * Se llama al pasar de 'borrador' a 'enviado'.
 */
export async function congelarEstimado(
  db: PoolClient,
  estimadoId: number,
): Promise<ResultadoEstimado> {
  const r = await calcularEstimadoDesdeDB(db, estimadoId)
  const { rows: t } = await db.query(
    `SELECT valor FROM est_tarifas WHERE clave='taller' AND vigente_hasta IS NULL LIMIT 1`,
  )
  for (const l of r.lineas) {
    await db.query(
      `UPDATE est_estimado_componentes c
          SET cogs_unidad = $1, precio_unidad = $2
         FROM est_estimado_items i
        WHERE c.item_id = i.id AND i.estimado_id = $3
          AND i.n = $4 AND c.receta_id = $5`,
      [l.cogsUnidad, l.precioUnidad, estimadoId, l.itemN, l.recetaId],
    )
  }
  await db.query(
    `UPDATE est_estimados
        SET tarifa_taller = $1, congelado_en = now(),
            total = $2, cogs_total = $3, horas_taller = $4
      WHERE id = $5`,
    [Number(t[0].valor), r.total, r.cogsTotal, r.horasTaller, estimadoId],
  )
  return r
}
