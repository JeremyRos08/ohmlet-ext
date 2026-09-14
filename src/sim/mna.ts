/**
 * Dense nodal-analysis solver (Norton-only stamps) for the simulator.
 * Owned by the sim-core agent.
 *
 * The matrix is a pure conductance matrix: every source is stamped as a
 * Norton equivalent (G += 1/rout, I += v/rout). No group-2 voltage-source
 * rows exist. A gmin leak (1e-9 S) from every node to ground keeps floating
 * nets from making the matrix singular.
 *
 * Nonlinear devices iterate Newton-Raphson around the solve: each iteration
 * the devices restamp their linearized companions at the current candidate
 * solution (with pn-junction voltage-step limiting via `pnLimit`).
 *
 * Linear circuits reuse their LU decomposition when the matrix stamp stream
 * is exactly identical to the one that produced the current factorization.
 * The signature records matrix-operation indices + values (not a hash), so
 * reuse is collision-free. The dense matrix itself is materialized only when
 * that signature changes; steady-state steps touch O(stamps) matrix metadata
 * instead of clearing/rebuilding O(N²) storage. Matching stable stamps are
 * compared directly against the cached signature without being copied into a
 * second buffer. RHS-only changes never invalidate the LU factors.
 *
 * The factorization remains dense for numerical simplicity, but cached solves
 * remember the first/last non-zero factor in every triangular row. Sparse and
 * banded breadboard networks therefore skip the large zero regions during
 * forward/back substitution without changing the LU mathematics.
 */

/** Leak conductance from every node to ground (S). */
export const GMIN = 1e-9
/** Maximum Newton-Raphson iterations per solve. */
export const NR_MAX_ITERS = 40
/** Newton-Raphson absolute convergence tolerance (V). */
export const NR_TOL = 1e-6
/** Maximum pn-junction voltage step per NR iteration (V). */
export const PN_MAX_STEP = 0.5

/**
 * SPICE-style junction voltage limiting: clamp the change of a junction
 * voltage between NR iterations to ±maxStep so the exponential diode law
 * cannot explode. Returns the limited voltage.
 */
export function pnLimit(vNew: number, vOld: number, maxStep: number = PN_MAX_STEP): number {
  const dv = vNew - vOld
  if (dv > maxStep) return vOld + maxStep
  if (dv < -maxStep) return vOld - maxStep
  return vNew
}

/**
 * Stamping interface handed to devices/chips. Node index -1 means ground
 * (the reference): stamps touching ground rows/columns are silently dropped,
 * which is exactly the reduced-MNA behavior.
 */
export interface StampContext {
  readonly nodeCount: number
  /** Raw matrix element: A[row][col] += value (skipped for ground nodes). */
  addElement(row: number, col: number, value: number): void
  /** Two-terminal conductance g between nodes a and b. */
  addConductance(a: number, b: number, g: number): void
  /** Independent current source injecting `current` amps INTO `node`. */
  addCurrent(node: number, current: number): void
  /** Thevenin source {v, rout} between plus and minus, stamped as a Norton. */
  addNorton(plus: number, minus: number, v: number, rout: number): void
}

const SINGULAR_EPS = 1e-13
const INITIAL_STAMP_CAPACITY = 64

export class MnaSystem implements StampContext {
  readonly nodeCount: number

  /** workspace for NR (the "next" candidate solution) */
  readonly scratch: Float64Array

  /** Dense matrix workspace, populated lazily only when LU must be rebuilt. */
  private readonly a: Float64Array
  private readonly b: Float64Array // stamped RHS current vector
  private readonly lu: Float64Array // LU factors (in place, unit lower diag)
  private readonly perm: Int32Array // row-swap record from partial pivoting
  /** First potentially non-zero L column for each row (inclusive). */
  private readonly lowerStart: Int32Array
  /** Last potentially non-zero U column for each row (inclusive). */
  private readonly upperEnd: Int32Array
  private hasFactor = false
  private factorHasRowSwaps = false

  /**
   * Exact matrix-stamp signature for the currently cached LU factorization.
   * Each entry is one matrix mutation: flat matrix index + exact JS number.
   * GMIN is implicit because it is constant for this fixed-size system.
   */
  private prevStampIndex = new Int32Array(INITIAL_STAMP_CAPACITY)
  private prevStampValue = new Float64Array(INITIAL_STAMP_CAPACITY)
  private prevStampCount = 0

  /**
   * Reusable buffers for a changed stamping pass. While the pass still exactly
   * matches the cached signature no writes are made here; on the first
   * mismatch the already-matched prefix is copied once and capture continues.
   */
  private currStampIndex = new Int32Array(INITIAL_STAMP_CAPACITY)
  private currStampValue = new Float64Array(INITIAL_STAMP_CAPACITY)
  private currStampCount = 0
  private stampMatchesFactor = false

