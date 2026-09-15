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
  name: 'Ohmlet starter bench',
  description: '5 V supply driving an LED through a 1 kΩ resistor.',
  components: [
    { id: 'PS1', type: 'power_supply', pos: { x: -7, z: 8 } },
    { id: 'R1', type: 'resistor', holes: ['e10', 'f10'] },
    { id: 'LED1', type: 'led', holes: ['e15', 'f15'], params: { color: 'red' } },
  ],
  wires: [
    { id: 'W1', from: 'PS1:+', to: 'top+0', color: '#ef4444' },
    { id: 'W2', from: 'top+0', to: 'e10', color: '#ef4444' },
    { id: 'W3', from: 'f10', to: 'e15', color: '#f59e0b' },
    { id: 'W4', from: 'f15', to: 'top-0', color: '#3b82f6' },
    { id: 'W5', from: 'PS1:-', to: 'top-0', color: '#3b82f6' },
  ],
}
