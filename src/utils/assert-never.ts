/**
 * Compile-time exhaustiveness backstop. A `switch` over a union puts this
 * in `default`: when the union grows, the narrowed value no longer fits
 * `never` and the call site fails typecheck — so "add a social structure,
 * silently no-op in the orchestrator" becomes impossible.
 *
 * Deliberately a runtime no-op, not a throw: persisted rows can carry
 * off-union values despite what the types claim (IndexedDB reads aren't
 * re-validated — see DEVELOPMENT.md → Read-boundary normalization), and the
 * invariant there is degrade, never crash.
 */
export function assertNever(_value: never): void {}
