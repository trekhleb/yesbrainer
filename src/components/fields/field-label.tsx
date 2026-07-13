/**
 * Shared label scaffold for any field that's an override vs. a built-in
 * default. Dedupes the repeated "label text + Reset button" pattern across the
 * Settings fields (PromptField, BehaviorToggleField, BehaviorNumberField,
 * DimensionsField, TitleModelField) **and** the per-seat config modal's
 * system-prompt field — so the override affordance looks and behaves
 * identically everywhere and a change here propagates to all of them.
 *
 * Pass `isOverridden = value !== undefined` plus an `onReset` that calls
 * `onChange(undefined)`. The field's input control (Textarea / Input /
 * Checkbox / Select) is the caller's responsibility.
 *
 * `<OverrideControls>` is the "Custom" tag + Reset button on their own, for
 * fields that lay the label out themselves (e.g. a checkbox whose label sits
 * *inline* with the control) rather than via `<FieldLabel>`. The tag names the
 * state, the button is the action — together they make an overridden field
 * legible at a glance instead of only via the Reset button's presence.
 *
 * **No layout shift on override.** The tag + Reset only render when
 * overridden, so the row reserves a constant `minHeight` and never wraps —
 * toggling the override can't grow the label and shove the control below it
 * down.
 */

import type { ReactNode } from 'react'
import { useStyletron } from 'baseui'
import { BiReset } from 'react-icons/bi'

import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'
/**
 * Tiny "Custom" state tag — the at-a-glance "this differs from the default"
 * marker. Shared by the field rows here and the settings panel headers
 * (`useSettingsPanel`), so "customized" looks identical everywhere.
 */
export function CustomTag() {
  const [css, theme] = useStyletron()
  return (
    <span
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        flex: '0 0 auto',
        paddingTop: '1px',
        paddingBottom: '1px',
        paddingLeft: '6px',
        paddingRight: '6px',
        borderRadius: '4px',
        backgroundColor: theme.colors.backgroundTertiary,
        color: theme.colors.contentSecondary,
        fontSize: '10px',
        fontWeight: 600,
        lineHeight: '14px',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      })}
    >
      Custom
    </span>
  )
}

export function FieldLabel({
  label,
  isOverridden,
  onReset,
}: {
  label: ReactNode
  isOverridden: boolean
  onReset: () => void
}) {
  const [css] = useStyletron()
  return (
    <span
      className={css({
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        // Reserve a constant height and never wrap, so showing/hiding the
        // badge + Reset can't change the label's height (no input jump).
        minHeight: '22px',
        flexWrap: 'nowrap',
      })}
    >
      <span>{label}</span>
      <OverrideControls isOverridden={isOverridden} onReset={onReset} />
    </span>
  )
}

/**
 * The "Custom" tag + "Reset to default" button — render nothing unless
 * `isOverridden`. The tag carries `marginLeft: auto`, so in a flex row the
 * pair pushes itself to the far edge away from the label.
 */
function OverrideControls({
  isOverridden,
  onReset,
}: {
  isOverridden: boolean
  onReset: () => void
}) {
  const [css, theme] = useStyletron()
  if (!isOverridden) return null
  return (
    <>
      <span className={css({ marginLeft: 'auto', display: 'inline-flex' })}>
        <CustomTag />
      </span>
      <button
        type="button"
        onClick={onReset}
        className={css({
          flex: '0 0 auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          paddingTop: '2px',
          paddingBottom: '2px',
          paddingLeft: '4px',
          paddingRight: '4px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: '12px',
          lineHeight: '1',
          whiteSpace: 'nowrap',
          color: theme.colors.contentSecondary,
          ':hover': { color: theme.colors.contentPrimary },
        })}
      >
        <BiReset size={14} aria-hidden />
        {/* "to default" collapses on mobile to save horizontal space — the
            button reads just "Reset" below the mobile breakpoint. Wrapped in
            one span so the flex `gap` only sits between the icon and the text. */}
        <span>
          Reset
          <span className={css({ [MOBILE_MEDIA_QUERY]: { display: 'none' } })}>
            &nbsp;to default
          </span>
        </span>
      </button>
    </>
  )
}
