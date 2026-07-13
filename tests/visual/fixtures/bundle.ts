/**
 * Deterministic council fixtures for the visual suite — one export bundle
 * (the same JSON shape as Settings → Storage → "Export all councils")
 * holding five mocked councils that together exercise every persisted chat
 * state the UI can render:
 *
 *  - `vf-trial`      Trial: answers → votes (leaderboard, agreement, winner)
 *                    → Judge verdict; plus a turn with an errored voter
 *                    (retry-failed-votes affordance + raw-response inspector).
 *  - `vf-consensus-a` Consensus that converges on round 2 — divergence
 *                    framing + per-round digest, then the final summary.
 *  - `vf-parallel`   Parallel answers: markdown-rich fan-out with a
 *                    web-search tool-call strip, an image-attachment turn
 *                    with a ghosted non-vision seat, and an errored seat.
 *  - `vf-consensus-b` Consensus that hits the round cap still divergent,
 *                    plus a turn whose Mediator round errored (retry).
 *  - `vf-solo`       "Parallel of one" — the degenerate plain-chat mode,
 *                    with fenced code blocks (Shiki highlighting).
 *
 * Everything is static data with fixed ids and timestamps, so the seeded
 * app renders identically run to run. The bundle is injected through the
 * app's own import path (zod-validated), so schema drift fails the seed
 * step loudly rather than silently skewing screenshots.
 */

/*
 * Local structural mirrors of the app's council types (src/types/council.ts
 * + the bundle envelope in src/storage/transfer.ts). The tests project
 * can't type-import across the `tsc -b` project-reference boundary (the app
 * project emits no declarations), so the shapes live here — and the REAL
 * drift guard is runtime anyway: seed.setup.ts pushes this bundle through
 * the app's zod-validated import and asserts "0 errors".
 */

interface TokenUsage {
  input: number
  output: number
}

interface TokenTotals {
  inputTokens: number
  outputTokens: number
}

interface VoteEntry {
  targetSeatId: string
  ratings: Record<string, number>
  comment: string
}

interface MovementEntry {
  label: string
  stance: 'converged' | 'shifted' | 'held' | 'new-point'
  note: string
}

interface RoundDigest {
  summary: string
  movements: MovementEntry[]
}

interface MediatorRoundMetadata {
  round: number
  convergent: boolean
  divergencePoints?: string
  roundDigest?: RoundDigest
}

interface ToolCallSummary {
  name: string
  query?: string
}

interface TurnEvent {
  id: string
  roleType: 'participant' | 'reanswer' | 'vote' | 'judge' | 'mediator'
  seatId?: string
  modelId: string
  output: string
  ts: number
  round?: number
  tokens?: TokenUsage
  error?: string
  vote?: VoteEntry[]
  rawResponse?: string
  mediator?: MediatorRoundMetadata
  toolCalls?: ToolCallSummary[]
}

interface Turn {
  id: string
  idx: number
  userMsg: string
  events: TurnEvent[]
  tokenTotal: TokenTotals
  votingLabels?: Record<string, string>
  userImages?: string[]
}

interface Seat {
  id: string
  modelId: string
  config: Record<string, never>
}

interface Council {
  id: string
  title: string | null
  createdAt: number
  socialStructure: 'roundtable' | 'trial' | 'consensus'
  seats: Seat[]
  turns: Turn[]
  tokenTotal: TokenTotals
  judge?: { modelId: string; config: Record<string, never> }
  mediator?: { modelId: string; config: Record<string, never> }
}

export interface CouncilBundleV1 {
  version: 1
  exportedAt: number
  councils: Council[]
}

/** Data-URI images generated in-page by the seed setup (canvas drawings —
 *  a portfolio chart and a statement table) for the image-attachment turn. */
export interface FixtureImages {
  chart: string
  statement: string
}

export const COUNCIL_IDS = {
  trial: 'vf-trial',
  consensusA: 'vf-consensus-a',
  parallel: 'vf-parallel',
  consensusB: 'vf-consensus-b',
  solo: 'vf-solo',
} as const

/** Fixed "now" for the fixtures: 2026-06-28T12:00:00Z. */
const T0 = Date.UTC(2026, 5, 28, 12, 0, 0)
const MIN = 60_000
const DAY = 24 * 60 * MIN

let eventSeq = 0
function ev(
  partial: Omit<TurnEvent, 'id' | 'ts' | 'tokens'> & {
    ts?: number
    tokens?: TokenUsage
  },
): TurnEvent {
  eventSeq += 1
  // Tokens are derived from the output length, NOT the global sequence, so
  // reordering or editing councils never ripples the "N tok" labels shown
  // across other councils' panes/headers — each event's count is stable on
  // its own content. Errored events carry no usage: the app never
  // fabricates counts for aborted streams, so the fixtures shouldn't either.
  const outLen = partial.output.length
  return {
    id: `vf-ev-${String(eventSeq).padStart(3, '0')}`,
    ts: T0,
    ...(partial.error
      ? {}
      : {
          tokens: {
            input: 620 + (partial.seatId ? partial.seatId.length * 30 : 210),
            output: 40 + Math.round(outLen / 4),
          },
        }),
    ...partial,
  }
}

