import { describe, expect, it } from 'vitest'
import { MnaSystem } from '../src/sim/mna'

function solveOneNode(sys: MnaSystem, g: number, current: number): number {
  const x = new Float64Array(1)
  sys.beginStamp()
  sys.addConductance(0, -1, g)
  sys.addCurrent(0, current)
  expect(sys.factorIfNeeded()).toBe(true)
  sys.solveInto(x)
  return x[0]
}

describe('MnaSystem LU stamp-signature cache', () => {
  it('reuses the factorization safely when only the RHS changes', () => {
    const sys = new MnaSystem(1)
    expect(solveOneNode(sys, 1, 1)).toBeCloseTo(1, 8)
    expect(solveOneNode(sys, 1, 2)).toBeCloseTo(2, 8)
  })

  it('invalidates cached LU when a matrix stamp value changes', () => {
    const sys = new MnaSystem(1)
    expect(solveOneNode(sys, 1, 2)).toBeCloseTo(2, 8)
    // If the old 1 S LU were incorrectly reused this would still read ~2 V.
    expect(solveOneNode(sys, 2, 2)).toBeCloseTo(1, 8)
  })

  it('invalidates cached LU when the stamp topology changes', () => {
    const sys = new MnaSystem(2)
    const x = new Float64Array(2)

    sys.beginStamp()
    sys.addConductance(0, -1, 1)
    sys.addConductance(1, -1, 2)
    sys.addCurrent(0, 1)
    sys.addCurrent(1, 2)
    expect(sys.factorIfNeeded()).toBe(true)
    sys.solveInto(x)
    expect(x[0]).toBeCloseTo(1, 8)
    expect(x[1]).toBeCloseTo(1, 8)

    // Same number of high-level devices, different matrix operation stream:
    // node 0 and node 1 are now coupled, with node 1 shunted to ground.
    sys.beginStamp()
    sys.addConductance(0, 1, 1)
    sys.addConductance(1, -1, 1)
    sys.addCurrent(0, 1)
    expect(sys.factorIfNeeded()).toBe(true)
    sys.solveInto(x)
    expect(x[0]).toBeCloseTo(2, 7)
    expect(x[1]).toBeCloseTo(1, 7)
  })

  it('drops a previous factorization when a changed matrix is singular', () => {
    const sys = new MnaSystem(2)
    const x = new Float64Array(2)

    sys.beginStamp()
    sys.addConductance(0, -1, 1)
    sys.addConductance(1, -1, 1)
    expect(sys.factorIfNeeded()).toBe(true)
    sys.solveInto(x)

    // GMIN keeps ordinary floating nodes solvable, so use a cancelling stamp
    // to zero both diagonals exactly and force the singular path.
    sys.beginStamp()
    sys.addElement(0, 0, -1e-9)
    sys.addElement(1, 1, -1e-9)
    expect(sys.factorIfNeeded()).toBe(false)
  })
})
