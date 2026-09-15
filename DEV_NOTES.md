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

## Workbench checkpoint — 2026-09-15

The scope now supports 10 ms capture, freeze/resume, CSV export, trigger
edges, channel enable, and min/max/Vpp/mean/RMS/frequency/duty measurements.
The 3D workbench adds isometric/top/front/side camera views, selection focus,
and an electrical-net inspector that highlights connected holes, pins, and
wires with the live measured voltage when simulation is running.

Arduino USB power is treated as a valid supply and ground reference, so a
standalone Uno/Nano divider can be simulated without adding a virtual bench
power supply. Endpoint voltage lookups are cached per engine topology.

## USB / COM boundary

The Arduino firmware panel now exposes a Web Serial bridge. On Chrome or Edge
over HTTPS/localhost, `Connecter USB` requests a real USB CDC/UART device at a
chosen baud rate. Bytes from that device are injected into the emulated
ATmega328P UART; `Serial.print` bytes are sent back to the device and mirrored
in the monitor. The transport is isolated in `src/firmware/web-serial.ts` so a
native Ohmlet companion can later implement a true virtual COM endpoint using
the same send/receive contract.

Browser JavaScript cannot create a Windows device-manager COM port by itself.
That last step requires a signed native driver/companion (for example a
loopback COM pair or a virtual USB CDC device); the UI deliberately labels the
browser bridge as Web Serial instead of pretending it is an OS port.

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
