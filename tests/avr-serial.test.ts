import { describe, expect, it } from 'vitest'
import { AVRUSART, CPU, usart0Config } from 'avr8js'
import { AvrSerialBridge } from '../src/firmware/avr-serial'

function serialHarness(enabled = true) {
  const cpu = new CPU(new Uint16Array(0x4000))
  const uart = new AVRUSART(cpu, usart0Config, 16_000_000)
  const output: string[] = []
  const bridge = new AvrSerialBridge(uart, (text) => output.push(text))
  // 9600 baud, 8N1, RX/TX enabled. One character takes 16,640 CPU cycles.
  cpu.writeData(usart0Config.UBRRL, 103)
  if (enabled) cpu.writeData(usart0Config.UCSRB, 0x18)
  const receive = () => {
    cpu.cycles += 16_640
    cpu.tick()
    expect(cpu.data[usart0Config.UCSRA] & 0x80).toBe(0x80)
    return cpu.readData(usart0Config.UDR)
  }
  return { cpu, uart, output, bridge, receive }
}

describe('Arduino serial monitor with the real AVR8js UART', () => {
  it('delivers a whole message in order while the UART is busy', () => {
    const { bridge, receive, uart } = serialHarness()
    bridge.send('Hello')
    bridge.send(' Arduino\n')
    const expected = new TextEncoder().encode('Hello Arduino\n')
    expect(Array.from(expected, () => receive())).toEqual(Array.from(expected))
    expect(uart.rxBusy).toBe(false)
  })

  it('keeps input sent before firmware enables RX', () => {
    const { cpu, bridge, receive, uart } = serialHarness(false)
    bridge.send('OK')
    expect(uart.rxBusy).toBe(false)
    cpu.writeData(usart0Config.UCSRB, 0x18)
    bridge.pump()
    expect([receive(), receive()]).toEqual([79, 75])
  })

  it('flushes Serial.print output without a newline', () => {
    const { cpu, bridge, output } = serialHarness()
    for (const byte of new TextEncoder().encode('Ready> ')) cpu.writeData(usart0Config.UDR, byte)
    bridge.flush()
    expect(output.join('')).toBe('Ready> ')
    bridge.flush()
    expect(output).toHaveLength(1)
  })

  it('preserves UTF-8 text in both directions, including split output bytes', () => {
    const { cpu, bridge, output, receive } = serialHarness()
    const bytes = new TextEncoder().encode('Prêt 🔧')
    bridge.send('Prêt 🔧')
    expect(Array.from(bytes, () => receive())).toEqual(Array.from(bytes))
    for (const byte of bytes) {
      cpu.writeData(usart0Config.UDR, byte)
      bridge.flush()
    }
    expect(output.join('')).toBe('Prêt 🔧')
  })
})
