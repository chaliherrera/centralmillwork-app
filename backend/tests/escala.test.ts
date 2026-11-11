import { it, expect, beforeAll } from 'vitest'
import pool from '@/db/pool'
import fs from 'fs'
import {
  crearEstimado, crearItem, agregarComponente, getEstimado, getPropuesta,
  buscarRecetas, actualizarItem,
} from '@/modules/estimados/domain/estimados'

// ¿La lógica sirve para cualquier proyecto, o estaba atada al que se usó para
// portarla? El Excel tenía 100 ítems FIJOS de 25 componentes cada uno: un techo.
// Acá son tablas, sin tope — este test lo demuestra en vez de afirmarlo.
// Se saltea solo si la base no tiene el catálogo cargado.
const N_ITEMS = 40
const N_COMPS = 8

let hayCatalogo = false
beforeAll(async () => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM est_recetas')
    hayCatalogo = rows[0].n > 0
  } catch { hayCatalogo = false }
})

it('un proyecto grande: 40 ítems × 8 componentes', async (ctx) => {
  if (!hayCatalogo) return ctx.skip()
  const recetas = (await buscarRecetas({ limite: 60 }))
    .filter((r) => r.precioUnidad && r.precioUnidad > 0).slice(0, N_COMPS)
  expect(recetas.length).toBe(N_COMPS)

  const t0 = Date.now()
  const est = await crearEstimado({ codigo: `ESCALA-${Date.now()}`, nombre: 'Proyecto grande' })
  let esperadoPrecio = 0
  for (let i = 1; i <= N_ITEMS; i++) {
    const item = await crearItem(est.id, { nombre: `Área ${i}`, unidades: 1 })
    await actualizarItem(item.id, {
      descripcion: 'P. Lam. Cabinets with Solid Surface Countertop and 3/4" Plywood Subtop',
      acabados: 'PL-1 Standard Plastic Laminate; White Melamine Interiors; Color TBD by Designer',
      herrajes: 'Richelieu Functional Metal Pull-332; Blum Hinges; Undermount Slides',
      exclusiones: 'Blocking, Baseboards, Specialty Paints & Stains, Electrical Installation, '
        + 'Wiring, Plumbing, Sink and features, Appliances & Equipment, Final Cleaning',
    })
    for (const r of recetas) {
      await agregarComponente(item.id, { recetaId: r.id, cantidad: `${i}*1.5` })
      esperadoPrecio += r.precioUnidad! * i * 1.5
    }
  }
  const alta = Date.now() - t0

  const t1 = Date.now()
  const d = await getEstimado(est.id)
  const lectura = Date.now() - t1

  expect(d.items).toHaveLength(N_ITEMS)
  expect(d.calculo.lineas).toHaveLength(N_ITEMS * N_COMPS)
  // El invariante que importa: el desglose por ítem suma lo mismo que las líneas.
  const porItem = d.calculo.porItem.reduce((a: number, x: any) => a + x.precio, 0)
  const porLinea = d.calculo.lineas.reduce((a: number, l: any) => a + l.precio, 0)
  expect(porItem).toBeCloseTo(porLinea, 1)
  // Y está en el orden de magnitud esperado (el control de mano usa precios ya
  // redondeados a centavos, así que no coincide al peso: alcanza con 0,01%).
  expect(Math.abs(porLinea - esperadoPrecio) / esperadoPrecio).toBeLessThan(0.0001)
  // Y cada fila tiene su propio precio (ninguna quedó sin emparejar).
  expect(d.items.every((it: any) => it.componentes.every((c: any) => c.precio !== null))).toBe(true)

  const pr = await getPropuesta(est.id)
  expect(pr.items).toHaveLength(N_ITEMS)
  expect(pr.renglones).toHaveLength(7)
  const suma = Math.round(pr.renglones.reduce((a, r) => a + r.monto, 0) * 100) / 100
  expect(suma).toBe(pr.total)
  // Los planos de taller se cobran por ítem: 40, no 3.
  expect(pr.renglones.find((r) => r.n === 6)!.monto).toBeGreaterThan(0)

  fs.writeFileSync('/tmp/propuesta_grande.json', JSON.stringify(pr))
  console.log(`ALTA ${N_ITEMS}x${N_COMPS}=${N_ITEMS * N_COMPS} comps: ${alta}ms | LECTURA: ${lectura}ms`)
  console.log(`TOTAL: ${pr.total} | items: ${pr.items.length} | planos: ${pr.renglones.find(r=>r.n===6)!.monto}`)

  await pool.query('DELETE FROM est_estimados WHERE id = $1', [est.id])
}, 120_000)
