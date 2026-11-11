// ─────────────────────────────────────────────────────────────────────────────
// Motor de costeo de Estimados. Función PURA: no toca la base.
//
// Reemplaza las 45.726 fórmulas del Excel de estimados, que se reducen a esto:
//
//     cogs_unidad   = costo_material + horas_unidad × tarifa_taller
//     precio_unidad = cogs_unidad / (1 − margen_del_grupo)
//
// El margen se aplica como DIVISOR, no como recargo: /(1−m) da m real sobre
// venta, ×1,45 daría 31%.
//
// De dónde sale `costoMaterial` lo resuelve la vista `est_receta_costo` según el
// modo híbrido de la receta ('directo' = número cargado a mano, con el colchón
// adentro; 'calculado' = suma de su composición). El motor no se entera.
// ─────────────────────────────────────────────────────────────────────────────

/** Una receta del catálogo, ya con su costo de material resuelto. */
export interface RecetaCosteo {
  id: number
  descripcion: string
  grupo: string | null
  /** Margen del grupo, 0..1. Null = no se puede cotizar. */
  margen: number | null
  horasUnidad: number
  /** Algunas operaciones se costean a otra tarifa (ej. Solid Surface Fabrication). */
  tarifaOverride: number | null
  costoMaterial: number
  /** Entra a la base del flete de material estándar. */
  materialEstandar: boolean
  /** Ship/handling/tax propios de esta receta. Se cobran una vez si se usa. */
  feesExtra: number
}

/** Una línea del estimado: una receta con la cantidad medida en el plano. */
export interface ComponenteCosteo {
  /** Id de la fila en est_estimado_componentes. Es lo que identifica la línea:
   *  la MISMA receta puede aparecer dos veces en un ítem (dos paredes, dos
   *  medidas) y cada una es una línea distinta. */
  id: number
  itemN: number
  recetaId: number
  /** cantidad por unidad × unidades del ítem. */
  cantidadTotal: number
  margenOverride: number | null
}

/** Los días de instalación de un ítem. El total del proyecto es la suma. */
export interface ItemInstalacion {
  itemN: number
  /** Lo que puso el estimador. Sólo manda si `manual`. */
  dias: number
  /** false = sigue la regla de la casa por día y se recalcula solo. */
  manual: boolean
}

export interface ParametrosEstimado {
  tarifaTaller: number
  // Instalación
  instalacionIncluida: boolean
  proyectoLocal: boolean
  /**
   * La regla de la casa: cuánto producto se instala en un día de trabajo.
   * Es un parámetro, no una constante del código — es un número comercial y
   * cambia con el tiempo. 0 = sin cargar; entonces la regla no propone nada.
   */
  dolaresPorDiaInstalacion: number
  /** Respaldo cuando no se pasan los ítems. Lo normal es la suma por ítem. */
  diasInstalacion: number
  instaladores: number
  horasPorDia: number
  tarifaInstalacion: number
  millasIda: number
  punchListDias: number
  margenLaborInst: number
  margenViajeInst: number
  margenOtrosInst: number
  // Embalaje y flete
  crates: number
  costoCrate: number
  margenPackaging: number
  camionBase: number
  camionFactor: number
  viajesEntrega: number
  margenEntrega: number
  // Documentos y obra
  costoPlanoTaller: number
  margenPlanos: number
  vifIncluido: boolean
  viajesVif: number
  costoVif: number
  margenVif: number
  // Material
  fleteMaterialPct: number
  margenFeesMaterial: number
  // Sales tax. Son DOS cosas distintas y conviene no fundirlas:
  //   incluirSalesTax   → este proyecto es gravado
  //   resaleCertificate → el GC presentó resale o tax exempt certificate
  // Un proyecto puede estar marcado como gravado y aun así no cobrar, porque el
  // GC presentó el certificado: ahí la hoja muestra "RESALE TAX PROVIDED" en
  // lugar de un monto.
  incluirSalesTax: boolean
  resaleCertificate: boolean
  tasaSalesTax: number
  /**
   * Renglones que NO pagan impuesto. Los Fabrication Documents (el 6) son un
   * servicio y quedan afuera. La regla salió de comparar una propuesta ya
   * emitida contra la cuenta: el impuesto sobre los 7 renglones no daba, y
   * excluyendo ese renglón cierra al centavo.
   */
  renglonesSinImpuesto: number[]
}

