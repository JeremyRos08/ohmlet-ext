import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ComponentInstance } from '../../model/types'
import {
  bootEsp32Firmware,
  clearEsp32Console,
  eraseEsp32Firmware,
  flashEsp32Firmware,
  getEsp32RuntimeSnapshot,
  loadEsp32FirmwareMeta,
  stopEsp32Firmware,
  subscribeEsp32Runtime,
} from '../../firmware/esp32-runtime'
import { ListGroup } from '../kit'
import './Esp32FirmwareGroup.css'

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${bytes} B`
}

function modeLabel(mode: 'app' | 'parts' | 'full'): string {
  switch (mode) {
    case 'app': return 'Application image · direct boot'
    case 'parts': return 'Bootloader + partition table + application'
    case 'full': return 'Merged/full flash image'
  }
}

export function Esp32FirmwareGroup({ comp }: { comp: ComponentInstance }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [uiError, setUiError] = useState<string | null>(null)

  const subscribe = useCallback((fn: () => void) => subscribeEsp32Runtime(comp.id, fn), [comp.id])
  const snapshot = useSyncExternalStore(
    subscribe,
    () => getEsp32RuntimeSnapshot(comp.id),
    () => getEsp32RuntimeSnapshot(comp.id),
  )

  useEffect(() => {
    void loadEsp32FirmwareMeta(comp.id).catch(() => {
      // Firmware persistence is a convenience; unsupported private browsing
      // should not make the rest of the component inspector unusable.
    })
  }, [comp.id])

  const chooseFirmware = () => fileRef.current?.click()

  const onFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    setBusy(true)
    setUiError(null)
    try {
      await flashEsp32Firmware(comp.id, files)
      await bootEsp32Firmware(comp.id)
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
      await bootEsp32Firmware(comp.id)
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
      await eraseEsp32Firmware(comp.id)
    } catch (error) {
      setUiError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const running = snapshot.status === 'running'
  const loading = snapshot.status === 'loading'
  const firmware = snapshot.firmware

  return (
    <ListGroup
      header="ESP32-S3 firmware"
      footer="Single application .bin files boot directly. You can also select bootloader.bin + partition-table.bin + the application .bin together, or a merged/full-flash .bin. Firmware stays stored in this browser for this ESP32 component."
    >
      <div className="lg-row espfw-status" role="listitem">
        <div>
          <strong className={`espfw-dot is-${snapshot.status}`} aria-hidden="true" />
          <span className="espfw-status-text">{busy || loading ? 'Loading firmware…' : snapshot.message}</span>
        </div>
        {(snapshot.speed !== undefined || snapshot.mips !== undefined) && (
          <span className="espfw-pace">
            {snapshot.speed !== undefined ? `${snapshot.speed.toFixed(2)}×` : ''}
            {snapshot.mips !== undefined ? ` · ${snapshot.mips.toFixed(1)} MIPS` : ''}
          </span>
        )}
      </div>

      {firmware && (
        <div className="lg-row espfw-meta" role="listitem">
          <div className="espfw-meta-main">
            <strong>{firmware.names.join(' + ')}</strong>
            <span>{modeLabel(firmware.mode)}</span>
          </div>
          <div className="espfw-meta-side">
            <span>{fmtBytes(firmware.totalBytes)}</span>
            <code>{firmware.sha256.slice(0, 10)}</code>
          </div>
        </div>
      )}

      <div className="lg-row espfw-actions" role="listitem">
        <input
          ref={fileRef}
          type="file"
          accept=".bin,application/octet-stream"
          multiple
          className="espfw-file"
          onChange={onFiles}
        />
        <button type="button" className="espfw-btn espfw-primary" disabled={busy} onClick={chooseFirmware}>
          {firmware ? 'Flash another' : 'Flash firmware'}
        </button>
        {firmware && !running && (
          <button type="button" className="espfw-btn" disabled={busy} onClick={() => void boot()}>
            Boot
          </button>
        )}
        {running && (
          <button type="button" className="espfw-btn" onClick={() => stopEsp32Firmware(comp.id)}>
            Stop
          </button>
        )}
        {firmware && (
          <button type="button" className="espfw-btn espfw-danger" disabled={busy} onClick={() => void erase()}>
            Erase
          </button>
        )}
      </div>

      {(uiError || snapshot.error) && (
        <div className="lg-row espfw-error" role="alert">
          {uiError ?? snapshot.error}
        </div>
      )}

      {(snapshot.console || running || loading) && (
        <div className="lg-row espfw-console-row" role="listitem">
          <div className="espfw-console-head">
            <span>Serial monitor</span>
            <button type="button" onClick={() => clearEsp32Console(comp.id)}>Clear</button>
          </div>
          <pre className="espfw-console">{snapshot.console || 'Booting…'}</pre>
        </div>
      )}
    </ListGroup>
  )
}
