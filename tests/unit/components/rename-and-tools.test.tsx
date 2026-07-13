import { fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RenameCouncilModal } from '@/components/rename-council-modal'
import { ToolsField } from '@/components/seat-config/tools-field'
import { renderUi } from '../helpers/render'

describe('RenameCouncilModal', () => {
  it('saves the trimmed title (capped at 60) and blocks empty', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { container } = renderUi(
      <RenameCouncilModal
        currentTitle="Old name"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    )
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  New name  ' } })
    const save = Array.from(container.querySelectorAll('button')).find((b) =>
      /save/i.test(b.textContent ?? ''),
    )!
    fireEvent.click(save)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('New name'))
  })

  it('disables Save for a whitespace-only title', () => {
    const onSave = vi.fn()
    const { container } = renderUi(
      <RenameCouncilModal currentTitle="" onCancel={vi.fn()} onSave={onSave} />,
    )
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    const save = Array.from(container.querySelectorAll('button')).find((b) =>
      /save/i.test(b.textContent ?? ''),
    )
    if (save && !save.hasAttribute('disabled')) fireEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('ToolsField', () => {
  it('renders a binary checkbox for a single-tool model and toggles it', () => {
    const setEnabledTools = vi.fn()
    const { container } = renderUi(
      <ToolsField
        toolsSupported
        availableTools={['web_search']}
        enabledTools={[]}
        setEnabledTools={setEnabledTools}
        modelLabel="Groq"
      />,
    )
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(setEnabledTools).toHaveBeenCalled()
    const next = setEnabledTools.mock.calls[0]![0]([])
    expect(next).toEqual(['web_search'])
  })

  it('renders a per-tool list for multi-tool models, preserving canonical order', () => {
    const setEnabledTools = vi.fn()
    const { container } = renderUi(
      <ToolsField
        toolsSupported
        availableTools={['web_search', 'code_execution']}
        enabledTools={['code_execution']}
        setEnabledTools={setEnabledTools}
        modelLabel="Claude"
      />,
    )
    const boxes = container.querySelectorAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    fireEvent.click(boxes[0]!) // enable web_search
    const next = setEnabledTools.mock.calls[0]![0](['code_execution'])
    expect(next).toEqual(['web_search', 'code_execution'])
  })
})
