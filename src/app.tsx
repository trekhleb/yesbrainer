import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStyletron } from 'baseui'
import { ParagraphMedium, ParagraphSmall } from 'baseui/typography'
import { useNavigate } from 'react-router-dom'
import {
  createCouncil,
  listCouncils,
  type CouncilSummary,
  type CreateCouncilInput,
} from '@/storage/councils'
import { FiTrash2 } from 'react-icons/fi'
import { analytics } from '@/analytics'
import { ConfirmModal, ModalTitleWithIcon } from '@/components/form-modal'
import { LoadingText } from '@/components/loading-text'
import { AboutPage } from '@/components/about-page'
import { ComparisonIndexPage } from '@/components/comparison-index-page'
import { ComparisonPage } from '@/components/comparison-page'
import { PrivatePage } from '@/components/private-page'
import { CouncilSettingsModal } from '@/components/council-settings-modal'
import { CouncilSidebar } from '@/components/council-sidebar'
import { CouncilView } from '@/components/council-view'
import { Header } from '@/components/header'
import { NewCouncilModal } from '@/components/new-council-modal'
import { Onboarding } from '@/components/onboarding'
import { RenameCouncilModal } from '@/components/rename-council-modal'
import { SettingsPage } from '@/components/settings-page'
import { ShareVerdictModal } from '@/components/share-verdict-modal'
import { UnofficialCopyNotice } from '@/components/unofficial-copy-notice'
import { useAnalyticsPageviews } from '@/hooks/use-analytics-pageviews'
import { useApiKeys } from '@/hooks/use-api-keys'
import { useAppRoute } from '@/hooks/use-app-route'
import { useCouncilActions } from '@/hooks/use-council-actions'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useNewCouncilDeepLink } from '@/hooks/use-new-council-deep-link'
import { useOllamaReachable } from '@/hooks/use-ollama-reachable'
import { useSidebarCollapse } from '@/hooks/use-sidebar-collapse'
import { useStreamingCouncilIds } from '@/hooks/use-streaming-council-ids'
import { useTitleGenTracker } from '@/hooks/use-title-gen-tracker'
import { useTrackDemoOpened } from '@/hooks/use-track-demo-opened'
import { ensurePersistedStorage } from '@/storage/persist'
import { seedDemoCouncilsIfNeeded } from '@/storage/seed-demos'
import { logRedactedError } from '@/utils/extract-error'
import { slugify } from '@/utils/slug'
import { hasUsableModel } from '@/utils/usable-models'
import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'

export function App() {
  // Pageview reporting (route patterns only — see src/analytics/):
  // fire-and-forget with every failure swallowed, so it can sit above the
  // council shell without adding a failure mode to it.
  useAnalyticsPageviews()
  // No session, no login screen — the app is a static
  // bundle backed by IndexedDB. "Different user" = "different browser
  // profile / installed PWA". Render the council shell directly.
  return <CouncilApp />
}

