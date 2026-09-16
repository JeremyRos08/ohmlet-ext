import { BoardDetails, pcbGeometry, inHeaderFrame } from './board-details'
import * as THREE from 'three'
import type { ComponentInstance } from '../../model/types'
import type { CatalogEntry } from '../../model/catalog'
import { type BuildResult, cachedGeometry, cachedMaterial, centroidOf, metal, plastic, topLabel } from './shared'

const BLUE = 0x086d79
const DARK_BLUE = 0x087b80

function boardLabel(text: string, w: number, h: number, fg = '#f1f7fb'): THREE.Object3D | null {
  return topLabel(text, w, h, { w: 512, h: 96, fg })
}

function addPinPosts(group: THREE.Group, pins: THREE.Vector3[], yTop: number): void {
  const socketGeo = cachedGeometry('arduino-header-socket-open', () => {
    const shape=new THREE.Shape();shape.moveTo(-.29,-.29);shape.lineTo(.29,-.29);shape.lineTo(.29,.29);shape.lineTo(-.29,.29);shape.closePath()
    const hole=new THREE.Path();hole.moveTo(-.12,-.12);hole.lineTo(-.12,.12);hole.lineTo(.12,.12);hole.lineTo(.12,-.12);hole.closePath();shape.holes.push(hole)
    const g=new THREE.ExtrudeGeometry(shape,{depth:.30,bevelEnabled:false});g.translate(0,0,-.15);g.rotateX(-Math.PI/2);return g
  })
  const legGeo = cachedGeometry('arduino-header-leg', () => new THREE.BoxGeometry(0.11, 0.92, 0.11))
  const socketMat = plastic(0x101214, 0.5)
  const gold = metal(0xd7ad48, 0.22)
  for (const p of pins) {
    const socket = new THREE.Mesh(socketGeo, socketMat)
    socket.position.set(p.x, yTop - 0.18, p.z)
    group.add(socket)
    const leg = new THREE.Mesh(legGeo, gold)
    leg.position.set(p.x, yTop - 0.48, p.z)
    group.add(leg)
  }
}

/** Printed pin references lie inside each header row and rotate with the board. */
function addPinLabels(group: THREE.Group, entry: CatalogEntry, pins: THREE.Vector3[], centerZ: number, y: number): void {
  const labels = new THREE.Group()
  labels.name = `${entry.type}-pin-labels`
  pins.forEach((pin, i) => {
    const name = entry.pins[i]
    const mark = new THREE.Group()
    mark.name = `pin-label:${name}`
    mark.userData.pinName = name
    let dx = 0, dz = pin.z < centerZ ? 1 : -1
    if (entry.type === 'arduino_nano') {
      const row = centroidOf(pins.slice(i < 15 ? 0 : 15, i < 15 ? 15 : 30))
      const center = centroidOf(pins)
      const length = Math.hypot(center.x - row.x, center.z - row.z)
      dx = (center.x - row.x) / length; dz = (center.z - row.z) / length
    }
    mark.position.set(pin.x + dx * 1.2, y, pin.z + dz * 1.2)
    const text = name.replace(/_PWM/g, '~').replace(/_/g, '/')
    const label = topLabel(text, 1.55, 0.43, { w: 256, h: 64, fg: '#ffffff' })
    if (label) { label.rotation.y = Math.atan2(-dz, dx); mark.add(label) }
    labels.add(mark)
  })
  group.add(labels)
}

function addLed(group: THREE.Group, x: number, z: number, color: number, name: string): void {
  const led = new THREE.Mesh(
    cachedGeometry('arduino-smd-led', () => new THREE.BoxGeometry(0.34, 0.10, 0.22)),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.38 }),
  )
  led.name = name
  led.position.set(x, 0.93, z)
  group.add(led)
}

export function buildArduinoNano(comp: ComponentInstance, entry: CatalogEntry, pins: THREE.Vector3[]): BuildResult {
  return inHeaderFrame(pins, local => buildNanoLocal(comp, entry, local))
}

