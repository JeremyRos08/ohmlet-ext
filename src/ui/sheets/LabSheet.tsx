import { useMemo, useState } from 'react'
import { buildBom, bomCsv } from '../../analysis/bom'
import { getEntry } from '../../model/catalog'
import { useStore } from '../../state/store'
import { Sheet, showToast } from '../kit'
import { fmtEng, fmtVolts } from '../format'
import './LabSheet.css'

export function LabSheet({ open, onDismiss, desktop }: { open: boolean; onDismiss: () => void; desktop: boolean }) {
  const layout = useStore(s => s.layout)
  const running = useStore(s => s.running)
  const time = useStore(s => open ? s.simTime : 0)
  const telemetry = useStore(s => open ? s.telemetry : null)
  const issues = useStore(s => s.issues)
  const [tab, setTab] = useState<'measure' | 'bom' | 'issues'>('measure')
  const [query, setQuery] = useState('')
  const bom = useMemo(() => buildBom(layout), [layout])
  const parts = layout.components.filter(c => `${c.id} ${getEntry(c.type)?.label}`.toLowerCase().includes(query.toLowerCase()))
  const instrument = (type: string) => {
    const st = useStore.getState()
    st.setMode({ kind: 'place', type, pickedHoles: [] })
    onDismiss()
    if (type === 'scope_probe') showToast('Cliquez un trou libre sur le réseau à mesurer.')
  }
  const exportBom = () => {
    const url = URL.createObjectURL(new Blob([bomCsv(layout)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'ohmlet-nomenclature.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <Sheet open={open} onDismiss={onDismiss} desktop={desktop} ariaLabel="Laboratoire" snapPoints={[0.55, 0.92]}>
    <div className="lab-panel">
      <header><span>OHMLET / INSTRUMENTATION</span><h2>Laboratoire</h2><p>{layout.name ?? 'Montage'} · {layout.components.length} composants · {layout.wires.length} fils</p></header>
      <section className="lab-controls" aria-label="Commandes de simulation">
        <output>{(time * 1000).toFixed(2)} ms · {running ? 'En cours' : 'En pause'}</output>
        <div className="lab-buttons">
          <button type="button" onClick={() => running ? useStore.getState().stopSim() : useStore.getState().startSim()}>{running ? 'Pause' : 'Exécuter'}</button>
          <button type="button" disabled={running} onClick={() => useStore.getState().stepSim(20)}>Pas de 1 ms</button>
          <button type="button" disabled={running} onClick={() => useStore.getState().stepSim(200)}>Pas de 10 ms</button>
          <button type="button" onClick={() => useStore.getState().resetSim()}>Réinitialiser</button>
        </div>
        <small>Les pas avancent le solveur du circuit. Les firmwares Arduino/ESP32 conservent leur horloge indépendante.</small>
      </section>
      <section aria-label="Ajouter un instrument"><h3>Instruments</h3><div className="lab-buttons">
        {[['power_supply', 'Alimentation'], ['function_generator', 'Générateur'], ['multimeter', 'Multimètre'], ['scope_probe', 'Sonde oscillo']].map(([type, label]) =>
          <button type="button" key={type} onClick={() => instrument(type)}>+ {label}</button>)}
      </div></section>
      <nav className="lab-tabs" aria-label="Vues du laboratoire">
        {(['measure', 'bom', 'issues'] as const).map((key, i) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{['Mesures', 'Nomenclature', `Diagnostic (${issues.length})`][i]}</button>)}
      </nav>
      {tab === 'measure' && <section>
        <input className="lab-search" aria-label="Filtrer les composants" placeholder="Rechercher : R1, Arduino…" value={query} onChange={e => setQuery(e.target.value)} />
        {!telemetry && <p>Lancez la simulation ou avancez d’un pas pour lire les mesures.</p>}
        {parts.map(c => {
          const t = telemetry?.components[c.id]
          return <details className="lab-part" key={c.id}>
            <summary><strong>{c.id}</strong> {getEntry(c.type)?.label ?? c.type}<span>{t?.current === undefined ? '—' : fmtEng(t.current, 'A')}</span></summary>
            <button type="button" onClick={() => { useStore.getState().select(c.id); onDismiss() }}>Sélectionner en 3D</button>
            <table><thead><tr><th>Broche</th><th>Tension / masse</th></tr></thead><tbody>
              {(getEntry(c.type)?.pins ?? []).map(pin => <tr key={pin}><td>{pin}</td><td>{fmtVolts(t?.pinVoltages[pin])}</td></tr>)}
            </tbody></table>
            {t?.power !== undefined && <p>Puissance : {fmtEng(t.power, 'W')}</p>}
            {t?.burned && <p role="status">Composant endommagé par surintensité.</p>}
          </details>
        })}
        {!parts.length && <p>Aucun composant trouvé.</p>}
      </section>}
      {tab === 'bom' && <section>
        <button type="button" disabled={!bom.length} onClick={exportBom}>Exporter la nomenclature CSV</button>
        <p>Regroupement par type et paramètres. Instruments inclus ; fils comptés séparément.</p>
        {bom.map((row, i) => <article className="lab-bom" key={i}><strong>{row.refs.length} × {row.label}</strong><span>{row.refs.join(', ')}</span><small>{row.values || 'Paramètres fixes'}</small></article>)}
      </section>}
      {tab === 'issues' && <section>
        {!issues.length && <p>{telemetry ? 'Aucun problème signalé par le solveur.' : 'Exécutez un pas pour obtenir le diagnostic du solveur.'}</p>}
        {issues.map((issue, i) => <article className="lab-issue" key={i}><strong>{issue.level === 'error' ? 'Erreur' : 'Attention'}</strong><p>{issue.message}</p>
          {issue.componentId && <button type="button" onClick={() => { useStore.getState().select(issue.componentId!); onDismiss() }}>Voir {issue.componentId}</button>}
        </article>)}
      </section>}
    </div>
  </Sheet>
}
