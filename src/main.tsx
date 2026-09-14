import React from 'react'
import { createRoot } from 'react-dom/client'
import './model/catalog-ext'
import './ui/chrome/instrument-hud-drag'
import App from './App'
import './ui/styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
