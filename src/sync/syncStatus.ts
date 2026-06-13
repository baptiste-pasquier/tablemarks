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