function CouncilApp() {
  const [css, theme] = useStyletron()
  const isMobile = useIsMobile()
  const [councils, setCouncils] = useState<CouncilSummary[]>([])
  const [listLoaded, setListLoaded] = useState(false)
  // Active council lives in the URL fragment (`#council/<id>`) so
  // browser back/forward navigates between councils and middle-click /
  // cmd-click on a sidebar entry opens it in a new tab.
  const {
    councilId: routeCouncilId,
    aboutOpen,
    privateOpen,
    comparisonSlug,
    comparisonIndexOpen,
    demoSlug,
    settingsOpen,
    settingsTab,
    navigate: navigateToCouncil,
  } = useAppRoute()
  const routerNavigate = useNavigate()
  // /about, /private, /vs/:slug and /settings are focused full-page routes —
  // hide the council sidebar (and its header toggle) so they read as
  // standalone pages.
  const chromelessPage =
    aboutOpen ||
    settingsOpen ||
    privateOpen ||
    comparisonIndexOpen ||
    comparisonSlug !== null

  // `/demo/:slug` is the *public* address of a seeded demo council — the one
  // shape of council content that is identical for everybody, so it gets a
  // readable, indexable URL instead of the per-device `/council/<uuid>`
  // (a local id, meaningless in anyone else's browser). Resolved against the
  // live list, so deleting a demo simply stops resolving rather than
  // dangling on a hardcoded id. Slug generation must match
  // `scripts/seo-routes.mjs`, which prerenders these same paths — see
  // `tests/unit/slug.test.ts`.
  const demoCouncilId = useMemo(() => {
    if (demoSlug === null) return null
    return (
      councils.find((c) => c.isDemo && slugify(c.title ?? '') === demoSlug)
        ?.id ?? null
    )
  }, [demoSlug, councils])

  const activeId = routeCouncilId ?? demoCouncilId
  const {
    open: newCouncilOpen,
    openModal: openNewCouncilModal,
    closeModal: closeNewCouncilModal,
  } = useNewCouncilDeepLink()
  const {
    collapsed: sidebarCollapsed,
    toggle: toggleSidebar,
    close: closeSidebar,
  } = useSidebarCollapse()
  // Drives the first-run gate: do we have any model the user can actually
  // call? Reactive to BYOK keys + the opt-in Ollama ping (which only fires
  // while the Settings → Keys toggle is on), so the onboarding CTA flips
  // the moment a key is pasted or Ollama comes up.
  const keys = useApiKeys()
  const ollama = useOllamaReachable()
  const usableModel = hasUsableModel(keys, ollama.reachable)
  // Per-council settings modal (per-participant config), opened from a row's
  // ⋯ menu — holds the *target* council id (any council, not just the open
  // one). `councilConfigNonce` bumps after a save so the live session of the
  // open council re-reads its config from storage (see CouncilView).
  const [councilSettingsId, setCouncilSettingsId] = useState<string | null>(
    null,
  )
  const [councilConfigNonce, setCouncilConfigNonce] = useState(0)
  // Sidebar busy state + atomic title swap for the fire-and-forget titler.
  const { generatingTitleIds, onTitleGenStart, onTitleGenFinish } =
    useTitleGenTracker(setCouncils)
  // Sidebar busy state for in-flight runs — a live view of the
  // active-streams registry (covers runs that outlive their council view);
  // the busy row's ⋯ button wears the loading state.
  const streamingCouncilIds = useStreamingCouncilIds()

  const refreshList = useCallback(async () => {
    const list = await listCouncils()
    setCouncils(list)
    setListLoaded(true)
  }, [])

  // Row-level actions (delete / rename / share) + the modal state each
  // drives — see `hooks/use-council-actions.ts`.
  const {
    pendingDeleteId,
    pendingDeleteCouncil,
    requestDelete,
    cancelDelete,
    confirmDelete,
    pendingRenameId,
    pendingRenameCouncil,
    openRename,
    closeRename,
    renameCouncil,
    sharePayload,
    shareCouncil,
    closeShare,
  } = useCouncilActions({
    councils,
    setCouncils,
    activeId,
    navigateToCouncil,
    refreshList,
  })

  useEffect(() => {
    // Seed the demo councils (pristine profiles only — one-shot flag), then
    // load the council list. A failing IndexedDB read here (private-mode
    // quirks, a corrupted profile) must degrade to the empty sidebar state,
    // not escape as an unhandled rejection that paints the full-screen
    // error boundary before the app even mounts.
    void seedDemoCouncilsIfNeeded()
      .finally(refreshList)
      .catch((err: unknown) => {
        logRedactedError('boot council-list load', err)
        setListLoaded(true)
      })
  }, [refreshList])

  const selectActive = useCallback(
    (id: string) => {
      navigateToCouncil(id)
      // Auto-close the drawer on mobile so the freshly-selected chat
      // is visible. No-op on desktop where the sidebar stays put.
      if (isMobile) closeSidebar()
    },
    [navigateToCouncil, isMobile, closeSidebar],
  )

  // Sidebar rows navigate via <Link> (real href → cmd-click opens a new
  // tab); this handler only covers the mobile side effect of closing the
  // drawer so the freshly-selected chat is visible.
  const handleSidebarSelect = useCallback(() => {
    if (isMobile) closeSidebar()
  }, [isMobile, closeSidebar])

  const submitCouncil = useCallback(
    async (input: CreateCouncilInput) => {
      const created = await createCouncil(input)
      // Counted here (the New-council modal path) so demo seeding and
      // imports — which also create rows — never inflate the number.
      analytics.event(`council-created:${input.socialStructure}`)
      // Fire-and-forget storage-persistence upgrade so the browser
      // commits to keeping the council around. Idempotent; runs once
      // per origin and no-ops thereafter.
      void ensurePersistedStorage()
      await refreshList()
      selectActive(created.id)
    },
    [refreshList, selectActive],
  )

  const activeIsValid = useMemo(
    () => !!activeId && councils.some((c) => c.id === activeId),
    [activeId, councils],
  )

  // Count demo opens (are the seeded demos earning their place?) — one
  // event per entry into a demo, pageview-like semantics.
  useTrackDemoOpened(activeId, councils)

  // The council-settings modal is state-driven (not URL-driven), so a link
  // inside it that navigates to the Settings page — the model pickers'
  // "add key" link — would otherwise leave the modal floating over
  // Settings. Any navigation into Settings dismisses it.
  useEffect(() => {
    // Direct state clear on a route change — no cascading render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (settingsOpen) setCouncilSettingsId(null)
  }, [settingsOpen])

  // When the active hash points nowhere valid, land on the most recent
  // *real* council. With none we no longer auto-create one — the
  // <Onboarding> empty state handles first run (see README). Demo councils
  // never auto-open: a first-run visitor lands on the explainer with the
  // demos visible in the sidebar, opened deliberately.
  useEffect(() => {
    if (!listLoaded) return
    // Don't redirect away from any standalone document route (/about,
    // /private, /vs/:slug) or /settings — they're destinations in their own
    // right, and several are indexed, so a visitor arriving from search must
    // stay on the page they asked for.
    if (chromelessPage) return
    if (activeIsValid) return
    const first = councils.find((c) => !c.isDemo)
    if (first) selectActive(first.id)
  }, [listLoaded, chromelessPage, councils, activeIsValid, selectActive])

  // The council (chat) view owns its own internal padding + a pinned
  // composer, so `<main>` keeps a gutter there. Every other view is a
  // full-bleed prose scroller (About / Settings / onboarding / loading):
  // `<main>` drops its padding so their scroll viewport reaches the header
  // and footer, and each page supplies its own gutter *inside* that
  // viewport — content then scrolls flush under the chrome, no dead band.
  const isCouncilView =
    !chromelessPage && listLoaded && activeIsValid && !!activeId

  return (
    <div
      // `.app-shell` carries the definite `100dvh` height (with `100vh`
      // fallback) so the inner flex:1 area bounds its own scroll and the
      // header/footer stay fixed — see index.css.
      className={`app-shell ${css({
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      })}`}
    >
      {/* Soft clone-guard: a slim dismissible notice when the app is served
          from a non-official host — see unofficial-copy-notice.tsx for the
          full rationale. Renders nothing on yesbrainer.ai / dev hosts. */}
      <UnofficialCopyNotice />
      {/* The full-width top header is **mobile-only** now: the drawer is hidden
          on phones, so it carries fast access to the sidebar toggle, brand,
          New council and Settings. On desktop all of those live in the inline
          sidebar (and its collapsed rail), freeing the whole content column —
          there's no top header bar on desktop. */}
      {isMobile && (
        <Header
          sidebarCollapsed={sidebarCollapsed}
          activeNav={settingsOpen ? 'settings' : aboutOpen ? null : 'councils'}
          onToggleSidebar={toggleSidebar}
          onOpenSettings={() => void routerNavigate('/settings')}
          onNewCouncil={openNewCouncilModal}
        />
      )}

      <div
        className={css({
          display: 'flex',
          flex: 1,
          minHeight: 0,
        })}
      >
        {/* The council list is mounted on every page (inline on desktop, a
            Drawer overlay on mobile) so its toggle is always reachable — you
            can pop it from Settings / About, pick a council, and its <Link>
            navigates you there. */}
        <CouncilSidebar
          councils={councils}
          activeId={activeId}
          collapsed={sidebarCollapsed}
          onSelect={handleSidebarSelect}
          onCreate={openNewCouncilModal}
          onDelete={requestDelete}
          onOpenRename={openRename}
          onOpenCouncilSettings={setCouncilSettingsId}
          onShareResult={(id) => void shareCouncil(id)}
          generatingTitleIds={generatingTitleIds}
          streamingCouncilIds={streamingCouncilIds}
          onRequestClose={closeSidebar}
          onToggleSidebar={toggleSidebar}
          onOpenSettings={() => void routerNavigate('/settings')}
          settingsActive={settingsOpen}
        />

        <main
          aria-label="Council conversation"
          className={css({
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minWidth: 0,
            // The content surface (chat / About / Settings) is the primary
            // background — white in light mode — matching the header / footer.
            // Only the sidebar keeps the secondary (grey) tint.
            backgroundColor: theme.colors.backgroundPrimary,
            // Persistent vertical divider between the sidebar column and
            // the content (ChatGPT-style). Anchored to the content's left
            // edge so it stays put whether the sidebar is expanded or
            // collapsed. Desktop only — on mobile the sidebar is a Drawer
            // overlay, so there's no inline boundary to separate.
            borderLeft: isMobile
              ? 'none'
              : `1px solid ${theme.colors.borderOpaque}`,
            // Tighter chrome on phones for the chat (every horizontal
            // pixel matters for code blocks / inline images), so mobile drops
            // to 8px. Only the chat view gets `<main>` padding: prose pages
            // (About / Settings / onboarding) are full-bleed scrollers that
            // own their gutter internally so content scrolls flush under the
            // header / footer with no dead padding band (see AboutContent /
            // SettingsPage).
            // Minimal gutter for the chat: the thread is edge-to-edge (no card)
            // and owns its own inner padding, and the composer floats over it,
            // so any outer band here just steals space from the conversation.
            // Keep only a hair of horizontal breathing room; none vertically.
            paddingTop: isCouncilView ? '6px' : '0',
            paddingBottom: '0',
            paddingLeft: isCouncilView ? '6px' : '0',
            paddingRight: isCouncilView ? '6px' : '0',
            gap: '6px',
            boxSizing: 'border-box',
            [MOBILE_MEDIA_QUERY]: {
              paddingLeft: isCouncilView ? '4px' : '0',
              paddingRight: isCouncilView ? '4px' : '0',
              gap: '6px',
            },
          })}
        >
          {settingsOpen ? (
            <SettingsPage tab={settingsTab} onCouncilsChanged={refreshList} />
          ) : aboutOpen ? (
            <AboutPage demos={councils.filter((c) => c.isDemo)} />
          ) : privateOpen ? (
            <PrivatePage />
          ) : comparisonIndexOpen ? (
            <ComparisonIndexPage />
          ) : comparisonSlug !== null ? (
            <ComparisonPage slug={comparisonSlug} />
          ) : !listLoaded ? (
            <ParagraphSmall marginTop="0" marginBottom="0">
              <LoadingText>Convening</LoadingText>
            </ParagraphSmall>
          ) : activeIsValid && activeId ? (
            <CouncilView
              key={activeId}
              councilId={activeId}
              configRefreshKey={councilConfigNonce}
              onTurnAppended={() => void refreshList()}
              onTitleGenerationStarted={onTitleGenStart}
              onTitleGenerationFinished={onTitleGenFinish}
              onOpenCouncilSettings={() => setCouncilSettingsId(activeId)}
            />
          ) : councils.every((c) => c.isDemo) ? (
            // No *real* councils yet (only seeded demos, or nothing at all)
            // → the first-run explainer, with the demos reachable from the
            // sidebar and offered as "See it in action" rows on the
            // get-started card.
            <Onboarding
              hasUsableModel={usableModel}
              onCreateCouncil={openNewCouncilModal}
              demos={councils.filter((c) => c.isDemo)}
            />
          ) : (
            <ParagraphSmall marginTop="0" marginBottom="0">
              <LoadingText>Seating the council</LoadingText>
            </ParagraphSmall>
          )}
          {/* The old in-content footer (attribution / About / theme toggle)
              moved into the sidebar (see CouncilSidebar) — one home, present on
              every page and both form factors, so content columns never carry a
              fixed footer strip. */}
        </main>
      </div>

      {newCouncilOpen && (
        <NewCouncilModal
          ollama={ollama}
          onCancel={closeNewCouncilModal}
          onSubmit={async (input) => {
            // `submitCouncil` navigates to `/council/<new-id>` — a
            // query-less path that drops the `?new-council` param and so
            // closes the modal on its own. Do NOT also call
            // `closeNewCouncilModal()`: its search-only navigation resolves
            // against the render-time (pre-navigation) pathname, so it
            // `replace`s us right back onto the previously-open council —
            // the "new council is created but I'm stuck on the old chat"
            // bug. Letting the council navigation be the single source of
            // truth lands us on the new chat and dismisses the modal.
            await submitCouncil(input)
          }}
        />
      )}

      {pendingRenameId && (
        <RenameCouncilModal
          currentTitle={pendingRenameCouncil?.title ?? null}
          onCancel={closeRename}
          onSave={(title) => renameCouncil(pendingRenameId, title)}
        />
      )}

      {councilSettingsId && (
        <CouncilSettingsModal
          councilId={councilSettingsId}
          ollama={ollama}
          onClose={() => setCouncilSettingsId(null)}
          onSaved={(savedId) => {
            // If the saved council is the one currently open, nudge its live
            // session to re-read the new config from storage.
            if (savedId === activeId) setCouncilConfigNonce((n) => n + 1)
          }}
        />
      )}

      {sharePayload && (
        <ShareVerdictModal {...sharePayload} onClose={closeShare} />
      )}

      {pendingDeleteId && (
        <ConfirmModal
          title={
            // Same trash glyph as the kebab's Delete row that opens this.
            <ModalTitleWithIcon icon={<FiTrash2 size={18} aria-hidden />}>
              Delete council
            </ModalTitleWithIcon>
          }
          onCancel={cancelDelete}
          onConfirm={() => void confirmDelete()}
        >
          <ParagraphMedium marginTop="0" marginBottom="0">
            Delete{' '}
            <strong>
              "{pendingDeleteCouncil?.title ?? 'Untitled'}"
            </strong>
            ? This cannot be undone.
          </ParagraphMedium>
        </ConfirmModal>
      )}
    </div>
  )
}
