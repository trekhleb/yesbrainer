import { describe, expect, it } from 'vitest'
import {
  clampRichLines,
  parseBoldRuns,
  wrapRichText,
  type RichLine,
} from '@/utils/share-card/text-runs'

// Style-independent width (1 unit per char) keeps expectations countable;
// the painter's real measurer varies by font, which the API injects.
const measure = (t: string) => t.length

const lineText = (line: RichLine) => line.map((f) => f.text).join('')

describe('parseBoldRuns', () => {
  it('toggles bold on ** and round-trips marker-free text', () => {
    expect(parseBoldRuns('a **b** c')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c', bold: false },
    ])
    expect(parseBoldRuns('no markers')).toEqual([
      { text: 'no markers', bold: false },
    ])
  })

  it('an unpaired marker bolds only the rest of its paragraph', () => {
    expect(parseBoldRuns('a **b')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
    ])
  })
})

describe('wrapRichText', () => {
  it('wraps like the plain wrapper and merges same-style fragments', () => {
    const lines = wrapRichText('aa bb cc dd', 5, measure)
    expect(lines.map(lineText)).toEqual(['aa bb', 'cc dd'])
    // All-plain lines collapse to a single fragment (one fillText each).
    expect(lines.every((l) => l.length === 1)).toBe(true)
  })

  it('honors forced newlines and drops trailing blank paragraphs', () => {
    expect(
      wrapRichText('one\ntwo\n', 100, measure).map(lineText),
    ).toEqual(['one', 'two'])
  })

  it('bold runs stay bold across wrapping, spaces inherit the run', () => {
    // Separator spaces take the style of the fragment before them, so the
    // bold phrase (and its trailing space) merges into one fragment.
    const lines = wrapRichText('x **big deal** y', 100, measure)
    expect(lines).toEqual([
      [
        { text: 'x ', bold: false },
        { text: 'big deal ', bold: true },
        { text: 'y', bold: false },
      ],
    ])
  })

  it('a mid-word style flip wraps as one unit', () => {
    // "**bold**tail" is one 8-char word; at width 8 it fits alone.
    const lines = wrapRichText('aaaa **bold**tail', 8, measure)
    expect(lines.map(lineText)).toEqual(['aaaa', 'boldtail'])
    expect(lines[1]).toEqual([
      { text: 'bold', bold: true },
      { text: 'tail', bold: false },
    ])
  })
})

describe('clampRichLines', () => {
  const wrap = (text: string, width: number) =>
    wrapRichText(text, width, measure)

  it('passes short texts through untouched', () => {
    const lines = wrap('aa bb', 100)
    expect(clampRichLines(lines, 3, 100, measure)).toBe(lines)
  })

  it('clamps to max lines and ellipsizes the last kept line to fit', () => {
    const lines = wrap('aaaa bbbb cccc dddd', 9)
    const clamped = clampRichLines(lines, 1, 9, measure)
    expect(clamped).toHaveLength(1)
    const text = lineText(clamped[0]!)
    expect(text.endsWith('…')).toBe(true)
    expect(measure(text)).toBeLessThanOrEqual(9)
  })

  it('the ellipsis inherits the style of the fragment it lands on', () => {
    const lines = wrap('**aaaa bbbb** cccc', 9)
    const clamped = clampRichLines(lines, 1, 9, measure)
    const tail = clamped[0]!.at(-1)
    expect(tail?.text.endsWith('…')).toBe(true)
    expect(tail?.bold).toBe(true)
  })
})
