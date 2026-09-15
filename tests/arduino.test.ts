import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import '../src/model/catalog-ext'
import { getEntry } from '../src/model/catalog'
import { componentPinHoles } from '../src/model/breadboard'
import { buildComponentObject } from '../src/three/component-meshes'
import { arduinoPinMap } from '../src/sim/arduino-chip'
import { parseIntelHex } from '../src/firmware/avr-runtime'
import { registeredChips } from '../src/sim/chip-api'
import { placementValid } from '../src/state/store'

describe('Arduino ATmega328P simulation', () => {
  it('registers Uno R3 and Nano with the AVR behavioral bridge', () => {
    const uno = getEntry('arduino_uno_r3')
    const nano = getEntry('arduino_nano')
    expect(uno?.sim).toEqual({ kind: 'chip', model: 'arduino_atmega328p' })
    expect(uno?.visual?.shape).toBe('arduino-uno')
    expect(nano?.sim).toEqual({ kind: 'chip', model: 'arduino_atmega328p' })
    expect(nano?.visual?.shape).toBe('arduino-nano')
    expect(registeredChips()).toContain('arduino_atmega328p')
  })

  it('maps Arduino digital and analog headers to ATmega328P ports', () => {
    expect(arduinoPinMap('D0_RX')).toEqual({ port: 'D', bit: 0 })
    expect(arduinoPinMap('D13_SCK')).toEqual({ port: 'B', bit: 5 })
    expect(arduinoPinMap('A0')).toEqual({ port: 'C', bit: 0, analog: 0 })
    expect(arduinoPinMap('A5_SCL')).toEqual({ port: 'C', bit: 5, analog: 5 })
    expect(arduinoPinMap('A6')).toBeNull()
  })

  it('parses strict Intel HEX and rejects a bad checksum', () => {
    const image = parseIntelHex(':0200000000C03E\n:00000001FF\n')
    expect(image).toHaveLength(32 * 1024)
    expect(image[0]).toBe(0x00)
    expect(image[1]).toBe(0xc0)
    expect(image[2]).toBe(0xff)
    expect(() => parseIntelHex(':0200000000C03F\n:00000001FF\n')).toThrow(/checksum/i)
  })

  it('places the Nano on two 15-pin breadboard rows', () => {
    const nano = getEntry('arduino_nano')!
    const holes = componentPinHoles({ id: 'U1', type: nano.type, at: 'b1' }, nano)
    expect(holes).not.toBeNull()
    expect(holes).toHaveLength(30)
    expect(holes?.[0]).toMatchObject({ kind: 'strip', col: 1, row: 'b' })
    expect(holes?.[14]).toMatchObject({ kind: 'strip', col: 15, row: 'b' })
    expect(holes?.[15]).toMatchObject({ kind: 'strip', col: 1, row: 'i' })
    expect(holes?.[29]).toMatchObject({ kind: 'strip', col: 15, row: 'i' })
    expect(placementValid({ version: 1, components: [], wires: [] }, nano.type, 'b1')).toBe(true)
  })

  it('builds dedicated Arduino board meshes', () => {
    const nano = getEntry('arduino_nano')!
    const nanoPins: THREE.Vector3[] = []
    for (let i = 0; i < 15; i++) nanoPins.push(new THREE.Vector3(i, 0, -3.5))
    for (let i = 0; i < 15; i++) nanoPins.push(new THREE.Vector3(i, 0, 3.5))
    const builtNano = buildComponentObject({ id: 'U1', type: nano.type, at: 'b1' }, nano, nanoPins)
    expect(builtNano.object.getObjectByName('arduino-nano-body')).toBeDefined()
    expect(builtNano.object.getObjectByName('arduino-nano-atmega328p')).toBeDefined()

    const uno = getEntry('arduino_uno_r3')!
    const unoPins = uno.pins.map((_, i) => new THREE.Vector3(i * 2.5, 0, 2))
    const builtUno = buildComponentObject({ id: 'U2', type: uno.type }, uno, unoPins)
    expect(builtUno.object.getObjectByName('arduino-uno-body')).toBeDefined()
    expect(builtUno.object.getObjectByName('arduino-uno-atmega328p')).toBeDefined()
    expect(builtUno.object.getObjectByName('arduino-uno-usb-b')).toBeDefined()
  })
})
