/**
 * The shareable `/about` explainer — same `<AboutContent>` the first-run
 * gate renders, but as a standalone chromeless route. Four scroll
 * positions: the hero, the three social-structure cards, the
 * "Why it's different" differentiators grid, and the colophon (license
 * line, site links with About in its "you are here" state, repo links, ©).
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

test('about page: colophon', async ({ page }) => {
  await page.goto('/about')
  // The demo list inside the get-started card arrives after boot-time
  // seeding and grows the page above the colophon; scrolling before it
  // lands leaves the target below the fold once it does.
  await expect(page.getByText('See it in action')).toBeVisible()
  const copyright = page.getByText('Oleksii Trekhleb')
  await copyright.scrollIntoViewIfNeeded()
  await expect(copyright).toBeInViewport()
  await expect(page).toHaveScreenshot('about-colophon.png')
})
