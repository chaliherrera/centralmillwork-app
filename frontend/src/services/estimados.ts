import api from './api'
import type { Propuesta } from '@/utils/propuestaPdf'

// ─────────────────────────────────────────────────────────────────────────────
// Cliente de /api/estimados.
//
// El motor de costeo vive en el backend: acá no se calcula nada. Cada vez que
// cambia algo, el backend devuelve el estimado entero recalculado en una sola
// llamada — por eso `getEstimado` trae cabecera, ítems, componentes Y el cálculo.
// ─────────────────────────────────────────────────────────────────────────────

export interface RecetaCatalogo {
  id: number
  descripcion: string
  alias: string | null
  unidad: string | null
  grupo: string | null
  margen: number | null
  horasUnidad: number
  /** 'calculado' = el costo se mueve solo con el precio de sus materiales. */
  fuenteCosto: 'directo' | 'calculado'
  cogsUnidad: number | null
  precioUnidad: number | null
  /** Cuánto se usó esta receta y con qué cantidades. Null = nunca se usó. */
  uso: { veces: number; min: number; max: number; mediana: number } | null
}

export interface ComponenteRow {
  id: number
  recetaId: number
  receta: string
  alias: string | null
  unidad: string | null
  grupo: string | null
  fuenteCosto: string
  cantidadUnidad: number
  cantidadExpr: string | null
  cantidadPropuesta: number | null
  margenOverride: number | null
  origenMedida: string | null
  hojaPlano: string | null
  nota: string | null
  precioUnidad: number | null
  precio: number | null
  horas: number
}

export interface ItemRow {
  id: number
  n: number
  nombre: string
  ref_plano: string | null
  unidades: number
  descripcion: string | null
  acabados: string | null
  herrajes: string | null
  exclusiones: string | null
  tamanos: string | null
  tamanosSugeridos: string | null
  dias_instalacion: number
  dias_instalacion_manual: boolean
  dias_instalacion_sugerido: number | null
  resumen: { itemN: number; precio: number; cogs: number; horas: number }
  componentes: ComponenteRow[]
}

export interface Calculo {
  renglones: { n: number; concepto: string; monto: number }[]
  total: number
  salesTax: number
  totalConImpuestos: number
  cogsTotal: number
  margen: number
  horasTaller: number
  presupuestoTaller: number
  diasInstalacion: number
  instalacionPorItem: { itemN: number; dias: number; sugerido: number; manual: boolean }[]
  /** La regla de la casa con la que se propusieron los días. 0 = sin cargar. */
  dolaresPorDiaInstalacion: number
  advertencias: string[]
  porItem: { itemN: number; precio: number; cogs: number; horas: number }[]
  lineas: { id: number; itemN: number; recetaId: number; precio: number }[]
}

export interface Estimado {
  id: number
  codigo: string
  nombre: string
  ubicacion: string | null
  gc: string | null
  gc_contacto: string | null
  gc_email: string | null
  gc_telefono: string | null
  estimador: string | null
  draft: number
  estado: 'borrador' | 'enviado' | 'aceptado' | 'perdido'
  print_set: string | null
  presentado_en: string | null
  total: number | null
  items: ItemRow[]
  calculo: Calculo
}

export interface EstimadoResumen {
  id: number; codigo: string; nombre: string; gc: string | null
  estimador: string | null; draft: number; estado: string
  total: number | null; horas_taller: number | null
  presentado_en: string | null; actualizado_en: string
}

export interface Perilla {
  clave: string; etiqueta: string; ayuda: string | null
  unidad: string | null; tipo: 'numero' | 'moneda' | 'porcentaje' | 'si_no'
  grupo: string; porProyecto: boolean; requerido: boolean
  valor: string | null; valorDefault: string | null; cambiado: boolean
}

// ── catálogo ────────────────────────────────────────────────────────────────

/**
 * Trae el catálogo COMPLETO de una vez. Son ~167 recetas: entran de sobra en
 * memoria, y filtrar en el navegador hace que buscar no tenga espera por tecla.
 */
export async function cargarCatalogo(): Promise<RecetaCatalogo[]> {
  const { data } = await api.get('/estimados/catalogo/recetas', { params: { limite: 500 } })
  return data
}

export async function listGrupos() {
  const { data } = await api.get('/estimados/catalogo/grupos')
  return data as { nombre: string; margen: number; recetas: number }[]
}

/** El nombre corto para la propuesta, que se pone sobre la marcha. */
export async function setAlias(recetaId: number, alias: string | null) {
  const { data } = await api.put(`/estimados/catalogo/recetas/${recetaId}/alias`, { alias })
  return data as { id: number; descripcion: string; alias: string | null }
}

