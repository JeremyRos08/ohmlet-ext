export type Esp32FirmwareMode = 'app' | 'parts' | 'full'

export interface Esp32FirmwareImage {
  kind: 1 | 2 | 3 | 5
  name: string
  data: ArrayBuffer
}

export interface Esp32FirmwareMeta {
  componentId: string
  mode: Esp32FirmwareMode
  names: string[]
  totalBytes: number
  sha256: string
  flashedAt: number
}

interface Esp32FirmwareRecord extends Esp32FirmwareMeta {
  images: Esp32FirmwareImage[]
}

export interface Esp32RuntimeSnapshot {
  status: 'idle' | 'loading' | 'running' | 'stopped' | 'error'
  message: string
  console: string
  firmware?: Esp32FirmwareMeta
  emulatedSeconds?: number
  speed?: number
  mips?: number
  error?: string
}

const DB_NAME = 'ohmlet-esp32-firmware'
const DB_VERSION = 1
const STORE = 'images'
const MAX_CONSOLE = 40_000
const ROM_URL = '/esp32sim/esp32s3_rev0_rom.elf'
const WASM_URL = '/esp32sim/esp32sim.wasm'
const WORKER_URL = '/esp32sim/worker.js'

const snapshots = new Map<string, Esp32RuntimeSnapshot>()
const listeners = new Map<string, Set<() => void>>()
const workers = new Map<string, Worker>()

function idleSnapshot(): Esp32RuntimeSnapshot {
  return { status: 'idle', message: 'No firmware flashed', console: '' }
}

function ensureSnapshot(id: string): Esp32RuntimeSnapshot {
  let snap = snapshots.get(id)
  if (!snap) {
    snap = idleSnapshot()
    snapshots.set(id, snap)
  }
  return snap
}

function publish(id: string, patch: Partial<Esp32RuntimeSnapshot>): void {
  const next = { ...ensureSnapshot(id), ...patch }
  snapshots.set(id, next)
  listeners.get(id)?.forEach((fn) => fn())
}

function appendConsole(id: string, text: string): void {
  if (!text) return
  const old = ensureSnapshot(id).console
  const next = (old + text).slice(-MAX_CONSOLE)
  publish(id, { console: next })
}

export function getEsp32RuntimeSnapshot(id: string): Esp32RuntimeSnapshot {
  return ensureSnapshot(id)
}

export function subscribeEsp32Runtime(id: string, fn: () => void): () => void {
  let set = listeners.get(id)
  if (!set) {
    set = new Set()
    listeners.set(id, set)
  }
  set.add(fn)
  return () => {
    set?.delete(fn)
    if (set?.size === 0) listeners.delete(id)
  }
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
    req.onerror = () => reject(req.error ?? new Error('Failed to open firmware database'))
  })
}

async function dbGet(componentId: string): Promise<Esp32FirmwareRecord | undefined> {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(componentId)
      req.onsuccess = () => resolve(req.result as Esp32FirmwareRecord | undefined)
      req.onerror = () => reject(req.error ?? new Error('Failed to read firmware'))
    })
  } finally {
    db.close()
  }
}

async function dbPut(record: Esp32FirmwareRecord): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save firmware'))
      tx.onabort = () => reject(tx.error ?? new Error('Firmware save aborted'))
    })
  } finally {
    db.close()
  }
}

async function dbDelete(componentId: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(componentId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Failed to erase firmware'))
      tx.onabort = () => reject(tx.error ?? new Error('Firmware erase aborted'))
    })
  } finally {
    db.close()
  }
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export function inspectEsp32Image(data: ArrayBuffer | Uint8Array): {
  ok: boolean
  chipId?: number
  segmentCount?: number
  error?: string
} {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes.byteLength < 24) return { ok: false, error: 'Firmware image is too small' }
  if (bytes[0] !== 0xe9) return { ok: false, error: 'Not an Espressif .bin image (missing 0xE9 header)' }
  const segmentCount = bytes[1]
  const chipId = bytes[12] | (bytes[13] << 8)
  if (segmentCount === 0 || segmentCount > 16) return { ok: false, chipId, segmentCount, error: 'Invalid ESP image segment count' }
  if (chipId !== 9) return { ok: false, chipId, segmentCount, error: `Firmware targets ESP chip id ${chipId}, not ESP32-S3 (id 9)` }
  return { ok: true, chipId, segmentCount }
}

function isBin(file: File): boolean {
  return file.name.toLowerCase().endsWith('.bin')
}

async function fileImage(file: File, kind: 1 | 2 | 3 | 5): Promise<Esp32FirmwareImage> {
  return { kind, name: file.name, data: await file.arrayBuffer() }
}

