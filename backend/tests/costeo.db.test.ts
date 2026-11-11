import { describe, it, expect, beforeAll } from 'vitest'
import pool from '@/db/pool'
import { calcularEstimadoDesdeDB } from '@/modules/estimados/domain/repo'
import {
  buscarRecetas, crearEstimado, crearItem, agregarComponente, getEstimado,
  duplicarEstimado, enviarEstimado, queSaldriaHoy, copiarItem, sugerirDias,
  listParametrosCatalogo, getPropuesta, setParametros, getParametros,
} from '@/modules/estimados/domain/estimados'

// ─────────────────────────────────────────────────────────────────────────────
// Tests del módulo de Estimados CONTRA POSTGRES.
//
// Usan la DB de tests de siempre (TEST_DATABASE_URL, que tests/setup.ts inyecta
// en DATABASE_URL). Se SALTEAN solas si esa base no tiene el catálogo cargado,
// así que `npm test` no se rompe en una máquina sin datos.
//
// Para correrlas hay que cargar el catálogo. Los datos reales no están en el
// repo —es público y no puede llevar costos— así que se cargan con las
// herramientas de tools/estimados/, que leen de una carpeta ignorada por git:
//
//   psql -d cm_test -f database/migrations/102_estimados_catalogo.sql
//   psql -d cm_test -f database/migrations/103_estimados_estimado.sql
//   python3 tools/estimados/extraer.py "<estimado>.xlsx"
//   python3 tools/estimados/extraer_maestro.py "<Pricing>.xlsx"
//   python3 tools/estimados/cargar.py "<dsn>" --solo-directo
//
// El total esperado se pasa por env a propósito: así el monto cotizado a un
// cliente con nombre no queda escrito en un repo público.
//
//   ESTIMADOS_TEST_TOTAL=<el total esperado> npx vitest run tests/costeo.db.test.ts
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL = process.env.ESTIMADOS_TEST_TOTAL
const HORAS = process.env.ESTIMADOS_TEST_HORAS

let hayCatalogo = false
let estimadoBase: number | null = null

beforeAll(async () => {
  try {
    const { rows } = await pool.query(
      `SELECT (SELECT COUNT(*) FROM est_recetas)::int AS recetas,
              (SELECT id FROM est_estimados ORDER BY id LIMIT 1) AS estimado`)
    hayCatalogo = rows[0].recetas > 0
    estimadoBase = rows[0].estimado ?? null
  } catch {
    hayCatalogo = false  // las tablas no existen todavía: nada que probar
  }
})

describe('motor de costeo contra la base', () => {
  it('reproduce el estimado portado del Excel', async (ctx) => {
    if (!hayCatalogo || !estimadoBase) return ctx.skip()
    const r = await calcularEstimadoDesdeDB(pool, estimadoBase)

    // Los siete renglones tienen que sumar el total: una propuesta no puede
    // mostrar números que no cierran.
    expect(r.renglones).toHaveLength(7)
    const suma = Math.round(r.renglones.reduce((a, x) => a + x.monto, 0) * 100) / 100
    expect(suma).toBe(r.total)

    // Margen en rango de millwork, no en cualquier lado.
    expect(r.margen).toBeGreaterThan(0.3)
    expect(r.margen).toBeLessThan(0.6)

    // Las horas tienen que llegar al resultado: es lo que consume Producción.
    expect(r.horasTaller).toBeGreaterThan(0)
    expect(r.presupuestoTaller).toBeGreaterThan(0)

    if (TOTAL) expect(r.total).toBe(Number(TOTAL))
    if (HORAS) expect(r.horasTaller).toBeCloseTo(Number(HORAS), 2)
  })

  it('el desglose por ítem suma lo mismo que las líneas', async (ctx) => {
    if (!hayCatalogo || !estimadoBase) return ctx.skip()
    const r = await calcularEstimadoDesdeDB(pool, estimadoBase)
    const porItem = r.porItem.reduce((a, x) => a + x.precio, 0)
    const porLinea = r.lineas.reduce((a, l) => a + l.precio, 0)
    expect(porItem).toBeCloseTo(porLinea, 1)
  })
})

