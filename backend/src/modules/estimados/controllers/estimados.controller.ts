// ─────────────────────────────────────────────────────────────────────────────
// Controller — Estimados (motor de costeo)
// ─────────────────────────────────────────────────────────────────────────────
import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { createError } from '../../../middleware/errorHandler'
import { evaluarCantidad, ExpresionInvalida } from '../domain/cantidad'
import {
  buscarRecetas, listGrupos, setAliasReceta,
  listEstimados, getEstimado, crearEstimado, actualizarEstimado, duplicarEstimado,
  enviarEstimado, cambiarEstado, queSaldriaHoy,
  crearItem, actualizarItem, borrarItem, copiarItem, itemsParaCopiar,
  sugerirDias, volverALaRegla,
  agregarComponente, actualizarComponente, borrarComponente,
  getParametros, setParametros, listParametrosCatalogo, getPropuesta,
} from '../domain/estimados'

function idDe(req: Request, nombre = 'id'): number {
  const n = parseInt(String(req.params[nombre]), 10)
  if (Number.isNaN(n)) throw createError(`${nombre} inválido`, 400)
  return n
}

/** Una expresión mal escrita es un error del usuario (400), no una falla. */
function manejar(e: unknown, next: NextFunction) {
  if (e instanceof ExpresionInvalida) return next(createError(e.message, 400))
  return next(e)
}

const cantidadSchema = z.union([z.number().nonnegative(), z.string().min(1).max(200)])

// ── catálogo ────────────────────────────────────────────────────────────────

// GET /api/estimados/catalogo/recetas?q=plam+lower&grupo=&unidad=LF
export async function buscarRecetasHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await buscarRecetas({
      q: req.query.q as string | undefined,
      grupo: req.query.grupo as string | undefined,
      unidad: req.query.unidad as string | undefined,
      limite: req.query.limite ? parseInt(String(req.query.limite), 10) : undefined,
    }))
  } catch (e) { next(e) }
}

// GET /api/estimados/catalogo/grupos
export async function gruposHandler(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await listGrupos()) } catch (e) { next(e) }
}

// PUT /api/estimados/catalogo/recetas/:recetaId/alias   { alias }
// El nombre corto para la propuesta, que se pone sobre la marcha.
export async function setAliasHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { alias } = z.object({ alias: z.string().max(80).nullable() }).parse(req.body)
    res.json(await setAliasReceta(idDe(req, 'recetaId'), alias))
  } catch (e) { next(e) }
}

// POST /api/estimados/cantidad/evaluar   { expresion: "(4.17*2*2)+(3.25*2)" }
// Para que el formulario muestre el resultado MIENTRAS se escribe la cuenta.
export async function evaluarCantidadHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { expresion } = z.object({ expresion: z.string().min(1).max(200) }).parse(req.body)
    res.json({ valor: evaluarCantidad(expresion) })
  } catch (e) { manejar(e, next) }
}

// ── estimados ───────────────────────────────────────────────────────────────

// GET /api/estimados?estado=borrador&q=kitchen
export async function listHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await listEstimados({
      estado: req.query.estado as string | undefined,
      q: req.query.q as string | undefined,
    }))
  } catch (e) { next(e) }
}

// GET /api/estimados/:id   — cabecera + ítems + componentes + el cálculo entero
export async function detalleHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getEstimado(idDe(req))) } catch (e) { next(e) }
}

const crearSchema = z.object({
  codigo: z.string().min(1).max(40),
  nombre: z.string().min(1).max(200),
  ubicacion: z.string().max(300).nullish(),
  gc: z.string().max(200).nullish(),
  gcContacto: z.string().max(300).nullish(),
  estimador: z.string().max(120).nullish(),
  proyectoId: z.number().int().positive().nullish(),
  printSetFecha: z.string().max(20).nullish(),
  printSet: z.string().max(300).nullish(),
  gcEmail: z.string().max(200).nullish(),
  gcTelefono: z.string().max(60).nullish(),
  estimadorEmail: z.string().max(200).nullish(),
  estimadorTelefono: z.string().max(60).nullish(),
  estimadorDirecto: z.string().max(60).nullish(),
})

// POST /api/estimados
export async function crearHandler(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await crearEstimado(crearSchema.parse(req.body))) }
  catch (e) { next(e) }
}

// PUT /api/estimados/:id
export async function actualizarHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = crearSchema.partial().omit({ codigo: true })
      .extend({ nota: z.string().max(2000).nullish() }).parse(req.body)
    res.json(await actualizarEstimado(idDe(req), body))
  } catch (e) { next(e) }
}

// POST /api/estimados/:id/duplicar  — el draft siguiente, sin "guardar como"
export async function duplicarHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { estimador } = z.object({ estimador: z.string().max(120).nullish() })
      .parse(req.body ?? {})
    res.status(201).json(await duplicarEstimado(idDe(req), estimador))
  } catch (e) { next(e) }
}

// POST /api/estimados/:id/enviar  — congela precios, tarifa y versión de catálogo
export async function enviarHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await enviarEstimado(idDe(req))) } catch (e) { next(e) }
}

// POST /api/estimados/:id/resultado   { estado: 'aceptado' | 'perdido' }
export async function resultadoHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { estado } = z.object({ estado: z.enum(['aceptado', 'perdido']) }).parse(req.body)
    res.json(await cambiarEstado(idDe(req), estado))
  } catch (e) { next(e) }
}