/**
 * Turn one or more ESP-IDF / Arduino binary files into a flash bundle.
 *
 * One ordinary .bin is treated as an application image and direct-booted.
 * Names containing merged/factory/full-flash are treated as complete flash
 * images. With several files, bootloader / partition-table / app are detected
 * by filename and loaded at 0x0 / 0x8000 / 0x10000 respectively.
 */
export async function makeEsp32FirmwareBundle(files: readonly File[]): Promise<{
  mode: Esp32FirmwareMode
  images: Esp32FirmwareImage[]
}> {
  const bins = files.filter(isBin)
  if (bins.length === 0) throw new Error('Choose at least one ESP32-S3 .bin firmware file')

  if (bins.length === 1) {
    const file = bins[0]
    const lower = file.name.toLowerCase()
    const full = /merged|factory|full[-_ ]?flash|flash[-_ ]?image/.test(lower)
    const image = await fileImage(file, full ? 5 : 3)
    const inspected = inspectEsp32Image(image.data)
    if (!inspected.ok) throw new Error(inspected.error ?? 'Invalid ESP32-S3 firmware image')
    return { mode: full ? 'full' : 'app', images: [image] }
  }

  const bootloader = bins.find((f) => /bootloader/i.test(f.name))
  const ptable = bins.find((f) => /partition|ptable/i.test(f.name))
  const remaining = bins.filter((f) => f !== bootloader && f !== ptable)
  const app = remaining.sort((a, b) => b.size - a.size)[0]
  if (!bootloader || !ptable || !app) {
    throw new Error('For a multi-file flash, select bootloader.bin, partition-table.bin and the application .bin')
  }
  const images = await Promise.all([
    fileImage(bootloader, 1),
    fileImage(ptable, 2),
    fileImage(app, 3),
  ])
  for (const image of images) {
    const inspected = inspectEsp32Image(image.data)
    // Partition tables are raw data, not ESP images.
    if (image.kind !== 2 && !inspected.ok) throw new Error(`${image.name}: ${inspected.error}`)
  }
  return { mode: 'parts', images }
}

async function digestBundle(images: readonly Esp32FirmwareImage[]): Promise<string> {
  const total = images.reduce((n, image) => n + image.data.byteLength, 0)
  const bytes = new Uint8Array(total)
  let at = 0
  for (const image of images) {
    bytes.set(new Uint8Array(image.data), at)
    at += image.data.byteLength
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function flashEsp32Firmware(componentId: string, files: readonly File[]): Promise<Esp32FirmwareMeta> {
  const bundle = await makeEsp32FirmwareBundle(files)
  const meta: Esp32FirmwareMeta = {
    componentId,
    mode: bundle.mode,
    names: bundle.images.map((image) => image.name),
    totalBytes: bundle.images.reduce((n, image) => n + image.data.byteLength, 0),
    sha256: await digestBundle(bundle.images),
    flashedAt: Date.now(),
  }
  const record: Esp32FirmwareRecord = {
    ...meta,
    images: bundle.images.map((image) => ({ ...image, data: image.data.slice(0) })),
  }
  await dbPut(record)
  publish(componentId, {
    status: 'stopped',
    message: 'Firmware flashed · ready to boot',
    firmware: meta,
    error: undefined,
  })
  return meta
}

export async function loadEsp32FirmwareMeta(componentId: string): Promise<Esp32FirmwareMeta | undefined> {
  const record = await dbGet(componentId)
  if (!record) return undefined
  const { images: _images, ...meta } = record
  publish(componentId, { firmware: meta, message: ensureSnapshot(componentId).status === 'idle' ? 'Firmware flashed · ready to boot' : ensureSnapshot(componentId).message })
  return meta
}

function waitForMessage(worker: Worker, predicate: (msg: Record<string, unknown>) => boolean, timeoutMs = 20_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.removeEventListener('message', onMessage)
      reject(new Error('ESP32 emulator timed out while starting'))
    }, timeoutMs)
    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data as Record<string, unknown>
      if (!predicate(msg)) return
      window.clearTimeout(timeout)
      worker.removeEventListener('message', onMessage)
      resolve(msg)
    }
    worker.addEventListener('message', onMessage)
  })
}

