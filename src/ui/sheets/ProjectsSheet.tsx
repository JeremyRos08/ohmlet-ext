import { useState } from 'react'
import { STARTER_LAYOUT } from '../../model/starter-layout'
import type { CircuitLayout } from '../../model/types'
import { useStore } from '../../state/store'
import { ActionSheet, Sheet, showToast } from '../kit'
import blinky from '../../../examples/blinky-555.json'
import counter from '../../../examples/counter.json'
import esp32Tft from '../../../examples/esp32-tft-ra8875.json'
import './ProjectsSheet.css'

const PROJECTS: { title: string; tag: string; description: string; layout: CircuitLayout }[] = [
  { title: 'Banc LED', tag: '01 / ANALOGIQUE', description: 'Alimentation 5 V, LED protégée et sonde de tension. Prêt à mesurer.', layout: STARTER_LAYOUT },
  { title: 'Oscillateur NE555', tag: '02 / SIGNAUX', description: 'Clignotant câblé avec résistance, condensateur et capture du signal carré.', layout: blinky as CircuitLayout },
  { title: 'Compteur numérique', tag: '03 / LOGIQUE', description: 'Explorez le comptage et l’affichage à sept segments.', layout: counter as CircuitLayout },
  { title: 'ESP32 + TFT 5 pouces', tag: '04 / EMBARQUÉ', description: 'DevKitC-1, SPI, tactile I²C et écran RA8875 800×480.', layout: esp32Tft as CircuitLayout },
  { title: 'Projet vide', tag: '05 / CRÉATION', description: 'Une carte compacte pour construire votre propre montage.', layout: { version: 1, board: 'half', name: 'Nouveau montage', components: [], wires: [] } },
]

export function ProjectsSheet({ open, onDismiss, desktop }: { open: boolean; onDismiss: () => void; desktop: boolean }) {
  const [pending, setPending] = useState<number | null>(null)
  const load = (index: number) => {
    const result = useStore.getState().loadLayout(structuredClone(PROJECTS[index].layout))
    setPending(null)
    if (!result.ok) { showToast(result.errors[0] ?? 'Impossible de charger ce montage'); return }
    onDismiss()
    showToast('Montage ouvert · Espace pour simuler · F pour cadrer')
  }
  const choose = (index: number) => {
    const current = useStore.getState().layout
    if (current.components.length || current.wires.length) setPending(index)
    else load(index)
  }
  return <>
    <Sheet open={open} onDismiss={onDismiss} ariaLabel="Atelier 3D" snapPoints={[0.55, 0.92]} desktop={desktop}>
      <div className="projects-intro">
        <span>OHMLET / LABORATOIRE</span>
        <h2>Construire. Simuler. Mesurer.</h2>
        <p>Choisissez un banc de départ, puis modifiez chaque composant dans la scène 3D.</p>
      </div>
      <div className="projects-grid">
        {PROJECTS.map((project, index) => <button type="button" className="project-card" key={project.title} onClick={() => choose(index)}>
          <span className="project-tag">{project.tag}</span>
          <strong>{project.title}</strong>
          <span>{project.description}</span>
          <span className="project-open">Ouvrir le montage →</span>
        </button>)}
      </div>
    </Sheet>
    <ActionSheet open={open && pending !== null} onDismiss={() => setPending(null)} title="Remplacer le montage actuel ? Vous pourrez revenir avec Annuler." desktop={desktop}
      actions={[{ label: 'Ouvrir le montage choisi', onSelect: () => { if (pending !== null) load(pending) } }]} />
  </>
}
