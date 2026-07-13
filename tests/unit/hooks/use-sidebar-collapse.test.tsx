import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSidebarCollapse } from '@/hooks/use-sidebar-collapse'

const KEY = 'yesbrainer:sidebar-collapsed'

// The shared setup stubs matchMedia to `matches: false` → desktop, where
// toggles persist the collapse preference.
describe('useSidebarCollapse (desktop)', () => {
  it('toggle flips and persists the collapse preference', () => {
    const { result } = renderHook(() => useSidebarCollapse())
    expect(result.current.collapsed).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(true)
    expect(localStorage.getItem(KEY)).toBe('1')
    act(() => result.current.toggle())
    expect(localStorage.getItem(KEY)).toBe('0')
  })

  it('close() collapses and persists on desktop', () => {
    const { result } = renderHook(() => useSidebarCollapse())
    act(() => result.current.close())
    expect(result.current.collapsed).toBe(true)
    expect(localStorage.getItem(KEY)).toBe('1')
  })
})
