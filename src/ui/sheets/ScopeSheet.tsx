/**
 * ScopeSheet — the oscilloscope in a half-height bottom sheet (snap 0.4/0.8).
 *
 * Canvas-rendered (drawing code ported from the old ScopePanel): dark grid,
 * up to 4 autoscaled traces in classic scope channel colors, DPR-aware
 * (capped at 2 per the perf budget). The rAF loop runs ONLY while the sheet
 * is open, and skips the actual draw when nothing changed since the last
 * frame (paused sim → near-zero cost). Window picker is a kit Segmented;
 * channel legend chips light up per live probe presence.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeChannel, scopeCsv, traceEnvelope, triggerWindow } from '../../analysis/scope'
import './ScopeTools.css'
import { useStore } from '../../state/store'
import type { ScopeSample } from '../../model/types'
import { Segmented, Sheet, type SegmentedOption } from '../kit'
import './asm-sheets.css'

const SNAP_POINTS = [0.4, 0.8] as const

export const TRACE_COLORS = ['#ffd84a', '#43d9f6', '#ff5dd8', '#62e979'] // ch1..4

const WINDOW_OPTIONS: readonly SegmentedOption<string>[] = [
  { value: '0.01', label: '10 ms' },
  { value: '0.1', label: '0.1 s' },
  { value: '1', label: '1 s' },
  { value: '5', label: '5 s' },
  { value: '20', label: '20 s' },
]

const MONO_FONT = "10px 'SF Mono', 'Fira Code', monospace"

export interface ScopeSheetProps {
  open: boolean
  onDismiss: () => void
  desktop?: boolean
}

export function ScopeSheet({ open, onDismiss, desktop = false }: ScopeSheetProps) {
  const timeWindow = useStore((s) => s.scope.timeWindow)
  const setScopeWindow = useStore((s) => s.setScopeWindow)
  const components = useStore((s) => s.layout.components)
  const scope = useStore((s) => s.scope)
  const [frozen, setFrozen] = useState<{ samples: ScopeSample[]; window: number } | null>(null)
  const [enabled, setEnabled] = useState([true, true, true, true])
  const [edge, setEdge] = useState<'auto' | 'rising' | 'falling'>('auto')
  const [channel, setChannel] = useState(0)
  const [level, setLevel] = useState('2.5')
  const displayWindow = frozen?.window ?? timeWindow
  const triggered = useMemo(() => edge === 'auto' || !open ? null :
    triggerWindow(scope.samples, timeWindow, channel, Number(level), edge), [scope, timeWindow, channel, level, edge, open])
  const samples = frozen?.samples ?? triggered ?? scope.samples
  const visible = useMemo(() => {
    const end = (samples.length ? samples[samples.length - 1].t : undefined) ?? 0
    return samples.filter((s) => s.t >= end - displayWindow)
  }, [scope, samples, displayWindow])
  const measurements = useMemo(() => enabled.map((_, i) => analyzeChannel(visible, i)), [visible, enabled])
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([scopeCsv(visible)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'ohmlet-scope.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // present at the half (0.4) detent every time; user can drag to 0.8
  const [snap, setSnap] = useState(0)
  useEffect(() => {
    if (open) setSnap(0)
  }, [open])

  // which channels have a probe assigned (for the legend)
  const attached = [false, false, false, false]
  for (const c of components) {
    if (c.type === 'scope_probe') {
      const ch = Math.round(Number(c.params?.channel ?? 1))
      if (ch >= 1 && ch <= 4) attached[ch - 1] = true
    }
  }

  return (
    <Sheet
      open={open}
      onDismiss={onDismiss}
      snapPoints={SNAP_POINTS}
      activeSnap={snap}
      onSnapChange={setSnap}
      desktop={desktop}
      anchor="right"
      ariaLabel="Oscilloscope"
      className="asm-sheet"
    >
      <div className="asm-content">
        <div className="asm-sheet-head">
          <span className="lg-title">Oscilloscope</span>
        </div>

        <div className="asm-scope-legend">
          {TRACE_COLORS.map((color, i) => (
            <button
              type="button"
              aria-pressed={enabled[i]}
              onClick={() => setEnabled((old) => old.map((v, ch) => ch === i ? !v : v))}
              key={i}
              className={`asm-scope-chip ${attached[i] && enabled[i] ? '' : 'is-off'}`}
              title={attached[i] ? `Channel ${i + 1}` : `Channel ${i + 1} — no probe placed`}
            >
              <span className="asm-scope-chip-dot" style={{ background: color }} />
              CH{i + 1}
            </button>
          ))}
        </div>

        <div className="scope-tools">
          <button type="button" onClick={() => setFrozen(frozen ? null : { samples: visible.slice(), window: displayWindow })}>
            {frozen ? 'Resume capture' : 'Freeze capture'}
          </button>
          <button type="button" disabled={!visible.length} onClick={exportCsv}>Export CSV</button>
          <span>{frozen ? 'Frozen · circuit keeps running' : edge === 'auto' ? 'Live capture' : triggered ? 'Triggered' : 'Waiting for edge · live preview'}</span>
        </div>
        <div className="scope-trigger">
          <label>Trigger<select aria-label="Trigger edge" value={edge} onChange={(e) => setEdge(e.target.value as typeof edge)}>
            <option value="auto">Auto</option><option value="rising">Rising edge</option><option value="falling">Falling edge</option>
          </select></label>
          <label>Source<select aria-label="Trigger channel" value={channel} onChange={(e) => setChannel(Number(e.target.value))}>
            {[0, 1, 2, 3].map((ch) => <option key={ch} value={ch}>CH{ch + 1}</option>)}
          </select></label>
          <label>Level (V)<input aria-label="Trigger level" type="number" step="0.1" value={level} onChange={(e) => setLevel(e.target.value)} /></label>
        </div>
        <ScopeCanvas active={open} samples={visible} timeWindow={displayWindow} enabled={enabled} />
        <div className="scope-measurements">
          {measurements.map((m, i) => enabled[i] && attached[i] && m ? (
            <div key={i} className="scope-measure-card" style={{ borderColor: TRACE_COLORS[i] }}>
              <strong style={{ color: TRACE_COLORS[i] }}>CH{i + 1}</strong>
              <dl>
                <dt>Min / Max</dt><dd>{m.min.toFixed(3)} / {m.max.toFixed(3)} V</dd>
                <dt>Vpp</dt><dd>{m.peakToPeak.toFixed(3)} V</dd>
                <dt>Mean / RMS</dt><dd>{m.mean.toFixed(3)} / {m.rms.toFixed(3)} V</dd>
                <dt>Frequency</dt><dd>{m.frequency === null ? '—' : `${m.frequency.toFixed(2)} Hz`}</dd>
                <dt>Duty</dt><dd>{m.duty === null ? '—' : `${m.duty.toFixed(1)} %`}</dd>
                <dt>Sample rate</dt><dd>{m.sampleRate === null ? '—' : `${(m.sampleRate / 1000).toFixed(1)} kSa/s`}</dd>
              </dl>
            </div>
          ) : null)}
        </div>
        <p className="scope-note">Measurements use captured samples. Fast signals can alias; use 10 ms or 0.1 s for 20 kSa/s capture. Duty uses the midpoint voltage threshold.</p>

        <Segmented
          value={String(timeWindow)}
          onChange={(v) => setScopeWindow(Number(v))}
          options={WINDOW_OPTIONS}
          aria-label="Scope time window"
        />
      </div>
    </Sheet>
  )
}

/**
 * Inner canvas component — mounted only while the sheet's content exists, so
 * its refs are always live. `active=false` (sheet closing) cancels the loop
 * immediately: no rAF runs while the sheet is closed.
 */
