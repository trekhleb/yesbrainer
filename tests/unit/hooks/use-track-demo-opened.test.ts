import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { analytics } from '@/analytics'
import { useTrackDemoOpened } from '@/hooks/use-track-demo-opened'
import type { CouncilSummary } from '@/storage/councils'

function summary(id: string, isDemo: boolean): CouncilSummary {
  return {
    id,
    title: id,
    createdAt: 0,
    socialStructure: 'roundtable',
    modelIds: [],
    tokenTotal: { inputTokens: 0, outputTokens: 0 },
    ...(isDemo ? { isDemo } : {}),
  }
}

const DEMO = summary('demo-1', true)
const DEMO2 = summary('demo-2', true)
const REAL = summary('real-1', false)
const LIST = [DEMO, DEMO2, REAL]

function harness(activeId: string | null, councils: CouncilSummary[]) {
  return renderHook(
    (p: { activeId: string | null; councils: CouncilSummary[] }) =>
      useTrackDemoOpened(p.activeId, p.councils),
    { initialProps: { activeId, councils } },
  )
}

describe('useTrackDemoOpened', () => {
  // restoreMocks: true restores spies before every test — create per test.
  let eventSpy: MockInstance
  beforeEach(() => {
    eventSpy = vi.spyOn(analytics, 'event')
  })

  it('counts entering a demo; never counts real councils', () => {
    const { rerender } = harness('real-1', LIST)
    expect(eventSpy).not.toHaveBeenCalled()
    rerender({ activeId: 'demo-1', councils: LIST })
    expect(eventSpy).toHaveBeenCalledExactlyOnceWith('demo-opened')
  })

  it('does not re-fire on re-renders or list refreshes', () => {
    const { rerender } = harness('demo-1', LIST)
    rerender({ activeId: 'demo-1', councils: LIST })
    rerender({ activeId: 'demo-1', councils: [...LIST] }) // fresh identity
    expect(eventSpy).toHaveBeenCalledTimes(1)
  })

  it('counts each fresh entry — via another council or a non-council page', () => {
    const { rerender } = harness('demo-1', LIST)
    rerender({ activeId: 'real-1', councils: LIST })
    rerender({ activeId: 'demo-1', councils: LIST }) // back via a real council
    rerender({ activeId: null, councils: LIST }) // e.g. /about
    rerender({ activeId: 'demo-1', councils: LIST }) // back again
    rerender({ activeId: 'demo-2', councils: LIST }) // a different demo
    expect(eventSpy).toHaveBeenCalledTimes(4)
  })

  it('waits for the list on a direct demo-URL load, then counts once', () => {
    const { rerender } = harness('demo-1', [])
    expect(eventSpy).not.toHaveBeenCalled() // unclassifiable yet — deferred
    rerender({ activeId: 'demo-1', councils: LIST })
    expect(eventSpy).toHaveBeenCalledExactlyOnceWith('demo-opened')
    rerender({ activeId: 'demo-1', councils: [...LIST] })
    expect(eventSpy).toHaveBeenCalledTimes(1)
  })
})
