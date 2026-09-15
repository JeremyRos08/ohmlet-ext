export type AvrPortName = 'B' | 'C' | 'D'

export interface AvrIoState {
  outB: number
  outC: number
  outD: number
  ddrB: number
  ddrC: number
  ddrD: number
}

export interface AvrFirmwareMeta {
  componentId: string
  name: string
  totalBytes: number
  flashedAt: number
}

interface AvrFirmwareRecord extends AvrFirmwareMeta {
  source: string
}

export interface AvrRuntimeSnapshot {
  status: 'idle' | 'loading' | 'running' | 'stopped' | 'error'
  message: string
  console: string
  firmware?: AvrFirmwareMeta
  io: AvrIoState
  cycles?: number
  speed?: number
  error?: string
}

const FLASH_BYTES = 32 * 1024
const DB_NAME = 'ohmlet-avr-firmware'
const DB_VERSION = 1
const STORE = 'images'
const MAX_CONSOLE = 40_000

const snapshots = new Map<string, AvrRuntimeSnapshot>()
const listeners = new Map<string, Set<() => void>>()
const workers = new Map<string, Worker>()
const digitalInputs = new Map<string, number>()
const analogInputs = new Map<string, number[]>()

function emptyIo(): AvrIoState {
  return { outB: 0, outC: 0, outD: 0, ddrB: 0, ddrC: 0, ddrD: 0 }
}

function idleSnapshot(): AvrRuntimeSnapshot {
  return { status: 'idle', message: 'No Arduino firmware flashed', console: '', io: emptyIo() }
}

function ensureSnapshot(id: string): AvrRuntimeSnapshot {
  let snap = snapshots.get(id)
  if (!snap) {
    snap = idleSnapshot()
    snapshots.set(id, snap)
  }
  return snap
}

function publish(id: string, patch: Partial<AvrRuntimeSnapshot>): void {
  snapshots.set(id, { ...ensureSnapshot(id), ...patch })
  listeners.get(id)?.forEach((fn) => fn())
}

function appendConsole(id: string, text: string): void {
  if (!text) return
  publish(id, { console: (ensureSnapshot(id).console + text).slice(-MAX_CONSOLE) })
}

export function getAvrRuntimeSnapshot(componentId: string): AvrRuntimeSnapshot {
  return ensureSnapshot(componentId)
}

export function subscribeAvrRuntime(componentId: string, fn: () => void): () => void {
  let set = listeners.get(componentId)
  if (!set) {
    set = new Set()
    listeners.set(componentId, set)
  }
  set.add(fn)
  return () => {
    set?.delete(fn)
    if (set?.size === 0) listeners.delete(componentId)
  }
}

export function getAvrIoState(componentId: string): AvrIoState {
  return ensureSnapshot(componentId).io
}

function portIndex(port: AvrPortName, bit: number): number {
  return (port.charCodeAt(0) - 66) * 8 + bit
}

export function setAvrDigitalInput(componentId: string, port: AvrPortName, bit: number, level: boolean): void {
  if (!Number.isInteger(bit) || bit < 0 || bit > 7) return
  const index = portIndex(port, bit)
  const mask = 1 << index
  const old = digitalInputs.get(componentId) ?? 0
  const next = level ? old | mask : old & ~mask
  if (next === old) return
  digitalInputs.set(componentId, next)
  workers.get(componentId)?.postMessage({ op: 'pin', port, bit, level })
}

export function setAvrAnalogInput(componentId: string, channel: number, voltage: number): void {
  if (!Number.isInteger(channel) || channel < 0 || channel > 7) return
  let values = analogInputs.get(componentId)
  if (!values) {
    values = new Array(8).fill(0)
    analogInputs.set(componentId, values)
  }
  const v = Math.max(0, Math.min(5, Number.isFinite(voltage) ? voltage : 0))
  if (Math.abs(values[channel] - v) < 0.002) return
  values[channel] = v
  workers.get(componentId)?.postMessage({ op: 'analog', channel, voltage: v })
}

