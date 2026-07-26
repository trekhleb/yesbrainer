/**
 * The integration suite's provider double.
 *
 * Intercepts `POST https://api.anthropic.com/v1/messages` with
 * `page.route` and answers in Anthropic's own wire format, so the real
 * `@ai-sdk/anthropic` adapter, the real `fetch`, and the real CSP all stay
 * in the loop. That layer is the whole point: mocking higher up (e.g. AI
 * SDK's `MockLanguageModel`) would need a seam in production code and
 * would skip exactly the plumbing this suite exists to cover — the unit
 * suite already tests the orchestrator with module-level mocks.
 *
 * ## Dispatch
 *
 * All five call types hit the same URL, so the handler classifies each
 * request from its body:
 *
 * | `stream` | discriminator                        | kind          |
 * |----------|--------------------------------------|---------------|
 * | `true`   | system starts with the Judge prompt   | `judge`       |
 * | `true`   | system starts with the reanswer prompt| `reanswer`    |
 * | `true`   | otherwise                            | `participant` |
 * | absent   | schema has `votes`                   | `vote`        |
 * | absent   | schema has `convergent`              | `mediator`    |
 * | absent   | schema has `title`                   | `title`       |
 *
 * Seats are told apart by `body.model`: fan-out is concurrent, so call
 * *order* is not deterministic, but each seat carries a distinct model id.
 * Script per-seat replies by model, never by arrival index.
 *
 * ## Structured output has two shapes
 *
 * `generateObject` reaches the wire differently depending on the model.
 * `getModelCapabilities()` inside the adapter decides: recognised modern
 * Claude ids (`claude-sonnet-5`, `claude-fable-5`, `claude-haiku-4-5`, …)
 * negotiate native structured output, so the object comes back as ordinary
 * **text**; anything the adapter doesn't recognise — `claude-opus-5` at
 * `@ai-sdk/anthropic@3.0.93`, for instance — falls back to a forced
 * **`json` tool call**. We reply in whichever shape the request asked for,
 * so a model swap or an SDK bump can't silently produce a mis-shaped
 * answer that reads as a model failure.
 *
 * ## Known limitation
 *
 * `route.fulfill` sends a complete body, so the SSE arrives buffered
 * rather than progressively. The stream is really parsed and really
 * accumulated — but these tests can't observe partial paint mid-stream.
 * Serving from a local streaming server is the upgrade path if that
 * becomes worth testing.
 */

import type { Page } from '@playwright/test'

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

/* Opening words of the streamed roles' system prompts
   (src/storage/prompts.ts). A Participant's prompt is the registry
   entry's default, so it's the fallback rather than a marker. */
const JUDGE_PROMPT_MARKER = 'You are the Judge of a council deliberation.'
const REANSWER_PROMPT_MARKER = 'You are in a multi-round council debate.'

export type CallKind =
  | 'participant'
  | 'reanswer'
  | 'judge'
  | 'vote'
  | 'mediator'
  | 'title'

/** What one intercepted call looked like. Recorded for assertions. */
export interface RecordedCall {
  kind: CallKind
  /** `body.model` — the provider model id, i.e. which seat is calling. */
  model: string
  system: string
  /** All user-message text, joined. */
  prompt: string
  /** Anonymized labels this call was shown (`['A','C']`), parsed out of
   *  the `Model X:` blocks the voting / mediator prompts embed. */
  labels: string[]
  headers: Record<string, string>
}

/** Reply with an HTTP error instead of a completion. Return this from any
 *  handler — e.g. to exercise the redaction path with a body that echoes
 *  the caller's key. */
export interface MockHttpError {
  readonly kind: 'http-error'
  readonly status: number
  readonly json: unknown
}

export function httpError(status: number, json: unknown): MockHttpError {
  return { kind: 'http-error', status, json }
}

function isHttpError(value: unknown): value is MockHttpError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'http-error'
  )
}

/** Streamed roles answer with text; structured roles answer with an
 *  object. Either may bail out with an `httpError(...)`. */
