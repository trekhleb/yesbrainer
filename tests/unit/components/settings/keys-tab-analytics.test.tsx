import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { useState } from 'react'
import { analytics } from '@/analytics'
import { KeysTab } from '@/components/settings/keys-tab'
import type { ApiKeys } from '@/storage/keys'
import { renderUi } from '../../helpers/render'

// restoreMocks: true restores spies before every test — create per test.
let eventSpy: MockInstance
beforeEach(() => {
  eventSpy = vi.spyOn(analytics, 'event')
})

function Harness({ initial = {} }: { initial?: ApiKeys }) {
  const [keys, setKeys] = useState<ApiKeys>(initial)
  return <KeysTab keys={keys} setKeys={(u) => setKeys(u)} />
}

function anthropicInput(container: HTMLElement): HTMLInputElement {
  return Array.from(container.querySelectorAll('input')).find(
    (i) => i.placeholder === 'sk-ant-...',
  )!
}

describe('KeysTab analytics', () => {
  it('counts key-added once per empty→non-empty edge, per provider', () => {
    const { container } = renderUi(<Harness />)
    const input = anthropicInput(container)
    fireEvent.change(input, { target: { value: 'sk-ant-test' } })
    // Further edits to a non-empty field are not new adds.
    fireEvent.change(input, { target: { value: 'sk-ant-test-longer' } })
    expect(eventSpy).toHaveBeenCalledExactlyOnceWith('key-added:anthropic')
  })

  it('clearing and re-pasting counts as a fresh add', () => {
    const { container } = renderUi(<Harness />)
    const input = anthropicInput(container)
    fireEvent.change(input, { target: { value: 'sk-ant-1' } })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.change(input, { target: { value: 'sk-ant-2' } })
    expect(eventSpy).toHaveBeenCalledTimes(2)
  })

  it('editing an already-saved key counts nothing', () => {
    const { container } = renderUi(
      <Harness initial={{ anthropic: 'sk-ant-existing' }} />,
    )
    fireEvent.change(anthropicInput(container), {
      target: { value: 'sk-ant-rotated' },
    })
    expect(eventSpy).not.toHaveBeenCalled()
  })

  it('counts ollama-enabled on the enable edge, not on disable', () => {
    const { container } = renderUi(<Harness />)
    const toggle = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement
    fireEvent.click(toggle) // off → on
    fireEvent.click(toggle) // on → off — no event
    expect(eventSpy).toHaveBeenCalledExactlyOnceWith('ollama-enabled')
  })
})
