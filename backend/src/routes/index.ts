import { Router } from 'express'
import { requireRole } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import { getUsuarios, createUsuario, updateUsuario } from '../controllers/usuariosController'
import {
  getStats, getGastoPorMes,
  getDashboardKpis, getDashboardCharts,
  getDashboardResumenEstados, getDashboardProyectosRecientes,
} from '../controllers/dashboardController'
import {
  getProyectos, getProyecto, createProyecto, updateProyecto, deleteProyecto,
  getProyectoResumen, getProyectoActividad, getProyectoItemsReadiness,
  createProyectoSchema, updateProyectoSchema,
} from '../controllers/proyectosController'
import {
  getProveedores, getProveedor, createProveedor, updateProveedor, deleteProveedor,
  createProveedorSchema, updateProveedorSchema,
} from '../controllers/proveedoresController'
import {
  getMateriales, getMaterialesKpis, getMaterialesImportDates, getMaterial, getMaterialOcInfo,
  createMaterial, updateMaterial, deleteMaterial,
  getPreciosFreight, updatePreciosLote,
  importarMateriales, uploadExcel,
} from '../controllers/materialesController'
import {
  getOrdenesCompra, getOrdenesCompraKpis, getOrdenesCompraImportDates,
  getOrdenCompra, getOrdenCompraMaterialesLote,
  createOrdenCompra, updateOrdenCompra, updateEstadoOrden, deleteOrdenCompra,
  getVendorsCotizados, generarOCs, crearOCNoMTO,
} from '../controllers/ordenesCompraController'
import {
  getRecepciones, getRecepcion, createRecepcion, createRecepcionCompleta,
  updateRecepcion, getRecepcionesHistorial, inicializarMateriales,
} from '../controllers/recepcionesController'
import { getImagenes, uploadImagen, deleteImagen, upload } from '../controllers/imagenesController'
import {
  getCotizaciones, getCotizacion, createCotizacion,
  updateCotizacion, aprobarCotizacion, deleteCotizacion,
  marcarCotizacionesEnviadas,
} from '../controllers/cotizacionesController'
import { getReporteCompras, getReporteProduccion, compartirReporte } from '../controllers/reportesController'
import produccionRouter from './produccion'
import {
  getTareas, getTarea, updateTarea, getTareasStats, syncSystemHandler,
  updateTareaSchema,
} from '../controllers/tareasController'

const router = Router()

// ─── Módulo de Producción ────────────────────────────────────────────────────
// Sub-router con sus propias rutas/permisos (ver routes/produccion.ts).
router.use('/produccion', produccionRouter)


// Role shorthand helpers
const ADMIN      = requireRole('ADMIN')
const WRITE      = requireRole('ADMIN', 'PROCUREMENT')
const REC_WRITE  = requireRole('ADMIN', 'PROCUREMENT', 'PRODUCTION')

// ─── Usuarios (ADMIN only) ────────────────────────────────────────────────────
router.get('/usuarios',      ADMIN, getUsuarios)
router.post('/usuarios',     ADMIN, createUsuario)
router.put('/usuarios/:id',  ADMIN, updateUsuario)

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard/stats',               getStats)
router.get('/dashboard/gasto-por-mes',       getGastoPorMes)
router.get('/dashboard/kpis',                getDashboardKpis)
router.get('/dashboard/charts',              getDashboardCharts)
router.get('/dashboard/resumen-estados',     getDashboardResumenEstados)
router.get('/dashboard/proyectos-recientes', getDashboardProyectosRecientes)

// ─── Proyectos ────────────────────────────────────────────────────────────────
router.get('/proyectos',                      getProyectos)
router.get('/proyectos/:id/resumen',          getProyectoResumen)
router.get('/proyectos/:id/actividad',        getProyectoActividad)
router.get('/proyectos/:id/items-readiness',  getProyectoItemsReadiness)
router.get('/proyectos/:id',                  getProyecto)
router.post('/proyectos',                     WRITE, validateBody(createProyectoSchema), createProyecto)
router.put('/proyectos/:id',                  WRITE, validateBody(updateProyectoSchema), updateProyecto)
router.delete('/proyectos/:id',               WRITE, deleteProyecto)

