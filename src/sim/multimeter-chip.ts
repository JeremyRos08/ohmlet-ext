import type { ComponentInstance } from '../model/types'
import { registerChip, type ChipInstance, type ChipStepCtx } from './chip-api'

export type MultimeterMode = 'dcv' | 'acv' | 'ohm' | 'continuity' | 'ma' | 'a'

export interface MultimeterReading {
  mode: MultimeterMode
  value: number
  voltage: number
  current: number
  resistance: number
  continuity: boolean
}

const readings = new Map<string, MultimeterReading>()

const DEFAULT_INPUT_R = 10_000_000
const OHM_TEST_V = 1
const OHM_SOURCE_R = 10_000
const OHM_COM_R = 1
const MA_SHUNT_R = 1
const A_SHUNT_R = 0.01
const CONTINUITY_LIMIT = 50
const AC_TAU = 0.05

function numberParam(comp: ComponentInstance, key: string, fallback: number): number {
  const raw = comp.params?.[key]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

export function multimeterModeOf(comp: ComponentInstance): MultimeterMode {
  const raw = String(comp.params?.mode ?? 'DC V')
  switch (raw) {
    case 'AC V':
      return 'acv'
    case 'Ω':
    case 'Ohm':
      return 'ohm'
    case 'Continuity':
      return 'continuity'
    case 'mA':
      return 'ma'
    case 'A':
      return 'a'
    case 'DC V':
    default:
      return 'dcv'
  }
}

export function getMultimeterReading(componentId: string): MultimeterReading | null {
  return readings.get(componentId) ?? null
}

function finite(v: number): number | null {
  return Number.isFinite(v) ? v : null
}

class MultimeterChip implements ChipInstance {
  readonly comp: ComponentInstance
  private readonly mode: MultimeterMode
  private readonly inputR: number
  private acMean = 0
  private acMeanSq = 0
  private acReady = false

  constructor(comp: ComponentInstance) {
    this.comp = comp
    this.mode = multimeterModeOf(comp)
    this.inputR = Math.max(100_000, numberParam(comp, 'resistance', DEFAULT_INPUT_R))
    readings.set(comp.id, {
      mode: this.mode,
      value: Number.NaN,
      voltage: Number.NaN,
      current: Number.NaN,
      resistance: Number.NaN,
      continuity: false,
    })
  }

  step(ctx: ChipStepCtx): void {
    const va = finite(ctx.readPin('VΩ'))
    const vb = finite(ctx.readPin('COM'))
    const havePair = va !== null && vb !== null
    const v = havePair ? va - vb : Number.NaN

    let value = Number.NaN
    let current = Number.NaN
    let resistance = Number.NaN
    let continuity = false

    switch (this.mode) {
      case 'dcv':
      case 'acv': {
        // A real handheld DMM is roughly a 10 MΩ differential load. The chip
        // bridge only exposes pin-to-ground Thevenin drives, so two very weak
        // drives follow the previous common-mode voltage. In steady state the
        // differential load is inputR while common-mode injection tends to 0.
        if (havePair) {
          const cm = (va + vb) * 0.5
          const legR = this.inputR * 0.5
          ctx.drivePin('VΩ', { v: cm, rout: legR })
          ctx.drivePin('COM', { v: cm, rout: legR })
          current = v / this.inputR

          if (this.mode === 'dcv') {
            value = v
          } else {
            if (!this.acReady) {
              this.acMean = v
              this.acMeanSq = v * v
              this.acReady = true
            } else {
              const alpha = 1 - Math.exp(-ctx.dt / AC_TAU)
              this.acMean += alpha * (v - this.acMean)
              this.acMeanSq += alpha * (v * v - this.acMeanSq)
            }
            // AC-coupled true-RMS estimate: remove the tracked DC component.
            value = Math.sqrt(Math.max(0, this.acMeanSq - this.acMean * this.acMean))
          }
        } else {
          ctx.drivePin('VΩ', null)
          ctx.drivePin('COM', null)
        }
        break
      }

      case 'ohm':
      case 'continuity': {
        // Internal test battery: COM is softly referenced to 0 V and VΩ is
        // driven toward +1 V through 10 kΩ. For an unpowered DUT connected
        // between the probes, R = Vdut / Itest. This also behaves sensibly if
        // the measured network already references simulator ground.
        ctx.drivePin('COM', { v: 0, rout: OHM_COM_R })
        ctx.drivePin('VΩ', { v: OHM_TEST_V, rout: OHM_SOURCE_R })
        if (havePair) {
          const iTest = (OHM_TEST_V - va) / OHM_SOURCE_R
          current = iTest
          if (Math.abs(iTest) > 1e-12) resistance = Math.abs(v / iTest)
          else resistance = Number.POSITIVE_INFINITY
          value = resistance
          continuity = Number.isFinite(resistance) && resistance <= CONTINUITY_LIMIT
        }
        break
      }

      case 'ma':
      case 'a': {
        // Current mode is a low-value shunt. As above, two drives follow the
        // previous common-mode voltage; the differential resistance is the
        // desired shunt value without hard-grounding either circuit node.
        if (havePair) {
          const shuntR = this.mode === 'ma' ? MA_SHUNT_R : A_SHUNT_R
          const cm = (va + vb) * 0.5
          const legR = Math.max(shuntR * 0.5, 0.0011)
          ctx.drivePin('VΩ', { v: cm, rout: legR })
          ctx.drivePin('COM', { v: cm, rout: legR })
          current = v / shuntR
          value = current
        } else {
          ctx.drivePin('VΩ', null)
          ctx.drivePin('COM', null)
        }
        break
      }
    }

    readings.set(this.comp.id, {
      mode: this.mode,
      value,
      voltage: v,
      current,
      resistance,
      continuity,
    })
  }
}

registerChip('multimeter', (comp) => new MultimeterChip(comp))
