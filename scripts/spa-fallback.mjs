/**
 * GitHub Pages post-build step: the SPA fallback + the /about prerender.
 *
 * **404 fallback.** Pages has no server-side routing, so a direct load /
 * refresh of a real path (e.g. `/council/<id>`) would 404 — there's no
 * file there. Pages serves `404.html` for any unmatched path, so copying
 * the built `index.html` to `dist/404.html` boots the SPA on those URLs
 * and react-router renders the requested route. Asset URLs in the file
 * are absolute (`/assets/…`), so they resolve regardless of the
 * requested path's depth.
 *
 * **The /about prerender.** The fallback answers with an HTTP *404 status*,
 * which search engines treat as "no such page" — fine for per-user
 * council/settings routes, wrong for the one public, contentful route.
 * Writing `dist/about.html` makes Pages serve `/about` with a 200
 * (extensionless `.html` lookup, no redirect — unlike `about/index.html`,
 * which 301s to `/about/`). The copy gets /about-specific title, meta
 * description, canonical, and OG/Twitter tags, since social crawlers read
 * only the raw HTML. Every rewrite below throws if its anchor stops
 * matching `index.html`, so head drift fails the build instead of
 * silently shipping homepage meta on /about.
 *
 * Runs after `vite build` (see the `build` script).
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

const src = 'dist/index.html'

if (!existsSync(src)) {
  console.error(`[spa-fallback] ${src} not found — run this after 'vite build'.`)
  process.exit(1)
}

copyFileSync(src, 'dist/404.html')
console.log(`[spa-fallback] wrote dist/404.html (copy of ${src})`)

// ---- /about prerender ----

const ABOUT_URL = 'https://yesbrainer.ai/about'
// Same string AboutPage sets as document.title on in-app navigation
// (src/components/about-page.tsx) — keep the two in sync.
const ABOUT_TITLE = 'About Yes-Brainer — a council of AI models'
const ABOUT_DESCRIPTION =
  'What Yes-Brainer is and how to start: ask one question and let several ' +
  'AI models answer in parallel, debate to consensus, or judge each other ' +
  'for a single verdict. No accounts, no server — keys stay in your ' +
  'browser and go straight to the providers you choose.'

/** Replace `re`'s single match in `html`; zero or many matches = build error. */
function replaceOnce(html, re, replacement, what) {
  const matches = html.match(new RegExp(re, 'g')) ?? []
  if (matches.length !== 1) {
    console.error(
      `[spa-fallback] expected exactly one match for ${what} in ${src}, ` +
        `found ${matches.length} — index.html head drifted; update this script.`,
    )
    process.exit(1)
  }
  return html.replace(re, replacement)
}

/** Swap the `content` attribute of the <meta> carrying `anchor`
 *  (e.g. `property="og:title"`). Tolerates the multi-line formatting the
 *  built head keeps from the source. */
function setMetaContent(html, anchor, value) {
  const re = new RegExp(`(<meta[^>]*${anchor}[^>]*content=")[^"]*(")`)
  const attrSafe = value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return replaceOnce(html, re, `$1${attrSafe}$2`, anchor)
}

let about = readFileSync(src, 'utf8')
about = replaceOnce(
  about,
  /<title>[^<]*<\/title>/,
  `<title>${ABOUT_TITLE}</title>`,
  '<title>',
)
about = replaceOnce(
  about,
  /(<link rel="canonical" href=")[^"]*(")/,
  `$1${ABOUT_URL}$2`,
  'rel="canonical"',
)
about = setMetaContent(about, 'name="description"', ABOUT_DESCRIPTION)
about = setMetaContent(about, 'property="og:title"', ABOUT_TITLE)
about = setMetaContent(about, 'property="og:description"', ABOUT_DESCRIPTION)
about = setMetaContent(about, 'property="og:url"', ABOUT_URL)
about = setMetaContent(about, 'name="twitter:title"', ABOUT_TITLE)
about = setMetaContent(about, 'name="twitter:description"', ABOUT_DESCRIPTION)

writeFileSync('dist/about.html', about)
console.log('[spa-fallback] wrote dist/about.html (/about prerender, own meta)')