const zeroTotals = { inputTokens: 0, outputTokens: 0 }

function seat(id: string, modelId: string): Seat {
  return { id, modelId, config: {} }
}

/* ------------------------------------------------------------------ */
/* Trial — monolith vs microservices                                   */
/* ------------------------------------------------------------------ */

function trialCouncil(): Council {
  const seats = [
    seat('vf-t-s1', 'anthropic:claude-sonnet-5'),
    seat('vf-t-s2', 'openai:gpt-5.4'),
    seat('vf-t-s3', 'google:gemini-3.5-flash'),
  ]

  const answers1: TurnEvent[] = [
    ev({
      roleType: 'participant',
      seatId: 'vf-t-s1',
      modelId: 'anthropic:claude-sonnet-5',
      output: [
        '**Modular monolith, without hesitation.** At five people the dominant cost is coordination, and microservices multiply exactly that.',
        '',
        'Concretely:',
        '',
        '1. **One deployable, strict module boundaries.** Enforce them with import-lint rules, not network calls.',
        '2. **One database, schema-per-module.** You keep transactions and lose the distributed-saga headache.',
        '3. **Extract a service only on evidence** — a hot path that scales differently, or a team that truly owns it end to end.',
        '',
        'The teams that regret monoliths usually regret *spaghetti*, not the single deployable. Boundaries are the thing to invest in; the process count is incidental.',
      ].join('\n'),
    }),
    ev({
      roleType: 'participant',
      seatId: 'vf-t-s2',
      modelId: 'openai:gpt-5.4',
      output: [
        'Go **monolith-first**, but make three commitments so the door to services stays open:',
        '',
        '- **Contract-shaped internals.** Modules talk through typed interfaces, never reach into each other’s tables.',
        '- **Async where it’s already async.** A single queue for emails/webhooks now; that seam becomes a service cheaply later.',
        '- **One-command deploys.** If deploys hurt at *one* service, they’ll be unbearable at ten.',
        '',
        'Cost check: a 5-person team running 8 services spends roughly a third of its time on infra chores (dashboards, versioned APIs, staging drift). That’s a co-founder’s worth of attention paid for scaling you don’t have yet.',
      ].join('\n'),
    }),
    ev({
      roleType: 'participant',
      seatId: 'vf-t-s3',
      modelId: 'google:gemini-3.5-flash',
      output: [
        'The honest answer is **it depends on your hiring plan**, but at five engineers the base rate favors the monolith.',
        '',
        '| Factor | Monolith | Microservices |',
        '|---|---|---|',
        '| Deploy complexity | one pipeline | N pipelines + orchestration |',
        '| Local dev | `npm run dev` | docker-compose sprawl |',
        '| Refactors across features | one PR | cross-repo choreography |',
        '| Independent scaling | coarse | fine-grained |',
        '',
        'The single scenario that flips the answer: a component with a *hard* isolation requirement (an untrusted-code runner, a GPU inference path). Carve that one out; keep the rest together.',
      ].join('\n'),
    }),
  ]

  const votes1: TurnEvent[] = [
    ev({
      roleType: 'vote',
      seatId: 'vf-t-s1',
      modelId: 'anthropic:claude-sonnet-5',
      output: '',
      vote: [
        {
          targetSeatId: 'vf-t-s2',
          ratings: { accuracy: 5, completeness: 4, insight: 5 },
          comment:
            'The "a third of its time on infra chores" cost framing is the most decision-useful point any answer made.',
        },
        {
          targetSeatId: 'vf-t-s3',
          ratings: { accuracy: 4, completeness: 4, insight: 3 },
          comment:
            'Fair comparison table, but "it depends on hiring" hedges where the evidence already points one way.',
        },
      ],
    }),
    ev({
      roleType: 'vote',
      seatId: 'vf-t-s2',
      modelId: 'openai:gpt-5.4',
      output: '',
      vote: [
        {
          targetSeatId: 'vf-t-s1',
          ratings: { accuracy: 5, completeness: 5, insight: 4 },
          comment:
            'Schema-per-module inside one database is the practical middle path; the extract-on-evidence rule is the right default.',
        },
        {
          targetSeatId: 'vf-t-s3',
          ratings: { accuracy: 4, completeness: 3, insight: 3 },
          comment:
            'The isolation-requirement exception is a genuinely useful carve-out, but the answer stops short of a recommendation.',
        },
      ],
    }),
    ev({
      roleType: 'vote',
      seatId: 'vf-t-s3',
      modelId: 'google:gemini-3.5-flash',
      output: '',
      vote: [
        {
          targetSeatId: 'vf-t-s1',
          ratings: { accuracy: 5, completeness: 4, insight: 5 },
          comment:
            'Naming coordination cost as the dominant cost at this team size reframes the whole question correctly.',
        },
        {
          targetSeatId: 'vf-t-s2',
          ratings: { accuracy: 4, completeness: 4, insight: 4 },
          comment:
            'The three commitments are actionable and keep future options open — a solid, concrete plan.',
        },
      ],
    }),
  ]

  const judge1 = ev({
    roleType: 'judge',
    modelId: 'anthropic:claude-opus-4-8',
    output: [
      '## Verdict: modular monolith',
      '',
      'All three Participants converge on the same recommendation, and the peer votes bear it out. Build a **single deployable with strictly enforced module boundaries**, one database with schema-per-module ownership, and a single async queue for the work that is already asynchronous.',
      '',
      '**Why this is robust:** the strongest argument across answers is that at five engineers your scarcest resource is coordination, and a service mesh taxes exactly that. The strongest counterpoint — hard isolation requirements — was addressed directly: carve out *that one component* if and when it appears.',
      '',
      '**Revisit when** a module shows a materially different scaling profile, or a sub-team truly owns one domain end to end. Until then, invest in boundaries, not process count.',
    ].join('\n'),
  })

  const answers2: TurnEvent[] = [
    ev({
      roleType: 'participant',
      seatId: 'vf-t-s1',
      modelId: 'anthropic:claude-sonnet-5',
      output:
        'Keep a single repo with `modules/<domain>` as the top-level unit. Each module exports a typed public API from its `index.ts`; everything else is private by lint rule. Shared kernel (auth, config, telemetry) lives in `platform/` and may not import from modules.',
    }),
    ev({
      roleType: 'participant',
      seatId: 'vf-t-s2',
      modelId: 'openai:gpt-5.4',
      output:
        'Structure by domain, not by layer: `billing/`, `accounts/`, `notifications/` — each owning its routes, jobs, and schema migrations. A thin `app/` folder wires them together. Resist a `utils/` catch-all; it becomes the coupling point every extraction later has to untangle.',
    }),
    ev({
      roleType: 'participant',
      seatId: 'vf-t-s3',
      modelId: 'google:gemini-3.5-flash',
      output:
        'Two additions to the domain-module layout: (1) generate a dependency graph in CI and fail on new cross-module imports; (2) give each module a `README` stating its public contract — the cheapest architecture documentation you will ever write.',
    }),
  ]

  const votes2: TurnEvent[] = [
    ev({
      roleType: 'vote',
      seatId: 'vf-t-s1',
      modelId: 'anthropic:claude-sonnet-5',
      output: '',
      vote: [
        {
          targetSeatId: 'vf-t-s2',
          ratings: { accuracy: 5, completeness: 4, insight: 4 },
          comment: 'The utils/ warning is earned wisdom — that is where module boundaries go to die.',
        },
        {
          targetSeatId: 'vf-t-s3',
          ratings: { accuracy: 5, completeness: 3, insight: 4 },
          comment: 'CI-enforced import graph is the teeth the whole plan needs.',
        },
      ],
    }),
    ev({
      roleType: 'vote',
      seatId: 'vf-t-s2',
      modelId: 'openai:gpt-5.4',
      output: '',
      vote: [
        {
          targetSeatId: 'vf-t-s1',
          ratings: { accuracy: 5, completeness: 4, insight: 4 },
          comment: 'The platform/-may-not-import-modules rule cleanly prevents the circular-dependency trap.',
        },
        {
          targetSeatId: 'vf-t-s3',
          ratings: { accuracy: 4, completeness: 4, insight: 4 },
          comment: 'Per-module contract READMEs are cheap and genuinely maintainable documentation.',
        },
      ],
    }),
    ev({
      roleType: 'vote',
      seatId: 'vf-t-s3',
      modelId: 'google:gemini-3.5-flash',
      output: '',
      error:
        'Google AI Studio: 429 RESOURCE_EXHAUSTED — Quota exceeded for gemini-2.5-pro. Retry after 34s.',
      rawResponse: JSON.stringify(
        {
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'Quota exceeded for quota metric: GenerateContent requests per minute',
            details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '34s' }],
          },
        },
        null,
        2,
      ),
    }),
  ]

  const turns: Turn[] = [
    {
      id: 'vf-t-turn1',
      idx: 0,
      userMsg:
        'Should our five-person startup build the product as a monolith or as microservices? We expect moderate B2B traffic, one product surface, and we want to ship weekly.',
      events: [...answers1, ...votes1, judge1],
      tokenTotal: zeroTotals,
      votingLabels: { A: 'vf-t-s1', B: 'vf-t-s2', C: 'vf-t-s3' },
    },
    {
      id: 'vf-t-turn2',
      idx: 1,
      userMsg:
        'Given we go with the modular monolith — how should we structure the repository?',
      events: [...answers2, ...votes2],
      tokenTotal: zeroTotals,
      votingLabels: { A: 'vf-t-s3', B: 'vf-t-s1', C: 'vf-t-s2' },
    },
  ]

  return {
    id: COUNCIL_IDS.trial,
    title: 'Monolith vs microservices for a five-person team',
    createdAt: T0 - 4 * MIN,
    socialStructure: 'trial',
    seats,
    turns,
    tokenTotal: zeroTotals,
    judge: { modelId: 'anthropic:claude-opus-4-8', config: {} },
  }
}

