import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SidebarFooterLinks } from '@/components/sidebar/footer-links'
import { getBehaviorSettings } from '@/storage/behavior'
import { renderUi } from '../helpers/render'

describe('SidebarFooterLinks', () => {
  it('renders About + Source code and toggles the theme', () => {
    const { container } = renderUi(<SidebarFooterLinks onSelect={vi.fn()} />)
    expect(container.textContent).toContain('About')
    expect(container.textContent).toContain('Source code')
    const toggle = Array.from(container.querySelectorAll('button')).find((b) =>
      /switch to (light|dark) theme/i.test(b.getAttribute('aria-label') ?? ''),
    )!
    // Light theme (test default) → toggling writes the dark preference.
    fireEvent.click(toggle)
    expect(getBehaviorSettings().themeMode).toBe('dark')
  })

  it('fires onSelect on a plain About click, not on a modified one', () => {
    const onSelect = vi.fn()
    const { container } = renderUi(<SidebarFooterLinks onSelect={onSelect} />)
    const about = Array.from(container.querySelectorAll('a')).find((a) =>
      /about/i.test(a.textContent ?? ''),
    )!
    fireEvent.click(about, { metaKey: true })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(about)
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
