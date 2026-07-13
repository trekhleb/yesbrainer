/**
 * Share-card canvas painter — renders a `ShareCardData` payload
 * (`./data.ts`) into the shareable 1200×900 PNG.
 *
 * Deliberate choices:
 *  - **Client-side canvas, no dependencies** — zero-backend and CSP-clean;
 *    the whole card is hand-laid-out, the way the visual-test fixture
 *    images already are.
 *  - **A FIXED light "brand paper" look**, independent of the app theme —
 *    a share card is a publication, not a UI surface; it must read
 *    identically in every feed, chat, and slide. Accents come from the
 *    structure palette (`structureColorSet(…, false)` — the light set),
 *    so the artifact and the app can't drift.
 *  - **Near-plain-text excerpts** — markdown is flattened, not rendered:
 *    big clean typography beats a miniature markdown reproduction at
 *    feed sizes, and it keeps the painter honest (KaTeX/code can't fit
 *    on a card anyway). One concession: `**bold**` runs
 *    (and headings, arriving as bold lines) paint with a bold font via
 *    `./text-runs.ts` — emphasis carries real signal in verdicts and
 *    costs no layout machinery beyond run-aware wrapping.
 *  - **1200×900 (4:3) at 2× backing** — deliberately closer to square than
 *    a 16:9 link card: the artifact's job is a
 *    complete-enough ruling, and 16:9 only wins for OG link previews,
 *    which a downloaded/shared PNG never is. Feeds render 4:3 uncropped,
 *    and the extra height goes straight to verdict lines via the
 *    adaptive clamp.
 *
 * Pulls `react-dom/server` (to rasterize the @lobehub provider glyphs
 * into canvas-drawable SVGs) — which is why this module is only ever
 * loaded through the share modal's dynamic `import()`.
 */

import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PROVIDER_GLYPHS } from '@/models/provider-avatars'
import type { ProviderId } from '@/models/registry'
import {
  structureColorSet,
  type StructureColorSet,
} from '@/models/social-structure-colors'
import { OFFICIAL_APP_URL } from '@/utils/external-links'
import type { ShareCardColumn, ShareCardData } from './data'
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from './dimensions'
import { clampRichLines, wrapRichText } from './text-runs'

// The card's fixed logical size, shared with the modal's preview box via
// dimensions.ts — change it there and both the render and the reserved
// loading box move together.
const W = SHARE_CARD_WIDTH
const H = SHARE_CARD_HEIGHT
const SCALE = 2
// Native-stack first; the long tail matters because canvas has no CSS
// fallback cascade beyond the family list — a bare `system-ui` alone
// lands on whatever fontconfig guesses on lean Linuxes.
const FONT = `-apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`

// Fixed light-paper neutrals (see the module header for why the card
// ignores the app theme).
const INK = '#0F1420'
const INK_SOFT = '#374151'
const INK_MUTED = '#6B7280'
const PAPER = '#FFFFFF'
const BACKDROP = '#F1F2F5'

