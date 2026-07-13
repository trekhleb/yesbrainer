/**
 * Settings as a shareable, full-page route (`/settings/:tab`) — replaces
 * the old modal. Per-tab content lives in
 * `src/components/settings/{keys,storage,councils,appearance}-tab.tsx`
 * (Councils merges the old Behavior + Prompts; Appearance is flag-hidden).
 *
 * Routing: the active tab comes from the URL, so `/settings/keys` is a
 * deep link (the onboarding "Add your keys" CTA points straight at it).
 * Bare `/settings` or an unknown tab redirects to the first tab.
 *
 * Save model: **auto-save**. Every edit persists as it lands — no Save
 * button, no staged state to lose by navigating away (the old staged model
 * silently discarded edits on any sidebar click, and its Save button sat
 * below the fold on mobile). Everything here is local-only (localStorage),
 * instantly written and individually resettable via each field's Reset, so
 * a draft/commit step bought nothing. The one-line hint under the heading
 * carries the "no Save button" expectation; Storage-tab actions were always
 * immediate, so the page is now uniform.
 */

import { useEffect, useRef, useState } from 'react'
import { useStyletron } from 'baseui'
import { Tab, Tabs } from 'baseui/tabs-motion'
import { HeadingMedium, ParagraphXSmall } from 'baseui/typography'
import { FiHardDrive, FiKey, FiUsers } from 'react-icons/fi'
import { LuPalette } from 'react-icons/lu'
import { Navigate, useNavigate } from 'react-router-dom'
import { AppearanceTab } from '@/components/settings/appearance-tab'
import { CouncilsTab } from '@/components/settings/councils-tab'
import { KeysTab } from '@/components/settings/keys-tab'
import { StorageTab } from '@/components/settings/storage-tab'
import { getApiKeys, setApiKeys, type ApiKeys } from '@/storage/keys'
import { ensurePersistedStorage } from '@/storage/persist'
import {
  getUserPrompts,
  setUserPrompts,
  type UserPrompts,
} from '@/storage/prompts'
import {
  getBehaviorSettings,
  setBehaviorSettings,
  type BehaviorSettings,
} from '@/storage/behavior'

import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'
// Feature flag: the Appearance tab (just the theme picker today) is hidden
// until it has more to show than a single control. The footer light/dark
// toggle still covers theme in the meantime. Flip to `true` to re-enable —
// the AppearanceTab component, route slug, and tab all stay wired below.
const SHOW_APPEARANCE_TAB: boolean = false

// Base Web's TabPanel pads all four sides by `scale600` (16px). Drop the
// left/right so the tab content uses the full content width (flush with the
// heading + tab strip), and the bottom too so the content doesn't double up
// with the container's gap before the Save divider. Keep the top gap under
// the tab strip.
const TAB_PANEL_OVERRIDES = {
  TabPanel: { style: { paddingLeft: 0, paddingRight: 0, paddingBottom: 0 } },
}

const TABS: readonly string[] = [
  'keys',
  'storage',
  ...(SHOW_APPEARANCE_TAB ? ['appearance'] : []),
  'councils',
]
const DEFAULT_TAB = TABS[0] ?? 'keys'

export interface SettingsPageProps {
  /** Tab slug from the URL (`/settings/:tab`), or null for bare `/settings`. */
  tab: string | null
  /** Refresh the sidebar council list — passed to the Storage tab so a JSON
   *  import updates the list without a page reload. */
  onCouncilsChanged?: () => void | Promise<void>
}

