import type { ComponentInstance } from '../model/types'
import { getEsp32GpioState, setEsp32GpioInput } from '../firmware/esp32-runtime'
import { registerChip, type ChipInstance, type ChipStepCtx } from './chip-api'

const GPIO_ROUT_OHMS = 45
const INPUT_HIGH_V = 1.65
const VDD = 3.3

/** GPIO number encoded by an ESP32-S3 DevKit catalog pin name. */
export function gpioNumberOfPin(pin: string): number | null {
  const match = pin.match(/(?:^GPIO|_GPIO)(\d+)/)
  if (!match) return null
  const n = Number(match[1])
  return Number.isInteger(n) && n >= 0 && n <= 48 ? n : null
}

const GPIO_PINS = [
  'GPIO4', 'GPIO5', 'GPIO6', 'GPIO7', 'GPIO15', 'GPIO16', 'GPIO17', 'GPIO18', 'GPIO8', 'GPIO3', 'GPIO46',
  'GPIO9', 'GPIO10', 'GPIO11', 'GPIO12', 'GPIO13', 'GPIO14', 'TX_GPIO43', 'RX_GPIO44', 'GPIO1', 'GPIO2',
  'GPIO42', 'GPIO41', 'GPIO40', 'GPIO39', 'GPIO38', 'GPIO37', 'GPIO36', 'GPIO35', 'GPIO0', 'GPIO45', 'GPIO48',
  'GPIO47', 'GPIO21', 'GPIO20_USB_D+', 'GPIO19_USB_D-',
] as const

function finite(v: number): number {
  return Number.isFinite(v) ? v : 0
}

class Esp32S3Chip implements ChipInstance {
  readonly comp: ComponentInstance
  private readonly lastInput = new Map<number, boolean>()
  private lastOutputs: Record<string, boolean> = {}

  constructor(comp: ComponentInstance) {
    this.comp = comp
  }

  step(ctx: ChipStepCtx): void {
    const state = getEsp32GpioState(this.comp.id)
    const v5 = finite(ctx.readPin('5V'))
    const v33a = finite(ctx.readPin('3V3_1'))
    const v33b = finite(ctx.readPin('3V3_2'))
    const poweredFrom5V = v5 >= 4.0
    const externallyPowered33 = Math.max(v33a, v33b) >= 2.7
    const powered = poweredFrom5V || externallyPowered33

    // The DevKit's onboard regulator provides 3.3 V from the 5 V header/USB.
    // When powered directly from 3V3 the pins are not force-driven back into
    // an external supply; they remain high impedance.
    if (poweredFrom5V) {
      ctx.drivePin('3V3_1', { v: VDD, rout: 2.0 })
      ctx.drivePin('3V3_2', { v: VDD, rout: 2.0 })
    } else {
      ctx.drivePin('3V3_1', null)
      ctx.drivePin('3V3_2', null)
    }

    const outputs: Record<string, boolean> = {}
    for (const pinName of GPIO_PINS) {
      const gpio = gpioNumberOfPin(pinName)
      if (gpio == null) continue
      const bit = 1n << BigInt(gpio)
      const enabled = powered && (state.enable & bit) !== 0n
      if (enabled) {
        const high = (state.out & bit) !== 0n
        ctx.drivePin(pinName, { v: high ? VDD : 0, rout: GPIO_ROUT_OHMS })
        outputs[pinName] = high
      } else {
        ctx.drivePin(pinName, null)
      }

      // Feed the actual solved breadboard voltage back to firmware. This also
      // makes reads of an output pin reflect contention/load rather than the
      // requested latch state. Only send transitions to the Worker.
      const analog = ctx.readPin(pinName)
      const level = Number.isFinite(analog) ? analog >= INPUT_HIGH_V : false
      if (this.lastInput.get(gpio) !== level) {
        this.lastInput.set(gpio, level)
        setEsp32GpioInput(this.comp.id, gpio, level)
      }
    }
    this.lastOutputs = outputs
  }

  outputs(): Record<string, boolean> {
    return this.lastOutputs
  }
}

registerChip('esp32_s3', (comp) => new Esp32S3Chip(comp))
