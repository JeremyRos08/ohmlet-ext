import { beforeEach, describe, expect, it } from 'vitest'
import { buildBom, bomCsv } from '../src/analysis/bom'
import { STARTER_LAYOUT } from '../src/model/starter-layout'
import { useStore } from '../src/state/store'

beforeEach(() => { useStore.getState().resetSim(); useStore.getState().loadLayout(structuredClone(STARTER_LAYOUT)) })
describe('manual circuit steps', () => {
  it('advances exact bounded intervals, stays paused, updates measurements and scope', () => {
    const st = useStore.getState()
    st.stepSim(20)
    expect(useStore.getState().simTime).toBeCloseTo(.001, 8)
    expect(useStore.getState().running).toBe(false)
    expect(useStore.getState().telemetry?.components.LED1.current).toBeGreaterThan(.001)
    st.stepSim(200)
    expect(useStore.getState().simTime).toBeCloseTo(.011, 8)
    const times = useStore.getState().scope.samples.map(s => s.t)
    expect(times.length).toBeGreaterThan(5)
    expect(times.every((t, i) => i === 0 || t > times[i - 1])).toBe(true)
  })
  it('rejects invalid requests and does not advance a running simulation', () => {
    const st = useStore.getState()
    for (const invalid of [0, -1, NaN, Infinity, .5, 201]) st.stepSim(invalid)
    expect(useStore.getState().simTime).toBe(0)
    st.startSim(); st.stepSim(200)
    expect(useStore.getState().simTime).toBe(0)
    st.stopSim(); st.stepSim(20)
    expect(useStore.getState().simTime).toBeCloseTo(.001, 8)
  })
  it('reset clears captures and subsequent steps start again from zero', () => {
    const st = useStore.getState(); st.stepSim(200); st.resetSim()
    expect(useStore.getState().scope.samples).toEqual([])
    st.stepSim(20)
    expect(useStore.getState().simTime).toBeCloseTo(.001, 8)
  })
})
describe('bill of materials', () => {
  it('groups omitted and explicit defaults but splits different values', () => {
    const bom = buildBom({ version: 1, wires: [], components: [
      { id: 'R1', type: 'resistor' },
      { id: 'R2', type: 'resistor', params: { resistance: 1000 } },
      { id: 'R3', type: 'resistor', params: { resistance: 470 } },
    ] })
    expect(bom).toHaveLength(2)
    expect(bom[0].refs).toEqual(['R1', 'R2'])
    expect(bom[1].values).toContain('470')
  })
  it('escapes quoted fields and neutralizes spreadsheet formulas in imported references', () => {
    const csv = bomCsv({ version: 1, wires: [], components: [{ id: '=HYPERLINK("url")', type: 'resistor' }] })
    expect(csv).toContain('"\'=HYPERLINK(""url"")"')
    expect(csv).toContain('"1"')
  })
})
