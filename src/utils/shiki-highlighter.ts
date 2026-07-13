import { createHighlighterCoreSync, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

import githubLight from 'shiki/themes/github-light.mjs'
import githubDark from 'shiki/themes/github-dark.mjs'

import bash from 'shiki/langs/bash.mjs'
import css from 'shiki/langs/css.mjs'
import diff from 'shiki/langs/diff.mjs'
import go from 'shiki/langs/go.mjs'
import html from 'shiki/langs/html.mjs'
import javascript from 'shiki/langs/javascript.mjs'
import json from 'shiki/langs/json.mjs'
import markdown from 'shiki/langs/markdown.mjs'
import python from 'shiki/langs/python.mjs'
import rust from 'shiki/langs/rust.mjs'
import sql from 'shiki/langs/sql.mjs'
import tsx from 'shiki/langs/tsx.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import yaml from 'shiki/langs/yaml.mjs'

/**
 * Curated, pre-bundled Shiki highlighter for LLM-output code blocks.
 *
 * Why sync + bundled: `react-markdown` runs its rehype pipeline with
 * `unified.runSync` — the standard `@shikijs/rehype` plugin loads
 * languages lazily and returns a Promise, which would break the render
 * path. `createHighlighterCoreSync` + `engine-javascript` (no WASM)
 * eliminates both async and the WASM fetch.
 *
 * Why a curated language list: an LLM chat will see a long tail of
 * languages, but ~14 cover the vast majority of code in answers.
 * Unknown languages render as plain text (no highlighting, no error).
 * Add a language here when a real conversation needs it — keep the
 * bundle lean.
 *
 * Why dual themes (github-light + github-dark): shiki emits both
 * colors as CSS variables (`--shiki-light` / `--shiki-dark`), and the
 * global `index.css` rules under `html[data-theme='dark']` flip
 * between them. The theme switch is then a CSS-only operation — no
 * re-tokenisation, no React re-render.
 */
let cachedHighlighter: HighlighterCore | null = null

export function getShikiHighlighter(): HighlighterCore {
  if (cachedHighlighter) return cachedHighlighter
  cachedHighlighter = createHighlighterCoreSync({
    themes: [githubLight, githubDark],
    langs: [
      bash,
      css,
      diff,
      go,
      html,
      javascript,
      json,
      markdown,
      python,
      rust,
      sql,
      tsx,
      typescript,
      yaml,
    ],
    engine: createJavaScriptRegexEngine(),
  })
  return cachedHighlighter
}