export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  const set = structureColorSet(data.structure, false)
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('share card: no 2d context')
  ctx.scale(SCALE, SCALE)

  // Backdrop + two corner glows in the structure hue — the same "aura"
  // language the get-started card wears, so the artifact is recognizably
  // ours before a single word is read.
  ctx.fillStyle = BACKDROP
  ctx.fillRect(0, 0, W, H)
  paintGlow(ctx, W * 0.12, H * 0.02, W * 0.5, set.glow, 0.32)
  paintGlow(ctx, W * 0.92, H * 1.02, W * 0.55, set.glow, 0.24)

  // The card surface.
  const card = { x: 44, y: 44, w: W - 88, h: H - 88, r: 24 }
  ctx.save()
  ctx.shadowColor = 'rgba(16, 24, 40, 0.14)'
  ctx.shadowBlur = 36
  ctx.shadowOffsetY = 14
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r)
  ctx.fillStyle = PAPER
  ctx.fill()
  ctx.restore()

  const px = card.x + 52 // content left
  const pw = card.w - 104 // content width
  let y = card.y + 46 // running baseline-ish cursor

  // ── Header row: brand + structure chip ─────────────────────────────
  const logo = await tryLoadImage('/logo.png')
  const brandH = 34
  if (logo) ctx.drawImage(logo, px, y - 6, brandH, brandH)
  ctx.font = `700 21px ${FONT}`
  ctx.fillStyle = INK
  ctx.textBaseline = 'middle'
  ctx.fillText('Yes-Brainer', px + (logo ? brandH + 12 : 0), y + brandH / 2 - 6)

  const chipLabel =
    data.structure === 'trial'
      ? 'TRIAL · VERDICT'
      : data.structure === 'consensus'
        ? 'CONSENSUS DEBATE'
        : 'PARALLEL ANSWERS'
  ctx.font = `700 12px ${FONT}`
  const chipTextW = ctx.measureText(chipLabel).width
  const chipW = chipTextW + 28
  const chipH = 28
  const chipX = px + pw - chipW
  roundRect(ctx, chipX, y - 4, chipW, chipH, chipH / 2)
  ctx.fillStyle = set.bg
  ctx.fill()
  ctx.strokeStyle = set.border
  ctx.lineWidth = 1
  roundRect(ctx, chipX, y - 4, chipW, chipH, chipH / 2)
  ctx.stroke()
  ctx.fillStyle = set.accent
  ctx.fillText(chipLabel, chipX + 14, y - 4 + chipH / 2 + 0.5)
  y += brandH + 30

  // ── The question — the hook, big and quoted. When the turn carried
  //    image attachments the first one sits beside it as a thumbnail (the
  //    question is often *about* the image; without it the card shows a
  //    riddle with no subject). Nullable like every card asset: a failed
  //    decode just paints the imageless layout. ────────────────────────
  const firstImage = data.userImages?.[0]
  const thumb = firstImage ? await tryLoadImage(firstImage) : null
  // 150 = the question block's own 3-line max (3 × 50), so the thumbnail
  // never pushes the body further down than a full-height question would.
  const thumbSize = 150
  const qw = thumb ? pw - thumbSize - 28 : pw
  ctx.font = `650 38px ${FONT}`
  ctx.fillStyle = INK
  const questionLines = clampLines(
    wrapText(ctx, `“${data.question.trim()}”`, qw),
    3,
    ctx,
    qw,
  )
  const questionTop = y
  for (const line of questionLines) {
    ctx.fillText(line, px, y + 24)
    y += 50
  }
  if (thumb) {
    drawCoverThumb(ctx, thumb, px + pw - thumbSize, questionTop, thumbSize)
    const extra = (data.userImages?.length ?? 1) - 1
    if (extra > 0) {
      const label = `+${extra}`
      ctx.font = `700 13px ${FONT}`
      const badgeW = ctx.measureText(label).width + 16
      const badgeH = 22
      const bx = px + pw - badgeW - 8
      const by = questionTop + thumbSize - badgeH - 8
      roundRect(ctx, bx, by, badgeW, badgeH, badgeH / 2)
      ctx.fillStyle = 'rgba(15, 20, 32, 0.72)'
      ctx.fill()
      ctx.fillStyle = PAPER
      ctx.fillText(label, bx + 8, by + badgeH / 2 + 0.5)
    }
    y = Math.max(y, questionTop + thumbSize)
  }
  y += 16

  // ── Roster + process line ───────────────────────────────────────────
  // Verdict cards get a roster badge row; the Parallel columns card skips
  // it — each column already carries its model's badge + name, so a roster
  // line above would just duplicate them and cost column height.
  const badgeSize = 30
  if (!data.columns) {
    let ax = px
    for (const seat of data.seats) {
      await drawProviderBadge(ctx, seat.provider, ax, y, badgeSize)
      ax += badgeSize + 8
    }
    if (ax > px) ax += 6
    ctx.font = `600 16px ${FONT}`
    ctx.fillStyle = INK_SOFT
    const names = data.seats.map((s) => s.label).join('  ·  ')
    ctx.fillText(
      ellipsize(ctx, names, pw - (ax - px)),
      ax,
      y + badgeSize / 2 + 0.5,
    )
    y += badgeSize + 14
  }
  ctx.font = `500 16px ${FONT}`
  ctx.fillStyle = INK_MUTED
  ctx.fillText(ellipsize(ctx, data.processLine, pw), px, y + 8)
  y += 32

  const footerH = 46
  const bodyBottom = card.y + card.h - footerH

  // ── Parallel: the columns panorama ─────────────────────────────────
  if (data.columns) {
    await drawColumns(ctx, data.columns, set, px, y, pw, bodyBottom - y)
  } else {
    drawVerdictBody(ctx, data, set, px, y, pw, bodyBottom)
  }

  // ── Footer: AI caveat left, the URL right. The card travels to third
  //    parties under the brand, so it self-disclaims wherever it's
  //    reposted (copy audit). ──────────────────────────────
  ctx.font = `600 15px ${FONT}`
  ctx.fillStyle = INK_MUTED
  const host = OFFICIAL_APP_URL.replace(/^https?:\/\//, '')
  const hw = ctx.measureText(host).width
  const footerY = card.y + card.h - footerH / 2 - 4
  ctx.font = `500 15px ${FONT}`
  ctx.fillText(
    ellipsize(ctx, 'AI-generated — verify before acting on it', pw - hw - 24),
    px,
    footerY,
  )
  ctx.font = `600 15px ${FONT}`
  ctx.fillText(host, px + pw - hw, footerY)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) throw new Error('share card: encode failed')
  return blob
}

