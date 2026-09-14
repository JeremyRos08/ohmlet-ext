import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { ComponentInstance } from '../../model/types'
import type { CatalogEntry } from '../../model/catalog'
import { TERMINAL_TOP_Y } from '../internal/wires'
import {
  getMultimeterReading,
  multimeterModeOf,
  type MultimeterMode,
  type MultimeterReading,
} from '../../sim/multimeter-chip'
import {
  type BuildResult,
  cachedGeometry,
  cachedMaterial,
  centroidOf,
  labelMaterial,
  metal,
  plastic,
} from './shared'

const LCD_W = 320
const LCD_H = 140

function finite(v: number): boolean {
  return Number.isFinite(v)
}

function fixedSmart(v: number, unit: string): string {
  if (!finite(v)) return '----'
  if (Math.abs(v) > 9999) return 'OL'
  const a = Math.abs(v)
  const digits = a >= 100 ? 1 : a >= 10 ? 2 : 3
  const body = a.toFixed(digits)
  return v < -0.0005 ? `-${body}` : body
}

interface DisplayValue {
  main: string
  mode: string
  unit: string
  footer: string
  continuity: boolean
}

function displayFor(mode: MultimeterMode, reading: MultimeterReading | null): DisplayValue {
  const value = reading?.value ?? Number.NaN
  switch (mode) {
    case 'dcv': {
      const a = Math.abs(value)
      if (finite(value) && a < 1) {
        return { main: fixedSmart(value * 1000, 'mV'), mode: 'DC', unit: 'mV', footer: 'AUTO   10 MΩ', continuity: false }
      }
      return { main: fixedSmart(value, 'V'), mode: 'DC', unit: 'V', footer: 'AUTO   10 MΩ', continuity: false }
    }
    case 'acv': {
      const a = Math.abs(value)
      if (finite(value) && a < 1) {
        return { main: fixedSmart(value * 1000, 'mV'), mode: 'AC RMS', unit: 'mV', footer: 'TRUE RMS EST.', continuity: false }
      }
      return { main: fixedSmart(value, 'V'), mode: 'AC RMS', unit: 'V', footer: 'TRUE RMS EST.', continuity: false }
    }
    case 'ohm':
    case 'continuity': {
      const r = reading?.resistance ?? value
      let main = 'OL'
      let unit = 'Ω'
      if (finite(r) && r >= 0) {
        if (r >= 1_000_000) {
          main = fixedSmart(r / 1_000_000, 'MΩ')
          unit = 'MΩ'
        } else if (r >= 1000) {
          main = fixedSmart(r / 1000, 'kΩ')
          unit = 'kΩ'
        } else {
          main = fixedSmart(r, 'Ω')
          unit = 'Ω'
        }
      }
      const beep = mode === 'continuity' && !!reading?.continuity
      return {
        main,
        mode: mode === 'continuity' ? 'CONT' : 'Ω',
        unit,
        footer: beep ? 'BEEP   CLOSED' : mode === 'continuity' ? 'OPEN > 50 Ω' : 'AUTO RANGE',
        continuity: beep,
      }
    }
    case 'ma':
      return { main: fixedSmart(value * 1000, 'mA'), mode: 'DC', unit: 'mA', footer: '1 Ω SHUNT', continuity: false }
    case 'a':
      return { main: fixedSmart(value, 'A'), mode: 'DC', unit: 'A', footer: '0.01 Ω SHUNT', continuity: false }
  }
}

function drawLcd(ctx: CanvasRenderingContext2D, display: DisplayValue): void {
  ctx.fillStyle = display.continuity ? '#b8c9a2' : '#a8b79a'
  ctx.fillRect(0, 0, LCD_W, LCD_H)

  ctx.fillStyle = 'rgba(38,48,38,0.07)'
  for (let x = 0; x < LCD_W; x += 8) ctx.fillRect(x, 0, 1, LCD_H)
  for (let y = 0; y < LCD_H; y += 8) ctx.fillRect(0, y, LCD_W, 1)

  ctx.fillStyle = '#263126'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 18px Arial, sans-serif'
  ctx.fillText(display.mode, 18, 25)
  ctx.textAlign = 'right'
  ctx.fillText(display.unit, LCD_W - 20, 25)

  ctx.fillStyle = '#182118'
  ctx.textAlign = 'center'
  ctx.font = 'bold 66px "Courier New", monospace'
  ctx.fillText(display.main, LCD_W / 2, 80)

  ctx.font = 'bold 15px Arial, sans-serif'
  ctx.fillStyle = display.continuity ? '#1e441f' : '#3a4938'
  ctx.fillText(display.footer, LCD_W / 2, 123)
}

