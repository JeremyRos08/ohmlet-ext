import type { ComponentInstance } from '../model/types'
import { registerChip, type ChipInstance, type ChipStepCtx } from './chip-api'
import {
  getAvrIoState,
  getAvrRuntimeSnapshot,
  setAvrAnalogInput,
  setAvrDigitalInput,
  type AvrPortName,
} from '../firmware/avr-runtime'

const IO_HIGH = 5
const IO_ROUT = 35
const POWER_ROUT = 0.22
const INPUT_THRESHOLD = 2.5

export interface ArduinoPinMap {
  port: AvrPortName
  bit: number
  analog?: number
}

/** Arduino ATmega328P header label -> AVR port/ADC mapping. */
export function arduinoPinMap(pin: string): ArduinoPinMap | null {
  const normalized = pin.replace(/_.+$/, '')
  const d = /^D(\d+)$/.exec(normalized)
  if (d) {
    const n = Number(d[1])
    if (n >= 0 && n <= 7) return { port: 'D', bit: n }
    if (n >= 8 && n <= 13) return { port: 'B', bit: n - 8 }
  }
  const a = /^A([0-7])$/.exec(normalized)
  if (a) {
    const n = Number(a[1])
    if (n <= 5) return { port: 'C', bit: n, analog: n }
    // Nano A6/A7 are ADC-only; they have no digital port bit.
    return null
  }
  return null
}

function analogChannel(pin: string): number | null {
  const m = /^A([0-7])(?:_.+)?$/.exec(pin)
  return m ? Number(m[1]) : null
}

function maskFor(io: ReturnType<typeof getAvrIoState>, port: AvrPortName): { out: number; ddr: number } {
  switch (port) {
    case 'B': return { out: io.outB, ddr: io.ddrB }
    case 'C': return { out: io.outC, ddr: io.ddrC }
    case 'D': return { out: io.outD, ddr: io.ddrD }
  }
}

class Arduino328pChip implements ChipInstance {
  private outputTelemetry: Record<string, boolean> = {}
  constructor(public comp: ComponentInstance) {}

  step(ctx: ChipStepCtx): void {
    const usbPower = this.comp.params?.usbPower !== false
    const running = getAvrRuntimeSnapshot(this.comp.id).status === 'running'
    const io = getAvrIoState(this.comp.id)

    // USB is modeled as the board's power source when enabled. This makes the
    // familiar 5V/3V3/GND headers usable exactly like a real USB-powered Uno
    // or Nano without requiring a second virtual bench supply.
    for (const pin of this.comp.type === 'arduino_uno_r3' ? ['5V'] : ['5V']) {
      ctx.drivePin(pin, usbPower ? { v: 5, rout: POWER_ROUT } : null)
    }
    ctx.drivePin('3V3', usbPower ? { v: 3.3, rout: 1.0 } : null)
    for (const pin of ['GND', 'GND1', 'GND2']) {
      if (this.hasPin(pin)) ctx.drivePin(pin, usbPower ? { v: 0, rout: POWER_ROUT } : null)
    }

    const out: Record<string, boolean> = {}
    for (const pin of this.pinLabels()) {
      const map = arduinoPinMap(pin)
      if (map) {
        const masks = maskFor(io, map.port)
        const bit = 1 << map.bit
        const isOutput = running && !!(masks.ddr & bit)
        const high = !!(masks.out & bit)
        if (isOutput) {
          const pwm = map.port === 'B' ? io.pwmB[map.bit] : map.port === 'C' ? io.pwmC[map.bit] : io.pwmD[map.bit]
          const voltage = Number.isFinite(pwm) && pwm > 0 && pwm < 1 ? IO_HIGH * pwm : (high ? IO_HIGH : 0)
          ctx.drivePin(pin, { v: voltage, rout: IO_ROUT })
        } else ctx.drivePin(pin, null)
        out[pin] = isOutput && high

        if (!isOutput) {
          const v = ctx.readPin(pin)
          setAvrDigitalInput(this.comp.id, map.port, map.bit, Number.isFinite(v) && v > INPUT_THRESHOLD)
        }
      }

      const channel = analogChannel(pin)
      if (channel !== null) {
        const v = ctx.readPin(pin)
        setAvrAnalogInput(this.comp.id, channel, Number.isFinite(v) ? Math.max(0, Math.min(5, v)) : 0)
      }
    }
    this.outputTelemetry = out
  }

  outputs(): Record<string, boolean> { return this.outputTelemetry }

  private pinLabels(): string[] {
    return this.comp.type === 'arduino_nano'
      ? NANO_IO_PINS
      : UNO_IO_PINS
  }

  private hasPin(pin: string): boolean {
    const list = this.comp.type === 'arduino_nano' ? NANO_ALL_PINS : UNO_ALL_PINS
    return list.includes(pin)
  }
}

export const UNO_ALL_PINS = [
  'IOREF', 'RESET', '3V3', '5V', 'GND1', 'GND2', 'VIN',
  'A0', 'A1', 'A2', 'A3', 'A4_SDA', 'A5_SCL',
  'D0_RX', 'D1_TX', 'D2', 'D3_PWM', 'D4', 'D5_PWM', 'D6_PWM', 'D7',
  'D8', 'D9_PWM', 'D10_PWM_SS', 'D11_PWM_MOSI', 'D12_MISO', 'D13_SCK',
  'AREF', 'SDA', 'SCL',
]

export const NANO_ALL_PINS = [
  'D1_TX', 'D0_RX', 'RESET', 'GND1', 'D2', 'D3_PWM', 'D4', 'D5_PWM', 'D6_PWM', 'D7', 'D8', 'D9_PWM', 'D10_PWM_SS', 'D11_PWM_MOSI', 'D12_MISO',
  'D13_SCK', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4_SDA', 'A5_SCL', 'A6', 'A7', '5V', 'RESET2', 'GND2', 'VIN',
]

const UNO_IO_PINS = UNO_ALL_PINS.filter((p) => /^D\d|^A[0-7]/.test(p))
const NANO_IO_PINS = NANO_ALL_PINS.filter((p) => /^D\d|^A[0-7]/.test(p))

registerChip('arduino_atmega328p', (comp) => new Arduino328pChip(comp))
