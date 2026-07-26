/**
 * `slugify` exists twice on purpose: once in TypeScript for the running app
 * (`src/utils/slug.ts`), once in plain JS for the build-time prerender
 * (`scripts/seo-routes.mjs`), because a `.mjs` build script can't import a
 * `.ts` module.
 *
 * That duplication is the thing worth testing. If the two drift, the build
 * emits `dist/demo/<slug>.html` at a URL the app resolves to nothing — a page
 * that ranks, gets clicked, and then renders the wrong thing. The parity
 * check below runs the *real* demo-council titles through both, so the case
 * that actually ships is the case under test.
 */

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { slugify } from '@/utils/slug'
import { slugify as slugifyMjs } from '../../../scripts/slugify.mjs'

// `import.meta.url` isn't a file URL under the jsdom environment, so resolve
// from the working directory instead — vitest runs from the project root.
const DEMO_DIR = resolve('src/data/demo-councils')

/** Every seeded demo council title, read the way the seeder reads them. */
function demoTitles(): string[] {
  return readdirSync(DEMO_DIR)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      const parsed: unknown = JSON.parse(
        readFileSync(`${DEMO_DIR}/${f}`, 'utf8'),
      )
      const envelope = parsed as { councils?: unknown[] }
      const councils = Array.isArray(envelope.councils)
        ? envelope.councils
        : [parsed]
      return councils.map((c) => (c as { title?: string }).title ?? '')
    })
    .filter((t) => t !== '')
}

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Best Seat for Golden Gate View')).toBe(
      'best-seat-for-golden-gate-view',
    )
  })

  it('collapses punctuation, including the curly kind titles use', () => {
    expect(slugify('Name This App: Nobody Said “Yes-Brainer”')).toBe(
      'name-this-app-nobody-said-yes-brainer',
    )
  })

  it('strips diacritics rather than dropping the letter', () => {
    expect(slugify('Café or Tea?')).toBe('cafe-or-tea')
  })

  it('never leaves a leading or trailing hyphen', () => {
    expect(slugify('  — hello — ')).toBe('hello')
    // A title long enough for the length cap to land mid-separator: the
    // slice must not leave the slug ending in "-".
    expect(slugify(`${'a'.repeat(79)} tail`)).not.toMatch(/-$/)
  })

  it('returns an empty slug for input with nothing sluggable', () => {
    expect(slugify('—')).toBe('')
  })
})

describe('slugify parity between the app and the prerender script', () => {
  it.each(demoTitles())('matches for the shipped demo title %j', (title) => {
    expect(slugifyMjs(title)).toBe(slugify(title))
  })

  it.each([
    'Best Seat for Golden Gate View',
    'Name This App: Nobody Said “Yes-Brainer”',
    'Café or Tea?',
    '  — hello — ',
    '—',
    `${'a'.repeat(79)} tail`,
    'Ünïcödé — 100% “edge” cases!',
  ])('matches for the edge case %j', (title) => {
    expect(slugifyMjs(title)).toBe(slugify(title))
  })
})
