/** Only timer-connected pins should use averaged voltages. Software SPI stays digital. */
export function timerOutputMasks(tccr0a: number, tccr1a: number, tccr2a: number) {
  return {
    B: ((tccr1a & 0xc0) ? 2 : 0) | ((tccr1a & 0x30) ? 4 : 0) | ((tccr2a & 0xc0) ? 8 : 0),
    C: 0,
    D: ((tccr0a & 0xc0) ? 64 : 0) | ((tccr0a & 0x30) ? 32 : 0) | ((tccr2a & 0x30) ? 8 : 0),
  }
}
