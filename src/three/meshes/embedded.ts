import { BoardDetails, inHeaderFrame } from './board-details'
import * as THREE from 'three'
import type { ComponentInstance } from '../../model/types'
import type { CatalogEntry } from '../../model/catalog'
import {
  type BuildResult,
  cachedGeometry,
  cachedMaterial,
  centroidOf,
  metal,
  plastic,
  topLabel,
} from './shared'

function makeBoardLabel(text: string, width: number, height: number, fg = '#eef6ef'): THREE.Object3D | null {
  return topLabel(text, width, height, { w: 512, h: 96, fg })
}

function roundedSlabGeometry(key: string, width: number, depth: number, height: number, radius = 0.45): THREE.ExtrudeGeometry {
  return cachedGeometry(key, () => {
    const w = width / 2
    const d = depth / 2
    const r = Math.min(radius, w, d)
    const s = new THREE.Shape()
    s.moveTo(-w + r, -d)
    s.lineTo(w - r, -d)
    s.quadraticCurveTo(w, -d, w, -d + r)
    s.lineTo(w, d - r)
    s.quadraticCurveTo(w, d, w - r, d)
    s.lineTo(-w + r, d)
    s.quadraticCurveTo(-w, d, -w, d - r)
    s.lineTo(-w, -d + r)
    s.quadraticCurveTo(-w, -d, -w + r, -d)
    const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 5 })
    g.translate(0, 0, -height / 2)
    g.rotateX(-Math.PI / 2)
    return g
  })
}

export function buildEsp32S3DevKit(comp: ComponentInstance, entry: CatalogEntry, pins: THREE.Vector3[]): BuildResult {
  return inHeaderFrame(pins, local => buildEspLocal(comp, entry, local))
}