/** Arduino Nano / ATmega328P, breadboard-mounted on two 15-pin headers. */
function buildNanoLocal(
  _comp: ComponentInstance,
  entry: CatalogEntry,
  pins: THREE.Vector3[],
): BuildResult {
  const group = new THREE.Group()
  const c = centroidOf(pins)
  const xs = pins.map((p) => p.x)
  const zs = pins.map((p) => p.z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const w = maxX - minX + 1.15
  const d = maxZ - minZ + 0.9
  const pcbY = 0.64

  const pcb = new THREE.Mesh(
    pcbGeometry(w, d, 0.22, false),
    cachedMaterial('arduino-nano-pcb', () =>
      new THREE.MeshPhysicalMaterial({ color: BLUE, roughness: 0.56, metalness: 0.05, clearcoat: 0.18 }),
    ),
  )
  pcb.name = 'arduino-nano-body'
  pcb.position.set(c.x, pcbY, c.z)
  group.add(pcb)
  addPinPosts(group, pins, pcbY + 0.52)
  addPinLabels(group, entry, pins, c.z, pcbY + 0.13)

  const details = new BoardDetails(group)
  details.usb(maxX-.4,pcbY+.48,c.z,1.7,.72,2.1).name = 'arduino-nano-usb'
  const mcu = new THREE.Mesh(
    cachedGeometry('arduino-nano-qfp', () => new THREE.BoxGeometry(2.25, 0.28, 2.25)),
    plastic(0x141619, 0.48),
  )
  mcu.name = 'arduino-nano-atmega328p'
  mcu.position.set(c.x + 1.0, pcbY + 0.28, c.z)
  group.add(mcu)

  // Exposed QFP legs and populated analog/power sections.
  for(let i=0;i<8;i++)for(const side of [-1,1]) {
    details.box(c.x+1+(i-3.5)*.24,pcbY+.18,c.z+side*1.23,.10,.10,.35,metal(0xbfc5c5,.4))
    details.box(c.x+1+side*1.23,pcbY+.18,c.z+(i-3.5)*.24,.35,.10,.10,metal(0xbfc5c5,.4))
  }
  for(let i=0;i<5;i++) { details.smd(c.x-4+i*.8,pcbY+.20,c.z-1.6,i%2===0); details.smd(c.x-4+i*.8,pcbY+.20,c.z+1.6) }
  details.chip(c.x+4.3,pcbY+.17,c.z,1.1)
  details.label('ATMEGA328P',c.x+1,pcbY+.44,c.z,1.9,.26)
  details.label('16 MHz',c.x-1.1,pcbY+.4,c.z,.9,.24)
  details.finish()
  const crystal = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.20, 0.48), metal(0xc5c8c8, 0.34))
  crystal.position.set(c.x - 1.1, pcbY + 0.24, c.z)
  group.add(crystal)
  addLed(group, c.x + 3.2, c.z - 0.55, 0xffa726, 'arduino-nano-led-l')
  addLed(group, c.x + 3.2, c.z + 0.05, 0x3bd267, 'arduino-nano-led-pwr')

  const lbl = boardLabel('ARDUINO  NANO', 5.0, 0.72)
  if (lbl) {
    lbl.position.set(c.x - 2.1, pcbY + 0.18, c.z)
    group.add(lbl)
  }
  return { object: group, pinWorld: pins.map((p) => new THREE.Vector3(p.x, pcbY + 0.62, p.z)) }
}

