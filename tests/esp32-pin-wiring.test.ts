import { expect, it } from 'vitest'
import '../src/model/catalog-ext'
import { validateLayout } from '../src/model/validate'
import { buildNetlist } from '../src/sim/netlist'
import example from '../examples/esp32-tft-ra8875.json'

it('connects every ESP32 header directly to its existing breadboard strip', () => {
  const layout = structuredClone(example)
  layout.wires[0].from = 'ESP1:5V'
  layout.wires[2].from = 'ESP1:GPIO12'
  const result = validateLayout(layout)
  expect(result.ok, result.errors.join('\n')).toBe(true)
  const nets = buildNetlist(result.layout!)
  expect(nets.netOf('ESP1:GPIO12')).toBe(nets.netOf('a27'))
  expect(nets.netOf('LCD1:SCK')).toBe(nets.netOf('b27'))
  expect(nets.netOf('ESP1:5V')).toBe(nets.netOf('a30'))
  expect(nets.netOf('ESP1:GPIO999')).toBeNull()
})

it('rejects a nonexistent ESP32 header pin', () => {
  const layout = structuredClone(example)
  layout.wires[0].from = 'ESP1:GPIO999'
  expect(validateLayout(layout).ok).toBe(false)
})
