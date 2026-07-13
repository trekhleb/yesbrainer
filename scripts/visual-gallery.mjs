/**
 * Build a browsable contact sheet of every committed visual baseline.
 *
 * The visual suite doubles as the app's screen inventory (see
 * tests/visual/README.md). This script walks the committed baseline PNGs
 * under `tests/visual/__screenshots__/` and emits a single self-contained
 * `index.html` there — grouped by spec file, each shot shown at both the
 * desktop and mobile form factors side by side — so the whole UI can be
 * eyeballed at once for UX review, design work, or a blog post.
 *
 * Baselines are platform-suffixed (`-linux` / `-darwin`) because font
 * rasterisation differs per OS. When both platforms are committed the page
 * inlines both and shows a **Darwin / Linux toggle** in the header (defaults
 * to Darwin — macOS renders fonts more cleanly); with a single platform the
 * toggle is omitted.
 *
 * It reads only the checked-in baselines, never runs the browser. Run
 * `npm run test:visual:update` first if you want it to reflect fresh UI.
 *
 *   node scripts/visual-gallery.mjs   (or: npm run test:visual:gallery)
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const shotsDir = join(root, '..', 'tests', 'visual', '__screenshots__')

/** Recursively collect every *.png under a directory. */
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (name.endsWith('.png')) out.push(full)
  }
  return out
}

// Baseline filename shape: `<arg>-<project>-<platform>.png`, e.g.
// `trial-voting-desktop-linux.png`. Split off the trailing project +
// platform so the remaining slug is the human-facing shot name.
function parseShot(file) {
  const specDir = basename(dirname(file))
  const stem = basename(file, '.png')
  const m = stem.match(/^(.*)-(desktop|mobile)-([a-z]+)$/)
  if (!m) return null
  return {
    file,
    spec: specDir.replace(/\.spec\.ts$/, ''),
    name: m[1],
    project: m[2],
    platform: m[3],
  }
}

const shots = walk(shotsDir).map(parseShot).filter(Boolean)
if (shots.length === 0) {
  console.error(
    'No baselines found. Run `npm run test:visual:update` first to generate them.',
  )
  process.exit(1)
}

// spec → name → project → { <platform>: dataUri }. The platform is kept in
// the key (the old version dropped it, so two platforms of the same shot
// collided and one silently overwrote the other).
const bySpec = new Map()
for (const s of shots) {
  if (!bySpec.has(s.spec)) bySpec.set(s.spec, new Map())
  const byName = bySpec.get(s.spec)
  if (!byName.has(s.name)) byName.set(s.name, {})
  const slot = byName.get(s.name)
  if (!slot[s.project]) slot[s.project] = {}
  slot[s.project][s.platform] =
    `data:image/png;base64,${readFileSync(s.file).toString('base64')}`
}

const platforms = new Set(shots.map((s) => s.platform))
const hasToggle = platforms.size > 1

// Distinct screenshots (one shot at one viewport) — the honest count, vs the
// raw file total which double-counts when both platforms are committed.
let shotCount = 0
for (const byName of bySpec.values())
  for (const byProject of byName.values())
    shotCount += Object.keys(byProject).length

const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const specSections = [...bySpec.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([spec, byName]) => {
    const cards = [...byName.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, byProject]) => {
        const frames = ['desktop', 'mobile']
          .filter((p) => byProject[p])
          .map((p) => {
            const imgs = byProject[p] // { darwin?, linux? }
            // Default to Darwin (nicer fonts); the toggle swaps to Linux via
            // `data-linux`. Only emit the extra attr when both exist, so
            // neither platform's (large) data URI is duplicated in the file.
            const primary = imgs.darwin ?? imgs.linux
            const linuxAttr =
              imgs.darwin && imgs.linux ? ` data-linux="${imgs.linux}"` : ''
            return (
              `<figure class="frame ${p}"><figcaption>${p}</figcaption>` +
              `<img loading="lazy" tabindex="0" role="button" ` +
              `alt="${esc(name)} — ${p}" src="${primary}"${linuxAttr}></figure>`
            )
          })
          .join('')
        return `<article class="card"><h3>${esc(name)}</h3><div class="frames">${frames}</div></article>`
      })
      .join('')
    return `<section><h2>${esc(spec)}</h2><div class="grid">${cards}</div></section>`
  })
  .join('')

const platformNote = hasToggle
  ? 'Darwin + Linux baselines'
  : `${[...platforms][0]} baselines`

