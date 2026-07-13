import { fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { SettingsPage } from '@/components/settings-page'
import { getApiKeys } from '@/storage/keys'
import { clearDb } from '../helpers/db'
import { renderUi } from '../helpers/render'

function mountAt(tab: string | null) {
  return renderUi(
    <Routes>
      <Route
        path="/settings/:tab"
        element={<SettingsPage tab={tab} onCouncilsChanged={vi.fn()} />}
      />
      <Route
        path="*"
        element={<SettingsPage tab={tab} onCouncilsChanged={vi.fn()} />}
      />
    </Routes>,
    { route: tab ? `/settings/${tab}` : '/settings' },
  )
}

beforeEach(async () => {
  await clearDb()
})

describe('SettingsPage', () => {
  it('renders every tab (renderAll) with the keys tab active', async () => {
    const { container } = mountAt('keys')
    expect(container.textContent).toContain('Settings')
    expect(container.textContent).toContain('You own your keys.')
    // Storage + councils tab content is mounted too (renderAll).
    expect(container.textContent?.toLowerCase()).toContain('storage')
    await waitFor(() =>
      expect(container.querySelectorAll('input').length).toBeGreaterThan(0),
    )
  })

  it('auto-saves a pasted key (trimmed) to localStorage', async () => {
    const { container } = mountAt('keys')
    const anthropicInput = Array.from(
      container.querySelectorAll('input[type="password"]'),
    )[0]
    expect(anthropicInput).toBeDefined()
    fireEvent.change(anthropicInput!, {
      target: { value: '  sk-ant-pasted-key-123  ' },
    })
    await waitFor(() =>
      expect(getApiKeys()['anthropic']).toBe('sk-ant-pasted-key-123'),
    )
  })

  it('renders nothing for an unknown tab slug — it issues the redirect instead', () => {
    // The harness pins the `tab` prop, so the <Navigate replace> to the
    // first tab can't complete here; the contract under test is that a
    // bogus slug never renders a broken page of its own.
    const { container } = mountAt('bogus')
    expect(container.textContent).toBe('')
  })
})
