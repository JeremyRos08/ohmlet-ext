import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import '../src/model/catalog-ext'
import { analyzeChannel, scopeCsv, scopeSampleInterval, traceEnvelope, triggerWindow } from '../src/analysis/scope'
import { createNetInspector } from '../src/analysis/net-inspector'
import { fitCameraView } from '../src/three/internal/camera-views'
import type { ScopeSample } from '../src/model/types'
import { SimEngine } from '../src/sim/engine'
import { buildNetlist } from '../src/sim/netlist'

const samples = (n: number, dt: number, fn: (t: number, i: number) => number): ScopeSample[] =>
  Array.from({ length: n }, (_, i) => ({ t: i * dt, v: [fn(i * dt, i), NaN, NaN, NaN] }))

describe('scope measurements', () => {
  it('measures a DC voltage and does not invent a frequency', () => {
    const m = analyzeChannel(samples(100, .001, () => -3), 0)!
    expect(m.mean).toBeCloseTo(-3); expect(m.rms).toBeCloseTo(3)
    expect(m.peakToPeak).toBe(0); expect(m.frequency).toBeNull(); expect(m.duty).toBeNull()
  })
  it('measures sine amplitude, RMS and frequency', () => {
    const m = analyzeChannel(samples(4001, .00005, (t) => 2 * Math.sin(2 * Math.PI * 100 * t)), 0)!
    expect(m.rms).toBeCloseTo(Math.SQRT2, 2); expect(m.mean).toBeCloseTo(0, 3)
    expect(m.frequency).toBeCloseTo(100, 2); expect(m.peakToPeak).toBeCloseTo(4, 2)
    expect(m.duty).toBeCloseTo(50, 1)
  })
  it('measures a 25 percent pulse train and preserves gaps', () => {
    const data = samples(4001, .00005, (_, i) => i % 200 < 50 ? 5 : 0)
    const m = analyzeChannel(data, 0)!
    expect(m.frequency).toBeCloseTo(100, 2); expect(m.duty).toBeCloseTo(25, 1)
    expect(analyzeChannel(data, 1)).toBeNull()
  })
  it('weights irregularly spaced samples by time', () => {
    const data: ScopeSample[] = [{t:0,v:[0,NaN,NaN,NaN]}, {t:1,v:[2,NaN,NaN,NaN]}, {t:4,v:[2,NaN,NaN,NaN]}]
    expect(analyzeChannel(data,0)?.mean).toBeCloseTo(1.75)
  })
  it('does not bridge missing data to measure a period', () => {
    const data = samples(301, .001, (t) => t > .1 && t < .2 ? NaN : Math.sin(2 * Math.PI * 5 * t))
    expect(analyzeChannel(data,0)?.frequency).toBeNull()
  })
  it('finds a complete rising-trigger window and rejects missing edges', () => {
    const data = samples(4001, .00005, (t) => Math.sin(2 * Math.PI * 100 * t))
    const captured = triggerWindow(data, .01, 0, 0, 'rising')!
    expect(captured.length).toBeGreaterThan(195)
    expect(captured[captured.length - 1].t - captured[0].t).toBeCloseTo(.01, 3)
    expect(triggerWindow(data,.01,0,10,'rising')).toBeNull()
  })
  it('keeps a one-sample spike that stride decimation would miss', () => {
    const data = samples(20000, .001, (_, i) => i === 10001 ? 9 : 0)
    const trace = traceEnvelope(data,0,0,20,400)
    expect(Math.max(...trace.map((p) => p.v))).toBe(9)
    expect(trace.length).toBeLessThanOrEqual(1604)
  })
  it('exports all channels without serializing missing data as NaN', () => {
    expect(scopeCsv(samples(2,.001, () => 2))).toBe('time_s,CH1_V,CH2_V,CH3_V,CH4_V\r\n0,2,,,\r\n0.001,2,,,\r\n')
    expect(scopeSampleInterval(.01)).toBe(.00005)
    expect(scopeSampleInterval(20)).toBe(.001)
  })
})

describe('net inspection and USB power', () => {
  const layout = { version: 1 as const, components: [
    { id:'U1',type:'arduino_uno_r3' },
    { id:'R1',type:'resistor',holes:['a1','a2'],params:{resistance:1000} },
    { id:'R2',type:'resistor',holes:['b2','a3'],params:{resistance:1000} },
  ], wires:[{id:'W1',from:'U1:5V',to:'b1'}, {id:'W2',from:'U1:GND1',to:'b3'}] }
  it('traces breadboard strips and wires, but not through a resistor', () => {
    const inspect = createNetInspector(layout)
    const net = inspect('c1')!
    expect(net.wires).toEqual(['W1']); expect(net.pins).toContain('U1:5V')
    expect(net.endpoints).toContain('e1'); expect(net.endpoints).not.toContain('a2')
    expect(inspect('a2')?.id).not.toBe(net.id)
    expect(inspect('invalid')).toBeNull()
  })
  it('uses Arduino ground and powers a resistor divider without a PSU', () => {
    const net = buildNetlist(layout)
    expect(net.ground).toBe(net.netOf('U1:GND1'))
    const engine = new SimEngine(layout); engine.advance(.005)
    expect(engine.netVoltage('a2')).toBeCloseTo(2.5, 2)
    expect(engine.netVoltage('U1:GND1')).toBe(0)
    expect(engine.issues.some((i) => i.message === 'no power supply' || i.message === 'no ground')).toBe(false)
    engine.setRuntimeParam('U1','usbPower',false); engine.advance(.005)
    expect(engine.netVoltage('a2')).toBeCloseTo(0,3)
    expect(layout.components[0].params).toBeUndefined()
  })
  it('cached endpoint readings still follow live voltage changes', () => {
    const engine = new SimEngine({version:1,components:[{id:'PS1',type:'power_supply',params:{voltage:5}}],wires:[]})
    engine.step(); expect(engine.netVoltage('PS1:+')).toBeCloseTo(5)
    engine.setRuntimeParam('PS1','voltage',9); engine.step()
    expect(engine.netVoltage('PS1:+')).toBeCloseTo(9)
    expect(Number.isNaN(engine.netVoltage('bad'))).toBe(true)
  })
})

describe('3D camera fitting', () => {
  for (const view of ['iso','top','front','side'] as const) {
    it(`fits a large circuit in a portrait ${view} view`, () => {
      const box = new THREE.Box3(new THREE.Vector3(-40,0,-20),new THREE.Vector3(40,10,20))
      const fit = fitCameraView(box,view,45,.5)
      const camera = new THREE.PerspectiveCamera(45,.5,.1,10000)
      camera.position.copy(fit.position); camera.lookAt(fit.target); camera.updateMatrixWorld()
      for (const x of [-40,40]) for (const y of [0,10]) for (const z of [-20,20]) {
        const p = new THREE.Vector3(x,y,z).project(camera)
        expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1)
      }
    })
  }
})
