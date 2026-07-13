import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import { getShikiHighlighter } from '@/utils/shiki-highlighter'
import { normalizeMathDelimiters } from '@/utils/normalize-math-delimiters'

/**
 * Safe markdown renderer for assistant output.
 *
 * Pipeline: `remark-gfm` (tables, strikethrough, task lists, autolinks)
 * + `remark-math` (parse `$$…$$` math — single-`$` inline is **off**, see
 * below) → `rehypeShiki`
 * (syntax-highlight fenced code blocks using a pre-bundled sync Shiki
 * highlighter) → `rehypeSanitize` with an extended schema that allows
 * Shiki's `class` / `style` / `tabindex` on `<pre>` / `<code>` / `<span>`
 * plus the remark-math wrapper classes → `rehypeKatex` (render the math).
 *
 * **Why KaTeX runs *after* sanitize** (the load-bearing security choice):
 * sanitize scrubs the raw math as plain *text*, then KaTeX — trusted code,
 * `trust:false` by default so no `\href`/HTML injection — builds a fixed,
 * script-free DOM from that clean text. The alternative (KaTeX before
 * sanitize) would force us to allowlist KaTeX's hundreds of MathML tags &
 * inline styles through sanitize, widening the very surface this file
 * guards. So sanitize only has to preserve the tiny `math`/`math-inline`/
 * `math-display` wrapper classes for KaTeX to find its targets. KaTeX's
 * fonts self-host (bundled by Vite), satisfying the CSP `font-src 'self'`.
 *
 * LLMs disagree on math delimiters, so `normalizeMathDelimiters` rewrites
 * GPT-style `\(…\)` / `\[…\]` into `$$` before parsing (code spans are
 * protected). Sanitize stays the safety net so we never trust
 * upstream-plugin output blindly — we only whitelist what Shiki + math need.
 *
 * **Single-`$` math is disabled** (`singleDollarTextMath: false`): council
 * prose is full of *prices*, and remark-math pairs any two `$` in a
 * paragraph — "Charge $99/month … to hit $1k MRR" fused into one italic
 * math span with the spaces eaten (earlier bug). Currency is far more
 * common here than inline TeX, so the `$…$` convention loses; inline math
 * still renders via `\(…\)` (normalized) or `$$…$$` mid-paragraph, and
 * display via `$$` / `\[…\]` blocks. ChatGPT's own renderer makes the same
 * trade for the same reason.
 *
 * Dual themes (`github-light` + `github-dark`) — Shiki emits both
 * colors as CSS variables on each token. `index.css` flips between
 * them on the `html[data-theme='dark']` selector, so a theme toggle
 * is purely CSS — no re-tokenisation.
 */

// Sanitize schema that allows Shiki's output through.
//
// ⚠ Why allowing `style` on span/pre is safe here — and what must never
// change: this pipeline has **no `rehype-raw`**, so raw HTML inside model
// output is never parsed into elements (react-markdown drops it). The only
// `<span>`/`<pre>` nodes that exist by sanitize time are the ones *Shiki
// itself* created for fenced code — a model cannot author a styled element.
// If anyone ever adds `rehype-raw`, this allowlist becomes a real injection
// surface (arbitrary attacker-controlled inline CSS) and must be removed
// first. Defense-in-depth even then: CSP `img-src` blocks `url()` beacons
// inside CSS values, and browsers ignore `javascript:` in CSS.
//
// **Why `'class'` (lowercase) and not `'className'`:** `@shikijs/rehype`
// writes properties to the hast tree using the raw HTML attribute name
// (`class`, `tabindex`) rather than the camelCase form (`className`,
// `tabIndex`) that hast-util-sanitize's default whitelist matches
// against. So we have to allow the lowercase variants explicitly, or
// the class disappears and the dual-theme CSS selectors never match.
const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    pre: ['style', 'tabindex', 'class'],
    // `class` (lowercase) is Shiki's token styling. The `className` tuples are
    // the remark-math wrappers — `mdast-util-math` emits inline math as
    // `<code class="language-math math-inline">` and block math on `span`/`div`
    // (`math-display`). These are the *only* class values sanitize lets through,
    // so the post-sanitize rehype-katex can locate its targets while model text
    // still can't smuggle arbitrary classes past sanitize. rehype-katex then
    // replaces these nodes entirely with its (trusted) KaTeX output.
    code: [
      'class',
      ['className', 'language-math', 'math', 'math-inline', 'math-display'],
    ],
    span: ['style', 'class', ['className', 'math', 'math-inline', 'math-display']],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ['className', 'math', 'math-inline', 'math-display'],
    ],
  },
}

export interface MarkdownProps {
  children: string
}

// Wrapped in `memo` because react-markdown has **no internal parse cache** —
// its component body re-runs `processor.parse` + `runSync` (remark → Shiki →
// sanitize → KaTeX) on *every* render. During a stream the whole thread
// re-renders per flush, so without this every settled message would re-parse
// its full content on every token of every seat. The only prop is `children`
// (a string), so React's default shallow compare is exactly right: a message
// re-parses only when its own text actually changes (i.e. the one growing
// streaming pane), never because a sibling streamed a token. Output depends
// solely on `children` — theme switching is CSS-only (dual-theme Shiki, see
// above) — so there is no hidden input the memo could wrongly skip.
export const Markdown = memo(function Markdown({ children }: MarkdownProps) {
  // Highlighter is a singleton, but the rehype plugin instance closes
  // over it — memoise the plugins array so we don't rebuild it on
  // every render.
  const plugins = useMemo(() => {
    const highlighter = getShikiHighlighter()
    return [
      [
        rehypeShikiFromHighlighter,
        highlighter,
        {
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        },
      ] as const,
      [rehypeSanitize, markdownSanitizeSchema] as const,
      // KaTeX runs *after* sanitize — see the file header for why. Errors
      // render in-place (error colour) instead of throwing, so one malformed
      // expression can't blank the whole message.
      [rehypeKatex, { throwOnError: false }] as const,
    ]
  }, [])

  // Rewrite GPT-style `\(…\)` / `\[…\]` into the `$$` remark-math parses.
  const source = useMemo(() => normalizeMathDelimiters(children), [children])

  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rehypePlugins={plugins as any}
        components={{
          // Model output is untrusted: links open in a new tab with the
          // opener severed (no window.opener reach-back) and no Referer.
          // The sanitize schema has already stripped unsafe protocols
          // (javascript: etc.) from href by this point.
          a: ({ children: linkChildren, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {linkChildren}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
})
