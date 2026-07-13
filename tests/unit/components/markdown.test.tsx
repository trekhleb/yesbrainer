import { describe, expect, it } from 'vitest'
import { Markdown } from '@/components/markdown'
import { renderUi } from '../helpers/render'

/**
 * The adversarial contract for model output (SECURITY.md): raw HTML never
 * parses into elements, unsafe protocols are stripped, and every link
 * opens with the opener severed. These are the automated versions of the
 * manual verification.
 */
describe('<Markdown> — hostile output', () => {
  it('drops raw HTML instead of parsing it (no rehype-raw, ever)', () => {
    const { container } = renderUi(
      <Markdown>{'before <script>alert(1)</script> <iframe src="https://evil"></iframe> after'}</Markdown>,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.textContent).toContain('before')
    expect(container.textContent).toContain('after')
  })

  it('strips javascript: and data:text/html hrefs; keeps safe links guarded', () => {
    const { container } = renderUi(
      <Markdown>
        {'[bad](javascript:alert(1)) [worse](data:text/html,<script>1</script>) [ok](https://example.com)'}
      </Markdown>,
    )
    const links = Array.from(container.querySelectorAll('a'))
    expect(links).toHaveLength(3)
    expect(links[0]?.getAttribute('href')).toBeNull()
    expect(links[1]?.getAttribute('href')).toBeNull()
    expect(links[2]?.getAttribute('href')).toBe('https://example.com')
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('strips event handlers a crafted image would carry', () => {
    const { container } = renderUi(
      <Markdown>{'<img src="x" onerror="alert(1)">\n\n![legit](https://cdn.example/x.png)'}</Markdown>,
    )
    for (const img of Array.from(container.querySelectorAll('img'))) {
      expect(img.getAttribute('onerror')).toBeNull()
    }
  })
})

describe('<Markdown> — rendering', () => {
  it('highlights fenced code through Shiki inside the sanitize allowlist', () => {
    const { container } = renderUi(
      <Markdown>{'```js\nconst x = 1\n```'}</Markdown>,
    )
    const pre = container.querySelector('pre')
    expect(pre?.className).toContain('shiki')
    expect(pre?.textContent).toContain('const x = 1')
  })

  it('renders GFM tables', () => {
    const { container } = renderUi(
      <Markdown>{'| a | b |\n| - | - |\n| 1 | 2 |'}</Markdown>,
    )
    expect(container.querySelector('table')).not.toBeNull()
  })

  it('renders $$ math via KaTeX after sanitize', () => {
    const { container } = renderUi(<Markdown>{'$$x^2$$'}</Markdown>)
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('normalizes GPT-style \\(…\\) delimiters, but not inside code spans', () => {
    const { container } = renderUi(
      <Markdown>{'inline \\(y^2\\) and `keep \\(literal\\)`'}</Markdown>,
    )
    expect(container.querySelector('.katex')).not.toBeNull()
    expect(container.querySelector('code')?.textContent).toContain(
      '\\(literal\\)',
    )
  })

  it('never fuses prices — single-$ math is off', () => {
    const { container } = renderUi(
      <Markdown>{'Charge $99/month to hit $1k MRR.'}</Markdown>,
    )
    expect(container.querySelector('.katex')).toBeNull()
    expect(container.textContent).toContain('$99/month')
    expect(container.textContent).toContain('$1k MRR')
  })
})
