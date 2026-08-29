/**
 * Pure retry-timing and failure-classification primitives for the sync trust layer.
 * No side effects — `SyncController` (later units) owns scheduling `setTimeout` calls
 * and tracking `consecutiveFailures`; this module only computes the numbers.
 */

/** Base delay before the first retry after a failure. */
const BASE_DELAY_MS = 5_000
/**
 * Escalation ceiling. Chosen so the delay schedule (5s, 10s, 20s, ...) reaches the cap
 * exactly on the 3rd consecutive failure — matching KTD2's escalate-to-"problem"-on-3rd-failure
 * threshold, so retries continue quietly at a steady 20s cadence once the status has already
 * escalated, rather than backing off further. Three failures at this cadence land inside
 * roughly the first 20-40s of real trouble (fast enough to surface a genuine outage without
 * flapping on a single transient blip), while the 20s floor between retries avoids hammering
 * a struggling server.
 */
const CAP_MS = 20_000

/**
 * Capped exponential backoff: doubles per attempt (1-indexed) starting at `BASE_DELAY_MS`,
 * capped at `CAP_MS`. `attempt` is the count of consecutive failures so far (1 = first failure).
 */
export function nextRetryDelayMs(attempt: number): number {
  const safeAttempt = Math.max(1, Math.floor(attempt))
  const delay = BASE_DELAY_MS * 2 ** (safeAttempt - 1)
  return Math.min(delay, CAP_MS)
}

export type FailureCause = 'server-unreachable' | 'sign-in-needed'

/**
 * Classifies a non-offline `fullSync` failure into one of two causes, per KTD3.
 * Reads the PocketBase `ClientResponseError.status` shape (see `PocketBaseRemote.upsert`'s
 * 404-branch in `syncEngine.ts` for the precedent of reading this field off a caught error):
 * 401/403 (auth) → sign-in-needed; anything else (network error, 5xx, no status) →
 * server-unreachable. Offline is never passed here — that's the caller's job via `onlineStatus.ts`.
 */
export function classifyFailure(err: unknown): FailureCause {
  const status = (err as { status?: number } | null)?.status
  if (status === 401 || status === 403) return 'sign-in-needed'
  return 'server-unreachable'
}
