/**
 * Markdown prose inventory — one themed, element-scoped shot per element
 * family the chat renderer supports (react-markdown + remark-gfm +
 * remark-math + Shiki + rehype-sanitize + rehype-katex): typography, lists,
 * table/quote/rule/footnote, code, images, math. Browse these baselines to
 * judge how council prose actually reads; a diff here means the renderer or
 * `.md-content` CSS changed.
 *
 * The fixture council is spec-local (`fixtures/markdown-council.ts`),
 * imported at runtime through the app's own Settings → Storage restore
 * path — adding it to the shared seed bundle would put a sixth row in
 * the sidebar of every full-page baseline in the suite. Every screenshot
 * here is scoped to one answer's `.md-content` node, so the import stays
 * invisible to other specs.
 */

import { expect, test, type Page } from '@playwright/test'
import {
  buildMarkdownBundle,
  MARKDOWN_COUNCIL_ID,
} from './fixtures/markdown-council'
import { gotoCouncil, SEEDED_STATE } from './helpers'

test.use({ storageState: SEEDED_STATE })

test.beforeEach(async ({ page }) => {
  // Import the spec-local bundle through the real restore path, same as
  // seed.setup.ts — schema drift fails loudly here, not as a blank shot.
  await page.goto('/settings/storage')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'markdown-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(buildMarkdownBundle())),
  })
  const report = page.getByText(/Imported/)
  await expect(report).toContainText('Imported 1')
  await expect(report).toContainText('0 errors')
  await gotoCouncil(page, MARKDOWN_COUNCIL_ID)
  // Floating chrome overlaps prose at scroll-dependent offsets, which
  // makes element shots flaky: the composer dock (frosted island + its
  // bottom scrim gradient in council-view) fades the tail of whatever
  // turn sits behind it, and sticky pane headers cover the first line of
  // a scrolled turn. This spec inventories prose, not chrome — hide the
  // whole dock (after `gotoCouncil` waited on the composer input) and pin
  // anything sticky back into the flow.
  await page.evaluate(() => {
    let dock: HTMLElement | null = document.querySelector('form:has(textarea)')
    while (dock && getComputedStyle(dock).position === 'static') {
      dock = dock.parentElement
    }
    if (dock) dock.style.visibility = 'hidden'
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      if (getComputedStyle(el).position === 'sticky') {
        el.style.position = 'static'
      }
    }
  })
})

/** Turn N's rendered answer. Only assistant output uses `.md-content`
 *  (user messages don't), so nth(i) = the single seat's answer to turn i. */
function prose(page: Page, turnIdx: number) {
  return page.locator('.md-content').nth(turnIdx)
}

test('typography: headings and inline emphasis', async ({ page }) => {
  await expect(prose(page, 0)).toHaveScreenshot('md-typography.png')
})

test('lists: nested, ordered, task', async ({ page }) => {
  await expect(prose(page, 1)).toHaveScreenshot('md-lists.png')
})

test('table, blockquote, rule, footnote', async ({ page }) => {
  await expect(prose(page, 2)).toHaveScreenshot('md-table-quote.png')
})

test('code: shiki fences and inline', async ({ page }) => {
  // Never race the highlighter: Shiki decorates fences with `pre.shiki`.
  await page.locator('pre.shiki').first().waitFor()
  await expect(prose(page, 3)).toHaveScreenshot('md-code.png')
})

test('images: small and pane-constrained wide', async ({ page }) => {
  const images = prose(page, 4).locator('img')
  await expect(images).toHaveCount(2)
  for (const img of await images.all()) {
    await expect(img).toHaveJSProperty('complete', true)
  }
  await expect(prose(page, 4)).toHaveScreenshot('md-images.png')
})

test('math: inline and display KaTeX', async ({ page }) => {
  // Never race KaTeX (rendered math carries `.katex`) or its web fonts —
  // an unloaded KaTeX_* font renders glyphs in a fallback face and the
  // baseline goes flaky. Both the block (`.katex-display`) and inline forms
  // must be present before the shot.
  await prose(page, 5).locator('.katex-display .katex').first().waitFor()

  // Real math still renders, pinned functionally (the screenshot needs the
  // canonical runner to judge; these hold anywhere): 3 display blocks
  // (`$$` fence ×2, `\[…\]` ×1) and 3 inline spans (`$$…$$` ×1, `\(…\)`
  // ×2). KaTeX nests a `.katex` inside each `.katex-display`, so 6 total.
  await expect(prose(page, 5).locator('.katex-display')).toHaveCount(3)
  await expect(prose(page, 5).locator('.katex')).toHaveCount(6)
  const inlinePara = prose(page, 5).locator('p', { hasText: 'mass–energy' })
  await expect(inlinePara.locator('.katex')).toHaveCount(2)

  // …while prices stay prose — single-`$` math is off (the
  // currency-fusion bug). If `$…$` parsing regressed, the dollars would be
  // eaten as delimiters: the literals below would vanish and the money
  // paragraph would grow a `.katex` node.
  const moneyPara = prose(page, 5).locator('p', {
    hasText: 'Currency is never math',
  })
  await expect(moneyPara).toContainText('charge $99/month')
  await expect(moneyPara).toContainText('$1k MRR')
  await expect(moneyPara.locator('.katex')).toHaveCount(0)

  // The adversarial mix: one sentence carrying real inline math AND two
  // prices. The math renders; the dollars around it stay literal.
  const mixedPara = prose(page, 5).locator('p', { hasText: 'break-even' })
  await expect(mixedPara.locator('.katex')).toHaveCount(1)
  await expect(mixedPara).toContainText('$49/month')
  await expect(mixedPara).toContainText('$2k MRR')

  await page.evaluate(() => document.fonts.ready)
  await expect(prose(page, 5)).toHaveScreenshot('md-math.png')
})
