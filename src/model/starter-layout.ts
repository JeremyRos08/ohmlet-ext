import type { CircuitLayout } from './types'

/**
 * A small, deterministic bench circuit shown on a first launch. It gives the
 * 3D viewport something useful to inspect immediately: a real supply, a
 * current-limited LED and jumpers crossing the board channel. It is only used
 * when there is no saved document; the user can clear it with the normal reset
 * action and every subsequent launch restores their own work.
 */
export const STARTER_LAYOUT: CircuitLayout = {
  version: 1,
  name: 'Atelier LED · 5 V',
  board: 'half',
  description: '5 V supply driving an LED through a 1 kΩ resistor.',
  components: [
    { id: 'PS1', type: 'power_supply', params: { voltage: 5 } },
    { id: 'R1', type: 'resistor', holes: ['e10', 'f10'], params: { resistance: 1000 } },
    { id: 'LED1', type: 'led', holes: ['e15', 'f15'], params: { color: 'red' } },
    { id: 'PR1', type: 'scope_probe', holes: ['b15'], params: { channel: 1 } },
  ],
  wires: [
    { id: 'W1', from: 'PS1:+', to: 'top+0', color: '#ef4444' },
    { id: 'W2', from: 'top+1', to: 'd10', color: '#ef4444' },
    { id: 'W3', from: 'g10', to: 'd15', color: '#f59e0b' },
    { id: 'W4', from: 'g15', to: 'top-1', color: '#3b82f6' },
    { id: 'W5', from: 'PS1:-', to: 'top-0', color: '#3b82f6' },
  ],
}
