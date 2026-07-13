import { fireEvent, waitFor } from '@testing-library/react'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import { analytics } from '@/analytics'
import { StorageBackupSection } from '@/components/settings/storage-backup-section'
import { createCouncil } from '@/storage/councils'
import { downloadJson } from '@/utils/download-json'
import { clearDb } from '../../helpers/db'
import { bundleCouncil, envelope } from '../../helpers/bundles'
import { seat } from '../../helpers/fixtures'
import { renderUi } from '../../helpers/render'

vi.mock('@/utils/download-json', () => ({ downloadJson: vi.fn() }))
const downloadMock = vi.mocked(downloadJson)
// restoreMocks: true restores spies before every test — create per test.
let eventSpy: MockInstance
beforeEach(async () => {
  downloadMock.mockReset()
  eventSpy = vi.spyOn(analytics, 'event')
  await clearDb()
})

function fileOf(content: string): File {
  const file = new File([content], 'backup.json', { type: 'application/json' })
  // jsdom's File.text() is unreliable across versions — stub it.
  Object.defineProperty(file, 'text', {
    value: () => Promise.resolve(content),
  })
  return file
}

describe('StorageBackupSection', () => {
  it('exports all councils as a downloaded JSON bundle', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const { container } = renderUi(
      <StorageBackupSection onChanged={vi.fn()} />,
    )
    const exportBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /export/i.test(b.textContent ?? ''),
    )!
    fireEvent.click(exportBtn)
    await waitFor(() => expect(downloadMock).toHaveBeenCalledOnce())
    const [bundle, filename] = downloadMock.mock.calls[0]!
    expect((bundle as { councils: unknown[] }).councils).toHaveLength(1)
    expect(filename).toMatch(/^yesbrainer-bundle-/)
    expect(eventSpy).toHaveBeenCalledExactlyOnceWith('data-exported')
  })

  it('imports a valid file and reports the result', async () => {
    const onChanged = vi.fn()
    const onCouncilsChanged = vi.fn()
    const { container } = renderUi(
      <StorageBackupSection
        onChanged={onChanged}
        onCouncilsChanged={onCouncilsChanged}
      />,
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const bundle = JSON.stringify(envelope([bundleCouncil({ id: 'imported' })]))
    fireEvent.change(input, { target: { files: [fileOf(bundle)] } })

    await waitFor(() =>
      expect(container.textContent).toContain('Imported'),
    )
    expect(container.textContent).toContain('1')
    expect(onChanged).toHaveBeenCalled()
    expect(onCouncilsChanged).toHaveBeenCalled()
    expect(eventSpy).toHaveBeenCalledExactlyOnceWith('data-imported')
  })

  it('surfaces an import error for a bad file', async () => {
    const { container } = renderUi(
      <StorageBackupSection onChanged={vi.fn()} />,
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [fileOf('not json {')] } })
    await waitFor(() =>
      expect(container.textContent?.toLowerCase()).toMatch(/error|failed|not/),
    )
    // A rejected import is not a use of the import feature.
    expect(eventSpy).not.toHaveBeenCalled()
  })

  it('surfaces an export failure inline', async () => {
    downloadMock.mockImplementationOnce(() => {
      throw new Error('write blocked')
    })
    const { container } = renderUi(
      <StorageBackupSection onChanged={vi.fn()} />,
    )
    const exportBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => /export/i.test(b.textContent ?? ''),
    )!
    fireEvent.click(exportBtn)
    await waitFor(() =>
      expect(container.textContent).toMatch(/write blocked/i),
    )
  })

  it('opens the file picker when Import is pressed', () => {
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => {})
    const { container } = renderUi(
      <StorageBackupSection onChanged={vi.fn()} />,
    )
    const importBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => /import from json/i.test(b.textContent ?? ''),
    )!
    fireEvent.click(importBtn)
    expect(clickSpy).toHaveBeenCalled()
  })
})
