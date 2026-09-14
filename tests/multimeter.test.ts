import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import '../src/model/catalog-ext'
import { CATALOG } from '../src/model/catalog'
import { SimEngine } from '../src/sim/engine'
import { getMultimeterReading } from '../src/sim/multimeter-chip'
import { buildComponentObject, disposeComponentObject } from '../src/three/component-meshes'
import type { CircuitLayout, ComponentInstance } from '../src/model/types'

function dmm(id = 'DMM1', mode = 'DC V'): ComponentInstance {
  return { id, type: 'multimeter', params: { mode, resistance: 10_000_000 } }
}

function voltageLayout(mode = 'DC V', reverse = false): CircuitLayout {
  return {
    version: 1,
    components: [
      { id: 'PS1', type: 'power_supply', params: { voltage: 5 } },
      dmm('DMM1', mode),
    ],
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

function ohmLayout(resistance: number, mode = 'Ω'): CircuitLayout {
  return {
    version: 1,
    components: [
      // A 0 V supply gives the global MNA reference but is not connected to
      // the DUT; the meter supplies its own resistance-test voltage.
      { id: 'PS1', type: 'power_supply', params: { voltage: 0 } },
      dmm('DMM1', mode),
      { id: 'R1', type: 'resistor', holes: ['a1', 'a2'], params: { resistance } },
    ],
    wires: [
      { id: 'w1', from: 'DMM1:VΩ', to: 'b1' },
      { id: 'w2', from: 'DMM1:COM', to: 'b2' },
    ],
  }
}

function currentLayout(mode: 'mA' | 'A'): CircuitLayout {
  return {
    version: 1,
    components: [
      { id: 'PS1', type: 'power_supply', params: { voltage: 5 } },
      dmm('DMM1', mode),
      { id: 'R1', type: 'resistor', holes: ['a1', 'a2'], params: { resistance: 100 } },
    ],
    wires: [
      // Meter inserted in series: +5 V -> DMM -> 100 Ω -> ground.
      { id: 'w1', from: 'PS1:+', to: 'DMM1:VΩ' },
      { id: 'w2', from: 'DMM1:COM', to: 'b1' },
      { id: 'w3', from: 'PS1:-', to: 'b2' },
    ],
  }
}

describe('digital multimeter extension', () => {
  it('registers all selectable measurement modes', () => {
    const entry = CATALOG.multimeter
    expect(entry).toBeDefined()
    expect(entry.placement).toBe('offboard')
    expect(entry.pins).toEqual(['VΩ', 'COM'])
    expect(entry.sim).toEqual({ kind: 'chip', model: 'multimeter' })
    expect(entry.params?.find((p) => p.key === 'mode')?.options).toEqual([
      'DC V',
      'AC V',
      'Ω',
      'Continuity',
      'mA',
      'A',
    ])
  })

  it('measures +5 V DC with about 10 MΩ input loading', () => {
    const engine = new SimEngine(voltageLayout())
    engine.advance(0.003)
    const r = getMultimeterReading('DMM1')
    expect(r).not.toBeNull()
    expect(r!.value).toBeGreaterThan(4.999)
    expect(r!.value).toBeLessThan(5.001)
    expect(Math.abs(r!.current)).toBeGreaterThan(0.49e-6)
    expect(Math.abs(r!.current)).toBeLessThan(0.51e-6)
  })

  it('shows negative polarity with reversed voltage leads', () => {
    const engine = new SimEngine(voltageLayout('DC V', true))
    engine.advance(0.003)
    const r = getMultimeterReading('DMM1')!
    expect(r.value).toBeGreaterThan(-5.001)
    expect(r.value).toBeLessThan(-4.999)
  })

  it('estimates AC true RMS while rejecting DC offset', () => {
    const layout: CircuitLayout = {
      version: 1,
      components: [
        { id: 'PS1', type: 'power_supply', params: { voltage: 0 } },
        {
          id: 'FG1',
          type: 'function_generator',
          params: { waveform: 'sine', frequency: 100, amplitude: 2, offset: 2.5 },
        },
        dmm('DMM1', 'AC V'),
      ],
      wires: [
        { id: 'w1', from: 'PS1:-', to: 'FG1:gnd' },
        { id: 'w2', from: 'FG1:out', to: 'DMM1:VΩ' },
        { id: 'w3', from: 'FG1:gnd', to: 'DMM1:COM' },
      ],
    }
    const engine = new SimEngine(layout)
    engine.advance(0.35)
    const r = getMultimeterReading('DMM1')!
    // 2 V peak sine -> sqrt(2) ~= 1.414 V RMS; 2.5 V DC must be rejected.
    expect(r.value).toBeGreaterThan(1.32)
    expect(r.value).toBeLessThan(1.50)
  }, 20000)

  it('measures a 1 kΩ unpowered resistor', () => {
    const engine = new SimEngine(ohmLayout(1000))
    engine.advance(0.01)
    const r = getMultimeterReading('DMM1')!
    expect(r.resistance).toBeGreaterThan(990)
    expect(r.resistance).toBeLessThan(1010)
  })

  it('continuity closes below 50 Ω and opens above it', () => {
    const low = new SimEngine(ohmLayout(10, 'Continuity'))
    low.advance(0.005)
    expect(getMultimeterReading('DMM1')!.continuity).toBe(true)

    const high = new SimEngine(ohmLayout(100, 'Continuity'))
    high.advance(0.005)
    expect(getMultimeterReading('DMM1')!.continuity).toBe(false)
  })

  it('measures current in series on the mA range', () => {
    const engine = new SimEngine(currentLayout('mA'))
    engine.advance(0.01)
    const r = getMultimeterReading('DMM1')!
    // 5 V / (100 Ω load + ~1 Ω meter shunt) ~= 49.5 mA.
    expect(Math.abs(r.current)).toBeGreaterThan(0.048)
    expect(Math.abs(r.current)).toBeLessThan(0.051)
  })

  it('measures current in series on the A range with a lower burden voltage', () => {
    const engine = new SimEngine(currentLayout('A'))
    engine.advance(0.01)
    const r = getMultimeterReading('DMM1')!
    expect(Math.abs(r.current)).toBeGreaterThan(0.049)
    expect(Math.abs(r.current)).toBeLessThan(0.051)
  })

  it('builds the dedicated 3D meter instead of the generic fallback', () => {
    const entry = CATALOG.multimeter
    const comp = dmm('DMM1', 'Continuity')
    const built = buildComponentObject(comp, entry, [
      new THREE.Vector3(2, 0, 2),
      new THREE.Vector3(4.5, 0, 2),
    ])
    expect(built.object.children.length).toBeGreaterThan(5)
    expect(built.pinWorld).toHaveLength(2)
    disposeComponentObject(built.object)
  })
})