  constructor(nodeCount: number) {
    const n = Math.max(0, nodeCount | 0)
    this.nodeCount = n
    this.a = new Float64Array(n * n)
    this.b = new Float64Array(n)
    this.lu = new Float64Array(n * n)
    this.perm = new Int32Array(n)
    this.lowerStart = new Int32Array(n)
    this.upperEnd = new Int32Array(n)
    this.scratch = new Float64Array(n)
  }

  /**
   * Start a fresh stamping pass. Matrix contributions are checked against the
   * exact cached signature first; the dense matrix is rebuilt lazily only when
   * factorIfNeeded() discovers that the cached LU cannot be reused.
   */
  beginStamp(): void {
    this.b.fill(0)
    this.currStampCount = 0
    this.stampMatchesFactor = this.hasFactor
  }

  addElement(row: number, col: number, value: number): void {
    if (row < 0 || col < 0) return
    const idx = row * this.nodeCount + col
    this.recordMatrixStamp(idx, value)
  }

  addConductance(a: number, b: number, g: number): void {
    if (a >= 0) this.addElement(a, a, g)
    if (b >= 0) this.addElement(b, b, g)
    if (a >= 0 && b >= 0) {
      this.addElement(a, b, -g)
      this.addElement(b, a, -g)
    }
  }

  addCurrent(node: number, current: number): void {
    if (node >= 0) this.b[node] += current
  }

  addNorton(plus: number, minus: number, v: number, rout: number): void {
    const r = rout > 1e-6 ? rout : 1e-6
    const g = 1 / r
    this.addConductance(plus, minus, g)
    this.addCurrent(plus, v * g)
    this.addCurrent(minus, -v * g)
  }

  /**
   * Factor the stamped matrix with LU + partial pivoting, unless its exact
   * matrix-stamp stream is identical to the one that produced the cached LU.
   *
   * Comparing stamp operations is O(number of actual matrix contributions)
   * and exact: identical indices + values in identical order necessarily
   * produce the same matrix. A different stream conservatively refactors even
   * if two different stamp sequences happen to sum to the same final matrix.
   */
  factorIfNeeded(): boolean {
    const n = this.nodeCount
    if (n === 0) return true

    if (this.hasFactor && this.stampMatchesFactor) {
      if (this.currStampCount === this.prevStampCount) return true
      // A pass that ended early matched a prefix of the old signature. Capture
      // that shorter prefix so it can be materialized/factored as a new matrix.
      this.captureMatchingPrefix(this.currStampCount)
      this.stampMatchesFactor = false
    }

    this.materializeMatrix()
    const lu = this.lu
    lu.set(this.a)
    const perm = this.perm
    let rowSwaps = false

    for (let k = 0; k < n; k++) {
      // partial pivoting: pick the largest |entry| in column k at/below row k
      let p = k
      let max = Math.abs(lu[k * n + k])
      for (let i = k + 1; i < n; i++) {
        const v = Math.abs(lu[i * n + k])
        if (v > max) {
          max = v
          p = i
        }
      }
      if (!(max > SINGULAR_EPS)) {
        this.hasFactor = false
        this.factorHasRowSwaps = false
        return false
      }
      perm[k] = p
      if (p !== k) {
        rowSwaps = true
        for (let j = 0; j < n; j++) {
          const t = lu[k * n + j]
          lu[k * n + j] = lu[p * n + j]
          lu[p * n + j] = t
        }
      }
      const pivInv = 1 / lu[k * n + k]
      for (let i = k + 1; i < n; i++) {
        const m = lu[i * n + k] * pivInv
        lu[i * n + k] = m
        if (m !== 0) {
          for (let j = k + 1; j < n; j++) lu[i * n + j] -= m * lu[k * n + j]
        }
      }
    }
    this.hasFactor = true
    this.factorHasRowSwaps = rowSwaps
    this.analyzeFactorBands()
    this.commitStampSignature()
    return true
  }

