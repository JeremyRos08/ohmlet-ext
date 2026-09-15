import React from 'react'
import { createRoot } from 'react-dom/client'
import './model/catalog-ext'
import './ui/chrome/instrument-hud-drag'
import App from './App'
import { Esp32FirmwareOverlay } from './ui/chrome/Esp32FirmwareOverlay'
import { ArduinoFirmwareOverlay } from './ui/chrome/ArduinoFirmwareOverlay'
import './ui/styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <>
      <App />
      <Esp32FirmwareOverlay />
      <ArduinoFirmwareOverlay />
    </>
  </React.StrictMode>,
)
