// Helpers PUROS para las notas del informe de materiales.
// Separar la validación del alcance de la nota facilita testearla sin DB.

export type NotaScopeInput = { item?: string | null; material_id?: number | string | null }
export type NotaScope = { item: string | null; material_id: number | null }

/**
 * Normaliza y valida el alcance de una nota del informe.
 *   · proyecto      → { item: null,  material_id: null }
 *   · ítem          → { item: 'N',   material_id: null }
 *   · material+ítem → { item: 'N',   material_id: 123  }
 *
 * Reglas:
 *   - item vacío/espacios se trata como null.
 *   - material_id debe ser entero positivo si viene.
 *   - un material SIEMPRE vive dentro de un ítem: material_id sin item es inválido.
 */
export function normalizeNotaScope(input: NotaScopeInput): NotaScope {
  const itemRaw = input.item == null ? '' : String(input.item).trim()
  const item = itemRaw !== '' ? itemRaw : null

  let material_id: number | null = null
  if (input.material_id != null && String(input.material_id).trim() !== '') {
    const n = Number(input.material_id)
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('material_id inválido (debe ser un entero positivo)')
    }
    material_id = n
  }

  if (material_id != null && item == null) {
    throw new Error('material_id requiere item (un material vive dentro de un ítem)')
  }

  return { item, material_id }
}
