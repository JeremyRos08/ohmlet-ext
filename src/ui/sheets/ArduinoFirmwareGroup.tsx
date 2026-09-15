import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ComponentInstance } from '../../model/types'
import {
  bootAvrFirmware,
  clearAvrConsole,
  eraseAvrFirmware,
  flashAvrFirmware,
  getAvrRuntimeSnapshot,
  loadAvrFirmwareMeta,
  sendAvrSerial,
  stopAvrFirmware,
  subscribeAvrRuntime,
} from '../../firmware/avr-runtime'
import { ListGroup } from '../kit'
import './ArduinoFirmwareGroup.css'

function fmtBytes(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${bytes} B`
}

function boardLabel(comp: ComponentInstance): string {
  return comp.type === 'arduino_nano' ? 'Arduino Nano · ATmega328P' : 'Arduino Uno R3 · ATmega328P'
}

export function ArduinoFirmwareGroup({ comp }: { comp: ComponentInstance }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [uiError, setUiError] = useState<string | null>(null)
  const [serialText, setSerialText] = useState('')

  const subscribe = useCallback((fn: () => void) => subscribeAvrRuntime(comp.id, fn), [comp.id])
  const snapshot = useSyncExternalStore(
    subscribe,
    () => getAvrRuntimeSnapshot(comp.id),
    () => getAvrRuntimeSnapshot(comp.id),
  )

  useEffect(() => {
    void loadAvrFirmwareMeta(comp.id).catch(() => {
      // IndexedDB can be unavailable in restricted/private browsing.
    })
  }, [comp.id])

  const onFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setUiError(null)
    try {
      await flashAvrFirmware(comp.id, file)
      await bootAvrFirmware(comp.id)
    } catch (error) {
      setUiError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const boot = async () => {
    setBusy(true)
    setUiError(null)
    try {
      await bootAvrFirmware(comp.id)
    } catch (error) {
      setUiError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const erase = async () => {
    setBusy(true)
    setUiError(null)
    try {
      await eraseAvrFirmware(comp.id)
    } catch (error) {
      setUiError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const sendSerial = () => {
    if (!serialText) return
    sendAvrSerial(comp.id, serialText)
    setSerialText('')
  }

  const running = snapshot.status === 'running'
  const loading = snapshot.status === 'loading'
  const firmware = snapshot.firmware

  return (
    <ListGroup
      header="Arduino firmware"
      footer="Flash the compiled .hex produced by Arduino IDE/CLI for an ATmega328P board. The emulator executes the real AVR instructions at 16 MHz; GPIO, ADC, timers and Serial are bridged to the simulated circuit."
    >
      <div className="lg-row avrfw-status" role="listitem">
        <div>
          <strong className={`avrfw-dot is-${snapshot.status}`} aria-hidden="true" />
          <span className="avrfw-status-text">{busy || loading ? 'Loading firmware…' : snapshot.message}</span>
        </div>
        <span className="avrfw-pace">
          {snapshot.speed !== undefined ? `${snapshot.speed.toFixed(2)}×` : ''}
          {snapshot.cycles !== undefined ? ` · ${Math.round(snapshot.cycles).toLocaleString()} cyc` : ''}
        </span>
      </div>

      <div className="lg-row avrfw-meta" role="listitem">
        <div className="avrfw-meta-main">
          <strong>{firmware?.name ?? boardLabel(comp)}</strong>
          <span>{firmware ? 'Intel HEX · 32 kB flash target' : 'No firmware image stored yet'}</span>
        </div>
        {firmware && <div className="avrfw-meta-side"><span>{fmtBytes(firmware.totalBytes)}</span></div>}
      </div>

      <div className="lg-row avrfw-actions" role="listitem">
        <input
          ref={fileRef}
          className="avrfw-file"
          type="file"
          accept=".hex,text/plain,application/octet-stream"
          onChange={onFiles}
        />
        <button type="button" className="avrfw-btn avrfw-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {firmware ? 'Flash another .hex' : 'Flash .hex'}
        </button>
        {firmware && !running && (
          <button type="button" className="avrfw-btn" disabled={busy} onClick={() => void boot()}>Boot</button>
        )}
        {running && (
          <button type="button" className="avrfw-btn" onClick={() => stopAvrFirmware(comp.id)}>Stop</button>
        )}
        {firmware && (
          <button type="button" className="avrfw-btn avrfw-danger" disabled={busy} onClick={() => void erase()}>Erase</button>
        )}
      </div>

      {(uiError || snapshot.error) && (
        <div className="lg-row avrfw-error" role="alert">{uiError ?? snapshot.error}</div>
      )}

      {(snapshot.console || running || loading || firmware) && (
        <div className="lg-row avrfw-console-row" role="listitem">
          <div className="avrfw-console-head">
            <span>Serial monitor</span>
            <button type="button" onClick={() => clearAvrConsole(comp.id)}>Clear</button>
          </div>
          <pre className="avrfw-console">{snapshot.console || (running || loading ? 'Booting…' : 'Serial output will appear here.')}</pre>
          <div className="avrfw-serial-send">
            <input
              value={serialText}
              placeholder="Send to Serial…"
              aria-label="Serial input"
              onChange={(event) => setSerialText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  sendSerial()
                }
              }}
            />
            <button type="button" className="avrfw-btn" disabled={!running || !serialText} onClick={sendSerial}>Send</button>
          </div>
        </div>
      )}
    </ListGroup>
  )
}
