/** Browser Web Serial transport. The browser can open a real USB CDC/UART port;
 * it cannot manufacture a Windows COM device. A native companion can implement
 * the same SerialTransport interface later without changing the emulator. */
export interface SerialTransport {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number; dataBits?: 7 | 8; stopBits?: 1 | 2; parity?: 'none' | 'even' | 'odd'; flowControl?: 'none' | 'hardware' }): Promise<void>
  close(): Promise<void>
  getInfo?(): { usbVendorId?: number; usbProductId?: number }
}

interface SerialNavigator {
  requestPort(options?: unknown): Promise<SerialTransport>
}

export function webSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

export function serialApi(): SerialNavigator | null {
  if (!webSerialSupported()) return null
  return (navigator as Navigator & { serial: SerialNavigator }).serial
}

export interface SerialSession {
  readonly port: SerialTransport
  readonly baudRate: number
  readonly signal: AbortSignal
  send(data: Uint8Array): Promise<void>
  close(): Promise<void>
}

export async function openSerialSession(
  port: SerialTransport,
  onData: (data: Uint8Array) => void,
  baudRate = 115200,
): Promise<SerialSession> {
  await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' })
  const controller = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  const readLoop = async () => {
    if (!port.readable) return
    reader = port.readable.getReader()
    try {
      while (!controller.signal.aborted) {
        const result = await reader.read()
        if (result.done) break
        if (result.value?.byteLength) onData(result.value)
      }
    } catch (error) {
      if (!controller.signal.aborted) onData(new TextEncoder().encode(`\n[serial error] ${String(error)}\n`))
    } finally {
      reader.releaseLock()
      reader = null
    }
  }
  void readLoop()
  return {
    port,
    baudRate,
    signal: controller.signal,
    async send(data) {
      if (!port.writable || !data.byteLength) return
      const writer = port.writable.getWriter()
      try { await writer.write(data) } finally { writer.releaseLock() }
    },
    async close() {
      controller.abort()
      await reader?.cancel().catch(() => undefined)
      reader?.releaseLock()
      await port.close().catch(() => undefined)
    },
  }
}

export async function requestWebSerialSession(
  onData: (data: Uint8Array) => void,
  baudRate = 115200,
): Promise<SerialSession> {
  const api = serialApi()
  if (!api) throw new Error('Web Serial is unavailable. Use Chrome or Edge on HTTPS/localhost.')
  const port = await api.requestPort()
  return openSerialSession(port, onData, baudRate)
}
