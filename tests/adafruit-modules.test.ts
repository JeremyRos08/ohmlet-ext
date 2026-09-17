import { describe, expect, it } from 'vitest'
import '../src/model/catalog-ext'
import { getEntry } from '../src/model/catalog'
import { validateLayout } from '../src/model/validate'
import { buildComponentObject } from '../src/three/component-meshes'
import esp32Tft from '../examples/esp32-tft-ra8875.json'

describe('Adafruit modules and ESP32 TFT project', () => {
  it('registers the first Adafruit module family with documented headers', () => {
    for (const type of ['adafruit_bme280', 'adafruit_ssd1306_128x64', 'adafruit_neopixel_ring']) {
      const entry = getEntry(type)
      expect(entry?.label).toContain('Adafruit')
      expect(entry?.placement).toBe('offboard')
      expect(entry?.visual?.shape).toBe('adafruit-module')
      expect(entry?.pins.length).toBeGreaterThanOrEqual(5)
    }
  })

  it('validates the ESP32 + 5-inch RA8875 example and exposes every wire endpoint', () => {
    const result = validateLayout(esp32Tft)
    expect(result.ok, result.errors.join('\n')).toBe(true)
    expect(result.layout?.components).toHaveLength(2)
    expect(result.layout?.wires).toHaveLength(14)
    const screen = result.layout?.components.find((c) => c.type === 'tft_5in')
    const source = result.layout?.components.find((c) => c.id === screen?.params?.sourceEsp)
    expect(source?.type).toBe('esp32_s3_devkit')
  })

  it('builds an Adafruit breakout with physical pin posts', () => {
    const entry = getEntry('adafruit_bme280')!
    const pins = entry.pins.map((_, i) => ({ x: i * 2, y: 0, z: 0 })) as any
    const built = buildComponentObject({ id: 'BME1', type: entry.type }, entry, pins)
    expect(built.pinWorld).toHaveLength(entry.pins.length)
    expect(built.object.getObjectByName('adafruit_bme280-pcb')).toBeDefined()
  })
})
