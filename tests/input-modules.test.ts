import { expect, it } from 'vitest'
import '../src/model/catalog-ext'
import { createChip, type PinDrive } from '../src/sim/chip-api'
import { getEntry } from '../src/model/catalog'
import { buildAdafruitModule } from '../src/three/meshes/adafruit-modules'
import * as THREE from 'three'

it('scales the analog output and releases it when supply is absent', () => {
  const chip = createChip('analog_control_module', { id: 'A', type: 'analog_control_module', params: { position: 0.25 } })!
  let output: PinDrive | null = null
  let vcc = 5
  const ctx = { time: 0, dt: 0.01, readPin: (p: string) => p === 'VCC' ? vcc : 0, drivePin: (_: string, d: PinDrive | null) => { output = d } }
  chip.step(ctx)
  expect(output).toEqual({ v: 1.25, rout: 1000 })
  vcc = 0; chip.step(ctx); expect(output).toBeNull()
})

it('switches the obstacle output active-low', () => {
  for (const detected of [false, true]) {
    const chip = createChip('obstacle_sensor_module', { id: 'D', type: 'obstacle_sensor_module', params: { detected } })!
    let output: PinDrive | null = null
    chip.step({ time: 0, dt: 0.01, readPin: p => p === 'VCC' ? 3.3 : 0, drivePin: (_, d) => { output = d } })
    expect(output).toEqual({ v: detected ? 0 : 3.3, rout: 100 })
  }
})

it('keeps the widest breakout header on its PCB and pads horizontal', () => {
  const entry = getEntry('adafruit_ssd1306_128x64')!
  const pins = entry.pins.map((_, i) => new THREE.Vector3(i * 2.5, 0, 0))
  const built = buildAdafruitModule({ id: 'OLED', type: entry.type }, entry, pins)
  const bounds = new THREE.Box3().setFromObject(built.object.getObjectByName(`${entry.type}-pcb`)!)
  for (const p of pins) expect(p.x >= bounds.min.x && p.x <= bounds.max.x).toBe(true)
  expect(built.object.getObjectByName('module-pin-pad')!.rotation.x).toBe(0)
  expect(built.object.getObjectByName('oled-glass')).toBeDefined()
})


it('exposes each module pin above its header at the wire attachment height', () => {
  for (const type of ['adafruit_ssd1306_128x64', 'adafruit_bme280', 'adafruit_neopixel_ring']) {
    const entry = getEntry(type)!
    const pins = entry.pins.map((_, i) => new THREE.Vector3(i * 2.5, 0, 0))
    const built = buildAdafruitModule({ id: 'M', type }, entry, pins)
    const header = new THREE.Box3().setFromObject(built.object.getObjectByName('module-header')!)
    entry.pins.forEach((name, i) => {
      const post = new THREE.Box3().setFromObject(built.object.getObjectByName(`module-pin-${name}`)!)
      expect(post.max.y).toBeGreaterThan(header.max.y + .2)
      expect(post.max.y).toBeCloseTo(built.pinWorld![i].y)
      const glass = built.object.getObjectByName('oled-glass')
      if (glass) expect(post.intersectsBox(new THREE.Box3().setFromObject(glass))).toBe(false)
    })
  }
})