export interface LineaCosteada {
  /** Id del componente que originó la línea. Ver ComponenteCosteo.id. */
  id: number
  itemN: number
  recetaId: number
  receta: string
  grupo: string | null
  cantidad: number
  cogsUnidad: number
  precioUnidad: number
  cogs: number
  precio: number
  horas: number
  /** Costo de la mano de obra de esta línea, a la tarifa que le corresponde. */
  costoLabor: number
}

export interface RenglonPropuesta {
  n: number
  concepto: string
  monto: number
}

export interface ResultadoEstimado {
  lineas: LineaCosteada[]
  renglones: RenglonPropuesta[]
  /** ESTIMATE TOTAL — NOT INCLUDING TAXES. */
  total: number
  salesTax: number
  /** ESTIMATE TOTAL INCLUDING TAXES. */
  totalConImpuestos: number
  cogsTotal: number
  /** Margen real sobre venta, 0..1. */
  margen: number
  horasTaller: number
  /** Perillas requeridas sin valor. Con una sola, el precio sale corto. */
  advertencias: string[]
  /**
   * Lo que cuesta la mano de obra de taller de este proyecto, cada línea a la
   * tarifa que le corresponde. NO es horasTaller × tarifa: una receta con
   * `tarifaOverride` se costea distinto.
   */
  presupuestoTaller: number
  /** Días de instalación totales del proyecto: la suma de los ítems. */
  diasInstalacion: number
  porItem: { itemN: number; precio: number; cogs: number; horas: number }[]
  /** Por ítem: lo que se usa, lo que sugiere la regla, y si fue fijado a mano. */
  instalacionPorItem: { itemN: number; dias: number; sugerido: number; manual: boolean }[]
  /** La regla de la casa con la que se calculó, para poder mostrarla. */
  dolaresPorDiaInstalacion: number
}

/** Redondeo a centavos, estable para los acumulados de plata. */
const c2 = (n: number) => Math.round(n * 100) / 100

/** Aplica el margen como divisor. Un margen >= 1 sería precio infinito. */
function conMargen(costo: number, margen: number | null): number {
  if (margen === null || margen >= 1) return 0
  return costo / (1 - margen)
}

/**
 * Días de instalación que propone la regla implícita de la casa: cierto monto
 * de producto se instala en un día de trabajo.
 *
 * El monto llega por parámetro (`dolares_por_dia_instalacion`) y no vive acá:
 * es un número del negocio, se ajusta sin tocar el código y no tiene por qué
 * estar en el repo. Sin cargar, la regla no propone nada —devuelve 0— y el
 * estimado avisa que falta la perilla, en vez de sugerir días inventados.
 *
 * Se devuelve como SUGERENCIA, nunca se impone: el estimador puede saber algo
 * que la regla no (acceso, altura, obra ocupada). Guardar las dos cosas es lo
 * que permite ver que hubo una decisión: en un proyecto real la diferencia entre
 * lo que propuso la regla y lo que puso el estimador fue el 6% del total.
 */
export function diasInstalacionSugeridos(
  productoTotal: number,
  dolaresPorDia: number,
): number {
  if (productoTotal <= 0 || !(dolaresPorDia > 0)) return 0
  return Math.round((productoTotal / dolaresPorDia) * 100) / 100
}

