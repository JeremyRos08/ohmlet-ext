# ohmlet-ext performance plan

This fork treats performance changes as measurable engineering work: benchmark first, optimize second, keep electrical behavior covered by the existing test suite.

## Baseline commands

```bash
npm run typecheck
npm test
npm run bench:sim
```

The simulation benchmark exercises the dense MNA solver at 10, 25, 50, 100 and 200 nodes. It reports three paths:

1. **cached LU** — steady-state linear simulation where the conductance matrix is unchanged and the existing LU factors are reused;
2. **forced refactor + solve** — matrix changes every iteration, exposing dense-LU scaling;
3. **Newton loop** — repeated nonlinear-style restamping and factorization.

Record benchmark output before and after solver changes. Absolute timings vary by machine; relative changes on the same machine are what matter.

## Current architecture / likely limits

- Electrical simulation uses a custom dense nodal-analysis matrix (`Float64Array`, N×N) with LU + partial pivoting.
- Linear circuits can reuse their LU factorization when the matrix is bit-identical between steps.
- Nonlinear circuits use Newton-Raphson and can refactor repeatedly per simulation step.
- The UI simulation loop has an 8 ms wall-clock budget per animation frame, so slow simulation falls behind rather than freezing the interface.
- Three.js already includes several useful optimizations: frozen static transforms, render-mode throttling, shader warm-up, hover-raycast gating while orbiting, and a single shadow-map budget.

## Optimization order

### Phase 1 — measurement and low-risk cleanup

- Keep the benchmark suite in-tree.
- Measure solver scaling on the development machine.
- Profile allocations in telemetry and simulation loops.
- Avoid behavior changes unless covered by tests.

### Phase 2 — dense solver improvements

Candidates, in roughly increasing risk order:

- avoid unnecessary matrix scans / copies when topology and conductances are known unchanged;
- track matrix-dirty state explicitly for runtime-adjustable components;
- reduce repeated stamping work for static linear devices;
- separate matrix stamps from RHS-only stamps when possible;
- add solver statistics (factorizations, NR iterations, singular events) behind a development-only interface.

### Phase 3 — larger circuits

Dense LU scales poorly as net count grows. For genuinely large boards, investigate a sparse representation / sparse LU or a WebAssembly solver. Do not replace the current solver until benchmarks show the crossover point and regression tests cover representative analog circuits.

### Phase 4 — rendering and worker split

Only after simulation profiling:

- consider moving the electrical engine to a Web Worker so large solves cannot contend with pointer/render work;
- batch telemetry transfer at a controlled rate;
- keep the 3D scene on the main thread.

## Rule for new features

New component models should include correctness tests and, when they are computationally expensive, a benchmark case. Performance changes should keep `npm test` and `npm run typecheck` clean before merge.