const MODE_ANGLE: Record<MultimeterMode, number> = {
  dcv: -0.95,
  acv: -0.55,
  ohm: -0.15,
  continuity: 0.25,
  ma: 0.65,
  a: 1.05,
}

/**
 * Handheld digital multimeter. Electrical behavior is implemented by the
 * behavioral bridge in src/sim/multimeter-chip.ts; this file renders the
 * instrument and presents the live computed reading.
 */
export function buildMultimeter(
  comp: ComponentInstance,
  _entry: CatalogEntry,
  pins: THREE.Vector3[],
): BuildResult {
  const group = new THREE.Group()
  const c = centroidOf(pins)
  const postZ = c.z
  const frontZ = postZ - 0.8
  const bodyW = 6.5
  const bodyH = 4.0
  const bodyD = 3.2

  const holster = new THREE.Mesh(
    cachedGeometry('dmm-holster', () => new RoundedBoxGeometry(bodyW + 0.34, bodyH + 0.34, bodyD + 0.2, 3, 0.3)),
    cachedMaterial('dmm-holster-mat', () =>
      new THREE.MeshPhysicalMaterial({ color: 0xd8a52d, roughness: 0.82, metalness: 0 }),
    ),
  )
  holster.position.set(c.x, bodyH / 2, frontZ - bodyD / 2 - 0.07)
  group.add(holster)

  const shell = new THREE.Mesh(
    cachedGeometry('dmm-shell', () => new RoundedBoxGeometry(bodyW, bodyH, bodyD, 3, 0.22)),
    cachedMaterial('dmm-shell-mat', () =>
      new THREE.MeshPhysicalMaterial({ color: 0x202226, roughness: 0.62, metalness: 0 }),
    ),
  )
  shell.position.set(c.x, bodyH / 2, frontZ - bodyD / 2)
  shell.renderOrder = 1
  group.add(shell)

  const face = new THREE.Mesh(
    cachedGeometry('dmm-face', () => new RoundedBoxGeometry(bodyW - 0.42, bodyH - 0.38, 0.12, 2, 0.12)),
    plastic(0x25272b, 0.58),
  )
  face.position.set(c.x, bodyH / 2, frontZ + 0.02)
  group.add(face)

  const faceZ = frontZ + 0.1
  const screenY = 2.9
  const screenW = 4.25
  const screenH = 1.35

  const bezel = new THREE.Mesh(
    cachedGeometry('dmm-screen-bezel', () => new RoundedBoxGeometry(screenW + 0.38, screenH + 0.34, 0.16, 2, 0.1)),
    plastic(0x0d0e10, 0.72),
  )
  bezel.position.set(c.x, screenY, faceZ)
  group.add(bezel)

  let updateScreen: ((mode: MultimeterMode, reading: MultimeterReading | null) => void) | null = null
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = LCD_W
    canvas.height = LCD_H
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tex,
        emissive: 0x52604b,
        emissiveMap: tex,
        emissiveIntensity: 0.18,
        roughness: 0.42,
        metalness: 0,
      })
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), mat)
      screen.position.set(c.x, screenY, faceZ + 0.1)
      group.add(screen)
      let lastKey = ''
      updateScreen = (mode, reading) => {
        const d = displayFor(mode, reading)
        const key = `${mode}|${d.main}|${d.unit}|${d.footer}`
        if (key === lastKey) return
        lastKey = key
        drawLcd(ctx, d)
        tex.needsUpdate = true
      }
      updateScreen(multimeterModeOf(comp), null)
    }
  }

  const glass = new THREE.Mesh(
    cachedGeometry('dmm-screen-glass', () => new THREE.PlaneGeometry(screenW + 0.1, screenH + 0.1)),
    cachedMaterial('dmm-screen-glass-mat', () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xdce7e1,
        roughness: 0.06,
        metalness: 0,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    ),
  )
  glass.position.set(c.x, screenY, faceZ + 0.13)
  group.add(glass)

  const dial = new THREE.Mesh(
    cachedGeometry('dmm-dial', () => {
      const g = new THREE.CylinderGeometry(0.83, 0.83, 0.3, 28)
      g.rotateX(Math.PI / 2)
      return g
    }),
    plastic(0x111214, 0.48),
  )
  dial.position.set(c.x, 1.35, faceZ + 0.18)
  group.add(dial)

  const pointer = new THREE.Mesh(
    cachedGeometry('dmm-pointer', () => new THREE.BoxGeometry(0.11, 0.67, 0.08)),
    cachedMaterial('dmm-pointer-mat', () =>
      new THREE.MeshPhysicalMaterial({ color: 0xe7e7e7, roughness: 0.4, metalness: 0 }),
    ),
  )
  pointer.position.set(c.x, 1.68, faceZ + 0.35)
  pointer.rotation.z = MODE_ANGLE[multimeterModeOf(comp)]
  group.add(pointer)

  const legendMat = labelMaterial('DCV   ACV   Ω   CONT   mA   A', { w: 512, h: 64, fg: '#e8e8e8' })
  if (legendMat) {
    const lbl = new THREE.Mesh(
      cachedGeometry('dmm-mode-legend', () => new THREE.PlaneGeometry(4.0, 0.5)),
      legendMat,
    )
    lbl.position.set(c.x, 0.66, faceZ + 0.11)
    group.add(lbl)
  }

  // Two front jacks are kept for this first extended meter. Current ranges
  // use the same red input in simulation; a dedicated fused A jack can be
  // added later without changing the measurement core.
  const jackGeo = cachedGeometry('dmm-jack', () => {
    const g = new THREE.CylinderGeometry(0.25, 0.25, 0.54, 18)
    g.rotateX(Math.PI / 2)
    return g
  })
  const ringGeo = cachedGeometry('dmm-jack-ring', () => new THREE.TorusGeometry(0.28, 0.055, 8, 20))
  const studGeo = cachedGeometry('dmm-jack-stud', () => {
    const g = new THREE.CylinderGeometry(0.09, 0.09, 0.22, 14)
    g.rotateX(Math.PI / 2)
    return g
  })
  const jackMats = [
    cachedMaterial('dmm-jack-red', () => new THREE.MeshPhysicalMaterial({ color: 0xb91f2b, roughness: 0.55, metalness: 0 })),
    cachedMaterial('dmm-jack-black', () => new THREE.MeshPhysicalMaterial({ color: 0x09090a, roughness: 0.62, metalness: 0 })),
  ]
  for (let i = 0; i < Math.min(pins.length, 2); i++) {
    const p = pins[i]
    const y = TERMINAL_TOP_Y - 0.1
    const barrel = new THREE.Mesh(jackGeo, jackMats[i])
    barrel.position.set(p.x, y, p.z - 0.27)
    group.add(barrel)
    const ring = new THREE.Mesh(ringGeo, jackMats[i])
    ring.position.set(p.x, y, frontZ + 0.12)
    group.add(ring)
    const stud = new THREE.Mesh(studGeo, metal(0xb7bcc2, 0.28))
    stud.position.set(p.x, y, p.z + 0.08)
    group.add(stud)
  }

  const vohmMat = labelMaterial('VΩ / mA / A', { w: 220, h: 48, fg: '#e8e8e8' })
  if (vohmMat && pins[0]) {
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.28), vohmMat)
    lbl.position.set(pins[0].x, 0.42, faceZ + 0.11)
    group.add(lbl)
  }
  const comMat = labelMaterial('COM', { w: 128, h: 48, fg: '#e8e8e8' })
  if (comMat && pins[1]) {
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.28), comMat)
    lbl.position.set(pins[1].x, 0.42, faceZ + 0.11)
    group.add(lbl)
  }

  const pinWorld = pins.map((p) => new THREE.Vector3(p.x, TERMINAL_TOP_Y, p.z))

  return {
    object: group,
    pinWorld,
    update: (c2) => {
      const mode = multimeterModeOf(c2)
      pointer.rotation.z = MODE_ANGLE[mode]
      pointer.updateMatrix()
      updateScreen?.(mode, getMultimeterReading(c2.id))
    },
  }
}
