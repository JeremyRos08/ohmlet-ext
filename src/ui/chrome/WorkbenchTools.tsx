import { useEffect, useMemo, useState } from 'react'
import { createNetInspector } from '../../analysis/net-inspector'
import type { CameraView } from '../../three/internal/camera-views'
import { useStore } from '../../state/store'
import './WorkbenchTools.css'

export function WorkbenchTools({ onLab, onView, inspecting, onInspect, endpoint, onEndpoint, onHighlight }: {
  onLab: () => void
  onView: (view: CameraView, selected?: boolean) => void
  inspecting: boolean; onInspect: () => void; endpoint: string; onEndpoint: (ref: string) => void
  onHighlight: (endpoints: string[], wires: string[]) => void
}) {
  const layout = useStore((s) => s.layout)
  const telemetry = useStore((s) => s.telemetry)
  const selection = useStore((s) => s.selection)
  const [input, setInput] = useState('')
  const inspect = useMemo(() => inspecting ? createNetInspector(layout) : null, [layout, inspecting])
  const net = inspect?.(endpoint) ?? null
  const voltage = net ? telemetry?.netVoltages[net.id] : undefined
  useEffect(() => { onHighlight(net?.endpoints ?? [], net?.wires ?? []) }, [net, onHighlight])
  useEffect(() => { setInput(endpoint) }, [endpoint])
  return <>
    <nav className="workbench-tools" aria-label="3D workbench tools">
      <button type="button" onClick={onLab}>Labo</button>
      <details>
        <summary>Views</summary>
        <div className="workbench-view-menu">
          {(['iso', 'top', 'front', 'side'] as const).map((view, i) =>
            <button key={view} type="button" onClick={() => onView(view)}>{['Isometric', 'Top', 'Front', 'Side'][i]}</button>)}
          <button type="button" disabled={!selection.length} onClick={() => onView('iso', true)}>Focus selection</button>
        </div>
      </details>
      <button type="button" aria-pressed={inspecting} onClick={onInspect}>Inspect net</button>
    </nav>
    {inspecting && <section className="net-inspector" aria-label="Electrical net inspector">
      <header><strong>Electrical net</strong><button type="button" onClick={onInspect} aria-label="Close net inspector">×</button></header>
      <p>Click a hole, terminal or wire to trace its connections.</p>
      <form onSubmit={(e) => { e.preventDefault(); onEndpoint(input.trim()) }}>
        <input aria-label="Endpoint to inspect" placeholder="a12 or U1:5V" value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit">Trace</button>
      </form>
      {net ? <>
        <div className="net-reading"><span>{endpoint}</span><strong>{voltage !== undefined && Number.isFinite(voltage) ? `${voltage.toFixed(3)} V` : 'Run to measure'}</strong></div>
        <p>{net.endpoints.length} connection points · {net.wires.length} wires · {net.pins.length} pins</p>
        <div className="net-pins">{net.pins.map((pin) => <button type="button" key={pin} onClick={() => useStore.getState().select(pin.split(':')[0])}>{pin}</button>)}</div>
        <small>Green rings show electrically connected points, including holes beneath components. Components between two nets are not treated as wires.</small>
      </> : <p>{endpoint ? 'No connected net found at this endpoint.' : 'Choose an endpoint to begin.'}</p>}
    </section>}
  </>
}