// ── estimados ───────────────────────────────────────────────────────────────

export async function listEstimados(params: { estado?: string; q?: string } = {}) {
  const { data } = await api.get('/estimados', { params })
  return data as EstimadoResumen[]
}

export async function getEstimado(id: number): Promise<Estimado> {
  const { data } = await api.get(`/estimados/${id}`)
  return data
}

export async function crearEstimado(body: {
  codigo: string; nombre: string; gc?: string | null; ubicacion?: string | null
}) {
  const { data } = await api.post('/estimados', body)
  return data as Estimado
}

export async function actualizarEstimado(id: number, body: Record<string, unknown>) {
  const { data } = await api.put(`/estimados/${id}`, body)
  return data
}

/** El draft siguiente. Reemplaza el "guardar como" sobre el Excel. */
export async function duplicarEstimado(id: number) {
  const { data } = await api.post(`/estimados/${id}/duplicar`, {})
  return data as { id: number; draft: number }
}

/** Congela precios, tarifa y versión de catálogo. A partir de acá no se edita. */
export async function enviarEstimado(id: number) {
  const { data } = await api.post(`/estimados/${id}/enviar`, {})
  return data as Calculo
}

export async function marcarResultado(id: number, estado: 'aceptado' | 'perdido') {
  const { data } = await api.post(`/estimados/${id}/resultado`, { estado })
  return data
}

export async function queSaldriaHoy(id: number) {
  const { data } = await api.get(`/estimados/${id}/que-saldria-hoy`)
  return data as {
    totalCongelado: number | null; totalHoy: number; diferencia: number | null
    recetasQueSeMovieron: { receta: string; congelado: number; hoy: number }[]
  }
}

export async function getPropuesta(id: number): Promise<Propuesta> {
  const { data } = await api.get(`/estimados/${id}/propuesta`)
  return data
}

// ── ítems ───────────────────────────────────────────────────────────────────

export async function crearItem(estimadoId: number, body: { nombre: string; unidades?: number }) {
  const { data } = await api.post(`/estimados/${estimadoId}/items`, body)
  return data as ItemRow
}

export async function actualizarItem(itemId: number, body: Record<string, unknown>) {
  const { data } = await api.put(`/estimados/items/${itemId}`, body)
  return data
}

export async function borrarItem(itemId: number) {
  await api.delete(`/estimados/items/${itemId}`)
}

export async function itemsParaCopiar(q?: string) {
  const { data } = await api.get('/estimados/items-para-copiar', { params: { q } })
  return data as {
    id: number; nombre: string; unidades: number; codigo: string
    proyecto: string; draft: number; estado: string; componentes: number
  }[]
}

/** Trae un ítem entero de otro proyecto, con sus componentes y sus cuentas. */
export async function copiarItem(estimadoId: number, itemOrigen: number, nombre?: string) {
  const { data } = await api.post(`/estimados/${estimadoId}/items/copiar`, { itemOrigen, nombre })
  return data as ItemRow
}

export async function diasInstalacion(estimadoId: number) {
  const { data } = await api.get(`/estimados/${estimadoId}/dias-instalacion`)
  return data as {
    diasTotal: number
    items: { id: number; n: number; nombre: string; precio: number
             dias: number; sugerido: number; manual: boolean }[]
  }
}

/** Devuelve el ítem a la regla de la casa: deja de estar fijado a mano. */
export async function volverALaRegla(itemId: number) {
  const { data } = await api.post(`/estimados/items/${itemId}/dias-instalacion/regla`, {})
  return data
}

// ── componentes ─────────────────────────────────────────────────────────────

/** `cantidad` puede ser la cuenta tal como se escribe: "(4.17*2*2)+(3.25*2)". */
export async function agregarComponente(itemId: number, body: {
  recetaId: number; cantidad: string | number; margenOverride?: number | null
}) {
  const { data } = await api.post(`/estimados/items/${itemId}/componentes`, body)
  return data as { id: number }
}

export async function actualizarComponente(compId: number, body: Record<string, unknown>) {
  const { data } = await api.put(`/estimados/componentes/${compId}`, body)
  return data
}

export async function borrarComponente(compId: number) {
  await api.delete(`/estimados/componentes/${compId}`)
}

// ── parámetros ──────────────────────────────────────────────────────────────

export async function getPerillas(estimadoId: number) {
  const { data } = await api.get(`/estimados/${estimadoId}/parametros/catalogo`)
  return data as Perilla[]
}

export async function setPerillas(estimadoId: number, valores: Record<string, string | number>) {
  const { data } = await api.put(`/estimados/${estimadoId}/parametros`, valores)
  return data
}
