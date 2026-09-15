import type { CircuitLayout } from '../model/types'
import { boardConfigOf } from '../model/types'
import { allHoles, componentPinHoles, formatHole } from '../model/breadboard'
import { getEntry } from '../model/catalog'
import { buildNetlist } from '../sim/netlist'

export interface InspectedNet { id: string; endpoints: string[]; wires: string[]; pins: string[] }
/** Built only when the layout changes, not on telemetry or pointer movement. */
export function createNetInspector(layout: CircuitLayout): (ref: string) => InspectedNet | null {
  const netlist = buildNetlist(layout)
  const groups = new Map<string, InspectedNet>()
  const add = (ref: string, pin?: string) => {
    const id = netlist.netOf(ref)
    if (!id) return
    let group = groups.get(id)
    if (!group) { group = { id, endpoints: [], wires: [], pins: [] }; groups.set(id, group) }
    if (pin) group.pins.push(pin)
    else group.endpoints.push(ref)
  }
  const config = boardConfigOf(layout)
  for (const hole of allHoles(config)) add(formatHole(hole))
  for (const comp of layout.components) {
    const entry = getEntry(comp.type)
    if (!entry) continue
    const holes = entry.placement === 'offboard' ? null : componentPinHoles(comp, entry, config)
    entry.pins.forEach((pin, i) => {
      const ref = entry.placement === 'offboard' ? `${comp.id}:${pin}` : holes?.[i] ? formatHole(holes[i]) : null
      if (!ref) return
      add(ref, `${comp.id}:${pin}`)
      if (entry.placement === 'offboard') add(ref)
    })
  }
  for (const wire of layout.wires) {
    const net = netlist.netOf(wire.from)
    if (net) groups.get(net)?.wires.push(wire.id)
  }
  return (ref) => { const id = netlist.netOf(ref); return id ? groups.get(id) ?? null : null }
}
