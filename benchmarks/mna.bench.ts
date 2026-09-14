import { bench, describe } from 'vitest'
import { MnaSystem, solveNewton } from '../src/sim/mna'

/**
 * Synthetic but deterministic MNA benchmarks.
 *
 * Goal: track solver scaling independently from rendering/UI work. The
 * circuits are simple resistor ladders so changes in timings mostly reflect
 * matrix stamping/factorization/solve cost rather than model complexity.
 *
 * Run with: npm run bench:sim
 */

const SIZES = [10, 25, 50, 100, 200] as const

function stampLadder(sys: MnaSystem, current = 1e-3): void {
  const n = sys.nodeCount
  const gSeries = 1 / 1_000
  const gShunt = 1 / 100_000

  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? -1 : i - 1
    sys.addConductance(i, prev, gSeries)
    sys.addConductance(i, -1, gShunt)
  }
  if (n > 0) sys.addCurrent(n - 1, current)
}

function warmLinearSystem(n: number): { sys: MnaSystem; x: Float64Array } {
  const sys = new MnaSystem(n)
  const x = new Float64Array(n)
  sys.beginStamp()
  stampLadder(sys)
  if (!sys.factorIfNeeded()) throw new Error(`unexpected singular matrix at n=${n}`)
  sys.solveInto(x)
  return { sys, x }
}

describe('MNA dense solver — cached LU (steady-state linear step)', () => {
  for (const n of SIZES) {
    const { sys, x } = warmLinearSystem(n)
    let phase = 0

    bench(`${n} nodes`, () => {
      // Same matrix, slightly different RHS. factorIfNeeded() should reuse LU.
      phase ^= 1
      sys.beginStamp()
      stampLadder(sys, phase ? 1e-3 : 1.001e-3)
      if (!sys.factorIfNeeded()) throw new Error('singular matrix')
      sys.solveInto(x)
    })
  }
})

describe('MNA dense solver — forced refactor + solve', () => {
  for (const n of SIZES) {
    const sys = new MnaSystem(n)
    const x = new Float64Array(n)
    let phase = 0

    bench(`${n} nodes`, () => {
      phase ^= 1
      sys.beginStamp()
      stampLadder(sys)
      // Toggle one conductance so the matrix is different every iteration and
      // LU factorization cannot be reused.
      sys.addConductance(n - 1, -1, phase ? 1e-8 : 2e-8)
      if (!sys.factorIfNeeded()) throw new Error('singular matrix')
      sys.solveInto(x)
    })
  }
})

describe('MNA Newton loop — repeated nonlinear-style restamping', () => {
  for (const n of SIZES.filter((size) => size <= 100)) {
    const sys = new MnaSystem(n)
    const x = new Float64Array(n)

    bench(`${n} nodes`, () => {
      x.fill(0)
      const res = solveNewton(
        sys,
        (candidate) => {
          stampLadder(sys)
          // A smooth voltage-dependent shunt. This is intentionally synthetic:
          // it makes each Newton iteration change the matrix and therefore
          // exercises the expensive nonlinear solver path deterministically.
          for (let i = 0; i < n; i++) {
            const v = candidate[i]
            const g = 1e-6 + Math.min(Math.abs(v), 10) * 2e-7
            sys.addConductance(i, -1, g)
          }
        },
        x,
        12,
        1e-5,
      )
      if (res.singular) throw new Error('singular matrix')
    })
  }
})
