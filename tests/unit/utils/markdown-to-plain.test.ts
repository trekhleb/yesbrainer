import { describe, expect, it } from 'vitest'
import { markdownToPlain } from '@/utils/markdown-to-plain'

describe('markdownToPlain', () => {
  it('strips code fences and unwraps inline code', () => {
    const out = markdownToPlain('before\n```js\nconst x = 1\n```\nafter')
    expect(out).not.toContain('const x')
    expect(out).not.toContain('```')
    expect(out).toMatch(/^before\b/)
    expect(out).toMatch(/\bafter$/)
    expect(markdownToPlain('use `npm test` here')).toBe('use npm test here')
  })

  it('drops images entirely but keeps link text', () => {
    expect(markdownToPlain('![alt](https://x/y.png) and [docs](https://d)')).toBe(
      'and docs',
    )
  })

  it('unwraps headings, quotes, and emphasis', () => {
    expect(markdownToPlain('## Verdict\n> quoted\n**bold** and *italic*')).toBe(
      'Verdict\nquoted\nbold and italic',
    )
  })

  it('normalizes list markers to bullets', () => {
    expect(markdownToPlain('- one\n* two\n3. three')).toBe(
      '• one\n• two\n• three',
    )
  })

  it('keeps snake_case identifiers (single underscore survives)', () => {
    expect(markdownToPlain('call snake_case_name here')).toBe(
      'call snake_case_name here',
    )
  })

  it('collapses paragraph breaks to single newlines and squeezes spaces', () => {
    expect(markdownToPlain('a\n\n\nb   c\t d')).toBe('a\nb c d')
  })
})

describe('markdownToPlain — keepBold', () => {
  it('keeps **bold** runs and demotes headings to bold lines', () => {
    expect(
      markdownToPlain('## Verdict\nUse **Postgres**, not *MySQL*.', {
        keepBold: true,
      }),
    ).toBe('**Verdict**\nUse **Postgres**, not MySQL.')
  })

  it('normalizes __bold__ to ** and still strips everything else', () => {
    expect(
      markdownToPlain('__strong__ with `code`, [docs](https://d), ~~gone~~', {
        keepBold: true,
      }),
    ).toBe('**strong** with code, docs, gone')
  })

  it('keeps list bullets working next to bold markers', () => {
    expect(
      markdownToPlain('- **Coverage:** wide\n- plain item', {
        keepBold: true,
      }),
    ).toBe('• **Coverage:** wide\n• plain item')
  })
})
