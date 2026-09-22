import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
// Tokens first: every custom property the app and the Tailwind utilities
// reference is defined here. Import order matters — index.css consumes them.
import '@ecobills/config/tokens.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
