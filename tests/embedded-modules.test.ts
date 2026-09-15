import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import '../src/model/catalog-ext'
import { getEntry } from '../src/model/catalog'
import { componentPinHoles } from '../src/model/breadboard'
import { buildComponentObject } from '../src/three/component-meshes'
import { validateLayout } from '../src/model/validate'
import { placementValid } from '../src/state/store'

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

  it('maps the two 22-pin headers to b/i and leaves a/j exposed for jumpers', () => {
    const entry = getEntry('esp32_s3_devkit')!
    const holes = componentPinHoles({ id: 'ESP1', type: entry.type, at: 'b1' }, entry)
    expect(holes).not.toBeNull()
    expect(holes).toHaveLength(44)
    expect(holes?.[0]).toMatchObject({ kind: 'strip', col: 1, row: 'b' })
    expect(holes?.[21]).toMatchObject({ kind: 'strip', col: 22, row: 'b' })
    expect(holes?.[22]).toMatchObject({ kind: 'strip', col: 1, row: 'i' })
    expect(holes?.[43]).toMatchObject({ kind: 'strip', col: 22, row: 'i' })
    expect(placementValid({ version: 1, components: [], wires: [] }, entry.type, 'b1')).toBe(true)
  })

  it('builds a dedicated DevKit board mesh', () => {
    const entry = getEntry('esp32_s3_devkit')!
    const pins: THREE.Vector3[] = []
    for (let i = 0; i < 22; i++) pins.push(new THREE.Vector3(i, 0, -4.5))
    for (let i = 0; i < 22; i++) pins.push(new THREE.Vector3(i, 0, 4.5))
    const built = buildComponentObject({ id: 'ESP1', type: entry.type, at: 'b1' }, entry, pins)
    expect(built.pinWorld).toHaveLength(44)
    expect(built.object.children.length).toBeGreaterThan(50)
  })
})

describe('EastRising ER-TFTM050A2-3-3661 extension', () => {
  it('registers the RA8875 SPI + capacitive touch breakout', () => {
    const entry = getEntry('tft_5in')
    expect(entry).toBeDefined()
    expect(entry?.label).toContain('RA8875')
    expect(entry?.placement).toBe('offboard')
    expect(entry?.visual?.shape).toBe('tft5-ra8875')
    expect(entry?.pins).toEqual([
      '5V', 'GND', 'SCK', 'MISO', 'MOSI', 'CS', 'RST', 'WAIT', 'INT', 'LITE',
      'TP_SDA', 'TP_SCL', 'TP_INT', 'TP_RST',
    ])
  })

  it('builds a visible external header in front of the display body', () => {
    const entry = getEntry('tft_5in')!
    const pins = entry.pins.map((_, i) => new THREE.Vector3(-12 + i * 2.5, 0, 2))
    const built = buildComponentObject({ id: 'LCD1', type: entry.type }, entry, pins)
    expect(built.pinWorld).toHaveLength(14)
    expect(built.object.getObjectByName('tft5-body')).toBeDefined()
    expect(built.object.getObjectByName('tft5-controller-pcb')).toBeDefined()
    expect(built.object.getObjectByName('tft5-header')).toBeDefined()
    expect(built.object.getObjectByName('tft5-pin-SCK')).toBeDefined()
    expect(built.object.getObjectByName('tft5-pin-TP_RST')).toBeDefined()
    for (const p of built.pinWorld) expect(p.y).toBeCloseTo(0.7, 6)
  })

  it('prints a dedicated label plaque for every connector pin', () => {
    const entry = getEntry('tft_5in')!
    const pins = entry.pins.map((_, i) => new THREE.Vector3(-12 + i * 2.5, 0, 2))
    const built = buildComponentObject({ id: 'LCD1', type: entry.type }, entry, pins)
    const labels = built.object.getObjectByName('tft5-pin-labels')
    expect(labels).toBeDefined()
    expect(labels?.userData.pinNames).toEqual(entry.pins)
    for (const name of entry.pins) {
      expect(built.object.getObjectByName(`tft5-pinlabel-bg-${name}`)).toBeDefined()
    }
  })

  it('validates an ESP32-S3 and RA8875 display in the same layout', () => {
    const result = validateLayout({
      version: 1,
      components: [
        { id: 'ESP1', type: 'esp32_s3_devkit', at: 'b1' },
        { id: 'LCD1', type: 'tft_5in' },
      ],
      wires: [],
    })
    expect(result.ok, result.errors.join('\n')).toBe(true)
  })
})
