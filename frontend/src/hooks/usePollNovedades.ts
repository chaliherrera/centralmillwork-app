import { useCallback, useEffect, useRef, useState } from 'react'

// P9 (2.9): los tableros del PM se refrescan solos y avisan cuando llega ALGO NUEVO.
// `usePollNovedades` = carga + re-consulta cada intervalMs + toast al aparecer ids nuevos.
// `useToastNuevos` = solo la detección de novedades sobre una lista ya cargada (react-query).

/** Dispara onNuevo(n) cuando aparecen ids que no estaban en la lectura anterior. No avisa en
 *  la primera carga ni cuando los items desaparecen (se resuelven). */
export function useToastNuevos<T>(items: T[], getId: (t: T) => string | number, onNuevo: (n: number) => void) {
  const seen = useRef<Set<string | number> | null>(null)
  const cb = useRef(onNuevo); cb.current = onNuevo
  const getIdRef = useRef(getId); getIdRef.current = getId
  useEffect(() => {
    const ids = new Set(items.map(getIdRef.current))
    if (seen.current) {
      let nuevos = 0
      ids.forEach((id) => { if (!seen.current!.has(id)) nuevos++ })
      if (nuevos > 0) cb.current(nuevos)
    }
    seen.current = ids
  }, [items])
}

/** Carga una lista, la re-consulta cada intervalMs (default 30s) y avisa las novedades.
 *  Devuelve items/loading + refetch (para recargar tras una acción del propio widget). */
export function usePollNovedades<T>(
  fetcher: () => Promise<T[]>,
  getId: (t: T) => string | number,
  opts?: { intervalMs?: number; onNuevo?: (n: number) => void },
): { items: T[]; loading: boolean; refetch: () => Promise<void> } {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const seen = useRef<Set<string | number> | null>(null)
  const vivo = useRef(true)
  const cbs = useRef({ fetcher, getId, onNuevo: opts?.onNuevo })
  cbs.current = { fetcher, getId, onNuevo: opts?.onNuevo }
  const intervalMs = opts?.intervalMs ?? 30_000

  const cargar = useCallback(async () => {
    try {
      const data = await cbs.current.fetcher()
      if (!vivo.current) return
      setItems(data)
      const ids = new Set(data.map(cbs.current.getId))
      if (seen.current) {
        let nuevos = 0
        ids.forEach((id) => { if (!seen.current!.has(id)) nuevos++ })
        if (nuevos > 0) cbs.current.onNuevo?.(nuevos)
      }
      seen.current = ids
    } catch { /* silencioso */ } finally { if (vivo.current) setLoading(false) }
  }, [])

  useEffect(() => {
    vivo.current = true
    cargar()
    const iv = setInterval(cargar, intervalMs)
    return () => { vivo.current = false; clearInterval(iv) }
  }, [cargar, intervalMs])

  return { items, loading, refetch: cargar }
}
