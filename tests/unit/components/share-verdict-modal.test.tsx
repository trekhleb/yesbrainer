import { fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { analytics } from '@/analytics'
import { ShareVerdictModal } from '@/components/share-verdict-modal'
import {
  participantEvent,
  seat,
  synthesisEvent,
} from '../helpers/fixtures'
import { renderUi } from '../helpers/render'

// The canvas painter (real code exercised by share-card.test.ts) rasterizes
// assets via `img.decode()`, which never resolves in jsdom. This modal test
// is about the modal's own build → preview → action wiring, so stub the
// dynamically-imported module entirely — `renderShareCard` returns a ready
// blob and the data builders return the shapes the modal consumes.
vi.mock('@/utils/share-card', () => ({
  buildShareCardData: (args: { events: unknown[] }) =>
    args.events.length > 1
      ? { structure: 'trial', question: 'Which db?', seats: [], processLine: '', scores: [] }
      : null,
  renderShareCard: vi
    .fn()
    .mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
  buildShareText: () => 'share text',
  shareCardFilename: () => 'yesbrainer-card.png',
}))

const seats = [seat('s1'), seat('s2')]

describe('ShareVerdictModal', () => {
  it('builds and previews the card, offering download / copy / share', async () => {
    const onClose = vi.fn()
    renderUi(
      <ShareVerdictModal
        structure="trial"
        question="Which db?"
        events={[
          participantEvent('s1'),
          synthesisEvent('judge', { output: 'Use Postgres.' }),
        ]}
        seats={seats}
        onClose={onClose}
      />,
    )
    await waitFor(
      () => expect(document.querySelector('img[src^="blob:"]')).not.toBeNull(),
      { timeout: 10_000 },
    )
    const buttonText = Array.from(document.querySelectorAll('button'))
      .map((b) => b.textContent)
      .join(' ')
    expect(buttonText).toMatch(/download/i)
    expect(buttonText).toMatch(/copy/i)
  }, 15_000)

  it('downloads, copies image, and copies text from the ready card', async () => {
    const eventSpy = vi.spyOn(analytics, 'event')
    const clipWrite = vi.fn().mockResolvedValue(undefined)
    const clipWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: clipWrite, writeText: clipWriteText },
      configurable: true,
    })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        data: unknown
        constructor(data: unknown) {
          this.data = data
        }
      },
    )
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    renderUi(
      <ShareVerdictModal
        structure="trial"
        question="Which db?"
        events={[
          participantEvent('s1'),
          synthesisEvent('judge', { output: 'Use Postgres.' }),
        ]}
        seats={seats}
        onClose={vi.fn()}
      />,
    )
    await waitFor(
      () => expect(document.querySelector('img[src^="blob:"]')).not.toBeNull(),
      { timeout: 10_000 },
    )
    const btn = (re: RegExp) =>
      Array.from(document.querySelectorAll('button')).find((b) =>
        re.test(b.textContent ?? ''),
      )

    fireEvent.click(btn(/download/i)!)
    expect(anchorClick).toHaveBeenCalled()

    const copyImg = btn(/copy image/i)
    if (copyImg) {
      fireEvent.click(copyImg)
      await waitFor(() => expect(clipWrite).toHaveBeenCalled())
    }
    const copyText = btn(/copy text/i)
    if (copyText) {
      fireEvent.click(copyText)
      await waitFor(() => expect(clipWriteText).toHaveBeenCalled())
    }
    // Three share actions on one modal = ONE verdict-shared count.
    expect(eventSpy).toHaveBeenCalledExactlyOnceWith('verdict-shared:trial')
    eventSpy.mockRestore()
    vi.unstubAllGlobals()
  }, 15_000)

  const twoEvents = [
    participantEvent('s1'),
    synthesisEvent('judge', { output: 'Use Postgres.' }),
  ]

  it('toasts a failure when the clipboard rejects a copy', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        write: vi.fn().mockRejectedValue(new Error('denied')),
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
      configurable: true,
    })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(_d: unknown) {}
      },
    )
    renderUi(
      <ShareVerdictModal
        structure="trial"
        question="Which db?"
        events={twoEvents}
        seats={seats}
        onClose={vi.fn()}
      />,
    )
    await waitFor(
      () => expect(document.querySelector('img[src^="blob:"]')).not.toBeNull(),
      { timeout: 10_000 },
    )
    const btn = (re: RegExp) =>
      Array.from(document.querySelectorAll('button')).find((b) =>
        re.test(b.textContent ?? ''),
      )
    fireEvent.click(btn(/copy image/i)!)
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/could not copy the image/i),
    )
    fireEvent.click(btn(/copy text/i)!)
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/could not copy the text/i),
    )
    vi.unstubAllGlobals()
  }, 15_000)

  it('offers native file-share where the platform supports it', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'canShare', {
      value: () => true,
      configurable: true,
    })
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    renderUi(
      <ShareVerdictModal
        structure="trial"
        question="Which db?"
        events={twoEvents}
        seats={seats}
        onClose={vi.fn()}
      />,
    )
    await waitFor(
      () => expect(document.querySelector('img[src^="blob:"]')).not.toBeNull(),
      { timeout: 10_000 },
    )
    const shareBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => /share/i.test(b.textContent ?? '') && /…|\.\.\./.test(b.textContent ?? ''),
    )
    expect(shareBtn).toBeDefined()
    fireEvent.click(shareBtn!)
    await waitFor(() => expect(share).toHaveBeenCalled())
    Reflect.deleteProperty(navigator, 'canShare')
    Reflect.deleteProperty(navigator, 'share')
  }, 15_000)

  it('surfaces the no-synthesis error instead of a broken preview', async () => {
    renderUi(
      <ShareVerdictModal
        structure="trial"
        question="q"
        events={[participantEvent('s1')]}
        seats={seats}
        onClose={vi.fn()}
      />,
    )
    await waitFor(
      () =>
        expect(document.body.textContent).toContain(
          'no finished synthesis to share',
        ),
      { timeout: 10_000 },
    )
  }, 15_000)
})
