import { describe, it, expect } from 'vitest'
import {
  calcularEstimado,
  diasInstalacionSugeridos,
  type RecetaCosteo,
  type ComponenteCosteo,
  type ParametrosEstimado,
} from '@/modules/estimados/domain/costeo'
import { tamanosSugeridos, etiquetasRenglones } from '@/modules/estimados/domain/estimados'

// Función PURA (no toca DB). Verifica el motor que reemplaza al Excel de estimados.
//
// ⚠ Los números de acá son INVENTADOS y redondos a propósito: este repo es público
//   y ningún costo, margen o tarifa real puede entrar. La verificación contra el
//   proyecto real vive en tools/estimados/, que lee de una
//   carpeta ignorada por git.

const recetas: RecetaCosteo[] = [
  // cogs = 50 + 5×10 = 100 ; precio = 100/(1−0,5) = 200
  { id: 1, descripcion: 'Mueble de prueba', grupo: 'Cajones', margen: 0.5,
    horasUnidad: 5, tarifaOverride: null, costoMaterial: 50, materialEstandar: true, feesExtra: 10 },
  // sin horas ; cogs = 20 ; precio = 40
  { id: 2, descripcion: 'Tope de prueba', grupo: 'Solid Surface', margen: 0.5,
    horasUnidad: 0, tarifaOverride: null, costoMaterial: 20, materialEstandar: false, feesExtra: 0 },
  // tarifa propia: cogs = 0 + 1×20 = 20 (y NO 1×10)
  { id: 3, descripcion: 'Operación con tarifa propia', grupo: 'Cajones', margen: 0.5,
    horasUnidad: 1, tarifaOverride: 20, costoMaterial: 0, materialEstandar: false, feesExtra: 0 },
]

const componentes: ComponenteCosteo[] = [
  { id: 101, itemN: 1, recetaId: 1, cantidadTotal: 2, margenOverride: null },
  { id: 102, itemN: 1, recetaId: 2, cantidadTotal: 5, margenOverride: null },
  // override de margen: 20/(1−0,75) = 80, en vez de 40
  { id: 103, itemN: 2, recetaId: 3, cantidadTotal: 1, margenOverride: 0.75 },
]

const p: ParametrosEstimado = {
  tarifaTaller: 10,
  instalacionIncluida: true, proyectoLocal: true,
  dolaresPorDiaInstalacion: 1_000,
  diasInstalacion: 2, instaladores: 2, horasPorDia: 10, tarifaInstalacion: 10,
  millasIda: 10, punchListDias: 1,
  margenLaborInst: 0.5, margenViajeInst: 0.5, margenOtrosInst: 0.5,
  crates: 1, costoCrate: 100, margenPackaging: 0.5,
  camionBase: 100, camionFactor: 1, viajesEntrega: 1, margenEntrega: 0.5,
  costoPlanoTaller: 50, margenPlanos: 0.5,
  vifIncluido: true, viajesVif: 1, costoVif: 50, margenVif: 0.5,
  fleteMaterialPct: 0.1, margenFeesMaterial: 0.5,
  incluirSalesTax: false, resaleCertificate: false, tasaSalesTax: 0.1,
  renglonesSinImpuesto: [6],
}

/** Lo que vale un estimado sin ninguna línea: sólo los calculadores con default. */
function conMargenDeProyecto(par: ParametrosEstimado): number {
  const r = calcularEstimado([], [], par, [])
  return r.total
}