/* ------------------------------------------------------------------ */
/* Consensus A — converges on round 2                                  */
/* ------------------------------------------------------------------ */

function consensusConvergedCouncil(): Council {
  const seats = [
    seat('vf-ca-s1', 'anthropic:claude-sonnet-5'),
    seat('vf-ca-s2', 'openai:gpt-5.4'),
    seat('vf-ca-s3', 'google:gemini-3.5-flash'),
  ]

  const round1: TurnEvent[] = [
    ev({
      roleType: 'participant',
      seatId: 'vf-ca-s1',
      modelId: 'anthropic:claude-sonnet-5',
      output:
        '**Remote-first.** Your team already spans three time zones; pretending the office is the center of gravity taxes the people who are not in it. Write decisions down, make meetings opt-in, and use quarterly on-sites for the trust-building an office is supposed to provide.',
    }),
    ev({
      roleType: 'participant',
      seatId: 'vf-ca-s2',
      modelId: 'openai:gpt-5.4',
      output:
        '**Hybrid, three anchored days.** Early-stage products live on unplanned conversations. Tue–Thu in office gives you the serendipity while keeping two quiet days. Remote-first works for disciplined senior teams; with juniors onboarding next quarter, apprenticeship over a shoulder beats apprenticeship over a screen.',
    }),
    ev({
      roleType: 'participant',
      seatId: 'vf-ca-s3',
      modelId: 'google:gemini-3.5-flash',
      output:
        'Neither extreme: **decide by activity, not by attendance**. Deep work is remote by default; kickoffs, retros, and onboarding weeks are in person. Publish which activities anchor people, and let the calendar — not a blanket rule — pull people in.',
    }),
  ]

  const mediatorR1 = ev({
    roleType: 'mediator',
    modelId: 'anthropic:claude-opus-4-8',
    output:
      'No consensus yet. All three agree that documentation quality, not attendance, is the real constraint — but they split on whether presence should be scheduled (Model B), activity-driven (Model C), or exceptional (Model A). The junior-onboarding question is the live disagreement: only Model B treats it as decisive.',
    round: 1,
    mediator: {
      round: 1,
      convergent: false,
      divergencePoints:
        '1) Should office days be *scheduled* (anchored days) or *pulled by activity*? 2) Does next quarter’s junior onboarding require regular physical co-presence, or does structured pairing cover it? 3) Who pays the coordination cost when time zones make anchored days unequal?',
      roundDigest: {
        summary:
          'Positions opened wide apart: Model A argued remote-first with on-sites, Model B anchored hybrid days, Model C an activity-based rule.',
        movements: [
          { label: 'A', stance: 'new-point', note: 'Time-zone spread makes office-centric defaults inequitable.' },
          { label: 'B', stance: 'new-point', note: 'Junior onboarding next quarter needs shoulder-to-shoulder time.' },
          { label: 'C', stance: 'new-point', note: 'Tie presence to activities (kickoffs, retros, onboarding), not weekdays.' },
        ],
      },
    },
  })

  const round2: TurnEvent[] = [
    ev({
      roleType: 'reanswer',
      seatId: 'vf-ca-s1',
      modelId: 'anthropic:claude-sonnet-5',
      round: 2,
      output:
        'I move toward the activity-based frame: remote by default, with *named* in-person activities — onboarding weeks, quarterly planning, retros. That concedes the onboarding point without re-centering the office. The key is that the activity list is finite and published.',
    }),
    ev({
      roleType: 'reanswer',
      seatId: 'vf-ca-s2',
      modelId: 'openai:gpt-5.4',
      round: 2,
      output:
        'I can drop fixed anchor days if onboarding gets explicit in-person structure: new hires spend their first four weeks co-located with a rotating buddy, and each team holds an in-person kickoff per cycle. Activity-based presence with those two guarantees covers my concern.',
    }),
    ev({
      roleType: 'reanswer',
      seatId: 'vf-ca-s3',
      modelId: 'google:gemini-3.5-flash',
      round: 2,
      output:
        'Holding my position, now with the others’ additions folded in: activity-based presence, a published activity list (kickoffs, retros, onboarding weeks, quarterly planning), and a documentation-first rule so remote stays the default rather than the fallback.',
    }),
  ]

  const mediatorR2 = ev({
    roleType: 'mediator',
    modelId: 'anthropic:claude-opus-4-8',
    output: [
      '## Consensus reached',
      '',
      'The council converged on an **activity-based presence policy with a remote-first default**:',
      '',
      '- Deep work is remote by default; documentation-first is the operating rule.',
      '- A finite, published list of in-person activities: team kickoffs, retros, onboarding weeks, and quarterly planning on-sites.',
      '- New hires get four co-located weeks with a rotating buddy — the onboarding guarantee that unlocked agreement.',
      '',
      'Remaining nuance (not a blocker): revisit the activity list once the junior cohort lands, in case apprenticeship needs more contact than planned.',
    ].join('\n'),
    round: 2,
    mediator: {
      round: 2,
      convergent: true,
      roundDigest: {
        summary:
          'Model A and Model B both moved to Model C’s activity-based frame once onboarding got explicit in-person guarantees.',
        movements: [
          { label: 'A', stance: 'shifted', note: 'Accepted named in-person activities over pure remote-first.' },
          { label: 'B', stance: 'converged', note: 'Dropped anchored days in exchange for structured onboarding co-location.' },
          { label: 'C', stance: 'held', note: 'Activity-based rule adopted as the shared frame.' },
        ],
      },
    },
  })

  return {
    id: COUNCIL_IDS.consensusA,
    title: 'Remote-first or hybrid: setting the work policy',
    createdAt: T0 - 2 * DAY,
    socialStructure: 'consensus',
    seats,
    turns: [
      {
        id: 'vf-ca-turn1',
        idx: 0,
        userMsg:
          'We are a 20-person company deciding our long-term work policy: remote-first or hybrid with office days? Half the team was hired remote; we open a small office next month and have junior hires starting next quarter.',
        events: [...round1, mediatorR1, ...round2, mediatorR2],
        tokenTotal: zeroTotals,
        votingLabels: { A: 'vf-ca-s1', B: 'vf-ca-s2', C: 'vf-ca-s3' },
      },
    ],
    tokenTotal: zeroTotals,
    mediator: { modelId: 'anthropic:claude-opus-4-8', config: {} },
  }
}