// ─── Proveedores ──────────────────────────────────────────────────────────────
router.get('/proveedores',        getProveedores)
router.get('/proveedores/:id',    getProveedor)
router.post('/proveedores',       WRITE, validateBody(createProveedorSchema), createProveedor)
router.put('/proveedores/:id',    WRITE, validateBody(updateProveedorSchema), updateProveedor)
router.delete('/proveedores/:id', WRITE, deleteProveedor)

// ─── Materiales MTO ──────────────────────────────────────────────────────────
router.get('/materiales',                    getMateriales)
router.get('/materiales/kpis',               getMaterialesKpis)
router.get('/materiales/import-dates',       getMaterialesImportDates)
router.get('/materiales/freight',            getPreciosFreight)
router.get('/materiales/:id/oc-info',        getMaterialOcInfo)
router.get('/materiales/:id',                getMaterial)
router.post('/materiales',                   WRITE, createMaterial)
router.post('/materiales/importar',          WRITE, uploadExcel.single('archivo'), importarMateriales)
router.patch('/materiales/precios-lote',     WRITE, updatePreciosLote)
router.put('/materiales/:id',                WRITE, updateMaterial)
router.delete('/materiales/:id',             WRITE, deleteMaterial)

// ─── Órdenes de Compra ───────────────────────────────────────────────────────
router.get('/ordenes-compra',                  getOrdenesCompra)
router.get('/ordenes-compra/kpis',             getOrdenesCompraKpis)
router.get('/ordenes-compra/import-dates',     getOrdenesCompraImportDates)
router.get('/ordenes-compra/vendors-cotizados', getVendorsCotizados)
router.post('/ordenes-compra/generar',          WRITE, generarOCs)
router.post('/ordenes-compra/no-mto',           WRITE, crearOCNoMTO)
router.get('/ordenes-compra/:id',                   getOrdenCompra)
router.get('/ordenes-compra/:id/materiales-lote',   getOrdenCompraMaterialesLote)
router.get('/ordenes-compra/:id/imagenes',          getImagenes)
router.post('/ordenes-compra/:id/imagenes',    REC_WRITE, upload.single('imagen'), uploadImagen)
router.delete('/imagenes/:imagenId',           REC_WRITE, deleteImagen)
router.post('/ordenes-compra',           WRITE, createOrdenCompra)
router.put('/ordenes-compra/:id',        WRITE, updateOrdenCompra)
router.patch('/ordenes-compra/:id/estado', WRITE, updateEstadoOrden)
router.delete('/ordenes-compra/:id',     WRITE, deleteOrdenCompra)

// ─── Recepciones ─────────────────────────────────────────────────────────────
router.get('/recepciones',                   getRecepciones)
router.get('/recepciones/historial',         getRecepcionesHistorial)
router.get('/recepciones/:id',               getRecepcion)
router.post('/recepciones',                  REC_WRITE, createRecepcion)
router.post('/recepciones/completa',         REC_WRITE, createRecepcionCompleta)
router.post('/recepciones/inicializar',      REC_WRITE, inicializarMateriales)
router.put('/recepciones/:id',               REC_WRITE, updateRecepcion)

// ─── Reportes ─────────────────────────────────────────────────────────────────
router.get('/reportes/compras',      getReporteCompras)
router.get('/reportes/produccion',   getReporteProduccion)
router.post('/reportes/compartir',   WRITE, compartirReporte)

// ─── Tareas (solo ADMIN) ─────────────────────────────────────────────────────
router.get('/tareas',                ADMIN, getTareas)
router.get('/tareas/stats',          ADMIN, getTareasStats)
router.post('/tareas/sync-system',   ADMIN, syncSystemHandler)
router.get('/tareas/:id',            ADMIN, getTarea)
router.patch('/tareas/:id',          ADMIN, validateBody(updateTareaSchema), updateTarea)

// ─── Cotizaciones ────────────────────────────────────────────────────────────
router.get('/cotizaciones',                   WRITE, getCotizaciones)
router.get('/cotizaciones/:id',               WRITE, getCotizacion)
router.post('/cotizaciones/enviar',           WRITE, marcarCotizacionesEnviadas)
router.post('/cotizaciones',                  WRITE, createCotizacion)
router.put('/cotizaciones/:id',               WRITE, updateCotizacion)
router.patch('/cotizaciones/:id/aprobar',     WRITE, aprobarCotizacion)
router.delete('/cotizaciones/:id',            WRITE, deleteCotizacion)

export default router
