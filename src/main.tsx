import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { auth } from './auth/auth.ts'
import { startPendingResolver } from './capture/resolvePending.ts'
import 'leaflet/dist/leaflet.css'
import './index.css'

// Resume cloud sync for a persisted session — PocketBase keeps the user signed in across
// reloads, but the SyncController only runs if we restart it on startup. No-op when signed out.
void auth.resume().catch((err) => console.error('[startup] sync resume failed', err))

// Retry any provisional short-link records (saved while offline) now and on every reconnect.
startPendingResolver()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