describe('calcularEstimado — la regla madre', () => {
  const r = calcularEstimado(recetas, componentes, p)

  it('el margen se aplica como divisor, no como recargo', () => {
    // Con m=0,5: 100/(1−0,5) = 200. Con recargo (100×1,5) daría 150, que es otro número.
    const l = r.lineas.find((x) => x.recetaId === 1)!
    expect(l.cogsUnidad).toBe(100)
    expect(l.precioUnidad).toBe(200)
    // y el margen que sale es el que se pidió, no otro
    expect(1 - l.cogs / l.precio).toBeCloseTo(0.5, 10)
  })

  it('la mano de obra está DENTRO del costo de la receta', () => {
    const l = r.lineas.find((x) => x.recetaId === 1)!
    expect(l.cogsUnidad).toBe(50 + 5 * p.tarifaTaller)
  })

  it('una receta con tarifa propia ignora la tarifa de taller', () => {
    const l = r.lineas.find((x) => x.recetaId === 3)!
    expect(l.cogsUnidad).toBe(20) // 1 hr × 20, no × 10
  })

  it('el override de margen pisa al del grupo', () => {
    const l = r.lineas.find((x) => x.recetaId === 3)!
    expect(l.precioUnidad).toBe(80) // 20/(1−0,75)
  })

  it('las horas de taller se acumulan para Producción', () => {
    expect(r.horasTaller).toBe(11) // 5 hr × 2 unidades + 1 hr de la receta 3
  })

  it('el presupuesto de taller respeta la tarifa propia de cada receta', () => {
    // 10 hr a $10 = 100, más 1 hr a $20 = 20. NO es 11 × $10.
    expect(r.presupuestoTaller).toBe(120)
  })
})

describe('calcularEstimado — los siete renglones', () => {
  const r = calcularEstimado(recetas, componentes, p)
  const monto = (n: number) => r.renglones.find((x) => x.n === n)!.monto

  it('el solid surface sale del millwork y va a su propio renglón', () => {
    expect(monto(3)).toBe(200) // 5 × 40
    // millwork = (400 + 200 + 80) − 200 + 40 de fees = 520
    expect(monto(1)).toBe(520)
  })

  it('el flete de material se calcula sólo sobre el material estándar', () => {
    // base = costoMaterial 50 × 2 unidades = 100 ; 10% = 10 ; + fees 10 = 20
    // precio = 20/(1−0,5) = 40, que ya está sumado dentro del millwork
    const sinEstandar = calcularEstimado(
      recetas.map((x) => ({ ...x, materialEstandar: false })), componentes, p)
    expect(sinEstandar.renglones.find((x) => x.n === 1)!.monto).toBe(500) // 520 − 20
  })

  it('instalación: mano de obra, viaje y punch list, cada uno con su margen', () => {
    // labor 2×2×10×10 = 400 → 800 ; viaje 2×2×10 = 40 → 80 ; punch 1×10×10 = 100 → 200
    expect(monto(2)).toBe(1080)
  })

  it('un proyecto fuera de la zona no paga combustible por día', () => {
    const fuera = calcularEstimado(recetas, componentes, { ...p, proyectoLocal: false })
    expect(fuera.renglones.find((x) => x.n === 2)!.monto).toBe(1000) // 1080 − 80
  })

  it('sin instalación incluida, el renglón 2 es cero', () => {
    const sin = calcularEstimado(recetas, componentes, { ...p, instalacionIncluida: false })
    expect(sin.renglones.find((x) => x.n === 2)!.monto).toBe(0)
  })

  it('un plano de taller por ítem que efectivamente se cotiza', () => {
    expect(monto(6)).toBe(200) // 2 ítems × 50 / (1−0,5)
  })

  it('sin VIF, el renglón 7 es cero', () => {
    const sin = calcularEstimado(recetas, componentes, { ...p, vifIncluido: false })
    expect(sin.renglones.find((x) => x.n === 7)!.monto).toBe(0)
  })

  it('el total es la suma de los siete y el margen cierra', () => {
    expect(r.total).toBe(2500)
    expect(r.cogsTotal).toBe(1230)
    expect(r.margen).toBeCloseTo(0.508, 10)
  })
})

