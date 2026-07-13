/**
 * Normalise the LaTeX delimiters LLMs actually emit into the `$` / `$$`
 * forms `remark-math` understands.
 *
 * `remark-math` only parses `$`-delimited math, and this app runs it with
 * **`singleDollarTextMath: false`** (see `markdown.tsx`): council prose is
 * full of *prices*, and remark-math pairs any two `$` in a paragraph —
 * "Charge $99/month … to hit $1k MRR" fused into one garbled math span
 * (earlier bug). So `$$` is the only live delimiter, and both backslash
 * forms rewrite to it:
 *
 *   \[ … \]  →  $$ … $$   (display when the fence sits on its own lines)
 *   \( … \)  →  $$ … $$   (mid-paragraph `$$…$$` parses as *inline* math)
 *
 * A model that emits genuine single-`$` inline math now renders it as
 * literal text — the accepted trade (ChatGPT's renderer makes the same
 * call); GPT-style `\(…\)` and `$$…$$` keep real math rendering.
 *
 * Deliberately **not** handled: bare `[ … ]` / `( … )`. Those collide with
 * Markdown link syntax and ordinary prose, so treating them as math would
 * eat real content. If a model is found to emit truly bare-bracket math,
 * extend this with a heuristic gated on the block containing a `\command`.
 *
 * Code is protected: we split the source on fenced (``` / ~~~) and inline
 * (`` ` ``) code spans and only rewrite the prose segments, so a code block
 * *showing* literal `\[` stays literal. (Indented 4-space code blocks aren't
 * detected — models overwhelmingly fence their code, and math inside an
 * indented block is vanishingly rare.)
 */

// Captured group ⇒ code segments land on odd indices of the split result.
// Order matters: fenced blocks first (greedy-lazy to their own closer), then
// single-line inline code.
const CODE_SEGMENT =
  /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g

function rewriteProse(segment: string): string {
  // Both delimiter pairs → `$$` (single-`$` math is disabled, header above).
  // A function replacement sidesteps the `$$`-is-special rule in
  // String.replace patterns.
  return segment.replace(/\\\[|\\\]|\\\(|\\\)/g, () => '$$')
}

export function normalizeMathDelimiters(source: string): string {
  if (!source.includes('\\')) return source // fast path: no backslash, no work
  const parts = source.split(CODE_SEGMENT)
  for (let i = 0; i < parts.length; i += 2) {
    // Even indices are prose; odd indices are code spans left untouched.
    parts[i] = rewriteProse(parts[i]!)
  }
  return parts.join('')
}
