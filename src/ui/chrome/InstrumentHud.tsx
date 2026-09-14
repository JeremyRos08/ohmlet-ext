import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ComponentInstance, ComponentTelemetry, ScopeSample } from '../../model/types'
import { getEntry, paramOf } from '../../model/catalog'
import { getMultimeterReading, multimeterModeOf } from '../../sim/multimeter-chip'
import { useStore } from '../../state/store'
import './InstrumentHud.css'

const SCOPE_W = 244
const SCOPE_H = 104
const SCOPE_COLORS = ['#ffd60a', '#64d2ff', '#ff375f', '#30d158'] as const

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function trimFixed(v: number, digits: number): string {
  return v.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function formatVoltage(v: number): string {
  if (!finite(v)) return '----'
  const a = Math.abs(v)
  if (a < 1) return `${trimFixed(v * 1000, a < 0.01 ? 2 : 1)} mV`
  return `${trimFixed(v, a >= 100 ? 1 : a >= 10 ? 2 : 3)} V`
}

function formatCurrent(a: number): string {
  if (!finite(a)) return '----'
  const av = Math.abs(a)
  if (av < 1e-3) return `${trimFixed(a * 1e6, 2)} µA`
  if (av < 1) return `${trimFixed(a * 1000, av >= 0.1 ? 1 : 2)} mA`
  return `${trimFixed(a, av >= 10 ? 2 : 3)} A`
}

function formatResistance(r: number): string {
  if (!finite(r) || r > 99_000_000) return 'OL'
  const a = Math.abs(r)
  if (a >= 1_000_000) return `${trimFixed(r / 1_000_000, 3)} MΩ`
  if (a >= 1000) return `${trimFixed(r / 1000, 3)} kΩ`
  return `${trimFixed(r, a >= 100 ? 1 : 2)} Ω`
}

export function formatMultimeterHud(comp: ComponentInstance): { value: string; sub: string } {
  const reading = getMultimeterReading(comp.id)
  const mode = reading?.mode ?? multimeterModeOf(comp)
  if (!reading) return { value: '----', sub: mode.toUpperCase() }
  switch (mode) {
    case 'dcv':
      return { value: formatVoltage(reading.value), sub: 'DC voltage' }
    case 'acv':
      return { value: formatVoltage(reading.value), sub: 'AC RMS' }
    case 'ohm':
      return { value: formatResistance(reading.resistance), sub: 'Resistance' }
    case 'continuity':
      return {
        value: reading.continuity ? 'BEEP' : formatResistance(reading.resistance),
        sub: reading.continuity ? 'Continuity · closed' : 'Continuity',
      }
    case 'ma':
      return { value: formatCurrent(reading.current), sub: 'Current · mA jack' }
    case 'a':
      return { value: formatCurrent(reading.current), sub: 'Current · A jack' }
  }
}

function pinDiff(tele: ComponentTelemetry | undefined, a: string, b: string): number {
  const va = tele?.pinVoltages?.[a]
  const vb = tele?.pinVoltages?.[b]
  return finite(va) && finite(vb) ? va - vb : Number.NaN
}

function ScreenHeader({
  id,
  label,
  onClose,
}: {
  id: string
  label: string
  onClose: () => void
}) {
  return (
    <div className="insthud-card-head">
      <span className="insthud-card-id">{id}</span>
      <span className="insthud-card-label">{label}</span>
      <button
        type="button"
        className="insthud-close"
        aria-label={`Close ${id} screen`}
        title="Close screen"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  )
}

function MultimeterScreen({ comp, onClose }: { comp: ComponentInstance; onClose: () => void }) {
  const shown = formatMultimeterHud(comp)
  return (
    <article className="insthud-card insthud-dmm">
      <ScreenHeader id={comp.id} label="Multimeter" onClose={onClose} />
      <div className="insthud-lcd">
        <span className="insthud-lcd-sub">{shown.sub}</span>
        <strong className="insthud-lcd-value">{shown.value}</strong>
      </div>
    </article>
  )
}

function PowerSupplyScreen({
  comp,
  tele,
  onClose,
}: {
  comp: ComponentInstance
  tele?: ComponentTelemetry
  onClose: () => void
}) {
  const entry = getEntry(comp.type)
  const setV = entry ? Number(paramOf(comp.params, entry, 'voltage') ?? 0) : 0
  const actual = pinDiff(tele, '+', '-')
  return (
    <article className="insthud-card insthud-psu">
      <ScreenHeader id={comp.id} label="DC supply" onClose={onClose} />
      <div className="insthud-bench-screen">
        <div>
          <span>VOLTAGE</span>
          <strong>{formatVoltage(finite(actual) ? actual : setV)}</strong>
        </div>
        <div>
          <span>CURRENT</span>
          <strong>{formatCurrent(tele?.current ?? Number.NaN)}</strong>
        </div>
      </div>
    </article>
  )
}

function FunctionGeneratorScreen({
  comp,
  tele,
  onClose,
}: {
  comp: ComponentInstance
  tele?: ComponentTelemetry
  onClose: () => void
}) {
  const entry = getEntry(comp.type)
  const frequency = entry ? Number(paramOf(comp.params, entry, 'frequency') ?? 0) : 0
  const waveform = entry ? String(paramOf(comp.params, entry, 'waveform') ?? 'square') : 'square'
  const out = pinDiff(tele, 'out', 'gnd')
  return (
    <article className="insthud-card insthud-fg">
      <ScreenHeader id={comp.id} label="Function generator" onClose={onClose} />
      <div className="insthud-bench-screen">
        <div>
          <span>OUTPUT</span>
          <strong>{formatVoltage(out)}</strong>
        </div>
        <div>
          <span>{waveform.toUpperCase()}</span>
          <strong>{frequency >= 1000 ? `${trimFixed(frequency / 1000, 3)} kHz` : `${trimFixed(frequency, 3)} Hz`}</strong>
        </div>
      </div>
    </article>
  )
}

function GenericInstrumentScreen({
  comp,
  tele,
  onClose,
}: {
  comp: ComponentInstance
  tele?: ComponentTelemetry
  onClose: () => void
}) {
  const entry = getEntry(comp.type)
  const pins = entry?.pins ?? []
  return (
    <article className="insthud-card">
      <ScreenHeader id={comp.id} label={entry?.label ?? comp.type} onClose={onClose} />
      <div className="insthud-generic-screen">
        {pins.slice(0, 4).map((pin) => (
          <div key={pin}>
            <span>{pin}</span>
            <strong>{formatVoltage(tele?.pinVoltages?.[pin] ?? Number.NaN)}</strong>
          </div>
        ))}
      </div>
    </article>
  )
}

function scopeChannels(probes: readonly ComponentInstance[]): number[] {
  const seen = new Set<number>()
  for (const comp of probes) {
    const entry = getEntry(comp.type)
    const raw = entry ? Number(paramOf(comp.params, entry, 'channel') ?? 1) : 1
    const ch = Math.max(1, Math.min(4, Math.round(raw)))
    seen.add(ch)
  }
  return [...seen].sort((a, b) => a - b)
}

export function scopePath(
  samples: readonly ScopeSample[],
  channel: number,
  timeWindow: number,
  sharedScale: number,
): string {
  if (samples.length < 2 || channel < 1 || channel > 4) return ''
  const newest = samples[samples.length - 1]?.t ?? 0
  const start = newest - Math.max(timeWindow, 1e-6)
  const scale = Math.max(sharedScale, 1e-6)
  let path = ''
  let started = false
  for (const sample of samples) {
    if (sample.t < start) continue
    const v = sample.v[channel - 1]
    if (!finite(v)) {
      started = false
      continue
    }
    const x = ((sample.t - start) / Math.max(timeWindow, 1e-6)) * SCOPE_W
    const y = SCOPE_H * 0.5 - (v / scale) * (SCOPE_H * 0.42)
    path += `${started ? ' L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    started = true
  }
  return path
}

function scopeScale(samples: readonly ScopeSample[], channels: readonly number[], timeWindow: number): number {
  if (samples.length === 0) return 1
  const newest = samples[samples.length - 1]?.t ?? 0
  const start = newest - Math.max(timeWindow, 1e-6)
  let peak = 0
  for (const sample of samples) {
    if (sample.t < start) continue
    for (const ch of channels) {
      const v = sample.v[ch - 1]
      if (finite(v)) peak = Math.max(peak, Math.abs(v))
    }
  }
  return Math.max(1, peak * 1.12)
}

function ScopeScreen({
  probes,
  samples,
  timeWindow,
  onClose,
}: {
  probes: readonly ComponentInstance[]
  samples: readonly ScopeSample[]
  timeWindow: number
  onClose: () => void
}) {
  const channels = scopeChannels(probes)
  const scale = scopeScale(samples, channels, timeWindow)
  return (
    <article className="insthud-card insthud-scope-card">
      <ScreenHeader id="SCOPE" label="Oscilloscope" onClose={onClose} />
      <div className="insthud-scope-screen">
        <svg viewBox={`0 0 ${SCOPE_W} ${SCOPE_H}`} role="img" aria-label="Selected oscilloscope channels">
          {[1, 2, 3].map((n) => (
            <line key={`h${n}`} x1="0" x2={SCOPE_W} y1={(SCOPE_H * n) / 4} y2={(SCOPE_H * n) / 4} className="insthud-gridline" />
          ))}
          {[1, 2, 3, 4, 5].map((n) => (
            <line key={`v${n}`} y1="0" y2={SCOPE_H} x1={(SCOPE_W * n) / 6} x2={(SCOPE_W * n) / 6} className="insthud-gridline" />
          ))}
          {channels.map((ch) => (
            <path
              key={ch}
              d={scopePath(samples, ch, timeWindow, scale)}
              fill="none"
              stroke={SCOPE_COLORS[ch - 1]}
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div className="insthud-scope-footer">
          <span>±{trimFixed(scale, scale >= 10 ? 1 : 2)} V</span>
          <span>{trimFixed(timeWindow * 1000, 2)} ms</span>
          <span className="insthud-chips">
            {channels.map((ch) => (
              <i key={ch} style={{ color: SCOPE_COLORS[ch - 1] }}>CH{ch}</i>
            ))}
          </span>
        </div>
      </div>
    </article>
  )
}

function isHudComponent(comp: ComponentInstance): boolean {
  if (comp.type === 'scope_probe') return true
  const entry = getEntry(comp.type)
  return entry?.placement === 'offboard'
}

export function InstrumentHud() {
  const selection = useStore((s) => s.selection)
  const components = useStore((s) => s.layout.components)
  const telemetry = useStore((s) => s.telemetry)
  const scope = useStore((s) => s.scope)
  const toggleSelect = useStore((s) => s.toggleSelect)
  const [openIds, setOpenIds] = useState<string[]>([])

  // Selection OPENS instrument windows, but losing selection no longer closes
  // them. This makes the screen windows independent from the inspector/scene
  // selection: click MM1, then PS1, and both remain visible until their own ×.
  useEffect(() => {
    const newlySelected = selection.filter((id) => {
      const comp = components.find((c) => c.id === id)
      return !!comp && isHudComponent(comp)
    })
    if (newlySelected.length === 0) return
    setOpenIds((prev) => {
      const next = [...prev]
      let changed = false
      for (const id of newlySelected) {
        if (!next.includes(id)) {
          next.push(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selection, components])

  // Components can be deleted while their window is open. Drop stale ids so
  // they cannot reappear if another layout later reuses the same component id.
  useEffect(() => {
    setOpenIds((prev) => {
      const next = prev.filter((id) => components.some((c) => c.id === id && isHudComponent(c)))
      return next.length === prev.length ? prev : next
    })
  }, [components])

  if (typeof document === 'undefined') return null

  const openComponents = openIds
    .map((id) => components.find((c) => c.id === id))
    .filter((c): c is ComponentInstance => !!c && isHudComponent(c))
  if (openComponents.length === 0) return null

  const probes = openComponents.filter((c) => c.type === 'scope_probe')
  const instruments = openComponents.filter((c) => c.type !== 'scope_probe')
  const screenCount = instruments.length + (probes.length > 0 ? 1 : 0)

  const closeOne = (id: string) => {
    setOpenIds((prev) => prev.filter((openId) => openId !== id))
    if (selection.includes(id)) toggleSelect(id)
  }

  const closeScope = () => {
    const probeIds = new Set(probes.map((probe) => probe.id))
    setOpenIds((prev) => prev.filter((id) => !probeIds.has(id)))
    for (const id of selection) {
      if (probeIds.has(id)) toggleSelect(id)
    }
  }

  return createPortal(
    <aside className="insthud" aria-label="Open instrument screens">
      <div className="insthud-head">
        <strong>Instrument screens</strong>
        <span>{screenCount}</span>
      </div>
      <div className="insthud-grid">
        {instruments.map((comp) => {
          const tele = telemetry?.components?.[comp.id]
          const close = () => closeOne(comp.id)
          switch (comp.type) {
            case 'multimeter':
              return <MultimeterScreen key={comp.id} comp={comp} onClose={close} />
            case 'power_supply':
              return <PowerSupplyScreen key={comp.id} comp={comp} tele={tele} onClose={close} />
            case 'function_generator':
              return <FunctionGeneratorScreen key={comp.id} comp={comp} tele={tele} onClose={close} />
            default:
              return <GenericInstrumentScreen key={comp.id} comp={comp} tele={tele} onClose={close} />
          }
        })}
        {probes.length > 0 && (
          <ScopeScreen
            key="scope"
            probes={probes}
            samples={scope.samples}
            timeWindow={scope.timeWindow}
            onClose={closeScope}
          />
        )}
      </div>
    </aside>,
    document.body,
  )
}
