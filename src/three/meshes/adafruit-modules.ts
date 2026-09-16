import * as THREE from 'three'
import type { ComponentInstance } from '../../model/types'
import type { CatalogEntry } from '../../model/catalog'
import { cachedGeometry, centroidOf, metal, plastic, topLabel, type BuildResult } from './shared'

/** Compact breakout-board visuals used by the Adafruit module catalog. */
export function buildAdafruitModule(_comp: ComponentInstance, entry: CatalogEntry, pins: THREE.Vector3[]): BuildResult {
  const group = new THREE.Group()
  const c = centroidOf(pins)
  const width = Math.max(5.8, Math.min(12, (Math.max(...pins.map(p => p.x)) - Math.min(...pins.map(p => p.x))) + 2.6))
  const depth = entry.type.includes('ssd1306') ? 5.4 : 4.2
  const pcb = new THREE.Mesh(cachedGeometry(`adafruit-pcb:${width}:${depth}`, () => new THREE.BoxGeometry(width, .24, depth)), plastic(0x166c62, .48))
  pcb.name = `${entry.type}-pcb`; pcb.position.set(c.x, .56, c.z); group.add(pcb)
  const header = new THREE.Mesh(cachedGeometry(`adafruit-header:${width}`, () => new THREE.BoxGeometry(width - .55, .38, .62)), plastic(0x111417, .52))
  header.position.set(c.x, .78, Math.min(...pins.map(p => p.z))); group.add(header)
  const postGeo = cachedGeometry('adafruit-gold-post', () => new THREE.BoxGeometry(.12, .9, .12))
  for (const p of pins) {
    const post = new THREE.Mesh(postGeo, metal(0xd3ad4e, .2)); post.position.set(p.x, .38, p.z); group.add(post)
    const pad = new THREE.Mesh(cachedGeometry('adafruit-pad', () => new THREE.CylinderGeometry(.2, .2, .05, 12)), metal(0xd5ae4a, .22))
    pad.rotation.x = -Math.PI / 2; pad.position.set(p.x, .7, p.z); group.add(pad)
  }
  const chip = new THREE.Mesh(cachedGeometry(`adafruit-chip:${entry.type}`, () => new THREE.BoxGeometry(Math.min(2.6, width - 1), .28, Math.min(1.8, depth - 1))), plastic(0x171a1c, .58))
  chip.position.set(c.x, .82, c.z + .25); group.add(chip)
  for (let i = 0; i < 5; i++) {
    const smd = new THREE.Mesh(cachedGeometry('adafruit-smd', () => new THREE.BoxGeometry(.34, .12, .22)), metal(0xbfc4c4, .4))
    smd.position.set(c.x - width / 2 + 1.1 + i * .75, .78, c.z - 1.35); group.add(smd)
  }
  const label = topLabel(entry.label.replace(/^Adafruit\s*/i, ''), Math.min(width - .4, 5.8), .46, { w: 512, h: 80, fg: '#f0f6e8' })
  if (label) { label.position.set(c.x, .92, c.z - .9); group.add(label) }
  return { object: group, pinWorld: pins.map(p => new THREE.Vector3(p.x, .7, p.z)) }
}