/* ------------------------------------------------------------------ */
/* Parallel — Roth conversion, tool calls, images, errored seat        */
/* ------------------------------------------------------------------ */

function parallelCouncil(images: FixtureImages): Council {
  const seats = [
    seat('vf-p-s1', 'anthropic:claude-sonnet-5'),
    seat('vf-p-s2', 'openai:gpt-5.4'),
    seat('vf-p-s3', 'google:gemini-3.5-flash'),
    seat('vf-p-s4', 'groq:llama-3.3-70b'),
  ]

  const turn1: Turn = {
    id: 'vf-p-turn1',
    idx: 0,
    userMsg:
      'Is converting part of my traditional IRA to Roth this year a no-brainer? Married filing jointly, AGI around $140k, and I expect higher income (and possibly higher rates) later in my career.',
    events: [
      ev({
        roleType: 'participant',
        seatId: 'vf-p-s1',
        modelId: 'anthropic:claude-sonnet-5',
        output: [
          'Not a no-brainer, but likely favorable. The decision hinges on your *marginal rate now vs. in retirement*, and your setup leans "convert some":',
          '',
          '| Bracket (MFJ, 2026) | Rate | Headroom from $140k AGI |',
          '|---|---|---|',
          '| up to ~$206k | 22% | ~$66k |',
          '| ~$206k–$394k | 24% | next tier |',
          '',
          '**A partial conversion that fills the 22% bracket** (~$60k or so, after deductions) is the classic move: you prepay tax at a known moderate rate against a future you expect to be higher.',
          '',
          'Two cautions: the conversion itself raises AGI (watch credit phase-outs), and you need cash *outside* the IRA to pay the tax — paying it from the converted funds undercuts most of the benefit.',
        ].join('\n'),
      }),
      ev({
        roleType: 'participant',
        seatId: 'vf-p-s2',
        modelId: 'openai:gpt-5.4',
        output: [
          'Mostly yes, with sizing discipline. Current MFJ brackets put you mid-22%; if you believe rates revert higher or your income grows, converting up to the top of the 22% bracket is cheap insurance.',
          '',
          'Checklist before you pull the trigger:',
          '',
          '- [ ] Cash on hand (taxable account) to cover ~22% of the converted amount',
          '- [ ] No large capital-gains events this year that stack on top',
          '- [ ] ACA/IRMAA cliffs not in play at your age — conversions count as income',
          '- [ ] State tax: if you might retire in a no-income-tax state, that argues for *waiting*',
          '',
          'The one scenario where this is a clear "no": you expect *lower* income within a couple of years (sabbatical, startup) — save the conversion for that valley.',
        ].join('\n'),
        toolCalls: [
          { name: 'web_search', query: '2026 MFJ federal tax brackets Roth conversion' },
        ],
      }),
      ev({
        roleType: 'participant',
        seatId: 'vf-p-s3',
        modelId: 'google:gemini-3.5-flash',
        output:
          'Short version: **convert to the top of your current bracket, no further.** The math only turns against you if your retirement rate ends up *lower* than 22% — plausible if you retire early and live off taxable savings first. If your trajectory is "higher income later," partial conversion now is the right side of the bet. Do it late in the year when your income picture is certain.',
      }),
      ev({
        roleType: 'participant',
        seatId: 'vf-p-s4',
        modelId: 'groq:llama-3.3-70b',
        output:
          'Consider it, but not blindly. Key factors: (1) marginal rate arbitrage — 22% now vs your expected retirement rate; (2) time horizon — the longer the Roth compounds tax-free, the better the deal; (3) tax payment source — outside cash only. A staged approach (convert a slice each year for several years) smooths the risk of guessing wrong about future rates.',
      }),
    ],
    tokenTotal: zeroTotals,
  }

  const turn2: Turn = {
    id: 'vf-p-turn2',
    idx: 1,
    userMsg:
      'Here is my current brokerage allocation and the year-to-date statement — does the picture change the sizing?',
    userImages: [images.chart, images.statement],
    events: [
      ev({
        roleType: 'participant',
        seatId: 'vf-p-s1',
        modelId: 'anthropic:claude-sonnet-5',
        output:
          'The allocation changes the *mechanics* more than the answer. Your taxable account is ~60% equities with sizeable unrealized gains — good: that is the cash source for the conversion tax without selling winners (use the cash sleeve and incoming dividends). The bond-heavy IRA is actually the ideal conversion candidate: converting assets with lower expected growth "wastes" less of the bracket headroom.',
      }),
      ev({
        roleType: 'participant',
        seatId: 'vf-p-s2',
        modelId: 'openai:gpt-5.4',
        output:
          'Two things in the statement matter: the ~$9k of realized gains YTD stacks on top of any conversion — so a full-bracket fill would spill into 24%. Size the conversion to (bracket top − AGI − realized gains), roughly $50k on these numbers. And the cash position covers the tax bill with margin to spare, which removes the main practical objection.',
      }),
      ev({
        roleType: 'participant',
        seatId: 'vf-p-s3',
        modelId: 'google:gemini-3.5-flash',
        output:
          'The chart shows concentration in two tech positions (~35% combined). That is a separate risk conversation, but it interacts here: if you plan to diversify those positions, the capital gains you realize will compete with conversion headroom for years. Decide the diversification schedule *first*, then size conversions into what remains of the bracket.',
      }),
    ],
    tokenTotal: zeroTotals,
  }

  const turn3: Turn = {
    id: 'vf-p-turn3',
    idx: 2,
    userMsg: 'Summarize the recommendation in one short paragraph.',
    events: [
      ev({
        roleType: 'participant',
        seatId: 'vf-p-s1',
        modelId: 'anthropic:claude-sonnet-5',
        output:
          'Convert a slice of the traditional IRA this year — sized to fill the remaining 22% bracket after your realized gains, roughly $50k — paying the tax from taxable cash, late in the year once income is certain. Repeat annually; revisit if a low-income year appears.',
      }),
      ev({
        roleType: 'participant',
        seatId: 'vf-p-s2',
        modelId: 'openai:gpt-5.4',
        output:
          'Yes to a partial conversion: top of the 22% bracket, minus this year’s realized gains — about $50k — with the tax paid from your cash sleeve. Not a no-brainer, but on your numbers it is the favorable side of the bet.',
      }),
      ev({
        roleType: 'participant',
        seatId: 'vf-p-s3',
        modelId: 'google:gemini-3.5-flash',
        output: '',
        error:
          'Google AI Studio: 429 RESOURCE_EXHAUSTED — Quota exceeded for gemini-2.5-flash. Retry in 21s.',
      }),
      ev({
        roleType: 'participant',
        seatId: 'vf-p-s4',
        modelId: 'groq:llama-3.3-70b',
        output:
          'Partial Roth conversion this year is sensible: fill the 22% bracket (≈$50k given realized gains), pay tax from outside cash, and stage further conversions annually to hedge rate uncertainty.',
      }),
    ],
    tokenTotal: zeroTotals,
  }

  return {
    id: COUNCIL_IDS.parallel,
    title: 'Roth conversion timing for the 2026 tax year',
    createdAt: T0 - 4 * DAY,
    socialStructure: 'roundtable',
    seats,
    turns: [turn1, turn2, turn3],
    tokenTotal: zeroTotals,
  }
}

