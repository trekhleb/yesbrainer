import { fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewCouncilModal } from '@/components/new-council-modal'
import type { CreateCouncilInput } from '@/storage/councils'
import { renderUi } from '../helpers/render'

const ollamaOff = { enabled: false, reachable: false, checked: true }

function mount(onSubmit = vi.fn(async (_i: CreateCouncilInput) => {})) {
  const utils = renderUi(
    <NewCouncilModal onCancel={vi.fn()} onSubmit={onSubmit} ollama={ollamaOff} />,
  )
  return { ...utils, onSubmit }
}

function structureButton(re: RegExp): HTMLElement {
  const el = Array.from(document.querySelectorAll('button, [role="radio"], [role="tab"]')).find(
    (b) => re.test(b.textContent ?? ''),
  )
  if (!el) throw new Error(`no structure control matching ${re}`)
  return el as HTMLElement
}

function textButton(re: RegExp): HTMLElement {
  const el = Array.from(document.querySelectorAll('button')).find((b) =>
    re.test(b.textContent ?? ''),
  )
  if (!el) throw new Error(`no button matching ${re}`)
  return el as HTMLElement
}

const removeButtons = (): HTMLElement[] =>
  Array.from(document.querySelectorAll('button[aria-label="Remove seat"]'))

const configToggles = (): HTMLElement[] =>
  Array.from(document.querySelectorAll('button[aria-label="Configure this model"]'))

beforeEach(() => {
  localStorage.setItem(
    'yesbrainer:keys',
    JSON.stringify({ anthropic: 'k', openai: 'k' }),
  )
})

describe('NewCouncilModal', () => {
  it('renders the picker with one seeded seat and an enabled Create', async () => {
    mount()
    await waitFor(() =>
      expect(document.body.textContent).toContain('New council'),
    )
    expect(document.body.textContent).toContain('Parallel')
    const create = Array.from(document.querySelectorAll('button')).find((b) =>
      /create/i.test(b.textContent ?? ''),
    )
    expect(create).toBeDefined()
    expect(create?.hasAttribute('disabled')).toBe(false)
  })

  it('switching to Trial seeds the two-seat floor and the Judge section', async () => {
    mount()
    await waitFor(() =>
      expect(document.body.textContent).toContain('New council'),
    )
    fireEvent.click(structureButton(/trial/i))
    await waitFor(() =>
      expect(document.body.textContent?.toLowerCase()).toContain('judge'),
    )
  })

  it('creating a Parallel council submits the assembled payload', async () => {
    const { onSubmit } = mount()
    await waitFor(() =>
      expect(document.body.textContent).toContain('New council'),
    )
    const create = Array.from(document.querySelectorAll('button')).find((b) =>
      /create/i.test(b.textContent ?? ''),
    )!
    fireEvent.click(create)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    const input = onSubmit.mock.calls[0]?.[0]
    expect(input?.socialStructure).toBe('roundtable')
    expect(input?.seats.length).toBeGreaterThan(0)
    expect(input?.judge).toBeUndefined()
    expect(input?.id).toMatch(/[0-9a-f-]{36}/)
  })

  it('creating a Trial council carries the judge slot', async () => {
    const { onSubmit } = mount()
    await waitFor(() =>
      expect(document.body.textContent).toContain('New council'),
    )
    fireEvent.click(structureButton(/trial/i))
    const create = Array.from(document.querySelectorAll('button')).find((b) =>
      /create/i.test(b.textContent ?? ''),
    )!
    fireEvent.click(create)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    const input = onSubmit.mock.calls[0]?.[0]
    expect(input?.socialStructure).toBe('trial')
    expect(input?.seats.length).toBeGreaterThanOrEqual(2)
    expect(input?.judge?.modelId).toBeTruthy()
  })

  it('adds and removes seats, submitting the final roster', async () => {
    const { onSubmit } = mount()
    await waitFor(() =>
      expect(document.body.textContent).toContain('New council'),
    )
    fireEvent.click(textButton(/add seat/i))
    fireEvent.click(textButton(/add seat/i))
    await waitFor(() => expect(removeButtons().length).toBe(3))
    fireEvent.click(removeButtons()[0]!)
    await waitFor(() => expect(removeButtons().length).toBe(2))
    fireEvent.click(textButton(/create/i))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit.mock.calls[0]?.[0]?.seats.length).toBe(2)
  })

  it('applies the "smartest available" preset', async () => {
    const { onSubmit } = mount()
    await waitFor(() =>
      expect(document.body.textContent).toContain('New council'),
    )
    // beforeEach seeds anthropic + openai keys → the preset has models to pick.
    fireEvent.click(textButton(/smartest available/i))
    fireEvent.click(textButton(/create/i))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(
      onSubmit.mock.calls[0]?.[0]?.seats.length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('tops up a touched roster to the two-seat floor on a structure switch', async () => {
    const { onSubmit } = mount()
    await waitFor(() =>
      expect(document.body.textContent).toContain('New council'),
    )
    // Touch the roster (add then remove) so it's back to one seat but "owned".
    fireEvent.click(textButton(/add seat/i))
    await waitFor(() => expect(removeButtons().length).toBe(2))
    fireEvent.click(removeButtons()[0]!)
    await waitFor(() => expect(removeButtons().length).toBe(0))
    // Trial needs two → the switch tops the touched roster up to the floor…
    fireEvent.click(structureButton(/trial/i))
    await waitFor(() =>
      expect(document.body.textContent?.toLowerCase()).toContain('judge'),
    )
    // …and switching on to Consensus (already ≥ 2) leaves the roster intact.
    fireEvent.click(structureButton(/consensus/i))
    fireEvent.click(textButton(/create/i))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    const input = onSubmit.mock.calls[0]?.[0]
    expect(input?.socialStructure).toBe('consensus')
    expect(input?.seats.length).toBeGreaterThanOrEqual(2)
    expect(input?.mediator?.modelId).toBeTruthy()
  })

  it('expands per-seat and synthesiser config panels', async () => {
    mount()
    await waitFor(() =>
      expect(document.body.textContent).toContain('New council'),
    )
    fireEvent.click(structureButton(/trial/i))
    await waitFor(() => expect(configToggles().length).toBeGreaterThan(1))
    // Expand a seat's config (mounts its inline form, marks the roster
    // touched) and the Judge's config (a synthesiser toggle).
    fireEvent.click(configToggles()[0]!)
    fireEvent.click(configToggles()[configToggles().length - 1]!)
    // Still coherent — the modal didn't crash mounting the inline forms.
    expect(document.body.textContent).toContain('New council')
  })
})
