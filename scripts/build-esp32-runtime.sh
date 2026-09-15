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

# A small RA8875 board model for the EastRising 5" module used by Ohmlet.
# It understands the RA8875 SPI command/data prefixes, register reads, direct
# GRAM pixel writes and the common Adafruit hardware line/rectangle/circle
# commands. Read-status operations complete immediately so library waitPoll()
# behaves like real hardware after the accelerated operation has completed.
board = r'''use esp_soc::board::BoardModel;

const W: usize = 800;
const H: usize = 480;
const CMDWRITE: u8 = 0x80;
const DATAWRITE: u8 = 0x00;
const DATAREAD: u8 = 0x40;
const CMDREAD: u8 = 0xc0;
const MRWC: u8 = 0x02;
const MWCR0: usize = 0x40;
const CURH0: usize = 0x46;
const CURH1: usize = 0x47;
const CURV0: usize = 0x48;
const CURV1: usize = 0x49;

pub struct OhmletRa8875 {
    regs: [u8; 256],
    gram: Vec<u16>,
    reg: u8,
    pixel_hi: Option<u8>,
    version: u64,
    frames: u64,
}

impl OhmletRa8875 {
    pub fn new() -> Self {
        let mut regs = [0u8; 256];
        regs[0] = 0x75; // RA8875 device id expected by Adafruit_RA8875::begin()
        Self { regs, gram: vec![0; W * H], reg: 0, pixel_hi: None, version: 1, frames: 0 }
    }

    fn word(&self, lo: usize, hi: usize) -> usize {
        self.regs[lo] as usize | ((self.regs[hi] as usize) << 8)
    }
    fn fg(&self) -> u16 {
        ((self.regs[0x63] as u16 & 0x1f) << 11)
            | ((self.regs[0x64] as u16 & 0x3f) << 5)
            | (self.regs[0x65] as u16 & 0x1f)
    }
    fn put(&mut self, x: i32, y: i32, c: u16) {
        if x >= 0 && y >= 0 && x < W as i32 && y < H as i32 {
            let i = y as usize * W + x as usize;
            if self.gram[i] != c { self.gram[i] = c; self.version = self.version.wrapping_add(1); }
        }
    }
    fn cursor(&self) -> (usize, usize) { (self.word(CURH0, CURH1), self.word(CURV0, CURV1)) }
    fn set_cursor(&mut self, x: usize, y: usize) {
        self.regs[CURH0] = x as u8; self.regs[CURH1] = (x >> 8) as u8;
        self.regs[CURV0] = y as u8; self.regs[CURV1] = (y >> 8) as u8;
    }
    fn advance_cursor(&mut self) {
        let (mut x, mut y) = self.cursor();
        match self.regs[MWCR0] & 0x0c {
            0x04 => { if x == 0 { x = W - 1; y = (y + 1) % H; } else { x -= 1; } }
            0x08 => { y += 1; if y >= H { y = 0; x = (x + 1) % W; } }
            0x0c => { if y == 0 { y = H - 1; x = (x + 1) % W; } else { y -= 1; } }
            _ => { x += 1; if x >= W { x = 0; y = (y + 1) % H; } }
        }
        self.set_cursor(x, y);
    }
    fn pixel_byte(&mut self, b: u8) {
        if let Some(hi) = self.pixel_hi.take() {
            let c = ((hi as u16) << 8) | b as u16;
            let (x, y) = self.cursor();
            self.put(x as i32, y as i32, c);
            self.advance_cursor();
        } else { self.pixel_hi = Some(b); }
    }
    fn line(&mut self, mut x0: i32, mut y0: i32, x1: i32, y1: i32, c: u16) {
        let dx = (x1 - x0).abs(); let sx = if x0 < x1 { 1 } else { -1 };
        let dy = -(y1 - y0).abs(); let sy = if y0 < y1 { 1 } else { -1 };
        let mut err = dx + dy;
        loop {
            self.put(x0, y0, c);
            if x0 == x1 && y0 == y1 { break; }
            let e2 = 2 * err;
            if e2 >= dy { err += dy; x0 += sx; }
            if e2 <= dx { err += dx; y0 += sy; }
        }
    }
    fn rect(&mut self, x0: i32, y0: i32, x1: i32, y1: i32, c: u16, fill: bool) {
        let (xa, xb) = (x0.min(x1), x0.max(x1)); let (ya, yb) = (y0.min(y1), y0.max(y1));
        if fill {
            for y in ya..=yb { for x in xa..=xb { self.put(x, y, c); } }
        } else {
            self.line(xa, ya, xb, ya, c); self.line(xb, ya, xb, yb, c);
            self.line(xb, yb, xa, yb, c); self.line(xa, yb, xa, ya, c);
        }
    }
    fn circle(&mut self, cx: i32, cy: i32, r: i32, c: u16, fill: bool) {
        let r = r.max(0);
        for y in -r..=r {
            let xx = ((r * r - y * y).max(0) as f64).sqrt() as i32;
            if fill { for x in -xx..=xx { self.put(cx + x, cy + y, c); } }
            else { self.put(cx - xx, cy + y, c); self.put(cx + xx, cy + y, c); }
        }
    }
    fn execute_dcr(&mut self, v: u8) {
        let c = self.fg();
        if v & 0x40 != 0 {
            let cx = self.word(0x99, 0x9a) as i32; let cy = self.word(0x9b, 0x9c) as i32;
            self.circle(cx, cy, self.regs[0x9d] as i32, c, v & 0x20 != 0);
        } else if v & 0x80 != 0 {
            let x0 = self.word(0x91, 0x92) as i32; let y0 = self.word(0x93, 0x94) as i32;
            let x1 = self.word(0x95, 0x96) as i32; let y1 = self.word(0x97, 0x98) as i32;
            if v & 0x10 != 0 { self.rect(x0, y0, x1, y1, c, v & 0x20 != 0); }
            else { self.line(x0, y0, x1, y1, c); }
        }
        self.regs[0x90] = v & !(0x80 | 0x40); // accelerated op has completed
        self.frames = self.frames.wrapping_add(1);
    }
    fn write_reg(&mut self, reg: u8, v: u8) {
        self.regs[reg as usize] = v;
        match reg {
            0x01 if v & 0x01 != 0 => { self.gram.fill(0); self.version = self.version.wrapping_add(1); }
            0x8e if v & 0x80 != 0 => { self.gram.fill(0); self.version = self.version.wrapping_add(1); self.frames = self.frames.wrapping_add(1); self.regs[0x8e] = 0; }
            0x90 => self.execute_dcr(v),
            _ => {}
        }
    }
    fn tx(&mut self, data: &[u8]) {
        if data.is_empty() { return; }
        match data[0] {
            CMDWRITE => {
                if data.len() >= 2 { self.reg = data[1]; self.pixel_hi = None; }
            }
            DATAWRITE => {
                if self.reg == MRWC {
                    for &b in &data[1..] { self.pixel_byte(b); }
                    if data.len() > 1 { self.frames = self.frames.wrapping_add(1); }
                } else {
                    for &b in &data[1..] { self.write_reg(self.reg, b); }
                }
            }
            _ => {
                // Some Arduino/IDF SPI paths split the prefix and payload into
                // separate GP-SPI emissions. Treat an unprefixed payload as the
                // continuation of the currently selected register.
                if self.reg == MRWC { for &b in data { self.pixel_byte(b); } }
                else { for &b in data { self.write_reg(self.reg, b); } }
            }
        }
    }
}

impl BoardModel for OhmletRa8875 {
    fn name(&self) -> &'static str { "ohmlet-ra8875" }
    fn spi_tx(&mut self, _host: u8, data: &[u8]) { self.tx(data); }
    fn spi_transfer(&mut self, _host: u8, tx: &[u8], rx_len: usize) -> Vec<u8> {
        let read = tx.first().copied() == Some(DATAREAD) || tx.first().copied() == Some(CMDREAD);
        if !read { self.tx(tx); }
        let mut rx = vec![0xff; rx_len];
        if read && !rx.is_empty() {
            let v = if tx.first().copied() == Some(CMDREAD) { 0 } else { self.regs[self.reg as usize] };
            let n = rx.len(); rx[n - 1] = v;
        }
        rx
    }
    fn display(&self) -> Option<(u32, u32, Vec<u16>, u64)> { Some((W as u32, H as u32, self.gram.clone(), self.version)) }
    fn display_version(&self) -> u64 { self.version }
    fn display_quiet_push(&self) -> bool { true }
    fn display_frames(&self) -> u64 { self.frames }
    fn gram(&self) -> Option<(Vec<u16>, usize, usize)> { Some((self.gram.clone(), W, H)) }
    fn report(&self) -> String { format!("[ohmlet] RA8875: {} updates, {} drawing bursts", self.version, self.frames) }
}
'''
Path('esp32s3/src/board/ohmlet_ra8875.rs').write_text(board)

p = Path('esp32s3/src/board/mod.rs')
s = p.read_text()
if 'pub mod ohmlet_ra8875;' not in s:
    s = s.replace('pub mod atech14;\n', 'pub mod atech14;\npub mod ohmlet_ra8875;\n')
    s = s.replace('pub use atech14::*;\n', 'pub use atech14::*;\npub use ohmlet_ra8875::*;\n')
    s = s.replace('        "none" | "bare" => Some(Box::new(NoBoard)),\n', '        "none" | "bare" => Some(Box::new(NoBoard)),\n        "ohmlet-ra8875" | "ra8875" => Some(Box::new(OhmletRa8875::new())),\n')
    p.write_text(s)

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
