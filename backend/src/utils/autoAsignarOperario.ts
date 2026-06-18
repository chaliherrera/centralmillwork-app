// ─────────────────────────────────────────────────────────────────────────────
// autoAsignarOperario — Helper para auto-asignar operario único activo
// ─────────────────────────────────────────────────────────────────────────────
// Cuando una OP se crea o avanza a una estación sin operador explícito, este
// helper intenta inferir un único candidato. Si hay ambigüedad, devuelve null
// y la asignación queda manual para el Shop Manager.
//
// Algoritmo:
//   1) Buscar todos los operarios activos asignados a la estación.
//   2) Si hay exactamente 1 → ese.
//   3) Si hay 2+, filtrar por tipo_personal "primario" de la estación
//      (mapping declarado abajo). Si después del filtro queda exactamente 1
//      → ese.
//   4) En cualquier otro caso → null (Shop Manager elige).
//
// Descubierto en take-off Muestras 2026-06-17: para pintura, Victor Padilla
// es el único pintor activo (3 personas asignadas pero las otras 2 son
// ayudantes). Auto-asignarlo evita un paso manual innecesario.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import { logger } from './logger'

// Mapping estación → tipo_personal esperado como responsable principal de la
// estación. Usado para desambiguar cuando hay 2+ candidatos activos.
// Si una estación no aparece acá, no se intenta desambiguar (queda en null).
const ESTACION_TIPO_PRIMARY: Record<string, string> = {
  cnc:          'operador',
  edge_banding: 'operador',
  lamina:       'carpintero',
  assembly:     'carpintero',
  pintura:      'pintor',
  final:        'carpintero',
  registro:     'carpintero',
  shipping:     'carpintero',
}

interface Candidate {
  id: number
  tipo_personal: string
}

/**
 * Devuelve el id del operario auto-asignable para la estación, o null si
 * hay ambigüedad (0 o 2+ candidatos sin un único "primario" claro).
 *
 * Llamar dentro de la transacción del caller.
 */
export async function findAutoAssignableOperator(
  client: PoolClient,
  estacion: string
): Promise<number | null> {
  const { rows } = await client.query<Candidate>(
    `SELECT pt.id, pt.tipo_personal
       FROM personal_estaciones pe
       JOIN personal_taller pt ON pt.id = pe.personal_id
      WHERE pe.estacion = $1
        AND pe.activo = true
        AND pt.activo = true`,
    [estacion]
  )

  if (rows.length === 1) {
    logger.info('autoAsignarOperario: único candidato activo', {
      estacion, personalId: rows[0].id, motivo: 'unico-en-estacion',
    })
    return rows[0].id
  }

  if (rows.length === 0) return null

  const primary = ESTACION_TIPO_PRIMARY[estacion]
  if (!primary) return null

  const filtered = rows.filter((r) => r.tipo_personal === primary)
  if (filtered.length === 1) {
    logger.info('autoAsignarOperario: único candidato por tipo primario', {
      estacion, personalId: filtered[0].id, tipoPersonal: primary,
      candidatosTotales: rows.length, motivo: 'unico-por-tipo',
    })
    return filtered[0].id
  }

  return null
}
