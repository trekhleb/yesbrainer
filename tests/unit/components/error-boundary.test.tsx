import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '@/components/error-boundary'

function Bomb(): never {
  throw new Error('render exploded with Bearer abc.def-ghi_jkl012')
}

describe('ErrorBoundary', () => {
  it('catches render errors and shows redacted details on screen', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(container.textContent).toContain('render exploded')
    expect(container.textContent).not.toContain('abc.def-ghi_jkl012')
    expect(container.textContent).toContain('[redacted]')
    // The boundary's own console line is redacted (SECURITY.md contract).
    // React's dev-mode logger also reports the raw error here — in the
    // app that channel is routed through `logRedactedError` via the
    // createRoot onCaughtError/onUncaughtError options (main.tsx); RTL
    // mounts its own root, so it's out of scope for this assertion.
    const ownLine = consoleError.mock.calls
      .map((c) => c.join(' '))
      .find((line) => line.includes('[ErrorBoundary]'))
    expect(ownLine).toBeDefined()
    expect(ownLine).toContain('[redacted]')
    expect(ownLine).not.toContain('abc.def-ghi_jkl012')
  })

  it('copies the redacted details from the fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const { container } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    const copy = Array.from(container.querySelectorAll('button')).find((b) =>
      /copy/i.test(b.textContent ?? ''),
    )
    expect(copy).toBeDefined()
    fireEvent.click(copy!)
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText.mock.calls[0]?.[0]).toContain('[redacted]')
    expect(writeText.mock.calls[0]?.[0]).not.toContain('abc.def-ghi_jkl012')
  })

  it('surfaces unhandled rejections and window errors from outside render', async () => {
    const { container } = render(
      <ErrorBoundary>
        <div>healthy</div>
      </ErrorBoundary>,
    )
    expect(container.textContent).toContain('healthy')
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'ResizeObserver loop completed with undelivered notifications.',
      }),
    )
    // Benign browser notification — ignored by design.
    expect(container.textContent).toContain('healthy')

    const rejection = new Event('unhandledrejection') as Event & {
      reason: unknown
    }
    rejection.reason = new Error('async escaped')
    window.dispatchEvent(rejection)
    await waitFor(() =>
      expect(container.textContent).toContain('async escaped'),
    )
  })

  it('surfaces a real window error event', async () => {
    const { container } = render(
      <ErrorBoundary>
        <div>healthy</div>
      </ErrorBoundary>,
    )
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'boom outside render',
        error: new Error('boom outside render'),
      }),
    )
    await waitFor(() =>
      expect(container.textContent).toContain('boom outside render'),
    )
  })

})
