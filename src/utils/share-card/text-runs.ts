/**
 * Bold-run text layout for the share-card painter (`./paint.ts`).
 *
 * Card excerpts arrive as plain text with one concession kept by
 * `markdownToPlain({ keepBold: true })`: `**bold**` runs (headings arrive
 * as bold lines). Canvas has no rich text, so the painter needs the string
 * split into style runs, wrapped with per-run measurement (bold glyphs are
 * wider), and clamped with an ellipsis. Everything here is pure —
 * measurement is injected (`RunMeasurer`), so the layout is testable
 * without a canvas; the painter backs it with `ctx.measureText` under the
 * matching font.
 */

export interface BoldRun {
  text: string
  bold: boolean
}

/** One laid-out line: fragments drawn left-to-right, spaces included, and
 *  adjacent same-style fragments merged (an all-plain line is exactly one
 *  fragment — one `fillText`). */
export type RichLine = BoldRun[]

/** Width of `text` when drawn in the run's style. */
export type RunMeasurer = (text: string, bold: boolean) => number

/** `**` is a toggle, scoped to one paragraph — a stray unpaired marker can
 *  bold at most its own line, and marker-free text round-trips verbatim. */
export function parseBoldRuns(paragraph: string): BoldRun[] {
  const runs: BoldRun[] = []
  let bold = false
  for (const piece of paragraph.split('**')) {
    if (piece) runs.push({ text: piece, bold })
    bold = !bold
  }
  return runs
}

/**
 * Greedy word wrap over style runs, honoring explicit newlines — the
 * rich-text sibling of the painter's plain `wrapText` (identical wrapping
 * decisions when nothing is bold). A word that changes style mid-way
 * (`**bold**tail`) wraps as one unit; a separator space inherits the style
 * of the fragment before it, so a bold phrase merges into one fragment.
 */
export function wrapRichText(
  text: string,
  maxWidth: number,
  measure: RunMeasurer,
): RichLine[] {
  const lines: RichLine[] = []
  for (const paragraph of text.split('\n')) {
    // Words as fragment lists — style can flip inside one word.
    const chunks: BoldRun[][] = []
    let chunk: BoldRun[] = []
    for (const run of parseBoldRuns(paragraph)) {
      for (const part of run.text.split(/(\s+)/)) {
        if (!part) continue
        if (/\s/.test(part)) {
          if (chunk.length > 0) chunks.push(chunk)
          chunk = []
        } else {
          chunk.push({ text: part, bold: run.bold })
        }
      }
    }
    if (chunk.length > 0) chunks.push(chunk)

    const chunkWidth = (c: BoldRun[]) =>
      c.reduce((w, f) => w + measure(f.text, f.bold), 0)

    let line: RichLine = []
    let lineWidth = 0
    for (const c of chunks) {
      const w = chunkWidth(c)
      const sepBold = line.at(-1)?.bold ?? false
      const sepWidth = line.length > 0 ? measure(' ', sepBold) : 0
      if (line.length === 0 || lineWidth + sepWidth + w <= maxWidth) {
        if (line.length > 0) line.push({ text: ' ', bold: sepBold })
        line.push(...c.map((f) => ({ ...f })))
        lineWidth += sepWidth + w
      } else {
        lines.push(mergeRuns(line))
        line = c.map((f) => ({ ...f }))
        lineWidth = w
      }
    }
    lines.push(mergeRuns(line))
  }
  // Drop trailing empties from blank paragraphs.
  while (lines.length > 0 && lines.at(-1)?.length === 0) lines.pop()
  return lines
}

/** `clampLines` for rich lines: past `max`, the last kept line is trimmed
 *  from its end until it fits with a trailing ellipsis, which inherits the
 *  style of the fragment it lands on. */
export function clampRichLines(
  lines: RichLine[],
  max: number,
  maxWidth: number,
  measure: RunMeasurer,
): RichLine[] {
  if (lines.length <= max) return lines
  const kept = lines.slice(0, max)
  const last: RichLine = (kept[max - 1] ?? []).map((f) => ({ ...f }))
  const width = (l: RichLine) =>
    l.reduce((w, f) => w + measure(f.text, f.bold), 0)
  const fitsWithEllipsis = () =>
    width(last) + measure('…', last.at(-1)?.bold ?? false) <= maxWidth
  while (last.length > 0 && !fitsWithEllipsis()) {
    const tail = last.at(-1)
    if (tail && tail.text.length > 1) tail.text = tail.text.slice(0, -1)
    else last.pop()
  }
  const tail = last.at(-1)
  if (tail) tail.text = `${tail.text.trimEnd()}…`
  else last.push({ text: '…', bold: false })
  kept[max - 1] = last
  return kept
}

function mergeRuns(line: RichLine): RichLine {
  const merged: RichLine = []
  for (const frag of line) {
    const last = merged.at(-1)
    if (last && last.bold === frag.bold) last.text += frag.text
    else merged.push({ ...frag })
  }
  return merged
}
