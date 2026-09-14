#!/usr/bin/env bash
set -euxo pipefail

UPSTREAM_SHA=d5446b4aa9a1b035aff74eba082611822676f285
rm -rf /tmp/esp32sim /tmp/ohmlet-esp32-runtime
git clone https://github.com/joakimeriksson/esp32sim.git /tmp/esp32sim
cd /tmp/esp32sim
git checkout "$UPSTREAM_SHA"

python3 - <<'PY'
from pathlib import Path

# Export GPIO output latch + output-enable masks from the S3 machine.
p = Path('wasm/src/lib.rs')
s = p.read_text()
marker = '/// The page is the one client: messages queue in a `WebServer` sink; the worker paces the run.\n'
patch = '''
/// Ohmlet bridge: current GPIO output latch and output-enable masks for the
/// ESP32-S3. JavaScript receives u64 exports as BigInt. Other chips return 0.
#[no_mangle]
pub unsafe extern "C" fn esp32sim_gpio_out(e: *mut Emu) -> u64 {
    if e.is_null() { return 0; }
    let emu = unsafe { &mut *e };
    emu.m.as_any_mut().downcast_mut::<esp32s3::Machine>()
        .map(|m| m.bus.periph.gpio.out).unwrap_or(0)
}
#[no_mangle]
pub unsafe extern "C" fn esp32sim_gpio_enable(e: *mut Emu) -> u64 {
    if e.is_null() { return 0; }
    let emu = unsafe { &mut *e };
    emu.m.as_any_mut().downcast_mut::<esp32s3::Machine>()
        .map(|m| m.bus.periph.gpio.enable).unwrap_or(0)
}
'''
if 'esp32sim_gpio_enable' not in s:
    if marker not in s:
        raise SystemExit('esp32sim wasm patch marker not found')
    p.write_text(s.replace(marker, patch + '\n' + marker))

# The documented web protocol contains {t:"gpio",pin,level}; this pinned
# upstream revision did not yet dispatch that message for S3. Add it so Ohmlet
# can feed the solved breadboard voltage back into firmware GPIO inputs.
p = Path('esp-soc/src/machine.rs')
s = p.read_text()
needle = '            match t.as_str() {\n                "btn" =>'
replacement = '''            match t.as_str() {
                "gpio" => {
                    let pin: u8 = json_str(&m, "pin").and_then(|x| x.parse().ok()).unwrap_or(0);
                    let level = json_str(&m, "level").unwrap_or_default() == "1";
                    self.bus.gpio_set_input(pin, level);
                    *self.bus.irq_dirty() = true;
                }
                "btn" =>'''
if '"gpio" => {' not in s:
    if needle not in s:
        raise SystemExit('esp32sim machine GPIO input marker not found')
    p.write_text(s.replace(needle, replacement, 1))

# Publish output state only when it changes, keeping the browser bridge cheap.
w = Path('web/wasm/worker.js')
s = w.read_text()
old = 'let wasm = null, emu = 0, running = false, t0 = 0, resyncs = 0, lastStat = { wall: 0, insns: 0, cycles: 0 };'
new = old + '''
let lastGpioOut = -1n, lastGpioEnable = -1n;
function pushGpio() {
  if (!emu || !wasm.esp32sim_gpio_out || !wasm.esp32sim_gpio_enable) return;
  const out = wasm.esp32sim_gpio_out(emu), enable = wasm.esp32sim_gpio_enable(emu);
  if (out === lastGpioOut && enable === lastGpioEnable) return;
  lastGpioOut = out; lastGpioEnable = enable;
  postMessage({ gpio: { out: out.toString(16), enable: enable.toString(16) } });
}
'''
if 'function pushGpio()' not in s:
    if old not in s:
        raise SystemExit('esp32sim worker state marker not found')
    s = s.replace(old, new)
    needle = '    drain();\n'
    if needle not in s:
        raise SystemExit('esp32sim worker drain marker not found')
    s = s.replace(needle, needle + '    pushGpio();\n', 1)
    create = '      pendingInputTrace = [];\n'
    if create in s:
        s = s.replace(create, create + '      lastGpioOut = -1n; lastGpioEnable = -1n;\n', 1)
    w.write_text(s)
PY

rustup target add wasm32-unknown-unknown
tools/wasm-build.sh

mkdir -p /tmp/ohmlet-esp32-runtime
cp web/wasm/esp32sim.wasm /tmp/ohmlet-esp32-runtime/
cp web/wasm/worker.js /tmp/ohmlet-esp32-runtime/
cp web/wasm/jit.mjs /tmp/ohmlet-esp32-runtime/
cp web/wasm/pacing.mjs /tmp/ohmlet-esp32-runtime/
curl -fL https://joakimeriksson.github.io/esp32sim/wasm/fw/esp32s3_rev0_rom.elf -o /tmp/ohmlet-esp32-runtime/esp32s3_rev0_rom.elf
ls -lh /tmp/ohmlet-esp32-runtime
