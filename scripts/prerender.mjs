/**
 * GitHub Pages post-build step: the SPA fallback, the per-route prerenders,
 * and `sitemap.xml`.
 *
 * **404 fallback.** Pages has no server-side routing, so a direct load /
 * refresh of a real path (e.g. `/council/<id>`) would 404 — there's no file
 * there. Pages serves `404.html` for any unmatched path, so copying the built
 * `index.html` to `dist/404.html` boots the SPA on those URLs and react-router
 * renders the requested route. Asset URLs in the file are absolute
 * (`/assets/…`), so they resolve regardless of the requested path's depth.
 *
 * **The prerenders.** The fallback answers with an HTTP *404 status*, which
 * search engines treat as "no such page" — fine for per-user council/settings
 * routes, wrong for the public, contentful ones. Writing `dist/<name>.html`
 * makes Pages serve that path with a 200 (extensionless `.html` lookup, no
 * redirect — unlike `<name>/index.html`, which 301s to a trailing slash).
 * Each copy gets its own title, meta description, canonical and OG/Twitter
 * tags, since social and AI crawlers read only the raw HTML. Routes carrying
 * a `body` also get real text inside `#root`, replacing the boot splash:
 * `createRoot` clears `#root` on mount, so React swaps it out for the live app
 * the instant it boots. Nothing is hidden from users that a crawler can see —
 * it is the same content, just painted earlier.
 *
 * **The sitemap** is generated here rather than hand-maintained in `public/`,
 * so a page and its sitemap entry cannot drift apart — both come from
 * `scripts/seo-routes.mjs`.
 *
 * Every rewrite below throws if its anchor stops matching `index.html`, so
 * head drift fails the build instead of silently shipping homepage meta on a
 * subpage.
 *
 * Runs after `vite build` (see the `build` script).
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import {
  CONTENT_ROUTES,
  DEMO_ROUTES,
  SITE_ORIGIN,
  sitemapPaths,
  text,
} from './seo-routes.mjs'

const src = 'dist/index.html'

if (!existsSync(src)) {
  console.error(`[prerender] ${src} not found — run this after 'vite build'.`)
  process.exit(1)
}

// ---- SPA fallback ----

copyFileSync(src, 'dist/404.html')
console.log(`[prerender] wrote dist/404.html (copy of ${src})`)

// ---- helpers ----

/** Replace `re`'s single match in `html`; zero or many matches = build error. */
function replaceOnce(html, re, replacement, what) {
  const matches = html.match(new RegExp(re, 'g')) ?? []
  if (matches.length !== 1) {
    console.error(
      `[prerender] expected exactly one match for ${what} in ${src}, ` +
        `found ${matches.length} — index.html drifted; update this script.`,
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
  return replaceOnce(html, re, `$1${attr(value)}$2`, anchor)
}

/** Escape a string for use inside a double-quoted HTML attribute. */
function attr(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

/**
 * Minimal styling for prerendered body content. Scoped to `.pr`, inlined for
 * the same reason the boot splash is: it must paint before any module
 * evaluates, and `index.css` isn't applied yet. Deliberately plain — this is
 * a sub-second bridge to the real UI, not a second design system. CSP
 * `style-src` allows inline styles (an inline *script* would be blocked).
 */
const PRERENDER_STYLE = `
    <style>
      .pr {
        max-width: 44rem;
        margin: 0 auto;
        padding: 3rem 1.25rem 4rem;
        font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif;
        color: #16191f;
      }
      .pr h1 { font-size: 1.9rem; line-height: 1.25; margin: 0 0 0.75rem; }
      .pr h2 { font-size: 1.25rem; line-height: 1.3; margin: 2rem 0 0.5rem; }
      .pr h3 { font-size: 1.02rem; margin: 1.5rem 0 0.35rem; }
      .pr p, .pr li { margin: 0 0 0.75rem; }
      .pr ul { padding-left: 1.15rem; }
      .pr blockquote {
        margin: 0 0 1rem; padding: 0.25rem 0 0.25rem 0.9rem;
        border-left: 3px solid #d7dae0; color: #4a5160;
      }
      .pr__lede { font-size: 1.1rem; color: #4a5160; }
      .pr__note { font-size: 0.9rem; color: #6b7280; }
      .pr a { color: inherit; }
      @media (prefers-color-scheme: dark) {
        .pr { color: #e6e8ec; }
        .pr blockquote { border-left-color: #333941; color: #a4acba; }
        .pr__lede { color: #a4acba; }
        .pr__note { color: #8b94a3; }
      }
    </style>`

// ---- per-route prerender ----

/** Build one route's HTML from the shell. */
function renderRoute(shell, route) {
  const url = `${SITE_ORIGIN}${route.path}`
  let html = shell

  html = replaceOnce(
    html,
    /<title>[^<]*<\/title>/,
    `<title>${text(route.title)}</title>`,
    '<title>',
  )
  html = replaceOnce(
    html,
    /(<link rel="canonical" href=")[^"]*(")/,
    `$1${attr(url)}$2`,
    'rel="canonical"',
  )
  html = setMetaContent(html, 'name="description"', route.description)
  html = setMetaContent(html, 'property="og:title"', route.title)
  html = setMetaContent(html, 'property="og:description"', route.description)
  html = setMetaContent(html, 'property="og:url"', url)
  html = setMetaContent(html, 'name="twitter:title"', route.title)
  html = setMetaContent(html, 'name="twitter:description"', route.description)

  if (route.ogImage) {
    const image = `${SITE_ORIGIN}${route.ogImage}`
    html = setMetaContent(html, 'property="og:image"', image)
    html = setMetaContent(html, 'name="twitter:image"', image)
  }

  // Structured data: replace the shell's WebApplication block wholesale when
  // the route describes itself differently (e.g. a demo council is a QAPage).
  if (route.jsonLd) {
    html = replaceOnce(
      html,
      /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
      () =>
        `<script type="application/ld+json">\n${JSON.stringify(
          route.jsonLd,
          null,
          2,
        )}\n    </script>`,
      'application/ld+json',
    )
  }

  // Real text for crawlers that never run JS. Replaces the boot splash;
  // React clears it on mount.
  if (route.body) {
    html = replaceOnce(
      html,
      /<div class="boot-splash"[\s\S]*?<\/div>\s*<\/div>/,
      () => `<div class="pr">${route.body}</div>`,
      'boot-splash',
    )
    html = replaceOnce(html, /<\/head>/, `${PRERENDER_STYLE}\n  </head>`, '</head>')
  }

  return html
}

const shell = readFileSync(src, 'utf8')
const extraRoutes = DEMO_ROUTES

for (const route of [...CONTENT_ROUTES, ...extraRoutes]) {
  const out = `dist/${route.file}`
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, renderRoute(shell, route))
  console.log(
    `[prerender] wrote dist/${route.file} (${route.path}` +
      `${route.body ? ', with body' : ', meta only'})`,
  )
}

// ---- sitemap ----

const paths = sitemapPaths(extraRoutes)
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/prerender.mjs from scripts/seo-routes.mjs.
     Do not edit by hand — add the route to the manifest instead. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url>\n    <loc>${SITE_ORIGIN}${p}</loc>\n  </url>`).join('\n')}
</urlset>
`

writeFileSync('dist/sitemap.xml', sitemap)
console.log(`[prerender] wrote dist/sitemap.xml (${paths.length} URLs)`)
