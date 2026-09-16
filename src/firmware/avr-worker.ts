import * as avr from 'avr8js'
import { AvrSerialBridge } from './avr-serial'

// Vite bundles the pinned emulator into this worker, so boot needs no CDN.
const CLOCK_HZ = 16_000_000
const FLASH_WORDS = 0x4000 // ATmega328P: 32 kB, stored as 16-bit words
const MAX_SLICE_CYCLES = 250_000
const STATE_INTERVAL_MS = 33

type PortName = 'B' | 'C' | 'D'
type WorkerMessage =
  | { op: 'start'; program: ArrayBuffer }
  | { op: 'stop' }
  | { op: 'pin'; port: PortName; bit: number; level: boolean }
  | { op: 'analog'; channel: number; voltage: number }
  | { op: 'serial'; data: string }

interface WorkerScope {
  postMessage(data: unknown): void
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null
}
const scope = globalThis as unknown as WorkerScope

let running = false
let generation = 0
let ports: Partial<Record<PortName, { setPin(bit: number, level: boolean): void }>> = {}
let adc: { channelValues: number[] } | null = null
let serialBridge: AvrSerialBridge | null = null

async function start(programBytes: ArrayBuffer): Promise<void> {
  const myGeneration = ++generation
  running = false
  scope.postMessage({ t: 'loading' })

  if (myGeneration !== generation) return

  const program = new Uint16Array(FLASH_WORDS)
  const target = new Uint8Array(program.buffer)
  target.fill(0xff)
  target.set(new Uint8Array(programBytes).subarray(0, target.length))

  const cpu = new avr.CPU(program)
  new avr.AVRTimer(cpu, avr.timer0Config)
  new avr.AVRTimer(cpu, avr.timer1Config)
  new avr.AVRTimer(cpu, avr.timer2Config)
  const portB = new avr.AVRIOPort(cpu, avr.portBConfig)
  const portC = new avr.AVRIOPort(cpu, avr.portCConfig)
  const portD = new avr.AVRIOPort(cpu, avr.portDConfig)
  const adcImpl = new avr.AVRADC(cpu, avr.adcConfig)
  adcImpl.avcc = 5
  adcImpl.aref = 5
  const serial = new avr.AVRUSART(cpu, avr.usart0Config, CLOCK_HZ)

  ports = { B: portB, C: portC, D: portD }
  adc = adcImpl
  serialBridge = new AvrSerialBridge(serial, (data) => scope.postMessage({ t: 'serial', data }))
  const bridge = serialBridge

  let outB = 0
  let outC = 0
  let outD = 0
  const previous = { B: 0, C: 0, D: 0 }
  const highCycles = { B: new Array(8).fill(0), C: new Array(8).fill(0), D: new Array(8).fill(0) }
  const totalCycles = { B: 0, C: 0, D: 0 }
  const samplePort = (port: keyof typeof previous, value: number, now: number) => {
    const old = previous[port]
    const elapsed = Math.max(0, now - totalCycles[port])
    for (let bit = 0; bit < 8; bit++) if (old & (1 << bit)) highCycles[port][bit] += elapsed
    previous[port] = value & 0xff
    totalCycles[port] = now
  }
  portB.addListener((value: number) => { samplePort('B', value, cpu.cycles); outB = value & 0xff })
  portC.addListener((value: number) => { samplePort('C', value, cpu.cycles); outC = value & 0xff })
  portD.addListener((value: number) => { samplePort('D', value, cpu.cycles); outD = value & 0xff })

  const startWall = performance.now()
  let lastState = startWall
  let lastStateCycles = cpu.cycles
  let lastSpeedWall = startWall
  let lastSpeedCycles = cpu.cycles
  running = true
  scope.postMessage({ t: 'started' })

  const tick = () => {
    if (!running || myGeneration !== generation) return
    bridge.pump()
    const wall = performance.now()
    let targetCycles = ((wall - startWall) / 1000) * CLOCK_HZ
    if (targetCycles - cpu.cycles > CLOCK_HZ * 0.3) {
      // Don't freeze the page after a background-tab pause. Advance in bounded
      // slices and report the actual speed instead of trying to catch up at once.
      targetCycles = cpu.cycles + MAX_SLICE_CYCLES
    }
    const until = Math.min(targetCycles, cpu.cycles + MAX_SLICE_CYCLES)
    while (cpu.cycles < until) {
      avr.avrInstruction(cpu)
      cpu.tick()
    }

    if (wall - lastState >= STATE_INTERVAL_MS) {
      bridge.flush()
      const ddrB = cpu.data[avr.portBConfig.DDR] & 0xff
      const ddrC = cpu.data[avr.portCConfig.DDR] & 0xff
      const ddrD = cpu.data[avr.portDConfig.DDR] & 0xff
      let speed: number | undefined
      if (wall - lastSpeedWall >= 500) {
        speed = ((cpu.cycles - lastSpeedCycles) / CLOCK_HZ) / ((wall - lastSpeedWall) / 1000)
        lastSpeedWall = wall
        lastSpeedCycles = cpu.cycles
      }
      const frameCycles = Math.max(1, cpu.cycles - lastStateCycles)
      const pwm = (port: keyof typeof previous) => {
        const elapsed = Math.max(0, cpu.cycles - totalCycles[port])
        const old = previous[port]
        for (let bit = 0; bit < 8; bit++) if (old & (1 << bit)) highCycles[port][bit] += elapsed
        totalCycles[port] = cpu.cycles
        const values = highCycles[port].map((n) => Math.max(0, Math.min(1, n / frameCycles)))
        highCycles[port].fill(0)
        return values
      }
      const pwmB = pwm('B'), pwmC = pwm('C'), pwmD = pwm('D')
      lastStateCycles = cpu.cycles
      scope.postMessage({
        t: 'io',
        outB, outC, outD, ddrB, ddrC, ddrD, pwmB, pwmC, pwmD,
        cycles: cpu.cycles,
        speed,
      })
      lastState = wall
    }
    setTimeout(tick, 0)
  }
  tick()
}

scope.onmessage = (event) => {
  const msg = event.data
  try {
    if (msg.op === 'start') {
      void start(msg.program).catch((error) => {
        running = false
        scope.postMessage({ t: 'error', message: error instanceof Error ? error.message : String(error) })
      })
      return
    }
    if (msg.op === 'stop') {
      running = false
      generation += 1
      serialBridge?.flush()
      serialBridge = null
      scope.postMessage({ t: 'stopped' })
      return
    }
    if (msg.op === 'pin') {
      if (Number.isInteger(msg.bit) && msg.bit >= 0 && msg.bit <= 7) ports[msg.port]?.setPin(msg.bit, !!msg.level)
      return
    }
    if (msg.op === 'analog') {
      if (adc && Number.isInteger(msg.channel) && msg.channel >= 0 && msg.channel < adc.channelValues.length) {
        adc.channelValues[msg.channel] = Math.max(0, Math.min(5, Number(msg.voltage) || 0))
      }
      return
    }
    if (msg.op === 'serial' && running) {
      serialBridge?.send(msg.data)
    }
  } catch (error) {
    scope.postMessage({ t: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
