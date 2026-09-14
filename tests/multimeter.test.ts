import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import '../src/model/catalog-ext'
import { CATALOG } from '../src/model/catalog'
import { SimEngine } from '../src/sim/engine'
import { buildComponentObject, disposeComponentObject } from '../src/three/component-meshes'
import type { CircuitLayout, ComponentInstance } from '../src/model/types'

function meterLayout(reverse = false): CircuitLayout {
  const components: ComponentInstance[] = [
    { id: 'PS1', type: 'power_supply', params: { voltage: 5 } },
    { id: 'DMM1', type: 'multimeter' },
  ]
  return {
    version: 1,
    components,
    wires: reverse
      ? [
          { id: 'w1', from: 'PS1:+', to: 'DMM1:COM' },
          { id: 'w2', from: 'PS1:-', to: 'DMM1:VΩ' },
        ]
      : [
          { id: 'w1', from: 'PS1:+', to: 'DMM1:VΩ' },
          { id: 'w2', from: 'PS1:-', to: 'DMM1:COM' },
        ],
  }
}

describe('digital multimeter extension', () => {
  it('is registered as a 10 MΩ off-board DC voltmeter', () => {
    const entry = CATALOG.multimeter
    expect(entry).toBeDefined()
    expect(entry.placement).toBe('offboard')
    expect(entry.pins).toEqual(['VΩ', 'COM'])
    expect(entry.sim).toEqual({ kind: 'device', model: 'resistor' })
    expect(entry.params?.find((p) => p.key === 'resistance')?.default).toBe(10_000_000)
  })

  it('reads +5 V and loads the source by about 0.5 µA', () => {
    const engine = new SimEngine(meterLayout())
    engine.step()
    const t = engine.telemetry().components.DMM1
    const v = t.pinVoltages['VΩ'] - t.pinVoltages.COM
    expect(v).toBeGreaterThan(4.999)
    expect(v).toBeLessThan(5.001)
    expect(Math.abs(t.current ?? 0)).toBeGreaterThan(0.49e-6)
    expect(Math.abs(t.current ?? 0)).toBeLessThan(0.51e-6)
  })

  it('shows negative polarity when the leads are reversed', () => {
    const engine = new SimEngine(meterLayout(true))
    engine.step()
    const t = engine.telemetry().components.DMM1
    const v = t.pinVoltages['VΩ'] - t.pinVoltages.COM
    expect(v).toBeGreaterThan(-5.001)
    expect(v).toBeLessThan(-4.999)
  })

  it('builds the dedicated 3D meter instead of the generic fallback', () => {
    const entry = CATALOG.multimeter
    const comp: ComponentInstance = { id: 'DMM1', type: 'multimeter' }
    const built = buildComponentObject(comp, entry, [
      new THREE.Vector3(2, 0, 2),
      new THREE.Vector3(4.5, 0, 2),
    ])
    expect(built.object.children.length).toBeGreaterThan(5)
    expect(built.pinWorld).toHaveLength(2)
    disposeComponentObject(built.object)
  })
})
