import * as THREE from 'three'
import type { ComponentInstance } from '../../model/types'
import type { CatalogEntry } from '../../model/catalog'
import { cachedGeometry, centroidOf, metal, plastic, topLabel, type BuildResult } from './shared'

/** Compact breakout-board visuals used by the Adafruit module catalog. */
export function buildAdafruitModule(_comp: ComponentInstance, entry: CatalogEntry, pins: THREE.Vector3[]): BuildResult {
  const group = new THREE.Group()
  const c = centroidOf(pins)
  const width = Math.max(5.8, (Math.max(...pins.map(p => p.x)) - Math.min(...pins.map(p => p.x))) + 2.6)
  const depth = entry.type.includes('ssd1306') ? 7.2 : 6.2
  const pcb = new THREE.Mesh(cachedGeometry(`adafruit-pcb:${width}:${depth}`, () => new THREE.BoxGeometry(width, .24, depth)), plastic(0x166c62, .48))
  pcb.name = `${entry.type}-pcb`; pcb.position.set(c.x, .2, c.z + depth / 2 - .65); group.add(pcb)
  const header = new THREE.Mesh(cachedGeometry(`adafruit-header:${width}`, () => new THREE.BoxGeometry(width - .55, .38, .62)), plastic(0x111417, .52))
  header.name = 'module-header'; header.position.set(c.x, .29, Math.min(...pins.map(p => p.z))); group.add(header)
  const postGeo = cachedGeometry('adafruit-gold-post', () => new THREE.BoxGeometry(.22, .7, .22))
  for (const [i, p] of pins.entries()) {
    const post = new THREE.Mesh(postGeo, metal(0xd3ad4e, .2)); post.name = `module-pin-${entry.pins[i]}`; post.position.set(p.x, .35, p.z); group.add(post)
    const pad = new THREE.Mesh(cachedGeometry('adafruit-pad', () => new THREE.CylinderGeometry(.2, .2, .05, 12)), metal(0xd5ae4a, .22))
    pad.name = 'module-pin-pad'; pad.position.set(p.x, .335, p.z); group.add(pad)
    const pinLabel = topLabel(entry.pins[i], 2.2, .5, { w: 256, h: 64, fg: '#ffffff' })
    if (pinLabel) { pinLabel.name = `pin-label-${entry.pins[i]}`; pinLabel.position.set(p.x, .335, p.z + .85); group.add(pinLabel) }
  }
  const chip = new THREE.Mesh(cachedGeometry(`adafruit-chip:${entry.type}`, () => new THREE.BoxGeometry(Math.min(2.6, width - 1), .28, Math.min(1.8, depth - 1))), plastic(0x171a1c, .58))
  chip.position.set(c.x, .46, c.z + 3.1); group.add(chip)
  if (entry.type.includes('ssd1306')) {
    chip.visible = false
    const glass = new THREE.Mesh(new THREE.BoxGeometry(width - 1.2, .16, 3.2), plastic(0x050b14, .15))
    glass.name = 'oled-glass'; glass.position.set(c.x, .41, c.z + 3.8); group.add(glass)
  }
  if (entry.type === 'analog_control_module') {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(.85, .85, 1.15, 24), plastic(0x242b32, .5))
    knob.name = 'control-knob'; knob.position.set(c.x, 1.35, c.z + 3.1); group.add(knob)
    const mark = new THREE.Mesh(new THREE.BoxGeometry(.12, .03, .55), plastic(0xffffff, .6))
    mark.position.set(c.x, 1.94, c.z + 2.9); group.add(mark)
  }
  if (entry.type === 'obstacle_sensor_module') {
    for (const [i, color] of [0xe4eaf1, 0x111722].entries()) {
      const sensor = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .8, 20), plastic(color, .25))
      sensor.name = `optical-head-${i}`; sensor.position.set(c.x + (i - .5) * 1.3, 1.2, c.z + 3.05); group.add(sensor)
    }
  }
  for (let i = 0; i < 5; i++) {
    const smd = new THREE.Mesh(cachedGeometry('adafruit-smd', () => new THREE.BoxGeometry(.34, .12, .22)), metal(0xbfc4c4, .4))
    smd.position.set(c.x - width / 2 + 1.1 + i * .75, .38, c.z + depth - 1.1); group.add(smd)
  }
  const label = topLabel(entry.label.replace(/^Adafruit\s*/i, ''), Math.min(width - .4, 5.8), .46, { w: 512, h: 80, fg: '#f0f6e8' })
  if (label) { label.position.set(c.x, .335, c.z + 1.65); group.add(label) }
  return { object: group, pinWorld: pins.map(p => new THREE.Vector3(p.x, .7, p.z)) }
}
