import { describe, expect, it } from 'vitest'
import { inspectEsp32Image, makeEsp32FirmwareBundle } from '../src/firmware/esp32-runtime'

function espImage(chipId = 9, size = 64): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes[0] = 0xe9
  bytes[1] = 1
  bytes[12] = chipId & 0xff
  bytes[13] = chipId >>> 8
  return bytes
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

describe('ESP32-S3 firmware image inspection', () => {
  it('accepts an ESP32-S3 image header', () => {
    expect(inspectEsp32Image(espImage())).toMatchObject({ ok: true, chipId: 9, segmentCount: 1 })
  })

  it('rejects non-Espressif data', () => {
    expect(inspectEsp32Image(new Uint8Array(64))).toMatchObject({ ok: false })
  })

  it('rejects firmware built for another ESP chip id', () => {
    const result = inspectEsp32Image(espImage(5))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not ESP32-S3')
  })
})

describe('ESP32-S3 firmware bundle detection', () => {
  it('treats a single ordinary bin as an application image', async () => {
    const file = new File([asArrayBuffer(espImage())], 'my-app.bin')
    const bundle = await makeEsp32FirmwareBundle([file])
    expect(bundle.mode).toBe('app')
    expect(bundle.images.map((image) => image.kind)).toEqual([3])
  })

  it('recognizes a merged flash image by filename', async () => {
    const file = new File([asArrayBuffer(espImage())], 'project-merged.bin')
    const bundle = await makeEsp32FirmwareBundle([file])
    expect(bundle.mode).toBe('full')
    expect(bundle.images.map((image) => image.kind)).toEqual([5])
  })

  it('maps a normal ESP-IDF three-image flash set to the correct slots', async () => {
    const bootloader = new File([asArrayBuffer(espImage())], 'bootloader.bin')
    const ptable = new File([new ArrayBuffer(0x1000)], 'partition-table.bin')
    const app = new File([asArrayBuffer(espImage(9, 256))], 'controller.bin')
    const bundle = await makeEsp32FirmwareBundle([app, ptable, bootloader])
    expect(bundle.mode).toBe('parts')
    expect(bundle.images.map((image) => image.kind)).toEqual([1, 2, 3])
    expect(bundle.images.map((image) => image.name)).toEqual(['bootloader.bin', 'partition-table.bin', 'controller.bin'])
  })
})