/** Strict Intel HEX loader for ATmega328P flash images. */
export function parseIntelHex(source: string, flashBytes = FLASH_BYTES): Uint8Array {
  const target = new Uint8Array(flashBytes)
  target.fill(0xff)
  let upper = 0
  let sawData = false
  let sawEof = false

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (!/^:[0-9a-f]+$/i.test(line) || (line.length - 1) % 2 !== 0) throw new Error('Invalid Intel HEX line')
    const bytes = new Uint8Array((line.length - 1) / 2)
    for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(line.slice(1 + i * 2, 3 + i * 2), 16)
    if (bytes.length < 5) throw new Error('Truncated Intel HEX record')
    const count = bytes[0]
    if (bytes.length !== count + 5) throw new Error('Intel HEX record length mismatch')
    let sum = 0
    for (const b of bytes) sum = (sum + b) & 0xff
    if (sum !== 0) throw new Error('Intel HEX checksum mismatch')
    const addr = (bytes[1] << 8) | bytes[2]
    const type = bytes[3]

    if (type === 0x00) {
      const absolute = upper + addr
      if (absolute + count > target.length) throw new Error(`Firmware exceeds ATmega328P 32 kB flash at 0x${absolute.toString(16)}`)
      target.set(bytes.subarray(4, 4 + count), absolute)
      sawData = true
    } else if (type === 0x01) {
      sawEof = true
      break
    } else if (type === 0x02) {
      if (count !== 2) throw new Error('Invalid Intel HEX extended-segment record')
      upper = (((bytes[4] << 8) | bytes[5]) << 4) >>> 0
    } else if (type === 0x04) {
      if (count !== 2) throw new Error('Invalid Intel HEX extended-linear record')
      upper = (((bytes[4] << 8) | bytes[5]) << 16) >>> 0
    }
  }
  if (!sawData) throw new Error('Intel HEX contains no program data')
  if (!sawEof) throw new Error('Intel HEX is missing the EOF record')
  return target
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'))
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'componentId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open Arduino firmware database'))
  })
}

async function dbGet(componentId: string): Promise<AvrFirmwareRecord | undefined> {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(componentId)
      req.onsuccess = () => resolve(req.result as AvrFirmwareRecord | undefined)
      req.onerror = () => reject(req.error ?? new Error('Failed to read Arduino firmware'))
    })
  } finally { db.close() }
}

async function dbPut(record: AvrFirmwareRecord): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save Arduino firmware'))
      tx.onabort = () => reject(tx.error ?? new Error('Arduino firmware save aborted'))
    })
  } finally { db.close() }
}

async function dbDelete(componentId: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(componentId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Failed to erase Arduino firmware'))
    })
  } finally { db.close() }
}

export async function flashAvrFirmware(componentId: string, file: File): Promise<AvrFirmwareMeta> {
  if (!/\.hex$/i.test(file.name)) throw new Error('Choose an Arduino/ATmega328P .hex firmware file')
  const source = await file.text()
  parseIntelHex(source)
  const meta: AvrFirmwareMeta = {
    componentId,
    name: file.name,
    totalBytes: new TextEncoder().encode(source).byteLength,
    flashedAt: Date.now(),
  }
  await dbPut({ ...meta, source })
  publish(componentId, { status: 'stopped', message: 'Firmware flashed · ready to boot', firmware: meta, error: undefined })
  return meta
}

export async function loadAvrFirmwareMeta(componentId: string): Promise<AvrFirmwareMeta | undefined> {
  const rec = await dbGet(componentId)
  if (!rec) return undefined
  const { source: _source, ...meta } = rec
  publish(componentId, { firmware: meta, message: ensureSnapshot(componentId).status === 'idle' ? 'Firmware flashed · ready to boot' : ensureSnapshot(componentId).message })
  return meta
}

