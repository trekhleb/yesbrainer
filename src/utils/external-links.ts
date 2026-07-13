/**
 * Canonical external project links, shared by every surface that points at
 * the repository (sidebar footer, /about colophon, key screens, the error
 * boundary) so the URL can't drift between them. The official domain is
 * surfaced by a *soft* notice on unrecognized hosts
 * (`unofficial-copy-notice.tsx`) — deliberately not a hard lock, which
 * wouldn't survive a malicious fork and fails dangerous.
 */
export const OFFICIAL_APP_URL = 'https://yesbrainer.ai'
export const GITHUB_REPO_URL = 'https://github.com/trekhleb/yesbrainer'
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`
/** The rendered threat model — linked from the Keys page, where the
 *  security question is actually being asked. */
export const SECURITY_DOC_URL = `${GITHUB_REPO_URL}/blob/main/SECURITY.md`
/** Deep link to SECURITY.md's "What this does NOT protect against" — the
 *  potential threats the app can't cover. Anchor must track that heading. */
export const SECURITY_THREATS_URL = `${SECURITY_DOC_URL}#what-this-does-not-protect-against`