/** Uno headers share the endpoint coordinates used by picking and wire routing. */
export function buildArduinoUno(
  _comp: ComponentInstance,
  entry: CatalogEntry,
  pins: THREE.Vector3[],
): BuildResult {
  const group = new THREE.Group()
  const bodyW = 21
  const bodyD = 12
  const bodyCx = pins[0].x - 3 + bodyW / 2
  const bodyCz = pins[0].z - 9 + 4
  const pcbY = 0.60

  const pcb = new THREE.Mesh(
    pcbGeometry(bodyW, bodyD, 0.26, true),
    cachedMaterial('arduino-uno-pcb', () =>
      new THREE.MeshPhysicalMaterial({ color: DARK_BLUE, roughness: 0.54, metalness: 0.05, clearcoat: 0.2 }),
    ),
  )
  pcb.name = 'arduino-uno-body'
  pcb.position.set(bodyCx, pcbY, bodyCz)
  group.add(pcb)

  addPinPosts(group, pins, 0.92)
  addPinLabels(group, entry, pins, bodyCz, pcbY + 0.15)

  const dip = new THREE.Mesh(
    cachedGeometry('arduino-uno-atmega-dip', () => new THREE.BoxGeometry(6.2, 0.72, 2.25)),
    plastic(0x111214, 0.52),
  )
  dip.name = 'arduino-uno-atmega328p'
  dip.position.set(bodyCx + 1.2, pcbY + 0.48, bodyCz + 0.4)
  group.add(dip)

  const details = new BoardDetails(group)
  details.usb(bodyCx-bodyW/2+1.1,pcbY+.65,bodyCz-2.1,3,1.3,2.75,-1).name = 'arduino-uno-usb-b'
  // DIP legs, USB interface controller, regulator and decoupling components.
  for(let i=0;i<14;i++)for(const side of [-1,1])
    details.box(bodyCx+1.2+(i-6.5)*.43,pcbY+.23,bodyCz+.4+side*1.24,.16,.20,.55,metal(0xbec3c6,.43))
  details.chip(bodyCx-5.6,pcbY+.18,bodyCz-1.8,1.65)
  details.box(bodyCx-6.5,pcbY+.28,bodyCz+1.4,1.8,.32,1.2,plastic(0x202226,.6))
  details.box(bodyCx-6.5,pcbY+.30,bodyCz+.7,1.7,.12,.6,metal(0xbec3c6,.43))
  for(let i=0;i<7;i++) { details.smd(bodyCx-3.5+i*.8,pcbY+.22,bodyCz+2.8,i%2===0) }
  for(let i=0;i<5;i++)details.smd(bodyCx-4+i*.7,pcbY+.22,bodyCz-2.4)
  details.label('ATMEGA328P',bodyCx+1.2,pcbY+.86,bodyCz+.4,4.6,.45)
  details.label('USB',bodyCx-7.6,pcbY+.16,bodyCz-.2,1.1)
  details.label('RESET',bodyCx-5.3,pcbY+.16,bodyCz+3.1,1.4,.35)
  details.finish()
  const barrel = new THREE.Mesh(
    cachedGeometry('arduino-uno-barrel', () => new THREE.CylinderGeometry(1.0, 1.0, 2.6, 20)),
    plastic(0x151719, 0.52),
  )
  barrel.rotation.z = Math.PI / 2
  barrel.position.set(bodyCx - bodyW / 2 + 0.8, pcbY + 0.72, bodyCz + 2.6)
  group.add(barrel)

  for (const dz of [1.0, 2.8]) {
    const cap = new THREE.Mesh(cachedGeometry('uno-electrolytic',()=>new THREE.CylinderGeometry(.48,.48,1.15,20)),plastic(0x22292d,.5))
    cap.position.set(bodyCx-4.5,pcbY+.70,bodyCz+dz);group.add(cap)
    const lid = new THREE.Mesh(cachedGeometry('uno-cap-lid',()=>new THREE.CylinderGeometry(.44,.44,.035,20)),metal(0xbac1c4,.45))
    lid.position.set(bodyCx-4.5,pcbY+1.29,bodyCz+dz);group.add(lid)
  }
  const reset = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.32, 1.0), plastic(0x25292d, 0.42))
  reset.position.set(bodyCx - 5.3, pcbY + 0.30, bodyCz + 4.0)
  group.add(reset)
  addLed(group, bodyCx + 5.2, bodyCz - 1.0, 0xffa726, 'arduino-uno-led-l')
  addLed(group, bodyCx + 5.2, bodyCz + 0.2, 0x36d46a, 'arduino-uno-led-pwr')

  const lbl = boardLabel('ARDUINO  UNO  R3', 6.4, 0.90)
  if (lbl) {
    lbl.position.set(bodyCx, pcbY + 0.20, bodyCz - 3.6)
    group.add(lbl)
  }

  return { object: group, pinWorld: pins.map((p) => new THREE.Vector3(p.x, 0.70, p.z)) }
}