function ScopeCanvas({ active, samples, timeWindow, enabled }: {
  active: boolean; samples: ScopeSample[]; timeWindow: number; enabled: boolean[]
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!active || !wrapRef.current || !canvasRef.current) return
    const wrap = wrapRef.current, canvas = canvasRef.current
    const draw = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      drawScope(canvas, samples, timeWindow, enabled)
    }
    const ro = new ResizeObserver(draw); ro.observe(wrap); draw()
    return () => ro.disconnect()
  }, [active, samples, timeWindow, enabled])
  return <div ref={wrapRef} className="asm-scope-body"><canvas ref={canvasRef} className="asm-scope-canvas" aria-label="Captured voltage waveforms" /></div>
}

// ---------------------------------------------------------------------------
// Canvas rendering (ported verbatim from the old ScopePanel, DPR capped at 2)
// ---------------------------------------------------------------------------

function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  const m = rough / pow
  if (m <= 1) return pow
  if (m <= 2) return 2 * pow
  if (m <= 5) return 5 * pow
  return 10 * pow
}

function fmtTick(v: number, step: number): string {
  const decimals = Math.max(0, Math.min(3, -Math.floor(Math.log10(step))))
  return `${v.toFixed(decimals)}V`
}

function fmtTimeOffset(dt: number, window: number): string {
  if (dt === 0) return '0'
  if (window < 1) return `${Math.round(dt * 1000)}ms`
  return `${dt.toFixed(1)}s`
}

