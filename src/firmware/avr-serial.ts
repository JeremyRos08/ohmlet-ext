import type { AVRUSART } from 'avr8js'

/** Buffer host input until the emulated UART can receive its next byte. */
export class AvrSerialBridge {
  private input: number[] = []
  private nextByte = 0
  private output: number[] = []
  private decoder = new TextDecoder()

  constructor(private uart: AVRUSART, private emit: (text: string) => void) {
    uart.onRxComplete = () => this.pump()
    uart.onByteTransmit = (value) => {
      this.output.push(value)
      if (value === 10 || this.output.length >= 128) this.flush()
    }
  }

  send(text: string): void {
    for (const byte of new TextEncoder().encode(text)) this.input.push(byte)
    this.pump()
  }

  // Also called once per execution slice: firmware may enable RX after Send.
  pump(): void {
    if (this.nextByte >= this.input.length) return
    if (this.uart.writeByte(this.input[this.nextByte]) !== true) return
    this.nextByte += 1
    if (this.nextByte === this.input.length) {
      this.input = []
      this.nextByte = 0
    }
  }

  // Flush at the UI refresh interval, even without a trailing newline.
  flush(): void {
    if (!this.output.length) return
    const text = this.decoder.decode(new Uint8Array(this.output), { stream: true })
    this.output = []
    if (text) this.emit(text)
  }
}
