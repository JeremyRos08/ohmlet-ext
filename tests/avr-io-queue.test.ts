import { expect, it } from 'vitest'
import { AvrIoQueue } from '../src/firmware/avr-io-queue'
import { createChip } from '../src/sim/chip-api'
import { getSSD1306 } from '../src/sim/ssd1306'
import '../src/sim/ssd1306'
it('retains SPI commands when all worker samples arrive before the next circuit frame', () => {
  const q = new AvrIoQueue({clock:0,data:0,cs:5})
  let count=0
  const push=(clock:number,data:number,cs:number)=>{q.push({clock,data,cs});count++}
  for(const value of [0xaf,0xa5]) {
    push(0,0,0)
    for(let b=7;b>=0;b--){const data=(value>>b&1)*5;push(0,data,0);push(5,data,0);push(0,data,0)}
    push(0,0,5)
  }
  const chip=createChip('ssd1306',{id:'queuedOLED',type:'adafruit_ssd1306_128x64'})!
  for(let i=0;i<count;i++) {
    const s=q.next()
    chip.step({time:i*.001,dt:.001,drivePin:()=>{},readPin:p=>({VIN:3.3,GND:0,RST:5,DC:0,CS:s.cs,SCL_SCK:s.clock,SDA_MOSI:s.data}[p]??NaN)})
  }
  expect(getSSD1306('queuedOLED')!.pixel(0,0)).toBe(true)
  expect(q.next()).toEqual({clock:0,data:0,cs:5})
})
