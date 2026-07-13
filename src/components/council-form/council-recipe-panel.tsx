/**
 * The collapsed "⟨Structure⟩ settings" recipe panel both council modals
 * render below the roster — one implementation of the accordion + the
 * mount-on-first-expand `DeliberationForm` wiring, so the two modals
 * can't drift on its semantics.
 *
 * Mount-on-first-expand (`opened`), then keep mounted (`renderAll`) so the
 * draft + the caller's ref survive a collapse until Save/Create. First
 * mount must be *visible* — the consensus recipe's segmented control
 * measures its pill on mount, and inside a hidden panel it measures
 * 0 wide. A never-opened panel leaves the caller's ref null: the create
 * path then sends no deliberation, the edit path saves the existing one
 * untouched.
 */

import { useState, type MutableRefObject } from 'react'
import { Accordion, Panel } from 'baseui/accordion'
import { LuSlidersHorizontal } from 'react-icons/lu'
import {
  DeliberationForm,
  type DeliberationFormHandle,
} from '@/components/council-settings/deliberation-form'
import { useSettingsPanel } from '@/components/settings/settings-accordion'
import { socialStructureMeta } from '@/models/social-structures'
import type { CouncilDeliberation, SocialStructure } from '@/types/council'

export function CouncilRecipePanel({
  structure,
  deliberation,
  customized,
  formRef,
}: {
  structure: SocialStructure
  /** Existing overrides to seed the form with (editing), or undefined
   *  (creation — everything cascades to the global defaults). */
  deliberation: CouncilDeliberation | undefined
  /** Dots the panel header as customized (editing a council that already
   *  carries overrides). Omit at creation. */
  customized?: boolean
  /** The caller reads `buildDeliberation()` off this on Save/Create. */
  formRef: MutableRefObject<DeliberationFormHandle | null>
}) {
  const [opened, setOpened] = useState(false)
  // Reuses the Settings → Councils panel styling in the **neutral** (grey)
  // treatment — these are per-council settings, not a branded structure
  // surface; the plain sliders glyph marks it.
  const recipeLabel = socialStructureMeta(structure)?.shortLabel ?? 'Council'
  const panel = useSettingsPanel(
    { neutral: LuSlidersHorizontal, label: `${recipeLabel} settings` },
    {
      compact: true,
      flat: true,
      ...(customized !== undefined ? { customized } : {}),
    },
  )
  return (
    <Accordion
      renderAll
      onChange={({ expanded }) => {
        if (expanded.length > 0) setOpened(true)
      }}
    >
      <Panel title={panel.title} overrides={panel.overrides}>
        {opened && (
          <DeliberationForm
            ref={formRef}
            structure={structure}
            deliberation={deliberation}
          />
        )}
      </Panel>
    </Accordion>
  )
}