/* ------------------------------------------------------------------ */
/* Consensus B — round cap hit, mediator error                         */
/* ------------------------------------------------------------------ */

function consensusCapHitCouncil(): Council {
  const seats = [
    seat('vf-cb-s1', 'anthropic:claude-haiku-4-5'),
    seat('vf-cb-s2', 'groq:llama-3.3-70b'),
  ]

  const t1: TurnEvent[] = [
    ev({
      roleType: 'participant',
      seatId: 'vf-cb-s1',
      modelId: 'anthropic:claude-haiku-4-5',
      output:
        '**"Scribe."** It names the job (it writes things down for you), it verbs naturally ("scribe this meeting"), and it stays dignified in enterprise contexts. "Echo" describes a side effect, not a benefit — and it collides with Amazon’s assistant in users’ heads.',
    }),
    ev({
      roleType: 'participant',
      seatId: 'vf-cb-s2',
      modelId: 'groq:llama-3.3-70b',
      output:
        '**"Echo."** It captures what users actually get — the meeting played back, condensed. "Scribe" reads as a person’s job title and several products already use it (a crowded trademark space). Echo is shorter, more memorable, and the Amazon association has faded for B2B software buyers.',
    }),
    ev({
      roleType: 'mediator',
      modelId: 'google:gemini-3.5-flash',
      output:
        'No convergence. The disagreement is really about naming criteria: Model A optimizes for describing the *action*, Model B for describing the *artifact*. The trademark question cuts both ways and neither has evidence.',
      round: 1,
      mediator: {
        round: 1,
        convergent: false,
        divergencePoints:
          '1) Should the name describe the action (writing) or the artifact (the played-back summary)? 2) Which collision is worse — "Scribe" in a crowded product space, or "Echo" vs Amazon? 3) No agreed evaluation criteria yet.',
        roundDigest: {
          summary: 'Both held their openers; the real split is over naming criteria.',
          movements: [
            { label: 'A', stance: 'held', note: 'Action-naming and enterprise tone favor Scribe.' },
            { label: 'B', stance: 'held', note: 'Artifact-naming and memorability favor Echo.' },
          ],
        },
      },
    }),
    ev({
      roleType: 'reanswer',
      seatId: 'vf-cb-s1',
      modelId: 'anthropic:claude-haiku-4-5',
      round: 2,
      output:
        'Accepting the criteria frame: on *distinctiveness* Echo scores poorly (Amazon, plus "echo" is a common tech term — echo chambers, echo cancellation). Scribe’s collisions are small startups, not a household brand. I hold: **Scribe**, with "Meeting Scribe" as the disambiguated form if trademark search demands it.',
    }),
    ev({
      roleType: 'reanswer',
      seatId: 'vf-cb-s2',
      modelId: 'groq:llama-3.3-70b',
      round: 2,
      output:
        'On criteria I weight *memorability* and *shortness* first for a feature (not a standalone product) name — features live in menus. Echo wins those. Conceding one point: if the company ever spins this into a standalone product, Scribe’s verb-ability becomes more valuable. For a feature: **Echo**.',
    }),
    ev({
      roleType: 'mediator',
      modelId: 'google:gemini-3.5-flash',
      output:
        'Still divergent — but narrower. Both now use the same criteria (distinctiveness, memorability, verb-ability), and both agree the answer differs for a *feature* vs a *standalone product*. The residual disagreement is the weighting.',
      round: 2,
      mediator: {
        round: 2,
        convergent: false,
        divergencePoints:
          'Weighting: Model A puts distinctiveness first (favors Scribe); Model B puts in-menu memorability first (favors Echo). Both accept the feature-vs-product distinction as decisive context.',
        roundDigest: {
          summary: 'Criteria converged; weights did not.',
          movements: [
            { label: 'A', stance: 'shifted', note: 'Adopted the shared criteria; offered "Meeting Scribe" fallback.' },
            { label: 'B', stance: 'shifted', note: 'Conceded verb-ability matters if this becomes a product.' },
          ],
        },
      },
    }),
    ev({
      roleType: 'reanswer',
      seatId: 'vf-cb-s1',
      modelId: 'anthropic:claude-haiku-4-5',
      round: 3,
      output:
        'Final position: Scribe. A feature name still surfaces in search, docs, and support tickets — distinctiveness keeps mattering after the menu. I acknowledge Echo is the snappier menu label.',
    }),
    ev({
      roleType: 'reanswer',
      seatId: 'vf-cb-s2',
      modelId: 'groq:llama-3.3-70b',
      round: 3,
      output:
        'Final position: Echo for the feature today; revisit if it becomes a standalone product. If the team can only stomach one name forever, I would accept Scribe as the compromise — but under protest on memorability.',
    }),
    ev({
      roleType: 'mediator',
      modelId: 'google:gemini-3.5-flash',
      output: [
        '## No consensus at the round cap',
        '',
        '**Agreed:** the evaluation criteria (distinctiveness, memorability, verb-ability); that the feature-vs-product framing is decisive; that "Meeting Scribe" is a workable disambiguated fallback; and that Echo is the better pure menu label.',
        '',
        '**Still contested:** the weighting. Model A holds that distinctiveness dominates even for features (search, docs, support); Model B holds that menu memorability dominates for features and would only fully endorse Scribe for a standalone product.',
        '',
        '**Practical read:** if a single permanent name must be chosen now, Scribe carries the lower long-term risk and Model B has signaled it is an acceptable compromise.',
      ].join('\n'),
      round: 3,
      mediator: {
        round: 3,
        convergent: false,
        divergencePoints:
          'Criterion weighting only: distinctiveness-first (Scribe) vs memorability-first (Echo).',
        roundDigest: {
          summary: 'Positions final; the cap was reached with a narrowed, well-defined disagreement.',
          movements: [
            { label: 'A', stance: 'held', note: 'Distinctiveness governs even feature names.' },
            { label: 'B', stance: 'held', note: 'Echo for a feature; Scribe acceptable as compromise.' },
          ],
        },
      },
    }),
  ]

  const t2: TurnEvent[] = [
    ev({
      roleType: 'participant',
      seatId: 'vf-cb-s1',
      modelId: 'anthropic:claude-haiku-4-5',
      output:
        '"Recap" splits the difference: artifact-named like Echo, but more distinctive in a meetings context and it verbs ("recap the standup"). Worth a trademark glance.',
    }),
    ev({
      roleType: 'participant',
      seatId: 'vf-cb-s2',
      modelId: 'groq:llama-3.3-70b',
      output:
        '"Recap" works for me — short, memorable, describes the artifact, and no big-brand collision. It might be *too* generic to protect, but as a feature label that is a modest concern.',
    }),
    ev({
      roleType: 'mediator',
      modelId: 'google:gemini-3.5-flash',
      output: '',
      round: 1,
      error:
        'Gemini API: 503 UNAVAILABLE — The service is temporarily overloaded. Please retry.',
      rawResponse: JSON.stringify(
        {
          error: {
            code: 503,
            status: 'UNAVAILABLE',
            message: 'The service is temporarily overloaded. Please retry.',
          },
        },
        null,
        2,
      ),
      mediator: { round: 1, convergent: false },
    }),
  ]

  return {
    id: COUNCIL_IDS.consensusB,
    title: 'Naming the meeting-notes feature',
    createdAt: T0 - 6 * DAY,
    socialStructure: 'consensus',
    seats,
    turns: [
      {
        id: 'vf-cb-turn1',
        idx: 0,
        userMsg:
          'Help us pick a name for the new AI meeting-notes feature. The shortlist is "Scribe" and "Echo". Debate it properly — I want the tradeoffs, not a coin flip.',
        events: t1,
        tokenTotal: zeroTotals,
        votingLabels: { A: 'vf-cb-s1', B: 'vf-cb-s2' },
      },
      {
        id: 'vf-cb-turn2',
        idx: 1,
        userMsg: 'Is there a middle-ground name that satisfies both criteria?',
        events: t2,
        tokenTotal: zeroTotals,
        votingLabels: { A: 'vf-cb-s2', B: 'vf-cb-s1' },
      },
    ],
    tokenTotal: zeroTotals,
    mediator: { modelId: 'google:gemini-3.5-flash', config: {} },
  }
}