export function calcularEstimado(
  recetas: RecetaCosteo[],
  componentes: ComponenteCosteo[],
  p: ParametrosEstimado,
  /**
   * Días de instalación por ítem. Sin esto se usa `p.diasInstalacion`, que es
   * sólo un respaldo: en el Excel los días son POR ÍTEM y se suman, y tenerlos
   * a nivel proyecto hacía que un estimado vacío ya cotizara instalación.
   */
  itemsInstalacion?: ItemInstalacion[],
): ResultadoEstimado {
  const porId = new Map(recetas.map((r) => [r.id, r]))

  // ── 1. cada componente, con la regla madre ────────────────────────────────
  const lineas: LineaCosteada[] = []
  for (const comp of componentes) {
    const r = porId.get(comp.recetaId)
    if (!r) continue
    const tarifa = r.tarifaOverride ?? p.tarifaTaller
    const cogsUnidad = r.costoMaterial + r.horasUnidad * tarifa
    const precioUnidad = conMargen(cogsUnidad, comp.margenOverride ?? r.margen)
    lineas.push({
      id: comp.id,
      itemN: comp.itemN,
      recetaId: r.id,
      receta: r.descripcion,
      grupo: r.grupo,
      cantidad: comp.cantidadTotal,
      cogsUnidad,
      precioUnidad,
      cogs: cogsUnidad * comp.cantidadTotal,
      precio: precioUnidad * comp.cantidadTotal,
      horas: r.horasUnidad * comp.cantidadTotal,
      costoLabor: r.horasUnidad * tarifa * comp.cantidadTotal,
    })
  }

  const sumaItems = lineas.reduce((a, l) => a + l.precio, 0)
  const cogsItems = lineas.reduce((a, l) => a + l.cogs, 0)
  const horasTaller = lineas.reduce((a, l) => a + l.horas, 0)
  const costoLabor = lineas.reduce((a, l) => a + l.costoLabor, 0)

  // El solid surface se muestra en su propio renglón, así que sale del millwork.
  const solidSurface = lineas
    .filter((l) => l.grupo === 'Solid Surface')
    .reduce((a, l) => a + l.precio, 0)

  // ── 2. fees y flete del material estándar ─────────────────────────────────
  // La base es el presupuesto de MATERIAL: el costo sin la mano de obra.
  // (El Excel la arma con la tarifa vieja y por eso cobra de más; acá
  //  sale de la tarifa real, en un solo lugar.)
  const baseFlete = lineas.reduce((a, l) => {
    const r = porId.get(l.recetaId)!
    return r.materialEstandar ? a + r.costoMaterial * l.cantidad : a
  }, 0)
  // Los fees de catálogo se cobran por receta USADA, una vez cada una. Antes se
  // sumaba la columna entera como hace el Excel, y entonces un estimado sin un
  // solo ítem ya arrastraba esos fees.
  const recetasUsadas = new Set(lineas.filter((l) => l.cantidad > 0).map((l) => l.recetaId))
  const feesUsados = [...recetasUsadas]
    .reduce((a, id) => a + (porId.get(id)?.feesExtra ?? 0), 0)
  const extraCogs = feesUsados + p.fleteMaterialPct * baseFlete
  const extraPrecio = conMargen(extraCogs, p.margenFeesMaterial)

  // ── 3. los siete renglones de la propuesta ────────────────────────────────
  const millwork = sumaItems - solidSurface + extraPrecio

  // Los días salen de los ítems: cada uno sigue la regla de la casa de producto
  // por día hasta que el estimador escribe un número a mano. Se calcula ACÁ
  // porque la regla necesita el precio del ítem, que recién ahora se conoce.
  const precioDeItem = new Map<number, number>()
  for (const l of lineas) precioDeItem.set(l.itemN, (precioDeItem.get(l.itemN) ?? 0) + l.precio)

  const diasPorItem = (itemsInstalacion ?? []).map((i) => {
    const sugerido = diasInstalacionSugeridos(
      precioDeItem.get(i.itemN) ?? 0, p.dolaresPorDiaInstalacion)
    return { itemN: i.itemN, dias: i.manual ? i.dias : sugerido, manual: i.manual, sugerido }
  })
  const diasInstalacion = itemsInstalacion
    ? diasPorItem.reduce((a, d) => a + d.dias, 0)
    : p.diasInstalacion

  const instLabor =
    diasInstalacion * p.instaladores * p.tarifaInstalacion * p.horasPorDia
  // En proyecto local sólo se paga el combustible; fuera, per diem, hotel y vuelos.
  const instViaje = p.proyectoLocal ? diasInstalacion * 2 * p.millasIda : 0
  const instOtros = p.punchListDias * p.tarifaInstalacion * p.horasPorDia
  // Sin días no hay instalación: ni mano de obra, ni viaje, ni punch list.
  // No se puede repasar detalles de algo que no se instaló.
  const instalacion = p.instalacionIncluida && diasInstalacion > 0
    ? conMargen(instLabor, p.margenLaborInst) +
      conMargen(instViaje, p.margenViajeInst) +
      conMargen(instOtros, p.margenOtrosInst)
    : 0

  const packaging = conMargen(p.crates * p.costoCrate, p.margenPackaging)
  const entrega = conMargen(
    p.camionBase * p.camionFactor * p.viajesEntrega,
    p.margenEntrega,
  )

  // Un plano de taller por cada ítem que efectivamente se cotiza.
  const itemsConPrecio = new Set(lineas.filter((l) => l.precio > 0).map((l) => l.itemN))
  const planos = conMargen(itemsConPrecio.size * p.costoPlanoTaller, p.margenPlanos)
  const vif = p.vifIncluido ? conMargen(p.viajesVif * p.costoVif, p.margenVif) : 0

  const renglones: RenglonPropuesta[] = [
    { n: 1, concepto: 'Millwork Base Bid', monto: c2(millwork) },
    { n: 2, concepto: 'Millwork & Solid Surface Installation', monto: c2(instalacion) },
    { n: 3, concepto: 'Solid Surface Base Bid', monto: c2(solidSurface) },
    { n: 4, concepto: 'Packaging', monto: c2(packaging) },
    { n: 5, concepto: 'Delivery', monto: c2(entrega) },
    { n: 6, concepto: 'Fabrication Documents', monto: c2(planos) },
    { n: 7, concepto: 'Field Verification', monto: c2(vif) },
  ]
  const total = c2(renglones.reduce((a, r) => a + r.monto, 0))

  const exentos = new Set(p.renglonesSinImpuesto ?? [])
  const baseImponible = renglones
    .filter((r) => !exentos.has(r.n))
    .reduce((a, r) => a + r.monto, 0)
  const salesTax = p.incluirSalesTax && !p.resaleCertificate
    ? c2(baseImponible * p.tasaSalesTax)
    : 0
  const totalConImpuestos = c2(total + salesTax)

  const cogsTotal = c2(
    cogsItems +
      extraCogs +
      (p.instalacionIncluida && diasInstalacion > 0 ? instLabor + instViaje + instOtros : 0) +
      p.crates * p.costoCrate +
      p.camionBase * p.camionFactor * p.viajesEntrega +
      itemsConPrecio.size * p.costoPlanoTaller +
      (p.vifIncluido ? p.viajesVif * p.costoVif : 0),
  )

  // ── 4. por ítem, para el desglose que pide el GC ──────────────────────────
  const porItem = [...new Set(lineas.map((l) => l.itemN))].sort((a, b) => a - b).map((n) => {
    const del = lineas.filter((l) => l.itemN === n)
    return {
      itemN: n,
      precio: c2(del.reduce((a, l) => a + l.precio, 0)),
      cogs: c2(del.reduce((a, l) => a + l.cogs, 0)),
      horas: del.reduce((a, l) => a + l.horas, 0),
    }
  })

  return {
    lineas,
    renglones,
    total,
    salesTax,
    totalConImpuestos,
    cogsTotal,
    margen: total > 0 ? 1 - cogsTotal / total : 0,
    advertencias: [],
    horasTaller,
    presupuestoTaller: c2(costoLabor),
    diasInstalacion,
    instalacionPorItem: diasPorItem,
    dolaresPorDiaInstalacion: p.dolaresPorDiaInstalacion,
    porItem,
  }
}