describe('la propuesta que recibe el GC', () => {
  it('se arma entera, con sus 7 renglones etiquetados y los T&C vigentes', async (ctx) => {
    if (!hayCatalogo || !estimadoBase) return ctx.skip()
    const pr = await getPropuesta(estimadoBase)

    expect(pr.renglones).toHaveLength(7)
    expect(pr.renglones.every((r) => r.etiqueta && r.etiqueta.length > 3)).toBe(true)
    expect(pr.renglones[0].etiqueta).toBe('Millwork Base Bid')
    // La suma de los renglones es el total sin impuestos.
    const suma = Math.round(pr.renglones.reduce((a, r) => a + r.monto, 0) * 100) / 100
    expect(suma).toBe(pr.total)
    expect(pr.totalConImpuestos).toBe(Math.round((pr.total + pr.salesTax) * 100) / 100)

    // El encabezado trae lo que va impreso arriba de la hoja.
    expect(pr.encabezado.proyecto.codigo).toBeTruthy()
    expect(pr.encabezado.draft).toBeGreaterThan(0)

    // Cada ítem con sus cinco líneas; las cantidades ya no se tipean.
    expect(pr.items.length).toBeGreaterThan(0)
    expect(pr.items[0].titulo).toMatch(/^Item \d+ \| .+ \|\d+ Unit/)
    expect(pr.items[0].tamanos).toBeTruthy()
    expect(pr.items[0].tamanos).toMatch(/=[\d.]+ (LF|SF)/)

    // Y los Términos y Condiciones con su versión.
    expect(pr.terminos).not.toBeNull()
    expect(pr.terminos!.version).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    expect((pr.terminos!.contenido ?? '').length).toBeGreaterThan(1000)
  })

  it('el impuesto NO se cobra sobre los Fabrication Documents', async (ctx) => {
    if (!hayCatalogo || !estimadoBase) return ctx.skip()
    const antes = await getParametros(estimadoBase)
    try {
      // Con certificado no se cobra, aunque el proyecto sea gravado.
      await setParametros(estimadoBase,
        { incluir_sales_tax: 'YES', resale_certificate: 'YES' })
      const conCert = await getPropuesta(estimadoBase)
      expect(conCert.salesTax).toBe(0)
      expect(conCert.leyendaImpuesto).toBe('RESALE TAX PROVIDED')

      // Sin certificado sí — y la base excluye el renglón 6 (Fabrication
      // Documents): es la regla que salió de una propuesta ya emitida.
      await setParametros(estimadoBase, { resale_certificate: 'NO' })
      const conTax = await getPropuesta(estimadoBase)
      const tasa = Number(antes.tasa_sales_tax)
      const base = conTax.renglones.filter((r) => r.n !== 6)
        .reduce((a, r) => a + r.monto, 0)
      expect(conTax.salesTax).toBeCloseTo(base * tasa, 1)
      expect(conTax.salesTax).toBeLessThan(conTax.total * tasa)
      expect(conTax.leyendaImpuesto).toBeNull()
      expect(conTax.totalConImpuestos).toBeGreaterThan(conTax.total)
    } finally {
      // Dejar el estimado como estaba: si no, la próxima corrida arranca sucia.
      await setParametros(estimadoBase, {
        incluir_sales_tax: antes.incluir_sales_tax ?? 'NO',
        resale_certificate: antes.resale_certificate ?? 'YES',
      })
    }
  })
})

