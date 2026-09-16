/**
 * EmptyState — the friendly "Build your first circuit" glass card shown when
 * the layout has no components and no sheet is open (DESIGN.md §2). Two big
 * buttons route to the Parts sheet.
 *
 * The card is a card-tier Liquid Glass lens (it floats directly over the
 * bright board — the showcase surface for the edge refraction) with the
 * tracked specular sheen, and a tone-adaptive platter: over the key-lit
 * empty board it flips to light glass with dark ink (glass/adapt.ts).
 */
import { useCallback, useEffect, useRef } from 'react'
import { attachToneAdapt, ChipIcon, PressableButton, useSpecular } from '../kit'

export interface EmptyStateProps {
  onBrowseParts: () => void
  onProjects: () => void
}

export function EmptyState({ onBrowseParts, onProjects }: EmptyStateProps) {
  const specRef = useSpecular<HTMLDivElement>()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const setCard = useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node
      specRef(node)
    },
    [specRef],
  )
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    return attachToneAdapt(el)
  }, [])
  return (
    <div className="app-empty" aria-label="Getting started">
      <div ref={setCard} className="lg-surface lg-lens lg-lens-card app-empty-card">
        <div className="lg-tone" aria-hidden="true" />
        <div className="app-empty-art" aria-hidden="true">
          <ChipIcon size={40} />
        </div>
        <div className="lg-title app-empty-title">Votre atelier électronique</div>
        <div className="lg-subhead app-empty-body">
          Ouvrez un montage prêt à simuler ou commencez avec les composants de votre choix.
        </div>
        <div className="app-empty-actions">
          <PressableButton variant="tinted" size="lg" onClick={onProjects}>Ouvrir un atelier</PressableButton>
          <PressableButton variant="filled" size="lg" haptic icon={<ChipIcon size={20} />} onClick={onBrowseParts}>
            Ajouter des composants
          </PressableButton>
        </div>
      </div>
    </div>
  )
}
