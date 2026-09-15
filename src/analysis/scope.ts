import type { ScopeSample } from '../model/types'

/** Sample at the solver step for short windows, retain at most ~20k points. */
export function scopeSampleInterval(window: number): number {
  return window <= 0.1 ? 50e-6 : 1e-3
}

export interface ChannelMeasurements {
  min: number; max: number; peakToPeak: number; mean: number; rms: number
  frequency: number | null; duty: number | null; sampleRate: number | null
}

export function analyzeChannel(samples: readonly ScopeSample[], channel: number): ChannelMeasurements | null {
  let min = Infinity, max = -Infinity, area = 0, squareArea = 0, duration = 0, maxDt = 0
  let last: ScopeSample | null = null
  for (const sample of samples) {
    const v = sample.v[channel]
    if (!Number.isFinite(v)) { last = null; continue }
    min = Math.min(min, v); max = Math.max(max, v)
    if (last) {
      const dt = sample.t - last.t, a = last.v[channel]
      if (dt > 0) {
        area += (a + v) * dt / 2
        squareArea += (a * a + a * v + v * v) * dt / 3
        duration += dt; maxDt = Math.max(maxDt, dt)
      }
    }
    last = sample
  }
  if (!Number.isFinite(min)) return null
  const mid = (min + max) / 2, span = max - min
  const periods: number[] = []
  let armed = false, rising: number | null = null, previousRise: number | null = null
  let highDuration = 0, validDuration = 0
  last = null
  for (const sample of samples) {
    const v = sample.v[channel]
    if (!Number.isFinite(v)) { last = null; armed = false; previousRise = null; rising = null; continue }
    if (last) {
      const a = last.v[channel], dt = sample.t - last.t
      if (dt > 0) {
        validDuration += dt
        if (a >= mid && v >= mid) highDuration += dt
        else if ((a < mid) !== (v < mid)) {
          const fraction = (mid - a) / (v - a)
          highDuration += dt * (a >= mid ? fraction : 1 - fraction)
          if (v > a && armed) rising = last.t + dt * fraction
        }
      }
    }
    // Hysteresis rejects small ripples near the threshold.
    if (v <= min + span * 0.35) armed = true
    if (armed && rising !== null && v >= min + span * 0.65) {
      if (previousRise !== null) periods.push(rising - previousRise)
      previousRise = rising; rising = null; armed = false
    }
    last = sample
  }
  const period = periods.length ? periods.reduce((a, b) => a + b, 0) / periods.length : 0
  // Fewer than four samples per period is not a trustworthy measurement.
  const frequency = span > 1e-6 && period >= maxDt * 4 && period > 0 ? 1 / period : null
  return { min, max, peakToPeak: span, mean: duration ? area / duration : min,
    rms: duration ? Math.sqrt(Math.max(0, squareArea / duration)) : Math.abs(min),
    frequency, duty: span > 1e-6 && validDuration ? highDuration / validDuration * 100 : null,
    sampleRate: maxDt > 0 ? 1 / maxDt : null }
}

/** Latest edge with enough post-trigger samples for a full displayed window. */
export function triggerWindow(samples: readonly ScopeSample[], window: number, channel: number,
  level: number, edge: 'rising' | 'falling'): ScopeSample[] | null {
  if (samples.length < 2 || !Number.isFinite(level)) return null
  const lastT = samples[samples.length - 1].t
  for (let i = samples.length - 1; i > 0; i--) {
    const a = samples[i - 1], b = samples[i]
    const av = a.v[channel], bv = b.v[channel]
    if (!Number.isFinite(av) || !Number.isFinite(bv)) continue
    if (!(edge === 'rising' ? av < level && bv >= level : av > level && bv <= level)) continue
    const t = a.t + (b.t - a.t) * (level - av) / (bv - av)
    const start = t - window * 0.2, end = start + window
    if (start < samples[0].t || end > lastT) continue
    return samples.filter((s) => s.t >= start && s.t <= end)
  }
  return null
}

export interface TracePoint { t: number; v: number }
/** First/min/max/last per pixel bucket: narrow pulses survive decimation. */
export function traceEnvelope(samples: readonly ScopeSample[], channel: number, start: number,
  end: number, pixels: number): TracePoint[] {
  const result: TracePoint[] = []
  let bucket = -1, group: number[] = []
  const flush = () => {
    if (!group.length) return
    let lo = group[0], hi = lo
    for (const i of group) {
      if (samples[i].v[channel] < samples[lo].v[channel]) lo = i
      if (samples[i].v[channel] > samples[hi].v[channel]) hi = i
    }
    for (const i of [...new Set([group[0], lo, hi, group[group.length - 1]])].sort((a, b) => a - b)) {
      result.push({ t: samples[i].t, v: samples[i].v[channel] })
    }
    group = []
  }
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    if (s.t < start || s.t > end) continue
    if (!Number.isFinite(s.v[channel])) { flush(); result.push({ t: s.t, v: NaN }); continue }
    const next = Math.floor((s.t - start) / Math.max(end - start, 1e-12) * Math.max(1, pixels))
    if (next !== bucket) { flush(); bucket = next }
    group.push(i)
  }
  flush()
  return result
}

export function scopeCsv(samples: readonly ScopeSample[]): string {
  return 'time_s,CH1_V,CH2_V,CH3_V,CH4_V\r\n' + samples.map((s) =>
    [s.t, ...s.v.map((v) => Number.isFinite(v) ? v : '')].join(',')).join('\r\n') + '\r\n'
}
