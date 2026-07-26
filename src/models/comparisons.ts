/**
 * Head-to-head comparison content for the `/vs/:slug` routes.
 *
 * **Editorial rule for this content, non-negotiable.** These pages exist
 * because people search for alternatives, not because comparison pages are a
 * good place to win an argument. So: state what each product *does* and what
 * Yes-Brainer *does*, name the real strengths of the other side first, and
 * never characterise another product as unsafe, careless or dishonest — a
 * hosted product holding conversations server-side is a normal design with
 * real benefits (sync, sharing, no key management), not a flaw. Differences
 * are mechanisms, not verdicts; `pickTheirs` must stay a genuine
 * recommendation, not a straw man.
 *
 * Anything factual is a snapshot and will age. Keep claims coarse enough to
 * stay true (structures, deployment shape, licence) and avoid specifics that
 * churn (exact model counts, prices, tiers) — those belong on the other
 * product's own site, which each page links to.
 *
 * Slugs are URL-visible and permanent-ish; renaming one breaks an indexed
 * page.
 *
 * **The content lives in `comparisons.json`, not here.** The same prose has
 * to reach two consumers — this module for the live app, and
 * `scripts/prerender.mjs` for the static copy a non-JS crawler receives — so
 * there is exactly one copy of it and both read that. The assignment below is
 * typed, so a JSON file that drifts from `Comparison` fails `npm run
 * typecheck` rather than shipping.
 */

import data from './comparisons.json'
import hub from './comparison-hub.json'

export type Comparison = {
  /** URL slug: `/vs/<slug>`. */
  slug: string
  /** The other product's name, as it writes it. */
  name: string
  /** The other product's own site. */
  url: string
  /** `<h1>` on the page. */
  heading: string
  /** `document.title` + the prerendered `<title>`. */
  documentTitle: string
  /** Meta description for the prerendered copy. */
  description: string
  /** One-paragraph standfirst. */
  lede: string
  /** What the other product genuinely does well. Written to be fair. */
  strengths: string[]
  /** Mechanism-level differences. Never phrased as a score. */
  differences: { aspect: string; theirs: string; ours: string }[]
  /** When the other product is the better pick. Must be honest. */
  pickTheirs: string
  /** When Yes-Brainer is the better pick. */
  pickOurs: string
}

export const COMPARISONS: Comparison[] = data

export function comparisonBySlug(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug)
}

/**
 * The `/vs` hub — the category-level view the per-product pages hang off.
 *
 * It exists because a bare index of five links is a thin page with no reason
 * to be indexed; a page that actually explains the three ways to run several
 * models on one question does. Same editorial rule as the entries above:
 * each category's genuine advantage is stated before the trade-off, and the
 * closing paragraph names our own conflict of interest rather than leaving
 * the reader to notice it.
 */
export type ComparisonHub = {
  heading: string
  documentTitle: string
  description: string
  lede: string
  categories: { name: string; examples: string; body: string }[]
  /** Where Yes-Brainer sits, and what the closest contenders own. */
  position: string
  /** Snapshot caveat + the disclosure that we made one of the things compared. */
  closing: string
  /** Split so both renderers can wrap `linkText` in a link to the issue tracker. */
  invitation: { before: string; linkText: string; after: string }
  /** The point-of-consumption caveat on model output. */
  note: string
}

export const COMPARISON_HUB: ComparisonHub = hub