function handleWorkerMessage(componentId: string, msg: Record<string, unknown>): void {
  if (typeof msg.log === 'string') appendConsole(componentId, `${msg.log}\n`)
  if (typeof msg.text === 'string') {
    try {
      const frame = JSON.parse(msg.text) as Record<string, unknown>
      if (frame.t === 'serial' && typeof frame.data === 'string') appendConsole(componentId, frame.data)
      else if (frame.t === 'emu' && typeof frame.msg === 'string') appendConsole(componentId, `${frame.msg}\n`)
      else if (frame.t === 'stat') {
        publish(componentId, {
          emulatedSeconds: typeof frame.time === 'number' ? frame.time : ensureSnapshot(componentId).emulatedSeconds,
          speed: typeof frame.speed === 'number' ? frame.speed : ensureSnapshot(componentId).speed,
        })
      }
    } catch {
      appendConsole(componentId, `${msg.text}\n`)
    }
  }
  if (msg.pace && typeof msg.pace === 'object') {
    const pace = msg.pace as Record<string, unknown>
    publish(componentId, {
      speed: typeof pace.speed === 'number' ? pace.speed : ensureSnapshot(componentId).speed,
      mips: typeof pace.mips === 'number' ? pace.mips : ensureSnapshot(componentId).mips,
    })
  }
  if (typeof msg.stopped === 'number') {
    publish(componentId, {
      status: msg.stopped === 0 ? 'stopped' : 'error',
      message: msg.stopped === 0 ? 'Firmware stopped' : `Firmware stopped with emulator code ${msg.stopped}`,
      error: msg.stopped === 0 ? undefined : `Emulator stop code ${msg.stopped}`,
    })
  }
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Missing ESP32 emulator runtime (${response.status} ${url})`)
  return response.arrayBuffer()
}

export function stopEsp32Firmware(componentId: string): void {
  const worker = workers.get(componentId)
  if (worker) {
    try { worker.postMessage({ op: 'stop' }) } catch { /* already gone */ }
    worker.terminate()
    workers.delete(componentId)
  }
  const snap = ensureSnapshot(componentId)
  publish(componentId, {
    status: snap.firmware ? 'stopped' : 'idle',
    message: snap.firmware ? 'Firmware stopped' : 'No firmware flashed',
  })
}

export async function bootEsp32Firmware(componentId: string): Promise<void> {
  const record = await dbGet(componentId)
  if (!record) throw new Error('No firmware has been flashed to this ESP32-S3')

  stopEsp32Firmware(componentId)
  const { images: _images, ...meta } = record
  publish(componentId, {
    status: 'loading',
    message: 'Starting ESP32-S3 emulator…',
    console: '',
    firmware: meta,
    error: undefined,
    emulatedSeconds: 0,
    speed: undefined,
    mips: undefined,
  })

  let worker: Worker | undefined
  try {
    const wasmBytes = await fetchBytes(WASM_URL)
    worker = new Worker(WORKER_URL, { type: 'module', name: `ESP32-S3 ${componentId}` })
    workers.set(componentId, worker)
    worker.addEventListener('message', (ev) => handleWorkerMessage(componentId, ev.data as Record<string, unknown>))
    worker.addEventListener('error', (ev) => {
      publish(componentId, { status: 'error', message: 'ESP32 emulator worker failed', error: ev.message || 'Worker error' })
    })

    let waiter = waitForMessage(worker, (m) => m.ready === true)
    worker.postMessage({ op: 'init', wasm: wasmBytes }, [wasmBytes])
    await waiter

    waiter = waitForMessage(worker, (m) => typeof m.created === 'boolean')
    worker.postMessage({ op: 'create', board: 'none', flash_mb: 16, psram_mb: 8, jit: true })
    const created = await waiter
    if (created.created !== true) throw new Error('ESP32-S3 emulator could not create the virtual chip')

    if (record.mode !== 'app') {
      const rom = await fetchBytes(ROM_URL)
      waiter = waitForMessage(worker, (m) => m.loaded === 0 || m.loaded === '0')
      worker.postMessage({ op: 'load', kind: 0, data: rom }, [rom])
      const loadedRom = await waiter
      if (loadedRom.ok !== true) throw new Error('Failed to load ESP32-S3 mask ROM')
    }

    for (const image of record.images) {
      const data = image.data.slice(0)
      waiter = waitForMessage(worker, (m) => m.loaded === image.kind || m.loaded === String(image.kind))
      worker.postMessage({ op: 'load', kind: image.kind, data }, [data])
      const loaded = await waiter
      if (loaded.ok !== true) throw new Error(`Failed to load ${image.name}`)
    }

    waiter = waitForMessage(worker, (m) => typeof m.started === 'boolean')
    worker.postMessage({ op: 'start', appDirect: record.mode === 'app' })
    const started = await waiter
    if (started.started !== true) throw new Error('ESP32-S3 firmware did not boot')

    publish(componentId, { status: 'running', message: 'Firmware running' })
  } catch (error) {
    worker?.terminate()
    workers.delete(componentId)
    const message = error instanceof Error ? error.message : String(error)
    publish(componentId, { status: 'error', message, error: message })
    throw error
  }
}

export async function eraseEsp32Firmware(componentId: string): Promise<void> {
  stopEsp32Firmware(componentId)
  await dbDelete(componentId)
  snapshots.set(componentId, idleSnapshot())
  listeners.get(componentId)?.forEach((fn) => fn())
}

export function clearEsp32Console(componentId: string): void {
  publish(componentId, { console: '' })
}
