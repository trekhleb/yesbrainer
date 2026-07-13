/**
 * The returning user's frontpage: `/` with keys configured and a sidebar
 * full of councils of every type (the seeded inventory). Covers the shell
 * chrome around the chat — the sidebar council cards (structure pills +
 * roster logos), the per-row kebab menu, and the collapsed desktop rail /
 * mobile drawer variants.
 */

import { expect, test } from '@playwright/test'
import { SEEDED_STATE, composerInput } from './helpers'

test.use({ storageState: SEEDED_STATE })

test('frontpage: lands on the most recent council', async ({ page }) => {
  await page.goto('/')
  await composerInput(page).waitFor()
  // Opening a council auto-scrolls to the latest turn; pull the thread back
  // to its start so the shot reads as "the conversation, from the top".
  await page
    .getByText('Should our five-person startup build the product')
    .scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('frontpage.png')
})

test('sidebar: full council inventory', async ({ page, isMobile }) => {
  await page.goto('/')
  await composerInput(page).waitFor()
  if (isMobile) {
    // On phones the council list lives in a drawer behind the hamburger.
    await page.getByRole('button', { name: 'Open sidebar' }).click()
    await expect(
      page.getByText('Naming the meeting-notes feature'),
    ).toBeVisible()
    await expect(page).toHaveScreenshot('sidebar-inventory.png')
  } else {
    await expect(page.locator('aside')).toHaveScreenshot(
      'sidebar-inventory.png',
    )
  }
})

test('sidebar: kebab menu with token footer', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered by the drawer variant on desktop')
  await page.goto('/')
  await composerInput(page).waitFor()
  // The kebab is the link's sibling inside the card wrapper — climb one up.
  const row = page
    .getByRole('link', {
      name: 'Monolith vs microservices for a five-person team',
    })
    .locator('xpath=..')
  await row.hover()
  await row.getByRole('button', { name: 'More actions' }).click()
  await expect(page.getByText('Rename')).toBeVisible()
  await expect(page).toHaveScreenshot('sidebar-kebab-menu.png')
})

test('sidebar: collapsed rail', async ({ page, isMobile }) => {
  test.skip(isMobile, 'no rail on phones — the drawer covers collapse')
  await page.goto('/')
  await composerInput(page).waitFor()
  await page.getByRole('button', { name: 'Close sidebar' }).click()
  await expect(
    page.getByRole('button', { name: 'Open sidebar' }),
  ).toBeVisible()
  await expect(page).toHaveScreenshot('sidebar-collapsed-rail.png')
})