// Header platform switcher — only meaningful when both sets are present.
const toggleHtml = hasToggle
  ? `<div class="platform-toggle" role="group" aria-label="Baseline rendering platform">
      <span class="pt-label">Platform</span>
      <div class="pt-buttons">
        <button type="button" data-platform="darwin" class="active">Darwin</button>
        <button type="button" data-platform="linux">Linux</button>
      </div>
    </div>`
  : ''

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yes-Brainer — visual inventory</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f7f9; --fg:#15171c; --muted:#6b7280; --card:#fff; --line:#e2e5ea; --accent:#5856d6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#15171c; --fg:#e9ebf0; --muted:#9aa3b2; --card:#1c1f26; --line:#2a2e37; } }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.5 system-ui, sans-serif; background:var(--bg); color:var(--fg); }
  header { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--line); padding:16px 24px; z-index:1; }
  header h1 { margin:0; font-size:18px; }
  header p { margin:4px 0 0; color:var(--muted); font-size:13px; }
  .platform-toggle { margin-top:12px; display:inline-flex; align-items:center; gap:8px; }
  .pt-label { font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--muted); }
  .pt-buttons { display:inline-flex; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  .pt-buttons button { font:600 12px system-ui, sans-serif; padding:6px 16px; background:var(--card); color:var(--muted); border:none; cursor:pointer; transition:background 80ms ease, color 80ms ease; }
  .pt-buttons button + button { border-left:1px solid var(--line); }
  .pt-buttons button:hover { color:var(--fg); }
  .pt-buttons button.active { background:var(--accent); color:#fff; }
  main { padding:24px; max-width:1400px; margin:0 auto; }
  section { margin-bottom:40px; }
  h2 { font-size:15px; font-family:ui-monospace, monospace; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:6px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:20px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px; }
  .card h3 { margin:0 0 10px; font-size:13px; font-family:ui-monospace, monospace; font-weight:600; }
  .frames { display:flex; gap:10px; align-items:flex-start; }
  .frame { margin:0; flex:0 1 auto; min-width:0; }
  .frame.mobile { max-width:130px; }
  .frame figcaption { font-size:11px; color:var(--muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.04em; }
  .frame img { width:100%; height:auto; border:1px solid var(--line); border-radius:8px; display:block; background:var(--card); cursor:zoom-in; transition:outline 80ms ease; outline:2px solid transparent; }
  .frame img:hover, .frame img:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  /* Lightbox: click any shot to view it 1:1, click/Esc to dismiss. */
  #lightbox { position:fixed; inset:0; z-index:10; display:none; background:rgba(0,0,0,0.85); cursor:zoom-out; padding:24px; overflow:auto; }
  #lightbox.open { display:flex; flex-direction:column; align-items:center; gap:12px; }
  #lightbox figcaption { color:#e9ebf0; font:13px ui-monospace, monospace; text-align:center; position:sticky; top:0; }
  #lightbox img { max-width:100%; height:auto; border-radius:8px; box-shadow:0 8px 40px rgba(0,0,0,0.5); background:#fff; }
</style></head>
<body>
<header><h1>Yes-Brainer — visual inventory</h1>
<p>${shotCount} shots across ${bySpec.size} spec files · desktop 1440×900 + mobile 390×844 · ${platformNote} · generated ${new Date().toISOString().slice(0, 10)} · <strong>click any shot to zoom</strong></p>
${toggleHtml}</header>
<main>${specSections}</main>
<div id="lightbox" aria-hidden="true"><figcaption></figcaption><img alt=""></div>
<script>
  (function () {
    var box = document.getElementById('lightbox');
    var big = box.querySelector('img');
    var cap = box.querySelector('figcaption');
    function open(img) {
      big.src = img.src; big.alt = img.alt; cap.textContent = img.alt;
      box.classList.add('open'); box.setAttribute('aria-hidden', 'false');
    }
    function close() {
      box.classList.remove('open'); box.setAttribute('aria-hidden', 'true');
      big.removeAttribute('src');
    }
    document.querySelector('main').addEventListener('click', function (e) {
      if (e.target.tagName === 'IMG') open(e.target);
    });
    document.querySelector('main').addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName === 'IMG') {
        e.preventDefault(); open(e.target);
      }
    });
    box.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  })();
  // Darwin / Linux platform toggle. The page renders Darwin by default; each
  // <img> carries the Linux variant in \`data-linux\` when both exist. We cache
  // the rendered Darwin src at runtime so switching back needs no second copy
  // of it embedded in the file. Choice persists in localStorage.
  (function () {
    var toggle = document.querySelector('.platform-toggle');
    if (!toggle) return;
    var imgs = document.querySelectorAll('.frame img');
    function apply(p) {
      imgs.forEach(function (img) {
        if (!img.dataset.darwinSrc) img.dataset.darwinSrc = img.getAttribute('src');
        var linux = img.getAttribute('data-linux');
        img.src = p === 'linux' ? (linux || img.dataset.darwinSrc) : img.dataset.darwinSrc;
      });
      toggle.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.dataset.platform === p);
      });
      try { localStorage.setItem('yb-gallery-platform', p); } catch (e) {}
    }
    toggle.addEventListener('click', function (e) {
      var p = e.target && e.target.dataset ? e.target.dataset.platform : null;
      if (p) apply(p);
    });
    var saved = null;
    try { saved = localStorage.getItem('yb-gallery-platform'); } catch (e) {}
    if (saved === 'linux') apply('linux');
  })();
</script>
</body></html>`

const outPath = join(shotsDir, 'index.html')
writeFileSync(outPath, html)
console.log(
  `Wrote ${outPath} (${shotCount} shots, ${bySpec.size} specs, ${[...platforms].sort().join(' + ')}).`,
)