/* ------------------------------------------------------------------ */
/* Solo — "Parallel of one" plain chat with code blocks               */
/* ------------------------------------------------------------------ */

function soloCouncil(): Council {
  return {
    id: COUNCIL_IDS.solo,
    title: 'ISO-8601 date validation regex',
    createdAt: T0 - 8 * DAY,
    socialStructure: 'roundtable',
    seats: [seat('vf-so-s1', 'openai:gpt-5.4-mini')],
    turns: [
      {
        id: 'vf-so-turn1',
        idx: 0,
        userMsg:
          'Write a regex that validates ISO-8601 calendar dates (YYYY-MM-DD), with a short explanation.',
        events: [
          ev({
            roleType: 'participant',
            seatId: 'vf-so-s1',
            modelId: 'openai:gpt-5.4-mini',
            output: [
              'Here is a pragmatic version that rejects impossible months and days:',
              '',
              '```js',
              'const ISO_DATE =',
              '  /^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$/',
              '',
              'ISO_DATE.test("2026-06-28") // true',
              'ISO_DATE.test("2026-13-01") // false (month 13)',
              'ISO_DATE.test("2026-1-1")   // false (not zero-padded)',
              '```',
              '',
              '**How it reads:** four digits for the year; month `01–12` (`0[1-9]` or `1[0-2]`); day `01–31` (`0[1-9]`, `[12]\\d`, or `3[01]`).',
              '',
              'Note the honest limitation: it accepts `2026-02-31`. Month-aware day validation is where regex stops being the right tool — parse and check with a date library if that matters.',
            ].join('\n'),
          }),
        ],
        tokenTotal: zeroTotals,
      },
      {
        id: 'vf-so-turn2',
        idx: 1,
        userMsg: 'Extend it to accept an optional time component.',
        events: [
          ev({
            roleType: 'participant',
            seatId: 'vf-so-s1',
            modelId: 'openai:gpt-5.4-mini',
            output: [
              'Append an optional `T…` group for time (with optional seconds and a `Z`/offset suffix):',
              '',
              '```js',
              'const ISO_DATETIME =',
              '  /^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])' +
                '(T([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?(Z|[+-]([01]\\d|2[0-3]):[0-5]\\d)?)?$/',
              '```',
              '',
              'Everything after the date sits in one optional group, so plain dates still pass. Hours are `00–23`, minutes/seconds `00–59`, and the timezone is `Z` or `±HH:MM`. Same caveat as before: for anything beyond format checking, reach for a real parser.',
            ].join('\n'),
          }),
        ],
        tokenTotal: zeroTotals,
      },
    ],
    tokenTotal: zeroTotals,
  }
}

/* ------------------------------------------------------------------ */

export function buildFixtureBundle(images: FixtureImages): CouncilBundleV1 {
  eventSeq = 0
  // Sidebar order comes from each council's authored `createdAt` (the
  // import preserves it): trial is the newest (T0 − 4 min)
  // on purpose — it's the richest frontpage (answers → votes → verdict) and
  // what `/` lands a returning user on. Array order no longer matters for
  // recency; keep the authored stamps mirroring the intended sidebar.
  return {
    version: 1,
    exportedAt: T0,
    councils: [
      soloCouncil(),
      consensusCapHitCouncil(),
      parallelCouncil(images),
      consensusConvergedCouncil(),
      trialCouncil(),
    ],
  }
}
