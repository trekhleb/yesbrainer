/**
 * Modal inventory: the New-council modal in all three structure
 * configurations (picker + roster + Judge/Mediator picker + the collapsed
 * per-structure settings panel), the expanded recipe + inline seat-config
 * form at creation, the council-settings modal (edit surface mirroring
 * creation), and the Rename / Delete dialogs.
 *
 * Shots capture the dialog *element*, not the full page: it crops out the
 * chat backdrop (which would otherwise diff on incidental scroll/highlight
 * state) and focuses the inventory on the modal itself.
 */

import { expect, test, type Page } from '@playwright/test'
import { COUNCIL_IDS } from './fixtures/bundle'
import { SEEDED_STATE, composerInput } from './helpers'

test.use({ storageState: SEEDED_STATE })

const dialog = (page: Page) => page.getByRole('dialog')

async function openNewCouncil(page: Page): Promise<void> {
  // Open over a VALID council route. On `/` the app auto-redirects to the
  // most-recent council, and that navigation strips the `?new-council`
  // query param and closes the modal; a council route doesn't redirect, so
  // the modal stays put. Then wait for the roster to finish seeding (its
  // first config toggle) so later interactions aren't racing that render.
  await page.goto(`/council/${COUNCIL_IDS.trial}?new-council=1`)
  await expect(dialog(page)).toBeVisible()
  await page.getByRole('button', { name: 'Create', exact: true }).waitFor()
  await page
    .getByRole('button', { name: 'Configure this model' })
    .first()
    .waitFor()
}

/** Pick a social structure. Force-click past the segmented control's
 *  mount animation (the sliding pill reports "not stable" indefinitely). */
async function pickStructure(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('option', { name }).click({ force: true })
}

/** Open a sidebar row's kebab menu (via the drawer on mobile). */
async function openRowMenu(
  page: Page,
  title: string,
  isMobile: boolean,
): Promise<void> {
  await page.goto('/')
  await composerInput(page).waitFor()
  if (isMobile) {
    await page.getByRole('button', { name: 'Open sidebar' }).click()
  }
  const row = page.getByRole('link', { name: title }).locator('xpath=..')
  await row.hover()
  await row.getByRole('button', { name: 'More actions' }).click()
}

test('new council: parallel answers', async ({ page }) => {
  await openNewCouncil(page)
  await pickStructure(page, /Parallel answers/)
  await expect(dialog(page)).toHaveScreenshot('modal-new-council-parallel.png')
})

test('new council: "Smartest available" preset seats one flagship per provider', async ({
  page,
}) => {
  await openNewCouncil(page)
  await pickStructure(page, /Parallel answers/)
  // The preset replaces the roster with the strongest model from each
  // reachable provider. Seed keys: Anthropic, OpenAI, Google, Groq (no
  // OpenRouter) → four seats, each provider's flagship.
  await page.getByRole('button', { name: 'Smartest available' }).click()
  const roster = dialog(page)
  await expect(roster.getByText('Claude Fable 5')).toBeVisible()
  // Loose match on the generation, not the variant: the preset seats
  // whichever GPT-5.6 tier the registry ranks highest (Sol today), so a
  // Luna/Sol/Terra reshuffle shouldn't fail this. Bump when the generation does.
  await expect(roster.getByText('GPT-5.6', { exact: false })).toBeVisible()
  await expect(roster.getByText('Gemini 3.1 Pro')).toBeVisible()
  // One seat per reachable provider (OpenRouter excluded) → four rows.
  await expect(
    page.getByRole('button', { name: 'Configure this model' }),
  ).toHaveCount(4)
})

test('new council: trial verdict', async ({ page }) => {
  await openNewCouncil(page)
  await pickStructure(page, /Trial verdict/)
  await expect(page.getByText('Judge').first()).toBeVisible()
  await expect(dialog(page)).toHaveScreenshot('modal-new-council-trial.png')
})

test('new council: consensus debate', async ({ page }) => {
  await openNewCouncil(page)
  await pickStructure(page, /Consensus debate/)
  await expect(page.getByText('Mediator').first()).toBeVisible()
  await expect(dialog(page)).toHaveScreenshot('modal-new-council-consensus.png')
})

test('new council: structure recipe expanded', async ({ page }) => {
  await openNewCouncil(page)
  await pickStructure(page, /Trial verdict/)
  // Let the Trial pick settle (2nd seat + Judge picker) before toggling the
  // recipe accordion; force past any residual re-render.
  await page.getByText('Judge').first().waitFor()
  await page
    .getByRole('button', { name: /Trial settings/ })
    .click({ force: true })
  await expect(page.getByText('rubric', { exact: false }).first())
    .toBeVisible()
  // Expanded, this modal exceeds the viewport and scrolls internally, so
  // Playwright's beyond-viewport capture stitches at whatever sub-pixel
  // scroll offset it's on — pin every scrollable region to the top for a
  // deterministic stitch, and allow a little slack for the seam.
  await dialog(page).evaluate((root) => {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = 0
    }
  })
  await expect(dialog(page)).toHaveScreenshot('modal-new-council-recipe.png', {
    maxDiffPixels: 400,
  })
})

test('new council: inline seat config', async ({ page }) => {
  await openNewCouncil(page)
  await page
    .getByRole('button', { name: 'Configure this model' })
    .first()
    .click({ force: true })
  await expect(page.getByText('System prompt', { exact: false }).first())
    .toBeVisible()
  await expect(dialog(page)).toHaveScreenshot('modal-new-council-seat-config.png')
})

test('council settings (from the composer trigger)', async ({ page }) => {
  // `/` lands on the most recent council (the Trial one), whose settings
  // modal shows the roster + Judge picker + recipe panel.
  await page.goto('/')
  await composerInput(page).waitFor()
  await page.getByRole('button', { name: /^Council settings/ }).click()
  await expect(dialog(page)).toBeVisible()
  await expect(
    page.getByText('Monolith vs microservices', { exact: false }).last(),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Configure this model' })
    .first()
    .waitFor()
  await expect(dialog(page)).toHaveScreenshot('modal-council-settings.png')
})

test('rename council', async ({ page, isMobile }) => {
  await openRowMenu(
    page,
    'Roth conversion timing for the 2026 tax year',
    isMobile,
  )
  await page.locator('[data-baseweb="popover"]').getByText('Rename').click()
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page)).toHaveScreenshot('modal-rename-council.png')
})

test('delete council', async ({ page, isMobile }) => {
  await openRowMenu(
    page,
    'Roth conversion timing for the 2026 tax year',
    isMobile,
  )
  await page.locator('[data-baseweb="popover"]').getByText('Delete').click()
  // The confirm modal is role="alertdialog", not "dialog".
  const confirm = page.getByRole('alertdialog')
  await expect(confirm.getByText('This cannot be undone.')).toBeVisible()
  await expect(confirm).toHaveScreenshot('modal-delete-council.png')
})
