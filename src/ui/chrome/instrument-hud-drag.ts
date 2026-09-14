import './InstrumentHudWindows.css'

const STORAGE_PREFIX = 'bb.instrumentHudPosition.v2:'
const PANEL_SELECTOR = '.insthud-card'
const HEAD_SELECTOR = '.insthud-card-head'
const VIEWPORT_MARGIN = 8
const DESKTOP_RAIL = 78
const DEFAULT_TOP = 72
const TILE_GAP = 12

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

function panelKey(panel: HTMLElement): string {
  const id = panel.querySelector<HTMLElement>('.insthud-card-id')?.textContent?.trim()
  return id || `screen-${Array.from(document.querySelectorAll(PANEL_SELECTOR)).indexOf(panel)}`
}

function storageKey(panel: HTMLElement): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(panelKey(panel))}`
}

function readSavedPosition(panel: HTMLElement): HudPosition | null {
  try {
    const raw = window.localStorage.getItem(storageKey(panel))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HudPosition>
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null
    return { x: parsed.x as number, y: parsed.y as number }
  } catch {
    return null
  }
}

function savePosition(panel: HTMLElement, pos: HudPosition): void {
  try {
    window.localStorage.setItem(storageKey(panel), JSON.stringify(pos))
  } catch {
    // Persistence is best-effort; dragging still works without storage.
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

function defaultPosition(panel: HTMLElement): HudPosition {
  const panels = Array.from(document.querySelectorAll<HTMLElement>(PANEL_SELECTOR))
  const index = Math.max(0, panels.indexOf(panel))
  const rect = panel.getBoundingClientRect()
  const desktop = window.innerWidth >= 900
  const startX = desktop ? DESKTOP_RAIL + VIEWPORT_MARGIN : VIEWPORT_MARGIN
  const usableRight = desktop
    ? Math.max(startX + rect.width, window.innerWidth - 360)
    : window.innerWidth - VIEWPORT_MARGIN
  const usableWidth = Math.max(rect.width, usableRight - startX)
  const columns = Math.max(1, Math.floor((usableWidth + TILE_GAP) / (rect.width + TILE_GAP)))
  const col = index % columns
  const row = Math.floor(index / columns)
  const x = startX + col * (rect.width + TILE_GAP)
  const y = DEFAULT_TOP + row * (rect.height + TILE_GAP)
  return clampPanel(panel, x, y)
}

const boundPanels = new WeakSet<HTMLElement>()
let zCounter = 70

function bringToFront(panel: HTMLElement): void {
  zCounter += 1
  panel.style.zIndex = String(zCounter)
}

function bindPanel(panel: HTMLElement): void {
  if (boundPanels.has(panel)) return
  const head = panel.querySelector<HTMLElement>(HEAD_SELECTOR)
  if (!head) return
  boundPanels.add(panel)

  head.style.cursor = 'grab'
  head.style.touchAction = 'none'
  head.style.userSelect = 'none'
  head.title = `Drag ${panelKey(panel)} screen`

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
    savePosition(panel, pos)
  }

  head.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return
    const target = ev.target instanceof Element ? ev.target : null
    if (target?.closest('button, input, select, a')) return

    const rect = panel.getBoundingClientRect()
    const initial = clampPanel(panel, rect.left, rect.top)
    applyExplicitPosition(panel, initial)
    bringToFront(panel)

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
  panel.addEventListener('pointerdown', () => bringToFront(panel), { capture: true })

  requestAnimationFrame(() => {
    if (!panel.isConnected) return
    const saved = readSavedPosition(panel)
    const pos = saved ? clampPanel(panel, saved.x, saved.y) : defaultPosition(panel)
    applyExplicitPosition(panel, pos)
    if (!saved) savePosition(panel, pos)
  })
}

function bindExistingPanels(): void {
  document.querySelectorAll<HTMLElement>(PANEL_SELECTOR).forEach(bindPanel)
}

function clampVisiblePanels(): void {
  document.querySelectorAll<HTMLElement>(PANEL_SELECTOR).forEach((panel) => {
    if (panel.dataset.insthudPositioned !== 'true') return
    const rect = panel.getBoundingClientRect()
    const pos = clampPanel(panel, rect.left, rect.top)
    applyExplicitPosition(panel, pos)
    savePosition(panel, pos)
  })
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const root = window as Window & { __ohmletInstrumentHudDragInstalled?: boolean }
  if (!root.__ohmletInstrumentHudDragInstalled) {
    root.__ohmletInstrumentHudDragInstalled = true

    const start = () => {
      bindExistingPanels()
      const observer = new MutationObserver(bindExistingPanels)
      observer.observe(document.body, { childList: true, subtree: true })
      window.addEventListener('resize', clampVisiblePanels)
    }

    if (document.body) start()
    else window.addEventListener('DOMContentLoaded', start, { once: true })
  }
}
