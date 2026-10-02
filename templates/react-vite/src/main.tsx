import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'
import './style.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('The application root element is missing.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