type TextHandler = (call: RecordedCall) => string | MockHttpError
type ObjectHandler = (call: RecordedCall) => unknown

export interface MockScript {
  participant?: TextHandler
  reanswer?: TextHandler
  judge?: TextHandler
  vote?: ObjectHandler
  mediator?: ObjectHandler
  title?: ObjectHandler
}

export interface AnthropicMock {
  /** Every intercepted call, in arrival order. */
  calls: RecordedCall[]
  /** Calls of one kind, in arrival order. */
  of: (kind: CallKind) => RecordedCall[]
}

interface RequestBody {
  model?: unknown
  system?: unknown
  messages?: unknown
  stream?: unknown
  tools?: unknown
  output_config?: unknown
}

/** Anthropic accepts both a bare string and an array of content blocks for
 *  `system` and for a message's `content`; the adapter picks per call, so
 *  read both shapes. */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  const parts: string[] = []
  for (const block of value) {
    if (typeof block === 'object' && block !== null) {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join('\n')
}

function promptOf(messages: unknown): string {
  if (!Array.isArray(messages)) return ''
  const parts: string[] = []
  for (const message of messages) {
    if (typeof message === 'object' && message !== null) {
      parts.push(textOf((message as { content?: unknown }).content))
    }
  }
  return parts.join('\n')
}

/** `Model A:` block headers, as emitted by `formatLabeledAnswers`. Lets a
 *  vote handler answer for whatever labels it was actually shown, which
 *  keeps handlers independent of the per-turn label shuffle. */
function labelsOf(prompt: string): string[] {
  const found = new Set<string>()
  for (const match of prompt.matchAll(/^Model ([A-Z]+):/gm)) {
    const label = match[1]
    if (label) found.add(label)
  }
  return [...found]
}

/**
 * Split a voting / Mediator prompt back into `label → answer` pairs, as
 * `formatLabeledAnswers` composed it.
 *
 * This is what lets a vote handler score by *content* — "whichever label
 * sits above the answer containing X gets 5s" — instead of by label. Since
 * the per-turn label shuffle is what assigns letters, content-based scoring
 * makes the expected winner deterministic AND proves the label→seat
 * mapping round-trips: score the right answer and the wrong seat wins if
 * anonymization is broken.
 */
export function parseLabeledAnswers(prompt: string): Record<string, string> {
  const answers: Record<string, string> = {}
  const headers = [...prompt.matchAll(/^Model ([A-Z]+):\n/gm)]
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]
    const label = header?.[1]
    if (!header || label === undefined || header.index === undefined) continue
    const start = header.index + header[0].length
    const end = headers[i + 1]?.index ?? prompt.length
    answers[label] = prompt.slice(start, end).replace(/\n---\n\s*$/, '').trim()
  }
  return answers
}

/** The JSON Schema `generateObject` sent, from whichever of the two
 *  structured-output shapes this request used. */
function schemaPropertiesOf(body: RequestBody): string[] {
  const nativeFormat = (body.output_config as { format?: unknown } | undefined)
    ?.format
  const nativeSchema = (nativeFormat as { schema?: unknown } | undefined)
    ?.schema
  const fromTool = Array.isArray(body.tools)
    ? body.tools.find(
        (tool) =>
          typeof tool === 'object' &&
          tool !== null &&
          (tool as { name?: unknown }).name === 'json',
      )
    : undefined
  const toolSchema = (fromTool as { input_schema?: unknown } | undefined)
    ?.input_schema
  const schema = nativeSchema ?? toolSchema
  const properties = (schema as { properties?: unknown } | undefined)
    ?.properties
  if (typeof properties !== 'object' || properties === null) return []
  return Object.keys(properties)
}

/** True when the request negotiated a forced `json` tool call rather than
 *  native structured output — the reply shape differs. */
function usesToolPath(body: RequestBody): boolean {
  const nativeFormat = (body.output_config as { format?: unknown } | undefined)
    ?.format
  return nativeFormat === undefined
}

