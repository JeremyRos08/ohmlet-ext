import { expect, it } from 'vitest'
import '../src/model/catalog-ext'
import { SSD1306, getSSD1306 } from '../src/sim/ssd1306'
import { createChip } from '../src/sim/chip-api'
import { validateLayout } from '../src/model/validate'
import example from '../examples/uno-oled-spi.json'
import { buildAdafruitModule } from '../src/three/meshes/adafruit-modules'
import { getEntry } from '../src/model/catalog'
import * as THREE from 'three'

it('validates every wire in the Uno OLED example', () => {
  const result = validateLayout(example)
  expect(result.ok, result.errors.join('\n')).toBe(true)
})
it('decodes wired SPI, updates the 3D texture, ignores deselected bytes and resets on supply loss', () => {
  const chip = createChip('ssd1306', {id:'OLED-test',type:'adafruit_ssd1306_128x64'})!
  const pins: Record<string,number> = {VIN:3.3,GND:0,RST:3.3,CS:3.3,DC:0,SCL_SCK:0,SDA_MOSI:0}
  const step = () => chip.step({time:0,dt:.001,readPin:p=>pins[p]??NaN,drivePin:()=>{}})
  const send = (value:number, data=false, selected=true) => {
    pins.CS=selected?0:3.3; pins.DC=data?3.3:0; pins.SCL_SCK=0; step()
    for(let b=7;b>=0;b--) { pins.SDA_MOSI=value&(1<<b)?3.3:0; step();pins.SCL_SCK=3.3;step();pins.SCL_SCK=0;step() }
    pins.CS=3.3;step()
  }
  step();send(0xaf);send(1,true)
  const state=getSSD1306('OLED-test')!
  expect(state.pixel(0,0)).toBe(true);expect(state.pixel(0,1)).toBe(false)
  send(0xae,false,false);expect(state.on).toBe(true)
  const entry=getEntry('adafruit_ssd1306_128x64')!
  const built=buildAdafruitModule(chip.comp,entry,entry.pins.map((_,i)=>new THREE.Vector3(i*2.5,0,0)))
  built.update!(chip.comp,entry,null)
  const face=built.object.getObjectByName('oled-pixels') as THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>
  expect(face.material.map!.image.data[(63*128)*4]).toBeGreaterThan(0)
  pins.VIN=0;step();built.update!(chip.comp,entry,null)
  expect(state.pixel(0,0)).toBe(false);expect(face.material.map!.image.data[(63*128)*4]).toBe(0)
  pins.VIN=3.3;step();expect(state.on).toBe(false)
})
it('handles addressing windows, inversion and display enable', () => {
  const s=new SSD1306();s.powered=true
  for(const v of [0x20,0,0x21,10,11,0x22,2,3,0xaf])s.write(v,false)
  for(const v of [1,2,4,8])s.write(v,true)
  expect(s.ram[266]).toBe(1);expect(s.ram[267]).toBe(2)
  expect(s.ram[394]).toBe(4);expect(s.ram[395]).toBe(8)
  expect(s.column).toBe(10);expect(s.page).toBe(2)
  s.write(0xa7,false);expect(s.pixel(10,16)).toBe(false)
  s.write(0xa5,false);expect(s.pixel(10,16)).toBe(true)
  s.write(0xae,false);expect(s.pixel(10,16)).toBe(false)
})
