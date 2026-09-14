# ohmlet-ext development notes

This fork is reserved for local optimization and feature extensions.

## Development branch

Work happens on `develop`. Keep `main` close to upstream Ohmlet until a tested release is ready.

## Validation

Before merging substantial changes:

```bash
npm run typecheck
npm test
npm run build
```

Simulation performance baseline:

```bash
npm run bench:sim
```

See `PERFORMANCE.md` for the optimization roadmap and benchmark rules.

## Current priorities

1. establish reproducible solver benchmarks;
2. profile simulation/telemetry allocations;
3. optimize dense MNA without changing electrical results;
4. evaluate a Web Worker and sparse/WASM solver once benchmarks justify it;
5. then expand instruments and the component library.
