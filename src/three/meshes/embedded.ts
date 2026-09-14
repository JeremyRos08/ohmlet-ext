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

function makeBoardLabel(text: string, width: number, height: number): THREE.Object3D | null {
  return topLabel(text, width, height, {
    w: 512,
    h: 96,
    fg: '#eef6ef',
  })
}

/** ESP32-S3-DevKitC-1, 2 × 22 pin breadboard module. */
export function buildEsp32S3DevKit(
  _comp: ComponentInstance,
  _entry: CatalogEntry,
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
  const boardW = Math.max(4, maxX - minX + 1.45)
  const boardD = Math.max(4, maxZ - minZ + 1.25)

  const pcb = new THREE.Mesh(
    new THREE.BoxGeometry(boardW, 0.22, boardD),
    cachedMaterial('esp32s3-pcb', () =>
      new THREE.MeshPhysicalMaterial({ color: 0x0d6a45, roughness: 0.62, metalness: 0.05 }),
    ),
  )
  pcb.position.set(c.x, 0.48, c.z)
  group.add(pcb)

  // Header sockets / pins. The real DevKitC-1 has two 22-pin headers.
  const socketGeo = cachedGeometry('esp32s3-header-socket', () => new THREE.BoxGeometry(0.7, 0.42, 0.7))
  const pinGeo = cachedGeometry('esp32s3-header-pin', () => new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8))
  const socketMat = plastic(0x111315, 0.62)
  const pinMat = metal(0xd8b85b, 0.28)
  for (const p of pins) {
    const socket = new THREE.Mesh(socketGeo, socketMat)
    socket.position.set(p.x, 0.72, p.z)
    group.add(socket)
    const pin = new THREE.Mesh(pinGeo, pinMat)
    pin.position.set(p.x, 0.18, p.z)
    group.add(pin)
  }

  // ESP32-S3-WROOM RF module + shield.
  const module = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(boardW * 0.42, 9.0), 0.48, Math.max(3.8, boardD - 2.1)),
    cachedMaterial('esp32s3-module-shield', () =>
      new THREE.MeshPhysicalMaterial({ color: 0xc4c7c4, roughness: 0.34, metalness: 0.74 }),
    ),
  )
  module.position.set(minX + boardW * 0.27, 0.84, c.z)
  group.add(module)

  // PCB antenna area at the module end.
  const antenna = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.06, Math.max(3.1, boardD - 2.6)),
    cachedMaterial('esp32s3-antenna', () =>
      new THREE.MeshStandardMaterial({ color: 0x122c22, roughness: 0.78, metalness: 0.05 }),
    ),
  )
  antenna.position.set(minX + 1.15, 1.09, c.z)
  group.add(antenna)

  // Two USB connectors at the opposite end, matching the DevKitC-1 layout.
  const usbGeo = cachedGeometry('esp32s3-usb', () => new THREE.BoxGeometry(1.45, 0.72, 1.35))
  const usbMat = metal(0xc9ccd0, 0.3)
  for (const dz of [-1.05, 1.05]) {
    const usb = new THREE.Mesh(usbGeo, usbMat)
    usb.position.set(maxX + 0.58, 0.77, c.z + dz)
    group.add(usb)
  }

  // BOOT / RESET tactile switches.
  const btnGeo = cachedGeometry('esp32s3-button', () => new THREE.BoxGeometry(0.95, 0.3, 0.8))
  const btnMat = plastic(0x222326, 0.5)
  for (const dz of [-1.5, 1.5]) {
    const btn = new THREE.Mesh(btnGeo, btnMat)
    btn.position.set(maxX - 2.25, 0.77, c.z + dz)
    group.add(btn)
  }

  const label = makeBoardLabel('ESP32-S3  DEVKITC-1', Math.min(8.5, boardW * 0.42), 1.0)
  if (label) {
    label.position.set(c.x + boardW * 0.12, 0.96, c.z)
    group.add(label)
  }

  return { object: group, pinWorld: pins.map((p) => p.clone()) }
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

  // Intentionally large compared with a bench instrument: roughly preserves
  // the visual proportions of a five-inch 800×480 panel without swallowing
  // the whole simulator bench.
  const bodyW = 30
  const bodyD = 18
  const bodyH = 0.9
  const rightEdge = first.x - 0.45
  const cx = rightEdge - bodyW / 2
  const cz = first.z - 5.0

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW, bodyH, bodyD),
    cachedMaterial('tft5-back', () =>
      new THREE.MeshPhysicalMaterial({ color: 0x15181d, roughness: 0.5, metalness: 0.16 }),
    ),
  )
  back.position.set(cx, 0.72, cz)
  group.add(back)

  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW - 1.0, 0.18, bodyD - 1.0),
    plastic(0x050607, 0.38),
  )
  bezel.position.set(cx, 1.24, cz)
  group.add(bezel)

  const tex = makeTftTexture()
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: tex ? 0xffffff : 0x102a3a,
    map: tex ?? undefined,
    emissive: tex ? 0x24495b : 0x0b1c27,
    emissiveIntensity: tex ? 0.72 : 0.35,
    roughness: 0.22,
    metalness: 0,
    clearcoat: 0.75,
    clearcoatRoughness: 0.18,
  })
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(bodyW - 2.0, bodyD - 2.0), glassMat)
  glass.rotation.x = -Math.PI / 2
  glass.position.set(cx, 1.36, cz)
  group.add(glass)

  // Breakout strip: the simulator wires attach to the provided off-board
  // terminal positions. Labels are intentionally represented by the catalog
  // pin names in Properties; the physical pads stay compact and readable.
  const padGeo = cachedGeometry('tft5-pad', () => new THREE.CylinderGeometry(0.22, 0.22, 0.1, 14))
  for (const p of pins) {
    const pad = new THREE.Mesh(padGeo, metal(0xd6b75c, 0.25))
    pad.position.set(p.x, 0.18, p.z)
    group.add(pad)
  }

  const title = makeBoardLabel('5”  TFT  800×480', 8.4, 1.0)
  if (title) {
    title.position.set(cx, 1.48, cz + bodyD / 2 - 1.05)
    group.add(title)
  }

  return { object: group, pinWorld: pins.map((p) => p.clone()) }
}
