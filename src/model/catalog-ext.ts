import { CATALOG, type CatalogEntry } from './catalog'
import '../sim/multimeter-chip'

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
      key: 'mode',
      label: 'Mode',
      kind: 'select',
      default: 'DC V',
      options: ['DC V', 'AC V', 'Ω', 'Continuity', 'mA', 'A'],
      // Structural on purpose: changing range rebuilds the engine so the
      // behavioral meter model starts cleanly in its new electrical mode.
    },
    {
      key: 'resistance',
      label: 'Voltage input impedance',
      kind: 'number',
      default: 10_000_000,
      min: 100_000,
      max: 1_000_000_000,
      step: 100_000,
      unit: 'Ω',
    },
  ],
  sim: { kind: 'chip', model: 'multimeter' },
  visual: { shape: 'multimeter' },
  doc: 'Digital multimeter with selectable DC volts, AC true-RMS estimate, resistance, continuity, mA and A modes. Connect VΩ (red) and COM (black) across a voltage/resistance measurement; for current modes insert the meter in series. Voltage mode is approximately 10 MΩ input impedance; mA/A modes use low-value simulated shunts.',
}

if (!CATALOG.multimeter) CATALOG.multimeter = MULTIMETER
