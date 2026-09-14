const STORAGE_KEY = 'bb.instrumentHudPosition.v1'
const HUD_SELECTOR = '.insthud'
const HEAD_SELECTOR = '.insthud-head'
const VIEWPORT_MARGIN = 8

interface HudPosition {
  x: number
  y: number
}

interface DragState {
  pointerId: number
  offsetX: number
  offsetY: number
}

export function clampHudPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = VIEWPORT_MARGIN,
): HudPosition {
  const maxX = Math.max(margin, viewportWidth - width - margin)
  const maxY = Math.max(margin, viewportHeight - height - margin)
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  }
}

function readSavedPosition(): HudPosition | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HudPosition>
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null
    return { x: parsed.x as number, y: parsed.y as number }
  } catch {
    return null
  }
}

function savePosition(pos: HudPosition): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
  } catch {
    // Storage can be unavailable in private/restricted contexts. Dragging
    // still works for the current session, so persistence is best-effort.
  }
}

function applyExplicitPosition(panel: HTMLElement, pos: HudPosition): void {
  panel.style.left = `${pos.x}px`
  panel.style.top = `${pos.y}px`
  panel.style.right = 'auto'
  panel.style.bottom = 'auto'
  panel.style.transform = 'none'
  panel.dataset.insthudPositioned = 'true'
}

function clampPanel(panel: HTMLElement, x: number, y: number): HudPosition {
  const rect = panel.getBoundingClientRect()
  return clampHudPosition(
    x,
    y,
    rect.width,
    rect.height,
    window.innerWidth,
    window.innerHeight,
  )
}

const boundPanels = new WeakSet<HTMLElement>()

function bindHud(panel: HTMLElement): void {
  if (boundPanels.has(panel)) return
  const head = panel.querySelector<HTMLElement>(HEAD_SELECTOR)
  if (!head) return
  boundPanels.add(panel)

  head.style.cursor = 'grab'
  head.style.touchAction = 'none'
  head.style.userSelect = 'none'
  head.title = 'Drag instrument screens'

  let drag: DragState | null = null

  const finishDrag = (ev: PointerEvent) => {
    if (!drag || ev.pointerId !== drag.pointerId) return
    drag = null
    head.style.cursor = 'grab'
    try {
      if (head.hasPointerCapture(ev.pointerId)) head.releasePointerCapture(ev.pointerId)
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    const rect = panel.getBoundingClientRect()
    const pos = clampPanel(panel, rect.left, rect.top)
    applyExplicitPosition(panel, pos)
    savePosition(pos)
  }

  head.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return
    const rect = panel.getBoundingClientRect()

    // Freeze the current CSS-computed position into pixel coordinates before
    // dragging. This preserves the responsive desktop/mobile default until
    // the user actually moves the HUD.
    const initial = clampPanel(panel, rect.left, rect.top)
    applyExplicitPosition(panel, initial)

    drag = {
      pointerId: ev.pointerId,
      offsetX: ev.clientX - initial.x,
      offsetY: ev.clientY - initial.y,
    }
    head.style.cursor = 'grabbing'
    ev.preventDefault()
    try {
      head.setPointerCapture(ev.pointerId)
    } catch {
      // Older browsers can still drag using the pointer events below.
    }
  })

  head.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.pointerId) return
    const pos = clampPanel(panel, ev.clientX - drag.offsetX, ev.clientY - drag.offsetY)
    applyExplicitPosition(panel, pos)
    ev.preventDefault()
  })

  head.addEventListener('pointerup', finishDrag)
  head.addEventListener('pointercancel', finishDrag)

  const saved = readSavedPosition()
  if (saved) {
    requestAnimationFrame(() => {
      if (!panel.isConnected) return
      applyExplicitPosition(panel, clampPanel(panel, saved.x, saved.y))
    })
  }
}

function bindExistingHuds(): void {
  document.querySelectorAll<HTMLElement>(HUD_SELECTOR).forEach(bindHud)
}

function clampVisibleHud(): void {
  const panel = document.querySelector<HTMLElement>(HUD_SELECTOR)
  if (!panel || panel.dataset.insthudPositioned !== 'true') return
  const rect = panel.getBoundingClientRect()
  const pos = clampPanel(panel, rect.left, rect.top)
  applyExplicitPosition(panel, pos)
  savePosition(pos)
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const root = window as Window & { __ohmletInstrumentHudDragInstalled?: boolean }
  if (!root.__ohmletInstrumentHudDragInstalled) {
    root.__ohmletInstrumentHudDragInstalled = true

    const start = () => {
      bindExistingHuds()
      const observer = new MutationObserver(bindExistingHuds)
      observer.observe(document.body, { childList: true, subtree: true })
      window.addEventListener('resize', clampVisibleHud)
    }

    if (document.body) start()
    else window.addEventListener('DOMContentLoaded', start, { once: true })
  }
}
