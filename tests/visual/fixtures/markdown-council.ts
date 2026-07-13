/**
 * Spec-local fixture for `13-markdown.spec.ts` — a single-seat "Parallel
 * of one" council whose six turns are a themed tour of every element
 * family the chat markdown renderer supports (react-markdown +
 * remark-gfm + remark-math + Shiki + rehype-sanitize + rehype-katex; see
 * `src/components/markdown.tsx`).
 *
 * Deliberately NOT part of the shared seed bundle (`bundle.ts`): a sixth
 * council there would add a sidebar row to every full-page baseline in
 * the suite. The markdown spec imports this bundle at runtime inside its
 * own browser context instead, so nothing outside that spec churns.
 *
 * One turn per element family so each `.md-content` node is one themed
 * screenshot: typography, lists, table/quote/rule, code, images, math. The
 * image turn uses same-origin `public/` assets — external URLs are dead
 * offline (and blocked by the CSP), and `data:` URIs are stripped from
 * markdown `src` by the sanitize schema. The math turn exercises every
 * *live* delimiter convention (`$$…$$` and GPT-style `\(…\)`/`\[…\]`, the
 * latter normalised by `normalizeMathDelimiters`), pins that dollar
 * *prices* stay prose (single-`$` math is disabled — the
 * currency-fusion bug), and confirms literal LaTeX inside a code fence is
 * left unrendered.
 */

import type { CouncilBundleV1 } from './bundle'

type Council = CouncilBundleV1['councils'][number]
type Turn = Council['turns'][number]

export const MARKDOWN_COUNCIL_ID = 'vf-markdown'

const T0 = Date.UTC(2026, 5, 28, 12, 0, 0)
const SEAT_ID = 'vf-md-s1'
const MODEL_ID = 'anthropic:claude-haiku-4-5'

function turn(idx: number, userMsg: string, output: string[]): Turn {
  return {
    id: `vf-md-turn${idx + 1}`,
    idx,
    userMsg,
    events: [
      {
        id: `vf-md-ev-${String(idx + 1).padStart(3, '0')}`,
        roleType: 'participant',
        seatId: SEAT_ID,
        modelId: MODEL_ID,
        output: output.join('\n'),
        ts: T0,
      },
    ],
    tokenTotal: { inputTokens: 0, outputTokens: 0 },
  }
}

