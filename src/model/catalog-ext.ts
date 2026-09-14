import { CATALOG, type CatalogEntry } from './catalog'

/**
 * Ohmlet-ext catalog additions.
 *
 * Kept separate from upstream's catalog so the fork can add parts without
 * making future upstream syncs unnecessarily noisy. Import once at app boot.
 */
const MULTIMETER: CatalogEntry = {
  type: 'multimeter',
  label: 'Digital multimeter',
  category: 'instrument',
  placement: 'offboard',
  pins: ['VΩ', 'COM'],
  params: [
    {
      key: 'resistance',
      label: 'Input impedance',
      kind: 'number',
      default: 10_000_000,
      min: 100_000,
      max: 1_000_000_000,
      step: 100_000,
      unit: 'Ω',
    },
  ],
  // A DC voltmeter is electrically a very large resistor. Reusing the
  // existing resistor model gives the meter a realistic 10 MΩ input load
  // while pin voltages remain available through normal telemetry.
  sim: { kind: 'device', model: 'resistor' },
  visual: { shape: 'multimeter' },
  doc: 'Digital multimeter in DC-voltage mode. Connect VΩ (red) to the point to measure and COM (black) to the reference point. The default 10 MΩ input impedance lightly loads the circuit like a real handheld DMM.',
}

if (!CATALOG.multimeter) CATALOG.multimeter = MULTIMETER
