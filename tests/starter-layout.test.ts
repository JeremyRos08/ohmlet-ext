import { describe, expect, it } from 'vitest'
import { STARTER_LAYOUT } from '../src/model/starter-layout'
import { validateLayout } from '../src/model/validate'
import { SimEngine } from '../src/sim/engine'
import '../src/sim/chips/all'

describe('starter bench', () => {
  it('can be saved and imported without occupied-hole conflicts', () => {
    const result = validateLayout(JSON.parse(JSON.stringify(STARTER_LAYOUT)))
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })
  it('powers the LED safely and measures its anode on channel 1', () => {
    const engine = new SimEngine(STARTER_LAYOUT)
    engine.advance(0.02)
    const led = engine.telemetry().components.LED1
    expect(engine.issues.filter(i => i.level === 'error')).toEqual([])
    expect(led.current).toBeGreaterThan(0.001)
    expect(led.current).toBeLessThan(0.01)
    expect(engine.netVoltage('b15')).toBeCloseTo(led.pinVoltages.anode, 6)
  })
})
