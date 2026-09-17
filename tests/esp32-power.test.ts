import { expect, it } from 'vitest'
import '../src/sim/esp32-chip'
import { createChip } from '../src/sim/chip-api'
import { bootEsp32Firmware, getEsp32RuntimeSnapshot } from '../src/firmware/esp32-runtime'

it('blocks firmware without a solved supply and clears state after power loss', async () => {
  const id = 'power-test'
  const chip = createChip('esp32_s3', { id, type: 'esp32_s3_devkit', at: 'b10' })!
  const step = (supply: number, ground: number) => chip.step({
    time: 0, dt: 0.001,
    readPin: (pin) => pin === '5V' ? supply : pin === 'GND_J1' ? ground : NaN,
    drivePin: () => {},
  })
  step(NaN, NaN)
  await expect(bootEsp32Firmware(id)).rejects.toThrow('unpowered')
  step(5, 0)
  step(0, 0)
  expect(getEsp32RuntimeSnapshot(id).message).toContain('unpowered')
  expect(getEsp32RuntimeSnapshot(id).display).toBeUndefined()
  await expect(bootEsp32Firmware(id)).rejects.toThrow('unpowered')
  // Absolute 5 V is not a supply if GND is also at 5 V.
  step(5, 5)
  await expect(bootEsp32Firmware(id)).rejects.toThrow('unpowered')
})