/** ESP32-S3-DevKitC-1, 2 × 22 pin breadboard module. */
function buildEspLocal(
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

  // Headers occupy breadboard rows b/i. The narrower body keeps rows a/j
  // exposed so jumpers can be plugged into the same electrical strips.
  const boardW = Math.max(22.2, maxX - minX + 1.2)
  const boardD = Math.max(7.4, maxZ - minZ + 0.9)
  const pcbY = 0.74

  const pcb = new THREE.Mesh(
    roundedSlabGeometry(`esp32s3-pcb-rounded-${boardW.toFixed(1)}-${boardD.toFixed(1)}`, boardW, boardD, 0.22, 0.42),
    cachedMaterial('esp32s3-pcb-refined', () =>
      new THREE.MeshPhysicalMaterial({ color: 0x172322, roughness: 0.58, metalness: 0.08, clearcoat: 0.18 }),
    ),
  )
  pcb.position.set(c.x, pcbY, c.z)
  group.add(pcb)

  const headerLen = maxX - minX + 0.8
  const headerGeo = cachedGeometry(`esp32s3-header-rail-${headerLen.toFixed(1)}`, () => new THREE.BoxGeometry(headerLen, 0.42, 0.64))
  const headerMat = plastic(0x101214, 0.52)
  for (const z of [minZ, maxZ]) {
    const rail = new THREE.Mesh(headerGeo, headerMat)
    rail.position.set(c.x, pcbY - 0.32, z)
    group.add(rail)
  }

  const pinGeo = cachedGeometry('esp32s3-refined-pin', () => new THREE.BoxGeometry(0.10, 0.95, 0.10))
  const pinMat = metal(0xd8b04c, 0.22)
  const collarGeo = cachedGeometry('esp32s3-pin-collar', () => new THREE.BoxGeometry(0.32, 0.08, 0.32))
  for (const p of pins) {
    const collar = new THREE.Mesh(collarGeo, pinMat)
    collar.position.set(p.x, pcbY + 0.24, p.z)
    group.add(collar)
    const pin = new THREE.Mesh(pinGeo, pinMat)
    pin.position.set(p.x, pcbY + .12, p.z)
    group.add(pin)
  }

  const moduleW = Math.min(8.2, boardW * 0.37)
  const moduleD = Math.min(boardD - 1.4, 6.2)
  const moduleX = minX + moduleW / 2 + 1.05
  const carrier = new THREE.Mesh(
    roundedSlabGeometry('esp32s3-wroom-carrier', moduleW, moduleD, 0.16, 0.22),
    cachedMaterial('esp32s3-wroom-pcb', () => new THREE.MeshStandardMaterial({ color: 0x102820, roughness: 0.75, metalness: 0.03 })),
  )
  carrier.position.set(moduleX, pcbY + 0.24, c.z)
  group.add(carrier)

  const shieldW = moduleW * 0.66
  const shieldD = moduleD - 0.75
  const shield = new THREE.Mesh(
    roundedSlabGeometry('esp32s3-wroom-shield', shieldW, shieldD, 0.42, 0.12),
    cachedMaterial('esp32s3-shield-refined', () =>
      new THREE.MeshPhysicalMaterial({ color: 0xbec2c3, roughness: 0.27, metalness: 0.78, clearcoat: 0.1 }),
    ),
  )
  shield.position.set(moduleX + moduleW * 0.13, pcbY + 0.47, c.z)
  group.add(shield)

  const antennaMat = metal(0xc89b42, 0.35)
  const traceGeoH = cachedGeometry('esp32s3-ant-h', () => new THREE.BoxGeometry(0.95, 0.025, 0.10))
  const traceGeoV = cachedGeometry('esp32s3-ant-v', () => new THREE.BoxGeometry(0.10, 0.025, 0.64))
  const antX = minX + 0.62
  for (let i = 0; i < 4; i++) {
    const h = new THREE.Mesh(traceGeoH, antennaMat)
    h.position.set(antX + (i % 2 ? 0.20 : 0), pcbY + 0.39, c.z - 1.05 + i * 0.62)
    group.add(h)
    if (i < 3) {
      const v = new THREE.Mesh(traceGeoV, antennaMat)
      v.position.set(antX + (i % 2 ? -0.27 : 0.48), pcbY + 0.39, c.z - 0.74 + i * 0.62)
      group.add(v)
    }
  }

  const details = new BoardDetails(group)
  for(const dz of [-1.05,1.05])details.usb(maxX-.2,pcbY+.38,c.z+dz,1.48,.62,1.08)
  details.chip(c.x+2.6,pcbY+.16,c.z,1.6)
  for(let i=0;i<7;i++) { details.smd(c.x+i*.68,pcbY+.18,c.z-1.4,i%2===0); details.smd(c.x+i*.68,pcbY+.18,c.z+1.4) }
  // Module castellations and laser-style shield legend.
  for(let i=0;i<12;i++)for(const side of [-1,1])
    details.box(moduleX+(i-5.5)*moduleW/13,pcbY+.32,c.z+side*moduleD/2,.28,.18,.20,metal(0xc0a75d,.4))
  details.label('ESP32-S3',shield.position.x,pcbY+.69,c.z-.65,3.4,.52, '#343b3e')
  details.label('WROOM-1',shield.position.x,pcbY+.69,c.z+.1,3.1,.42, '#343b3e')
  details.label('Wi-Fi / BLE',shield.position.x,pcbY+.69,c.z+.8,2.8,.3, '#343b3e')
  pins.forEach((p,i)=>{
    const mark=new THREE.Group();mark.name=`pin-label:${entry.pins[i]}`
    mark.position.set(p.x,pcbY+.125,p.z+(p.z<c.z?1:-1)*.85)
    const text=topLabel(entry.pins[i],1.05,.32,{w:256,h:64,fg:'#e9eee7'})
    if(text){text.rotation.y=Math.PI/2;mark.add(text)}group.add(mark)
  })
  pins.forEach(p=>{details.pad(p.x,pcbY+.13,p.z);details.pad(p.x,pcbY-.13,p.z)})
  for(const dz of [-1.55,1.55])details.tactile(maxX-2.05,pcbY+.13,c.z+dz)
  details.finish()
  const ledGeo = cachedGeometry('esp32s3-smd-led', () => new THREE.BoxGeometry(0.28, 0.08, 0.18))
  const pwrLed = new THREE.Mesh(ledGeo, cachedMaterial('esp32s3-led-red', () => new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0x8a0803, emissiveIntensity: 1.4 })))
  pwrLed.position.set(maxX - 3.1, pcbY + 0.18, c.z - 0.55)
  group.add(pwrLed)
  const rgbLed = new THREE.Mesh(ledGeo, cachedMaterial('esp32s3-led-rgb', () => new THREE.MeshStandardMaterial({ color: 0x67d9ff, emissive: 0x154d66, emissiveIntensity: 1.0 })))
  rgbLed.position.set(maxX - 3.1, pcbY + 0.18, c.z + 0.55)
  group.add(rgbLed)

  const label = makeBoardLabel('DevKitC-1', 3.2, 0.5)
  if (label) {
    label.position.set(c.x + 2.6, pcbY + 0.46, c.z)
    group.add(label)
  }
  const bootLabel = makeBoardLabel('BOOT', 1.5, 0.48, '#cfd7d4')
  if (bootLabel) {
    bootLabel.position.set(maxX - 3.4, pcbY + 0.17, c.z - 1.55)
    group.add(bootLabel)
  }
  const rstLabel = makeBoardLabel('RST', 1.3, 0.48, '#cfd7d4')
  if (rstLabel) {
    rstLabel.position.set(maxX - 3.4, pcbY + 0.17, c.z + 1.55)
    group.add(rstLabel)
  }

  const pinWorld = pins.map((p) => new THREE.Vector3(p.x, pcbY + 0.50, p.z))
  return { object: group, pinWorld }
}

function makeTftTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 480
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const grad = ctx.createLinearGradient(0, 0, 800, 480)
  grad.addColorStop(0, '#0b2031')
  grad.addColorStop(0.55, '#113e59')
  grad.addColorStop(1, '#07131e')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 800, 480)

  ctx.strokeStyle = 'rgba(80,210,255,.20)'
  ctx.lineWidth = 2
  for (let x = 0; x <= 800; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 480); ctx.stroke()
  }
  for (let y = 0; y <= 480; y += 80) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke()
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#bcecff'
  ctx.font = '700 64px Arial, sans-serif'
  ctx.fillText('5.0” TFT', 400, 170)
  ctx.fillStyle = '#64d2ff'
  ctx.font = '700 42px "Courier New", monospace'
  ctx.fillText('800 × 480', 400, 255)
  ctx.fillStyle = '#6d91a4'
  ctx.font = '600 28px Arial, sans-serif'
  ctx.fillText('NO SIGNAL', 400, 335)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Generic 5-inch 800×480 TFT module with SPI display + I²C touch header. */
export function buildTft5Inch(
  _comp: ComponentInstance,
  _entry: CatalogEntry,
  pins: THREE.Vector3[],
): BuildResult {
  const group = new THREE.Group()
  const first = pins[0] ?? new THREE.Vector3(-8, 0, 0)

  const bodyW = 30
  const bodyD = 18
  const bodyH = 0.9
  const pinCenterX = pins.length > 0 ? pins.reduce((sum, p) => sum + p.x, 0) / pins.length : first.x
  // The generic off-board terminal row is 27.5 units wide for 12 pins. Center
  // the TFT on that row instead of placing the whole screen to its left, and
  // put the row one unit inside the lower bezel like a real breakout header.
  const cx = pinCenterX
  const cz = first.z - bodyD / 2 + 1.0

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW, bodyH, bodyD),
    cachedMaterial('tft5-back', () =>
      new THREE.MeshPhysicalMaterial({ color: 0x15181d, roughness: 0.5, metalness: 0.16 }),
    ),
  )
  back.name = 'tft5-body'
  back.position.set(cx, 0.72, cz)
  group.add(back)

  const bezel = new THREE.Mesh(new THREE.BoxGeometry(bodyW - 1.0, 0.18, bodyD - 1.0), plastic(0x050607, 0.38))
  bezel.position.set(cx, 1.24, cz)
  group.add(bezel)

  const tex = makeTftTexture()
  const glassParams: THREE.MeshPhysicalMaterialParameters = {
    color: tex ? 0xffffff : 0x102a3a,
    emissive: tex ? 0x24495b : 0x0b1c27,
    emissiveIntensity: tex ? 0.72 : 0.35,
    roughness: 0.22,
    metalness: 0,
    clearcoat: 0.75,
    clearcoatRoughness: 0.18,
  }
  if (tex) glassParams.map = tex
  const glassMat = new THREE.MeshPhysicalMaterial(glassParams)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(bodyW - 2.0, bodyD - 2.0), glassMat)
  glass.rotation.x = -Math.PI / 2
  glass.position.set(cx, 1.36, cz)
  group.add(glass)

  const pinXs = pins.map((p) => p.x)
  const headerW = pinXs.length > 1 ? Math.max(...pinXs) - Math.min(...pinXs) + 0.9 : 1.1
  const header = new THREE.Mesh(
    new THREE.BoxGeometry(headerW, 0.30, 0.72),
    plastic(0x141619, 0.55),
  )
  header.name = 'tft5-header'
  header.position.set(cx, 0.36, first.z)
  group.add(header)

  const padGeo = cachedGeometry('tft5-pad', () => new THREE.CylinderGeometry(0.22, 0.22, 0.48, 14))
  for (const p of pins) {
    const pad = new THREE.Mesh(padGeo, metal(0xd6b75c, 0.25))
    pad.position.set(p.x, 0.58, p.z)
    group.add(pad)
  }

  const title = makeBoardLabel('5”  TFT  800×480', 8.4, 1.0)
  if (title) {
    title.position.set(cx, 1.48, cz - bodyD / 2 + 1.05)
    group.add(title)
  }

  // Wires attach to the same physical header posts that are now rendered on
  // the screen edge (scene uses these x/z positions with TERMINAL_TOP_Y).
  return { object: group, pinWorld: pins.map((p) => new THREE.Vector3(p.x, 0.70, p.z)) }
}
