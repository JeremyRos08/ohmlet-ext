import { expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({ io: {outB:0,outC:0,outD:0,ddrB:63,ddrC:0,ddrD:0,pwmB:Array(8).fill(0),pwmC:Array(8).fill(0),pwmD:Array(8).fill(0)} }))
vi.mock('../src/firmware/avr-runtime',()=>({getAvrIoState:()=>runtime.io,nextAvrIoState:()=>runtime.io,getAvrRuntimeSnapshot:()=>({status:'running'}),setAvrAnalogInput:()=>{},setAvrDigitalInput:()=>{}}))
import '../src/model/catalog-ext'
import { SimEngine } from '../src/sim/engine'
import { getSSD1306 } from '../src/sim/ssd1306'
import example from '../examples/uno-oled-spi.json'
it('delivers real net voltages from Uno outputs to the OLED',()=>{
 const engine=new SimEngine(example as any)
 const settle=()=>{for(let i=0;i<3;i++)engine.step(.001)}
 runtime.io.outB=6;settle()
 const send=(v:number, data=false)=>{
 runtime.io.outB=2|Number(data);settle()
 for(let b=7;b>=0;b--){runtime.io.outB=2|Number(data)|((v>>b&1)<<3);settle();runtime.io.outB|=32;settle();runtime.io.outB&=~32;settle()}
 runtime.io.outB|=4;settle()
 }
 send(0xaf);send(0xa5)
 expect(getSSD1306('OLED1')?.powered).toBe(true)
 expect(getSSD1306('OLED1')?.on).toBe(true)
 expect(getSSD1306('OLED1')?.pixel(64,32)).toBe(true)
})
