/**
 * Markdown → plain text: strip structure, keep words. Built for surfaces
 * that must render model output as bare text (the share-card excerpts;
 * anywhere a miniature markdown reproduction would be worse than clean
 * typography). Single `_` survives on purpose (snake_case identifiers in
 * dev-flavored verdicts); paragraph breaks collapse to single newlines,
 * which line-wrapping consumers treat as forced breaks.
 *
 * `keepBold` keeps exactly one piece of structure: `**bold**` runs
 * (`__bold__` normalized to the same marker, headings demoted to bold
 * lines). For consumers with a bold-capable renderer but no full markdown
 * — the share-card canvas painter, via `share-card/text-runs.ts`.
 */

// Parks bold markers out of the emphasis-stripper's reach; model text
// can't contain a NUL, so the round-trip is collision-free.
const BOLD_SENTINEL = '\u0000'

export function markdownToPlain(
  md: string,
  { keepBold = false }: { keepBold?: boolean } = {},
): string {
  let out = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  out = keepBold
    ? out
        .replace(/^#{1,6}\s+(.+)$/gm, '**$1**')
        .replace(/\*\*|__/g, BOLD_SENTINEL)
    : out.replace(/^#{1,6}\s+/gm, '')
  out = out
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '• ')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*|__|~~|\*/g, '')
    .replace(/\$\$/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]+/g, ' ')
  if (keepBold) out = out.replaceAll(BOLD_SENTINEL, '**')
  return out.trim()
}
