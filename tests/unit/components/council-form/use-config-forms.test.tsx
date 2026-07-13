import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useConfigForms } from '@/components/council-form/use-config-forms'
import type { SeatConfigFormHandle } from '@/components/seat-config/seat-config-form'

describe('useConfigForms', () => {
  it('toggles expand + ever-expanded and fires the onToggle callback', () => {
    const onToggle = vi.fn()
    const { result } = renderHook(() => useConfigForms({ onToggle }))
    expect(result.current.expandedKeys.has('s1')).toBe(false)

    act(() => result.current.toggleConfig('s1'))
    expect(onToggle).toHaveBeenCalledWith('s1')
    expect(result.current.expandedKeys.has('s1')).toBe(true)
    expect(result.current.everExpanded.has('s1')).toBe(true)

    act(() => result.current.toggleConfig('s1'))
    expect(result.current.expandedKeys.has('s1')).toBe(false)
    // ever-expanded stays true (mount-on-first-expand).
    expect(result.current.everExpanded.has('s1')).toBe(true)
  })

  it('builtConfig reads a registered handle, or falls back when never mounted', () => {
    const { result } = renderHook(() => useConfigForms())
    const handle: SeatConfigFormHandle = {
      buildConfig: () => ({ temperature: 0.9 }),
    }
    act(() => result.current.registerForm('judge')(handle))
    expect(result.current.builtConfig('judge')).toEqual({ temperature: 0.9 })
    // A never-registered key returns the fallback.
    expect(result.current.builtConfig('mediator', { tools: false })).toEqual({
      tools: false,
    })
    expect(result.current.builtConfig('mediator')).toEqual({})
  })
})
