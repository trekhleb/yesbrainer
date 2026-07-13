/**
 * Rename-council modal — opened from a council's ⋯ menu.
 *
 * Replaced the old in-place inline-edit (`useInlineRename`): a focused modal
 * with a real Save / Cancel reads far more naturally on mobile than a tiny
 * `SIZE.mini` input squeezed into a drawer row, and it keeps the three kebab
 * actions (Settings / Rename / Delete) consistently modal-driven.
 *
 * Commit rules mirror the old inline path (and the app's `handleRename`):
 * trim, cap at 60 chars (the title's hard limit), no-op on empty.
 */

import { useRef, useState } from 'react'
import { Input } from 'baseui/input'
import { SIZE } from 'baseui/modal'
import { FiEdit3 } from 'react-icons/fi'
import { FormModal, ModalTitleWithIcon } from '@/components/form-modal'

const TITLE_MAX = 60

export function RenameCouncilModal({
  currentTitle,
  onCancel,
  onSave,
}: {
  currentTitle: string | null
  onCancel: () => void
  /** Persist the new (trimmed) title. The app handles the optimistic
   *  update + PATCH + rollback. */
  onSave: (title: string) => Promise<void>
}) {
  const [title, setTitle] = useState(currentTitle ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const trimmed = title.trim()
  const canSave = trimmed.length > 0

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await onSave(trimmed)
      onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormModal
      title={
        // Same pencil as the kebab's Rename row that opens this modal.
        <ModalTitleWithIcon icon={<FiEdit3 size={18} aria-hidden />}>
          Rename council
        </ModalTitleWithIcon>
      }
      onCancel={onCancel}
      onSubmit={() => void save()}
      submitDisabled={!canSave}
      submitting={saving}
      // A single field — a compact centred dialog, not the full-size form.
      size={SIZE.default}
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void save()
          }
        }}
        placeholder="Council title"
        maxLength={TITLE_MAX}
        clearable
        overrides={{
          // `props.ref` (not Base Web's `inputRef`) sidesteps React 19's
          // stricter useRef typing — same pattern the composer / old inline
          // rename used. Focus + select-all on mount so the user can
          // immediately overwrite the existing title.
          Input: {
            props: {
              ref: (el: HTMLInputElement | null) => {
                if (el && el !== inputRef.current) {
                  inputRef.current = el
                  requestAnimationFrame(() => {
                    el.focus()
                    el.select()
                  })
                }
              },
            },
          },
        }}
      />
    </FormModal>
  )
}
