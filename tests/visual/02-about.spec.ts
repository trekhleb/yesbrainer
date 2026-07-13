/**
 * The shareable `/about` explainer — same `<AboutContent>` the first-run
 * gate renders, but as a standalone chromeless route. Three scroll
 * positions: the hero, the three social-structure cards, and the
 * "Why it's different" differentiators grid.
 */

import { expect, test } from '@playwright/test'

test('about page: hero', async ({ page }) => {
  await page.goto('/about')
  await expect(page.getByText("Why it's different")).toBeAttached()
  await expect(page).toHaveScreenshot('about-hero.png')
})

test('about page: structure cards', async ({ page }) => {
  await page.goto('/about')
  await page.getByText('Consensus debate').first().scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('about-structures.png')
})

test('about page: differentiators', async ({ page }) => {
  await page.goto('/about')
  await page.getByText("Why it's different").scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('about-differentiators.png')
})