function classify(body: RequestBody, system: string): CallKind {
  if (body.stream === true) {
    if (system.startsWith(JUDGE_PROMPT_MARKER)) return 'judge'
    if (system.startsWith(REANSWER_PROMPT_MARKER)) return 'reanswer'
    return 'participant'
  }
  const properties = schemaPropertiesOf(body)
  if (properties.includes('votes')) return 'vote'
  if (properties.includes('convergent')) return 'mediator'
  if (properties.includes('title')) return 'title'
  throw new Error(
    `[mock-anthropic] unclassifiable non-streaming call; schema properties: ${JSON.stringify(properties)}`,
  )
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/** A complete Anthropic SSE stream carrying one text block. */
function streamBody(model: string, text: string): string {
  return [
    sse('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_mock',
        model,
        role: 'assistant',
        usage: { input_tokens: 11 },
      },
    }),
    sse('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }),
    // Chunked so the adapter's delta path is exercised rather than a
    // single all-at-once block.
    ...chunk(text).map((piece) =>
      sse('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: piece },
      }),
    ),
    sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
    sse('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 22 },
    }),
    sse('message_stop', { type: 'message_stop' }),
  ].join('')
}

function chunk(text: string): string[] {
  const size = 24
  const pieces: string[] = []
  for (let i = 0; i < text.length; i += size) {
    pieces.push(text.slice(i, i + size))
  }
  return pieces.length > 0 ? pieces : ['']
}

/** A non-streaming message carrying a structured-output object, in
 *  whichever shape the request negotiated. */
function objectBody(model: string, object: unknown, toolPath: boolean): string {
  const content = toolPath
    ? [{ type: 'tool_use', id: 'toolu_mock', name: 'json', input: object }]
    : [{ type: 'text', text: JSON.stringify(object) }]
  return JSON.stringify({
    type: 'message',
    id: 'msg_mock',
    model,
    role: 'assistant',
    content,
    stop_reason: toolPath ? 'tool_use' : 'end_turn',
    usage: { input_tokens: 11, output_tokens: 22 },
  })
}

function missingHandler(kind: CallKind, model: string): never {
  throw new Error(
    `[mock-anthropic] a ${kind} call (model ${model}) had no handler in the ` +
      `script. Every role the flow reaches must be scripted, or the test is ` +
      `asserting against an unintended failure.`,
  )
}

/**
 * Install the double. Returns a handle whose `calls` array fills as the
 * run proceeds — assert against it after the flow settles.
 *
 * Any provider call the script doesn't cover fails the route loudly rather
 * than falling through to the network: an unmocked call would otherwise
 * surface as a plausible-looking model error and quietly pass a test.
 */
export async function installAnthropicMock(
  page: Page,
  script: MockScript,
): Promise<AnthropicMock> {
  const calls: RecordedCall[] = []

  await page.route(MESSAGES_URL, async (route) => {
    const request = route.request()
    const body = (request.postDataJSON() ?? {}) as RequestBody
    const system = textOf(body.system)
    const prompt = promptOf(body.messages)
    const model = typeof body.model === 'string' ? body.model : ''
    const kind = classify(body, system)
    const call: RecordedCall = {
      kind,
      model,
      system,
      prompt,
      labels: labelsOf(prompt),
      headers: request.headers(),
    }
    calls.push(call)

    const streamed =
      kind === 'participant' || kind === 'reanswer' || kind === 'judge'
    const handler = script[kind]
    if (!handler) missingHandler(kind, model)
    const reply = handler(call)

    if (isHttpError(reply)) {
      await route.fulfill({
        status: reply.status,
        contentType: 'application/json',
        body: JSON.stringify(reply.json),
      })
      return
    }

    if (streamed) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: streamBody(model, String(reply)),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: objectBody(model, reply, usesToolPath(body)),
    })
  })

  return {
    calls,
    of: (kind) => calls.filter((call) => call.kind === kind),
  }
}
