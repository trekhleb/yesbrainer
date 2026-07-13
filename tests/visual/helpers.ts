/**
 * Shared setup for the visual suite. The app is serverless + BYOK, so a
 * fresh browser profile lands on the first-run onboarding gate; these
 * helpers seed it into a usable state without any network traffic.
 *
 * Two seeding layers:
 *  - `seedFakeKeys` puts fake BYOK keys into localStorage. Cloud-key
 *    reachability is optimistic (no validation call until a real send),
 *    so fake keys unlock seats, pickers, and composer controls offline.
 *  - The council inventory comes from `seed.setup.ts`, which imports the
 *    fixture bundle once through the app's own validated import path and
 *    saves the browser state (localStorage + IndexedDB) to
 *    `SEEDED_STATE`; seeded specs opt in via
 *    `test.use({ storageState: SEEDED_STATE })`.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locator, Page } from '@playwright/test'
import type { FixtureImages } from './fixtures/bundle'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Saved browser state (fake keys + imported fixture councils). Written by
 *  `seed.setup.ts`; gitignored — regenerated on every run. */
export const SEEDED_STATE = path.join(here, '.state', 'seeded.json')

/** Fresh-profile state for specs inside a seeded file that need the
 *  first-run experience back (e.g. the dark-mode onboarding shot). */
export const FRESH_STATE = { cookies: [], origins: [] }

export async function seedFakeKeys(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'yesbrainer:keys',
      JSON.stringify({
        anthropic: 'sk-ant-visual-test-not-a-real-key',
        openai: 'sk-proj-visual-test-not-a-real-key',
        google: 'AIza-visual-test-not-a-real-key',
        groq: 'gsk_visual-test-not-a-real-key',
      }),
    )
  })
}

export function composerInput(page: Page): Locator {
  return page.getByPlaceholder('Ask your council…')
}

/** The floating composer card (the <form> wrapping the input + actions). */
export function composerForm(page: Page): Locator {
  return page.locator('form', { has: composerInput(page) })
}

/** Open a fixture council and wait for the thread to be interactive. */
export async function gotoCouncil(page: Page, id: string): Promise<void> {
  await page.goto(`/council/${id}`)
  await composerInput(page).waitFor()
}

/**
 * Pin `navigator.storage` so the Settings → Storage tab renders the same
 * everywhere: the real `estimate()` reports machine-dependent quota/usage
 * and `persisted()` depends on the browser's heuristics — both would make
 * the screenshot diff on every run.
 */
export async function stubStorageEstimate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fake: Partial<StorageManager> = {
      estimate: () =>
        Promise.resolve({
          usage: 3_400_000,
          quota: 96_000_000_000,
        } as StorageEstimate),
      persisted: () => Promise.resolve(true),
      persist: () => Promise.resolve(true),
    }
    Object.defineProperty(navigator, 'storage', { value: fake })
  })
}

/**
 * Draw the two "user attachment" images in-page (canvas → WebP data URI):
 * a portfolio-allocation bar chart and a YTD statement table. Rendered
 * in-browser so the encoder matches what the composer's attach pipeline
 * would produce; the drawings are static so the URIs are deterministic
 * per platform.
 */
export async function drawFixtureImages(page: Page): Promise<FixtureImages> {
  return page.evaluate(() => {
    function canvas(w: number, h: number) {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      return { c, ctx }
    }

    // --- Portfolio allocation bar chart -------------------------------
    const chart = canvas(880, 520)
    {
      const ctx = chart.ctx
      ctx.fillStyle = '#15171c'
      ctx.font = 'bold 26px system-ui, sans-serif'
      ctx.fillText('Brokerage allocation — June 2026', 40, 56)
      ctx.font = '15px system-ui, sans-serif'
      ctx.fillStyle = '#6b7280'
      ctx.fillText('Total value: $412,300', 40, 84)

      const rows: [string, number, string][] = [
        ['US large-cap index', 25, '#4f6df5'],
        ['Tech position A (NVDA)', 20, '#7c5cf0'],
        ['Tech position B (MSFT)', 15, '#2fa4a8'],
        ['International index', 22, '#e8a13c'],
        ['Bond fund', 12, '#9aa3b2'],
        ['Cash', 6, '#c9cfd9'],
      ]
      let y = 130
      for (const [label, pct, color] of rows) {
        ctx.fillStyle = '#15171c'
        ctx.font = '16px system-ui, sans-serif'
        ctx.fillText(label, 40, y + 17)
        ctx.fillStyle = '#eef0f4'
        ctx.fillRect(280, y, 480, 26)
        ctx.fillStyle = color
        ctx.fillRect(280, y, (480 * pct) / 25, 26)
        ctx.fillStyle = '#15171c'
        ctx.font = 'bold 15px system-ui, sans-serif'
        ctx.fillText(`${pct}%`, 280 + 480 + 16, y + 18)
        y += 58
      }
    }

    // --- YTD statement table ------------------------------------------
    const stmt = canvas(880, 470)
    {
      const ctx = stmt.ctx
      ctx.fillStyle = '#15171c'
      ctx.font = 'bold 26px system-ui, sans-serif'
      ctx.fillText('Year-to-date summary', 40, 56)

      const rows: [string, string][] = [
        ['Dividends received', '$4,180'],
        ['Realized gains', '$9,120'],
        ['Unrealized gains', '$61,450'],
        ['Contributions', '$18,000'],
        ['Margin balance', '$0'],
        ['Cash available', '$24,700'],
      ]
      let y = 110
      for (const [label, value] of rows) {
        ctx.strokeStyle = '#e2e5ea'
        ctx.beginPath()
        ctx.moveTo(40, y + 26)
        ctx.lineTo(840, y + 26)
        ctx.stroke()
        ctx.fillStyle = '#3c4250'
        ctx.font = '17px system-ui, sans-serif'
        ctx.fillText(label, 40, y + 12)
        ctx.fillStyle = '#15171c'
        ctx.font = 'bold 17px system-ui, sans-serif'
        const w = ctx.measureText(value).width
        ctx.fillText(value, 840 - w, y + 12)
        y += 54
      }
    }

    return {
      chart: chart.c.toDataURL('image/webp', 0.9),
      statement: stmt.c.toDataURL('image/webp', 0.9),
    }
  })
}
