import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/retrowave.css'
import './i18n'
import App from './App.tsx'

// Immediately initialize theme before first render to prevent reset on refresh
const savedTheme = localStorage.getItem('retro_theme') || 'synthwave'
document.documentElement.setAttribute('data-theme', savedTheme)
document.body.setAttribute('data-theme', savedTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