describe('los fees de catálogo se cobran por receta USADA', () => {
  // Antes se sumaba la columna entera como hace el Excel, así que un estimado
  // sin un solo ítem ya arrastraba esos fees.
  it('un estimado sin líneas no arrastra fees', () => {
    const r = calcularEstimado(recetas, [], p, [])
    expect(r.renglones.find((x) => x.n === 1)!.monto).toBe(0)
    expect(r.total).toBe(conMargenDeProyecto(p))
  })

  it('una receta con fees los cobra UNA vez, aunque vaya en dos líneas', () => {
    const unaVez = calcularEstimado(recetas, [
      { id: 1, itemN: 1, recetaId: 1, cantidadTotal: 1, margenOverride: null },
    ], p, [])
    const dosVeces = calcularEstimado(recetas, [
      { id: 1, itemN: 1, recetaId: 1, cantidadTotal: 1, margenOverride: null },
      { id: 2, itemN: 1, recetaId: 1, cantidadTotal: 1, margenOverride: null },
    ], p, [])
    // la segunda línea suma su precio (200) y su flete, pero NO otro fee de 10
    const fee = 10 / (1 - p.margenFeesMaterial)
    expect(dosVeces.renglones.find((x) => x.n === 1)!.monto -
           unaVez.renglones.find((x) => x.n === 1)!.monto).toBeCloseTo(200 + 0.1 * 50 / 0.5, 5)
    expect(fee).toBe(20)   // el fee existe, pero se cobró una sola vez
  })
})

describe('sales tax', () => {
  it('un proyecto no gravado no paga impuesto', () => {
    const r = calcularEstimado(recetas, componentes, p)
    expect(r.salesTax).toBe(0)
    expect(r.totalConImpuestos).toBe(r.total)
  })

  it('con resale certificate no se cobra, aunque el proyecto sea gravado', () => {
    const r = calcularEstimado(recetas, componentes,
      { ...p, incluirSalesTax: true, resaleCertificate: true })
    expect(r.salesTax).toBe(0)
    expect(r.totalConImpuestos).toBe(r.total)
  })

  it('el impuesto NO se cobra sobre los Fabrication Documents', () => {
    // Regla real, sacada de una propuesta emitida: el renglón 6 es un servicio.
    // Total 2500, renglón 6 = 200 → base 2300 → 10% = 230.
    const r = calcularEstimado(recetas, componentes, { ...p, incluirSalesTax: true })
    expect(r.total).toBe(2500)
    expect(r.salesTax).toBe(230)
    expect(r.totalConImpuestos).toBe(2730)
  })

  it('sin renglones exentos, el impuesto cae sobre todo', () => {
    const r = calcularEstimado(recetas, componentes,
      { ...p, incluirSalesTax: true, renglonesSinImpuesto: [] })
    expect(r.salesTax).toBe(250)
  })
})

describe('calcularEstimado — desglose por ítem', () => {
  it('reparte precio, costo y horas por ítem', () => {
    const r = calcularEstimado(recetas, componentes, p)
    expect(r.porItem).toEqual([
      { itemN: 1, precio: 600, cogs: 300, horas: 10 }, // 400 + 200
      { itemN: 2, precio: 80, cogs: 20, horas: 1 },
    ])
  })
})