export function SettingsPage({ tab, onCouncilsChanged }: SettingsPageProps) {
  const [css] = useStyletron()
  const navigate = useNavigate()
  const [keys, setKeys] = useState<ApiKeys>(() => getApiKeys())
  const [prompts, setPrompts] = useState<UserPrompts>(() => getUserPrompts())
  const [behavior, setBehavior] = useState<BehaviorSettings>(
    () => getBehaviorSettings(),
  )

  // Auto-save: persist on every state change. The skip-first ref avoids a
  // pointless write-back of the just-hydrated values on mount. Writes are
  // small synchronous localStorage ops, so per-keystroke persistence is fine.
  const hydrated = useRef(false)
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true
      return
    }
    setApiKeys(keys)
    setUserPrompts(prompts)
    setBehaviorSettings(behavior)
    // First real edit upgrades storage durability — idempotent afterwards.
    void ensurePersistedStorage()
  }, [keys, prompts, behavior])

  // Normalise the URL → a valid tab. Unknown / missing tab deep-links to
  // the first one rather than rendering an empty page.
  if (!tab || !TABS.includes(tab)) {
    return <Navigate to={`/settings/${DEFAULT_TAB}`} replace />
  }

  return (
    <div
      className={css({
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
      })}
    >
      <div
        className={css({
          width: '100%',
          // Same comfortable reading cap as /about — settings forms don't
          // benefit from stretching across a wide desktop.
          maxWidth: '880px',
          marginLeft: 'auto',
          marginRight: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          // All gutter lives inside the scroll viewport (the parent `<main>`
          // adds none for prose pages), so settings scroll flush under the
          // header / footer with no dead padding band.
          paddingTop: '20px',
          paddingBottom: '24px',
          paddingLeft: '16px',
          paddingRight: '16px',
          [MOBILE_MEDIA_QUERY]: {
            paddingLeft: '20px',
            paddingRight: '20px',
          },
        })}
      >
        <div>
          <HeadingMedium marginTop="0" marginBottom="0">
            Settings
          </HeadingMedium>
          {/* The auto-save promise, stated once — it's also why there's no
              Save button anywhere below. */}
          <ParagraphXSmall
            marginTop="4px"
            marginBottom="0"
            color="contentTertiary"
          >
            Changes save automatically on this device.
          </ParagraphXSmall>
        </div>

        <Tabs
          activeKey={tab}
          // Tab switches drive the URL (deep-linkable); `replace` so the
          // back button leaves settings instead of stepping through tabs.
          onChange={({ activeKey }) =>
            void navigate(`/settings/${String(activeKey)}`, { replace: true })
          }
          renderAll
          overrides={{
            // The tab strip scrolls horizontally when cramped; the always-on
            // scrollbar track under it reads as stray chrome — hide it (the
            // strip still scrolls by touch/wheel).
            TabList: {
              style: {
                scrollbarWidth: 'none',
                '::-webkit-scrollbar': { display: 'none' },
              },
            },
          }}
        >
          <Tab
            key="keys"
            title="Keys"
            artwork={() => <FiKey size={14} aria-hidden />}
            overrides={TAB_PANEL_OVERRIDES}
          >
            <KeysTab keys={keys} setKeys={setKeys} />
          </Tab>
          <Tab
            key="storage"
            title="Storage"
            artwork={() => <FiHardDrive size={14} aria-hidden />}
            overrides={TAB_PANEL_OVERRIDES}
          >
            <StorageTab onCouncilsChanged={onCouncilsChanged} />
          </Tab>
          {SHOW_APPEARANCE_TAB && (
            <Tab
              key="appearance"
              title="Appearance"
              artwork={() => <LuPalette size={14} aria-hidden />}
              overrides={TAB_PANEL_OVERRIDES}
            >
              <AppearanceTab behavior={behavior} setBehavior={setBehavior} />
            </Tab>
          )}
          <Tab
            key="councils"
            title="Councils"
            artwork={() => <FiUsers size={14} aria-hidden />}
            overrides={TAB_PANEL_OVERRIDES}
          >
            <CouncilsTab
              prompts={prompts}
              setPrompts={setPrompts}
              behavior={behavior}
              setBehavior={setBehavior}
            />
          </Tab>
        </Tabs>
      </div>
    </div>
  )
}
