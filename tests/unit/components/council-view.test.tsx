import { fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CouncilView } from '@/components/council-view'
import { runParticipantStream } from '@/providers/run-stream'
import { createCouncil, getCouncil } from '@/storage/councils'
import { clearDb } from '../helpers/db'
import { seat } from '../helpers/fixtures'
import { renderUi } from '../helpers/render'

vi.mock('@/providers/run-stream', () => ({ runParticipantStream: vi.fn() }))
vi.mock('@/utils/session/title-gen', () => ({
  generateTitleForFirstTurn: vi.fn().mockResolvedValue(undefined),
}))
const streamMock = vi.mocked(runParticipantStream)

beforeEach(async () => {
  streamMock.mockReset()
  await clearDb()
  // A configured key makes the composer render its live face.
  localStorage.setItem('yesbrainer:keys', JSON.stringify({ anthropic: 'k' }))
})

async function seed() {
  await createCouncil({
    id: 'c1',
    socialStructure: 'roundtable',
    seats: [seat('s1')],
  })
}

describe('CouncilView', () => {
  it('loads the council and sends a message end-to-end through the composer', async () => {
    await seed()
    streamMock.mockResolvedValue({
      text: 'streamed answer',
      aborted: false,
    })
    const onTurnAppended = vi.fn()
    const { container } = renderUi(
      <CouncilView
        councilId="c1"
        configRefreshKey={0}
        onTurnAppended={onTurnAppended}
        onTitleGenerationStarted={vi.fn()}
        onTitleGenerationFinished={vi.fn()}
        onOpenCouncilSettings={vi.fn()}
      />,
    )
    const textarea = await waitFor(() => {
      const el = container.querySelector('textarea')
      if (!el) throw new Error('composer not mounted yet')
      return el
    })

    fireEvent.change(textarea, { target: { value: 'hello council' } })
    const send = Array.from(container.querySelectorAll('button')).find((b) =>
      /send/i.test(
        `${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`,
      ),
    )
    expect(send).toBeDefined()
    fireEvent.click(send!)

    await waitFor(() => expect(onTurnAppended).toHaveBeenCalled())
    expect(container.textContent).toContain('streamed answer')
    expect((await getCouncil('c1'))?.turns).toHaveLength(1)
  })

  it('renders the load-error state for a missing council', async () => {
    const { container } = renderUi(
      <CouncilView
        councilId="ghost"
        configRefreshKey={0}
        onTurnAppended={vi.fn()}
        onTitleGenerationStarted={vi.fn()}
        onTitleGenerationFinished={vi.fn()}
        onOpenCouncilSettings={vi.fn()}
      />,
    )
    await waitFor(() =>
      expect(container.textContent).toContain('Council not found'),
    )
  })
})
