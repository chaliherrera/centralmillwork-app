// ─────────────────────────────────────────────────────────────────────────────
// Domain — Parser de predecesores estilo MS Project (módulo PURO, sin DB)
// ─────────────────────────────────────────────────────────────────────────────
// Convierte el texto que escribe el scheduler en una columna del Gantt
// ("5", "5FS+2d", "3FS+2d,5SS-1d") en dependencias estructuradas, y de vuelta.
//
//   · El NÚMERO es la FILA de la tarea en el proyecto (1..N), no el id de DB.
//     resolverPredecesores() traduce fila → id usando el orden actual.
//   · Sin tipo → FS. Sin desfase → 0. El desfase va en DÍAS HÁBILES; '+' atrasa,
//     '-' adelanta. Alias en español: FC=FS, CC=SS, CF=SF.
//   · Devuelve TODOS los errores del texto (no corta en el primero) para que la
//     UI los liste. CICLO no sale de acá (necesita el grafo); se valida aparte.
// ─────────────────────────────────────────────────────────────────────────────

import type { TipoDep } from './holgura'

export type CodigoErrorPred =
  | 'SINTAXIS' | 'TIPO_INVALIDO' | 'UNIDAD_INVALIDA' | 'LAG_FUERA_DE_RANGO'
  | 'REF_INEXISTENTE' | 'AUTO_DEPENDENCIA' | 'DUPLICADO' | 'CICLO'

export interface ErrorPred {
  codigo: CodigoErrorPred
  mensaje: string
  fragmento?: string   // el pedacito del texto que falló (para resaltarlo)
  fila?: number        // la fila referida, cuando aplica
}

/** Un predecesor parseado, todavía por FILA (no por id). */
export interface PredRef { fila: number; tipo: TipoDep; lag: number }

export type ParseResult =
  | { ok: true; items: PredRef[] }
  | { ok: false; errores: ErrorPred[] }

export type ResolveResult =
  | { ok: true; aristas: { depende_de_id: number; tipo: TipoDep; lag: number }[] }
  | { ok: false; errores: ErrorPred[] }

const LAG_MAX = 365

// Alias de tipo (inglés + español). FC=Fin-Comienzo, CC=Comienzo-Comienzo, CF=Comienzo-Fin.
const TIPO_ALIAS: Record<string, TipoDep> = {
  FS: 'FS', SS: 'SS', FF: 'FF', SF: 'SF',
  FC: 'FS', CC: 'SS', CF: 'SF',
}

// Una unidad de desfase válida (sin acentos, en minúscula) debe ser una de estas.
const UNIDADES_OK = new Set(['d', 'dia', 'dias'])
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ref [tipo] [ (+|-) num [unidad] ]  — con espacios opcionales en el medio.
const ITEM_RE = /^(\d+)\s*([A-Za-z]+)?\s*(?:([+-])\s*(\d+)\s*([A-Za-zÁÉÍÓÚáéíóúÑñ]+)?)?$/

