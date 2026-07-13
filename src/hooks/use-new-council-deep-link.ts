/**
 * Deep-link the New Council modal to `?new-council=1` so the modal state
 * is shareable / bookmarkable and the browser back button closes it.
 *
 * Built on react-router's `useSearchParams` (same history the rest of the
 * routing uses) rather than manual `history.pushState`, so it can't drift
 * from the router's location:
 *  - Open → push a new entry (back button closes the modal).
 *  - Close → replace, so dismissing doesn't leave a dead entry to back past.
 * The param only touches the query, so it composes with whatever route
 * (`/`, `/council/:id`) is currently active.
 */

import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

const PARAM = 'new-council'

export function useNewCouncilDeepLink(): {
  open: boolean
  openModal: () => void
  closeModal: () => void
} {
  const [searchParams, setSearchParams] = useSearchParams()
  const open = searchParams.has(PARAM)

  const openModal = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set(PARAM, '1')
      return next
    })
  }, [setSearchParams])

  const closeModal = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(PARAM)
        return next
      },
      { replace: true },
    )
  }, [setSearchParams])

  return { open, openModal, closeModal }
}
