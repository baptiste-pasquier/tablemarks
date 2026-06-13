export type SyncStatus = 'synced' | 'pending' | 'offline' | 'problem'

/** The reason a push keeps failing, named so the indicator can tell the user what to do. */
export type ProblemCause = 'auth' | 'server'

export interface SyncState {
  status: SyncStatus
  /** Records not yet pushed (reported in every state, including offline). */
  pending: number
  /** Set only in the `problem` state. */
  cause: ProblemCause | null
}

/**
 * Map raw signals to the single indicator state. Offline takes precedence over a problem cause —
 * being offline is not a failure, so a connection loss de-escalates from `problem` to `offline`.
 */
export function deriveSyncState(opts: { online: boolean; pending: number; problem: ProblemCause | null }): SyncState {
  const { online, pending, problem } = opts
  if (!online) return { status: 'offline', pending, cause: null }
  if (problem) return { status: 'problem', pending, cause: problem }
  if (pending > 0) return { status: 'pending', pending, cause: null }
  return { status: 'synced', pending, cause: null }
}

/** Consecutive non-offline push failures before the indicator escalates to a problem state. */
export const FAILURE_THRESHOLD = 3

export interface FailureState {
  failureCount: number
  problem: ProblemCause | null
}

/** Reset failure tracking — used on a successful sync and on going offline (offline is not a failure). */
export const NO_FAILURE: FailureState = { failureCount: 0, problem: null }

/** Classify a thrown push error: expired/denied auth vs an unreachable/erroring server. */
export function classifyPushError(err: unknown): ProblemCause {
  const status = (err as { status?: number } | null)?.status
  return status === 401 || status === 403 ? 'auth' : 'server'
}

/** Fold one push failure into the failure state, escalating to a named problem at the threshold. */
export function applyPushFailure(prev: FailureState, err: unknown, threshold = FAILURE_THRESHOLD): FailureState {
  const failureCount = prev.failureCount + 1
  const cause = classifyPushError(err)
  return { failureCount, problem: failureCount >= threshold ? cause : null }
}
