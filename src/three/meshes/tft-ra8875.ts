import * as THREE from 'three'
import type { ComponentInstance } from '../../model/types'
import { paramOf, type CatalogEntry } from '../../model/catalog'
import { getEsp32DisplayFrame } from '../../firmware/esp32-runtime'
import {
  type BuildResult,
  cachedGeometry,
  cachedMaterial,
  metal,
  plastic,
  topLabel,
} from './shared'

interface ScreenSurface {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
}

function drawIdleScreen(ctx: CanvasRenderingContext2D): void {
  const grad = ctx.createLinearGradient(0, 0, 800, 480)
  grad.addColorStop(0, '#102a3d')
  grad.addColorStop(0.55, '#184e68')
  grad.addColorStop(1, '#091721')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 800, 480)

  ctx.strokeStyle = 'rgba(105,210,255,.16)'
  ctx.lineWidth = 2
  for (let x = 0; x <= 800; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 480); ctx.stroke()
  }
  for (let y = 0; y <= 480; y += 80) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke()
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#d7f2ff'
  ctx.font = '700 58px Arial, sans-serif'
  ctx.fillText('5.0” TFT  800 × 480', 400, 160)
  ctx.fillStyle = '#70d7ff'
  ctx.font = '700 38px "Courier New", monospace'
  ctx.fillText('RA8875', 400, 245)
  ctx.fillStyle = '#89aab9'
  ctx.font = '600 27px Arial, sans-serif'
  ctx.fillText('ER-TFTM050A2-3-3661', 400, 310)
  ctx.fillStyle = '#6f8c99'
  ctx.font = '600 23px Arial, sans-serif'
  ctx.fillText('NO SIGNAL', 400, 365)
}

function makeScreenSurface(): ScreenSurface | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 480
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawIdleScreen(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return { canvas, ctx, texture }
}

function drawRgb565(surface: ScreenSurface, width: number, height: number, bytes: Uint8Array): void {
  if (width <= 0 || height <= 0 || bytes.length < width * height * 2) return
  const image = surface.ctx.createImageData(width, height)
  const out = image.data
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    const v = bytes[i * 2] | (bytes[i * 2 + 1] << 8)
    const r5 = (v >> 11) & 0x1f
    const g6 = (v >> 5) & 0x3f
    const b5 = v & 0x1f
    out[p] = (r5 << 3) | (r5 >> 2)
    out[p + 1] = (g6 << 2) | (g6 >> 4)
    out[p + 2] = (b5 << 3) | (b5 >> 2)
    out[p + 3] = 255
  }
  if (width === surface.canvas.width && height === surface.canvas.height) {
    surface.ctx.putImageData(image, 0, 0)
  } else {
    const tmp = document.createElement('canvas')
    tmp.width = width
    tmp.height = height
    tmp.getContext('2d')?.putImageData(image, 0, 0)
    surface.ctx.imageSmoothingEnabled = false
    surface.ctx.clearRect(0, 0, surface.canvas.width, surface.canvas.height)
    surface.ctx.drawImage(tmp, 0, 0, surface.canvas.width, surface.canvas.height)
  }
  surface.texture.needsUpdate = true
}

function label(text: string, width: number, height: number, fg = '#eef6ef'): THREE.Object3D | null {
  return topLabel(text, width, height, { w: 768, h: 96, fg })
}

function pinLabelColor(name: string): string {
  if (name === '5V') return '#ffb4ae'
  if (name === 'GND') return '#f0f1f4'
  if (name.startsWith('TP_')) return '#b9f6ca'
  if (name === 'LITE') return '#ffe38a'
  return '#a9e8ff'
}

function pinLabel(name: string): THREE.Object3D | null {
  const fontPx = name.length >= 6 ? 21 : name.length >= 5 ? 24 : 28
  return topLabel(name, 2.18, 0.46, {
    w: 256,
    h: 64,
    fg: pinLabelColor(name),
    bg: 'rgba(5, 12, 15, 0.90)',
    font: `700 ${fontPx}px "Helvetica Neue", Arial, sans-serif`,
  })
}