/** Verdict layout body (Trial / Consensus): the quiet peer-vote line +
 *  the tinted synthesis-excerpt panel, filling down to the footer. */
function drawVerdictBody(
  ctx: CanvasRenderingContext2D,
  data: ShareCardData,
  set: StructureColorSet,
  px: number,
  yStart: number,
  pw: number,
  bodyBottom: number,
): void {
  let y = yStart

  // Trial: the peer vote as ONE quiet line, not a leaderboard. The vote is
  // context, the verdict is the theme — a single
  // "peer-rated best" line keeps the judge-vs-peers tension visible while
  // the freed rows go to verdict text below.
  if (data.scores.length > 0) {
    const winner = data.scores.find((s) => s.winner) ?? data.scores[0]!
    const cy = y + 12
    ctx.font = `500 16px ${FONT}`
    ctx.fillStyle = INK_MUTED
    const prefix = 'Peer-rated best:  '
    ctx.fillText(prefix, px, cy)
    let wx = px + ctx.measureText(prefix).width
    ctx.font = `700 16px ${FONT}`
    ctx.fillStyle = INK_SOFT
    ctx.fillText(winner.label, wx, cy)
    wx += ctx.measureText(winner.label).width + 10
    const scoreText = `${winner.score.toFixed(1)} of 5`
    ctx.font = `700 16px ${FONT}`
    ctx.fillStyle = set.accent
    // Drawn star (text `★`/`🏆` glyphs are tofu on symbol/emoji-poor
    // platforms), then the score.
    paintStar(ctx, wx + 7, cy, 7, set.accent)
    ctx.fillText(scoreText, wx + 18, cy)
    y += 34
  }

  const verdict = data.verdict
  if (!verdict) return
  const panel = { x: px, y, w: pw, h: bodyBottom - y }
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 14)
  ctx.fillStyle = set.bg
  ctx.fill()
  // Accent bar — the panel's left edge, rounded.
  roundRect(ctx, panel.x + 14, panel.y + 16, 4, panel.h - 32, 2)
  ctx.fillStyle = set.accent
  ctx.fill()

  const vx = panel.x + 36
  const vw = panel.w - 60
  let vy = panel.y + 30
  ctx.font = `700 12.5px ${FONT}`
  ctx.fillStyle = set.accent
  ctx.fillText(
    `${verdict.role.toUpperCase()} · ${verdict.modelLabel.toUpperCase()}`,
    vx,
    vy,
  )
  vy += 26
  ctx.fillStyle = '#1F2937'
  const lineH = 27
  const maxVerdictLines = Math.max(
    2,
    Math.floor((panel.y + panel.h - 22 - vy) / lineH),
  )
  paintRichText(ctx, verdict.text, {
    x: vx,
    y: vy + lineH / 2,
    maxWidth: vw,
    maxLines: maxVerdictLines,
    lineHeight: lineH,
    normalFont: `400 18px ${FONT}`,
    boldFont: `700 18px ${FONT}`,
  })
}

