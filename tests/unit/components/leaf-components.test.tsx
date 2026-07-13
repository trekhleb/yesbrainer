import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Header } from '@/components/header'
import { UnofficialCopyNotice } from '@/components/unofficial-copy-notice'
import { AboutPage } from '@/components/about-page'
import { renderUi } from '../helpers/render'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('Header', () => {
  it('fires the toggle / settings / new-council callbacks', () => {
    const onToggleSidebar = vi.fn()
    const onOpenSettings = vi.fn()
    const onNewCouncil = vi.fn()
    const { container } = renderUi(
      <Header
        sidebarCollapsed
        activeNav="councils"
        onToggleSidebar={onToggleSidebar}
        onOpenSettings={onOpenSettings}
        onNewCouncil={onNewCouncil}
      />,
    )
    const byLabel = (re: RegExp) =>
      Array.from(container.querySelectorAll('button')).find((b) =>
        re.test(
          `${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''} ${b.textContent ?? ''}`,
        ),
      )
    fireEvent.click(byLabel(/settings/i)!)
    expect(onOpenSettings).toHaveBeenCalled()
    fireEvent.click(byLabel(/new|create/i)!)
    expect(onNewCouncil).toHaveBeenCalled()
  })
})

describe('UnofficialCopyNotice', () => {
  function setHost(hostname: string) {
    vi.stubGlobal('location', { ...window.location, hostname })
  }

  it('renders nothing on the official host', () => {
    setHost('yesbrainer.ai')
    const { container } = renderUi(<UnofficialCopyNotice />)
    expect(container.textContent).toBe('')
  })

  it('warns on a lookalike host and dismisses to sessionStorage', () => {
    setHost('yesbrainer.evil.example')
    const { container } = renderUi(<UnofficialCopyNotice />)
    expect(container.textContent).toMatch(/yesbrainer\.ai/)
    const dismiss = container.querySelector('button')
    fireEvent.click(dismiss!)
    expect(container.textContent).toBe('')
    expect(
      sessionStorage.getItem('yesbrainer:unofficial-notice-dismissed'),
    ).toBe('1')
  })

  it('stays hidden when already dismissed this session', () => {
    setHost('yesbrainer.evil.example')
    sessionStorage.setItem('yesbrainer:unofficial-notice-dismissed', '1')
    const { container } = renderUi(<UnofficialCopyNotice />)
    expect(container.textContent).toBe('')
  })
})

describe('AboutPage', () => {
  it('renders the shared explainer content', () => {
    const { container } = renderUi(<AboutPage demos={[]} />)
    expect(container.textContent?.length).toBeGreaterThan(100)
  })
})
