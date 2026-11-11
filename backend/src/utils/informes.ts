// Helper PURO para validar/normalizar la selección de un informe guardado.
// Testeable sin DB.

export type SeleccionProyecto = { proyecto_id: number; items: string[] }

/**
 * Normaliza la selección de un informe.
 * Entrada esperada: [{ proyecto_id, items: [...] }, ...]
 *   · items vacío = todos los ítems de ese proyecto.
 *   · ítems se deduplican y se recortan; proyecto_id debe ser entero positivo
 *     y único en la lista.
 */
export function normalizeSeleccion(input: unknown): SeleccionProyecto[] {
  if (!Array.isArray(input)) throw new Error('seleccion debe ser un array')
  const out: SeleccionProyecto[] = []
  const vistos = new Set<number>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('cada entrada de seleccion debe ser un objeto { proyecto_id, items }')
    }
    const pid = Number((raw as Record<string, unknown>).proyecto_id)
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('proyecto_id inválido')
    if (vistos.has(pid)) throw new Error(`proyecto_id duplicado en seleccion: ${pid}`)
    vistos.add(pid)

    const itemsRaw = (raw as Record<string, unknown>).items
    if (itemsRaw != null && !Array.isArray(itemsRaw)) throw new Error('items debe ser un array')
    const items = Array.from(new Set(
      ((itemsRaw as unknown[]) ?? []).map((x) => String(x).trim()).filter((x) => x !== '')
    ))
    out.push({ proyecto_id: pid, items })
  }
  return out
}