/** Parallel layout body: up to 3 equal columns, each a light card with the
 *  model's badge + name and a truncated answer — the divergence panorama. */
async function drawColumns(
  ctx: CanvasRenderingContext2D,
  columns: ShareCardColumn[],
  set: StructureColorSet,
  px: number,
  y: number,
  pw: number,
  h: number,
): Promise<void> {
  const gap = 20
  const n = columns.length
  const colW = (pw - gap * (n - 1)) / n
  const padX = 16
  const badge = 22
  const lineH = 24
  const bodyTop = y + 14 + badge + 14 // card top pad + header row + rule gap
  const maxLines = Math.max(3, Math.floor((y + h - 16 - bodyTop) / lineH))
  for (let i = 0; i < n; i++) {
    const col = columns[i]!
    const cx = px + i * (colW + gap)
    // Column card — light fill + hairline, matching the app's answer panes.
    roundRect(ctx, cx, y, colW, h, 14)
    ctx.fillStyle = '#FBFBFC'
    ctx.fill()
    ctx.strokeStyle = '#E7E9EE'
    ctx.lineWidth = 1
    roundRect(ctx, cx, y, colW, h, 14)
    ctx.stroke()
    // Header: badge + model name.
    await drawProviderBadge(ctx, col.provider, cx + padX, y + 14, badge)
    ctx.font = `700 15px ${FONT}`
    ctx.fillStyle = INK
    ctx.fillText(
      ellipsize(ctx, col.label, colW - padX * 2 - badge - 8),
      cx + padX + badge + 8,
      y + 14 + badge / 2 + 0.5,
    )
    // Thin accent rule under the header.
    ctx.fillStyle = set.border
    ctx.fillRect(cx + padX, y + 14 + badge + 8, colW - padX * 2, 1)
    // Answer excerpt.
    ctx.fillStyle = INK_SOFT
    paintRichText(ctx, col.excerpt, {
      x: cx + padX,
      y: bodyTop + lineH / 2,
      maxWidth: colW - padX * 2,
      maxLines,
      lineHeight: lineH,
      normalFont: `400 15px ${FONT}`,
      boldFont: `700 15px ${FONT}`,
    })
  }
}

/* ── Drawing helpers ─────────────────────────────────────────────────── */

function paintGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  alpha: number,
): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** Wrap, clamp, and draw `**bold**`-run text (`./text-runs.ts`): fragments
 *  paint left-to-right with the font switching per run and x advancing by
 *  the measured fragment width — the same metric the wrap used, so painted
 *  lines can't overrun the width they were wrapped to. */
function paintRichText(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: {
    x: number
    y: number
    maxWidth: number
    maxLines: number
    lineHeight: number
    normalFont: string
    boldFont: string
  },
): void {
  const measure = (t: string, bold: boolean): number => {
    ctx.font = bold ? opts.boldFont : opts.normalFont
    return ctx.measureText(t).width
  }
  const lines = clampRichLines(
    wrapRichText(text, opts.maxWidth, measure),
    opts.maxLines,
    opts.maxWidth,
    measure,
  )
  let y = opts.y
  for (const line of lines) {
    let x = opts.x
    for (const frag of line) {
      ctx.font = frag.bold ? opts.boldFont : opts.normalFont
      ctx.fillText(frag.text, x, y)
      x += ctx.measureText(frag.text).width
    }
    y += opts.lineHeight
  }
}

/** Greedy word wrap honoring explicit newlines (paragraph breaks). */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate
      } else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  // Drop trailing empties from blank paragraphs.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function clampLines(
  lines: string[],
  max: number,
  ctx: CanvasRenderingContext2D,
  maxWidth: number,
): string[] {
  if (lines.length <= max) return lines
  const kept = lines.slice(0, max)
  const last = kept[max - 1] ?? ''
  kept[max - 1] = ellipsize(ctx, `${last}…`, maxWidth)
  return kept
}

function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1)
  }
  return `${t.trimEnd()}…`
}

