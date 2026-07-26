/**
 * The standalone document routes: `<ProsePage>` (the shared shell) and the
 * two pages built on it, `/private` and `/vs/:slug`.
 *
 * What's worth asserting here is what a *crawler and a first-time visitor*
 * depend on and no other test covers: exactly one `<h1>`, a `document.title`
 * that is restored on unmount (a stale prose title stuck on a council tab is
 * a real regression), an unknown comparison slug falling back to an index
 * rather than a blank page, and the copy-rule obligations these pages carry —
 * the AI-output caveat and the key-handling duties — actually being on the
 * page rather than assumed.
 */

import { describe, expect, it } from 'vitest'
import { COMPARISON_HUB, COMPARISONS } from '@/models/comparisons'
import { ComparisonIndexPage } from '@/components/comparison-index-page'
import { ComparisonPage } from '@/components/comparison-page'
import { PrivatePage } from '@/components/private-page'
import { ProsePage } from '@/components/prose-page'
import { renderUi } from '../helpers/render'

describe('ProsePage', () => {
  it('renders the title as the page’s only h1, plus the lede', () => {
    const { container } = renderUi(
      <ProsePage title="A title" documentTitle="Doc title" lede="A lede">
        <p>body</p>
      </ProsePage>,
    )
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]?.textContent).toBe('A title')
    expect(container.textContent).toContain('A lede')
    expect(container.textContent).toContain('body')
  })

  it('sets document.title while mounted and restores it on unmount', () => {
    document.title = 'Previous'
    const { unmount } = renderUi(
      <ProsePage title="A title" documentTitle="Doc title">
        <p>body</p>
      </ProsePage>,
    )
    expect(document.title).toBe('Doc title')
    unmount()
    expect(document.title).toBe('Previous')
  })

  it('omits the lede paragraph when none is given', () => {
    const { container } = renderUi(
      <ProsePage title="A title" documentTitle="Doc title">
        <p>only body</p>
      </ProsePage>,
    )
    expect(container.textContent).toContain('only body')
  })
})

