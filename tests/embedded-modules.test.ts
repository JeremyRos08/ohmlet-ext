import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import '../src/model/catalog-ext'
import { getEntry } from '../src/model/catalog'
import { componentPinHoles } from '../src/model/breadboard'
import { buildComponentObject } from '../src/three/component-meshes'
import { validateLayout } from '../src/model/validate'

describe('ESP32-S3 DevKitC-1 extension', () => {
  it('registers the official 2x22 header footprint', () => {
    const entry = getEntry('esp32_s3_devkit')
    expect(entry).toBeDefined()
    expect(entry?.placement).toBe('footprint')
    expect(entry?.pins).toHaveLength(44)
    expect(entry?.pins[0]).toBe('3V3_1')
    expect(entry?.pins[2]).toBe('RST')
    expect(entry?.pins[21]).toBe('GND_J1')
    expect(entry?.pins[22]).toBe('GND_J3_1')
    expect(entry?.pins[37]).toBe('GPIO48')
  })

  it('maps the two 22-pin headers to opposite breadboard rows', () => {
    const entry = getEntry('esp32_s3_devkit')!
    const holes = componentPinHoles({ id: 'ESP1', type: entry.type, at: 'a1' }, entry)
    expect(holes).not.toBeNull()
    expect(holes).toHaveLength(44)
    expect(holes?.[0]).toMatchObject({ kind: 'strip', col: 1, row: 'a' })
    expect(holes?.[21]).toMatchObject({ kind: 'strip', col: 22, row: 'a' })
    expect(holes?.[22]).toMatchObject({ kind: 'strip', col: 1, row: 'j' })
    expect(holes?.[43]).toMatchObject({ kind: 'strip', col: 22, row: 'j' })
  })

  it('builds a dedicated DevKit board mesh', () => {
    const entry = getEntry('esp32_s3_devkit')!
    const pins: THREE.Vector3[] = []
    for (let i = 0; i < 22; i++) pins.push(new THREE.Vector3(i, 0, -4.5))
    for (let i = 0; i < 22; i++) pins.push(new THREE.Vector3(i, 0, 4.5))
    const built = buildComponentObject({ id: 'ESP1', type: entry.type, at: 'a1' }, entry, pins)
    expect(built.pinWorld).toHaveLength(44)
    expect(built.object.children.length).toBeGreaterThan(50)
  })
})

describe('5-inch TFT extension', () => {
  it('registers a wireable generic SPI + touch header', () => {
    const entry = getEntry('tft_5in')
    expect(entry).toBeDefined()
    expect(entry?.placement).toBe('offboard')
    expect(entry?.pins).toEqual(['5V', 'GND', 'SCK', 'MOSI', 'MISO', 'CS', 'DC', 'RST', 'BL', 'SDA', 'SCL', 'INT'])
  })

  it('builds a dedicated 5-inch screen mesh', () => {
    const entry = getEntry('tft_5in')!
    const pins = entry.pins.map((_, i) => new THREE.Vector3(-8 + i * 2.5, 0, 2))
    const built = buildComponentObject({ id: 'LCD1', type: entry.type }, entry, pins)
    expect(built.pinWorld).toHaveLength(12)
    expect(built.object.children.length).toBeGreaterThan(12)
  })

  it('validates an ESP32-S3 and TFT in the same layout', () => {
    const result = validateLayout({
      version: 1,
      components: [
        { id: 'ESP1', type: 'esp32_s3_devkit', at: 'a1' },
        { id: 'LCD1', type: 'tft_5in' },
      ],
      wires: [],
    })
    expect(result.ok, result.errors.join('\n')).toBe(true)
  })
})