/** Rounded, cover-cropped square thumbnail with a hairline border — the
 *  user's attached image on question turns. Cover (not letterbox): the
 *  thumbnail's job is "this is what they asked about", not a faithful
 *  reproduction the full image would need. */
function drawCoverThumb(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
): void {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return
  const scale = Math.max(size / iw, size / ih)
  const sw = size / scale
  const sh = size / scale
  ctx.save()
  roundRect(ctx, x, y, size, size, 12)
  ctx.clip()
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, size, size)
  ctx.restore()
  ctx.strokeStyle = 'rgba(15, 20, 32, 0.12)'
  ctx.lineWidth = 1
  roundRect(ctx, x, y, size, size, 12)
  ctx.stroke()
}

/* ── Asset rasterization ─────────────────────────────────────────────── */

/** Five-point star, filled — replaces `★`/`🏆` text glyphs, which render
 *  as tofu boxes on platforms without symbol/emoji fonts. */
function paintStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.save()
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const radius = i % 2 === 0 ? r : r * 0.45
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

const glyphCache = new Map<string, HTMLImageElement | null>()

/** Rasterize a provider's monochrome glyph (the same @lobehub component the
 *  UI uses), tinted to ink. Nullable by design: a badge with a missing
 *  glyph is degraded, a thrown render is a broken feature. */
async function glyphImage(
  provider: ProviderId,
  size: number,
): Promise<HTMLImageElement | null> {
  const key = `${provider}@${size}`
  const hit = glyphCache.get(key)
  if (hit !== undefined) return hit
  let img: HTMLImageElement | null = null
  try {
    // The map is `satisfies Record<ProviderId, unknown>` at the source (the
    // @lobehub compound-component types are awkward); the glyph roots are
    // all size-taking components, asserted once here.
    const Glyph = PROVIDER_GLYPHS[provider] as ComponentType<{
      size?: number
    }>
    const markup = renderToStaticMarkup(createElement(Glyph, { size }))
    const svg = markup
      .match(/<svg[\s\S]*<\/svg>/)?.[0]
      // Standalone SVG has no CSS cascade: force the ink tint both ways —
      // `currentColor` fills resolve through the root `color` attribute,
      // and literal `currentColor` strings get replaced outright.
      ?.replace('<svg', `<svg color="${INK_SOFT}"`)
      .replace(/currentColor/g, INK_SOFT)
    if (svg) {
      img = await tryLoadImage(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      )
    }
  } catch {
    img = null
  }
  glyphCache.set(key, img)
  return img
}

/** Provider badge: a neutral disc + the mono glyph — deterministic on any
 *  platform (the branded Avatars lose their CSS backgrounds when
 *  rasterized standalone; OpenAI's white mark vanished on the white card).
 *  Falls back to the provider's initial letter if the glyph won't load. */
async function drawProviderBadge(
  ctx: CanvasRenderingContext2D,
  provider: ProviderId,
  x: number,
  y: number,
  size: number,
): Promise<void> {
  const r = size / 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2)
  ctx.fillStyle = '#F3F4F6'
  ctx.fill()
  ctx.strokeStyle = '#E2E5EA'
  ctx.lineWidth = 1
  ctx.stroke()
  const glyph = await glyphImage(provider, Math.round(size * 0.62))
  if (glyph) {
    const g = size * 0.62
    ctx.drawImage(glyph, x + (size - g) / 2, y + (size - g) / 2, g, g)
  } else {
    ctx.font = `700 ${Math.round(size * 0.5)}px ${FONT}`
    ctx.fillStyle = INK_SOFT
    const letter = provider.charAt(0).toUpperCase()
    const lw = ctx.measureText(letter).width
    ctx.fillText(letter, x + r - lw / 2, y + r + 0.5)
  }
  ctx.restore()
}

async function tryLoadImage(src: string): Promise<HTMLImageElement | null> {
  try {
    const img = new Image()
    img.src = src
    // Race the decode against a short timeout: a decorative asset (brand
    // logo, provider glyph) must never wedge the whole card render if a
    // decode stalls. A timed-out asset degrades to its fallback (initials
    // badge / no logo), same as a decode error.
    await Promise.race([
      img.decode(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('decode timeout')), 3000),
      ),
    ])
    return img
  } catch {
    return null
  }
}
