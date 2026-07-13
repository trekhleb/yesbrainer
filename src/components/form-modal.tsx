/**
 * Shared scaffold for the app's modal forms (Settings, NewCouncil,
 * SeatConfig, plus the alertdialog-flavoured DeleteConfirm). Wraps
 * Base Web's Modal + Header + Body + Footer with the two standard
 * shapes the app uses:
 *
 *   - <FormModal>    — full-size form with Cancel + primary submit.
 *   - <ConfirmModal> — `default`-sized alertdialog with Cancel +
 *                      destructive confirm button (red).
 *
 * Why centralise: pre-extraction, every modal repeated the same
 * `<Modal isOpen onClose closeable animate autoFocus size role>` six-
 * prop boilerplate plus Cancel / submit ModalButtons. A scaffold
 * standardises the keyboard semantics (ESC cancel, role=alertdialog
 * for destructive flows) and lets callers focus on the body content.
 */

import type { ReactNode } from 'react'
import { useStyletron } from 'baseui'
import { KIND as ButtonKind } from 'baseui/button'
import {
  Modal,
  ModalBody,
  ModalButton,
  ModalFooter,
  ModalHeader,
  ROLE,
  SIZE,
} from 'baseui/modal'
import { FiTrash2 } from 'react-icons/fi'
import { CONFIRM_OVERRIDES, FORM_OVERRIDES } from '@/components/modal-overrides'
import { destructiveButtonOverrides } from '@/utils/button-styles'

/** Modal-header title led by the same icon as the menu item / trigger
 *  that opened it (sidebar kebab: sliders → Settings, pencil → Rename,
 *  trash → Delete) — ties the dialog back to its entry point. */
export function ModalTitleWithIcon({
  icon,
  children,
}: {
  icon: ReactNode
  children: ReactNode
}) {
  const [css] = useStyletron()
  return (
    <span
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
      })}
    >
      {icon}
      {children}
    </span>
  )
}

export interface FormModalProps {
  /** Header content — string or a span with icons/markup. */
  title: ReactNode
  /** Always-mounted modals: caller controls visibility by mounting /
   *  unmounting. ESC + backdrop click + onClose route through this. */
  onCancel: () => void
  /** Body content. */
  children: ReactNode
  /** Primary action handler. Omit to render a Close-only footer
   *  (rare — most forms have a Save). */
  onSubmit?: () => void
  /** Label for the primary action. Default: `Save`. */
  submitLabel?: ReactNode
  /** Greyed-out + non-interactive primary action. */
  submitDisabled?: boolean
  /** Spinner on the primary action; also blocks Cancel. */
  submitting?: boolean
  /** Cancel-button label. Default: `Cancel`. */
  cancelLabel?: ReactNode
  /** Modal SIZE override. Default: `default` (the dialog fits its content
   *  height — not the full viewport — and scrolls its body when tall). */
  size?: (typeof SIZE)[keyof typeof SIZE]
  /** Move focus into the modal on open (Base Web default). Pass `false` to
   *  avoid auto-opening the mobile keyboard when the first field is a text
   *  input — e.g. the seat-config system prompt. Default `true`. */
  autoFocus?: boolean
}

export function FormModal({
  title,
  onCancel,
  children,
  onSubmit,
  submitLabel = 'Save',
  submitDisabled,
  submitting,
  cancelLabel = 'Cancel',
  size = SIZE.default,
  autoFocus = true,
}: FormModalProps) {
  const [css] = useStyletron()
  return (
    <Modal
      isOpen
      onClose={onCancel}
      closeable
      animate
      autoFocus={autoFocus}
      size={size}
      role={ROLE.dialog}
      overrides={FORM_OVERRIDES}
    >
      <ModalHeader>{title}</ModalHeader>
      <ModalBody>
        {/* Section stack: each top-level child (structure picker, roster,
            Judge/Mediator, recipe panel, …) is one section. The flex gap
            adds on top of Base Web FormControl's uniform 16px trailing
            margin, so section seams read as clear breaks (~32px) instead
            of blending into the in-section field rhythm. Single-child
            bodies (rename modal) are unaffected. */}
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          })}
        >
          {children}
        </div>
      </ModalBody>
      <ModalFooter>
        <ModalButton
          kind={ButtonKind.tertiary}
          onClick={onCancel}
          disabled={submitting}
        >
          {cancelLabel}
        </ModalButton>
        {onSubmit && (
          <ModalButton
            onClick={onSubmit}
            disabled={submitDisabled}
            isLoading={submitting}
          >
            {submitLabel}
          </ModalButton>
        )}
      </ModalFooter>
    </Modal>
  )
}

export interface ConfirmModalProps {
  title: ReactNode
  /** Question / explanation body. Plain string or rich markup. */
  children: ReactNode
  onCancel: () => void
  onConfirm: () => void
  /** Default: `Delete` with a trash icon. Override for non-delete
   *  destructive flows (e.g. `Wipe everything`). */
  confirmLabel?: ReactNode
  /** Default: shows the trash icon. Set to `null` to hide. */
  confirmIcon?: ReactNode
}

/**
 * Destructive-confirmation variant. ROLE.alertdialog (screen readers
 * announce more aggressively than a plain dialog) + a red confirm
 * button. The icon defaults to a trash can since the overwhelmingly
 * common case is delete; pass `confirmIcon={null}` for non-delete
 * flows.
 */
export function ConfirmModal({
  title,
  children,
  onCancel,
  onConfirm,
  confirmLabel = 'Delete',
  confirmIcon,
}: ConfirmModalProps) {
  const [css, theme] = useStyletron()
  const icon = confirmIcon === undefined ? <FiTrash2 size={14} /> : confirmIcon
  return (
    <Modal
      isOpen
      onClose={onCancel}
      closeable
      animate
      autoFocus
      size={SIZE.default}
      role={ROLE.alertdialog}
      overrides={CONFIRM_OVERRIDES}
    >
      <ModalHeader>{title}</ModalHeader>
      <ModalBody>{children}</ModalBody>
      <ModalFooter>
        <ModalButton kind={ButtonKind.tertiary} onClick={onCancel}>
          Cancel
        </ModalButton>
        <ModalButton
          onClick={onConfirm}
          overrides={destructiveButtonOverrides(theme)}
        >
          <span
            className={css({
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            })}
          >
            {icon}
            {confirmLabel}
          </span>
        </ModalButton>
      </ModalFooter>
    </Modal>
  )
}
