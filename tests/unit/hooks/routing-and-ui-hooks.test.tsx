import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  ABOUT_PATH,
  councilPath,
  useAppRoute,
} from '@/hooks/use-app-route'
import { useNewCouncilDeepLink } from '@/hooks/use-new-council-deep-link'
import { useSidebarCollapse } from '@/hooks/use-sidebar-collapse'

function atRoute(route: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('councilPath', () => {
  it('encodes the id into the canonical path', () => {
    expect(councilPath('a b/c')).toBe('/council/a%20b%2Fc')
    expect(ABOUT_PATH).toBe('/about')
  })
})

describe('useAppRoute', () => {
  it('reads the active council id from /council/:id', () => {
    const { result } = renderHook(() => useAppRoute(), {
      wrapper: atRoute('/council/abc'),
    })
    expect(result.current.councilId).toBe('abc')
    expect(result.current.aboutOpen).toBe(false)
    expect(result.current.settingsOpen).toBe(false)
  })

  it('flags about + settings routes and the settings tab', () => {
    const about = renderHook(() => useAppRoute(), { wrapper: atRoute('/about') })
    expect(about.result.current.aboutOpen).toBe(true)

    const settings = renderHook(() => useAppRoute(), {
      wrapper: atRoute('/settings/keys'),
    })
    expect(settings.result.current.settingsOpen).toBe(true)
    expect(settings.result.current.settingsTab).toBe('keys')
  })
})

describe('useNewCouncilDeepLink', () => {
  it('opens via the query param and closes it', () => {
    const { result } = renderHook(() => useNewCouncilDeepLink(), {
      wrapper: atRoute('/'),
    })
    expect(result.current.open).toBe(false)
    act(() => result.current.openModal())
    expect(result.current.open).toBe(true)
    act(() => result.current.closeModal())
    expect(result.current.open).toBe(false)
  })

  it('reads an already-present param as open', () => {
    const { result } = renderHook(() => useNewCouncilDeepLink(), {
      wrapper: atRoute('/?new-council=1'),
    })
    expect(result.current.open).toBe(true)
  })
})

describe('useSidebarCollapse', () => {
  it('desktop reads + writes the persisted preference on toggle', () => {
    // jsdom matchMedia stub reports desktop (matches:false).
    const { result } = renderHook(() => useSidebarCollapse())
    expect(result.current.collapsed).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(true)
    expect(localStorage.getItem('yesbrainer:sidebar-collapsed')).toBe('1')
    act(() => result.current.toggle())
    expect(localStorage.getItem('yesbrainer:sidebar-collapsed')).toBe('0')
  })

  it('initialises collapsed from a stored desktop preference', () => {
    localStorage.setItem('yesbrainer:sidebar-collapsed', '1')
    const { result } = renderHook(() => useSidebarCollapse())
    expect(result.current.collapsed).toBe(true)
  })
})
