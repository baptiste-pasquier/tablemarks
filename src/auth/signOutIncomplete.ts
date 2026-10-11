/**
 * A user sign-out that did not complete. `sessionCleared` tells the two outcomes apart: when
 * true, the session is closed and only the erase is left (`eraseLocalData()` retries it); when
 * false, it failed before closing the session, so the user is still signed in and nothing changed.
 */
export class SignOutIncomplete extends Error {
  readonly sessionCleared: boolean

  constructor(sessionCleared: boolean, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    super(`Sign-out did not complete: ${reason}`, { cause })
    this.name = 'SignOutIncomplete'
    this.sessionCleared = sessionCleared
  }
}