describe('la propuesta que recibe el GC', () => {
  it('arma el "Approx. Size" desde los componentes dimensionales', () => {
    // El herraje (EA) no describe un tamaño; LF y SF sí.
    expect(tamanosSugeridos([
      { alias: 'Lower Cabinets', receta: 'Melamine Interior + Plam Doors', unidad: 'LF', cantidad: 7.3 },
      { alias: 'Countertop', receta: 'Quartz', unidad: 'SF', cantidad: 19.24 },
      { alias: null, receta: 'Richelieu Pull', unidad: 'EA', cantidad: 6 },
    ])).toBe('Lower Cabinets=7.3 LF; Countertop=19.24 SF')
  })

  it('usa el nombre largo si la receta no tiene alias', () => {
    expect(tamanosSugeridos([
      { alias: null, receta: 'P. Lam Shelf', unidad: 'LF', cantidad: 40 },
    ])).toBe('P. Lam Shelf=40 LF')
  })

  it('muestra la cantidad de la PROPUESTA cuando difiere de la de costeo', () => {
    // Decisión de Chali: al GC se le muestran los pies de CORRIDA. Una línea de
    // estantes se cotiza por los pies de estante (11,59 de corrida × 2 = 23,18)
    // y en la hoja va la corrida. El precio no cambia; cambia la descripción.
    expect(tamanosSugeridos([
      { alias: 'Shelves', receta: 'P. Lam Shelf', unidad: 'LF',
        cantidad: 23.18, cantidadPropuesta: 11.59 },
    ])).toBe('Shelves=11.59 LF')
  })

  it('sin cantidad de propuesta usa la de costeo', () => {
    expect(tamanosSugeridos([
      { alias: 'Lower Cabinets', receta: 'x', unidad: 'LF', cantidad: 4.17, cantidadPropuesta: null },
    ])).toBe('Lower Cabinets=4.17 LF')
  })

  it('sin componentes dimensionales no inventa nada', () => {
    expect(tamanosSugeridos([
      { alias: null, receta: 'Pull', unidad: 'EA', cantidad: 6 },
    ])).toBeNull()
  })

  it('las etiquetas cambian según lo que tenga el estimado', () => {
    const conPiedra = etiquetasRenglones({
      haySolidSurface: false, hayStone: true, viajesEntrega: 1, viajesVif: 1 })
    expect(conPiedra[2]).toBe('Millwork & Stone Installation')
    expect(conPiedra[3]).toBe('Stone Base Bid')

    const soloMillwork = etiquetasRenglones({
      haySolidSurface: false, hayStone: false, viajesEntrega: 2, viajesVif: 1 })
    expect(soloMillwork[2]).toBe('Millwork Installation')
    expect(soloMillwork[5]).toBe('Delivery -Trips Included (2)')
  })
})

describe('los días de instalación salen de los ÍTEMS', () => {
  // Antes vivían en un parámetro del proyecto y editar el ítem no hacía nada.
  // Peor: el default de la casa había quedado en 2,5, así que un estimado vacío
  // ya cotizaba instalación. Ahora se suman los ítems y arrancan en cero.
  it('sin ítems no hay instalación que cobrar', () => {
    const r = calcularEstimado(recetas, [], { ...p, instalacionIncluida: true }, [])
    expect(r.diasInstalacion).toBe(0)
    expect(r.renglones.find((x) => x.n === 2)!.monto).toBe(0)
  })

  it('cada ítem sigue la regla de la casa de producto por día', () => {
    // ítem 1 = 600 de producto, ítem 2 = 80, regla = 1.000 por día
    // → 0,6 + 0,08 = 0,68 días
    const r = calcularEstimado(recetas, componentes, p, [
      { itemN: 1, dias: 0, manual: false },
      { itemN: 2, dias: 0, manual: false },
    ])
    expect(r.instalacionPorItem.find((x) => x.itemN === 1)!.sugerido).toBe(0.6)
    expect(r.diasInstalacion).toBeCloseTo(0.68, 5)
  })

  it('sin la regla cargada no propone días, en vez de inventarlos', () => {
    // La perilla es requerida: si no está, el estimado AVISA. Lo que no puede
    // hacer es dividir por cero y cotizar instalación con un número inventado.
    const r = calcularEstimado(recetas, componentes,
      { ...p, dolaresPorDiaInstalacion: 0 }, [{ itemN: 1, dias: 0, manual: false }])
    expect(r.instalacionPorItem[0].sugerido).toBe(0)
    expect(r.diasInstalacion).toBe(0)
    expect(r.renglones.find((x) => x.n === 2)!.monto).toBe(0)
  })

  it('un ítem fijado a mano manda sobre la regla, y queda marcado', () => {
    const r = calcularEstimado(recetas, componentes, p, [
      { itemN: 1, dias: 3, manual: true },
      { itemN: 2, dias: 0, manual: false },
    ])
    const i1 = r.instalacionPorItem.find((x) => x.itemN === 1)!
    expect(i1.dias).toBe(3)            // lo que puso la persona
    expect(i1.sugerido).toBe(0.6)      // lo que decía la regla
    expect(i1.manual).toBe(true)       // y que hubo una decisión
    expect(r.diasInstalacion).toBeCloseTo(3.08, 5)
  })

  it('los días mueven la mano de obra Y el combustible del viaje', () => {
    const a = calcularEstimado(recetas, componentes, p, [{ itemN: 1, dias: 1, manual: true }])
    const b = calcularEstimado(recetas, componentes, p, [{ itemN: 1, dias: 2, manual: true }])
    // labor: 1 día × 2 × 10 × $10 = 200 → /(1−0,5) = 400 más
    // viaje: 1 día × 2 × 10 millas = 20 → /(1−0,5) = 40 más
    expect(b.renglones.find((x) => x.n === 2)!.monto -
           a.renglones.find((x) => x.n === 2)!.monto).toBe(440)
  })

  it('sin pasar los ítems usa el parámetro del proyecto (respaldo)', () => {
    const r = calcularEstimado(recetas, componentes, p)
    expect(r.diasInstalacion).toBe(p.diasInstalacion)
  })
})