  /** Solve A x = b using the current factorization, writing into `x`. */
  solveInto(x: Float64Array): void {
    const n = this.nodeCount
    if (n === 0) return
    if (!this.hasFactor) return
    const lu = this.lu
    x.set(this.b)
    // Most passive conductance matrices need no pivot row swaps. Skip the
    // whole permutation walk in that common case.
    if (this.factorHasRowSwaps) {
      const perm = this.perm
      for (let k = 0; k < n; k++) {
        const p = perm[k]
        if (p !== k) {
          const t = x[k]
          x[k] = x[p]
          x[p] = t
        }
      }
    }
    // forward substitution (L has unit diagonal). Cached row bounds skip the
    // structural zero prefix common in sparse/banded breadboard networks.
    for (let i = 1; i < n; i++) {
      let s = x[i]
      const row = i * n
      for (let j = this.lowerStart[i]; j < i; j++) s -= lu[row + j] * x[j]
      x[i] = s
    }
    // back substitution. Likewise skip the structural zero suffix of U.
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i]
      const row = i * n
      const end = this.upperEnd[i]
      for (let j = i + 1; j <= end; j++) s -= lu[row + j] * x[j]
      x[i] = s / lu[row + i]
    }
  }

  /** Build the dense conductance matrix only on an actual refactor path. */
  private materializeMatrix(): void {
    const n = this.nodeCount
    const a = this.a
    a.fill(0)
    for (let i = 0; i < n; i++) a[i * n + i] = GMIN
    for (let i = 0; i < this.currStampCount; i++) {
      a[this.currStampIndex[i]] += this.currStampValue[i]
    }
  }

  /**
   * Record conservative contiguous non-zero bounds for L and U. The one-time
   * O(N²) scan happens only after refactorization and lets every later solve
   * skip zeros outside each row's active band. Exact `!== 0` checks preserve
   * all numerical values; no tolerance or approximation is introduced.
   */
  private analyzeFactorBands(): void {
    const n = this.nodeCount
    const lu = this.lu
    for (let i = 0; i < n; i++) {
      const row = i * n
      let lo = i
      for (let j = 0; j < i; j++) {
        if (lu[row + j] !== 0) {
          lo = j
          break
        }
      }
      let hi = i
      for (let j = n - 1; j > i; j--) {
        if (lu[row + j] !== 0) {
          hi = j
          break
        }
      }
      this.lowerStart[i] = lo
      this.upperEnd[i] = hi
    }
  }

  /** Append one exact matrix operation to the current pass. */
  private recordMatrixStamp(index: number, value: number): void {
    const pos = this.currStampCount

    if (this.stampMatchesFactor) {
      if (
        pos < this.prevStampCount &&
        this.prevStampIndex[pos] === index &&
        this.prevStampValue[pos] === value
      ) {
        // Stable fast path: compare only. Do not rewrite a duplicate signature.
        this.currStampCount = pos + 1
        return
      }
      // First mismatch: copy the already-matched prefix once, then capture the
      // changed suffix normally so factorIfNeeded() can materialize it.
      this.captureMatchingPrefix(pos)
      this.stampMatchesFactor = false
    }

    this.ensureCurrentStampCapacity(pos + 1)
    this.currStampIndex[pos] = index
    this.currStampValue[pos] = value
    this.currStampCount = pos + 1
  }

  private captureMatchingPrefix(count: number): void {
    if (count <= 0) return
    this.ensureCurrentStampCapacity(count)
    this.currStampIndex.set(this.prevStampIndex.subarray(0, count), 0)
    this.currStampValue.set(this.prevStampValue.subarray(0, count), 0)
  }

  private ensureCurrentStampCapacity(minCapacity: number): void {
    if (minCapacity <= this.currStampIndex.length) return
    let capacity = Math.max(INITIAL_STAMP_CAPACITY, this.currStampIndex.length)
    while (capacity < minCapacity) capacity *= 2

    const indices = new Int32Array(capacity)
    indices.set(this.currStampIndex.subarray(0, this.currStampCount))
    this.currStampIndex = indices

    const values = new Float64Array(capacity)
    values.set(this.currStampValue.subarray(0, this.currStampCount))
    this.currStampValue = values
  }

  /**
   * Make the just-factored stamp stream the reference signature without
   * allocating/copying it: swap the reusable current/previous buffers.
   */
  private commitStampSignature(): void {
    const oldIndex = this.prevStampIndex
    this.prevStampIndex = this.currStampIndex
    this.currStampIndex = oldIndex

    const oldValue = this.prevStampValue
    this.prevStampValue = this.currStampValue
    this.currStampValue = oldValue

    this.prevStampCount = this.currStampCount
    this.currStampCount = 0
  }
}

export interface NewtonResult {
  converged: boolean
  iterations: number
  singular: boolean
}

/**
 * Newton-Raphson outer loop. `stampAll(x)` must restamp every device at the
 * candidate solution `x` (devices apply their own junction limiting and
 * remember the limited operating point between iterations).
 *
 * `x` is used as the initial guess and receives the final solution.
 */
export function solveNewton(
  sys: MnaSystem,
  stampAll: (x: Float64Array) => void,
  x: Float64Array,
  maxIter: number = NR_MAX_ITERS,
  tol: number = NR_TOL,
): NewtonResult {
  const n = sys.nodeCount
  if (n === 0) return { converged: true, iterations: 0, singular: false }
  const xNext = sys.scratch

  for (let iter = 1; iter <= maxIter; iter++) {
    sys.beginStamp()
    stampAll(x)
    if (!sys.factorIfNeeded()) {
      return { converged: false, iterations: iter, singular: true }
    }
    sys.solveInto(xNext)

    let maxDelta = 0
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xNext[i] - x[i])
      if (d > maxDelta) maxDelta = d
    }
    x.set(xNext)
    if (maxDelta < tol) return { converged: true, iterations: iter, singular: false }
    if (!Number.isFinite(maxDelta)) return { converged: false, iterations: iter, singular: false }
  }
  return { converged: false, iterations: maxIter, singular: false }
}
