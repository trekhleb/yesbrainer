import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Client as Styletron } from 'styletron-engine-atomic'
import { Provider as StyletronProvider } from 'styletron-react'
import './index.css'
import { App } from './app.tsx'
import { ErrorBoundary } from './components/error-boundary.tsx'
import { ThemeProvider } from './components/theme-provider.tsx'
import { logRedactedError } from './utils/extract-error.ts'
import { analytics } from './analytics/index.ts'

// PWA installs (Chromium fires `appinstalled`; Safari's add-to-Home-Screen
// has no signal, so Apple installs undercount). Registered once, outside
// React — install is a browser-level moment, not a render concern.
window.addEventListener(
  'appinstalled',
  () => analytics.event('pwa-installed'),
  { once: true },
)

// Singleton across HMR reloads — otherwise the atomic engine keeps stacking
// up new <style> tags and Base Web's class-name generation collides.
const engine = new Styletron()

// `basename` is the Vite base (`/` on yesbrainer.ai) so real-path routes
// (`/about`, `/council/:id`) resolve correctly.
//
// React 19's default onCaughtError/onUncaughtError log the *raw* error
// object to the console — a channel around the app's redaction rule
// ("open devtools and paste what you see" must never leak a key, see
// SECURITY.md). Route both through the redacted logger; the boundary
// still renders its own redacted details on screen.
createRoot(document.getElementById('root')!, {
  onCaughtError: (error) => logRedactedError('react:caught', error),
  onUncaughtError: (error) => logRedactedError('react:uncaught', error),
}).render(
  <StrictMode>
    <StyletronProvider value={engine}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ThemeProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </ThemeProvider>
      </BrowserRouter>
    </StyletronProvider>
  </StrictMode>,
)
