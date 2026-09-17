import { expect, it } from 'vitest'
import { timerOutputMasks } from '../src/firmware/avr-pwm'
it('preserves digital SPI signals when Arduino timers run without compare outputs',()=>{
 expect(timerOutputMasks(3,1,1)).toEqual({B:0,C:0,D:0})
})
it('averages only timer-connected outputs and never SCK or DC',()=>{
 const masks=timerOutputMasks(0xa3,0xa1,0xa1)
 expect(masks).toEqual({B:14,C:0,D:104})
 expect(masks.B & 33).toBe(0)
})
