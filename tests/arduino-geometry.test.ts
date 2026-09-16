import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import '../src/model/catalog-ext'
import { getEntry } from '../src/model/catalog'
import { offboardTerminalPosition, offboardBodyRect, componentPinHoles, holePosition } from '../src/model/breadboard'
import { buildArduinoUno, buildArduinoNano } from '../src/three/meshes/arduino'
import { restoreLayout } from '../src/model/restore-layout'
import { validateLayout } from '../src/model/validate'
import { instrumentsForLayout } from '../src/three/internal/wires'

const type = 'arduino_uno_r3'
describe('Arduino header geometry', () => {
  it('keeps every Uno pin on the PCB, aligned with routing and labeled', () => {
    const entry = getEntry(type)!
    const comp = { id:'U1', type, pos:{x:10,z:30} }
    const pins = entry.pins.map((_,i) => { const p=offboardTerminalPosition(0,i,comp.pos,type); return new THREE.Vector3(p.x,0,p.z) })
    const mesh = buildArduinoUno(comp,entry,pins)
    const body = new THREE.Box3().setFromObject(mesh.object.getObjectByName('arduino-uno-body')!)
    expect(new Set(pins.map(p=>p.z)).size).toBe(2)
    const obstacle = instrumentsForLayout({version:1,components:[comp],wires:[]})[0]
    pins.forEach((p,i) => {
      expect(p.x).toBeGreaterThan(body.min.x); expect(p.x).toBeLessThan(body.max.x)
      expect(p.z).toBeGreaterThan(body.min.z); expect(p.z).toBeLessThan(body.max.z)
      expect(mesh.object.getObjectByName(`pin-label:${entry.pins[i]}`)).toBeDefined()
      expect(obstacle.terminals[i].x).toBe(p.x); expect(obstacle.terminals[i].z).toBe(p.z)
    })
    const rect = offboardBodyRect(0,comp.pos,type)
    expect(rect.minX).toBeLessThanOrEqual(body.min.x)
    expect(rect.maxX).toBeGreaterThanOrEqual(body.max.x)
  })
  it('places mixed default shelf devices clear of the breadboard and each other', () => {
    expect(validateLayout({version:1,components:[{id:'PS1',type:'power_supply'},{id:'U1',type},{id:'U2',type}],wires:[]}).errors).toEqual([])
    expect(validateLayout({version:1,components:[{id:'U1',type,pos:{x:0,z:0}}],wires:[]}).ok).toBe(false)
  })
  it('provides every Nano label on either header, including after rotation', () => {
    const entry = getEntry('arduino_nano')!
    for (const rotation of [0,180] as const) {
      const comp = {id:'N1',type:entry.type,at:rotation === 0 ? 'b10' : 'i24',rotation}
      const holes = componentPinHoles(comp,entry,'standard')!
      expect(holes).not.toBeNull()
      const pins=holes.map(h=>{const p=holePosition(h!);return new THREE.Vector3(p.x,0,p.z)})
      const mesh=buildArduinoNano(comp,entry,pins)
      entry.pins.forEach(pin=>expect(mesh.object.getObjectByName(`pin-label:${pin}`)).toBeDefined())
    }
  })
})

it('restores a legacy Uno footprint without losing its wires or parameters', () => {
  const old = { version:1, components:[{id:'U1',type:'arduino_uno_r3',pos:{x:-10,z:0},params:{usbPower:false}}], wires:[{id:'W1',from:'U1:D2',to:'a1'}] }
  const restored = restoreLayout(old)!
  expect(restored).not.toBeNull()
  expect(restored.wires).toEqual(old.wires)
  expect(restored.components[0].params).toEqual({usbPower:false})
  expect(restored.components[0].pos).toBeUndefined()
  expect(old.components[0].pos).toEqual({x:-10,z:0})
  expect(restoreLayout({ ...old, wires:[{id:'bad',from:'no-pin',to:'a1'}] })).toBeNull()
})

// A rotated ESP32 keeps its connector assembly and wireable pins in one frame.
it('rotates the ESP32 detail model with all 44 pins', async () => {
  const { buildEsp32S3DevKit } = await import('../src/three/meshes/embedded')
  const entry = getEntry('esp32_s3_devkit')!
  for (const rotation of [0,180] as const) {
    const comp = {id:'ESP1',type:entry.type,at:rotation === 0 ? 'b10' : 'i31',rotation}
    const pins = componentPinHoles(comp,entry,'standard')!.map(h=>{const p=holePosition(h!);return new THREE.Vector3(p.x,0,p.z)})
    const built = buildEsp32S3DevKit(comp,entry,pins)
    pins.forEach((p,i)=>{
      expect(built.pinWorld![i].x).toBeCloseTo(p.x,8)
      expect(built.pinWorld![i].z).toBeCloseTo(p.z,8)
      expect(built.object.getObjectByName(`pin-label:${entry.pins[i]}`)).toBeDefined()
    })
    const details = built.object.getObjectByName('board-surface-details')!
    expect(details.children.length).toBeLessThan(12)
  }
})
