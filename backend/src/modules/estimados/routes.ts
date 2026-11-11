import { Router } from 'express'
import { requireRole } from '../../middleware/auth'
import {
  buscarRecetasHandler, gruposHandler, evaluarCantidadHandler, setAliasHandler,
  listHandler, detalleHandler, crearHandler, actualizarHandler, duplicarHandler,
  enviarHandler, resultadoHandler, queSaldriaHoyHandler,
  crearItemHandler, actualizarItemHandler, borrarItemHandler,
  itemsParaCopiarHandler, copiarItemHandler,
  sugerirDiasHandler, volverALaReglaHandler,
  agregarComponenteHandler, actualizarComponenteHandler, borrarComponenteHandler,
  getParametrosHandler, setParametrosHandler, catalogoParametrosHandler,
  propuestaHandler,
} from './controllers/estimados.controller'

const router = Router()

// El estimado es del front del deal: lo arma Estimados. El PM y Admin lo ven
// porque de ahí salen las horas de taller y el presupuesto de material que
// después consumen Ingeniería y Compras.
const ARMA = requireRole('ADMIN', 'ESTIMADOS')
const VE = requireRole('ADMIN', 'ESTIMADOS', 'PROJECT_MANAGEMENT', 'ENGINEERING', 'VIEWER')

// ── catálogo ────────────────────────────────────────────────────────────────
// Son ~150 recetas con nombres largos y parecidos: la búsqueda por palabras
// sueltas es lo que hace que elegir sea rápido ("plam lower" alcanza).
router.get('/catalogo/recetas', VE, buscarRecetasHandler)
router.get('/catalogo/grupos', VE, gruposHandler)
// El nombre corto de la receta se pone a medida que se usa, desde la grilla.
router.put('/catalogo/recetas/:recetaId/alias', ARMA, setAliasHandler)

// Evalúa la cuenta que escribe el estimador —(4.17*2*2)+(3.25*2)— para mostrarle
// el resultado mientras la escribe, sin que tenga que sacar la calculadora.
router.post('/cantidad/evaluar', ARMA, evaluarCantidadHandler)

// ── ítems reutilizables ─────────────────────────────────────────────────────
// Antes de /:id para que "items-para-copiar" no se coma como un id.
router.get('/items-para-copiar', VE, itemsParaCopiarHandler)

// ── ítems y componentes (por su propio id) ──────────────────────────────────
router.put('/items/:itemId', ARMA, actualizarItemHandler)
router.delete('/items/:itemId', ARMA, borrarItemHandler)
router.post('/items/:itemId/componentes', ARMA, agregarComponenteHandler)
router.put('/componentes/:compId', ARMA, actualizarComponenteHandler)
router.delete('/componentes/:compId', ARMA, borrarComponenteHandler)

// ── estimados ───────────────────────────────────────────────────────────────
router.get('/', VE, listHandler)
router.post('/', ARMA, crearHandler)
router.get('/:id', VE, detalleHandler)
router.put('/:id', ARMA, actualizarHandler)

// El draft siguiente nace del anterior, apuntando al catálogo vigente.
router.post('/:id/duplicar', ARMA, duplicarHandler)
// Enviar CONGELA: precios, tarifa y versión de catálogo quedan clavados.
router.post('/:id/enviar', ARMA, enviarHandler)
router.post('/:id/resultado', ARMA, resultadoHandler)
// La pregunta que hoy no se puede contestar: ¿cuánto saldría este estimado hoy?
router.get('/:id/que-saldria-hoy', VE, queSaldriaHoyHandler)
// La hoja que recibe el GC, armada: lo que después imprime el PDF.
router.get('/:id/propuesta', VE, propuestaHandler)

router.post('/:id/items', ARMA, crearItemHandler)
router.post('/:id/items/copiar', ARMA, copiarItemHandler)

// La regla de "tanto producto por día" propone; el estimador decide.
router.get('/:id/dias-instalacion', VE, sugerirDiasHandler)
router.post('/items/:itemId/dias-instalacion/regla', ARMA, volverALaReglaHandler)

router.get('/:id/parametros', VE, getParametrosHandler)
// Las perillas con etiqueta/unidad/tipo: lo que necesita la pantalla para
// mostrarlas como campos con nombre y no como 29 cajas de texto.
router.get('/:id/parametros/catalogo', VE, catalogoParametrosHandler)
router.put('/:id/parametros', ARMA, setParametrosHandler)

export default router
