import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { bootstrap } from './sync/bootstrap.ts'
import './i18n/config.ts'
import 'leaflet/dist/leaflet.css'
import './index.css'

// Entry point: nothing but the React mount and one call. The startup ordering — resolve the
// backend location, start the controllers only if there is one, paint whatever happens — lives in
// `src/sync/bootstrap.ts` so it can be tested without mounting the app.
void bootstrap(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
