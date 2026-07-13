/**
 * Shared Base Web `<Select>` overrides.
 *
 * `NO_KEYBOARD_SELECT_OVERRIDES` suppresses the mobile soft keyboard for
 * non-searchable selects. Base Web's Select renders a hidden `<input>` and
 * programmatically focuses it whenever the control opens — even with
 * `searchable={false}` — and focusing any `<input>` summons the on-screen
 * keyboard on mobile. `inputmode="none"` keeps the element focusable (so the
 * dropdown still opens and stays keyboard-navigable on desktop) while telling
 * mobile browsers not to show a keyboard. No effect on desktop. Apply to every
 * non-searchable Select so the behaviour is consistent app-wide.
 */

import type { SelectOverrides } from 'baseui/select'

export const NO_KEYBOARD_SELECT_OVERRIDES: SelectOverrides = {
  Input: { props: { inputMode: 'none' } },
}

/**
 * For the model pickers, which render `renderModelOption` as the collapsed
 * value too. That renderer is a full-width flex row pinning the capability
 * icons + context pill to the right edge — but Base Web's `SingleValue`
 * shrink-wraps its content, so in the closed control the row had no width
 * to stretch into and the icons huddled left after the label. Growing it
 * makes the closed control mirror the dropdown rows, and the stacked seat
 * pickers line their metadata up into one scannable column. Extends the
 * no-keyboard override — every model picker wants both.
 */
export const MODEL_PICKER_SELECT_OVERRIDES: SelectOverrides = {
  ...NO_KEYBOARD_SELECT_OVERRIDES,
  SingleValue: { style: { flexGrow: 1 } },
}