function drawScope(canvas: HTMLCanvasElement, samples: ScopeSample[], timeWindow: number, enabled: boolean[]): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const W = canvas.width / dpr
  const H = canvas.height / dpr
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#0a0c10'
  ctx.fillRect(0, 0, W, H)

  const padL = 46
  const padR = 8
  const padT = 8
  const padB = 18
  const pw = W - padL - padR
  const ph = H - padT - padB
  if (pw < 20 || ph < 20) {
    ctx.restore()
    return
  }

  const tEnd = samples.length > 0 ? samples[samples.length - 1].t : timeWindow
  const tStart = tEnd - timeWindow

  // first sample index inside the window (samples are time-ordered)
  let i0 = samples.length
  while (i0 > 0 && samples[i0 - 1].t >= tStart) i0--

  // ---- autoscale voltage axis ----
  let vmin = Infinity
  let vmax = -Infinity
  for (let i = i0; i < samples.length; i++) {
    const v = samples[i].v
    for (let c = 0; c < 4; c++) {
      if (!enabled[c]) continue
      const x = v[c]
      if (Number.isFinite(x)) {
        if (x < vmin) vmin = x
        if (x > vmax) vmax = x
      }
    }
  }
  if (!Number.isFinite(vmin) || vmax - vmin < 1e-6) {
    if (Number.isFinite(vmin) && (vmin < -1 || vmax > 6)) {
      // flat trace outside the default range: center on it
      const mid = (vmin + vmax) / 2
      vmin = mid - 1
      vmax = mid + 1
    } else {
      vmin = -1
      vmax = 6
    }
  } else {
    const pad = (vmax - vmin) * 0.08
    vmin -= pad
    vmax += pad
  }

  const yOf = (v: number) => padT + (1 - (v - vmin) / (vmax - vmin)) * ph
  const xOf = (t: number) => padL + ((t - tStart) / timeWindow) * pw

  // ---- grid ----
  ctx.lineWidth = 1
  ctx.strokeStyle = '#1c212a'
  ctx.beginPath()
  for (let i = 0; i <= 10; i++) {
    const x = padL + (pw * i) / 10
    ctx.moveTo(x, padT)
    ctx.lineTo(x, padT + ph)
  }
  ctx.stroke()

  const step = niceStep((vmax - vmin) / 5)
  const firstTick = Math.ceil(vmin / step) * step
  const ticks: { y: number; v: number }[] = []
  ctx.beginPath()
  for (let v = firstTick; v <= vmax + step * 1e-6; v += step) {
    const y = yOf(v)
    ctx.moveTo(padL, y)
    ctx.lineTo(padL + pw, y)
    ticks.push({ y, v: Math.abs(v) < step * 1e-6 ? 0 : v })
  }
  ctx.stroke()

  // emphasized zero line
  if (vmin < 0 && vmax > 0) {
    ctx.strokeStyle = '#39414f'
    ctx.beginPath()
    const y0 = yOf(0)
    ctx.moveTo(padL, y0)
    ctx.lineTo(padL + pw, y0)
    ctx.stroke()
  }

  // frame
  ctx.strokeStyle = '#2a303b'
  ctx.strokeRect(padL + 0.5, padT + 0.5, pw - 1, ph - 1)

  // ---- axis labels ----
  ctx.fillStyle = '#7d8694'
  ctx.font = MONO_FONT
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const t of ticks) ctx.fillText(fmtTick(t.v, step), padL - 5, t.y)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let i = 0; i <= 10; i += 2) {
    const x = padL + (pw * i) / 10
    const dt = -timeWindow * (1 - i / 10)
    ctx.fillText(fmtTimeOffset(dt, timeWindow), x, padT + ph + 4)
  }

  // ---- traces ----
  if (samples.length === 0) {
    ctx.fillStyle = '#5b6471'
    ctx.font = MONO_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('no samples — place a scope probe and press Run', padL + pw / 2, padT + ph / 2)
    ctx.restore()
    return
  }

  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  for (let c = 0; c < 4; c++) {
    if (!enabled[c]) continue
    ctx.strokeStyle = TRACE_COLORS[c]
    ctx.beginPath()
    let pen = false
    let drew = false
    for (const point of traceEnvelope(samples, c, tStart, tEnd, Math.ceil(pw))) {
      const v = point.v
      if (!Number.isFinite(v)) {
        pen = false // NaN = channel unattached / gap → lift the pen
        continue
      }
      const x = xOf(point.t)
      const y = yOf(v)
      if (pen) {
        ctx.lineTo(x, y)
      } else {
        ctx.moveTo(x, y)
        pen = true
        drew = true
      }
    }
    if (drew) ctx.stroke()
  }
  ctx.restore()
}
