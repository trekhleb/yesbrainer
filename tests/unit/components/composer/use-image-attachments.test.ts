import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useImageAttachments } from '@/components/composer/use-image-attachments'
import { attachImageAsDataUri } from '@/utils/file-to-data-uri'

vi.mock('@/utils/file-to-data-uri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/file-to-data-uri')>()),
  attachImageAsDataUri: vi.fn(),
}))
const attachMock = vi.mocked(attachImageAsDataUri)

function imageFile(name: string, type = 'image/png'): File {
  return new File(['x'], name, { type })
}

beforeEach(() => {
  attachMock.mockReset()
  attachMock.mockImplementation((f) => Promise.resolve(`data:image/png;base64,${f.name}`))
})

describe('useImageAttachments', () => {
  it('accepts image files through the pipeline and exposes their data URIs', async () => {
    const { result } = renderHook(() => useImageAttachments())
    await act(async () => {
      result.current.addFiles([imageFile('a.png'), imageFile('b.png')])
    })
    await waitFor(() => expect(result.current.images).toHaveLength(2))
    expect(result.current.pendingImages).toBe(0)
    expect(result.current.attachError).toBeNull()
  })

  it('rejects non-image files with a banner, keeping the valid ones', async () => {
    const { result } = renderHook(() => useImageAttachments())
    await act(async () => {
      result.current.addFiles([
        imageFile('ok.png'),
        new File(['x'], 'notes.pdf', { type: 'application/pdf' }),
      ])
    })
    await waitFor(() => expect(result.current.images).toHaveLength(1))
    expect(result.current.attachError).toContain("isn't an image")
  })

  it('caps at ten per turn', async () => {
    const { result } = renderHook(() => useImageAttachments())
    await act(async () => {
      result.current.addFiles(
        Array.from({ length: 12 }, (_, i) => imageFile(`img${i}.png`)),
      )
    })
    await waitFor(() => expect(result.current.images).toHaveLength(10))
    expect(result.current.attachError).toContain('10 images per turn')
  })

  it('surfaces a pipeline failure and frees the slot', async () => {
    attachMock.mockRejectedValueOnce(new Error("Couldn't shrink it"))
    const { result } = renderHook(() => useImageAttachments())
    await act(async () => {
      result.current.addFiles([imageFile('bad.png')])
    })
    await waitFor(() => expect(result.current.attachError).toContain("Couldn't shrink"))
    expect(result.current.images).toHaveLength(0)
    // Slot freed: a subsequent valid attach still works.
    await act(async () => {
      result.current.addFiles([imageFile('good.png')])
    })
    await waitFor(() => expect(result.current.images).toHaveLength(1))
  })

  it('removeImage and clearAll manage the attachment set', async () => {
    const { result } = renderHook(() => useImageAttachments())
    await act(async () => {
      result.current.addFiles([imageFile('a.png'), imageFile('b.png')])
    })
    await waitFor(() => expect(result.current.images).toHaveLength(2))
    act(() => result.current.removeImage(0))
    expect(result.current.images).toEqual(['data:image/png;base64,b.png'])
    act(() => result.current.clearAll())
    expect(result.current.images).toEqual([])
    expect(result.current.attachError).toBeNull()
  })

  it('drag/drop over Files toggles the highlight and attaches on drop', async () => {
    const { result } = renderHook(() => useImageAttachments())
    const dt = { types: ['Files'], files: [imageFile('drop.png')] }
    const evt = (over?: object) =>
      ({
        dataTransfer: dt,
        preventDefault: vi.fn(),
        currentTarget: { contains: () => false },
        ...over,
      }) as unknown as React.DragEvent<HTMLFormElement>

    act(() => result.current.dragProps.onDragEnter(evt()))
    expect(result.current.dragOver).toBe(true)
    act(() => result.current.dragProps.onDragLeave(evt()))
    expect(result.current.dragOver).toBe(false)
    await act(async () => result.current.dragProps.onDrop(evt()))
    await waitFor(() => expect(result.current.images).toHaveLength(1))
  })
})
