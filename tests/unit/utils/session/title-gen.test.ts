import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateTitleForFirstTurn } from '@/utils/session/title-gen'
import { prepareAndRunTitleGen } from '@/providers/run-title'
import { patchCouncilTitle } from '@/storage/councils'
import { abortCouncilStreams } from '@/utils/session/active-streams'
import { participantEvent } from '../../helpers/fixtures'

vi.mock('@/providers/run-title', () => ({ prepareAndRunTitleGen: vi.fn() }))
vi.mock('@/storage/councils', () => ({ patchCouncilTitle: vi.fn() }))
const runMock = vi.mocked(prepareAndRunTitleGen)
const patchMock = vi.mocked(patchCouncilTitle)

function args() {
  return {
    councilId: 'c1',
    userMsg: 'the question',
    events: [
      participantEvent('s1', { error: 'failed', output: '' }),
      participantEvent('s2', { output: 'first clean answer' }),
    ],
    onStart: vi.fn(),
    onFinish: vi.fn(),
  }
}

beforeEach(() => {
  runMock.mockReset()
  patchMock.mockReset()
})

describe('generateTitleForFirstTurn', () => {
  it('feeds the earliest successful answer to the titler and patches on success', async () => {
    runMock.mockResolvedValue({ title: 'Concise title' })
    patchMock.mockResolvedValue(undefined)
    const a = args()
    await generateTitleForFirstTurn(a)
    expect(a.onStart).toHaveBeenCalledWith('c1')
    expect(runMock.mock.calls[0]?.[0]?.firstAnswer).toBe('first clean answer')
    expect(patchMock).toHaveBeenCalledWith('c1', 'Concise title')
    // The finish callback carries the title for the atomic spinner+swap.
    expect(a.onFinish).toHaveBeenCalledWith('c1', 'Concise title')
  })

  it('a titler skip (no reachable model) still clears the spinner', async () => {
    runMock.mockResolvedValue({})
    const a = args()
    await generateTitleForFirstTurn(a)
    expect(patchMock).not.toHaveBeenCalled()
    expect(a.onFinish).toHaveBeenCalledWith('c1', undefined)
  })

  it('is silent on failure — logs redacted, keeps the fallback title', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    runMock.mockResolvedValue({ title: 'T-title' })
    patchMock.mockRejectedValue(new Error('idb closed'))
    const a = args()
    await expect(generateTitleForFirstTurn(a)).resolves.toBeUndefined()
    expect(a.onFinish).toHaveBeenCalledWith('c1', undefined)
    expect(warn).toHaveBeenCalled()
  })

  it('registers in the per-council registry so delete can cancel it', async () => {
    runMock.mockImplementation(({ abortSignal }) => {
      abortCouncilStreams('c1')
      expect(abortSignal.aborted).toBe(true)
      return Promise.resolve({ aborted: true })
    })
    const a = args()
    await generateTitleForFirstTurn(a)
    expect(patchMock).not.toHaveBeenCalled()
    expect(a.onFinish).toHaveBeenCalledWith('c1', undefined)
  })
})