function applyInputs(componentId: string, worker: Worker): void {
  const digital = digitalInputs.get(componentId) ?? 0
  for (const port of ['B', 'C', 'D'] as const) {
    for (let bit = 0; bit < 8; bit++) {
      const index = portIndex(port, bit)
      worker.postMessage({ op: 'pin', port, bit, level: !!(digital & (1 << index)) })
    }
  }
  const analog = analogInputs.get(componentId) ?? []
  for (let ch = 0; ch < analog.length; ch++) worker.postMessage({ op: 'analog', channel: ch, voltage: analog[ch] ?? 0 })
}

export function stopAvrFirmware(componentId: string): void {
  const worker = workers.get(componentId)
  if (worker) {
    try { worker.postMessage({ op: 'stop' }) } catch { /* gone */ }
    worker.terminate()
    workers.delete(componentId)
  }
  const snap = ensureSnapshot(componentId)
  publish(componentId, {
    status: snap.firmware ? 'stopped' : 'idle',
    message: snap.firmware ? 'Firmware stopped' : 'No Arduino firmware flashed',
    io: emptyIo(),
  })
}

export async function bootAvrFirmware(componentId: string): Promise<void> {
  const rec = await dbGet(componentId)
  if (!rec) throw new Error('No Arduino firmware has been flashed to this board')
  const program = parseIntelHex(rec.source)
  stopAvrFirmware(componentId)
  const { source: _source, ...meta } = rec
  publish(componentId, {
    status: 'loading',
    message: 'Starting ATmega328P emulator…',
    console: '',
    firmware: meta,
    io: emptyIo(),
    cycles: 0,
    speed: undefined,
    error: undefined,
  })

  const worker = new Worker(new URL('./avr-worker.ts', import.meta.url), { type: 'module', name: `ATmega328P ${componentId}` })
  workers.set(componentId, worker)
  worker.addEventListener('error', (ev) => publish(componentId, { status: 'error', message: 'Arduino emulator worker failed', error: ev.message || 'Worker error' }))
  worker.addEventListener('message', (ev: MessageEvent) => {
    const msg = ev.data as Record<string, unknown>
    if (msg.t === 'loading') publish(componentId, { status: 'loading', message: 'Loading AVR8js…' })
    else if (msg.t === 'started') {
      publish(componentId, { status: 'running', message: 'ATmega328P firmware running' })
      applyInputs(componentId, worker)
    } else if (msg.t === 'serial' && typeof msg.data === 'string') appendConsole(componentId, msg.data)
    else if (msg.t === 'io') {
      const previous = ensureSnapshot(componentId)
      publish(componentId, {
        io: {
          outB: Number(msg.outB) & 0xff,
          outC: Number(msg.outC) & 0xff,
          outD: Number(msg.outD) & 0xff,
          ddrB: Number(msg.ddrB) & 0xff,
          ddrC: Number(msg.ddrC) & 0xff,
          ddrD: Number(msg.ddrD) & 0xff,
        },
        cycles: typeof msg.cycles === 'number' ? msg.cycles : previous.cycles,
        speed: typeof msg.speed === 'number' ? msg.speed : previous.speed,
      })
    } else if (msg.t === 'stopped') publish(componentId, { status: 'stopped', message: 'Firmware stopped', io: emptyIo() })
    else if (msg.t === 'error') {
      const message = typeof msg.message === 'string' ? msg.message : 'Arduino emulator error'
      publish(componentId, { status: 'error', message, error: message, io: emptyIo() })
    }
  })

  const transferable = program.buffer.slice(0)
  worker.postMessage({ op: 'start', program: transferable }, [transferable])
}

export async function eraseAvrFirmware(componentId: string): Promise<void> {
  stopAvrFirmware(componentId)
  await dbDelete(componentId)
  snapshots.set(componentId, idleSnapshot())
  listeners.get(componentId)?.forEach((fn) => fn())
}

export function clearAvrConsole(componentId: string): void {
  publish(componentId, { console: '' })
}

export function sendAvrSerial(componentId: string, text: string): void {
  workers.get(componentId)?.postMessage({ op: 'serial', data: text })
}
