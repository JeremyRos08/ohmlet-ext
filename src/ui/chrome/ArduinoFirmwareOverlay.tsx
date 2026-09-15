import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../state/store'
import type { ComponentInstance } from '../../model/types'
import { ArduinoFirmwareGroup } from '../sheets/ArduinoFirmwareGroup'
import './ArduinoFirmwareOverlay.css'

interface Point { x: number; y: number }

function selectionIds(selection: unknown): string[] {
  if (Array.isArray(selection)) return selection.filter((v): v is string => typeof v === 'string')
  return typeof selection === 'string' ? [selection] : []
}

function isArduino(comp: ComponentInstance): boolean {
  return comp.type === 'arduino_uno_r3' || comp.type === 'arduino_nano'
}

function storageKey(id: string): string {
  return `bb.arduinoFirmwareWindow.v1:${id}`
}

function defaultPosition(index: number): Point {
  const mobile = typeof window !== 'undefined' && window.innerWidth < 900
  return mobile
    ? { x: 8 + index * 14, y: 86 + index * 18 }
    : { x: 116 + index * 24, y: 104 + index * 24 }
}

function clampPosition(pos: Point, width: number, height: number): Point {
  const margin = 8
  const maxX = Math.max(margin, window.innerWidth - width - margin)
  const maxY = Math.max(margin, window.innerHeight - height - margin)
  return {
    x: Math.min(Math.max(margin, pos.x), maxX),
    y: Math.min(Math.max(margin, pos.y), maxY),
  }
}

function readPosition(id: string, index: number): Point {
  try {
    const raw = localStorage.getItem(storageKey(id))
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Point>
      if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        return { x: parsed.x as number, y: parsed.y as number }
      }
    }
  } catch { /* persistence is best effort */ }
  return defaultPosition(index)
}

function ArduinoFirmwareWindow({ comp, index, onClose }: { comp: ComponentInstance; index: number; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Point>(() => readPosition(comp.id, index))
  const drag = useRef<{ pointerId: number; dx: number; dy: number } | null>(null)

  useEffect(() => {
    const onResize = () => {
      const el = rootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos((p) => clampPosition(p, rect.width, rect.height))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const down = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if ((ev.target as HTMLElement).closest('button,input')) return
    if (ev.pointerType === 'mouse' && ev.button !== 0) return
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    drag.current = { pointerId: ev.pointerId, dx: ev.clientX - rect.left, dy: ev.clientY - rect.top }
    try { ev.currentTarget.setPointerCapture(ev.pointerId) } catch { /* old browser */ }
    ev.preventDefault()
  }

  const move = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = rootRef.current
    if (!d || d.pointerId !== ev.pointerId || !el) return
    const rect = el.getBoundingClientRect()
    setPos(clampPosition({ x: ev.clientX - d.dx, y: ev.clientY - d.dy }, rect.width, rect.height))
    ev.preventDefault()
  }

  const finish = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== ev.pointerId) return
    drag.current = null
    try { ev.currentTarget.releasePointerCapture(ev.pointerId) } catch { /* already released */ }
    try { localStorage.setItem(storageKey(comp.id), JSON.stringify(pos)) } catch { /* best effort */ }
  }

  const board = comp.type === 'arduino_nano' ? 'Arduino Nano' : 'Arduino Uno R3'
  return (
    <div ref={rootRef} className="arduino-fw-window" style={{ left: pos.x, top: pos.y }}>
      <div
        className="arduino-fw-window-head"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <div>
          <strong>{comp.id}</strong>
          <span>{board} firmware</span>
        </div>
        <button type="button" aria-label={`Close ${comp.id} firmware window`} onClick={onClose}>×</button>
      </div>
      <div className="arduino-fw-window-body">
        <ArduinoFirmwareGroup comp={comp} />
      </div>
    </div>
  )
}

export function ArduinoFirmwareOverlay() {
  const selection = useStore((s) => s.selection)
  const components = useStore((s) => s.layout.components)
  const [openIds, setOpenIds] = useState<string[]>([])

  useEffect(() => {
    const selected = selectionIds(selection).filter((id) => {
      const comp = components.find((item) => item.id === id)
      return !!comp && isArduino(comp)
    })
    if (selected.length === 0) return
    setOpenIds((old) => {
      const next = [...old]
      for (const id of selected) if (!next.includes(id)) next.push(id)
      return next
    })
  }, [selection, components])

  useEffect(() => {
    setOpenIds((old) => old.filter((id) => {
      const comp = components.find((item) => item.id === id)
      return !!comp && isArduino(comp)
    }))
  }, [components])

  if (typeof document === 'undefined' || openIds.length === 0) return null

  return createPortal(
    <>
      {openIds.map((id, index) => {
        const comp = components.find((item) => item.id === id && isArduino(item))
        return comp ? (
          <ArduinoFirmwareWindow
            key={id}
            comp={comp}
            index={index}
            onClose={() => setOpenIds((old) => old.filter((value) => value !== id))}
          />
        ) : null
      })}
    </>,
    document.body,
  )
}