/** EastRising ER-TFTM050A2-3-3661, driven by the virtual RA8875 board model. */
export function buildRa8875Tft5(
  comp: ComponentInstance,
  entry: CatalogEntry,
  pins: THREE.Vector3[],
): BuildResult {
  const group = new THREE.Group()
  const fallback = new THREE.Vector3(-8, 0, 2)
  const first = pins[0] ?? fallback
  const xs = pins.length ? pins.map((p) => p.x) : [first.x]
  const pinMinX = Math.min(...xs)
  const pinMaxX = Math.max(...xs)
  const cx = (pinMinX + pinMaxX) / 2
  const pinZ = pins.length ? pins.reduce((sum, p) => sum + p.z, 0) / pins.length : first.z

  const bodyW = Math.max(36, pinMaxX - pinMinX + 3.0)
  const bodyD = bodyW / (132.7 / 75.95)
  const bodyFrontZ = pinZ - 1.35
  const cz = bodyFrontZ - bodyD / 2

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW, 0.9, bodyD),
    cachedMaterial('ra8875-tft5-back', () =>
      new THREE.MeshPhysicalMaterial({ color: 0x161a20, roughness: 0.48, metalness: 0.14 }),
    ),
  )
  back.name = 'tft5-body'
  back.position.set(cx, 0.72, cz)
  group.add(back)

  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW - 1.1, 0.18, bodyD - 1.05),
    plastic(0x050607, 0.36),
  )
  bezel.position.set(cx, 1.24, cz)
  group.add(bezel)

  const surface = makeScreenSurface()
  const glassParams: THREE.MeshPhysicalMaterialParameters = {
    color: surface ? 0xffffff : 0x102a3a,
    emissive: surface ? 0x24495b : 0x0b1c27,
    emissiveIntensity: surface ? 0.74 : 0.35,
    roughness: 0.19,
    metalness: 0,
    clearcoat: 0.82,
    clearcoatRoughness: 0.14,
  }
  if (surface) glassParams.map = surface.texture
  const glassMat = new THREE.MeshPhysicalMaterial(glassParams)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(bodyW - 2.0, bodyD - 2.0), glassMat)
  glass.name = 'tft5-glass'
  glass.rotation.x = -Math.PI / 2
  glass.position.set(cx, 1.36, cz)
  group.add(glass)

  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW - 0.8, 0.22, 2.15),
    cachedMaterial('ra8875-tft5-pcb', () =>
      new THREE.MeshPhysicalMaterial({ color: 0x174f3b, roughness: 0.63, metalness: 0.05, clearcoat: 0.12 }),
    ),
  )
  apron.name = 'tft5-controller-pcb'
  apron.position.set(cx, 0.42, pinZ - 0.34)
  group.add(apron)

  const chip = new THREE.Mesh(
    cachedGeometry('ra8875-chip', () => new THREE.BoxGeometry(2.15, 0.22, 1.35)),
    plastic(0x111318, 0.48),
  )
  chip.position.set(cx - bodyW * 0.30, 0.58, pinZ - 0.48)
  group.add(chip)

  const ra = label('RA8875', 2.0, 0.55, '#d9e6df')
  if (ra) {
    ra.position.set(cx - bodyW * 0.30, 0.71, pinZ - 0.48)
    group.add(ra)
  }

  const headerW = Math.max(2.0, pinMaxX - pinMinX + 0.95)
  const header = new THREE.Mesh(new THREE.BoxGeometry(headerW, 0.34, 0.78), plastic(0x111315, 0.50))
  header.name = 'tft5-header'
  header.position.set(cx, 0.39, pinZ)
  group.add(header)

  const socketGeo = cachedGeometry('ra8875-header-socket', () => new THREE.BoxGeometry(0.52, 0.26, 0.52))
  const postGeo = cachedGeometry('ra8875-header-post', () => new THREE.CylinderGeometry(0.12, 0.12, 0.80, 10))
  const headerMat = plastic(0x0d0f11, 0.48)
  const gold = metal(0xd8b24e, 0.23)
  const labelGroup = new THREE.Group()
  labelGroup.name = 'tft5-pin-labels'
  labelGroup.userData.pinNames = [...entry.pins]

  for (let i = 0; i < pins.length; i++) {
    const p = pins[i]
    const pinName = entry.pins[i] ?? String(i + 1)
    const socket = new THREE.Mesh(socketGeo, headerMat)
    socket.position.set(p.x, 0.46, p.z)
    group.add(socket)
    const post = new THREE.Mesh(postGeo, gold)
    post.name = `tft5-pin-${pinName}`
    post.position.set(p.x, 0.76, p.z)
    group.add(post)

    const labelZ = pinZ - (i % 2 === 0 ? 0.70 : 1.19)
    const plaque = new THREE.Mesh(
      cachedGeometry('ra8875-pin-plaque', () => new THREE.BoxGeometry(2.22, 0.035, 0.49)),
      cachedMaterial('ra8875-pin-plaque-mat', () =>
        new THREE.MeshStandardMaterial({ color: 0x071014, roughness: 0.72, metalness: 0.02 }),
      ),
    )
    plaque.name = `tft5-pinlabel-bg-${pinName}`
    plaque.position.set(p.x, 0.655, labelZ)
    labelGroup.add(plaque)
    const text = pinLabel(pinName)
    if (text) {
      text.name = `tft5-pinlabel-${pinName}`
      text.position.set(p.x, 0.684, labelZ)
      labelGroup.add(text)
    }
  }
  group.add(labelGroup)

  const title = label('EASTRISING  ER-TFTM050A2-3', 10.5, 0.78)
  if (title) {
    title.position.set(cx, 1.49, cz - bodyD / 2 + 0.95)
    group.add(title)
  }
  const bus = label('SPI / RA8875     CAP TOUCH', 8.5, 0.62, '#d3ded8')
  if (bus) {
    bus.position.set(cx + bodyW * 0.13, 0.66, pinZ - 0.45)
    group.add(bus)
  }

  let lastSource = ''
  let lastSeq = -1
  const update = surface
    ? (nextComp: ComponentInstance) => {
        const source = String(paramOf(nextComp.params, entry, 'sourceEsp') ?? 'U1').trim()
        if (source !== lastSource) {
          lastSource = source
          lastSeq = -1
          drawIdleScreen(surface.ctx)
          surface.texture.needsUpdate = true
        }
        const frame = source ? getEsp32DisplayFrame(source) : undefined
        if (!frame || frame.seq === lastSeq) return
        lastSeq = frame.seq
        drawRgb565(surface, frame.width, frame.height, frame.rgb565)
      }
    : undefined

  // Prime from an already-running source when a screen is added/rebuilt.
  update?.(comp)
  return {
    object: group,
    pinWorld: pins.map((p) => new THREE.Vector3(p.x, 0.7, p.z)),
    update,
  }
}
