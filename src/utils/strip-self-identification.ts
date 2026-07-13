/**
 * Strip model self-identification from a Participant's free-text output so it
 * can enter the peer-voting pool without trivially leaking which brand wrote
 * it.
 *
 * Why this exists: Trial-mode voting anonymises seats behind single-letter
 * labels (Model A / Model B / …) so voters rate on merit rather than brand.
 * But if Claude opens with "As Claude, I…" or GPT signs off with "— GPT-4",
 * the labels are useless — the voter learns the brand from the first
 * sentence. This util pre-processes outputs in `formatLabeledAnswers` to
 * close that leak.
 *
 * Conservative patterns: we only remove unambiguous openings ("As Claude, …",
 * "I'm GPT, …") and unambiguous trailing sign-offs ("— Claude", "— GPT-4").
 * False positives are worse than false negatives here: a model's substantive
 * answer that happens to mention "Claude" mid-sentence stays put. The trade
 * is honest — voters that want to chase brand cues can still find them; we
 * just deny them the easy first/last-line signal.
 *
 * Safety: if stripping leaves nothing but whitespace (the entire answer was
 * a self-identification refusal), return the original text unchanged — the
 * voter is better served by an obviously-leaky answer than by an empty one.
 */

// Common model-brand alternation, reused by opening and sign-off patterns.
// Includes model families (claude, gpt, gemini, llama, mistral) and generic
// AI-assistant phrases. Case-insensitive matching is applied at the regex
// flag level (`i`).
const BRAND_OR_GENERIC =
  '(claude|gpt|chatgpt|gemini|llama|mistral|grok|deepseek|qwen|copilot|' +
  'an? ai( assistant)?|an? llm|an? language model|an? large language model|' +
  'the assistant)'

// Opening forms we strip:
//   "As Claude, I can help with that."
//   "I'm Claude, made by Anthropic, and I can…"
//   "I am the assistant. Here's…"
//   "Hi! I'm GPT-4 and I'll…"
//
// The leading character class allows for stray markdown decoration (block
// quotes, leading bullets, asterisks) so a model that prefixes its answer
// with formatting still gets cleaned. The trailing `.*?[.!?]` is non-greedy
// so we only consume up to the *first* sentence terminator — never bleed
// into the substantive answer.
const OPENING_AS_RE = new RegExp(
  `^[\\s>*_-]*as ${BRAND_OR_GENERIC}[,\\s].*?[.!?]\\s*`,
  'i',
)
const OPENING_IM_RE = new RegExp(
  `^[\\s>*_-]*i('?m| am) ${BRAND_OR_GENERIC}[,\\s].*?[.!?]\\s*`,
  'i',
)
const OPENING_GREETING_RE = new RegExp(
  `^[\\s>*_-]*(hi|hello|hey)!?\\s+i('?m| am) ${BRAND_OR_GENERIC}[,\\s].*?[.!?]\\s*`,
  'i',
)

// Sign-off forms we strip:
//   "\n— Claude"
//   "\n-- GPT-4"
//   "\n\nBest,\nClaude"
// The optional version tail (digit-led: "-4", " 4.5", " 3.1") keeps
// "— GPT-4" covered without eating arbitrary trailing words.
const BRAND_VERSION_TAIL = `(?:[-\\s]\\d[\\w.]*)*`
const SIGNOFF_DASH_RE = new RegExp(
  `\\n[\\s>*_-]*[—–\\-]{1,2}\\s*${BRAND_OR_GENERIC}${BRAND_VERSION_TAIL}\\s*[.!?]?\\s*$`,
  'i',
)
const SIGNOFF_VALEDICTION_RE = new RegExp(
  `\\n[\\s>*_-]*(best|cheers|sincerely|regards|thanks)[,!.]?\\s*\\n+\\s*${BRAND_OR_GENERIC}${BRAND_VERSION_TAIL}\\s*[.!?]?\\s*$`,
  'i',
)

export function stripSelfIdentification(text: string): string {
  const stripped = text
    .replace(OPENING_GREETING_RE, '')
    .replace(OPENING_AS_RE, '')
    .replace(OPENING_IM_RE, '')
    .replace(SIGNOFF_VALEDICTION_RE, '')
    .replace(SIGNOFF_DASH_RE, '')
    .trim()
  return stripped.length > 0 ? stripped : text
}
