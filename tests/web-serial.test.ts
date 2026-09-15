import { describe, expect, it } from 'vitest'
import { openSerialSession, type SerialTransport } from '../src/firmware/web-serial'

function fakePort() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const received: Uint8Array[] = []
  const port: SerialTransport & { received: Uint8Array[]; emit(value: string): void; closed: boolean; options?: unknown } = {
    readable: new ReadableStream<Uint8Array>({ start(c) { controller = c } }),
    writable: new WritableStream<Uint8Array>({ write(chunk) { received.push(chunk.slice()) } }),
    received,
    closed: false,
    emit(value) { controller?.enqueue(new TextEncoder().encode(value)) },
    async open(options) { this.options = options },
    async close() { this.closed = true; controller?.close() },
  }
  return port
}

describe('Web Serial bridge', () => {
  it('opens with an explicit UART profile and forwards both directions', async () => {
    const port = fakePort(); const incoming: string[] = []
    const session = await openSerialSession(port, (data) => incoming.push(new TextDecoder().decode(data)), 57600)
    expect(port.options).toMatchObject({ baudRate: 57600, dataBits: 8, stopBits: 1, parity: 'none' })
    port.emit('RX from USB')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(incoming).toEqual(['RX from USB'])
    await session.send(new TextEncoder().encode('TX to USB'))
    expect(new TextDecoder().decode(port.received[0])).toBe('TX to USB')
    await session.close()
    expect(port.closed).toBe(true)
  })

  it('does not create writes for empty payloads', async () => {
    const port = fakePort(); const session = await openSerialSession(port, () => undefined)
    await session.send(new Uint8Array())
    expect(port.received).toHaveLength(0)
    await session.close()
  })
})
