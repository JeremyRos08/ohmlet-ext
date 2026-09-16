import { validateLayout } from './validate'
import type { CircuitLayout } from './types'

/** Recover old Uno positions sized for a generic 6.5-unit instrument box.
 * Electrical pin identifiers and wires are preserved; only PCB positions move.
 */
export function restoreLayout(value: unknown): CircuitLayout | null {
  const result = validateLayout(value)
  if (result.ok && result.layout) return result.layout
  if (!result.errors.length || !result.errors.every(error => error.includes('overlaps'))) return null
  const raw = value as CircuitLayout
  const repaired = validateLayout({ ...raw, components: raw.components.map(c => {
    if (c.type !== 'arduino_uno_r3') return c
    const { pos: _oldPosition, ...rest } = c
    return rest
  }) })
  return repaired.ok ? repaired.layout ?? null : null
}