// GET /api/estimados/:id/que-saldria-hoy  — la deriva contra el catálogo vivo
export async function queSaldriaHoyHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await queSaldriaHoy(idDe(req))) } catch (e) { next(e) }
}

// GET /api/estimados/:id/propuesta
// Todo lo que lleva la hoja que recibe el GC, listo para imprimir: encabezado,
// los 7 renglones con su etiqueta, impuesto, total, el desglose por ítem con sus
// cinco líneas y los Términos y Condiciones vigentes.
export async function propuestaHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getPropuesta(idDe(req))) } catch (e) { next(e) }
}

// ── ítems ───────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  nombre: z.string().min(1).max(200),
  refPlano: z.string().max(120).nullish(),
  unidades: z.number().int().min(0).max(9999).optional(),
  descripcion: z.string().max(2000).nullish(),
  acabados: z.string().max(2000).nullish(),
  herrajes: z.string().max(2000).nullish(),
  exclusiones: z.string().max(2000).nullish(),
  tamanos: z.string().max(2000).nullish(),
})

// POST /api/estimados/:id/items
export async function crearItemHandler(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await crearItem(idDe(req), itemSchema.parse(req.body))) }
  catch (e) { next(e) }
}

// PUT /api/estimados/items/:itemId
export async function actualizarItemHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = itemSchema.partial().extend({
      diasInstalacion: z.number().min(0).max(999).optional(),
      diasInstalacionMotivo: z.string().max(500).nullish(),
      orden: z.number().int().optional(),
    }).parse(req.body)
    res.json(await actualizarItem(idDe(req, 'itemId'), body))
  } catch (e) { next(e) }
}

// DELETE /api/estimados/items/:itemId
export async function borrarItemHandler(req: Request, res: Response, next: NextFunction) {
  try { await borrarItem(idDe(req, 'itemId')); res.status(204).end() } catch (e) { next(e) }
}

// GET /api/estimados/items-para-copiar?q=kitchen
export async function itemsParaCopiarHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await itemsParaCopiar(req.query.q as string | undefined)) } catch (e) { next(e) }
}

// POST /api/estimados/:id/items/copiar   { itemOrigen, nombre? }
export async function copiarItemHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { itemOrigen, nombre } = z.object({
      itemOrigen: z.number().int().positive(),
      nombre: z.string().max(200).optional(),
    }).parse(req.body)
    res.status(201).json(await copiarItem(idDe(req), itemOrigen, nombre))
  } catch (e) { next(e) }
}

// GET /api/estimados/:id/dias-instalacion   — lo que propone la regla vs lo puesto
export async function sugerirDiasHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await sugerirDias(idDe(req))) } catch (e) { next(e) }
}

// POST /api/estimados/items/:itemId/dias-instalacion/regla
// Devuelve el ítem a la regla de la casa por día: deja de estar fijado a mano.
export async function volverALaReglaHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await volverALaRegla(idDe(req, 'itemId'))) } catch (e) { next(e) }
}

// ── componentes ─────────────────────────────────────────────────────────────

const compSchema = z.object({
  recetaId: z.number().int().positive(),
  cantidad: cantidadSchema,
  cantidadPropuesta: z.number().nonnegative().nullish(),
  margenOverride: z.number().min(0).max(0.99).nullish(),
  origenMedida: z.enum(['cota_plano', 'medido', 'bluebeam', 'manual', 'supuesto']).nullish(),
  hojaPlano: z.string().max(120).nullish(),
  referencia: z.string().max(200).nullish(),
  nota: z.string().max(1000).nullish(),
})

// POST /api/estimados/items/:itemId/componentes
export async function agregarComponenteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await agregarComponente(idDe(req, 'itemId'), compSchema.parse(req.body)))
  } catch (e) { manejar(e, next) }
}

// PUT /api/estimados/componentes/:compId
export async function actualizarComponenteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = compSchema.partial().extend({ orden: z.number().int().optional() }).parse(req.body)
    res.json(await actualizarComponente(idDe(req, 'compId'), body))
  } catch (e) { manejar(e, next) }
}

// DELETE /api/estimados/componentes/:compId
export async function borrarComponenteHandler(req: Request, res: Response, next: NextFunction) {
  try { await borrarComponente(idDe(req, 'compId')); res.status(204).end() } catch (e) { next(e) }
}

// ── parámetros ──────────────────────────────────────────────────────────────

// GET /api/estimados/:id/parametros
export async function getParametrosHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getParametros(idDe(req))) } catch (e) { next(e) }
}

// GET /api/estimados/:id/parametros/catalogo
// Las perillas con su etiqueta, unidad y tipo, más el valor de ESTE estimado y
// si fue cambiado respecto del default de la casa. Las que cambian por proyecto
// vienen primero.
export async function catalogoParametrosHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await listParametrosCatalogo(idDe(req))) } catch (e) { next(e) }
}

// PUT /api/estimados/:id/parametros
export async function setParametrosHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z.record(z.string().max(60), z.union([z.string(), z.number(), z.boolean()]))
      .parse(req.body)
    res.json(await setParametros(idDe(req), body))
  } catch (e) { next(e) }
}
