import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/components/theme-provider'
import { useStyletron } from 'baseui'

function ThemeProbe() {
  const [, theme] = useStyletron()
  return <div data-testid="theme">{theme.name}</div>
}

function setMatchMedia(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: dark && query.includes('dark'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: () => false,
        onchange: null,
      }) as unknown as MediaQueryList,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('ThemeProvider', () => {
  it('follows the OS preference in system mode (default)', () => {
    setMatchMedia(true)
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(getByTestId('theme').textContent).toContain('dark')
  })

  it('honours a forced light override regardless of the OS', () => {
    setMatchMedia(true)
    localStorage.setItem(
      'yesbrainer:behavior',
      JSON.stringify({ themeMode: 'light' }),
    )
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(getByTestId('theme').textContent).not.toContain('dark')
  })
})