/** Parsea el texto a predecesores por FILA. Solo sintaxis + duplicados. */
export function parsearPredecesores(texto: string): ParseResult {
  const errores: ErrorPred[] = []
  const items: PredRef[] = []
  const vistas = new Set<number>()

  const crudo = (texto ?? '').trim()
  if (crudo === '') return { ok: true, items: [] }   // vacío = sin predecesores

  // Separadores: coma o punto y coma.
  for (const parte of crudo.split(/[,;]/)) {
    const frag = parte.trim()
    if (frag === '') {   // coma de más: "5,,3" o "5,"
      errores.push({ codigo: 'SINTAXIS', mensaje: 'Hay un predecesor vacío (una coma de más).', fragmento: parte })
      continue
    }
    const m = ITEM_RE.exec(frag)
    if (!m) {
      errores.push({
        codigo: 'SINTAXIS',
        mensaje: `No entiendo "${frag}". Escribí el número de fila, el tipo opcional (FS, SS, FF, SF) y el desfase opcional (+2d o -1d). Ejemplos: 5, 5FS+2d, 3SS, 7FF-1d`,
        fragmento: frag,
      })
      continue
    }
    const [, filaStr, tipoRaw, signo, lagStr, unidad] = m
    const fila = parseInt(filaStr, 10)

    // Tipo
    let tipo: TipoDep = 'FS'
    if (tipoRaw) {
      const t = TIPO_ALIAS[tipoRaw.toUpperCase()]
      if (!t) {
        errores.push({ codigo: 'TIPO_INVALIDO', mensaje: `"${tipoRaw}" no es un tipo de relación. Usá FS (fin→inicio), SS (inicio→inicio), FF (fin→fin) o SF (inicio→fin).`, fragmento: frag, fila })
        continue
      }
      tipo = t
    }

    // Desfase
    let lag = 0
    if (signo) {
      if (unidad && !UNIDADES_OK.has(sinAcentos(unidad))) {
        errores.push({ codigo: 'UNIDAD_INVALIDA', mensaje: 'El desfase se mide en días hábiles: usá "d" (por ejemplo +2d).', fragmento: frag, fila })
        continue
      }
      lag = (signo === '-' ? -1 : 1) * parseInt(lagStr, 10)
      if (Math.abs(lag) > LAG_MAX) {
        errores.push({ codigo: 'LAG_FUERA_DE_RANGO', mensaje: `El desfase debe estar entre -${LAG_MAX} y +${LAG_MAX} días.`, fragmento: frag, fila })
        continue
      }
    }

    if (vistas.has(fila)) {
      errores.push({ codigo: 'DUPLICADO', mensaje: `La fila ${fila} aparece repetida: una tarea solo puede tener una relación con cada predecesora.`, fragmento: frag, fila })
      continue
    }
    vistas.add(fila)
    items.push({ fila, tipo, lag })
  }

  return errores.length ? { ok: false, errores } : { ok: true, items }
}

/**
 * Traduce los predecesores por FILA a dependencias por id, usando `ordenIds`
 * (los ids de las tareas del proyecto en el orden que ve el usuario; índice 0 =
 * fila 1). `tareaId` es la tarea que recibe los predecesores (para la auto-dep).
 */
export function resolverPredecesores(items: PredRef[], ordenIds: number[], tareaId: number): ResolveResult {
  const errores: ErrorPred[] = []
  const aristas: { depende_de_id: number; tipo: TipoDep; lag: number }[] = []
  for (const it of items) {
    if (!Number.isInteger(it.fila) || it.fila < 1 || it.fila > ordenIds.length) {
      errores.push({ codigo: 'REF_INEXISTENTE', mensaje: `No existe la fila ${it.fila} en este proyecto (hay ${ordenIds.length} tareas).`, fila: it.fila })
      continue
    }
    const dependeDeId = ordenIds[it.fila - 1]
    if (dependeDeId === tareaId) {
      errores.push({ codigo: 'AUTO_DEPENDENCIA', mensaje: `Una tarea no puede depender de sí misma (fila ${it.fila}).`, fila: it.fila })
      continue
    }
    aristas.push({ depende_de_id: dependeDeId, tipo: it.tipo, lag: it.lag })
  }
  return errores.length ? { ok: false, errores } : { ok: true, aristas }
}

/**
 * Arma el texto de la columna a partir de las dependencias por id.
 * `filaPorId` mapea id → fila (1..N). Omite 'FS' y '+0d' para que quede limpio
 * ("5", "5SS+2d"). Ordena por fila. Es el inverso de parsear/resolver.
 */
export function formatearPredecesores(
  aristas: { depende_de_id: number; tipo: TipoDep; lag: number }[],
  filaPorId: Map<number, number>,
): string {
  return aristas
    .map((a) => ({ fila: filaPorId.get(a.depende_de_id), tipo: a.tipo, lag: a.lag }))
    .filter((x): x is { fila: number; tipo: TipoDep; lag: number } => x.fila != null)
    .sort((a, b) => a.fila - b.fila)
    .map((x) => {
      const t = x.tipo === 'FS' ? '' : x.tipo
      const l = x.lag > 0 ? `+${x.lag}d` : x.lag < 0 ? `${x.lag}d` : ''
      return `${x.fila}${t}${l}`
    })
    .join(',')
}