describe('PrivatePage', () => {
  it('names the user’s key-handling duties where the claim is made', () => {
    const { container } = renderUi(<PrivatePage />)
    const copy = container.textContent ?? ''
    // The official-domain check and the spend-capped, revocable key are
    // obligations the copy rules require wherever keys are discussed.
    expect(copy).toContain('yesbrainer.ai')
    expect(copy).toMatch(/spending limit/i)
    expect(copy).toMatch(/revocable|revoke/i)
  })

  it('states what the architecture does NOT do, rather than only its wins', () => {
    const { container } = renderUi(<PrivatePage />)
    const copy = container.textContent ?? ''
    expect(copy).toMatch(/does not do/i)
    expect(copy).toMatch(/as-is, with no warranty/i)
  })

  it('carries the AI-output caveat', () => {
    const { container } = renderUi(<PrivatePage />)
    expect(container.textContent).toMatch(/can be confidently wrong/i)
  })

  // README carves OpenRouter out of the "direct to the provider" claim
  // ("One honest caveat"), and SECURITY.md lists its proxying under what the
  // app can't protect against. A page that repeats the unqualified claim
  // while naming OpenRouter as a supported provider contradicts both.
  it('does not claim traffic is direct when it names OpenRouter as a provider', () => {
    const { container } = renderUi(<PrivatePage />)
    const copy = container.textContent ?? ''
    expect(copy).toContain('OpenRouter')
    expect(copy).toMatch(/OpenRouter’s gateway|OpenRouter's gateway/)
    expect(copy).not.toMatch(/straight to the model providers/)
  })

  // The copy rules require describing the disclosed counter exactly — an
  // understatement ("one pageview ping") is the failure mode they exist for.
  it('describes the analytics counter as SECURITY.md does, not as a pageview ping', () => {
    const { container } = renderUi(<PrivatePage />)
    const copy = container.textContent ?? ''
    expect(copy).toMatch(/route pattern/i)
    expect(copy).toMatch(/feature-level actions/i)
    expect(copy).toMatch(/not what was in it/i)
    expect(copy).not.toMatch(/one cookieless pageview ping/i)
  })

  it('lists where each kind of data lives', () => {
    const { container } = renderUi(<PrivatePage />)
    const copy = container.textContent ?? ''
    expect(copy).toContain('API keys')
    expect(copy).toContain('Conversations')
    expect(copy).toContain('IndexedDB')
  })
})

describe('ComparisonIndexPage (the /vs hub)', () => {
  it('explains the three categories rather than just listing links', () => {
    const { container } = renderUi(<ComparisonIndexPage />)
    const copy = container.textContent ?? ''
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    // The whole reason this page exists instead of a bare index: real prose
    // per category, not five hrefs.
    for (const c of COMPARISON_HUB.categories) {
      expect(copy).toContain(c.name)
      expect(copy).toContain(c.body)
    }
    expect(copy).toContain(COMPARISON_HUB.position)
  })

  it('links to every head-to-head page', () => {
    const { container } = renderUi(<ComparisonIndexPage />)
    const hrefs = [...container.querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    )
    for (const c of COMPARISONS) expect(hrefs).toContain(`/vs/${c.slug}`)
  })

  it('discloses that we made one of the things being compared', () => {
    const { container } = renderUi(<ComparisonIndexPage />)
    expect(container.textContent).toContain(COMPARISON_HUB.closing)
    expect(container.textContent).toMatch(/can be confidently wrong/i)
  })
})

describe('ComparisonPage', () => {
  const first = COMPARISONS[0]!

  it('renders a known slug with the other product’s strengths first', () => {
    const { container } = renderUi(<ComparisonPage slug={first.slug} />)
    const copy = container.textContent ?? ''
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(copy).toContain(first.heading)
    expect(copy).toContain(`What ${first.name} does well`)
    // Every strength has to actually reach the page — the fairness rule in
    // comparisons.ts is only real if it renders.
    for (const strength of first.strengths) expect(copy).toContain(strength)
  })

  it('gives an honest "pick theirs" alongside "pick ours"', () => {
    const { container } = renderUi(<ComparisonPage slug={first.slug} />)
    const copy = container.textContent ?? ''
    expect(copy).toContain(first.pickTheirs)
    expect(copy).toContain(first.pickOurs)
  })

  it('links out to the other product with rel="nofollow"', () => {
    const { container } = renderUi(<ComparisonPage slug={first.slug} />)
    const outbound = container.querySelector(`a[href="${first.url}"]`)
    expect(outbound?.getAttribute('rel')).toContain('nofollow')
  })

  it('falls back to the hub for an unknown slug instead of a blank page', () => {
    const { container } = renderUi(<ComparisonPage slug="no-such-product" />)
    const copy = container.textContent ?? ''
    expect(copy).toContain(COMPARISON_HUB.heading)
    for (const c of COMPARISONS) expect(copy).toContain(c.name)
  })

  it('links up to the hub, so the cluster is navigable in both directions', () => {
    const { container } = renderUi(<ComparisonPage slug={first.slug} />)
    const hrefs = [...container.querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).toContain('/vs')
  })

  it('cross-links every other comparison, and never itself', () => {
    const { container } = renderUi(<ComparisonPage slug={first.slug} />)
    const hrefs = [...container.querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).not.toContain(`/vs/${first.slug}`)
    for (const c of COMPARISONS.slice(1)) {
      expect(hrefs).toContain(`/vs/${c.slug}`)
    }
  })

  it('is what /vs renders too, so the hub and the fallback cannot drift', () => {
    const viaFallback = renderUi(<ComparisonPage slug="nope" />)
    const fallbackCopy = viaFallback.container.textContent ?? ''
    viaFallback.unmount()
    const { container } = renderUi(<ComparisonIndexPage />)
    expect(container.textContent).toBe(fallbackCopy)
  })

  it('carries the AI-output caveat on every comparison', () => {
    for (const c of COMPARISONS) {
      const { container, unmount } = renderUi(<ComparisonPage slug={c.slug} />)
      expect(container.textContent).toMatch(/can be confidently wrong/i)
      unmount()
    }
  })
})