export function buildMarkdownBundle(): CouncilBundleV1 {
  const council: Council = {
    id: MARKDOWN_COUNCIL_ID,
    title: 'Markdown rendering style guide',
    createdAt: T0,
    socialStructure: 'roundtable',
    seats: [{ id: SEAT_ID, modelId: MODEL_ID, config: {} }],
    turns: [
      turn(0, 'Show me every heading level and the inline emphasis styles.', [
        '# Heading one',
        '',
        'An opening paragraph under the page title: prose set at the base size, wrapping across a couple of lines so line-height and paragraph spacing are visible.',
        '',
        '## Heading two',
        '',
        '### Heading three',
        '',
        '#### Heading four',
        '',
        '##### Heading five',
        '',
        '###### Heading six',
        '',
        'Inline styles in one sentence: **bold**, *italic*, ***bold italic***, ~~strikethrough~~, and `inline code`. A [labelled link](https://example.com/docs) and a bare autolink https://example.com/pricing sit in the same line.',
        '',
        'Markdown has no underline, and raw HTML like <u>this</u> is dropped by the sanitizer — the text survives, the tag does not.',
      ]),
      turn(1, 'Now the list styles — nested, ordered, and task lists.', [
        'Unordered, three levels deep:',
        '',
        '- Fruit',
        '  - Citrus',
        '    - Blood orange',
        '    - Kumquat',
        '  - Stone fruit',
        '- Vegetables',
        '',
        'Ordered, with a nested sub-sequence:',
        '',
        '1. Preheat the oven',
        '2. Fold the batter',
        '   1. Dry ingredients first',
        '   2. Then the wet',
        '3. Bake for 25 minutes',
        '',
        'Task list (GFM):',
        '',
        '- [x] Ship the drag-drop fix',
        '- [x] Verify it end-to-end',
        '- [ ] Update the changelog',
      ]),
      turn(2, 'Tables, blockquotes, a horizontal rule, and a footnote.', [
        '| Model | Latency (p50) | Cost / 1M tok | Notes |',
        '|:------|:-------------:|--------------:|:------|',
        '| Haiku 4.5 | 320 ms | $1.00 | fastest |',
        '| Sonnet 5 | 610 ms | $3.00 | balanced |',
        '| Opus 4.8 | 990 ms | $15.00 | deepest |',
        '',
        'Column alignment above: left, center, right, left.',
        '',
        '> Blockquote: the council quotes its sources.',
        '>',
        '> > Nested quote: and sometimes the sources quote each other.',
        '',
        '---',
        '',
        'A paragraph after a horizontal rule, carrying a footnote reference[^1].',
        '',
        '[^1]: Footnotes come with GFM; this is where the note lands, at the end of the message.',
      ]),
      turn(3, 'Code: highlighted fences, a plain fence, and inline code.', [
        'Inline code mid-sentence: `Array.prototype.at(-1)` reads the last element.',
        '',
        'A highlighted TypeScript fence (Shiki, dual light/dark themes):',
        '',
        '```ts',
        'interface Vote {',
        '  label: string',
        '  scores: Record<string, 1 | 2 | 3 | 4 | 5>',
        '}',
        '',
        'export function tally(votes: Vote[]): Map<string, number> {',
        '  const totals = new Map<string, number>()',
        '  for (const { label, scores } of votes) {',
        '    const sum = Object.values(scores).reduce((a, b) => a + b, 0)',
        '    totals.set(label, (totals.get(label) ?? 0) + sum)',
        '  }',
        '  return totals // highest total wins the round',
        '}',
        '```',
        '',
        'Python for a second grammar:',
        '',
        '```python',
        'def median(xs: list[float]) -> float:',
        '    s = sorted(xs)',
        '    mid = len(s) // 2',
        '    return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2',
        '```',
        '',
        'And a fence with no language tag:',
        '',
        '```',
        '$ npm run test:visual',
        '11 specs, 2 form factors, 0 provider calls',
        '```',
      ]),
      turn(4, 'Finally, images — a small one and a wide one.', [
        // Small = actually small (96px): a large source would render at
        // pane width and push this turn past the viewport, where element
        // captures hit Chromium's unrasterized-grey-tile zone.
        'A small image at its natural size:',
        '',
        '![Yes-Brainer favicon](/favicon-96x96.png)',
        '',
        'A wide banner, constrained by the pane (`max-width: 100%`):',
        '',
        '![Yes-Brainer banner](/banner-v3-light.jpg)',
        '',
        'Images from markdown are sanitized like everything else — only safe `src` values survive.',
      ]),
      turn(5, 'Show me some formulas — inline and display, both delimiter styles.', [
        'Inline math flows with the prose: the mass–energy relation $$E = mc^2$$ and the Pythagorean identity \\(a^2 + b^2 = c^2\\) sit mid-sentence.',
        '',
        'Currency is never math: charge $99/month and you hit $1k MRR at ten customers — two prices in one sentence stay plain text.',
        '',
        // The adversarial mix — real inline math AND two prices in one
        // sentence. Under the old single-`$` parsing the prices would pair
        // into a bogus span; now the `\(…\)` renders and the dollars stay.
        'Math and money share a sentence safely: the break-even point \\(n = 42\\) sits where $49/month clears $2k MRR.',
        '',
        'A display equation, centered on its own line (`$$` delimiters):',
        '',
        '$$',
        '\\int_0^1 x^2 \\, dx = \\frac{1}{3}',
        '$$',
        '',
        'GPT-style `\\[ … \\]` display delimiters render identically:',
        '',
        '\\[',
        '3.563 \\text{ million km}^2 \\times 60{,}000 \\, \\frac{\\text{trees}}{\\text{km}^2} = 213.78 \\text{ billion trees}',
        '\\]',
        '',
        'A summation over a fraction, to exercise real KaTeX layout:',
        '',
        '$$',
        '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}',
        '$$',
        '',
        'Literal LaTeX inside a code fence stays literal — never rendered:',
        '',
        '```',
        '\\[ this is not math \\]',
        '```',
      ]),
    ],
    tokenTotal: { inputTokens: 0, outputTokens: 0 },
  }

  return { version: 1, exportedAt: T0, councils: [council] }
}
