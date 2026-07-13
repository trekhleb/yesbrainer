import { fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '@/components/composer'
import { attachImageAsDataUri } from '@/utils/file-to-data-uri'
import { renderUi } from '../helpers/render'

vi.mock('@/utils/file-to-data-uri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/file-to-data-uri')>()),
  attachImageAsDataUri: vi.fn(),
}))
const attachMock = vi.mocked(attachImageAsDataUri)

beforeEach(() => {
  attachMock.mockReset()
  attachMock.mockResolvedValue('data:image/png;base64,AAA')
})

function imageFile() {
  return new File(['x'], 'shot.png', { type: 'image/png' })
}

describe('Composer image attachments', () => {
  it('attaches a picked image and sends it with the message', async () => {
    const onSend = vi.fn()
    const { container } = renderUi(
      <Composer onSend={onSend} onStop={vi.fn()} isStreaming={false} />,
    )
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [imageFile()] } })

    // A thumbnail appears once the attach pipeline resolves.
    await waitFor(() =>
      expect(container.querySelector('img')).not.toBeNull(),
    )
    const textarea = container.querySelector('textarea')!
    fireEvent.change(textarea, { target: { value: 'describe this' } })
    const send = Array.from(container.querySelectorAll('button')).find((b) =>
      /send/i.test(`${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`),
    )!
    fireEvent.click(send)
    expect(onSend).toHaveBeenCalledWith(
      'describe this',
      ['data:image/png;base64,AAA'],
      undefined,
    )
  })

  it('attaches a pasted clipboard screenshot through the same path', async () => {
    const { container } = renderUi(
      <Composer onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />,
    )
    const textarea = container.querySelector('textarea')!
    fireEvent.paste(textarea, {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => imageFile() }],
        files: [imageFile()],
      },
    })
    await waitFor(() => expect(attachMock).toHaveBeenCalled())
  })
})