describe('armar un estimado: el camino que recorre el estimador', () => {
  it('buscar una receta por palabras sueltas, sin saber el nombre completo', async (ctx) => {
    if (!hayCatalogo) return ctx.skip()
    const todas = await buscarRecetas({ limite: 5 })
    expect(todas.length).toBeGreaterThan(0)

    // Las palabras de un nombre real, en orden distinto, tienen que encontrarlo.
    const palabras = todas[0].descripcion.toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3)
    if (palabras.length >= 2) {
      const r = await buscarRecetas({ q: `${palabras[1]} ${palabras[0]}` })
      expect(r.some((x) => x.id === todas[0].id)).toBe(true)
    }
  })

  it('crear, cargar un componente con la cuenta escrita, y ver el precio', async (ctx) => {
    if (!hayCatalogo) return ctx.skip()
    const receta = (await buscarRecetas({ limite: 50 }))
      .find((r) => r.precioUnidad && r.precioUnidad > 0)
    if (!receta) return ctx.skip()

    const codigo = `TEST-${Date.now()}`
    const est = await crearEstimado({ codigo, nombre: 'Estimado de prueba' })
    const item = await crearItem(est.id, { nombre: 'Ítem de prueba', unidades: 2 })

    // La cantidad se escribe como se piensa, no como un número suelto.
    await agregarComponente(item.id, { recetaId: receta.id, cantidad: '(2*3)+1' })

    const detalle = await getEstimado(est.id)
    const comp = detalle.items[0].componentes[0]
    expect(comp.cantidadUnidad).toBe(7)
    expect(comp.cantidadExpr).toBe('(2*3)+1')          // queda el razonamiento
    expect(comp.precioUnidad).toBeCloseTo(receta.precioUnidad!, 2)
    // 7 por unidad × 2 unidades del ítem
    expect(comp.precio).toBeCloseTo(receta.precioUnidad! * 14, 1)
    expect(detalle.calculo.total).toBeGreaterThan(0)

    // Copiar el ítem a otro estimado: el atajo que ahorra volver a elegir todo.
    const otro = await crearEstimado({ codigo: `${codigo}-B`, nombre: 'Copia' })
    const copiado = await copiarItem(otro.id, item.id)
    const detalleB = await getEstimado(otro.id)
    expect(detalleB.items[0].componentes).toHaveLength(1)
    expect(detalleB.items[0].componentes[0].cantidadExpr).toBe('(2*3)+1')
    expect(copiado.unidades).toBe(2)

    // Los días se proponen con la regla de la casa. El monto se lee de la
    // perilla (migración 114): no está escrito acá, y puede cambiar.
    const { rows: regla } = await pool.query(
      `SELECT valor FROM est_parametros_default
        WHERE clave = 'dolares_por_dia_instalacion'`)
    const porDia = Number(regla[0]?.valor ?? 0)
    const dias = await sugerirDias(est.id)
    const producto = dias.items.reduce((a, i) => a + i.precio, 0)
    const sugerido = dias.items.reduce((a, i) => a + i.sugerido, 0)
    if (porDia > 0) expect(sugerido).toBeCloseTo(producto / porDia, 1)
    else expect(sugerido).toBe(0)

    await pool.query(`DELETE FROM est_estimados WHERE id = ANY($1)`, [[est.id, otro.id]])
  })

  it('un estimado NUEVO nace con los 7 calculadores, no sólo con el mueble', async (ctx) => {
    // El bug que destapó Fable: crearEstimado no cargaba parámetros y el motor
    // usa 0 por default, así que un estimado armado desde cero daba cero en
    // instalación, embalaje, flete, planos y verificación — el 36% del precio.
    if (!hayCatalogo) return ctx.skip()
    const receta = (await buscarRecetas({ limite: 50 }))
      .find((r) => r.precioUnidad && r.precioUnidad > 0)
    if (!receta) return ctx.skip()

    const est = await crearEstimado({ codigo: `TEST-PAR-${Date.now()}`, nombre: 'Parámetros' })
    const item = await crearItem(est.id, { nombre: 'Ítem', unidades: 1 })
    await agregarComponente(item.id, { recetaId: receta.id, cantidad: 10 })

    const d = await getEstimado(est.id)
    const monto = (n: number) => d.calculo.renglones.find((x) => x.n === n)!.monto

    // Ninguna perilla requerida sin valor.
    expect(d.calculo.advertencias).toEqual([])
    // Y los calculadores cotizan de verdad.
    expect(monto(2)).toBeGreaterThan(0)   // instalación
    expect(monto(4)).toBeGreaterThan(0)   // embalaje
    expect(monto(5)).toBeGreaterThan(0)   // entrega
    expect(monto(6)).toBeGreaterThan(0)   // planos de taller
    expect(monto(7)).toBeGreaterThan(0)   // verificación en obra
    // El mueble solo no puede ser el total.
    expect(d.calculo.total).toBeGreaterThan(monto(1) + monto(3))

    // El catálogo de perillas llega con etiqueta y tipo para la pantalla.
    const perillas = await listParametrosCatalogo(est.id)
    expect(perillas.length).toBeGreaterThan(20)
    expect(perillas[0].porProyecto).toBe(true)        // las que cambian, primero
    expect(perillas.every((x) => x.etiqueta && x.tipo)).toBe(true)

    await pool.query(`DELETE FROM est_estimados WHERE id = $1`, [est.id])
  })

  it('la misma receta dos veces en un ítem: cada fila con su precio', async (ctx) => {
    if (!hayCatalogo) return ctx.skip()
    const receta = (await buscarRecetas({ limite: 50 }))
      .find((r) => r.precioUnidad && r.precioUnidad > 0)
    if (!receta) return ctx.skip()

    const est = await crearEstimado({ codigo: `TEST-DUP-${Date.now()}`, nombre: 'Dup' })
    const item = await crearItem(est.id, { nombre: 'Dos paredes', unidades: 1 })
    await agregarComponente(item.id, { recetaId: receta.id, cantidad: '2*1' })
    await agregarComponente(item.id, { recetaId: receta.id, cantidad: '7' })

    const d = await getEstimado(est.id)
    const [a, b] = d.items[0].componentes
    expect(a.cantidadUnidad).toBe(2)
    expect(b.cantidadUnidad).toBe(7)
    expect(a.precio).not.toBe(b.precio)                      // el bug era que sí
    expect(b.precio).toBeCloseTo(a.precio! * 3.5, 1)

    await pool.query(`DELETE FROM est_estimados WHERE id = $1`, [est.id])
  })

  it('un estimado enviado se congela y deja de seguir al catálogo', async (ctx) => {
    if (!hayCatalogo) return ctx.skip()
    const receta = (await buscarRecetas({ limite: 50 }))
      .find((r) => r.precioUnidad && r.precioUnidad > 0)
    if (!receta) return ctx.skip()

    const codigo = `TEST-CONG-${Date.now()}`
    const est = await crearEstimado({ codigo, nombre: 'Congelado de prueba' })
    const item = await crearItem(est.id, { nombre: 'Ítem', unidades: 1 })
    await agregarComponente(item.id, { recetaId: receta.id, cantidad: 10 })

    const enviado = await enviarEstimado(est.id)
    expect(enviado.total).toBeGreaterThan(0)

    // Ya no se puede editar: hay un precio prometido.
    await expect(crearItem(est.id, { nombre: 'Otro' })).rejects.toThrow(/no se puede editar/)

    // Duplicar sí: el draft siguiente nace editable y con el catálogo vigente.
    const dup = await duplicarEstimado(est.id)
    expect(dup.estado).toBe('borrador')
    expect(dup.draft).toBe(est.draft + 1)
    const detalleDup = await getEstimado(dup.id)
    expect(detalleDup.items[0].componentes).toHaveLength(1)

    // Y "¿qué saldría hoy?" compara sin tocar el original.
    const hoy = await queSaldriaHoy(est.id)
    expect(hoy.totalCongelado).toBe(enviado.total)
    expect(hoy.diferencia).toBe(0)   // nada cambió todavía en el catálogo

    await pool.query(`DELETE FROM est_estimados WHERE id = ANY($1)`, [[est.id, dup.id]])
  })
})
