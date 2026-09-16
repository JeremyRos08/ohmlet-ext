import { getEntry } from '../model/catalog'
import type { CircuitLayout } from '../model/types'

export interface BomRow { type: string; label: string; refs: string[]; values: string }
/** Group by type and effective catalog settings; omitted defaults equal explicit defaults. */
export function buildBom(layout: CircuitLayout): BomRow[] {
  const groups = new Map<string, BomRow>()
  for (const c of layout.components) {
    const entry = getEntry(c.type)
    const params = (entry?.params ?? []).map(p => [p.key, c.params?.[p.key] ?? p.default] as const)
    const key = JSON.stringify([c.type, params])
    const existing = groups.get(key)
    if (existing) existing.refs.push(c.id)
    else groups.set(key, { type: c.type, label: entry?.label ?? c.type, refs: [c.id],
      values: (entry?.params ?? []).map((p, i) => `${p.label}: ${params[i][1]}${p.unit ? ` ${p.unit}` : ''}`).join('; ') })
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
}

// Quoted fields escape delimiters and neutralize spreadsheet formula input.
function cell(value: string): string {
  return '"' + (/^[\s]*[=+\-@]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"'
}
export function bomCsv(layout: CircuitLayout): string {
  return '\uFEFF' + [['References', 'Component', 'Quantity', 'Settings'],
    ...buildBom(layout).map(r => [r.refs.join(', '), r.label, String(r.refs.length), r.values])]
    .map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
