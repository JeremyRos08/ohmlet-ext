import { bench, describe } from 'vitest'
import type { CircuitLayout, ComponentInstance, Wire } from '../src/model/types'
import { SimEngine } from '../src/sim/engine'

/**
 * End-to-end simulation benchmarks using real catalog devices/netlist/engine.
 * These complement mna.bench.ts: if MNA gets faster but engine timings do not,
 * the bottleneck is elsewhere (netlist/device stepping/telemetry/etc.).
 */

function resistorChain(nodeCount: number, nonlinear = false): CircuitLayout {
  const n = Math.max(2, Math.min(nodeCount, 240))
  const components: ComponentInstance[] = [
    { id: 'PS1', type: 'power_supply', params: { voltage: 5 } },
  ]
  const wires: Wire[] = [
    { id: 'W_POS', from: 'PS1:+', to: 'a1', color: 'red' },
    { id: 'W_NEG', from: 'PS1:-', to: `a${n}`, color: 'black' },
  ]

  for (let i = 1; i < n; i++) {
    components.push({
      id: `R${i}`,
      type: 'resistor',
      params: { resistance: 1_000 },
      holes: [`a${i}`, `a${i + 1}`],
    })
  }

  if (nonlinear) {
    // All holes on one top strip column share a net, and the top- rail is a
    // continuous bus. Ground that rail once, then add a diode roughly every
    // ten nodes so Newton-Raphson is exercised with real device models.
    wires.push({ id: 'W_GND_RAIL', from: 'PS1:-', to: 'top-0', color: 'black' })
    let d = 1
    for (let col = 10; col < n; col += 10) {
      components.push({
        id: `D${d++}`,
        type: 'diode',
        holes: [`b${col}`, `top-${Math.min(col, 199)}`],
      })
    }
  }

  return {
    version: 1,
    name: nonlinear ? `bench nonlinear ${n}` : `bench linear ${n}`,
    board: 'labxl',
    boardCount: 2,
    components,
    wires,
  }
}

for (const nonlinear of [false, true]) {
  const sizes = nonlinear ? [25, 50, 100] : [25, 50, 100, 200]
  describe(`SimEngine step — ${nonlinear ? 'nonlinear' : 'linear'}`, () => {
    for (const n of sizes) {
      const engine = new SimEngine(resistorChain(n, nonlinear))
      // Warm the initial operating point / cached factorization before timing.
      engine.step()
      bench(`${n} nodes`, () => {
        engine.step()
      })
    }
  })
}

describe('SimEngine telemetry allocation cost', () => {
  for (const n of [25, 50, 100, 200]) {
    const engine = new SimEngine(resistorChain(n, false))
    engine.step()
    bench(`${n} nodes`, () => {
      const t = engine.telemetry()
      if (t.time < 0) throw new Error('unreachable')
    })
  }
})

describe('SimEngine rebuild / netlist construction', () => {
  for (const n of [25, 50, 100, 200]) {
    const layout = resistorChain(n, false)
    bench(`${n} nodes`, () => {
      const engine = new SimEngine(layout)
      if (engine.time !== 0) throw new Error('unexpected initial time')
    })
  }
})
