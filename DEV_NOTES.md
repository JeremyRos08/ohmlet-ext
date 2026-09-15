# ohmlet-ext development notes

This fork is reserved for local optimization and feature extensions.

## Development branch

Work happens on `develop`. Keep `main` close to upstream Ohmlet until a tested release is ready.

## Arduino checkpoint — 2026-09-15

Uno/Nano firmware controls, movable windows, AVR GPIO/ADC bridge and board
meshes are integrated on `develop`. AVR8js 0.21.1 is now bundled in the firmware
worker, rather than fetched from a CDN at boot. The ATmega328P program memory
is 32 kB (16K words).

Serial input is queued at the emulated UART's receive rate; output is flushed
at the UI refresh interval even for `Serial.print` without a newline. The
monitor encodes/decodes UTF-8. Regression tests use the real AVR8js UART.

Validation: typecheck, 581 tests and production build pass. This does not
establish full Arduino peripheral compatibility or validate a particular
user sketch. Next useful check: flash a representative Uno/Nano HEX and
exercise its GPIO/ADC connections and serial monitor in the browser.

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
