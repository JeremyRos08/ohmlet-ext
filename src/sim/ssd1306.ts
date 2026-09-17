import { registerChip } from './chip-api'

/** SSD1306 display RAM and basic addressing, shared by the pin decoder and 3D view. */
export class SSD1306 {
  ram = new Uint8Array(1024)
  powered = false
  on = false
  inverse = false
  allOn = false
  segmentReverse = false
  comReverse = false
  startLine = 0
  contrast = 127
  mode = 2
  column = 0
  page = 0
  colStart = 0
  colEnd = 127
  pageStart = 0
  pageEnd = 7
  private command = 0
  private args: number[] = []
  private remaining = 0
  reset() {
    Object.assign(this, new SSD1306())
  }
  write(value: number, data: boolean) {
    value &= 255
    if (data) {
      this.ram[this.page * 128 + this.column] = value
      if (this.mode === 1) {
        if (++this.page > this.pageEnd) { this.page = this.pageStart; if (++this.column > this.colEnd) this.column = this.colStart }
      } else if (++this.column > (this.mode === 0 ? this.colEnd : 127)) {
        this.column = this.mode === 0 ? this.colStart : 0
        if (this.mode === 0 && ++this.page > this.pageEnd) this.page = this.pageStart
      }
      return
    }
    if (this.remaining) {
      this.args.push(value)
      if (--this.remaining) return
      const [a, b] = this.args
      if (this.command === 0x20) this.mode = a & 3
      if (this.command === 0x21) { this.colStart = a & 127; this.colEnd = Math.max(this.colStart, b & 127); this.column = this.colStart }
      if (this.command === 0x22) { this.pageStart = a & 7; this.pageEnd = Math.max(this.pageStart, b & 7); this.page = this.pageStart }
      if (this.command === 0x81) this.contrast = a
      return
    }
    this.command = value; this.args = []
    this.remaining = value === 0x21 || value === 0x22 ? 2 : [0x20,0x81,0x8d,0xa8,0xd3,0xd5,0xd9,0xda,0xdb].includes(value) ? 1 : 0
    if (value === 0xae || value === 0xaf) this.on = value === 0xaf
    if (value === 0xa4 || value === 0xa5) this.allOn = value === 0xa5
    if (value === 0xa6 || value === 0xa7) this.inverse = value === 0xa7
    if (value === 0xa0 || value === 0xa1) this.segmentReverse = value === 0xa1
    if (value === 0xc0 || value === 0xc8) this.comReverse = value === 0xc8
    if (value >= 0x40 && value <= 0x7f) this.startLine = value & 63
    if (value <= 0x0f) this.column = (this.column & 0x70) | value
    if (value >= 0x10 && value <= 0x1f) this.column = (this.column & 15) | ((value & 7) << 4)
    if (value >= 0xb0 && value <= 0xb7) this.page = value & 7
  }
  pixel(x: number, y: number) {
    if (!this.powered || !this.on) return false
    x = this.segmentReverse ? 127 - x : x
    y = ((this.comReverse ? 63 - y : y) + this.startLine) & 63
    const lit = this.allOn || !!(this.ram[(y >> 3) * 128 + x] & (1 << (y & 7)))
    return this.allOn || (lit !== this.inverse)
  }
}
const displays = new Map<string, SSD1306>()
export const getSSD1306 = (id: string) => displays.get(id)
registerChip('ssd1306', comp => {
  const display = new SSD1306()
  displays.set(comp.id, display)
  let clock = false, bits = 0, byte = 0, inReset = true
  return { comp, step(ctx) {
    const ground = ctx.readPin('GND')
    const supplies = ['VIN', '3V3'].map(p => ctx.readPin(p) - ground)
    const powered = Number.isFinite(ground) && supplies.some(v => v >= 2.7 && v <= 5.5)
    const high = (pin: string) => ctx.readPin(pin) - ground > 1.5
    const nextClock = high('SCL_SCK')
    if (!powered || !high('RST')) {
      if (!inReset) display.reset()
      inReset = true; display.powered = powered; bits = byte = 0
    } else {
      inReset = false; display.powered = true
      if (high('CS')) bits = byte = 0
      else if (nextClock && !clock) {
        byte = (byte << 1) | Number(high('SDA_MOSI'))
        if (++bits === 8) { display.write(byte, high('DC')); bits = byte = 0 }
      }
    }
    clock = nextClock
  } }
})