describe('diasInstalacionSugeridos', () => {
  it('divide el producto por el monto de la regla', () => {
    expect(diasInstalacionSugeridos(2_000, 1_000)).toBe(2)
    expect(diasInstalacionSugeridos(0, 1_000)).toBe(0)
  })

  it('la regla redondea a dos decimales', () => {
    // El estimador puede pisar lo que propone la regla; se guardan los dos
    // números para que el override quede visible.
    expect(diasInstalacionSugeridos(1_900, 1_000)).toBe(1.9)
  })

  it('sin monto cargado devuelve 0, no infinito', () => {
    expect(diasInstalacionSugeridos(2_000, 0)).toBe(0)
  })
})

describe('la misma receta dos veces en el mismo ítem', () => {
  // El bug que encontró Fable: si la línea se identifica por (ítem, receta), dos
  // paredes con la misma receta y medidas distintas muestran las dos el precio de
  // la primera. El total queda bien; la fila miente. Se identifica por id.
  it('cada fila tiene su propio precio', () => {
    const r = calcularEstimado(recetas, [
      { id: 201, itemN: 1, recetaId: 1, cantidadTotal: 2, margenOverride: null },
      { id: 202, itemN: 1, recetaId: 1, cantidadTotal: 7, margenOverride: null },
    ], p)
    expect(r.lineas).toHaveLength(2)
    expect(r.lineas.find((l) => l.id === 201)!.precio).toBe(400)   // 2 × 200
    expect(r.lineas.find((l) => l.id === 202)!.precio).toBe(1400)  // 7 × 200
    expect(r.porItem[0].precio).toBe(1800)
  })
})

describe('casos borde', () => {
  it('una receta sin grupo no se puede cotizar y vale 0', () => {
    const r = calcularEstimado(
      [{ ...recetas[0], margen: null, grupo: null }],
      [{ id: 1, itemN: 1, recetaId: 1, cantidadTotal: 1, margenOverride: null }],
      p)
    expect(r.lineas[0].precioUnidad).toBe(0)
  })

  it('un componente que apunta a una receta inexistente se ignora', () => {
    const r = calcularEstimado(recetas,
      [...componentes, { id: 999, itemN: 9, recetaId: 999, cantidadTotal: 5, margenOverride: null }], p)
    expect(r.lineas).toHaveLength(3)
    expect(r.total).toBe(2500)
  })

  it('un ítem removido del alcance (cantidad 0) no suma ni pide plano de taller', () => {
    const r = calcularEstimado(recetas,
      [...componentes, { id: 104, itemN: 3, recetaId: 1, cantidadTotal: 0, margenOverride: null }], p)
    expect(r.total).toBe(2500)
    expect(r.renglones.find((x) => x.n === 6)!.monto).toBe(200) // sigue siendo 2 ítems
  })
})
